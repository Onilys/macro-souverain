//! The agent's one tool for importing a Notion workspace.

use std::time::Duration;

use ai_toolset::{
    AsyncTool, RequestContext, ServiceContext, ToolAnnotated, ToolAnnotations, ToolResult,
};
use async_trait::async_trait;
use import_notion::domain::model::{ImportScope, NotionId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{ImportToolContext, import_error, tool_error};
use crate::domain::models::{NotionImportReport, RunStatus};
use crate::domain::ports::ImportError;
use crate::domain::service::NotionWorkspaceImporter;

#[cfg(test)]
mod test;

/// How long `plan` waits for planning before reporting that it is still
/// running in the background.
const PLAN_WAIT: Duration = Duration::from_secs(240);

/// What the tool is asked to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NotionImportAction {
    /// Read the workspace and plan the import, replacing any earlier plan.
    Plan,
    /// Report where planning or importing stands.
    Status,
    /// Stop planning or importing; what is already imported stays.
    Cancel,
}

/// Plan, check on, or cancel an import of the user's Notion workspace.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "ImportFromNotion",
    description = "Import the user's Notion workspace (or part of it) into Macro: pages become documents in folders mirroring Notion's page tree, databases become Macro databases with their rows and relations, and task-tracker databases become Macro tasks. `plan` reads the workspace through the user's Notion connection, decides per page and database what to do, and stages a plan without writing anything; then present the plan to the user with PresentReview (kind \"import\", drafts [{\"source\":\"notion\"}]). Approving that review writes the plan; never import plan items with other tools. `status` reports progress; `cancel` stops planning or importing. Use this for anything bigger than a single page instead of ImportNotionPage."
)]
pub struct ImportFromNotion {
    /// What to do.
    pub action: NotionImportAction,
    /// For `plan`: Notion page or database URLs (or ids) to import, each
    /// with everything under it. Leave empty to plan everything the
    /// connection can see.
    #[serde(default)]
    pub roots: Vec<String>,
}

/// The tool's answer.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportFromNotionResponse {
    /// Where the import stands.
    pub report: NotionImportReport,
    /// What happened and what to do next.
    pub message: String,
}

impl ToolAnnotated for ImportFromNotion {
    const ANNOTATIONS: ToolAnnotations =
        ToolAnnotations::additive("Import from Notion").with_open_world();
}

#[async_trait]
impl<T: NotionWorkspaceImporter> AsyncTool<ImportToolContext<T>> for ImportFromNotion {
    type Output = ImportFromNotionResponse;

    #[tracing::instrument(skip_all, fields(user_id = %request_context.user_id, action = ?self.action, roots = self.roots.len()), err)]
    async fn call(
        &self,
        service_context: ServiceContext<ImportToolContext<T>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        let service = service_context.require_service()?;
        let user = request_context.user_id.clone();
        let report = match self.action {
            NotionImportAction::Plan => {
                let scope = scope(&self.roots)?;
                let planned = service.prepare_notion_import(&user, scope, PLAN_WAIT);
                tokio::select! {
                    report = planned => report,
                    // Planning carries on in the background; report where it is.
                    () = request_context.cancel.cancelled() => service.notion_import_report(&user).await,
                }
            }
            NotionImportAction::Status => service.notion_import_report(&user).await,
            NotionImportAction::Cancel => match service.cancel_notion_import(&user).await {
                Ok(_) => service.notion_import_report(&user).await,
                Err(error) => Err(error),
            },
        }
        .map_err(|error| match error {
            ImportError::NotionNotConnected => tool_error(
                "Notion is not connected. Ask the user to connect Notion, then plan again."
                    .to_string(),
                error,
            ),
            other => import_error("Notion import failed", other),
        })?;
        let message = message(self.action, &report);
        Ok(ImportFromNotionResponse { report, message })
    }
}

fn scope(roots: &[String]) -> ToolResult<ImportScope> {
    if roots.iter().all(|root| root.trim().is_empty()) {
        return Ok(ImportScope::Everything);
    }
    let ids = roots
        .iter()
        .filter(|root| !root.trim().is_empty())
        .map(|root| {
            NotionId::parse(root).ok_or_else(|| {
                tool_error(
                    format!("`{root}` is not a Notion page or database URL or id."),
                    anyhow::anyhow!("unparseable Notion root"),
                )
            })
        })
        .collect::<ToolResult<Vec<_>>>()?;
    Ok(ImportScope::Roots { ids })
}

/// What the model should know and do next.
pub(super) fn message(action: NotionImportAction, report: &NotionImportReport) -> String {
    let planned = format!(
        "{} pages and {} databases: {} to copy, {} task lists to turn into tasks, {} to skip, {} to handle by hand",
        report.pages, report.data_sources, report.copy, report.tasks, report.skip, report.hand
    );
    let hand = if report.hand_items.is_empty() {
        String::new()
    } else {
        format!(
            " Objects to handle by hand (with your own tools, after the import): {}.",
            report
                .hand_items
                .iter()
                .map(|item| match &item.reason {
                    Some(reason) => format!("\"{}\" ({reason})", item.title),
                    None => format!("\"{}\"", item.title),
                })
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    match (action, report.status) {
        (NotionImportAction::Cancel, _) => format!(
            "The Notion import is stopped. {} objects were already imported and stay in Macro.",
            report.imported
        ),
        (_, Some(RunStatus::Running)) => "Still reading the Notion workspace and planning; this continues in the background. Check again with action `status` in a minute.".to_string(),
        (_, Some(RunStatus::Ready)) if report.review_id.is_none() => format!(
            "The plan is ready: {planned}. Present it to the user now with PresentReview (kind \"import\", a short title such as \"Import from Notion\", drafts [{{\"source\":\"notion\"}}]). Nothing is written until they approve it.{hand}"
        ),
        (_, Some(RunStatus::Ready)) => format!(
            "The plan ({planned}) is presented and waiting for the user's approval.{hand}"
        ),
        (_, Some(RunStatus::Importing)) => format!(
            "Importing: {} done, {} being written, {} waiting.",
            report.imported, report.writing, report.waiting
        ),
        (_, Some(RunStatus::Completed)) => format!(
            "The import finished: {} objects imported{}.{hand}",
            report.imported,
            report
                .error
                .as_deref()
                .map(|error| format!(" ({error})"))
                .unwrap_or_default()
        ),
        (_, Some(RunStatus::Failed)) => format!(
            "The Notion import failed: {}. Fix the cause and plan again.",
            report.error.as_deref().unwrap_or("unknown error")
        ),
        (_, Some(RunStatus::Dismissed)) => "The last Notion import was cancelled.".to_string(),
        (_, None) => {
            "No Notion import has been planned yet. Use action `plan`.".to_string()
        }
    }
}
