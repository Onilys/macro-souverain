use axum::{Json, Router, http::StatusCode, response::IntoResponse, routing::get};
use model::response::EmptyResponse;

/// Health check
#[utoipa::path(
        get,
        tag = "Health",
        path = "/health",
        responses(
            (status = 200, description = "Health", body = EmptyResponse),
        )
    )]
pub async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, Json(EmptyResponse::default()))
}

pub fn router() -> Router {
    Router::new().route("/health", get(health_handler))
}
