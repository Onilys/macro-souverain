use axum::{
    Json,
    extract::{self, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use fusionauth::FusionAuthClient;
use fusionauth::error::FusionAuthClientError;
use macro_authorization::{InternalOnly, MacroAuthorizationExtractor};
use model::authentication::google_token::GoogleAccessToken;
use model::response::ErrorResponse;
use std::sync::Arc;

use crate::api::context::AuthorizationService;

#[cfg(test)]
mod test;

#[derive(serde::Deserialize, Debug)]
pub struct GoogleAccessTokenParams {
    fusionauth_user_id: String,
    /// The linked Google account's email — what FusionAuth stores as
    /// `display_name` on the IdP link. Discriminates one Google account from
    /// another when the FA user has multiple Google IdP links.
    email: String,
}

/// Gets link between user and identity provider
#[tracing::instrument(skip(auth_client, _internal_authorization))]
pub async fn handler(
    State(auth_client): State<Arc<FusionAuthClient>>,
    _internal_authorization: MacroAuthorizationExtractor<AuthorizationService, InternalOnly>,
    extract::Query(params): extract::Query<GoogleAccessTokenParams>,
) -> Result<Response, Response> {
    get_access_token(auth_client, &params, "google_gmail").await
}

/// Fetches access token for a user from specified identity provider
#[tracing::instrument(skip(auth_client))]
async fn get_access_token(
    auth_client: Arc<FusionAuthClient>,
    params: &GoogleAccessTokenParams,
    identity_provider_name: &str,
) -> Result<Response, Response> {
    let fusionauth_user_id = params.fusionauth_user_id.as_str();
    let email = params.email.as_str();

    // get identity provider id
    let idp_id = auth_client
        .get_identity_provider_id_by_name(identity_provider_name)
        .await
        .map_err(|e| {
            // No Gmail identity provider configured (e.g. local / --no-doppler
            // stacks, or a deployment without the Google integration). This is
            // an expected "no grant" outcome, not a server fault: the email
            // service treats a 404 as NoGmailGrant and skips inbox init, while
            // a 500 would surface as a hard login failure.
            if matches!(e, FusionAuthClientError::NoIdentityProviderFound) {
                tracing::debug!(error=?e, "no {} identity provider configured", identity_provider_name);
                return no_link_response(identity_provider_name);
            }
            tracing::error!(error=?e, "unable to find idp id for {}", identity_provider_name);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    message: "unable to find idp".into(),
                }),
            )
                .into_response()
        })?;

    // get refresh token via link
    let links = auth_client
        .get_links(fusionauth_user_id, Some(idp_id.clone()))
        .await
        .map_err(|e| {
            links_error_response(e, fusionauth_user_id, &idp_id, identity_provider_name)
        })?;

    // a fusionauth user can have multiple links to the same identity provider with different email
    // addresses, but can only have one link with a given email
    let link = links
        .into_iter()
        .find(|l| l.display_name.as_str() == email)
        .ok_or_else(|| {
            // NOTE: this is going to be something we encounter a lot until users reauthenticate
            // their gmail so I'm downgrading to a debug to not overflow logs
            tracing::debug!(
                "link not found for user id {} and idp id {}",
                fusionauth_user_id,
                idp_id.as_str()
            );
            no_link_response(identity_provider_name)
        })?;

    // get access token using refresh token
    let token_response = auth_client
        .refresh_google_token(link.token.as_str())
        .await
        .map_err(|e| {
            let status_code = match &e {
                // A revoked or expired grant is an expected outcome the caller
                // handles by asking the user to reauthorize.
                FusionAuthClientError::InvalidGrant => {
                    tracing::warn!(error=?e, "refresh token rejected for userid {}", fusionauth_user_id);
                    StatusCode::FORBIDDEN
                }
                _ => {
                    tracing::error!(error=?e, "error fetching access token for userid {}", fusionauth_user_id);
                    StatusCode::INTERNAL_SERVER_ERROR
                }
            };
            let message = format!("unable to fetch {} access token", identity_provider_name);
            (status_code, Json(ErrorResponse { message: message.into() })).into_response()
        })?;

    Ok((
        StatusCode::OK,
        Json(GoogleAccessToken {
            access_token: token_response.access_token,
        }),
    )
        .into_response())
}

/// Callers treat a 404 as a missing grant and ask the user to reconnect.
fn no_link_response(identity_provider_name: &str) -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            message: format!("No {} link found for this user", identity_provider_name).into(),
        }),
    )
        .into_response()
}

fn links_error_response(
    e: FusionAuthClientError,
    fusionauth_user_id: &str,
    idp_id: &str,
    identity_provider_name: &str,
) -> Response {
    // A deleted FusionAuth user can't hold a grant, so it is a missing link
    // rather than a server fault.
    if matches!(e, FusionAuthClientError::UserDoesNotExist) {
        tracing::debug!("fusionauth user {} no longer exists", fusionauth_user_id);
        return no_link_response(identity_provider_name);
    }
    tracing::error!(error=?e, "error fetching links for userid {} and idp id {}", fusionauth_user_id, idp_id);
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            message: "unable to fetch links".into(),
        }),
    )
        .into_response()
}
