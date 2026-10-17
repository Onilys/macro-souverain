//! Transactional native channel effects for verified provider lifecycle facts.
use super::*;

impl PgChannelsRepo {
    /// Mark a freshly reserved private channel in the binding transaction.
    pub async fn mark_provider_managed_in(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        channel: Uuid,
    ) -> anyhow::Result<()> {
        let changed=sqlx::query!("UPDATE comms_channels SET provider_managed=true WHERE id=$1 AND channel_type='private' AND team_id IS NULL",channel).execute(&mut **tx).await?;
        anyhow::ensure!(
            changed.rows_affected() == 1,
            "provider groups require private native channels"
        );
        Ok(())
    }

    /// Apply a provider-owned name through the native channel owner. The host
    /// publishes the returned native event after the binding transaction commits.
    pub async fn provider_name_in(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        channel: Uuid,
        name: &str,
    ) -> anyhow::Result<crate::domain::events::ChannelEvent> {
        let row = sqlx::query!(
            "SELECT name,owner_id FROM comms_channels WHERE id=$1 AND provider_managed FOR UPDATE",
            channel
        )
        .fetch_one(&mut **tx)
        .await?;
        sqlx::query!(
            "UPDATE comms_channels SET name=$2,updated_at=now() WHERE id=$1",
            channel,
            name
        )
        .execute(&mut **tx)
        .await?;
        Ok(crate::domain::events::ChannelEvent::ChannelUpdated {
            channel_id: channel,
            actor: MacroUserIdStr::try_from(row.owner_id)?,
            previous_name: row.name,
            channel_name: Some(name.to_owned()),
        })
    }
}
