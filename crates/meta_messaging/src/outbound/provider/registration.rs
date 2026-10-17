//! Official Cloud API number registration and server-side readiness verification.
use super::*;

impl HttpMetaProvider {
    #[tracing::instrument(skip_all, fields(connection_id=%c.id), err)]
    pub(super) async fn whatsapp_registered_impl(
        &self,
        c: &Connection,
        token: &AccessToken,
    ) -> PortResult<bool> {
        let phone = self
            .graph(
                Provider::Whatsapp,
                token,
                Method::GET,
                &[c.account_id.as_str()],
                &[("fields", "id,is_on_biz_app,platform_type,status")],
                None,
            )
            .await?;
        if phone["id"].as_str() != Some(c.account_id.as_str())
            || phone["is_on_biz_app"] != false
            || phone["platform_type"] != "CLOUD_API"
        {
            return Err(MessagingError::ProviderRejected.into());
        }
        let status = required(&phone, "status")?;
        Ok(status == "CONNECTED")
    }

    #[tracing::instrument(skip_all, fields(connection_id=%c.id))]
    pub(super) async fn register_whatsapp_impl(
        &self,
        c: &Connection,
        token: &AccessToken,
        pin: &RegistrationPin,
    ) -> RegistrationResult {
        let response = match self
            .client
            .post(self.endpoint(Provider::Whatsapp, &[c.account_id.as_str(), "register"]))
            .bearer_auth(token.expose())
            .json(&json!({"messaging_product":"whatsapp","pin":pin.expose()}))
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => return RegistrationResult::Unknown,
        };
        let status = response.status();
        let bytes = match bounded_bytes(response, 1024 * 1024).await {
            Ok(bytes) => bytes,
            Err(_) => return RegistrationResult::Unknown,
        };
        let body: Value = match serde_json::from_slice(&bytes) {
            Ok(body) => body,
            Err(_) => return RegistrationResult::Unknown,
        };
        if status.is_server_error() {
            return RegistrationResult::Unknown;
        }
        if status.is_success() && body["success"] == true {
            return RegistrationResult::Accepted;
        }
        if !status.is_success() || body.get("error").is_some() {
            return RegistrationResult::Rejected(match body["error"]["code"].as_i64() {
                Some(133005) => RegistrationFailure::IncorrectPin,
                Some(133006) => RegistrationFailure::PinAttemptsExceeded,
                Some(133016) => RegistrationFailure::RateLimited,
                _ => RegistrationFailure::Rejected,
            });
        }
        RegistrationResult::Unknown
    }
}
