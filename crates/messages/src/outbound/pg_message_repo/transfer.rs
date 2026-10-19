use super::{PgMessageRepository, database_error};
use crate::domain::{models::MessageParent, ports::*};

impl DiscussionTransferRepository for PgMessageRepository {
    #[tracing::instrument(err, skip(self))]
    async fn move_discussions(
        &self,
        from: &MessageParent,
        to: &MessageParent,
    ) -> Result<u64, MessageError> {
        let (from_type, from_id) = (from.entity_type(), from.entity_id());
        let (to_type, to_id) = (to.entity_type(), to.entity_id());
        let mut tx = self.pool.begin().await.map_err(database_error)?;
        // Only document threads carry anchors; detach them before the threads move.
        if to_type != "document" {
            sqlx::query!(
                r#"UPDATE comms_message_threads
                SET anchor = NULL, updated_at = NOW()
                WHERE parent_entity_type = $1 AND parent_entity_id = $2
                  AND anchor IS NOT NULL"#,
                from_type,
                from_id,
            )
            .execute(&mut *tx)
            .await
            .map_err(database_error)?;
        }
        // Thread rows follow their roots through the cascading parent key; the
        // reply-to-root key is deferred, so roots and replies move together.
        let moved = sqlx::query!(
            r#"UPDATE comms_messages
            SET parent_entity_type = $3, parent_entity_id = $4
            WHERE parent_entity_type = $1 AND parent_entity_id = $2"#,
            from_type,
            from_id,
            to_type,
            to_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(database_error)?
        .rows_affected();
        tx.commit().await.map_err(database_error)?;
        Ok(moved)
    }
}
