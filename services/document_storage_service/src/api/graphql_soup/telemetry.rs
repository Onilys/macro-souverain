#[cfg(test)]
mod test;

use std::sync::LazyLock;

use async_graphql::{
    PathSegment, Request, Response, ServerError, Value,
    parser::types::{DocumentOperations, OperationType},
};
use regex::Regex;
use tracing::{Instrument as _, Level, Span};

/// Resource for requests whose operation cannot be resolved (parse errors,
/// unknown operation names). Keeps attacker-supplied text out of the resource.
const UNKNOWN_RESOURCE: &str = "graphql.unknown";
const ANONYMOUS_OPERATION: &str = "anonymous";
/// Unauthenticated callers choose their own operation names. Grouping them
/// bounds the resource cardinality that Datadog turns into metric tags.
const UNAUTHENTICATED_OPERATION: &str = "unauthenticated";
const MAX_OPERATION_NAME_CHARS: usize = 100;
/// A response can carry one error per aliased field; cap the log lines per request.
const MAX_LOGGED_ERRORS: usize = 10;
const MAX_ERROR_MESSAGE_CHARS: usize = 200;
const REDACTED: &str = "<redacted>";
const SERVER_ERROR_CODE_PREFIX: &str = "INTERNAL";

static QUOTED_LITERAL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#""[^"]*"|`[^`]*`"#).expect("quoted literal pattern is valid"));
/// Schema names, type names, codes, and ids. Anything else inside quotes may
/// echo request input (variable values, string arguments).
static SAFE_LITERAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[A-Za-z0-9_:<>\[\]!$.-]*$").expect("safe literal pattern is valid")
});
static EMAIL_ADDRESS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
        .expect("email address pattern is valid")
});

/// Runs `execute` inside a `graphql.execute` span that records the selected
/// operation and logs the response's errors.
pub(super) async fn observe<Fut>(
    mut request: Request,
    authenticated: bool,
    execute: impl FnOnce(Request) -> Fut,
) -> Response
where
    Fut: Future<Output = Response>,
{
    let span = execute_span();
    let operation = GraphqlOperation::from_request(&mut request, authenticated);
    operation.record(&span);
    let response = execute(request).instrument(span.clone()).await;
    operation.record_response(&span, &response);
    response
}

fn execute_span() -> Span {
    tracing::info_span!(
        "graphql.execute",
        "resource.name" = tracing::field::Empty,
        "graphql.operation.type" = tracing::field::Empty,
        "graphql.operation.name" = tracing::field::Empty,
        "graphql.error_count" = tracing::field::Empty,
        otel.status_code = tracing::field::Empty,
        otel.status_description = tracing::field::Empty,
    )
}

/// The operation a GraphQL HTTP request selects, recorded on `graphql.execute`.
#[derive(Debug)]
struct GraphqlOperation {
    kind: Option<OperationType>,
    name: Option<String>,
    authenticated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ErrorSeverity {
    /// The caller sent something the server rejected; logged at warn.
    Client,
    /// A resolver failed for an authenticated caller; logged at error and marks the span.
    Server,
}

impl GraphqlOperation {
    /// Parses the request document so its operation can be recorded before
    /// execution. The parsed document stays on the request and
    /// `Schema::execute` reuses it, so valid documents are parsed once.
    fn from_request(request: &mut Request, authenticated: bool) -> Self {
        let requested_name = request.operation_name.clone();
        let selected = request.parsed_query().ok().and_then(|document| {
            select_operation(&document.operations, requested_name.as_deref())
                .map(|(name, kind)| (name.map(truncate_operation_name), kind))
        });
        let (name, kind) = match selected {
            Some((name, kind)) => (name, Some(kind)),
            None => (None, None),
        };
        Self {
            kind,
            name,
            authenticated,
        }
    }

    /// The Datadog resource name, `graphql.<type>.<operationName>`. Datadog
    /// derives `trace.Internal.{hits,errors,duration}` per resource from it.
    fn resource_name(&self) -> String {
        let Some(kind) = self.kind else {
            return UNKNOWN_RESOURCE.to_owned();
        };
        let name = match (&self.name, self.authenticated) {
            (_, false) => UNAUTHENTICATED_OPERATION,
            (Some(name), true) => name.as_str(),
            (None, true) => ANONYMOUS_OPERATION,
        };
        format!("graphql.{kind}.{name}")
    }

    fn record(&self, span: &Span) {
        span.record("resource.name", self.resource_name());
        if let Some(kind) = self.kind {
            span.record("graphql.operation.type", tracing::field::display(kind));
        }
        if let Some(name) = &self.name {
            span.record("graphql.operation.name", name.as_str());
        }
    }

    /// Records the error count on `span`, logs each error with its path and a
    /// sanitized message, and marks `span` errored when a resolver failed.
    /// Request variables are never read.
    fn record_response(&self, span: &Span, response: &Response) {
        span.record("graphql.error_count", response.errors.len());

        let mut first_server_error = None;
        for (index, error) in response.errors.iter().enumerate() {
            let severity = self.error_severity(error);
            let logged = index < MAX_LOGGED_ERRORS;
            let sets_status = severity == ErrorSeverity::Server && first_server_error.is_none();
            if !logged && !sets_status {
                continue;
            }
            let message = sanitize_error_message(&error.message);
            if logged {
                self.log_error(span, error, severity, &message, response.errors.len());
            }
            if sets_status {
                first_server_error = Some(message);
            }
        }

        if let Some(message) = first_server_error {
            span.record("otel.status_code", "ERROR");
            span.record("otel.status_description", message);
        }
    }

    fn error_severity(&self, error: &ServerError) -> ErrorSeverity {
        if !self.authenticated || error.path.is_empty() {
            return ErrorSeverity::Client;
        }
        match error_code(error) {
            Some(code)
                if !code
                    .to_ascii_uppercase()
                    .starts_with(SERVER_ERROR_CODE_PREFIX) =>
            {
                ErrorSeverity::Client
            }
            _ => ErrorSeverity::Server,
        }
    }

    fn log_error(
        &self,
        span: &Span,
        error: &ServerError,
        severity: ErrorSeverity,
        message: &str,
        error_count: usize,
    ) {
        let resource = self.resource_name();
        let path = error_path(&error.path);
        let code = error_code(error);
        macro_rules! log_graphql_error {
            ($level:expr, $text:literal) => {
                tracing::event!(
                    parent: span,
                    $level,
                    "graphql.resource" = resource.as_str(),
                    "graphql.operation.type" = self.kind.map(tracing::field::display),
                    "graphql.operation.name" = self.name.as_deref(),
                    "graphql.error.path" = path.as_deref(),
                    "graphql.error.code" = code,
                    "graphql.error_count" = error_count,
                    error = message,
                    $text
                )
            };
        }
        match severity {
            ErrorSeverity::Server => log_graphql_error!(Level::ERROR, "graphql resolver error"),
            ErrorSeverity::Client => log_graphql_error!(Level::WARN, "graphql client error"),
        }
    }
}

/// Mirrors async-graphql's operation selection in `Schema::execute`.
fn select_operation<'a>(
    operations: &'a DocumentOperations,
    requested_name: Option<&'a str>,
) -> Option<(Option<&'a str>, OperationType)> {
    match (operations, requested_name) {
        (DocumentOperations::Single(operation), None) => Some((None, operation.node.ty)),
        (DocumentOperations::Single(_), Some(_)) => None,
        (DocumentOperations::Multiple(operations), Some(name)) => operations
            .get(name)
            .map(|operation| (Some(name), operation.node.ty)),
        (DocumentOperations::Multiple(operations), None) if operations.len() == 1 => operations
            .iter()
            .next()
            .map(|(name, operation)| (Some(name.as_str()), operation.node.ty)),
        (DocumentOperations::Multiple(_), None) => None,
    }
}

fn truncate_operation_name(name: &str) -> String {
    name.chars().take(MAX_OPERATION_NAME_CHARS).collect()
}

fn error_code(error: &ServerError) -> Option<&str> {
    match error.extensions.as_ref()?.get("code")? {
        Value::String(code) => Some(code.as_str()),
        Value::Enum(code) => Some(code.as_str()),
        _ => None,
    }
}

/// `user.soup.items.3.name`; `None` for request-level errors.
fn error_path(path: &[PathSegment]) -> Option<String> {
    if path.is_empty() {
        return None;
    }
    let segments: Vec<String> = path
        .iter()
        .map(|segment| match segment {
            PathSegment::Field(field) => field.clone(),
            PathSegment::Index(index) => index.to_string(),
        })
        .collect();
    Some(segments.join("."))
}

/// Error messages can echo request input or carry raw upstream errors.
/// Redacts quoted literals that are not schema-like tokens and email
/// addresses, strips control characters, and bounds the length.
fn sanitize_error_message(message: &str) -> String {
    let literals_redacted = QUOTED_LITERAL.replace_all(message, |captures: &regex::Captures| {
        let literal = &captures[0];
        let quote = &literal[..1];
        let inner = &literal[1..literal.len() - 1];
        if SAFE_LITERAL.is_match(inner) {
            literal.to_owned()
        } else {
            format!("{quote}{REDACTED}{quote}")
        }
    });
    let redacted = EMAIL_ADDRESS.replace_all(&literals_redacted, REDACTED);
    let mut sanitized: String = redacted
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(MAX_ERROR_MESSAGE_CHARS)
        .collect();
    if redacted.chars().count() > MAX_ERROR_MESSAGE_CHARS {
        sanitized.push('…');
    }
    sanitized
}
