//! Trusted source-scoped attachment/body reconciliation. It cannot post or send
//! messages and never grants document permissions or emits live routine effects.

use super::*;

impl PgMessageRepository {
    /// Append a document reference only to the exact integration-owned message.
    /// Caller first authorizes and grants the document through its owning services.
    pub async fn attach_external_file_in(
        tx: &mut Transaction<'_, Postgres>,
        channel: Uuid,
        message: Uuid,
        connection: Uuid,
        provider_message: &str,
        document: Uuid,
    ) -> Result<(), MessageError> {
        let target=sqlx::query!("SELECT id FROM comms_messages WHERE id=$1 AND parent_entity_type='channel' AND parent_entity_id=$2 AND import_metadata->>'connection_id'=$3 AND import_metadata->>'provider_message_id'=$4 AND deleted_at IS NULL FOR UPDATE",message,channel.to_string(),connection.to_string(),provider_message).fetch_optional(&mut **tx).await.map_err(database_error)?;
        if target.is_none() {
            return Err(MessageError::NotFound);
        }
        sqlx::query!("INSERT INTO comms_attachments (id,message_id,entity_type,entity_id) SELECT $1::uuid,$2::uuid,'document',$3::text WHERE NOT EXISTS (SELECT 1 FROM comms_attachments WHERE message_id=$2 AND entity_type='document' AND entity_id=$3::text) ON CONFLICT (id) DO NOTHING",Uuid::now_v7(),message,document.to_string()).execute(&mut **tx).await.map_err(database_error)?;
        sqlx::query!(
            "UPDATE comms_messages SET updated_at=GREATEST(updated_at,now()) WHERE id=$1",
            message
        )
        .execute(&mut **tx)
        .await
        .map_err(database_error)?;
        Ok(())
    }

    /// Update a source-owned unavailable-media notice, preserving any human edit
    /// or tombstone. The original provider text is retained by the receipt ledger.
    pub async fn external_media_notice_in(
        tx: &mut Transaction<'_, Postgres>,
        channel: Uuid,
        message: Uuid,
        connection: Uuid,
        provider_message: &str,
        content: &str,
    ) -> Result<(), MessageError> {
        sqlx::query!("UPDATE comms_messages SET content=$5,updated_at=GREATEST(updated_at,now()) WHERE id=$1 AND parent_entity_type='channel' AND parent_entity_id=$2 AND import_metadata->>'connection_id'=$3 AND import_metadata->>'provider_message_id'=$4 AND edited_at IS NULL AND deleted_at IS NULL",message,channel.to_string(),connection.to_string(),provider_message,content).execute(&mut **tx).await.map_err(database_error)?;
        Ok(())
    }
}
