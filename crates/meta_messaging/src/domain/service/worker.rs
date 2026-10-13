//! Restart-safe execution. Lease-aware native commits and provider identities
//! arbitrate duplicates. History requires separate, explicit account consent.

use super::*;

#[derive(Clone, Copy)]
pub(super) enum IngestionLease<'a> {
    Receipt(&'a Lease),
    History(&'a Lease),
}

impl MessagingService {
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
                for source in &message.media {
                    if !self.renew_ingestion(lease).await? {
                        return Err(MessagingError::Conflict.into());
                    }
                    let file = self.provider.download(connection, &token, source).await?;
                    total = total.saturating_add(file.bytes.len());
                    if total > 50 * 1024 * 1024 {
                        return Err(MessagingError::Invalid(
                            "message attachments exceed the 50 MiB limit",
                        )
                        .into());
                    }
                    media.push(file);
                }
                self.native.ingest(connection, message, media).await?;
                Ok(())
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
                if matches!(field.as_str(), "history" | "smb_app_state_sync") => {}
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

    /// Dispatch exactly one attempt. A network attempt is never blindly repeated
    /// following a timeout/crash. Rejected rate limits alone are eligible for retry.
    pub async fn process_send(&self, work: &SendWork) -> PortResult<()> {
        let conversation = self
            .repository
            .conversation(work.channel_id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        if conversation.connection_id != work.connection_id {
            return Err(MessagingError::Conflict.into());
        }
        let connection = self
            .repository
            .connection(work.connection_id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        self.native
            .require_send(connection.team_id, work.channel_id, &work.user_id)
            .await?;
        self.validate_send(&connection, &conversation, &work.request)
            .await?;
        let token = self.token(&connection).await?;
        let media = match &work.request.message {
            ReplyContent::Media { document_id, .. } => Some(
                self.native
                    .outgoing_media(&work.user_id, work.channel_id, *document_id)
                    .await?,
            ),
            _ => None,
        };
        let prepared = match self
            .provider
            .prepare_reply(
                &connection,
                &token,
                &conversation,
                &work.request,
                media.as_ref(),
            )
            .await
        {
            Ok(prepared) => prepared,
            Err(error)
                if matches!(error.current_context(), MessagingError::Unavailable)
                    && work.attempts < 10 =>
            {
                self.repository
                    .settle_send(
                        &work.lease,
                        DeliveryState::Pending,
                        None,
                        Some("preparation_temporarily_unavailable"),
                        Some(30),
                    )
                    .await?;
                return Ok(());
            }
            Err(error) => return Err(error),
        };
        self.native
            .require_send(connection.team_id, work.channel_id, &work.user_id)
            .await?;
        let current = self
            .repository
            .connection(connection.id)
            .await?
            .ok_or(MessagingError::NotFound)?;
        if current.connected_at != connection.connected_at {
            return Err(MessagingError::Conflict.into());
        }
        self.validate_send(&current, &conversation, &work.request)
            .await?;
        self.repository
            .prepare_send(&work.lease, &current, &prepared.rendered_text)
            .await?;
        let mut prepared_work = work.clone();
        prepared_work.rendered_text = Some(prepared.rendered_text.clone());
        match self.provider.send(&connection, &token, &prepared).await {
            ProviderSendResult::Accepted(id) => {
                // Record acceptance BEFORE local rendering: if native materialization
                // fails, recovery may create the message but must not resend it.
                self.repository
                    .settle_send(&work.lease, DeliveryState::Accepted, Some(&id), None, None)
                    .await?;
                self.native
                    .sent(&prepared_work, &conversation, &connection, &id)
                    .await?;
            }
            ProviderSendResult::RetryAfter(seconds) if work.attempts < 10 => {
                self.repository
                    .settle_send(
                        &work.lease,
                        DeliveryState::Pending,
                        None,
                        Some("provider_rate_limit"),
                        Some(seconds.max(5)),
                    )
                    .await?
            }
            ProviderSendResult::RetryAfter(_) => {
                self.repository
                    .settle_send(
                        &work.lease,
                        DeliveryState::Failed,
                        None,
                        Some("rate_limit_retries_exhausted"),
                        None,
                    )
                    .await?
            }
            ProviderSendResult::Rejected(code) => {
                if code == "provider_error_190" {
                    self.repository
                        .health(
                            &connection,
                            ConnectionStatus::Revoked,
                            Some("access_revoked_reconnect"),
                        )
                        .await?;
                }
                self.repository
                    .settle_send(&work.lease, DeliveryState::Failed, None, Some(&code), None)
                    .await?;
            }
            ProviderSendResult::Unknown => {
                self.repository
                    .settle_send(
                        &work.lease,
                        DeliveryState::Unknown,
                        None,
                        Some("delivery_unknown_check_provider_before_resending"),
                        None,
                    )
                    .await?
            }
        }
        Ok(())
    }

    /// Subscribe newly connected accounts, renew supported credentials, and drain
    /// native effects/search work. The driver bounds concurrency across ticks.
    pub async fn recover_native(&self) -> PortResult<()> {
        // These intents already crossed the provider boundary. Only finish native
        // persistence; never call send() while reconciling an accepted reply.
        let mut first_error = None;
        for (work, id) in self.repository.accepted_sends().await? {
            let result: PortResult<()> = async {
                let conversation = self
                    .repository
                    .conversation(work.channel_id)
                    .await?
                    .ok_or(MessagingError::NotFound)?;
                if conversation.connection_id != work.connection_id {
                    return Err(MessagingError::Conflict.into());
                }
                let connection = self
                    .repository
                    .connection(work.connection_id)
                    .await?
                    .ok_or(MessagingError::NotFound)?;
                self.native
                    .sent(&work, &conversation, &connection, &id)
                    .await
            }
            .await;
            if let Err(error) = result {
                tracing::warn!(send_id=?work.lease.id,error=?error.current_context(),"accepted reply remains queued for native recovery");
                first_error.get_or_insert(error);
                if let Err(error) = self.repository.defer_accepted_send(&work, &id).await {
                    first_error.get_or_insert(error);
                }
            }
        }
        if let Err(error) = self.native.reconcile_effects().await {
            first_error.get_or_insert(error);
        }
        first_error.map_or(Ok(()), Err)
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
