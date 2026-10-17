//! Native channel/author invariants across authoritative WhatsApp identity facts.
use super::*;
use meta_messaging::domain::events::IdentityUpdate;
use sha2::Digest;

fn update(
    c: &Connection,
    previous: &str,
    current: &str,
    previous_phone: Option<&str>,
    phone: Option<&str>,
    timestamp: chrono::DateTime<Utc>,
) -> IdentityUpdate {
    IdentityUpdate {
        provenance: Provenance::Customer,
        account_id: c.account_id.clone(),
        previous: previous.to_owned().try_into().unwrap(),
        current: current.to_owned().try_into().unwrap(),
        previous_phone: previous_phone.map(|p| p.to_owned().try_into().unwrap()),
        phone: phone.map(|p| p.to_owned().try_into().unwrap()),
        timestamp,
    }
}
fn message(
    c: &Connection,
    id: &str,
    customer: &str,
    phone: Option<&str>,
    at: chrono::DateTime<Utc>,
) -> IncomingMessage {
    let mut m = incoming(c, id);
    m.customer_id = customer.to_owned().try_into().unwrap();
    m.customer_phone = phone.map(|p| p.to_owned().try_into().unwrap());
    m.timestamp = at;
    m
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn authoritative_phone_bsuid_pairs_keep_channel_and_author_and_reject_recycled_phones(
    pool: PgPool,
) {
    let (native, c, _) = setup(&pool, Provider::Whatsapp).await;
    let at = Utc::now();
    let repo = PgMessagingRepository::new(pool.clone());
    native
        .ingest(
            &c,
            &message(&c, "phone-first", "15550000001", Some("15550000001"), at),
            vec![],
        )
        .await
        .unwrap();
    let (channel, first) = repo.message_target(c.id, "phone-first").await.unwrap();
    let sender = sqlx::query_scalar!(
        "SELECT external_sender_id FROM meta_messaging_conversation WHERE channel_id=$1",
        channel
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    native
        .ingest(
            &c,
            &message(&c, "bsuid-next", "US.A", Some("15550000001"), at),
            vec![],
        )
        .await
        .unwrap();
    assert_eq!(
        repo.message_target(c.id, "bsuid-next").await.unwrap().0,
        channel
    );
    assert_eq!(
        repo.conversation(channel)
            .await
            .unwrap()
            .unwrap()
            .customer_id
            .as_str(),
        "US.A"
    );
    assert_eq!(
        sqlx::query_scalar!(
            "SELECT external_sender_id FROM meta_messaging_conversation WHERE channel_id=$1",
            channel
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        sender
    );
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.A",
                "US.B",
                Some("15550000001"),
                None,
                at + chrono::Duration::seconds(1),
            ),
        )
        .await
        .unwrap();
    assert_eq!(
        repo.conversation(channel)
            .await
            .unwrap()
            .unwrap()
            .customer_phone,
        None
    );
    native
        .ingest(
            &c,
            &message(&c, "late-old", "15550000001", Some("15550000001"), at),
            vec![],
        )
        .await
        .unwrap();
    assert_eq!(
        repo.message_target(c.id, "late-old").await.unwrap().0,
        channel
    );
    assert!(
        native
            .ingest(
                &c,
                &message(
                    &c,
                    "recycled",
                    "15550000001",
                    Some("15550000001"),
                    at + chrono::Duration::seconds(2)
                ),
                vec![]
            )
            .await
            .is_err()
    );
    assert!(
        native
            .ingest(
                &c,
                &message(
                    &c,
                    "conflict",
                    "US.OTHER",
                    Some("15550000001"),
                    at + chrono::Duration::seconds(2)
                ),
                vec![]
            )
            .await
            .is_err()
    );
    assert_eq!(
        repo.message_target(c.id, "phone-first").await.unwrap(),
        (channel, first)
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn reversed_identity_edges_and_late_old_phone_observations_keep_the_latest_route(
    pool: PgPool,
) {
    let (native, c, _) = setup(&pool, Provider::Whatsapp).await;
    let at = Utc::now();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.B",
                "US.C",
                None,
                Some("15550000003"),
                at + chrono::Duration::seconds(2),
            ),
        )
        .await
        .unwrap();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.A",
                "US.B",
                Some("15550000001"),
                Some("15550000002"),
                at + chrono::Duration::seconds(1),
            ),
        )
        .await
        .unwrap();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.B",
                "US.C",
                None,
                Some("15550000003"),
                at + chrono::Duration::seconds(2),
            ),
        )
        .await
        .unwrap();
    native
        .ingest(
            &c,
            &message(&c, "late-a", "US.A", Some("15550000001"), at),
            vec![],
        )
        .await
        .unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, _) = repo.message_target(c.id, "late-a").await.unwrap();
    let latest = repo.conversation(channel).await.unwrap().unwrap();
    assert_eq!(latest.customer_id.as_str(), "US.C");
    assert_eq!(latest.customer_phone.as_deref(), Some("15550000003"));
    native
        .observe_identity(
            &c,
            &"US.C".to_owned().try_into().unwrap(),
            Some(&"15550000004".to_owned().try_into().unwrap()),
            at + chrono::Duration::seconds(4),
        )
        .await
        .unwrap();
    native
        .observe_identity(
            &c,
            &"US.C".to_owned().try_into().unwrap(),
            Some(&"15550000003".to_owned().try_into().unwrap()),
            at + chrono::Duration::seconds(3),
        )
        .await
        .unwrap();
    assert_eq!(
        repo.conversation(channel)
            .await
            .unwrap()
            .unwrap()
            .customer_phone
            .as_deref(),
        Some("15550000004")
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn system_change_links_legacy_previous_phone_and_current_phone_without_merging_two_histories(
    pool: PgPool,
) {
    let (native, c, _) = setup(&pool, Provider::Whatsapp).await;
    let at = Utc::now();
    let repo = PgMessagingRepository::new(pool.clone());
    native
        .ingest(
            &c,
            &message(&c, "legacy", "15550000001", Some("15550000001"), at),
            vec![],
        )
        .await
        .unwrap();
    let (channel, _) = repo.message_target(c.id, "legacy").await.unwrap();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.A",
                "US.B",
                Some("15550000001"),
                Some("15550000002"),
                at + chrono::Duration::seconds(1),
            ),
        )
        .await
        .unwrap();
    native
        .ingest(
            &c,
            &message(
                &c,
                "current",
                "US.B",
                None,
                at + chrono::Duration::seconds(2),
            ),
            vec![],
        )
        .await
        .unwrap();
    assert_eq!(
        repo.message_target(c.id, "current").await.unwrap().0,
        channel
    );
    // A new account has an independent alias namespace.
    let mut other = c.clone();
    other.id = Uuid::now_v7();
    other.account_id = "other-business".to_owned().try_into().unwrap();
    let other = repo.connect(&other, b"test", None).await.unwrap();
    native
        .observe_identity(&other, &"US.B".to_owned().try_into().unwrap(), None, at)
        .await
        .unwrap();
    native
        .ingest(
            &other,
            &message(
                &other,
                "phone-new-first",
                "15550000002",
                Some("15550000002"),
                at,
            ),
            vec![],
        )
        .await
        .unwrap();
    let (other_channel, _) = repo
        .message_target(other.id, "phone-new-first")
        .await
        .unwrap();
    native
        .update_identity(
            &other,
            &update(
                &other,
                "US.A",
                "US.B",
                None,
                Some("15550000002"),
                at + chrono::Duration::seconds(1),
            ),
        )
        .await
        .unwrap();
    assert_eq!(
        repo.conversation(other_channel)
            .await
            .unwrap()
            .unwrap()
            .customer_id
            .as_str(),
        "US.B"
    );
    assert_ne!(channel, other_channel);
    native
        .ingest(
            &other,
            &message(&other, "other-history", "US.X", None, at),
            vec![],
        )
        .await
        .unwrap();
    assert!(
        native
            .update_identity(
                &other,
                &update(
                    &other,
                    "US.X",
                    "US.B",
                    None,
                    Some("15550000002"),
                    at + chrono::Duration::seconds(2)
                )
            )
            .await
            .is_err()
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn updates_before_first_message_retire_old_phones_and_preserve_pending_tombstones(
    pool: PgPool,
) {
    let (native, c, _) = setup(&pool, Provider::Whatsapp).await;
    let at = Utc::now();
    native
        .update_identity(
            &c,
            &update(&c, "15550000001", "US.B", Some("15550000001"), None, at),
        )
        .await
        .unwrap();
    assert!(
        native
            .ingest(
                &c,
                &message(
                    &c,
                    "recycled",
                    "15550000001",
                    Some("15550000001"),
                    at + chrono::Duration::seconds(1)
                ),
                vec![]
            )
            .await
            .is_err()
    );
    let revision = IncomingRevision {
        provenance: Provenance::Customer,
        account_id: c.account_id.clone(),
        customer_id: "US.X".to_owned().try_into().unwrap(),
        message_id: "deleted-before-original".to_owned().try_into().unwrap(),
        direction: Direction::Inbound,
        timestamp: at,
        change: MessageRevision::Deleted,
    };
    native.revise(&c, &revision).await.unwrap();
    native
        .update_identity(&c, &update(&c, "US.X", "US.Y", None, None, at))
        .await
        .unwrap();
    native
        .ingest(
            &c,
            &message(&c, "deleted-before-original", "US.Y", None, at),
            vec![],
        )
        .await
        .unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, id) = repo
        .message_target(c.id, "deleted-before-original")
        .await
        .unwrap();
    assert!(
        PgMessageRepository::new(pool)
            .get(&MessageParent::Channel(channel), id)
            .await
            .unwrap()
            .unwrap()
            .deleted_at
            .is_some()
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn accepted_recovery_keeps_current_routing_after_rename_and_connector_departure(
    pool: PgPool,
) {
    let (native, c, _) = setup(&pool, Provider::Whatsapp).await;
    let at = Utc::now();
    native
        .ingest(
            &c,
            &message(&c, "start", "US.A", Some("15550000001"), at),
            vec![],
        )
        .await
        .unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, _) = repo.message_target(c.id, "start").await.unwrap();
    let stale = repo.conversation(channel).await.unwrap().unwrap();
    let request = SendReply {
        idempotency_key: Uuid::now_v7(),
        message: ReplyContent::Text {
            text: "accepted before leaving".into(),
        },
        reply_to: None,
        human_support: false,
    };
    repo.enqueue_send(
        c.id,
        channel,
        &c.user_id,
        &request,
        &sha2::Sha256::digest(b"accepted-identity"),
    )
    .await
    .unwrap();
    let work = repo.claim_send().await.unwrap().unwrap();
    let provider: ProviderId = "accepted-identity".to_owned().try_into().unwrap();
    repo.settle_send(
        &work.lease,
        DeliveryState::Accepted,
        Some(&provider),
        None,
        None,
    )
    .await
    .unwrap();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.A",
                "US.B",
                Some("15550000001"),
                Some("15550000002"),
                at + chrono::Duration::seconds(1),
            ),
        )
        .await
        .unwrap();
    sqlx::query!(
        "DELETE FROM team_user WHERE team_id=$1 AND user_id=$2",
        c.team_id,
        c.user_id
    )
    .execute(&pool)
    .await
    .unwrap();
    repo.disconnect(c.team_id, c.id).await.unwrap();
    native
        .sent(&work, &stale, &(&c).into(), &provider)
        .await
        .unwrap();
    native
        .sent(&work, &stale, &(&c).into(), &provider)
        .await
        .unwrap();
    let latest = repo.conversation(channel).await.unwrap().unwrap();
    assert_eq!(latest.customer_id.as_str(), "US.B");
    assert_eq!(latest.customer_phone.as_deref(), Some("15550000002"));
    assert_eq!(
        repo.message_target(c.id, provider.as_str())
            .await
            .unwrap()
            .0,
        channel
    );
    assert!(repo.claim_send().await.unwrap().is_none());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn reversed_three_edge_chain_uses_each_successor_boundary_for_retired_phones(pool: PgPool) {
    let (native, c, _) = setup(&pool, Provider::Whatsapp).await;
    let at = Utc::now();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.C",
                "US.D",
                None,
                None,
                at + chrono::Duration::seconds(30),
            ),
        )
        .await
        .unwrap();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.B",
                "US.C",
                None,
                None,
                at + chrono::Duration::seconds(20),
            ),
        )
        .await
        .unwrap();
    native
        .update_identity(
            &c,
            &update(
                &c,
                "US.A",
                "US.B",
                None,
                Some("15550000002"),
                at + chrono::Duration::seconds(10),
            ),
        )
        .await
        .unwrap();
    native
        .ingest(
            &c,
            &message(
                &c,
                "late-intermediate",
                "15550000002",
                Some("15550000002"),
                at + chrono::Duration::seconds(15),
            ),
            vec![],
        )
        .await
        .unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, _) = repo
        .message_target(c.id, "late-intermediate")
        .await
        .unwrap();
    assert_eq!(
        repo.conversation(channel)
            .await
            .unwrap()
            .unwrap()
            .customer_id
            .as_str(),
        "US.D"
    );
    assert!(
        native
            .ingest(
                &c,
                &message(
                    &c,
                    "recycled-intermediate",
                    "15550000002",
                    Some("15550000002"),
                    at + chrono::Duration::seconds(25)
                ),
                vec![]
            )
            .await
            .is_err()
    );
}
