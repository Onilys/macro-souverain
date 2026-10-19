//! Moving a whole discussion when one entity replaces another.

use super::{
    models::{DocumentId, MessageParent},
    ports::{DiscussionTransferRepository, MessageError},
};
use entity_access::domain::models::{EntityAccessReceipt, EntityType, OwnerAccessLevel};
use uuid::Uuid;

#[cfg(test)]
mod test;

/// Moves a task's comments to the project that replaces it.
pub struct DiscussionTransferService<R> {
    repo: R,
}

impl<R: DiscussionTransferRepository> DiscussionTransferService<R> {
    /// Compose the transfer over its repository.
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    /// Move every comment thread on the task to the initiative, as general project
    /// discussion: inline anchors are detached, since a project has no document to
    /// anchor them in. Only the task's owner may move its comments, and the caller
    /// must have created or authorized the initiative.
    pub async fn move_task_discussions_to_initiative(
        &self,
        task: &EntityAccessReceipt<OwnerAccessLevel>,
        initiative: Uuid,
    ) -> Result<u64, MessageError> {
        if task.entity().entity_type != EntityType::Document {
            return Err(MessageError::Invalid("requires a task access receipt"));
        }
        let task = DocumentId::try_from(task.entity().entity_id.to_string())
            .map_err(|_| MessageError::Invalid("invalid task id"))?;
        self.repo
            .move_discussions(
                &MessageParent::Document(task),
                &MessageParent::Initiative(initiative),
            )
            .await
    }
}
