use super::*;
use crate::domain::{
    models::DeliveryState,
    ports::{ProviderSendResult, SendWork},
};

impl MessagingService {
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
        let connection = self.account(work.connection_id).await?;
        self.native
            .require_send(connection.team_id, work.channel_id, &work.user_id)
            .await?;
        let options = self
            .validate_send(&connection, &conversation, &work.request)
            .await?;
        let media = match &work.request.message {
            ReplyContent::Media { document_id, .. } => Some(
                self.native
                    .outgoing_media(&work.user_id, work.channel_id, *document_id)
                    .await?,
            ),
            _ => None,
        };
        if let (ReplyContent::Media { kind, .. }, Some(media)) = (&work.request.message, &media) {
            options.capabilities.validate_media(
                *kind,
                &media.file.mime_type,
                media.file.bytes.len(),
            )?;
        }
        let prepared = match self
            .transport
            .prepare(&connection, &conversation, &work.request, media.as_ref())
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
        let current = self.account(connection.id).await?;
        if current.team_id != connection.team_id || current.generation != connection.generation {
            return Err(MessagingError::Conflict.into());
        }
        let conversation = self
            .repository
            .conversation(work.channel_id)
            .await?
            .filter(|latest| {
                latest.connection_id == current.id && latest.customer_id == conversation.customer_id
            })
            .ok_or(MessagingError::Conflict)?;
        self.policy
            .validate_content(&current, &work.request)
            .await?;
        let options = self
            .validate_send(&current, &conversation, &work.request)
            .await?;
        if let (ReplyContent::Media { kind, .. }, Some(media)) = (&work.request.message, &media) {
            options.capabilities.validate_media(
                *kind,
                &media.file.mime_type,
                media.file.bytes.len(),
            )?;
        }
        self.native
            .require_send(current.team_id, work.channel_id, &work.user_id)
            .await?;
        options
            .eligibility
            .require(reply_mode(&work.request), Utc::now())?;
        self.repository
            .prepare_send(&work.lease, &current, prepared.rendered_text())
            .await?;
        let mut prepared_work = work.clone();
        prepared_work.rendered_text = Some(prepared.rendered_text().to_owned());
        match prepared.dispatch().await? {
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

    /// Finish accepted native messages and publication without repeating provider sends.
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
                let connection = self.account(work.connection_id).await?;
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
}
