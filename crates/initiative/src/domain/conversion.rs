//! Turning a task into the project that replaces it.

use entity_access::domain::models::{EntityAccessReceipt, OwnerAccessLevel};
use macro_user_id::user_id::MacroUserIdStr;

use super::{
    models::{InitialPropertyValue, InitiativeId},
    resources::ResourceFuture,
};

/// What a task carries into the project made from it.
#[derive(Clone, PartialEq)]
pub struct ConvertibleTask {
    /// The task's title, before project name rules apply.
    pub name: String,
    /// The task body's full Loro state, which seeds the project description as is.
    pub description: Vec<u8>,
    /// The task's property values a project accepts.
    pub property_values: Vec<InitialPropertyValue>,
    /// The task's subtasks, which become the project's tasks.
    pub subtask_ids: Vec<String>,
}

/// Lengths only: task content stays out of logs.
impl std::fmt::Debug for ConvertibleTask {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ConvertibleTask")
            .field("description_len", &self.description.len())
            .field("property_values", &self.property_values.len())
            .field("subtask_ids", &self.subtask_ids.len())
            .finish()
    }
}

/// The task-side steps of a conversion, supplied by the composition root. The task
/// owner's capability authorizes every step; implementations delegate to the
/// owning domains.
pub trait TaskConversions: std::fmt::Debug + Send + Sync + 'static {
    /// Read a live task. Anything that is not a live task is a bad request.
    fn read(
        &self,
        task: &EntityAccessReceipt<OwnerAccessLevel>,
    ) -> ResourceFuture<'_, ConvertibleTask>;
    /// Move every comment on the task to the initiative, all or nothing.
    fn move_discussions(
        &self,
        task: &EntityAccessReceipt<OwnerAccessLevel>,
        initiative: InitiativeId,
    ) -> ResourceFuture<'_, ()>;
    /// Put each subtask the owner can edit into the initiative. Best effort: a subtask
    /// that cannot move keeps its place, and the rest still move.
    fn adopt_subtasks(
        &self,
        owner: MacroUserIdStr<'static>,
        subtask_ids: Vec<String>,
        initiative: InitiativeId,
    ) -> ResourceFuture<'_, ()>;
    /// Move the converted task to the trash.
    fn retire(&self, task: EntityAccessReceipt<OwnerAccessLevel>) -> ResourceFuture<'_, ()>;
}
