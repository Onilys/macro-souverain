use crate::api::context::{ApiContext, AuthorizationService};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use email::domain::forwarded_attachments::ForwardedAttachmentError;
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use model::response::ErrorResponse;
use models_email::service::link::Link;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
#[error(transparent)]
pub struct AddForwardedAttachmentError(#[from] ForwardedAttachmentError);

impl IntoResponse for AddForwardedAttachmentError {
    fn into_response(self) -> Response {
        let status_code = match &self.0 {
            ForwardedAttachmentError::DraftNotFound
            | ForwardedAttachmentError::AttachmentNotFound => StatusCode::NOT_FOUND,
            ForwardedAttachmentError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (
            status_code,
            Json(ErrorResponse {
                message: self.to_string().into(),
            }),
        )
            .into_response()
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, IntoParams)]
pub struct PathParams {
    /// The ID of the draft to add the forwarded attachment to.
    pub id: Uuid,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct AddForwardedAttachmentRequest {
    /// The ID of the original attachment to forward.
    pub attachment_id: Uuid,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct AddForwardedAttachmentResponse {
    /// The ID of the original attachment.
    pub attachment_id: Uuid,
    /// Original file name of the attachment.
    pub filename: Option<String>,
    /// MIME type of the attachment.
    pub mime_type: Option<String>,
    /// File size in bytes.
    pub size_bytes: Option<i64>,
}

/// Add a forwarded attachment to a draft.
#[utoipa::path(
    post,
    tag = "Drafts",
    path = "/email/drafts/{id}/forwarded-attachments",
    operation_id = "add_forwarded_attachment",
    params(PathParams),
    request_body = AddForwardedAttachmentRequest,
    responses(
        (status = 201, body = AddForwardedAttachmentResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, authorization, link), fields(link_id = %link.id), err)]
pub async fn handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    link: Extension<Link>,
    Path(PathParams { id: draft_id }): Path<PathParams>,
    Json(req): Json<AddForwardedAttachmentRequest>,
) -> Result<(StatusCode, Json<AddForwardedAttachmentResponse>), AddForwardedAttachmentError> {
    let attachment = ctx
        .forwarded_attachments
        .add(
            &authorization.authorization.user.macro_user_id,
            link.id,
            draft_id,
            req.attachment_id,
        )
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(AddForwardedAttachmentResponse {
            attachment_id: attachment.db_id,
            filename: attachment.filename,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
        }),
    ))
}
