//! Outbound intents are idempotent locally. An expired network attempt becomes
//! Unknown, since neither an HTTP timeout nor process death proves non-delivery.

use super::*;

impl PgMessagingRepository {
    pub(super) async fn enqueue_send_impl(
        &self,
        connection: Uuid,
        channel: Uuid,
        user: &str,
        request: &SendReply,
        digest: &[u8],
    ) -> PortResult<SendProgress> {
        let payload = serde_json::to_value(request).map_err(failure)?;
        let mut tx = self.pool.begin().await.map_err(failure)?;
        sqlx::query!("INSERT INTO meta_messaging_send (id,connection_id,channel_id,user_id,idempotency_key,request_sha256,payload) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (channel_id,user_id,idempotency_key) DO NOTHING",Uuid::now_v7(),connection,channel,user,request.idempotency_key,digest,payload).execute(&mut *tx).await.map_err(failure)?;
        let row = sqlx::query!("SELECT to_jsonb(s) AS \"data!\", request_sha256 FROM meta_messaging_send s WHERE channel_id = $1 AND user_id = $2 AND idempotency_key = $3 FOR UPDATE",channel,user,request.idempotency_key).fetch_one(&mut *tx).await.map_err(failure)?;
        if row.request_sha256 != digest {
            return Err(MessagingError::Conflict.into());
        }
        let progress = decode(row.data)?;
        tx.commit().await.map_err(failure)?;
        Ok(progress)
    }
    pub(super) async fn sends_impl(&self, channel: Uuid) -> PortResult<Vec<SendProgress>> {
        sqlx::query!("SELECT to_jsonb(s) AS \"data!\" FROM meta_messaging_send s WHERE channel_id = $1 ORDER BY id DESC LIMIT 100",channel).fetch_all(&self.pool).await.map_err(failure)?.into_iter().map(|r|decode(r.data)).collect()
    }
    pub(super) async fn sends_for_messages_impl(
        &self,
        channel: Uuid,
        messages: &[Uuid],
    ) -> PortResult<Vec<SendProgress>> {
        sqlx::query!("SELECT to_jsonb(s) AS \"data!\" FROM meta_messaging_message m JOIN meta_messaging_send s ON s.connection_id = m.connection_id AND s.provider_message_id = m.provider_message_id AND s.message_id = m.message_id WHERE s.channel_id = $1 AND m.message_id = ANY($2)", channel, messages).fetch_all(&self.pool).await.map_err(failure)?.into_iter().map(|row| decode(row.data)).collect()
    }
    pub(super) async fn claim_send_impl(&self) -> PortResult<Option<SendWork>> {
        sqlx::query!("UPDATE meta_messaging_send SET state = 'unknown', error_code = 'interrupted_send_check_provider', lease_id = NULL, lease_until = NULL, updated_at = now() WHERE state = 'sending' AND lease_until < now()")
            .execute(&self.pool).await.map_err(failure)?;
        let token = Uuid::now_v7();
        let row = sqlx::query!(r#"WITH candidate AS (SELECT id FROM meta_messaging_send WHERE state = 'pending' AND available_at <= now() AND attempts < 20 ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
            UPDATE meta_messaging_send s SET state = 'sending', lease_id = $1, lease_until = now() + interval '5 minutes', attempts = attempts + 1, updated_at = now()
            FROM candidate c WHERE s.id = c.id RETURNING s.id,s.connection_id,s.channel_id,s.user_id,s.created_at,s.payload,s.attempts"#,token).fetch_optional(&self.pool).await.map_err(failure)?;
        row.map(|r| {
            Ok(SendWork {
                lease: Lease { id: r.id, token },
                connection_id: r.connection_id,
                channel_id: r.channel_id,
                user_id: r.user_id,
                created_at: r.created_at,
                rendered_text: r
                    .payload
                    .get("rendered_text")
                    .and_then(|v| v.as_str())
                    .map(str::to_owned),
                request: decode(r.payload)?,
                attempts: r.attempts as u16,
            })
        })
        .transpose()
    }
    pub(super) async fn settle_send_impl(
        &self,
        lease: &Lease,
        state: DeliveryState,
        provider: Option<&ProviderId>,
        error: Option<&str>,
        retry: Option<u32>,
    ) -> PortResult<()> {
        let state = if retry.is_some() {
            DeliveryState::Pending
        } else {
            state
        };
        let result = sqlx::query!("UPDATE meta_messaging_send SET state = $3, provider_message_id = COALESCE($4,provider_message_id), error_code = $5, available_at = now() + make_interval(secs => COALESCE($6,0)), lease_id = NULL, lease_until = NULL, updated_at = now() WHERE id = $1 AND lease_id = $2 AND lease_until > now() AND state = 'sending'",lease.id,lease.token,spelling(state),provider.map(ProviderId::as_str),error,retry.map(|s|s.min(3600) as i32))
            .execute(&self.pool).await.map_err(failure)?;
        if result.rows_affected() != 1 {
            return Err(MessagingError::Conflict.into());
        }
        Ok(())
    }
    pub(super) async fn defer_accepted_send_impl(
        &self,
        work: &SendWork,
        provider_id: &ProviderId,
    ) -> PortResult<()> {
        sqlx::query!("UPDATE meta_messaging_send SET native_retry_at=now()+interval '30 seconds' WHERE id=$1 AND connection_id=$2 AND channel_id=$3 AND provider_message_id=$4 AND state IN ('accepted','sent','delivered','read','failed') AND (message_id IS NULL OR EXISTS (SELECT 1 FROM meta_messaging_message m WHERE m.message_id=meta_messaging_send.message_id AND m.media_state='pending'))",work.lease.id,work.connection_id,work.channel_id,provider_id.as_str())
            .execute(&self.pool).await.map_err(failure)?;
        Ok(())
    }
    pub(super) async fn accepted_sends_impl(&self) -> PortResult<Vec<(SendWork, ProviderId)>> {
        let rows=sqlx::query!("SELECT id, connection_id, channel_id, user_id, created_at, payload, provider_message_id, attempts FROM meta_messaging_send WHERE native_retry_at<=now() AND provider_message_id IS NOT NULL AND (message_id IS NULL OR EXISTS (SELECT 1 FROM meta_messaging_message m WHERE m.message_id=meta_messaging_send.message_id AND m.media_state='pending')) AND state IN ('accepted','sent','delivered','read','failed') ORDER BY native_retry_at,id LIMIT 50")
            .fetch_all(&self.pool).await.map_err(failure)?;
        rows.into_iter()
            .map(|r| {
                Ok((
                    SendWork {
                        lease: Lease {
                            id: r.id,
                            token: Uuid::nil(),
                        },
                        connection_id: r.connection_id,
                        channel_id: r.channel_id,
                        user_id: r.user_id,
                        created_at: r.created_at,
                        rendered_text: r
                            .payload
                            .get("rendered_text")
                            .and_then(|v| v.as_str())
                            .map(str::to_owned),
                        request: decode(r.payload)?,
                        attempts: r.attempts as u16,
                    },
                    r.provider_message_id
                        .ok_or(MessagingError::Unavailable)?
                        .try_into()?,
                ))
            })
            .collect()
    }
}
