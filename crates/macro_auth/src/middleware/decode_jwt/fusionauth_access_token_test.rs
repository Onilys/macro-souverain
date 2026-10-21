use super::*;
use crate::macro_api_token::{EncodeMacroApiTokenArgs, encode_macro_api_token};

#[test]
fn token_without_macro_claims_is_recognized_as_issued_for_this_application() {
    let args = JwtValidationArgs {
        audience: Audience::new_testing("macro-app"),
        issuer: Issuer::new_testing("auth.macro.test"),
        jwt_secret: LocalOrRemoteSecret::Local(JwtSecretKey::new_testing("fusionauth-secret")),
        macro_api_token_issuer: MacroApiTokenIssuer::new_testing(""),
        macro_api_token_public_key: LocalOrRemoteSecret::Local(
            MacroApiTokenPublicKey::new_testing(""),
        ),
    };
    let mut header = jsonwebtoken::Header::new(Algorithm::HS256);
    header.kid = Some("fusionauth-key".into());
    let key = jsonwebtoken::EncodingKey::from_secret(b"fusionauth-secret");
    let unexpired = jsonwebtoken::encode(
        &header,
        &serde_json::json!({
            "aud": "macro-app", "exp": 4102444800_u64, "iss": "auth.macro.test",
            "sub": "fusion-user", "tid": "tenant", "email": "user@example.com",
            "applicationId": "macro-app", "roles": [],
        }),
        &key,
    )
    .unwrap();
    let expired = jsonwebtoken::encode(
        &header,
        &serde_json::json!({
            "aud": "macro-app", "exp": 1700000000_u64, "iss": "auth.macro.test",
            "sub": "fusion-user", "tid": "tenant", "email": "user@example.com",
            "applicationId": "macro-app", "roles": [],
        }),
        &key,
    )
    .unwrap();

    assert!(matches!(
        validate_macro_access_token(&unexpired, &args),
        Err(MacroAuthError::JwtValidationFailed { .. })
    ));
    assert!(validate_fusionauth_access_token_allow_expired(&unexpired, &args).is_ok());
    assert!(validate_fusionauth_access_token_allow_expired(&expired, &args).is_ok());
}

#[test]
fn tokens_not_issued_by_fusionauth_for_this_application_are_rejected() {
    let args = JwtValidationArgs {
        audience: Audience::new_testing("macro-app"),
        issuer: Issuer::new_testing("auth.macro.test"),
        jwt_secret: LocalOrRemoteSecret::Local(JwtSecretKey::new_testing("fusionauth-secret")),
        macro_api_token_issuer: MacroApiTokenIssuer::new_testing("macro-api.test"),
        macro_api_token_public_key: LocalOrRemoteSecret::Local(
            MacroApiTokenPublicKey::new_testing(tests::PUBLIC_KEY),
        ),
    };
    let mut header = jsonwebtoken::Header::new(Algorithm::HS256);
    header.kid = Some("fusionauth-key".into());
    let cases = [
        (
            "other-secret",
            serde_json::json!({"aud": "macro-app", "exp": 4102444800_u64, "iss": "auth.macro.test"}),
        ),
        (
            "fusionauth-secret",
            serde_json::json!({"aud": "other-app", "exp": 4102444800_u64, "iss": "auth.macro.test"}),
        ),
        (
            "fusionauth-secret",
            serde_json::json!({"aud": "macro-app", "exp": 4102444800_u64}),
        ),
        (
            "fusionauth-secret",
            serde_json::json!({"exp": 4102444800_u64, "iss": "auth.macro.test"}),
        ),
    ];

    for (secret, claims) in cases {
        let token = jsonwebtoken::encode(
            &header,
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();
        assert!(
            validate_fusionauth_access_token_allow_expired(&token, &args).is_err(),
            "{secret} {claims}"
        );
    }

    let macro_api_token = encode_macro_api_token(EncodeMacroApiTokenArgs {
        fusionauth_id: "fusion-user".into(),
        macro_user_id: "macro|user@example.com".into(),
        organization_id: None,
        issuer: "macro-api.test".into(),
        private_key: tests::PRIVATE_KEY.into(),
        expiry_seconds: 60,
        agent_id: None,
    })
    .unwrap();
    assert!(validate_fusionauth_access_token_allow_expired(&macro_api_token, &args).is_err());
}
