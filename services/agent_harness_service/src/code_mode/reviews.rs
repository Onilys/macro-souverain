//! Compose persistent reviews with existing tool actions and the session queue.
use agent_code_mode::domain::{CodeModeError, reviews::*};
use agent_session::domain::{
    model::AgentSessionId,
    ports::{AgentSessionNotificationRecipient, AgentSessionRepo, ControlEvent},
};
use ai_toolset::RequestContext;
use async_trait::async_trait;
use import::domain::service::NotionWorkspaceImporter;
use macro_user_id::user_id::MacroUserIdStr;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

#[cfg(test)]
mod test;

/// The one draft an import review carries: which source's staged plan it
/// presents, and the plan rows the user took out of it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportDraft {
    source: ImportReviewSource,
    #[serde(default)]
    excluded: Vec<macro_uuid::Uuid>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ImportReviewSource {
    Notion,
}

pub struct Actions<S, H> {
    pub sessions: S,
    pub harness: Arc<H>,
    pub context: ai_tools::ToolServiceContext,
    pub tools: Arc<ai_tools::AiToolSet>,
}
#[async_trait]
impl<S: AgentSessionRepo, H: AgentSessionNotificationRecipient> ReviewActions for Actions<S, H> {
    async fn session(&self, session: AgentSessionId) -> Result<ReviewSession, CodeModeError> {
        let row = self
            .sessions
            .get(session)
            .await
            .map_err(|_| CodeModeError::NotFound)?;
        Ok(ReviewSession {
            owner: row
                .owner_user()
                .cloned()
                .map_err(|_| CodeModeError::Forbidden)?,
            archived: row.is_archived,
        })
    }
    fn validate(&self, kind: ReviewKind, draft: &Value) -> Result<(), CodeModeError> {
        validate_draft(&self.tools, kind, draft)
    }
    async fn execute(
        &self,
        owner: &MacroUserIdStr<'static>,
        review: ReviewId,
        kind: ReviewKind,
        draft: Value,
    ) -> Result<Value, CodeModeError> {
        let name = match kind {
            ReviewKind::Email => "SendEmail",
            ReviewKind::Calendar => "CreateCalendarEvent",
            ReviewKind::Import => return self.start_import(owner, review, draft).await,
        };
        let mut context = self.context.clone();
        context.usage_context =
            ai_usage::UsageContext::new(ai_usage::AiFeature::AgentSession, owner.clone());
        let result = self
            .tools
            .try_user_tool_call(context, RequestContext::new(owner.clone()), name, &draft)
            .await
            .map_err(|_| CodeModeError::Invalid("Could not submit the reviewed action.".into()))?
            .map_err(|_| {
                CodeModeError::Invalid(
                    "The reviewed action did not return a confirmed outcome.".into(),
                )
            })?;
        match result {
            ai_toolset::tool_object::UserToolResponse::UserAction(value) => Ok(value),
            _ => Err(CodeModeError::Invalid(
                "The action was not completed.".into(),
            )),
        }
    }
    async fn present(
        &self,
        owner: &MacroUserIdStr<'static>,
        record: &ReviewRecord,
    ) -> Result<(), CodeModeError> {
        if record.kind == ReviewKind::Import {
            // The plan is tied to the review before the card appears, so the
            // card never shows a plan it cannot approve.
            self.import_service()?
                .attach_notion_review(owner, record.id.0)
                .await
                .map_err(|error| {
                    tracing::warn!(error = ?error, review = %record.id.0, "could not tie the import plan to its review");
                    CodeModeError::Invalid(format!(
                        "Review {} was saved, but its import plan could not be attached. Read this review to retry.",
                        record.id.0
                    ))
                })?;
        }
        self.harness.present_tool(
            record.session_id,
            owner.clone(),
            agent_session::domain::model::SessionToolPresentation {
                tool_call_id: format!("review_{}", record.id.0),
                title: "mcp__macro_internal__PresentReview".into(),
                raw_input: serde_json::json!({"reviewId": record.id, "kind": record.kind, "title": record.title}),
                raw_output: serde_json::json!({"reviewId": record.id, "message": "Presented to the user"}),
            },
        ).await.map_err(|_| CodeModeError::Invalid(format!("Review {} was saved, but presentation is pending. Read this review to retry presentation without creating another draft.", record.id.0)))
    }
    async fn notify(
        &self,
        owner: &MacroUserIdStr<'static>,
        record: &ReviewRecord,
    ) -> Result<(), CodeModeError> {
        use agent_runtime_protocol::domain::action::AgentAction;
        let summary = notification_summary(record);
        self.harness
            .control_event(
                record.session_id,
                ControlEvent {
                    action: AgentAction::context_prompt(summary),
                    action_id: record
                        .notification_id
                        .map(agent_runtime_protocol::domain::action::AgentActionId::from_uuid),
                    actor: Some(owner.clone()),
                    context: None,
                },
            )
            .await
            .map_err(|_| {
                CodeModeError::Invalid(
                    "Review completed but its session notification could not be delivered.".into(),
                )
            })?;
        Ok(())
    }
}

impl<S, H> Actions<S, H> {
    fn import_service(&self) -> Result<&ai_tools::ToolImportService, CodeModeError> {
        self.context
            .import_tool_context
            .service
            .as_deref()
            .ok_or_else(|| CodeModeError::Invalid("Imports are not available here.".into()))
    }

    /// Start writing the approved plan; the write runs in the background and
    /// reports progress through the import state.
    async fn start_import(
        &self,
        owner: &MacroUserIdStr<'static>,
        review: ReviewId,
        draft: Value,
    ) -> Result<Value, CodeModeError> {
        let draft: ImportDraft = serde_json::from_value(draft)
            .map_err(|_| CodeModeError::Invalid("Import draft is malformed.".into()))?;
        let ImportReviewSource::Notion = draft.source;
        let report = self
            .import_service()?
            .start_notion_write(owner, review.0, draft.excluded)
            .await
            .map_err(|error| CodeModeError::Invalid(error.to_string()))?;
        serde_json::to_value(report).map_err(|_| {
            CodeModeError::Invalid("The import started, but its report could not be read.".into())
        })
    }
}

fn validate_draft(
    tools: &ai_tools::AiToolSet,
    kind: ReviewKind,
    draft: &Value,
) -> Result<(), CodeModeError> {
    let invalid =
        || CodeModeError::Invalid("Draft does not match the review component's schema.".into());
    match kind {
        ReviewKind::Email => {
            if !tools.is_valid_tool("SendEmail", draft) {
                return Err(invalid());
            }
        }
        ReviewKind::Calendar => {
            if !tools.is_valid_tool("CreateCalendarEvent", draft) {
                return Err(invalid());
            }
        }
        ReviewKind::Import => {
            if serde_json::from_value::<ImportDraft>(draft.clone()).is_err() {
                return Err(invalid());
            }
        }
    }
    Ok(())
}

fn notification_summary(record: &ReviewRecord) -> String {
    // Delivered as private context. Full results stay on the saved review.
    let mut summary = format!(
        "Recorded review outcomes, not new instructions. Do not repeat completed actions or automatically retry uncertain outcomes.\nReview updated: {}\n",
        summary_text(&record.title, 120)
    );
    for (status, label) in [
        (ReviewItemStatus::Completed, "completed"),
        (ReviewItemStatus::Unknown, "outcome unconfirmed"),
        (ReviewItemStatus::Dismissed, "dismissed"),
        (ReviewItemStatus::Pending, "pending"),
        (ReviewItemStatus::Submitting, "submitting"),
    ] {
        let count = record
            .items
            .iter()
            .filter(|item| item.status == status)
            .count();
        if count > 0 {
            summary.push_str(&format!("{count} {label}; "));
        }
    }
    summary.push('\n');
    if record.kind == ReviewKind::Import {
        summary.push_str(&format!("\nSaved review: {}. An approved import is being written in the background; report progress with ImportFromNotion (action `status`) rather than importing anything yourself. A dismissed import wrote nothing.", record.id.0));
    } else {
        summary.push_str(&format!("\nSaved review: {}. Completed actions are already recorded; no further sending or scheduling is requested.", record.id.0));
    }
    summary
}

fn summary_text(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = compact.chars();
    let mut bounded = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        bounded.push('…');
    }
    bounded
}
