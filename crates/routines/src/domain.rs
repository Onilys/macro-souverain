//! Commands use the scheduler's cron engine and its activity-event triggers.
use anyhow::{Result, bail, ensure};
use async_trait::async_trait;
use chrono::{DateTime, Datelike, Timelike, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[cfg(test)]
mod test;

/// Who executes the routine. Agent IDs refer to personas, never conversation IDs.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RoutineTarget {
    /// A model running as Macro.
    Model {
        /// Runtime model ID.
        model: String,
    },
    /// An agent with its configured runtime, tools and default model.
    Agent {
        /// Persona/bot UUID (`bot.botId`) from ListAgents. Use your own persona ID to schedule yourself.
        #[serde(rename = "agentId")]
        agent_id: Uuid,
    },
}
/// A recurring or one-off schedule.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RoutineSchedule {
    /// Execute once at a future timestamp, even if the creating session has ended.
    Once {
        /// RFC3339 timestamp including UTC offset.
        at: DateTime<Utc>,
    },
    /// Repeat using a six-field cron expression and an IANA time zone.
    Cron {
        /// Seconds, minutes, hours, day-of-month, month, weekday (optional year).
        expression: String,
        /// IANA time zone, e.g. America/New_York.
        timezone: String,
    },
}
impl RoutineSchedule {
    /// Validate and translate to the existing scheduler contract.
    pub fn cron(&self, now: DateTime<Utc>) -> Result<(String, String)> {
        let (schedule, timezone) = match self {
            Self::Once { at } => {
                ensure!(*at > now, "Choose a one-off time in the future.");
                (
                    format!(
                        "{} {} {} {} {} * {}",
                        at.second(),
                        at.minute(),
                        at.hour(),
                        at.day(),
                        at.month(),
                        at.year()
                    ),
                    "UTC".to_owned(),
                )
            }
            Self::Cron {
                expression,
                timezone,
            } => {
                let cron = expression.parse::<cron::Schedule>().map_err(|_| {
                    anyhow::anyhow!(
                        "Use a six-field cron: seconds minutes hours day-of-month month weekday."
                    )
                })?;
                let zone = timezone.parse::<chrono_tz::Tz>().map_err(|_| {
                    anyhow::anyhow!("Use an IANA timezone such as America/New_York.")
                })?;
                ensure!(
                    cron.after(&now.with_timezone(&zone)).next().is_some(),
                    "This schedule has no future runs."
                );
                (expression.clone(), timezone.clone())
            }
        };
        Ok((schedule, timezone))
    }
}

const MAX_EVENT_FILTERS: usize = 32;
const MAX_EVENTS_PER_FILTER: usize = 13;
const MAX_IDS_PER_FILTER: usize = 100;
const MAX_CONDITION_CHARS: usize = 500;

/// Activity the scheduler can subscribe to. Names match the routine allowlist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, JsonSchema)]
pub enum RoutineEventName {
    /// A document the owner can access is created.
    #[serde(rename = "document.created")]
    DocumentCreated,
    /// Details of a selected document change.
    #[serde(rename = "document.updated")]
    DocumentUpdated,
    /// A selected document is deleted.
    #[serde(rename = "document.deleted")]
    DocumentDeleted,
    /// A task the owner can access is created.
    #[serde(rename = "task.created")]
    TaskCreated,
    /// The status of a selected task changes.
    #[serde(rename = "task.status_changed")]
    TaskStatusChanged,
    /// The priority of a selected task changes.
    #[serde(rename = "task.priority_changed")]
    TaskPriorityChanged,
    /// Any property of a selected task changes, including status and priority.
    #[serde(rename = "task.property_changed")]
    TaskPropertyChanged,
    /// New mail arrives in the owner's inbox. Excludes spam, trash, drafts, and historical imports.
    #[serde(rename = "email.message_received")]
    EmailMessageReceived,
    /// A channel the owner can access is created.
    #[serde(rename = "channel.created")]
    ChannelCreated,
    /// Someone sends a message in a selected channel.
    #[serde(rename = "channel.message_posted")]
    ChannelMessagePosted,
    /// The owner is @ mentioned in a selected channel.
    #[serde(rename = "channel.mentioned")]
    ChannelMentioned,
    /// A message in a selected channel is edited.
    #[serde(rename = "channel.message_patched")]
    ChannelMessagePatched,
    /// An attachment is added to a message in a selected channel.
    #[serde(rename = "channel.message_attachment_created")]
    ChannelMessageAttachmentCreated,
}
impl RoutineEventName {
    /// Scheduler event name.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::DocumentCreated => "document.created",
            Self::DocumentUpdated => "document.updated",
            Self::DocumentDeleted => "document.deleted",
            Self::TaskCreated => "task.created",
            Self::TaskStatusChanged => "task.status_changed",
            Self::TaskPriorityChanged => "task.priority_changed",
            Self::TaskPropertyChanged => "task.property_changed",
            Self::EmailMessageReceived => "email.message_received",
            Self::ChannelCreated => "channel.created",
            Self::ChannelMessagePosted => "channel.message_posted",
            Self::ChannelMentioned => "channel.mentioned",
            Self::ChannelMessagePatched => "channel.message_patched",
            Self::ChannelMessageAttachmentCreated => "channel.message_attachment_created",
        }
    }

    /// Creation and inbox events match every accessible item when no ids are set.
    const fn matches_all_when_unscoped(self) -> bool {
        matches!(
            self,
            Self::DocumentCreated
                | Self::TaskCreated
                | Self::ChannelCreated
                | Self::EmailMessageReceived
        )
    }
}

/// One activity selector. The routine runs when any filter matches.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RoutineEventFilter {
    /// Activity names that match this filter.
    pub events: Vec<RoutineEventName>,
    /// Channel, document, or task UUIDs. Required unless every event is
    /// `document.created`, `task.created`, `channel.created`, or
    /// `email.message_received`, which match every accessible item when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<Uuid>>,
    /// Yes/no question about the triggering content, such as "Is this a bug report?".
    /// The routine runs only when the answer is yes. Omit to run on every match.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,
}
impl RoutineEventFilter {
    fn to_trigger_json(&self) -> Result<serde_json::Value> {
        ensure!(
            !self.events.is_empty() && self.events.len() <= MAX_EVENTS_PER_FILTER,
            "Choose between 1 and {MAX_EVENTS_PER_FILTER} activity events per filter."
        );
        let mut events = Vec::new();
        for event in &self.events {
            if !events.contains(event) {
                events.push(*event);
            }
        }
        let ids = match &self.ids {
            None => None,
            Some(ids) => {
                ensure!(
                    !ids.is_empty() && ids.len() <= MAX_IDS_PER_FILTER,
                    "Choose between 1 and {MAX_IDS_PER_FILTER} items for an activity event."
                );
                let mut unique = Vec::new();
                for id in ids {
                    if !unique.contains(id) {
                        unique.push(*id);
                    }
                }
                Some(unique)
            }
        };
        if events
            .iter()
            .any(|event| !event.matches_all_when_unscoped())
        {
            ensure!(
                ids.is_some(),
                "Choose the channel, document, or task this activity event applies to."
            );
        }
        let condition = match &self.condition {
            None => None,
            Some(condition) => {
                let trimmed = condition.trim();
                ensure!(
                    !trimmed.is_empty(),
                    "Omit the condition, or ask a yes/no question."
                );
                ensure!(
                    trimmed.chars().count() <= MAX_CONDITION_CHARS,
                    "Keep the condition under {MAX_CONDITION_CHARS} characters."
                );
                Some(trimmed.to_owned())
            }
        };
        let mut value = serde_json::json!({
            "events": events.iter().map(|event| event.as_str()).collect::<Vec<_>>()
        });
        if let Some(ids) = ids {
            value["ids"] = serde_json::json!(ids);
        }
        if let Some(condition) = condition {
            value["condition"] = condition.into();
        }
        Ok(value)
    }
}

/// Complete user-editable configuration, independent of execution bookkeeping.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RoutineConfiguration {
    /// Short descriptive name.
    pub name: String,
    /// Instructions passed to the model or agent on every run.
    pub instructions: String,
    /// Explicit model or agent selection.
    pub target: RoutineTarget,
    /// Recurring or one-off schedule. Omit when the routine runs only on activity events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule: Option<RoutineSchedule>,
    /// Activity that starts a run immediately. Omit for a schedule-only routine.
    /// Each filter matches on its own. A message in a channel uses
    /// `channel.message_posted` with that channel's UUID in `ids`. `ids` are
    /// required except for `document.created`, `task.created`, `channel.created`,
    /// and `email.message_received`. `condition` is an optional yes/no question;
    /// the run starts only when the triggering content answers yes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub events: Option<Vec<RoutineEventFilter>>,
}
impl RoutineConfiguration {
    /// Validate the user's intent independently of its transport representation.
    pub fn validate(&self, now: DateTime<Utc>) -> Result<()> {
        self.trigger(now).map(|_| ())
    }

    /// Scheduler trigger body: a cron, an activity subscription, or both.
    pub fn trigger(&self, now: DateTime<Utc>) -> Result<serde_json::Value> {
        ensure!(!self.name.trim().is_empty(), "A routine name is required.");
        ensure!(
            !self.instructions.trim().is_empty(),
            "Routine instructions are required."
        );
        if let RoutineTarget::Model { model } = &self.target {
            ensure!(!model.trim().is_empty(), "Choose a nonblank model ID.");
        }
        let schedule = self
            .schedule
            .as_ref()
            .map(|schedule| schedule.cron(now))
            .transpose()?;
        let filters = self.event_filters()?;
        match (schedule, filters) {
            (None, None) => bail!("Add a schedule or an activity event."),
            (Some((schedule, timezone)), None) => Ok(serde_json::json!({
                "type": "cron",
                "schedule": schedule,
                "timezone": timezone
            })),
            (None, Some(filters)) => Ok(serde_json::json!({
                "type": "events",
                "filters": filters
            })),
            (Some((schedule, timezone)), Some(filters)) => Ok(serde_json::json!({
                "type": "multiple",
                "triggers": [
                    {"type": "cron", "schedule": schedule, "timezone": timezone},
                    {"type": "events", "filters": filters}
                ]
            })),
        }
    }

    fn event_filters(&self) -> Result<Option<Vec<serde_json::Value>>> {
        let Some(filters) = &self.events else {
            return Ok(None);
        };
        ensure!(
            !filters.is_empty() && filters.len() <= MAX_EVENT_FILTERS,
            "Choose between 1 and {MAX_EVENT_FILTERS} activity filters."
        );
        filters
            .iter()
            .map(RoutineEventFilter::to_trigger_json)
            .collect::<Result<Vec<_>>>()
            .map(Some)
    }
}
/// Compact routine details returned to the caller.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RoutineInfo {
    /// Routine identifier.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Whether automatic runs are enabled.
    pub enabled: bool,
    /// Cron expression or event trigger, as stored by the scheduler.
    pub trigger: serde_json::Value,
    /// Execution target and instructions.
    pub task: serde_json::Value,
    /// Next scheduled firing, absent after a one-off completes.
    pub next_run_at: Option<DateTime<Utc>>,
}
/// A bounded list with the full matching count.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RoutineList {
    /// Matching routines (most recent first).
    pub routines: Vec<RoutineInfo>,
    /// Total matches before the response limit.
    pub total: usize,
}
/// Routine configuration and recent execution history.
#[derive(Debug, Serialize, JsonSchema)]
pub struct RoutineDetails {
    /// Current saved configuration.
    pub routine: RoutineInfo,
    /// Most recent runs, up to fifty, including status and transcript references.
    pub runs: Vec<serde_json::Value>,
}
/// Owning-service capability: authorization remains in the scheduler, never the tools.
#[async_trait]
pub trait RoutineService: Send + Sync {
    /// Create for the authenticated user; target accessibility is checked server-side.
    async fn create(
        &self,
        user: &MacroUserIdStr<'static>,
        config: &RoutineConfiguration,
    ) -> Result<RoutineInfo>;
    /// List the authenticated user's routines, including routines targeting agents.
    async fn list(&self, user: &MacroUserIdStr<'static>) -> Result<Vec<RoutineInfo>>;
    /// Read an accessible routine and its history.
    async fn read(&self, user: &MacroUserIdStr<'static>, id: Uuid) -> Result<RoutineDetails>;
    /// Replace configuration of an owned routine; activation is preserved.
    async fn update(
        &self,
        user: &MacroUserIdStr<'static>,
        id: Uuid,
        config: &RoutineConfiguration,
    ) -> Result<RoutineInfo>;
    /// Pause/resume an owned routine independently of its configuration.
    async fn set_enabled(
        &self,
        user: &MacroUserIdStr<'static>,
        id: Uuid,
        enabled: bool,
    ) -> Result<RoutineInfo>;
}
