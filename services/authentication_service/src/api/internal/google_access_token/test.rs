use super::*;
use fusionauth::error::GenericErrorResponse;

fn status(e: FusionAuthClientError) -> StatusCode {
    links_error_response(e, "fa-user", "idp", "google_gmail").status()
}

#[test]
fn deleted_fusionauth_user_is_a_missing_link() {
    assert_eq!(
        status(FusionAuthClientError::UserDoesNotExist),
        StatusCode::NOT_FOUND
    );
}

#[test]
fn other_link_lookup_failures_stay_server_errors() {
    let e = FusionAuthClientError::Generic(GenericErrorResponse {
        message: "unknown error".to_string(),
    });

    assert_eq!(status(e), StatusCode::INTERNAL_SERVER_ERROR);
}
