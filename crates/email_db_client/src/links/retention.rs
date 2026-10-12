use chrono::{DateTime, Utc};
use sqlx::PgPool;
use sqlx::types::Uuid;

#[cfg(test)]
mod test;

/// Pauses sync for a link the retention sweep found idle, keeping its data.
///
/// The link is paused only if nobody opened the app with access to it after
/// `idle_before`, so activity recorded after the sweep selected it wins. A paused
/// link has `is_sync_active = false`, which every sync path already honors, and a
/// `sync_paused_at` timestamp that lets [`record_link_activity`] resume it.
///
/// Returns `true` when the link is paused, including when a previous delivery
/// already paused it, so a redelivered message can finish the provider teardown.
#[tracing::instrument(skip(pool), err)]
pub async fn pause_link_sync(
    pool: &PgPool,
    link_id: Uuid,
    idle_before: DateTime<Utc>,
) -> anyhow::Result<bool> {
    let paused = sqlx::query_scalar!(
        r#"
        UPDATE email_links
        SET is_sync_active = FALSE,
            sync_paused_at = COALESCE(sync_paused_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
          AND (sync_paused_at IS NOT NULL OR (is_sync_active AND last_active_at < $2))
        RETURNING id
        "#,
        link_id,
        idle_before,
    )
    .fetch_optional(pool)
    .await?;

    Ok(paused.is_some())
}

/// Records that someone with access to `link_ids` opened the app, and resumes
/// any of those links the retention sweep paused. Returns the resumed link ids;
/// the caller owns restarting their provider sync.
///
/// Activity is written at most hourly per link, which is far finer than the
/// retention windows. Links locked by an in-flight deletion are skipped rather
/// than waited on.
#[tracing::instrument(skip(pool), err)]
pub async fn record_link_activity(pool: &PgPool, link_ids: &[Uuid]) -> anyhow::Result<Vec<Uuid>> {
    if link_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query!(
        r#"
        WITH touched AS (
            SELECT id, sync_paused_at IS NOT NULL AS was_paused
            FROM email_links
            WHERE id = ANY($1)
              AND (sync_paused_at IS NOT NULL OR last_active_at < NOW() - INTERVAL '1 hour')
            FOR UPDATE SKIP LOCKED
        )
        UPDATE email_links l
        SET last_active_at = NOW(),
            is_sync_active = l.is_sync_active OR touched.was_paused,
            sync_paused_at = NULL,
            updated_at = CASE WHEN touched.was_paused THEN NOW() ELSE l.updated_at END
        FROM touched
        WHERE l.id = touched.id
        RETURNING l.id, touched.was_paused AS "was_paused!"
        "#,
        link_ids,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .filter(|row| row.was_paused)
        .map(|row| row.id)
        .collect())
}
