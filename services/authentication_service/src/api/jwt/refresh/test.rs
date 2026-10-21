use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    extract::FromRef,
    http::{Request, StatusCode, header::AUTHORIZATION},
    routing::post,
};
use fusionauth::FusionAuthClient;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use macro_auth::{constant::MACRO_REFRESH_TOKEN_HEADER, middleware::decode_jwt::JwtValidationArgs};
use tower::{ServiceBuilder, ServiceExt};
use tower_cookies::CookieManagerLayer;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
};

use super::handler;
use crate::api::middleware::extract_tokens;

#[derive(Clone, FromRef)]
struct RefreshState {
    auth_client: Arc<FusionAuthClient>,
    jwt: JwtValidationArgs,
}

async fn post_refresh(fusionauth: &MockServer, access_token: &str) -> StatusCode {
    let auth_client = FusionAuthClient::new(
        "api-key".into(),
        "client-id".into(),
        "client-secret".into(),
        fusionauth.uri(),
        "http://localhost/oauth/redirect".into(),
        "google-client-id".into(),
        "google-client-secret".into(),
    );
    Router::new()
        .route(
            "/jwt/refresh",
            post(handler).layer(
                ServiceBuilder::new()
                    .layer(axum::middleware::from_fn(extract_tokens::handler))
                    .layer(CookieManagerLayer::new()),
            ),
        )
        .with_state(RefreshState {
            auth_client: Arc::new(auth_client),
            jwt: JwtValidationArgs::new_testing(),
        })
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/jwt/refresh")
                .header(AUTHORIZATION, format!("Bearer {access_token}"))
                .header(MACRO_REFRESH_TOKEN_HEADER, "refresh-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
        .status()
}

#[tokio::test]
async fn token_issued_without_macro_claims_is_refreshed() {
    let fusionauth = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/jwt/refresh"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "token": "new-access-token",
            "refreshToken": "new-refresh-token",
            "refreshTokenId": "refresh-token-id",
        })))
        .expect(1)
        .mount(&fusionauth)
        .await;
    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some("fusionauth-key".into());
    let access_token = encode(
        &header,
        &serde_json::json!({
            "aud": "", "exp": 4102444800_u64, "iss": "", "sub": "fusion-user",
            "tid": "tenant", "email": "user@example.com", "applicationId": "", "roles": [],
        }),
        &EncodingKey::from_secret(b""),
    )
    .unwrap();

    assert_eq!(
        post_refresh(&fusionauth, &access_token).await,
        StatusCode::OK
    );
}

#[tokio::test]
async fn token_signed_with_another_key_is_rejected_without_calling_fusionauth() {
    let fusionauth = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/jwt/refresh"))
        .respond_with(ResponseTemplate::new(200))
        .expect(0)
        .mount(&fusionauth)
        .await;
    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some("fusionauth-key".into());
    let access_token = encode(
        &header,
        &serde_json::json!({
            "aud": "", "exp": 4102444800_u64, "iss": "", "sub": "fusion-user",
            "tid": "tenant", "email": "user@example.com", "applicationId": "", "roles": [],
        }),
        &EncodingKey::from_secret(b"other-secret"),
    )
    .unwrap();

    assert_eq!(
        post_refresh(&fusionauth, &access_token).await,
        StatusCode::UNAUTHORIZED
    );
}
