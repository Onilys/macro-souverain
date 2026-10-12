use crate::handler::{fetch_idle_link_ids, fetch_inactive_link_ids, fetch_unused_link_ids};
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::{Pool, Postgres};
use std::collections::BTreeSet;
use uuid::Uuid;

const PAUSE_AFTER_DAYS: i64 = 7;
const DELETE_AFTER_DAYS: i64 = 30;

fn link(n: u8) -> Uuid {
    Uuid::parse_str(&format!("00000000-0000-0000-0000-{n:012}")).unwrap()
}

fn links(ns: &[u8]) -> BTreeSet<Uuid> {
    ns.iter().copied().map(link).collect()
}

fn thresholds() -> (DateTime<Utc>, DateTime<Utc>) {
    let now = Utc::now();
    (
        now - Duration::days(PAUSE_AFTER_DAYS),
        now - Duration::days(DELETE_AFTER_DAYS),
    )
}

async fn idle_links(pool: &Pool<Postgres>) -> Result<BTreeSet<Uuid>> {
    let (idle_before, delete_before) = thresholds();
    Ok(fetch_idle_link_ids(pool, idle_before, delete_before)
        .await?
        .into_iter()
        .collect())
}

async fn links_to_delete(pool: &Pool<Postgres>) -> Result<(BTreeSet<Uuid>, BTreeSet<Uuid>)> {
    let unused = fetch_unused_link_ids(pool, DELETE_AFTER_DAYS as i32).await?;
    let inactive = fetch_inactive_link_ids(pool, DELETE_AFTER_DAYS as i32).await?;
    Ok((unused.into_iter().collect(), inactive.into_iter().collect()))
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("link_retention"))
)]
async fn idle_links_are_selected_for_pause(pool: Pool<Postgres>) -> Result<()> {
    const _: &sqlx::migrate::Migrator = &MACRO_DB_MIGRATIONS;

    // 03 and 06 were active recently (thread view or app open), 01, 02 and 08 are past the
    // delete threshold, 05 is internal, and 07 and 08 are already paused.
    assert_eq!(idle_links(&pool).await?, links(&[4, 9]));

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("link_retention"))
)]
async fn links_idle_past_delete_threshold_are_selected_for_delete(
    pool: Pool<Postgres>,
) -> Result<()> {
    let (unused, inactive) = links_to_delete(&pool).await?;

    // 08 is deleted even though it is paused; 06 has stale thread views but opened the app
    // yesterday, and 05 is internal.
    assert_eq!(unused, links(&[1, 8]));
    assert_eq!(inactive, links(&[2]));

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("link_retention"))
)]
async fn retention_respects_threshold_parameters(pool: Pool<Postgres>) -> Result<()> {
    let now = Utc::now();
    let idle =
        fetch_idle_link_ids(&pool, now - Duration::days(365), now - Duration::days(400)).await?;
    let unused = fetch_unused_link_ids(&pool, 365).await?;
    let inactive = fetch_inactive_link_ids(&pool, 365).await?;
    assert!(idle.is_empty() && unused.is_empty() && inactive.is_empty());

    Ok(())
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../fixtures", scripts("link_retention"))
)]
async fn idle_link_pauses_then_deletes_unless_activity_resumes_it(
    pool: Pool<Postgres>,
) -> Result<()> {
    let link_id = link(4);
    assert!(idle_links(&pool).await?.contains(&link_id));

    sqlx::query!(
        "UPDATE email_links SET is_sync_active = FALSE, sync_paused_at = NOW() WHERE id = $1",
        link_id
    )
    .execute(&pool)
    .await?;
    assert!(
        !idle_links(&pool).await?.contains(&link_id),
        "a paused link is not paused again"
    );
    let (unused, _) = links_to_delete(&pool).await?;
    assert!(
        !unused.contains(&link_id),
        "a paused link is kept until the delete threshold"
    );

    sqlx::query!(
        "UPDATE email_links SET last_active_at = NOW() - INTERVAL '31 days' WHERE id = $1",
        link_id
    )
    .execute(&pool)
    .await?;
    let (unused, _) = links_to_delete(&pool).await?;
    assert!(
        unused.contains(&link_id),
        "a paused link is deleted past the delete threshold"
    );

    sqlx::query!(
        "UPDATE email_links SET is_sync_active = TRUE, sync_paused_at = NULL, last_active_at = NOW() WHERE id = $1",
        link_id
    )
    .execute(&pool)
    .await?;
    let (unused, inactive) = links_to_delete(&pool).await?;
    assert!(!unused.contains(&link_id) && !inactive.contains(&link_id));
    assert!(!idle_links(&pool).await?.contains(&link_id));

    Ok(())
}
