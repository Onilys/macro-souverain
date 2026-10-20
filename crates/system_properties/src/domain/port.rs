//! Port definitions for system properties.
//!
//! These traits define the interfaces that the domain layer uses.
//! Implementations live in the outbound module.

use uuid::Uuid;

use crate::{StatusOption, domain::model::SystemPropertyError};

/// Repository trait for system property database operations.
///
/// This trait abstracts the database layer, allowing for different implementations
/// (e.g., PostgreSQL, mock for testing).
pub trait SystemPropertiesRepository: Clone + Send + Sync + 'static {
    /// Bulk upsert property rows in a single query.
    fn bulk_upsert_properties(
        &self,
        rows: Vec<crate::domain::model::PropertyRow>,
    ) -> impl Future<Output = Result<(), SystemPropertyError>> + Send;

    /// Insert property rows, leaving any existing values unchanged.
    fn bulk_insert_properties_if_absent(
        &self,
        rows: Vec<crate::domain::model::PropertyRow>,
    ) -> impl Future<Output = Result<(), SystemPropertyError>> + Send;

    /// Copy all task properties from one entity to another.
    fn copy_task_properties(
        &self,
        from_task_id: &str,
        to_task_id: &str,
    ) -> impl Future<Output = Result<(), SystemPropertyError>> + Send;

    /// Rekey an entity's document property rows as task rows, keeping their
    /// values, and return every task property definition of the entity that
    /// now holds a value. A task row already present for a definition wins.
    fn rekey_document_properties_as_task(
        &self,
        entity_id: &str,
    ) -> impl Future<Output = Result<Vec<Uuid>, SystemPropertyError>> + Send;

    /// Updates the task to have the provided status
    fn update_task_status(
        &self,
        task_id: &str,
        status: StatusOption,
    ) -> impl Future<Output = Result<(), SystemPropertyError>> + Send;

    /// Tasks whose Project property names `project_id`, in id order.
    fn project_task_ids(
        &self,
        project_id: Uuid,
    ) -> impl Future<Output = Result<Vec<String>, SystemPropertyError>> + Send;

    /// The project each listed task's Project property names, as raw ids;
    /// tasks without a project are absent.
    fn task_projects(
        &self,
        task_ids: &[String],
    ) -> impl Future<Output = Result<Vec<(String, String)>, SystemPropertyError>> + Send;
}
