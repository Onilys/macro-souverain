use super::*;
use crate::domain::models::{
    ImportTargetKey, ImportTargetKind, SlackConversationId, SlackWorkspaceId,
};
use crate::domain::ports::CanonicalImportRepo;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use macro_user_id::cowlike::CowLike;

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn team_members_returns_only_the_requested_roster(pool: PgPool) {
    let owner = ledger_actor(&pool, "roster-owner").await;
    let peer = ledger_actor(&pool, "roster-peer").await;
    let outsider = ledger_actor(&pool, "roster-outsider").await;
    let team = ledger_team(&pool, &owner).await;
    join_ledger_team(&pool, &peer, team).await;
    ledger_team(&pool, &outsider).await;
    let repo = PgImportRepo::new(pool);

    let members = repo.team_members(team).await.unwrap();
    assert_eq!(members.len(), 2);
    assert!(members.contains(&owner));
    assert!(members.contains(&peer));
    assert!(repo.team_members(Uuid::now_v7()).await.unwrap().is_empty());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn run_inserts_running_without_an_error(pool: PgPool) {
    let actor = ledger_actor(&pool, "run-insert").await;
    let repo = PgImportRepo::new(pool);
    assert!(repo.list_runs(&actor).await.unwrap().is_empty());
    assert!(
        repo.start_run(&actor, ImportSource::Slack, &[])
            .await
            .unwrap()
    );

    let runs = repo.list_runs(&actor).await.unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].source, ImportSource::Slack);
    assert_eq!(runs[0].status, RunStatus::Running);
    assert!(runs[0].error.is_none());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn run_restarts_terminal_runs_and_clears_their_error(pool: PgPool) {
    let repo = PgImportRepo::new(pool.clone());
    let from = [
        RunStatus::Ready,
        RunStatus::Completed,
        RunStatus::Failed,
        RunStatus::Dismissed,
    ];
    for status in from {
        let actor = ledger_actor(&pool, status.as_ref()).await;
        assert!(
            repo.start_run(&actor, ImportSource::Slack, &[])
                .await
                .unwrap()
        );
        assert!(
            repo.finish_run(&actor, ImportSource::Slack, status, Some("previous error"))
                .await
                .unwrap()
        );

        assert!(
            repo.start_run(&actor, ImportSource::Slack, &from)
                .await
                .unwrap()
        );
        let runs = repo.list_runs(&actor).await.unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, RunStatus::Running);
        assert!(runs[0].error.is_none());
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn run_does_not_take_over_a_running_run(pool: PgPool) {
    let actor = ledger_actor(&pool, "run-active").await;
    let repo = PgImportRepo::new(pool);
    let from = [
        RunStatus::Ready,
        RunStatus::Completed,
        RunStatus::Failed,
        RunStatus::Dismissed,
    ];
    assert!(
        repo.start_run(&actor, ImportSource::Slack, &[])
            .await
            .unwrap()
    );
    let before = repo.list_runs(&actor).await.unwrap().pop().unwrap();
    assert!(
        !repo
            .start_run(&actor, ImportSource::Slack, &from)
            .await
            .unwrap()
    );
    let after = repo.list_runs(&actor).await.unwrap().pop().unwrap();
    assert_eq!(after.status, RunStatus::Running);
    assert_eq!(after.updated_at, before.updated_at);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn runs_left_running_or_importing_are_reaped_once_stale(pool: PgPool) {
    let stale = ledger_actor(&pool, "stale-run").await;
    let legacy = ledger_actor(&pool, "legacy-run").await;
    let fresh = ledger_actor(&pool, "fresh-run").await;
    let repo = PgImportRepo::new(pool.clone());
    for actor in [&stale, &legacy, &fresh] {
        assert!(
            repo.start_run(actor, ImportSource::Slack, &[])
                .await
                .unwrap()
        );
    }
    sqlx::query!(
        "UPDATE import_run SET updated_at = NOW() - interval '1 hour' WHERE user_id = $1",
        stale.as_ref(),
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query!(
        r#"
        UPDATE import_run SET status = 'importing', updated_at = NOW() - interval '1 hour'
        WHERE user_id = $1
        "#,
        legacy.as_ref(),
    )
    .execute(&pool)
    .await
    .unwrap();

    for actor in [&stale, &legacy] {
        assert_eq!(repo.fail_stale_runs(actor, 600).await.unwrap(), 1);
        let run = repo.list_runs(actor).await.unwrap().pop().unwrap();
        assert_eq!(run.status, RunStatus::Failed);
        assert_eq!(
            run.error.as_deref(),
            Some("discovery was interrupted — try again")
        );
        // A reaped run is terminal, so discovery can start again.
        assert!(
            repo.start_run(actor, ImportSource::Slack, &[RunStatus::Failed])
                .await
                .unwrap()
        );
    }

    assert_eq!(repo.fail_stale_runs(&fresh, 600).await.unwrap(), 0);
    assert_eq!(
        repo.list_runs(&fresh).await.unwrap()[0].status,
        RunStatus::Running
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn staged_manual_entity_round_trips(pool: PgPool) {
    let actor = ledger_actor(&pool, "manual-entity").await;
    let repo = PgImportRepo::new(pool);
    let metadata = serde_json::json!({"name": "general", "channel_id": "C123"});
    let row = repo
        .upsert_staged(
            &actor,
            ImportSource::Slack,
            ImportKind::Channel,
            Initiator::Manual,
            "C123",
            &metadata,
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.initiator, Initiator::Manual);
    assert_eq!(row.status, ImportStatus::Staged);
    let stored = repo.get(&actor, row.id).await.unwrap().unwrap();
    assert_eq!(stored.initiator, Initiator::Manual);
    assert_eq!(stored.metadata, metadata);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn read_only_targets_are_exact_scoped_and_never_reserve(pool: PgPool) {
    use crate::domain::{models::ImportTargetLookup, ports::ImportTargetReader};
    let admin = ledger_actor(&pool, "reader").await;
    let peer = ledger_actor(&pool, "other-reader").await;
    let team = ledger_team(&pool, &admin).await;
    let other_team = ledger_team(&pool, &peer).await;
    let repo = PgImportRepo::new(pool.clone());
    let binding = repo
        .bind_source(team, Some(&SlackWorkspaceId::new("T1").unwrap()), false)
        .await
        .unwrap();
    let other_binding = repo
        .bind_source(
            other_team,
            Some(&SlackWorkspaceId::new("T2").unwrap()),
            false,
        )
        .await
        .unwrap();
    let channel = Uuid::now_v7();
    let other_channel = Uuid::now_v7();
    ledger_channel(&pool, channel, Some(team), ImportTargetKind::Team).await;
    ledger_channel(
        &pool,
        other_channel,
        Some(other_team),
        ImportTargetKind::Team,
    )
    .await;
    legacy_mapping(&repo, &admin, &target_key(team, "C1"), channel).await;
    legacy_mapping(&repo, &peer, &target_key(other_team, "C1"), other_channel).await;
    repo.reserve_target(
        &admin,
        &target_key(team, "C2"),
        ImportTargetKind::Team,
        None,
    )
    .await
    .unwrap();
    let ids: Vec<_> = ["C1", "C2", "C3"]
        .map(|id| SlackConversationId::new(id).unwrap())
        .into();
    let before = sqlx::query_scalar!("SELECT count(*) FROM import_target_reservation")
        .fetch_one(&pool)
        .await
        .unwrap();
    let rows = repo.lookup_targets(team, &binding, &ids).await.unwrap();
    assert!(
        matches!(&rows[0], ImportTargetLookup::Ready { channel_id, .. } if *channel_id == channel)
    );
    assert_eq!(
        rows[1..],
        [ImportTargetLookup::Pending, ImportTargetLookup::Missing]
    );
    assert!(
        matches!(&repo.lookup_targets(other_team, &other_binding, &ids).await.unwrap()[0], ImportTargetLookup::Ready { channel_id, .. } if *channel_id == other_channel)
    );
    assert_eq!(
        repo.lookup_targets(team, &other_binding, &ids)
            .await
            .unwrap(),
        vec![ImportTargetLookup::Missing; 3]
    );
    assert_eq!(
        before,
        sqlx::query_scalar!("SELECT count(*) FROM import_target_reservation")
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    // Same-name or ambiguous legacy rows cannot select an arbitrary channel.
    let conflict = Uuid::now_v7();
    ledger_channel(&pool, conflict, Some(team), ImportTargetKind::Team).await;
    let third = ledger_actor(&pool, "conflicting-reader").await;
    legacy_mapping(&repo, &third, &target_key(team, "C1"), conflict).await;
    assert_eq!(
        repo.lookup_targets(team, &binding, &ids).await.unwrap()[0],
        ImportTargetLookup::Missing
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn rows_record_their_kind_and_legacy_rows_read_as_the_source_default(pool: PgPool) {
    let actor = ledger_actor(&pool, "kinds").await;
    let repo = PgImportRepo::new(pool.clone());
    let database = repo
        .upsert_staged(
            &actor,
            ImportSource::Notion,
            ImportKind::Database,
            Initiator::Chat,
            "0123456789abcdef0123456789abcdef",
            &serde_json::json!({"title": "Roadmap"}),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(database.kind, ImportKind::Database);
    assert_eq!(database.parent_id, None);
    assert_eq!(database.review_id, None);

    // A replica still running code from before `kind` existed writes NULL.
    let legacy = sqlx::query_scalar!(
        r#"
        INSERT INTO import_entity (user_id, source, foreign_id, status, initiator, metadata)
        VALUES ($1, 'linear', 'ENG-1', 'staged', 'chat', '{"title": "Legacy"}')
        RETURNING id
        "#,
        actor.as_ref(),
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        repo.get(&actor, legacy).await.unwrap().unwrap().kind,
        ImportKind::Issue
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn a_kind_from_another_source_is_rejected(pool: PgPool) {
    let actor = ledger_actor(&pool, "wrong-kind").await;
    let repo = PgImportRepo::new(pool);
    let result = repo
        .upsert_staged(
            &actor,
            ImportSource::Notion,
            ImportKind::Issue,
            Initiator::Chat,
            "0123456789abcdef0123456789abcdef",
            &serde_json::json!({"title": "Roadmap"}),
        )
        .await;
    assert!(matches!(result, Err(ImportError::Db(_))), "{result:?}");
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn a_team_keeps_one_copy_of_each_notion_object(pool: PgPool) {
    let owner = ledger_actor(&pool, "notion-owner").await;
    let teammate = ledger_actor(&pool, "notion-teammate").await;
    let team = ledger_team(&pool, &owner).await;
    join_ledger_team(&pool, &teammate, team).await;
    let repo = PgImportRepo::new(pool);
    let page = "0123456789abcdef0123456789abcdef";

    repo.upsert_imported(
        &owner,
        ImportSource::Notion,
        ImportKind::Page,
        Initiator::Chat,
        page,
        &serde_json::json!({"title": "Handbook"}),
        "doc-1",
        "md",
        Some(team),
    )
    .await
    .unwrap();
    let duplicate = repo
        .upsert_imported(
            &teammate,
            ImportSource::Notion,
            ImportKind::Page,
            Initiator::Chat,
            page,
            &serde_json::json!({"title": "Handbook"}),
            "doc-2",
            "md",
            Some(team),
        )
        .await;
    assert!(
        matches!(duplicate, Err(ImportError::Db(_))),
        "{duplicate:?}"
    );

    // Without a team scope each user keeps their own row, as before.
    repo.upsert_imported(
        &teammate,
        ImportSource::Notion,
        ImportKind::Page,
        Initiator::Chat,
        page,
        &serde_json::json!({"title": "Handbook"}),
        "doc-3",
        "md",
        None,
    )
    .await
    .unwrap();
}

async fn ledger_actor(pool: &PgPool, label: &str) -> MacroUserIdStr<'static> {
    let id = Uuid::now_v7();
    let email = format!("{label}@example.com");
    let user_id = format!("macro|{email}");
    sqlx::query!(
        "INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $3, $2)",
        id,
        label,
        email,
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO \"User\" (id, email, macro_user_id) VALUES ($1, $2, $3)",
        user_id,
        email,
        id,
    )
    .execute(pool)
    .await
    .unwrap();
    MacroUserIdStr::parse_from_str(&user_id)
        .unwrap()
        .into_owned()
}

async fn ledger_team(pool: &PgPool, owner: &MacroUserIdStr<'static>) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query!(
        "INSERT INTO team (id, name, owner_id) VALUES ($1, 'Ledger test', $2)",
        id,
        owner.as_ref(),
    )
    .execute(pool)
    .await
    .unwrap();
    join_ledger_team(pool, owner, id).await;
    id
}

async fn join_ledger_team(pool: &PgPool, user: &MacroUserIdStr<'static>, team: Uuid) {
    sqlx::query!(
        r#"INSERT INTO team_user (user_id, team_id, team_role) VALUES ($1, $2, 'admin')
           ON CONFLICT (user_id) DO UPDATE SET team_id = EXCLUDED.team_id"#,
        user.as_ref(),
        team,
    )
    .execute(pool)
    .await
    .unwrap();
}

fn target_key(team_id: Uuid, foreign_id: &str) -> ImportTargetKey {
    ImportTargetKey {
        team_id,
        foreign_id: SlackConversationId::new(foreign_id).unwrap(),
    }
}

async fn ledger_channel(pool: &PgPool, id: Uuid, team: Option<Uuid>, kind: ImportTargetKind) {
    sqlx::query!(
        r#"INSERT INTO comms_channels (id, name, channel_type, team_id, owner_id)
           VALUES ($1, CASE WHEN $2 = 'direct_message' THEN NULL ELSE 'Historical' END,
                   $2::comms_channel_type, $3, 'macro|admin@example.com')"#,
        id,
        kind.as_ref() as &str,
        team,
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn legacy_mapping(
    repo: &PgImportRepo,
    user: &MacroUserIdStr<'static>,
    key: &ImportTargetKey,
    channel_id: Uuid,
) {
    repo.upsert_imported(
        user,
        ImportSource::Slack,
        ImportKind::Channel,
        Initiator::Manual,
        key.foreign_id.as_str(),
        &serde_json::json!({"name": "Historical"}),
        &channel_id.to_string(),
        "channel",
        Some(key.team_id),
    )
    .await
    .unwrap();
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn two_admins_reserve_one_recoverable_uuid(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let peer = ledger_actor(&pool, "peer").await;
    let team = ledger_team(&pool, &admin).await;
    join_ledger_team(&pool, &peer, team).await;
    let repo = PgImportRepo::new(pool.clone());
    let key = target_key(team, "C123");
    let (a, b) = tokio::join!(
        repo.reserve_target(&admin, &key, ImportTargetKind::Team, None),
        repo.reserve_target(&peer, &key, ImportTargetKind::Team, None),
    );
    let reserved = a.unwrap();
    assert_eq!(reserved, b.unwrap());
    assert!(!reserved.ready);
    assert_eq!(reserved.channel_id.get_version_num(), 7);
    assert_eq!(
        PgImportRepo::new(pool.clone())
            .reserve_target(&admin, &key, ImportTargetKind::Team, None)
            .await
            .unwrap(),
        reserved,
        "a new repository instance recovers the committed pending UUID"
    );
    assert!(matches!(
        repo.complete_target(&key, reserved.channel_id, ImportTargetKind::Team)
            .await,
        Err(ImportError::TargetConflict)
    ));
    ledger_channel(
        &pool,
        reserved.channel_id,
        Some(team),
        ImportTargetKind::Team,
    )
    .await;
    // Simulate a crash after creation but before completion.
    assert_eq!(
        repo.reserve_target(&peer, &key, ImportTargetKind::Team, None)
            .await
            .unwrap(),
        reserved
    );
    assert!(matches!(
        repo.complete_target(&key, Uuid::now_v7(), ImportTargetKind::Team)
            .await,
        Err(ImportError::TargetConflict)
    ));
    let (a, b) = tokio::join!(
        repo.complete_target(&key, reserved.channel_id, ImportTargetKind::Team),
        repo.complete_target(&key, reserved.channel_id, ImportTargetKind::Team),
    );
    assert_eq!(a.as_ref().unwrap(), b.as_ref().unwrap());
    assert!(a.unwrap().ready);
    assert!(
        repo.reserve_target(&peer, &key, ImportTargetKind::Team, None)
            .await
            .unwrap()
            .ready
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn reservations_find_own_and_explicit_team_mappings(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let peer = ledger_actor(&pool, "peer").await;
    let team = ledger_team(&pool, &admin).await;
    join_ledger_team(&pool, &peer, team).await;
    let repo = PgImportRepo::new(pool.clone());
    let key = target_key(team, "COWN");
    let channel = Uuid::now_v7();
    ledger_channel(&pool, channel, Some(team), ImportTargetKind::Team).await;
    legacy_mapping(&repo, &admin, &key, channel).await;
    assert!(
        repo.find_team_imported(&admin, ImportSource::Slack, "COWN")
            .await
            .unwrap()
            .is_none()
    );
    let own = repo
        .reserve_target(&admin, &key, ImportTargetKind::Team, None)
        .await
        .unwrap();
    assert_eq!(own.channel_id, channel);
    assert!(own.ready);

    let other = target_key(team, "CPEER");
    legacy_mapping(&repo, &peer, &other, channel).await;
    let new_owner = ledger_actor(&pool, "new-owner").await;
    let new_team = ledger_team(&pool, &new_owner).await;
    join_ledger_team(&pool, &admin, new_team).await;
    assert!(
        repo.find_team_imported(&admin, ImportSource::Slack, "CPEER")
            .await
            .unwrap()
            .is_none()
    );
    // The explicit scope, not the admin's newly joined team, controls lookup.
    assert_eq!(
        repo.reserve_target(&admin, &other, ImportTargetKind::Team, None)
            .await
            .unwrap()
            .channel_id,
        channel
    );
    assert!(matches!(
        repo.reserve_target(
            &admin,
            &target_key(new_team, "COWN"),
            ImportTargetKind::Team,
            None
        )
        .await,
        Err(ImportError::TargetConflict)
    ));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn conflicting_historical_rows_fail_closed(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let peer = ledger_actor(&pool, "peer").await;
    let third = ledger_actor(&pool, "third").await;
    let team = ledger_team(&pool, &admin).await;
    let repo = PgImportRepo::new(pool.clone());
    let key = target_key(team, "CCONFLICT");
    let first = Uuid::now_v7();
    let second = Uuid::now_v7();
    ledger_channel(&pool, first, Some(team), ImportTargetKind::Team).await;
    ledger_channel(&pool, second, Some(team), ImportTargetKind::Team).await;
    legacy_mapping(&repo, &admin, &key, first).await;
    legacy_mapping(&repo, &peer, &key, first).await;
    // Repeated compatible mappings must not hide a third conflicting mapping.
    legacy_mapping(&repo, &third, &key, second).await;
    assert!(matches!(
        repo.reserve_target(&admin, &key, ImportTargetKind::Team, None)
            .await,
        Err(ImportError::TargetConflict)
    ));
    assert!(matches!(
        repo.complete_target(&key, first, ImportTargetKind::Team)
            .await,
        Err(ImportError::TargetNotReserved)
    ));

    let non_channel = target_key(team, "CNOTCHANNEL");
    repo.upsert_imported(
        &admin,
        ImportSource::Slack,
        ImportKind::Channel,
        Initiator::Chat,
        non_channel.foreign_id.as_str(),
        &serde_json::json!({}),
        &first.to_string(),
        "task",
        Some(team),
    )
    .await
    .unwrap();
    assert!(matches!(
        repo.reserve_target(&admin, &non_channel, ImportTargetKind::Team, None)
            .await,
        Err(ImportError::TargetConflict)
    ));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn names_cannot_claim_slack_ids_and_pending_ids_cannot_be_replaced(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let team = ledger_team(&pool, &admin).await;
    let repo = PgImportRepo::new(pool.clone());
    let channel = Uuid::now_v7();
    ledger_channel(&pool, channel, Some(team), ImportTargetKind::Team).await;
    repo.upsert_imported(
        &admin,
        ImportSource::Slack,
        ImportKind::Channel,
        Initiator::Manual,
        "#C123",
        &serde_json::json!({"name": "C123", "channel_id": "C123"}),
        &channel.to_string(),
        "channel",
        Some(team),
    )
    .await
    .unwrap();
    let key = target_key(team, "C123");
    let reserved = repo
        .reserve_target(&admin, &key, ImportTargetKind::Team, None)
        .await
        .unwrap();
    assert_ne!(reserved.channel_id, channel);
    assert!(!reserved.ready);
    assert!(matches!(
        repo.reserve_target(&admin, &key, ImportTargetKind::Team, Some(channel))
            .await,
        Err(ImportError::TargetConflict)
    ));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn private_and_dm_provenance_stays_out_of_legacy_listing(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let peer = ledger_actor(&pool, "peer").await;
    let team = ledger_team(&pool, &admin).await;
    join_ledger_team(&pool, &peer, team).await;
    let repo = PgImportRepo::new(pool.clone());
    for (source, kind) in [
        ("GPRIVATE", ImportTargetKind::Private),
        ("DDM", ImportTargetKind::DirectMessage),
    ] {
        let key = target_key(team, source);
        let reserved = repo.reserve_target(&admin, &key, kind, None).await.unwrap();
        ledger_channel(&pool, reserved.channel_id, None, kind).await;
        repo.complete_target(&key, reserved.channel_id, kind)
            .await
            .unwrap();
        assert!(
            repo.reserve_target(&peer, &key, kind, None)
                .await
                .unwrap()
                .ready
        );
        assert!(
            repo.find_team_imported(&peer, ImportSource::Slack, source)
                .await
                .unwrap()
                .is_none()
        );
        assert!(repo.list(&peer, None, None).await.unwrap().is_empty());
        assert!(repo.list(&admin, None, None).await.unwrap().is_empty());
        assert!(matches!(
            repo.reserve_target(&admin, &key, ImportTargetKind::Team, None)
                .await,
            Err(ImportError::TargetConflict)
        ));
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn authorized_existing_claims_cannot_cross_teams(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let peer = ledger_actor(&pool, "peer").await;
    let team = ledger_team(&pool, &admin).await;
    let other_team = ledger_team(&pool, &peer).await;
    let repo = PgImportRepo::new(pool.clone());
    let channel = Uuid::now_v7();
    ledger_channel(&pool, channel, None, ImportTargetKind::DirectMessage).await;
    let a_key = target_key(team, "D123");
    let b_key = target_key(other_team, "D123");
    let (a, b) = tokio::join!(
        repo.reserve_target(
            &admin,
            &a_key,
            ImportTargetKind::DirectMessage,
            Some(channel)
        ),
        repo.reserve_target(
            &peer,
            &b_key,
            ImportTargetKind::DirectMessage,
            Some(channel)
        ),
    );
    assert_ne!(
        a.is_ok(),
        b.is_ok(),
        "only one team may establish provenance"
    );
    let (winner, loser) = if a.is_ok() { (a, b) } else { (b, a) };
    assert_eq!(winner.unwrap().channel_id, channel);
    assert!(matches!(loser, Err(ImportError::TargetConflict)));

    let team_channel = Uuid::now_v7();
    ledger_channel(
        &pool,
        team_channel,
        Some(other_team),
        ImportTargetKind::Team,
    )
    .await;
    assert!(matches!(
        repo.reserve_target(
            &admin,
            &target_key(team, "CWRONG"),
            ImportTargetKind::Team,
            Some(team_channel)
        )
        .await,
        Err(ImportError::TargetConflict)
    ));

    let legacy_private = Uuid::now_v7();
    ledger_channel(&pool, legacy_private, None, ImportTargetKind::Private).await;
    legacy_mapping(
        &repo,
        &peer,
        &target_key(other_team, "GOLD"),
        legacy_private,
    )
    .await;
    assert!(matches!(
        repo.reserve_target(
            &admin,
            &target_key(team, "GNEW"),
            ImportTargetKind::Private,
            Some(legacy_private)
        )
        .await,
        Err(ImportError::TargetConflict)
    ));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn private_legacy_mapping_requires_authorized_claim(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let team = ledger_team(&pool, &admin).await;
    let repo = PgImportRepo::new(pool.clone());
    let channel = Uuid::now_v7();
    ledger_channel(&pool, channel, None, ImportTargetKind::Private).await;
    let key = target_key(team, "G123");
    repo.upsert_imported(
        &admin,
        ImportSource::Slack,
        ImportKind::Channel,
        Initiator::Chat,
        "G123",
        &serde_json::json!({}),
        &channel.to_string(),
        "channel",
        None,
    )
    .await
    .unwrap();
    assert!(matches!(
        repo.reserve_target(&admin, &key, ImportTargetKind::Private, None)
            .await,
        Err(ImportError::TargetConflict)
    ));
    let reserved = repo
        .reserve_target(&admin, &key, ImportTargetKind::Private, Some(channel))
        .await
        .unwrap();
    assert_eq!(reserved.channel_id, channel);
    assert!(reserved.ready);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn source_binding_requires_confirmation_and_rejects_second_workspace(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let team = ledger_team(&pool, &admin).await;
    let repo = PgImportRepo::new(pool);
    assert!(repo.source_binding(team).await.unwrap().is_none());
    assert!(matches!(
        repo.bind_source(team, None, false).await,
        Err(ImportError::SourceConfirmationRequired)
    ));
    let unknown = repo.bind_source(team, None, true).await.unwrap();
    assert!(unknown.workspace_id.is_none());
    assert!(unknown.confirmed_unknown_at.is_some());
    assert_eq!(repo.bind_source(team, None, true).await.unwrap(), unknown);
    let workspace = SlackWorkspaceId::new("T123").unwrap();
    let known = repo
        .bind_source(team, Some(&workspace), false)
        .await
        .unwrap();
    assert_eq!(known.workspace_id.as_ref(), Some(&workspace));
    assert_eq!(known.confirmed_unknown_at, unknown.confirmed_unknown_at);
    assert_eq!(
        repo.bind_source(team, Some(&workspace), false)
            .await
            .unwrap(),
        known
    );
    assert!(matches!(
        repo.bind_source(team, None, false).await,
        Err(ImportError::SourceConfirmationRequired)
    ));
    assert_eq!(repo.bind_source(team, None, true).await.unwrap(), known);
    assert!(matches!(
        repo.bind_source(team, Some(&SlackWorkspaceId::new("TSECOND").unwrap()), true)
            .await,
        Err(ImportError::SourceMismatch)
    ));
    assert_eq!(repo.source_binding(team).await.unwrap().unwrap(), known);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn concurrent_different_workspace_bindings_have_one_winner(pool: PgPool) {
    let admin = ledger_actor(&pool, "admin").await;
    let team = ledger_team(&pool, &admin).await;
    let repo = PgImportRepo::new(pool);
    let first = SlackWorkspaceId::new("TFIRST").unwrap();
    let second = SlackWorkspaceId::new("TSECOND").unwrap();
    let (a, b) = tokio::join!(
        repo.bind_source(team, Some(&first), false),
        repo.bind_source(team, Some(&second), false)
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let (winner, loser) = if a.is_ok() { (a, b) } else { (b, a) };
    assert!(matches!(loser, Err(ImportError::SourceMismatch)));
    let known = winner.unwrap();
    assert_eq!(repo.source_binding(team).await.unwrap().unwrap(), known);
    assert!(known.confirmed_unknown_at.is_none());
    let confirmed = repo.bind_source(team, None, true).await.unwrap();
    assert_eq!(confirmed.workspace_id, known.workspace_id);
    assert!(confirmed.confirmed_unknown_at.is_some());
}
