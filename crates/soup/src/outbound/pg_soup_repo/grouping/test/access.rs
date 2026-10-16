use super::*;
use uuid::Uuid;

async fn assert_membership(pool: &Pool<Postgres>) -> anyhow::Result<()> {
    let items = expanded_dynamic_cursor_soup_grouped(
        pool,
        GroupedDynamicCursorArgs {
            user_id: MacroUserIdStr::parse_from_str("macro|user-1@test.com")?,
            limit: 2,
            cursor: Query::Sort(SimpleSortMethod::UpdatedAt, EntityFilterAst::mock_empty()),
            exclude_frecency: false,
            grouping: GroupingConfig {
                field: GroupByField::EntityType,
                group_key: None,
                per_group_limit: None,
            },
        },
    )
    .await?
    .collect::<Vec<_>>();
    for (key, expected) in [
        (
            "document",
            vec![
                "11111111-0000-0000-0000-000000000000",
                "11111111-dddd-dddd-dddd-dddddddddddd",
                "11111111-cccc-cccc-cccc-cccccccccccc",
                "11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            ],
        ),
        (
            "chat",
            vec![
                "22222222-0000-0000-0000-000000000000",
                "22222222-cccc-cccc-cccc-cccccccccccc",
                "22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            ],
        ),
        (
            "project",
            vec![
                "dddddddd-ffff-ffff-ffff-ffffffffffff",
                "cccccccc-ffff-ffff-ffff-ffffffffffff",
                "bbbbbbbb-ffff-ffff-ffff-ffffffffffff",
                "aaaaaaaa-ffff-ffff-ffff-ffffffffffff",
            ],
        ),
    ] {
        let group = items
            .iter()
            .filter(|item| item.key == key)
            .collect::<Vec<_>>();
        assert_eq!(
            group
                .iter()
                .map(|i| i.item.id().to_string())
                .collect::<Vec<_>>(),
            expected
        );
        for (index, item) in group.iter().enumerate() {
            assert_eq!(item.total_group_count, expected.len());
            assert_eq!(item.index_in_group, index + 1);
        }
    }
    assert_eq!(items.len(), 13);
    Ok(())
}

#[sqlx::test(
    fixtures(
        path = "../../../../../../macro_db_client/fixtures",
        scripts("mixed_items_expanded")
    ),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn inherited_and_direct_grants_without_owner_fallback(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    assert_membership(&pool).await
}

#[sqlx::test(
    fixtures(
        path = "../../../../../../macro_db_client/fixtures",
        scripts("mixed_items_expanded")
    ),
    fixtures(path = ".", scripts("access")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn source_membership_deduplicates_grants(pool: Pool<Postgres>) -> anyhow::Result<()> {
    assert_membership(&pool).await?;
    sqlx::query!(r#"UPDATE "Document" SET "deletedAt" = now() WHERE id = '11111111-0000-0000-0000-000000000000'"#).execute(&pool).await?;
    let items = expanded_dynamic_cursor_soup_grouped(
        &pool,
        GroupedDynamicCursorArgs {
            user_id: MacroUserIdStr::parse_from_str("macro|user-1@test.com")?,
            limit: 50,
            cursor: Query::Sort(
                SimpleSortMethod::UpdatedAt,
                super::pagination::task_filter(),
            ),
            exclude_frecency: false,
            grouping: GroupingConfig {
                field: GroupByField::EntityType,
                group_key: None,
                per_group_limit: None,
            },
        },
    )
    .await?
    .collect::<Vec<_>>();
    assert!(
        items.is_empty(),
        "deleted task must be excluded despite multiple grants"
    );
    Ok(())
}

pub(super) fn calendar_filter() -> EntityFilterAst {
    EntityFilterAst {
        document_filter: Some(Arc::new(Expr::val(DocumentLiteral::Id(uuid::Uuid::nil())))),
        chat_filter: Some(Arc::new(Expr::val(ChatLiteral::Importance(false)))),
        project_filter: Some(Arc::new(Expr::val(
            item_filters::ast::project::ProjectLiteral::Importance(false),
        ))),
        ..EntityFilterAst::mock_empty()
    }
}

pub(super) async fn seed_calendar_access(pool: &Pool<Postgres>) -> anyhow::Result<Vec<uuid::Uuid>> {
    let mut ids = Vec::new();
    for (index, owner) in [
        "macro|user-1@test.com",
        "macro|other@test.com",
        "macro|other@test.com",
    ]
    .into_iter()
    .enumerate()
    {
        let link = uuid::Uuid::now_v7();
        let id = uuid::Uuid::now_v7();
        sqlx::query!(
            "INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider) VALUES ($1, $2, $2, $3, 'GMAIL') ON CONFLICT DO NOTHING",
            link, owner, format!("calendar-{index}@test.com"),
        ).execute(pool).await?;
        sqlx::query!(
            "INSERT INTO calendar_events (id, owner_id, source_link_id, ical_uid, title, starts_at, ends_at, canonical_source_kind) VALUES ($1, $2, $3, $4, 'calendar access', '2026-01-01', '2026-01-02', 'google') ON CONFLICT DO NOTHING",
            id, owner, link, id.to_string(),
        ).execute(pool).await?;
        if index == 1 {
            sqlx::query!(
                "INSERT INTO macro_user_links (primary_macro_id, child_macro_id, link_id) VALUES ('macro|user-1@test.com', 'macro|other@test.com', $1) ON CONFLICT DO NOTHING",
                link,
            ).execute(pool).await?;
        }
        ids.push(id);
    }
    Ok(ids)
}

#[sqlx::test(
    fixtures(
        path = "../../../../../../macro_db_client/fixtures",
        scripts("mixed_items_expanded")
    ),
    fixtures(path = ".", scripts("access")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn calendar_owner_or_linked_account_only(pool: Pool<Postgres>) -> anyhow::Result<()> {
    let ids = seed_calendar_access(&pool).await?;
    for filter in [EntityFilterAst::mock_empty(), calendar_filter()] {
        let items = expanded_dynamic_cursor_soup_grouped(
            &pool,
            GroupedDynamicCursorArgs {
                user_id: MacroUserIdStr::parse_from_str("macro|user-1@test.com")?,
                limit: 50,
                cursor: Query::Sort(SimpleSortMethod::ViewedAt, filter),
                exclude_frecency: false,
                grouping: GroupingConfig {
                    field: GroupByField::EntityType,
                    group_key: None,
                    per_group_limit: None,
                },
            },
        )
        .await?
        .filter(|i| i.key == "calendar_event")
        .collect::<Vec<_>>();
        assert_eq!(
            items.iter().map(|i| i.item.id()).collect::<Vec<_>>(),
            vec![ids[1], ids[0]]
        );
        for (index, item) in items.iter().enumerate() {
            assert_eq!(item.total_group_count, 2);
            assert_eq!(item.index_in_group, index + 1);
        }
    }
    Ok(())
}

#[sqlx::test(
    fixtures(
        path = "../../../../../../macro_db_client/fixtures",
        scripts("mixed_items_expanded")
    ),
    fixtures(path = ".", scripts("access")),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn directory_counts_match_authorized_memberships(pool: Pool<Postgres>) -> anyhow::Result<()> {
    use crate::domain::models::GroupedSortRequest;
    use crate::outbound::pg_soup_repo::expanded::dynamic::grouped_directory;
    let request = |user| GroupedSortRequest {
        user_id: MacroUserIdStr::parse_from_str(user).unwrap(),
        limit: 1,
        cursor: Query::Sort(SimpleSortMethod::UpdatedAt, EntityFilterAst::mock_empty()),
        grouping: GroupingConfig {
            field: GroupByField::EntityType,
            group_key: None,
            per_group_limit: None,
        },
    };
    let groups = grouped_directory(&pool, request("macro|user-1@test.com")).await?;
    for (key, count) in [("document", 5), ("chat", 4), ("project", 4)] {
        assert_eq!(
            groups
                .iter()
                .find(|group| group.key == key)
                .unwrap()
                .total_count,
            count
        );
    }
    assert!(
        grouped_directory(&pool, request("macro|inaccessible@test.com"))
            .await?
            .is_empty()
    );
    Ok(())
}

#[sqlx::test(
    fixtures(
        path = "../../../../../../macro_db_client/fixtures",
        scripts("mixed_items_expanded")
    ),
    migrator = "MACRO_DB_MIGRATIONS"
)]
async fn directory_binds_document_id_filters_after_fixed_parameters(
    pool: Pool<Postgres>,
) -> anyhow::Result<()> {
    let filter = EntityFilterAst {
        document_filter: Some(Arc::new(Expr::or(
            Expr::val(DocumentLiteral::Id(Uuid::parse_str(
                "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            )?)),
            Expr::val(DocumentLiteral::Id(Uuid::parse_str(
                "11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            )?)),
        ))),
        ..EntityFilterAst::mock_empty()
    };
    let groups = crate::outbound::pg_soup_repo::expanded::dynamic::grouped_directory(
        &pool,
        crate::domain::models::GroupedSortRequest {
            user_id: MacroUserIdStr::parse_from_str("macro|user-1@test.com")?,
            limit: 1,
            cursor: Query::Sort(SimpleSortMethod::UpdatedAt, filter),
            grouping: GroupingConfig {
                field: GroupByField::EntityType,
                group_key: None,
                per_group_limit: None,
            },
        },
    )
    .await?;
    assert_eq!(
        groups
            .iter()
            .find(|group| group.key == "document")
            .unwrap()
            .total_count,
        2
    );
    Ok(())
}
