//! Server-side product analytics for MCP traffic.
//!
//! Events use PostHog's MCP analytics schema (`$mcp_initialize`,
//! `$mcp_tool_call`, `$mcp_*` properties), so PostHog's MCP dashboards and its
//! client ("harness") bucketing read them without custom insights. Tool
//! arguments and results are never recorded: only the tool name, outcome, and
//! timing.

#[cfg(test)]
mod test;

use std::{sync::Arc, time::Duration};

use analytics_client::{AnalyticsClient, ProductEventProperties};
use entity_access::{domain::ports::AccessRepository, outbound::PgAccessRepository};
use macro_env::Environment;
use macro_user_id::user_id::MacroUserIdStr;
use mcp_auth_proxy::inbound::middleware::McpAuthMethod;
use serde::Serialize;

/// Name the server advertises in `initialize`, recorded on every event.
pub const SERVER_NAME: &str = "macro-tools";

/// Longest header value recorded. User agents are the longest signal clients
/// send; anything past this is noise.
const MAX_HEADER_LEN: usize = 256;

/// What an MCP HTTP request says about the client that sent it.
///
/// The server runs stateless, so a tool call carries no `clientInfo`; these
/// headers are what identify the client on every call.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
pub struct McpClientSignals {
    #[serde(
        rename = "$mcp_client_user_agent",
        skip_serializing_if = "Option::is_none"
    )]
    user_agent: Option<String>,
    /// Anthropic's surfaces (Claude.ai, Claude Code, Cowork) name themselves
    /// here; PostHog's harness bucketing reads it first.
    #[serde(rename = "$mcp_vendor_client", skip_serializing_if = "Option::is_none")]
    vendor_client: Option<String>,
    #[serde(
        rename = "$mcp_protocol_version",
        skip_serializing_if = "Option::is_none"
    )]
    protocol_version: Option<String>,
    #[serde(rename = "$mcp_auth_method", skip_serializing_if = "Option::is_none")]
    auth_method: Option<&'static str>,
}

impl McpClientSignals {
    /// Reads the client signals from the HTTP request behind an MCP message.
    pub fn from_request_parts(parts: Option<&http::request::Parts>) -> Self {
        let Some(parts) = parts else {
            return Self::default();
        };
        let header = |name: &str| {
            parts
                .headers
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.chars().take(MAX_HEADER_LEN).collect())
        };
        Self {
            user_agent: header("user-agent"),
            vendor_client: header("x-anthropic-client"),
            protocol_version: header("mcp-protocol-version"),
            auth_method: parts
                .extensions
                .get::<McpAuthMethod>()
                .map(|method| method.as_str()),
        }
    }
}

/// How a tool call ended.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ToolCallOutcome {
    /// The tool ran and returned a result.
    Success,
    /// The arguments were missing or did not match the tool's schema.
    InvalidArguments,
    /// No tool has the requested name.
    UnknownTool,
    /// The tool ran and reported an error to the model.
    ToolError,
}

impl ToolCallOutcome {
    fn error_type(self) -> Option<&'static str> {
        match self {
            Self::Success => None,
            Self::InvalidArguments => Some("validation"),
            Self::UnknownTool => Some("unknown_tool"),
            Self::ToolError => Some("tool_error"),
        }
    }
}

/// One MCP request worth recording.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum McpAnalyticsEvent {
    /// A client opened an MCP session.
    Initialize {
        /// `clientInfo.name`, e.g. `claude-ai`, `openai-mcp`, `cursor-vscode`.
        client_name: String,
        /// `clientInfo.version`.
        client_version: String,
        /// The protocol version the client asked for.
        protocol_version: String,
    },
    /// A client called a tool.
    ToolCall {
        /// The registered tool name, e.g. `ContentSearch`.
        tool_name: String,
        /// How the call ended.
        outcome: ToolCallOutcome,
        /// Wall-clock time spent handling the call.
        duration: Duration,
    },
}

impl McpAnalyticsEvent {
    fn name(&self) -> &'static str {
        match self {
            Self::Initialize { .. } => "$mcp_initialize",
            Self::ToolCall { .. } => "$mcp_tool_call",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum EventSpecificProperties<'a> {
    Initialize {
        #[serde(rename = "$mcp_client_name")]
        client_name: &'a str,
        #[serde(rename = "$mcp_client_version")]
        client_version: &'a str,
        #[serde(rename = "$mcp_protocol_version")]
        protocol_version: &'a str,
    },
    ToolCall {
        #[serde(rename = "$mcp_tool_name")]
        tool_name: &'a str,
        #[serde(rename = "$mcp_is_error")]
        is_error: bool,
        #[serde(rename = "$mcp_error_type", skip_serializing_if = "Option::is_none")]
        error_type: Option<&'static str>,
        #[serde(rename = "$mcp_duration_ms")]
        duration_ms: u64,
    },
}

#[derive(Debug, Serialize)]
struct EventProperties<'a> {
    // Flattened first so the request header's protocol version cannot
    // override the one `initialize` negotiated: serde keeps the last key.
    #[serde(flatten)]
    client: &'a McpClientSignals,
    #[serde(flatten)]
    event: EventSpecificProperties<'a>,
    #[serde(rename = "$mcp_server_name")]
    server_name: &'static str,
    #[serde(rename = "$mcp_server_version")]
    server_version: &'static str,
}

impl<'a> EventProperties<'a> {
    fn new(event: &'a McpAnalyticsEvent, client: &'a McpClientSignals) -> Self {
        let event = match event {
            McpAnalyticsEvent::Initialize {
                client_name,
                client_version,
                protocol_version,
            } => EventSpecificProperties::Initialize {
                client_name,
                client_version,
                protocol_version,
            },
            McpAnalyticsEvent::ToolCall {
                tool_name,
                outcome,
                duration,
            } => EventSpecificProperties::ToolCall {
                tool_name,
                is_error: *outcome != ToolCallOutcome::Success,
                error_type: outcome.error_type(),
                duration_ms: u64::try_from(duration.as_millis()).unwrap_or(u64::MAX),
            },
        };
        Self {
            client,
            event,
            server_name: SERVER_NAME,
            server_version: env!("CARGO_PKG_VERSION"),
        }
    }
}

/// Records MCP product analytics to PostHog, or nothing when PostHog is not
/// configured.
#[derive(Clone)]
pub struct McpAnalytics {
    sink: Option<Arc<PostHogSink>>,
}

struct PostHogSink {
    client: AnalyticsClient,
    teams: PgAccessRepository,
    environment: Environment,
}

impl McpAnalytics {
    /// Analytics that records nothing.
    pub fn disabled() -> Self {
        Self { sink: None }
    }

    /// Analytics that records to PostHog, attributing each event to the
    /// user's team when they belong to one.
    pub fn posthog(
        client: AnalyticsClient,
        teams: PgAccessRepository,
        environment: Environment,
    ) -> Self {
        Self {
            sink: Some(Arc::new(PostHogSink {
                client,
                teams,
                environment,
            })),
        }
    }

    /// Records `event` for `user_id` in the background, so analytics never
    /// delays or fails an MCP response.
    pub fn record(
        &self,
        user_id: MacroUserIdStr<'static>,
        client: McpClientSignals,
        event: McpAnalyticsEvent,
    ) {
        let Some(sink) = self.sink.clone() else {
            return;
        };
        tokio::spawn(async move { sink.capture(user_id, client, event).await });
    }
}

impl PostHogSink {
    async fn capture(
        &self,
        user_id: MacroUserIdStr<'static>,
        client: McpClientSignals,
        event: McpAnalyticsEvent,
    ) {
        let team_id = self
            .teams
            .get_user_team(&user_id.0)
            .await
            .inspect_err(|error| {
                tracing::warn!(error=?error, "failed to resolve team for MCP analytics");
            })
            .ok()
            .flatten()
            .map(|team| team.team_id);
        let properties = ProductEventProperties::new(
            EventProperties::new(&event, &client),
            self.environment,
            team_id,
        );
        let _ = self
            .client
            .track_posthog(user_id.as_ref(), event.name(), &properties)
            .await
            .inspect_err(|error| {
                tracing::warn!(error=?error, event = event.name(), "failed to track MCP analytics event");
            });
    }
}
