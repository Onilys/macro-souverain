//! Explicit Platform registration. Exchanged credentials are already encrypted in
//! the connection before this use case can start. No PIN enters durable state.
use super::*;

impl MetaService {
    /// Reconcile first, and make at most one user-authorized registration attempt.
    #[tracing::instrument(skip_all, fields(connection_id=%id), err)]
    pub async fn register_phone(
        &self,
        access: &EntityAccessReceipt<MemberTeamRole>,
        id: Uuid,
        request: RegisterPhone,
    ) -> PortResult<Connection> {
        let (team, user) = team_actor(access)?;
        let c = self.team_connection(team, id).await?;
        self.require_manager(&c, user).await?;
        let _guard = self
            .repository
            .lock_subscription(&c)
            .await?
            .ok_or(MessagingError::Unavailable)?;
        let c = self.team_connection(team, id).await?;
        self.require_manager(&c, user).await?;
        self.native.require_member(team, &c.user_id).await?;
        if c.whatsapp_mode != Some(WhatsappMode::Platform) || c.developer_account {
            return Err(MessagingError::Invalid(
                "this account does not use Platform number registration",
            )
            .into());
        }
        let token = self.token(&c).await?;
        if self.reconcile_registration(&c, &token).await? {
            self.provider.subscribe(&c, &token).await?;
            self.repository
                .health(&c, ConnectionStatus::Connected, None)
                .await?;
            return self.team_connection(team, id).await;
        }
        if c.registration_status == Some(RegistrationStatus::Unconfirmed) {
            return self.team_connection(team, id).await;
        }
        if c.registration_status == Some(RegistrationStatus::RateLimited)
            && c.registration_attempted_at
                .is_none_or(|at| Utc::now() < at + Duration::hours(72))
        {
            return self.team_connection(team, id).await;
        }
        let Some(pin) = request.pin else {
            return self.team_connection(team, id).await;
        };
        // Mark before POST: a crash after acceptance can only reconcile, never replay.
        self.repository
            .registration_state(
                &c,
                RegistrationStatus::Unconfirmed,
                Some("registration_unconfirmed"),
            )
            .await?;
        match self.provider.register_whatsapp(&c, &token, &pin).await {
            RegistrationResult::Accepted | RegistrationResult::Unknown => {
                // A failed GET leaves the durable Unconfirmed marker for maintenance.
                if self
                    .reconcile_registration(&self.team_connection(team, id).await?, &token)
                    .await?
                {
                    self.provider.subscribe(&c, &token).await?;
                    self.repository
                        .health(&c, ConnectionStatus::Connected, None)
                        .await?;
                }
            }
            RegistrationResult::Rejected(reason) => {
                let status = if matches!(reason, RegistrationFailure::RateLimited) {
                    RegistrationStatus::RateLimited
                } else {
                    RegistrationStatus::Required
                };
                self.repository
                    .registration_state(&c, status, Some(reason.code()))
                    .await?;
            }
        }
        self.team_connection(team, id).await
    }

    pub(super) async fn reconcile_registration(
        &self,
        c: &Connection,
        token: &AccessToken,
    ) -> PortResult<bool> {
        if c.whatsapp_mode != Some(WhatsappMode::Platform) {
            return Ok(true);
        }
        let registered = self.provider.whatsapp_registered(c, token).await?;
        if registered {
            self.repository
                .registration_state(c, RegistrationStatus::Registered, None)
                .await?;
        } else {
            let state = match c.registration_status {
                Some(RegistrationStatus::Unconfirmed) => RegistrationStatus::Unconfirmed,
                Some(RegistrationStatus::RateLimited) => RegistrationStatus::RateLimited,
                _ => RegistrationStatus::Required,
            };
            let code = match state {
                RegistrationStatus::Unconfirmed => Some("registration_unconfirmed"),
                RegistrationStatus::RateLimited => Some("registration_rate_limited"),
                _ => c
                    .health_error
                    .as_deref()
                    .filter(|c| c.starts_with("registration_"))
                    .or(Some("registration_required")),
            };
            self.repository.registration_state(c, state, code).await?;
        }
        Ok(registered)
    }
}
