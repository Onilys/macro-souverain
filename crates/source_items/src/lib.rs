#![deny(missing_docs)]
//! Transactional application maintenance for the rebuildable source-item projection.

use model_entity::EntityType;
use sqlx::{Connection, PgConnection};

pub mod backfill;
pub mod project_deletion;

#[cfg(test)]
mod test;

/// Refresh one item's projection after its authoritative mutation.
///
/// The connection must be inside the caller's transaction. Never pass an
/// autocommit connection: the mutation, lock, and refresh must commit together.
pub async fn sync_one(
    connection: &mut PgConnection,
    entity_type: EntityType,
    entity_id: &str,
) -> Result<(), sqlx::Error> {
    sync_many(connection, entity_type, &[entity_id.to_owned()]).await
}

/// Rebuild the named items from their current grants and item state.
///
/// Call after all authoritative writes, inside the same READ COMMITTED
/// transaction. Advisory locks serialize projection refreshes, including an
/// insert racing a grant on an item not yet visible. The refresh is a separate
/// statement so it sees the previous lock holder's committed canonical writes.
/// Other entity types have no rows in this projection.
pub async fn sync_many(
    connection: &mut PgConnection,
    entity_type: EntityType,
    entity_ids: &[String],
) -> Result<(), sqlx::Error> {
    if entity_ids.is_empty()
        || !matches!(
            entity_type,
            EntityType::Document | EntityType::Chat | EntityType::Project
        )
    {
        return Ok(());
    }
    if !connection.is_in_transaction() {
        return Err(sqlx::Error::InvalidArgument(
            "source-item maintenance requires the authoritative write transaction".into(),
        ));
    }
    let isolation = sqlx::query_scalar!("SELECT current_setting('transaction_isolation')")
        .fetch_one(&mut *connection)
        .await?;
    if isolation.as_deref() != Some("read committed") {
        return Err(sqlx::Error::InvalidArgument(
            "source-item maintenance requires READ COMMITTED isolation".into(),
        ));
    }
    sqlx::query!(
        r#"WITH ids AS MATERIALIZED (
            SELECT DISTINCT unnest($2::text[]) AS id ORDER BY id
        )
        SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || id, 7316)) FROM ids"#,
        entity_type.as_ref(),
        entity_ids,
    )
    .execute(&mut *connection)
    .await?;
    sqlx::query_file!("src/sync.sql", entity_type.as_ref(), entity_ids,)
        .execute(&mut *connection)
        .await?;
    Ok(())
}

/// Refresh database-returned `(entity_type, entity_id)` keys after a bulk grant
/// mutation. Types outside the projection are ignored; each supported group is
/// refreshed in a fixed order in the caller's existing transaction.
pub async fn sync_rows(
    connection: &mut PgConnection,
    items: &[(String, String)],
) -> Result<(), sqlx::Error> {
    for entity_type in [EntityType::Chat, EntityType::Document, EntityType::Project] {
        let ids = items
            .iter()
            .filter(|(kind, _)| kind == entity_type.as_ref())
            .map(|(_, id)| id.clone())
            .collect::<Vec<_>>();
        sync_many(connection, entity_type, &ids).await?;
    }
    Ok(())
}
