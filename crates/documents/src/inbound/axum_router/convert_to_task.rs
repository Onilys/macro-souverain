//! Handler for `POST /documents/{document_id}/convert_to_task`.

use axum::{
    Extension, Json,
    extract::{Path, State},
};
use entity_access::domain::ports::EntityAccessService;
use entity_access::inbound::axum_extractors::DocumentAccessExtractor;
use entity_registry::CreationPrincipalExtractor;
use macro_authorization::MacroAuthorizationService;
use model::document::DocumentBasic;
use models_permissions::share_permission::access_level::EditAccessLevel;

use super::{DocumentRouterState, Params};
use crate::domain::models::{ConvertToTaskResponse, DocumentError};
use crate::domain::ports::DocumentService;

/// Handler for `POST /documents/{document_id}/convert_to_task`.
///
/// Turns a markdown document into a task in place, keeping its id, content and
/// sharing. Requires edit access to the document.
#[utoipa::path(
    tag = "document",
    post,
    path = "/documents/{document_id}/convert_to_task",
    operation_id = "convert_document_to_task",
    params(
        ("document_id" = String, Path, description = "Document ID")
    ),
    responses(
        (status = 200, body = ConvertToTaskResponse),
        (status = 400, body = model_error_response::ErrorResponse),
        (status = 401, body = model_error_response::ErrorResponse),
        (status = 404, body = model_error_response::ErrorResponse),
        (status = 409, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    )
)]
#[tracing::instrument(err, skip(state, access, document_context, principal))]
pub async fn convert_to_task_handler<
    T: DocumentService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    CreationPrincipalExtractor { principal, .. }: CreationPrincipalExtractor<Auth>,
    access: DocumentAccessExtractor<EditAccessLevel, Svc, Auth>,
    State(state): State<DocumentRouterState<T, Svc, Auth>>,
    document_context: Extension<DocumentBasic>,
    Path(Params { document_id }): Path<Params>,
) -> Result<Json<ConvertToTaskResponse>, DocumentError> {
    let response = state
        .service
        .convert_to_task(access.entity_access_receipt, document_context.0, &principal)
        .await?;
    Ok(Json(response))
}
