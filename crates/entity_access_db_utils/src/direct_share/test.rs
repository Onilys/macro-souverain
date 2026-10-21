use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::PgPool;

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../fixtures", scripts("team_share"))
)]
async fn project_grant_skips_legacy_children_and_preserves_modern_grants(pool: PgPool) {
    sqlx::query!(
        r#"INSERT INTO "Document" (id, name, owner, "projectId")
        VALUES ('legacy-document-id', 'Legacy document', 'macro|owner@example.com',
            '20000000-0000-0000-0000-000000000003')"#
    )
    .execute(&pool)
    .await
    .unwrap();
    let mut tx = pool.begin().await.unwrap();
    set(
        &mut tx,
        &macro_uuid::Uuid::from_u128(0x20000000000000000000000000000001),
        EntityType::Project,
        &MacroUserIdStr::parse_from_str("macro|reader@example.com").unwrap(),
        Some(AccessLevel::Comment),
        true,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let grants = sqlx::query!(
        r#"SELECT entity_id, entity_type, access_level AS "access_level: AccessLevel"
        FROM entity_access WHERE source_type = 'user' AND source_id = 'macro|reader@example.com'
        ORDER BY entity_id"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(grants.len(), 5);
    assert!(
        grants
            .iter()
            .all(|grant| grant.access_level == AccessLevel::Comment)
    );
    assert!(grants.iter().any(|grant| grant.entity_id
        == macro_uuid::Uuid::from_u128(0x20000000000000000000000000000002)
        && grant.entity_type == "document"));
}

#[sqlx::test(
    migrator = "MACRO_DB_MIGRATIONS",
    fixtures(path = "../../fixtures", scripts("team_share"))
)]
async fn project_grant_and_revoke_maintain_source_items(pool: PgPool) {
    let project = macro_uuid::Uuid::from_u128(0x20000000000000000000000000000001);
    let reader = MacroUserIdStr::parse_from_str("macro|reader@example.com").unwrap();
    let projected = |pool: PgPool| async move {
        let grants = sqlx::query!(
            r#"SELECT entity_type AS "entity_type!", entity_id::text AS "entity_id!"
            FROM entity_access WHERE source_id = 'macro|reader@example.com'
            AND entity_type IN ('document', 'chat', 'project')
            ORDER BY 1, 2"#
        )
        .fetch_all(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|row| (row.entity_type, row.entity_id))
        .collect::<Vec<_>>();
        let rows = sqlx::query!(
            r#"SELECT entity_type, entity_id FROM source_items
            WHERE source_id = 'macro|reader@example.com' ORDER BY 1, 2"#
        )
        .fetch_all(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|row| (row.entity_type, row.entity_id))
        .collect::<Vec<_>>();
        (grants, rows)
    };

    let mut tx = pool.begin().await.unwrap();
    set(
        &mut tx,
        &project,
        EntityType::Project,
        &reader,
        Some(AccessLevel::Comment),
        true,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let (grants, rows) = projected(pool.clone()).await;
    assert_eq!(grants.len(), 4);
    assert_eq!(rows, grants);

    let mut tx = pool.begin().await.unwrap();
    set(&mut tx, &project, EntityType::Project, &reader, None, false)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let (grants, rows) = projected(pool).await;
    assert!(grants.is_empty());
    assert!(rows.is_empty());
}
