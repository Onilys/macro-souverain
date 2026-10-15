use axum::{Router, routing::get};

/// Health check
#[utoipa::path(
        get,
        path = "/health",
        responses(
            (status = 200, description = "health", body = String),
        )
    )]
pub async fn health_handler() -> String {
    "healthy".to_string()
}

pub fn router<S>() -> Router<S>
where
    S: Send + Sync + Clone + 'static,
{
    Router::new().route("/health", get(health_handler))
}
