//! Writes a workspace import (folders, documents, tasks, databases) through
//! the same services the AI tools run on, as Macro AI for the user.

use crate::ToolEntityCreator;
use databases::domain::models::{CreateDatabase, DatabaseDetail, DatabaseId, OpBatch, Viewer};
use databases::domain::ports::DatabasesService as _;
use databases::domain::receipt::database_receipt;
use entity_access::domain::models::{EditAccessLevel, ViewAccessLevel};
use import::domain::ports::{
    ImportedDocumentProperties, ImportedTaskProperties, NewDatabase, TeamMember,
};
use macro_user_id::user_id::MacroUserIdStr;
use model::project::request::CreateProjectRequest;
use projects::domain::ports::ProjectService as _;
use uuid::Uuid;

#[cfg(test)]
mod test;

/// The import acts as Macro AI on the user's behalf, like the agent's tools.
fn viewer(user: &MacroUserIdStr<'static>) -> Viewer {
    Viewer {
        user_id: user.clone(),
        acting_bot: Some(bot_id::MACRO_AI_BOT_ID),
    }
}

/// The starter table a new database comes with and its title column, the
/// only column that table starts with.
fn new_database(detail: &DatabaseDetail) -> anyhow::Result<NewDatabase> {
    let database_id = *detail.database.id.as_uuid();
    let Some(table) = detail.tables.first() else {
        anyhow::bail!("new database {database_id} has no table");
    };
    let Some(title_column) = table.columns.first() else {
        anyhow::bail!("new database {database_id}'s starter table has no column");
    };
    Ok(NewDatabase {
        database_id,
        table: table.table.id,
        title_column: title_column.column.id,
    })
}

impl import::domain::ports::WorkspaceWriter for ToolEntityCreator {
    #[tracing::instrument(skip(self, user, name), err)]
    async fn create_folder(
        &self,
        user: &MacroUserIdStr<'static>,
        name: &str,
        parent: Option<Uuid>,
    ) -> anyhow::Result<Uuid> {
        // Mirrors the CreateProject tool: creating inside a parent requires
        // edit access to it.
        if let Some(parent) = parent {
            self.authorize_folder(user, parent).await?;
        }
        let project = self
            .project_service
            .create_project(
                &Self::creation_principal(user),
                CreateProjectRequest {
                    name: name.to_string(),
                    project_parent_id: parent,
                },
            )
            .await
            .map_err(|error| anyhow::anyhow!("failed to create imported folder: {error:?}"))?;
        Ok(project.id.parse()?)
    }

    #[tracing::instrument(skip(self, user, name, markdown, properties), err)]
    async fn create_document(
        &self,
        user: &MacroUserIdStr<'static>,
        name: &str,
        markdown: &str,
        properties: &ImportedDocumentProperties,
        folder: Option<Uuid>,
    ) -> anyhow::Result<String> {
        self.create_imported_document(user, name, markdown, properties, folder)
            .await
    }

    #[tracing::instrument(skip(self, user, name, markdown, properties), err)]
    async fn create_task(
        &self,
        user: &MacroUserIdStr<'static>,
        name: &str,
        markdown: &str,
        properties: &ImportedTaskProperties,
        folder: Option<Uuid>,
    ) -> anyhow::Result<String> {
        self.create_imported_task(user, name, markdown, properties, folder)
            .await
    }

    #[tracing::instrument(skip(self, user, name), err)]
    async fn create_database(
        &self,
        user: &MacroUserIdStr<'static>,
        name: &str,
    ) -> anyhow::Result<NewDatabase> {
        let viewer = viewer(user);
        let database = self
            .databases_service
            .create_database(CreateDatabase {
                name: name.to_string(),
                owner_id: user.clone(),
                acting_bot: viewer.acting_bot,
            })
            .await?;
        let receipt = database_receipt::<ViewAccessLevel, _>(
            self.entity_access_service.as_ref(),
            &viewer,
            database.id,
        )
        .await
        .map_err(|error| {
            anyhow::anyhow!("no view access to new database {}: {error:?}", database.id)
        })?;
        let detail = self.databases_service.get_database(receipt).await?;
        new_database(&detail)
    }

    #[tracing::instrument(skip(self, user, ops), fields(op_count = ops.len()), err)]
    async fn apply_database_ops(
        &self,
        user: &MacroUserIdStr<'static>,
        database_id: Uuid,
        ops: Vec<models_databases::DatabaseOp>,
    ) -> anyhow::Result<Vec<models_databases::OpResult>> {
        let viewer = viewer(user);
        let receipt = database_receipt::<EditAccessLevel, _>(
            self.entity_access_service.as_ref(),
            &viewer,
            DatabaseId::from_uuid(database_id),
        )
        .await
        .map_err(|error| anyhow::anyhow!("no edit access to database {database_id}: {error:?}"))?;
        Ok(self
            .databases_service
            .apply_ops(receipt, viewer, OpBatch::from(ops))
            .await?)
    }

    #[tracing::instrument(skip(self, user), err)]
    async fn team_members(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> anyhow::Result<Vec<TeamMember>> {
        let (_, roster) = self.team_roster(user).await;
        Ok(roster
            .into_iter()
            .map(|user_id| TeamMember {
                // User ids are lowercased when parsed, so their email is too.
                email: user_id.email_str().to_string(),
                user_id,
            })
            .collect())
    }
}
