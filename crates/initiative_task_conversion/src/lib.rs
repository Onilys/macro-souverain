//! Adapter that gives the initiative domain the task-side steps of turning a task
//! into a project, composed from the domains that own each part of a task.

#![deny(missing_docs)]

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use document_sub_type::DocumentSubType;
use documents::domain::models::DocumentError;
use documents::domain::ports::DocumentService;
use entity_access::domain::models::{
    EditAccessLevel, EntityAccessReceipt, EntityType, OwnerAccessLevel, ViewAccessLevel,
};
use entity_access::domain::ports::EntityAccessService;
use entity_mutation::TrashEntity;
use initiative::domain::conversion::{ConvertibleTask, TaskConversions};
use initiative::domain::models::{InitiativeError, InitiativeId};
use initiative::domain::resources::ResourceFuture;
use macro_sync_service_jwt::{DocumentPermissionToken, ISSUER};
use macro_user_id::user_id::MacroUserIdStr;
use messages::domain::ports::{DiscussionTransferRepository, MessageError};
use messages::domain::transfer::DiscussionTransferService;
use model::document::DocumentPermissionsToken;
use models_permissions::share_permission::access_level::AccessLevel;
use models_properties::EntityReference;
use models_properties::api::requests::SetPropertyValue;
use properties::PropertiesService;
use sync_service_client::SyncServiceClient;
use sync_service_client::document_state::DocumentStateError;
use system_properties::SystemPropertyKey;

mod carried;

#[cfg(test)]
mod test;

/// Task conversions over the documents, properties, messages and access domains. The
/// task body is read from sync-service with a short-lived service grant.
pub struct TaskConversionAdapter<D, P, A, M> {
    documents: Arc<D>,
    properties: Arc<P>,
    access: Arc<A>,
    discussions: DiscussionTransferService<M>,
    sync: SyncServiceClient,
    document_permission_jwt_secret: String,
}

impl<D, P, A, M> std::fmt::Debug for TaskConversionAdapter<D, P, A, M> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TaskConversionAdapter")
    }
}

impl<D, P, A, M: DiscussionTransferRepository> TaskConversionAdapter<D, P, A, M> {
    /// Compose the adapter from the application's owning services.
    pub fn new(
        documents: Arc<D>,
        properties: Arc<P>,
        access: Arc<A>,
        discussions: M,
        sync: SyncServiceClient,
        document_permission_jwt_secret: String,
    ) -> Self {
        Self {
            documents,
            properties,
            access,
            discussions: DiscussionTransferService::new(discussions),
            sync,
            document_permission_jwt_secret,
        }
    }
}

impl<D, P, A, M> TaskConversionAdapter<D, P, A, M> {
    /// The task's live Loro state; empty for a task whose body was never written.
    async fn task_body(&self, task_id: &str) -> Result<Vec<u8>, InitiativeError> {
        let token = service_view_token(task_id, &self.document_permission_jwt_secret)?;
        match self.sync.document_state(task_id, &token).await {
            Ok(state) => Ok(state.snapshot),
            Err(DocumentStateError::NotFound) => Ok(Vec::new()),
            Err(error) => Err(internal(error)),
        }
    }
}

impl<D, P, A, M> TaskConversions for TaskConversionAdapter<D, P, A, M>
where
    D: DocumentService + TrashEntity<Receipt = OwnerAccessLevel> + Send + Sync + 'static,
    P: PropertiesService,
    A: EntityAccessService,
    M: DiscussionTransferRepository,
{
    fn read(
        &self,
        task: &EntityAccessReceipt<OwnerAccessLevel>,
    ) -> ResourceFuture<'_, ConvertibleTask> {
        let task = task.clone();
        Box::pin(async move {
            let task_id = task.entity().entity_id.clone();
            let basic = self
                .documents
                .internal_get_basic_document(&task_id)
                .await
                .map_err(document_error)?;
            if basic.sub_type != Some(DocumentSubType::Task) || basic.deleted_at.is_some() {
                return Err(InitiativeError::BadRequest(
                    "only a task can become a project".to_string(),
                ));
            }
            let view: EntityAccessReceipt<ViewAccessLevel> = task
                .try_into_requirement()
                .map_err(|_| InitiativeError::Unauthorized)?;
            let properties = self
                .properties
                .get_entity_properties(&view)
                .await
                .map_err(internal)?;
            let description = self.task_body(&task_id).await?;
            Ok(ConvertibleTask {
                name: basic.document_name,
                description,
                subtask_ids: carried::subtask_ids(&properties),
                property_values: carried::project_values(properties),
            })
        })
    }

    fn move_discussions(
        &self,
        task: &EntityAccessReceipt<OwnerAccessLevel>,
        initiative: InitiativeId,
    ) -> ResourceFuture<'_, ()> {
        let task = task.clone();
        Box::pin(async move {
            let moved = self
                .discussions
                .move_task_discussions_to_initiative(&task, initiative.as_uuid())
                .await
                .map_err(message_error)?;
            tracing::info!(moved, %initiative, "moved converted task's discussions");
            Ok(())
        })
    }

    fn adopt_subtasks(
        &self,
        owner: MacroUserIdStr<'static>,
        subtask_ids: Vec<String>,
        initiative: InitiativeId,
    ) -> ResourceFuture<'_, ()> {
        Box::pin(async move {
            let project = SetPropertyValue::EntityReference {
                reference: EntityReference::new(
                    initiative.to_string(),
                    models_properties::EntityType::Initiative,
                ),
            };
            for subtask in subtask_ids {
                let receipt = match self
                    .access
                    .generate_entity_access_receipt::<EditAccessLevel>(
                        &owner,
                        None,
                        &subtask,
                        EntityType::Document,
                    )
                    .await
                {
                    Ok(receipt) => receipt,
                    // A subtask the owner cannot edit keeps its place.
                    Err(_) => continue,
                };
                if let Err(error) = self
                    .properties
                    .set_entity_property(
                        &receipt,
                        SystemPropertyKey::PROJECT_UUID,
                        Some(project.clone()),
                    )
                    .await
                {
                    tracing::warn!(?error, %subtask, %initiative, "subtask did not join the converted project");
                    continue;
                }
                // Its parent is going to the trash; the project now groups it.
                if let Err(error) = self
                    .properties
                    .set_entity_property(&receipt, SystemPropertyKey::PARENT_TASK_UUID, None)
                    .await
                {
                    tracing::warn!(?error, %subtask, "subtask kept its converted parent");
                }
            }
            Ok(())
        })
    }

    fn retire(&self, task: EntityAccessReceipt<OwnerAccessLevel>) -> ResourceFuture<'_, ()> {
        Box::pin(async move {
            let entity = model_entity::EntityType::Document
                .with_entity_string(task.entity().entity_id.clone());
            self.documents
                .trash_entity(entity, task)
                .await
                .map(|_| ())
                .map_err(|code| internal(format!("task trash failed: {code:?}")))
        })
    }
}

/// Lifetime of the service grant: one sync-service read.
const SERVICE_TOKEN_TTL_SECS: usize = 60;

/// A read-only sync-service grant for the task on behalf of the service itself: it
/// impersonates no one. Never handed to a caller.
fn service_view_token(
    task_id: &str,
    jwt_secret: &str,
) -> Result<DocumentPermissionToken, InitiativeError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(internal)?
        .as_secs() as usize;
    macro_sync_service_jwt::encode(
        &DocumentPermissionsToken {
            user_id: None,
            document_id: task_id.to_string(),
            access_level: AccessLevel::View,
            exp: now + SERVICE_TOKEN_TTL_SECS,
            iss: ISSUER.to_string(),
        },
        jwt_secret,
    )
    .map_err(internal)
}

fn document_error(error: DocumentError) -> InitiativeError {
    match error {
        DocumentError::NotFound(_) | DocumentError::Gone => InitiativeError::NotFound,
        DocumentError::Unauthorized => InitiativeError::Unauthorized,
        error => internal(error),
    }
}

fn message_error(error: MessageError) -> InitiativeError {
    match error {
        MessageError::Invalid(message) => InitiativeError::BadRequest(message.to_string()),
        MessageError::Forbidden => InitiativeError::Unauthorized,
        error => internal(error),
    }
}

fn internal(error: impl std::fmt::Debug) -> InitiativeError {
    InitiativeError::Internal(rootcause::report!("{error:?}"))
}
