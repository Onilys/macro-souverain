//! Importing a Notion workspace: inventory, triage, a reviewed plan, and the
//! write that turns the plan into folders, documents, tasks and databases.
//!
//! Planning and writing both run detached from the request that started
//! them, recorded on the user's Notion run row: `running` while planning,
//! `ready` once a plan is staged, `importing` while writing, then
//! `completed`, `failed` or `dismissed` (cancelled). A heartbeat keeps the
//! run fresh so the stale-run reaper leaves a long job alone, and every step
//! checks the row so a cancel from any process stops the job.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use futures::{FutureExt, StreamExt, stream};
use import_notion::domain::inventory::{all_users, full_markdown, inventory};
use import_notion::domain::model::{
    ImportScope, NotionDataSource, NotionId, NotionPage, NotionUser, PageMarkdown, Paged,
    SearchHit, SearchObject,
};
use import_notion::domain::ports::{NotionApi, NotionConnections, NotionError};
use macro_user_id::user_id::MacroUserIdStr;
use tracing::Instrument;
use uuid::Uuid;

use super::{
    AbortOnDrop, IMPORT_HEARTBEAT, ImportServiceImpl, NOTION_IMPORT_MODEL, NotionWorkspaceImporter,
};
use crate::domain::models::{
    ImportEntity, ImportKind, ImportSource, ImportStatus, NotionDecision, NotionDocMeta,
    NotionImportReport, NotionReportItem, RunStatus,
};
use crate::domain::ports::{
    CanonicalImportRepo, EntityCreator, ImportError, ImportRepo, NotionPlanRepo, Result,
    SlackWorkspaceSource, WorkspaceWriter,
};
use mcp_select::ConnectorSelect;

mod plan;
mod triage;
mod values;
mod write;

#[cfg(test)]
mod test;

/// Failures and by-hand items a report lists, at most.
const REPORT_LIST_LIMIT: usize = 50;
/// How often progress is pushed to the client while a job runs.
const NOTIFY_EVERY: Duration = Duration::from_secs(2);

/// The default: no Notion workspace is reachable, so workspace imports report
/// Notion as not connected.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoNotionConnections;

/// An uninhabited client: [`NoNotionConnections`] never opens one.
pub enum NoNotionApi {}

impl NotionConnections for NoNotionConnections {
    type Api = NoNotionApi;

    async fn for_user(
        &self,
        _user: &MacroUserIdStr<'static>,
    ) -> std::result::Result<Option<Self::Api>, NotionError> {
        Ok(None)
    }
}

impl NotionApi for NoNotionApi {
    async fn search(
        &self,
        _object: SearchObject,
        _cursor: Option<String>,
    ) -> std::result::Result<Paged<SearchHit>, NotionError> {
        match *self {}
    }

    async fn page(&self, _id: &NotionId) -> std::result::Result<NotionPage, NotionError> {
        match *self {}
    }

    async fn page_markdown(
        &self,
        _id: &NotionId,
    ) -> std::result::Result<PageMarkdown, NotionError> {
        match *self {}
    }

    async fn data_source(
        &self,
        _id: &NotionId,
    ) -> std::result::Result<NotionDataSource, NotionError> {
        match *self {}
    }

    async fn database_sources(
        &self,
        _database: &NotionId,
    ) -> std::result::Result<Vec<NotionId>, NotionError> {
        match *self {}
    }

    async fn query_data_source(
        &self,
        _id: &NotionId,
        _cursor: Option<String>,
    ) -> std::result::Result<Paged<NotionPage>, NotionError> {
        match *self {}
    }

    async fn users(
        &self,
        _cursor: Option<String>,
    ) -> std::result::Result<Paged<NotionUser>, NotionError> {
        match *self {}
    }
}

/// Run states a new plan or write may start from.
const SETTLED: [RunStatus; 4] = [
    RunStatus::Ready,
    RunStatus::Completed,
    RunStatus::Failed,
    RunStatus::Dismissed,
];

/// Pushes progress to the client at most every [`NOTIFY_EVERY`].
struct Throttle(std::sync::Mutex<Option<Instant>>);

impl Throttle {
    fn new() -> Self {
        Self(std::sync::Mutex::new(None))
    }

    fn due(&self) -> bool {
        let Ok(mut last) = self.0.lock() else {
            return false;
        };
        let now = Instant::now();
        match *last {
            Some(previous) if now.duration_since(previous) < NOTIFY_EVERY => false,
            _ => {
                *last = Some(now);
                true
            }
        }
    }
}

impl<R, S, C, W, N> NotionWorkspaceImporter for ImportServiceImpl<R, S, C, W, N>
where
    R: ImportRepo + CanonicalImportRepo + NotionPlanRepo + Clone,
    S: ConnectorSelect,
    C: EntityCreator + WorkspaceWriter,
    W: SlackWorkspaceSource,
    N: NotionConnections,
{
    async fn prepare_notion_import(
        &self,
        user: &MacroUserIdStr<'static>,
        scope: ImportScope,
        wait: Duration,
    ) -> Result<NotionImportReport> {
        self.reap_stale_runs(user).await;
        if !self
            .repo
            .start_run(user, ImportSource::Notion, &SETTLED)
            .await?
        {
            return Err(ImportError::NotReady(
                "A Notion import is already being planned or written. Check its status, or cancel it first.",
            ));
        }
        self.notify(user).await;
        let service = self.clone();
        let owner = user.clone();
        let job = tokio::spawn(async move { service.plan_workspace(&owner, scope).await });
        // The job keeps going if the wait runs out or the caller goes away.
        let _ = tokio::time::timeout(wait, job).await;
        self.notion_import_report(user).await
    }

    async fn notion_import_report(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> Result<NotionImportReport> {
        self.reap_stale_runs(user).await;
        let run = self
            .repo
            .list_runs(user)
            .await?
            .into_iter()
            .find(|run| run.source == ImportSource::Notion);
        let rows = self
            .repo
            .list(user, Some(ImportSource::Notion), None)
            .await?;
        Ok(report(run.as_ref(), &rows))
    }

    async fn attach_notion_review(
        &self,
        user: &MacroUserIdStr<'static>,
        review_id: Uuid,
    ) -> Result<u64> {
        let attached = self
            .repo
            .attach_review(user, ImportSource::Notion, review_id)
            .await?;
        self.notify(user).await;
        Ok(attached)
    }

    async fn start_notion_write(
        &self,
        user: &MacroUserIdStr<'static>,
        review_id: Uuid,
        excluded: Vec<Uuid>,
    ) -> Result<NotionImportReport> {
        let staged = self
            .repo
            .list(user, Some(ImportSource::Notion), Some(ImportStatus::Staged))
            .await?;
        let planned: Vec<(ImportEntity, write::WriteItem)> = staged
            .into_iter()
            .filter(|row| row.review_id == Some(review_id))
            .filter_map(|row| write::WriteItem::from_entity(&row).map(|item| (row, item)))
            .collect();
        if planned.is_empty() {
            return Err(ImportError::NotReady(
                "This plan has nothing left to import.",
            ));
        }
        if !self
            .repo
            .transition_run(
                user,
                ImportSource::Notion,
                &SETTLED,
                RunStatus::Importing,
                None,
            )
            .await?
        {
            return Err(ImportError::NotReady(
                "A Notion import is already being planned or written.",
            ));
        }

        let mut to_write = Vec::new();
        for (row, item) in planned {
            let left_out = excluded.contains(&row.id);
            match (left_out, item.decision) {
                (true, _) | (false, NotionDecision::Skip) => {
                    self.repo.discard(user, row.id).await?;
                }
                // Left staged for the agent, which handles it by hand.
                (false, NotionDecision::Hand) => {}
                (false, NotionDecision::Copy | NotionDecision::Tasks) => to_write.push(item),
            }
        }
        let ids: Vec<Uuid> = to_write.iter().map(|item| item.import_id).collect();
        let claimed: std::collections::HashSet<Uuid> = self
            .repo
            .mark_importing(user, &ids)
            .await?
            .into_iter()
            .map(|row| row.id)
            .collect();
        to_write.retain(|item| claimed.contains(&item.import_id));
        self.notify(user).await;

        let service = self.clone();
        let owner = user.clone();
        tokio::spawn(async move { service.write_plan(&owner, to_write).await });
        self.notion_import_report(user).await
    }

    async fn cancel_notion_import(&self, user: &MacroUserIdStr<'static>) -> Result<bool> {
        let cancelled = self
            .repo
            .transition_run(
                user,
                ImportSource::Notion,
                &[RunStatus::Running, RunStatus::Importing],
                RunStatus::Dismissed,
                Some("Cancelled"),
            )
            .await?;
        self.notify(user).await;
        Ok(cancelled)
    }
}

impl<R, S, C, W, N> ImportServiceImpl<R, S, C, W, N>
where
    R: ImportRepo + CanonicalImportRepo + NotionPlanRepo + Clone,
    S: ConnectorSelect,
    C: EntityCreator + WorkspaceWriter,
    W: SlackWorkspaceSource,
    N: NotionConnections,
{
    /// Plan and record the outcome on the run.
    fn plan_workspace<'a>(
        &'a self,
        user: &'a MacroUserIdStr<'static>,
        scope: ImportScope,
    ) -> futures::future::BoxFuture<'a, ()> {
        let span = tracing::info_span!("notion_import.plan", %user);
        async move {
            let _heartbeat = self.run_heartbeat(user, RunStatus::Running, Vec::new());
            let outcome = self.try_plan_workspace(user, scope).await;
            let (to, error) = match &outcome {
                Ok(()) => (RunStatus::Ready, None),
                Err(error) => {
                    tracing::warn!(error = ?error, "notion import planning failed");
                    (RunStatus::Failed, Some(failure_text(error)))
                }
            };
            // A cancelled run is `dismissed` already, so this moves nothing.
            if let Err(error) = self
                .repo
                .transition_run(
                    user,
                    ImportSource::Notion,
                    &[RunStatus::Running],
                    to,
                    error.as_deref(),
                )
                .await
            {
                tracing::warn!(error = ?error, "could not record the notion planning outcome");
            }
            self.notify(user).await;
        }
        .instrument(span)
        .boxed()
    }

    async fn try_plan_workspace(
        &self,
        user: &MacroUserIdStr<'static>,
        scope: ImportScope,
    ) -> Result<()> {
        let api = self
            .notion
            .for_user(user)
            .await?
            .ok_or(ImportError::NotionNotConnected)?;
        let found = inventory(&api, &scope, &|progress| {
            tracing::debug!(
                pages = progress.pages,
                data_sources = progress.data_sources,
                "notion inventory progress"
            );
        })
        .await?;
        if self.cancelled(user).await {
            return Ok(());
        }
        let tree = plan::PlanTree::new(&found);
        let items = tree.triage_items();
        let usage = ai_usage::UsageContext::new(ai_usage::AiFeature::Import, user.clone());
        let verdicts = triage::decide(
            &items,
            || {
                let service = self.clone();
                let user = user.clone();
                async move { service.admit_ai(&user).await.map_err(anyhow::Error::from) }
            },
            self.recorder.as_ref(),
            usage,
            NOTION_IMPORT_MODEL,
        )
        .await;
        if self.cancelled(user).await {
            return Ok(());
        }
        let rows = tree.plan_rows(&verdicts);
        self.repo
            .replace_plan(user, ImportSource::Notion, &rows)
            .await?;
        Ok(())
    }

    /// Write the claimed plan items and record the outcome on the run.
    #[tracing::instrument(skip(self, items), fields(%user, items = items.len()), name = "notion_import.write")]
    async fn write_plan(&self, user: &MacroUserIdStr<'static>, items: Vec<write::WriteItem>) {
        let ids = items.iter().map(|item| item.import_id).collect();
        let _heartbeat = self.run_heartbeat(user, RunStatus::Importing, ids);
        let outcome = self.try_write_plan(user, &items).await;
        let (to, error) = match &outcome {
            Ok(0) => (RunStatus::Completed, None),
            Ok(failed) => (
                RunStatus::Completed,
                Some(format!(
                    "{failed} of {} objects could not be imported",
                    items.len()
                )),
            ),
            Err(error) => {
                tracing::warn!(error = ?error, "notion import write failed");
                (RunStatus::Failed, Some(failure_text(error)))
            }
        };
        // Anything still claimed (a cancel, or a failure part way) goes back
        // to staged so it can be imported later.
        for item in &items {
            if let Ok(Some(row)) = self.repo.get(user, item.import_id).await
                && row.status == ImportStatus::Importing
            {
                let reason = if outcome.is_ok() {
                    "Cancelled"
                } else {
                    "The import stopped"
                };
                let _ = self
                    .repo
                    .mark_import_failed(user, item.import_id, reason)
                    .await;
            }
        }
        if let Err(error) = self
            .repo
            .transition_run(
                user,
                ImportSource::Notion,
                &[RunStatus::Importing],
                to,
                error.as_deref(),
            )
            .await
        {
            tracing::warn!(error = ?error, "could not record the notion write outcome");
        }
        self.notify(user).await;
    }

    /// Write every item; returns how many failed.
    async fn try_write_plan(
        &self,
        user: &MacroUserIdStr<'static>,
        items: &[write::WriteItem],
    ) -> Result<usize> {
        let api = self
            .notion
            .for_user(user)
            .await?
            .ok_or(ImportError::NotionNotConnected)?;
        let team_id = self.repo.user_team_id(user).await?;
        let people = self.people(&api, user).await;
        let root = self
            .creator
            .create_folder(user, write::ROOT_FOLDER, None)
            .await?;

        // Folders first, parents before children.
        let layout = write::folder_layout(items);
        let by_id: HashMap<Uuid, &write::WriteItem> =
            items.iter().map(|item| (item.import_id, item)).collect();
        let parents: HashMap<Uuid, Option<Uuid>> = items
            .iter()
            .map(|item| (item.import_id, item.parent))
            .collect();
        let mut folders: HashMap<Uuid, Uuid> = HashMap::new();
        for folder_row in &layout.folders {
            let Some(item) = by_id.get(folder_row) else {
                continue;
            };
            let parent = write::folder_for(item, false, &folders, &parents, root);
            let folder = self
                .creator
                .create_folder(user, &item.title, Some(parent))
                .await?;
            folders.insert(*folder_row, folder);
        }

        let throttle = Throttle::new();
        let databases: tokio::sync::Mutex<HashMap<NotionId, write::WrittenDatabase>> =
            tokio::sync::Mutex::new(HashMap::new());
        let outcomes: Vec<bool> = stream::iter(items.iter().cloned())
            .map(|item| {
                let folders = &folders;
                let parents = &parents;
                let people = &people;
                let api = &api;
                let databases = &databases;
                let throttle = &throttle;
                async move {
                    if self.cancelled(user).await {
                        return true;
                    }
                    let outcome = self
                        .write_item(api, user, &item, team_id, folders, parents, root, people, databases)
                        .await;
                    let succeeded = match outcome {
                        Ok(()) => true,
                        Err(error) => {
                            tracing::warn!(error = ?error, kind = item.kind.as_ref(), "notion object was not imported");
                            let _ = self
                                .repo
                                .mark_import_failed(user, item.import_id, &failure_text(&error))
                                .await;
                            false
                        }
                    };
                    if throttle.due() {
                        self.notify(user).await;
                    }
                    succeeded
                }
                .boxed()
            })
            .buffer_unordered(write::WRITE_CONCURRENCY)
            .collect()
            .await;

        let databases = databases.into_inner();
        if !databases.is_empty()
            && !self.cancelled(user).await
            && let Err(error) = write::link_relations(self.creator.as_ref(), user, &databases).await
        {
            tracing::warn!(error = ?error, "notion relations were not linked");
        }
        Ok(outcomes.into_iter().filter(|succeeded| !succeeded).count())
    }

    #[allow(clippy::too_many_arguments)]
    async fn write_item(
        &self,
        api: &N::Api,
        user: &MacroUserIdStr<'static>,
        item: &write::WriteItem,
        team_id: Option<Uuid>,
        folders: &HashMap<Uuid, Uuid>,
        parents: &HashMap<Uuid, Option<Uuid>>,
        root: Uuid,
        people: &values::PeopleMap,
        databases: &tokio::sync::Mutex<HashMap<NotionId, write::WrittenDatabase>>,
    ) -> Result<()> {
        // One copy per team: a teammate's import stands in for this one.
        if let Some(existing) = self
            .repo
            .find_team_imported(user, ImportSource::Notion, item.notion_id.as_str())
            .await?
            && let (Some(entity_id), Some(entity_type)) =
                (&existing.entity_id, &existing.entity_type)
        {
            self.repo
                .mark_imported(user, item.import_id, entity_id, entity_type, None)
                .await?;
            return Ok(());
        }

        let (entity_id, entity_type) = match (item.kind, item.decision) {
            (ImportKind::DataSource, NotionDecision::Tasks) => {
                let folder = write::folder_for(item, false, folders, parents, root);
                let tasks =
                    write::write_tasks(api, self.creator.as_ref(), user, item, folder, people)
                        .await?;
                (tasks.to_string(), write::FOLDER_ENTITY)
            }
            (ImportKind::DataSource, _) => {
                let folder = write::folder_for(item, false, folders, parents, root);
                let written =
                    write::write_database(api, self.creator.as_ref(), user, item, folder, people)
                        .await?;
                let id = written.database_id.to_string();
                databases
                    .lock()
                    .await
                    .insert(item.notion_id.clone(), written);
                (id, write::DATABASE_ENTITY)
            }
            _ => {
                let folder = write::folder_for(item, true, folders, parents, root);
                let markdown = write::page_markdown(&full_markdown(api, &item.notion_id).await?);
                let properties = match api.page(&item.notion_id).await {
                    Ok(page) => values::document_properties(&page),
                    Err(error) => {
                        tracing::warn!(error = ?error, "notion page properties were not read");
                        Default::default()
                    }
                };
                let document = self
                    .creator
                    .create_document(user, &item.title, &markdown, &properties, Some(folder))
                    .await?;
                (document, write::DOCUMENT_ENTITY)
            }
        };
        self.repo
            .mark_imported(user, item.import_id, &entity_id, entity_type, team_id)
            .await?;
        Ok(())
    }

    /// Notion users matched to the user's team by email. Empty when Notion
    /// will not share emails; people columns then stay empty.
    async fn people(&self, api: &N::Api, user: &MacroUserIdStr<'static>) -> values::PeopleMap {
        let notion_users = match all_users(api).await {
            Ok(users) => users,
            Err(error) => {
                tracing::warn!(error = ?error, "notion users were not read; people stay empty");
                return values::PeopleMap::new();
            }
        };
        let members = self
            .creator
            .team_members(user)
            .await
            .unwrap_or_else(|error| {
                tracing::warn!(error = ?error, "team members were not read; people stay unmatched");
                Vec::new()
            });
        notion_users
            .into_iter()
            .map(|notion_user| {
                let email = notion_user.email.map(|email| email.to_lowercase());
                let macro_user = email.as_ref().and_then(|email| {
                    members
                        .iter()
                        .find(|member| &member.email == email)
                        .map(|member| member.user_id.clone())
                });
                (notion_user.id, values::Person { email, macro_user })
            })
            .collect()
    }

    /// Whether the user cancelled the import.
    async fn cancelled(&self, user: &MacroUserIdStr<'static>) -> bool {
        match self.repo.list_runs(user).await {
            Ok(runs) => runs.iter().any(|run| {
                run.source == ImportSource::Notion && run.status == RunStatus::Dismissed
            }),
            Err(error) => {
                tracing::warn!(error = ?error, "could not read the notion run");
                false
            }
        }
    }

    /// Keep the run (and any claimed rows) fresh while a job runs; stops
    /// when dropped.
    fn run_heartbeat(
        &self,
        user: &MacroUserIdStr<'static>,
        status: RunStatus,
        claimed: Vec<Uuid>,
    ) -> AbortOnDrop {
        let repo = self.repo.clone();
        let user = user.clone();
        AbortOnDrop(tokio::spawn(async move {
            loop {
                tokio::time::sleep(IMPORT_HEARTBEAT).await;
                let _ = repo
                    .transition_run(&user, ImportSource::Notion, &[status], status, None)
                    .await;
                if !claimed.is_empty() {
                    let _ = repo.touch_importing(&user, &claimed).await;
                }
            }
        }))
    }
}

/// A failure as the user reads it on the run or the row.
fn failure_text(error: &ImportError) -> String {
    match error {
        ImportError::Other(error) => super::admission::failure_reason(error),
        other => other.to_string(),
    }
}

/// Summarize the ledger for the current plan: the rows tied to the newest
/// review, plus staged rows not yet tied to one.
pub(super) fn report(
    run: Option<&crate::domain::models::ImportRun>,
    rows: &[ImportEntity],
) -> NotionImportReport {
    let planned: Vec<(&ImportEntity, NotionDocMeta)> = rows
        .iter()
        .filter_map(|row| {
            let meta: NotionDocMeta = serde_json::from_value(row.metadata.clone()).ok()?;
            meta.plan.as_ref()?;
            Some((row, meta))
        })
        .collect();
    let review_id = planned
        .iter()
        .filter(|(row, _)| row.review_id.is_some())
        .max_by_key(|(row, _)| row.updated_at)
        .and_then(|(row, _)| row.review_id);
    let current: Vec<&(&ImportEntity, NotionDocMeta)> = planned
        .iter()
        .filter(|(row, _)| match review_id {
            Some(review) => {
                row.review_id == Some(review)
                    || (row.review_id.is_none() && row.status == ImportStatus::Staged)
            }
            None => true,
        })
        .collect();

    let mut report = NotionImportReport {
        status: run.map(|run| run.status),
        error: run.and_then(|run| run.error.clone()),
        review_id,
        ..NotionImportReport::default()
    };
    for (row, meta) in &current {
        let Some(plan) = &meta.plan else { continue };
        match row.kind {
            ImportKind::DataSource => report.data_sources += 1,
            _ => report.pages += 1,
        }
        match plan.decision {
            NotionDecision::Copy => report.copy += 1,
            NotionDecision::Tasks => report.tasks += 1,
            NotionDecision::Skip => report.skip += 1,
            NotionDecision::Hand => report.hand += 1,
        }
        let reported = || NotionReportItem {
            import_id: row.id,
            title: meta.title.clone(),
            kind: row.kind,
            url: meta.url.clone(),
            reason: plan.reason.clone(),
        };
        match row.status {
            ImportStatus::Imported => report.imported += 1,
            ImportStatus::Importing => report.writing += 1,
            ImportStatus::Staged => {
                if plan.decision == NotionDecision::Hand {
                    if report.hand_items.len() < REPORT_LIST_LIMIT {
                        report.hand_items.push(reported());
                    }
                } else if plan.decision != NotionDecision::Skip {
                    report.waiting += 1;
                }
                if let Some(error) = &row.last_error
                    && report.failures.len() < REPORT_LIST_LIMIT
                {
                    report.failures.push(NotionReportItem {
                        reason: Some(error.clone()),
                        ..reported()
                    });
                }
            }
            ImportStatus::Discarded => {}
        }
    }
    report
}
