//! Restart-safe execution. Lease-aware native commits and provider identities
//! arbitrate duplicates. History requires separate, explicit account consent.

use super::*;

#[derive(Clone, Copy)]
pub(super) enum IngestionLease<'a> {
    Receipt(&'a Lease),
    History(&'a Lease),
}

impl MetaService {
    async fn renew_ingestion(&self, lease: IngestionLease<'_>) -> PortResult<bool> {
        match lease {
            IngestionLease::Receipt(l) => self.repository.heartbeat_receipt(l).await,
            IngestionLease::History(l) => self.repository.heartbeat_history_import(l).await,
        }
    }
    pub(super) async fn ingest_message(
        &self,
        connection: &Connection,
        message: &mut IncomingMessage,
        lease: IngestionLease<'_>,
    ) -> PortResult<()> {
        if !self.renew_ingestion(lease).await? {
            return Err(MessagingError::Conflict.into());
        }
        if connection.provider == Provider::Instagram
            && message.direction == Direction::Inbound
            && message.message_type != "deleted"
        {
            let cached = self
                .repository
                .customer_profile(connection.id, &message.customer_id)
                .await?;
            let profile = match cached {
                Some(profile) if profile.name.is_some() || profile.handle.is_some() => profile,
                _ => match self.token(connection).await {
                    Ok(token) => self
                        .provider
                        .customer_profile(connection, &token, &message.customer_id)
                        .await
                        .unwrap_or_default(),
                    Err(_) => CustomerProfile::default(),
                },
            };
            message.author_name = profile
                .name
                .or_else(|| profile.handle.as_ref().map(|h| format!("@{h}")))
                .or_else(|| message.author_name.take());
            message.author_handle = profile.handle.or_else(|| message.author_handle.take());
        }
        self.native.ingest(connection, message, vec![]).await?;
        if !message.media.is_empty()
            && !self
                .repository
                .media_stored(connection.id, &message.message_id)
                .await?
        {
            let result: PortResult<()> = async {
                let token = self.token(connection).await?;
                let mut media = Vec::new();
                let mut total = 0_usize;
                let mut download_error = None;
                for source in &message.media {
                    if !self.renew_ingestion(lease).await? {
                        return Err(MessagingError::Conflict.into());
                    }
                    let file = match self.provider.download(connection, &token, source).await {
                        Ok(file) => file,
                        Err(error) => {
                            download_error.get_or_insert(error);
                            media.push(None);
                            continue;
                        }
                    };
                    total = total.saturating_add(file.bytes.len());
                    if total > 50 * 1024 * 1024 {
                        download_error.get_or_insert(
                            MessagingError::Invalid("message attachments exceed the 50 MiB limit")
                                .into(),
                        );
                        media.push(None);
                        continue;
                    }
                    media.push(Some(file));
                }
                if media.iter().any(Option::is_some) {
                    self.native.ingest(connection, message, media).await?;
                }
                download_error.map_or(Ok(()), Err)
            }
            .await;
            if let Err(error) = result {
                if matches!(error.current_context(), MessagingError::Conflict) {
                    return Err(error);
                }
                self.native.media_unavailable(connection, message).await?;
                if matches!(error.current_context(), MessagingError::Disconnected) {
                    self.repository
                        .health(
                            connection,
                            ConnectionStatus::Revoked,
                            Some("access_revoked_reconnect"),
                        )
                        .await?;
                }
                if message.provenance == Provenance::OnboardingHistory
                    && !matches!(
                        error.current_context(),
                        MessagingError::Conflict
                            | MessagingError::Disconnected
                            | MessagingError::Forbidden
                            | MessagingError::Unavailable
                            | MessagingError::ProviderAccessRequired
                    )
                {
                    self.repository
                        .history_media_unavailable(connection)
                        .await?;
                } else {
                    return Err(error);
                }
            }
        }
        Ok(())
    }

    /// Process decoded facts from one verified, durable receipt. The inbound
    /// driver settles malformed envelopes without inventing message content.
    pub async fn process_receipt(
        &self,
        work: &ReceiptWork,
        events: Vec<IncomingEvent>,
    ) -> PortResult<()> {
        let mut failure = None;
        for event in events {
            if !self.repository.heartbeat_receipt(&work.lease).await? {
                return Err(MessagingError::Conflict.into());
            }
            if let Err(error) = self.process_event(work, event).await {
                // One unavailable account or attachment must not hide the other
                // events in Meta's batch. Replaying successful events is idempotent.
                if !self.repository.heartbeat_receipt(&work.lease).await? {
                    return Err(MessagingError::Conflict.into());
                }
                tracing::warn!(receipt_id=?work.lease.id,error=?error.current_context(),"Meta receipt event failed; processing the remaining events");
                if failure.is_none()
                    || matches!(error.current_context(), MessagingError::Unavailable)
                {
                    failure = Some(error);
                }
            }
        }
        match failure {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    async fn process_event(&self, work: &ReceiptWork, event: IncomingEvent) -> PortResult<()> {
        match event {
            IncomingEvent::Revision(revision) => {
                let connection = self
                    .repository
                    .account(work.provider, &revision.account_id)
                    .await?
                    .ok_or(MessagingError::Unavailable)?;
                if matches!(
                    connection.status,
                    ConnectionStatus::Disconnected | ConnectionStatus::Revoked
                ) || connection
                    .connected_at
                    .is_some_and(|at| work.received_at < at)
                {
                    return Ok(());
                }
                self.native
                    .require_admin(connection.team_id, &connection.user_id)
                    .await?;
                self.native.revise(&connection, &revision).await?;
            }
            IncomingEvent::Message(mut message) => {
                let historical = message.provenance == Provenance::OnboardingHistory;
                let account = self
                    .repository
                    .account(work.provider, &message.account_id)
                    .await?;
                let Some(connection) = account else {
                    if historical {
                        return Ok(());
                    }
                    return Err(MessagingError::Unavailable.into());
                };
                if matches!(
                    connection.status,
                    ConnectionStatus::Disconnected | ConnectionStatus::Revoked
                ) {
                    return Ok(());
                }
                if historical
                    && !self
                        .require_history_consent(&connection, work.received_at)
                        .await?
                {
                    return Ok(());
                }
                if historical {
                    if let Some((customer, direction)) = self
                        .repository
                        .history_message_identity(connection.id, &message.message_id)
                        .await?
                    {
                        message.customer_id = customer;
                        message.direction = direction;
                    } else if message.message_type == "history_media" {
                        // Supplemental media can arrive before its thread chunk. Wait for
                        // that source identity instead of creating a chat with the business.
                        return Err(MessagingError::Unavailable.into());
                    }
                }
                self.native
                    .require_admin(connection.team_id, &connection.user_id)
                    .await?;
                self.ingest_message(
                    &connection,
                    &mut message,
                    IngestionLease::Receipt(&work.lease),
                )
                .await?;
            }
            IncomingEvent::Status {
                account_id,
                message_id,
                state,
                timestamp,
                error_code,
            } => {
                let connection = self
                    .repository
                    .account(work.provider, &account_id)
                    .await?
                    .ok_or(MessagingError::Unavailable)?;
                self.repository
                    .record_status(
                        connection.id,
                        &message_id,
                        state,
                        timestamp,
                        error_code.as_deref(),
                    )
                    .await?;
            }
            IncomingEvent::HistoryProgress {
                account_id,
                progress,
                declined,
            } => {
                if let Some(c) = self.repository.account(work.provider, &account_id).await?
                    && !matches!(
                        c.status,
                        ConnectionStatus::Disconnected | ConnectionStatus::Revoked
                    )
                    && self.require_history_consent(&c, work.received_at).await?
                {
                    self.repository
                        .history_import_progress(&c, progress, declined)
                        .await?;
                }
            }
            IncomingEvent::Disconnected {
                account_id,
                business_account,
            } => {
                let connections = if business_account {
                    self.repository.business_accounts(&account_id).await?
                } else {
                    self.repository
                        .account(work.provider, &account_id)
                        .await?
                        .into_iter()
                        .collect()
                };
                for connection in connections {
                    self.repository
                        .disconnect_received(&connection, work.received_at)
                        .await?;
                }
            }
            IncomingEvent::Unsupported { ref field, .. }
                if matches!(
                    field.as_str(),
                    "history" | "smb_app_state_sync" | "reaction"
                ) => {}
            IncomingEvent::Unsupported {
                account_id: Some(account),
                field,
            } => {
                if let Some(connection) = self.repository.account(work.provider, &account).await? {
                    let code = format!(
                        "unsupported_event:{}",
                        field.chars().take(64).collect::<String>()
                    );
                    self.repository
                        .health(&connection, connection.status, Some(&code))
                        .await?;
                }
            }
            IncomingEvent::Unsupported { .. } => {}
        }
        Ok(())
    }

    /// Check account health independently so slow provider requests never block
    /// accepted-reply recovery or native delivery/search updates.
    pub async fn maintain(&self) -> PortResult<()> {
        for candidate in self.repository.maintenance_connections().await? {
            let Some(_guard) = self.repository.lock_subscription(&candidate).await? else {
                continue;
            };
            let Some(connection) = self.repository.connection(candidate.id).await? else {
                continue;
            };
            if connection.connected_at != candidate.connected_at
                || matches!(
                    connection.status,
                    ConnectionStatus::Disconnected | ConnectionStatus::Revoked
                )
            {
                continue;
            }
            let result: PortResult<()> = async {
                self.native
                    .require_admin(connection.team_id, &connection.user_id)
                    .await?;
                let token = self.token(&connection).await?;
                self.provider.subscribe(&connection, &token).await?;
                if self
                    .repository
                    .connection(connection.id)
                    .await?
                    .is_some_and(|c| c.status == ConnectionStatus::Disconnected)
                {
                    self.remove_unused_subscription(&connection, Some(&token))
                        .await?;
                    return Ok(());
                }
                self.repository
                    .health(&connection, ConnectionStatus::Connected, None)
                    .await?;
                if connection.provider == Provider::Instagram
                    && connection
                        .credential_expires_at
                        .is_some_and(|t| t < Utc::now() + Duration::days(10))
                {
                    let (fresh, expires) = self.provider.refresh(&token).await?;
                    let sealed = self
                        .cipher
                        .encrypt(connection.team_id, connection.id, &fresh)
                        .await?;
                    self.repository
                        .refresh_credential(&connection, &sealed, expires)
                        .await?;
                }
                Ok(())
            }
            .await;
            if let Err(error) = result {
                if matches!(error.current_context(), MessagingError::Conflict) {
                    continue;
                }
                let failure =
                    super::super::health::ConnectionFailure::from_error(error.current_context());
                self.repository
                    .health(&connection, failure.status(), Some(failure.code()))
                    .await?;
            }
        }
        Ok(())
    }
}
