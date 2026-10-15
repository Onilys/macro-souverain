use super::*;

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn delayed_failed_duplicate_cannot_replace_stored_media_with_an_unavailable_notice(
    pool: PgPool,
) {
    let (native, c, _) = setup(&pool, Provider::Instagram).await;
    let source = incoming(&c, "stored-media-race");
    native.ingest(&c, &source, vec![]).await.unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, message) = repo
        .message_target(c.id, source.message_id.as_str())
        .await
        .unwrap();
    let mut stored = pool.begin().await.unwrap();
    PgMessagingRepository::media_state_in(&mut stored, c.id, source.message_id.as_str(), true)
        .await
        .unwrap();
    let duplicate = fixture_native(&pool).await;
    let old_c = c.clone();
    let old_source = source.clone();
    let mut failure =
        tokio::spawn(async move { duplicate.media_unavailable(&old_c, &old_source).await });
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), &mut failure)
            .await
            .is_err()
    );
    stored.commit().await.unwrap();
    failure.await.unwrap().unwrap();
    let stored = PgMessageRepository::new(pool.clone())
        .get(&MessageParent::Channel(channel), message)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.content, source.content);
    assert!(repo.media_stored(c.id, &source.message_id).await.unwrap());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn early_business_echo_is_reattributed_and_late_preview_cannot_attach(pool: PgPool) {
    let (native, c, _) = setup(&pool, Provider::Instagram).await;
    let mut echo = incoming(&c, "early-echo");
    echo.direction = Direction::Outbound;
    echo.provenance = Provenance::PhoneEcho;
    native.ingest(&c, &echo, vec![]).await.unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, message) = repo
        .message_target(c.id, echo.message_id.as_str())
        .await
        .unwrap();
    let reservation = repo
        .reserve_attachment(c.id, echo.message_id.as_str(), 0, &"ab".repeat(32))
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    PgMessageRepository::attach_external_file_in(
        &mut tx,
        channel,
        message,
        c.id,
        echo.message_id.as_str(),
        reservation.document_id,
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let request = SendReply {
        idempotency_key: Uuid::now_v7(),
        message: ReplyContent::Text {
            text: "Original human reply".into(),
        },
        reply_to: None,
        human_support: false,
    };
    repo.enqueue_send(c.id, channel, &c.user_id, &request, &[7; 32])
        .await
        .unwrap();
    let work = repo.claim_send().await.unwrap().unwrap();
    repo.settle_send(
        &work.lease,
        DeliveryState::Accepted,
        Some(&echo.message_id),
        None,
        None,
    )
    .await
    .unwrap();
    let conversation = repo.conversation(channel).await.unwrap().unwrap();
    native
        .sent(&work, &conversation, &(&c).into(), &echo.message_id)
        .await
        .unwrap();
    // Replay either side after acceptance must keep the human author and identity.
    native.ingest(&c, &echo, vec![]).await.unwrap();
    native
        .sent(&work, &conversation, &(&c).into(), &echo.message_id)
        .await
        .unwrap();
    let row = PgMessageRepository::new(pool.clone())
        .get(&MessageParent::Channel(channel), message)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.sender_id.as_ref(), c.user_id);
    assert_eq!(row.content, "Original human reply");
    assert!(
        row.attachments.is_empty(),
        "downloaded echo preview is not the human's attachment"
    );
    assert_eq!(
        repo.sends(channel).await.unwrap()[0].message_id,
        Some(message)
    );
    let mut late = pool.begin().await.unwrap();
    PgMessageRepository::attach_external_file_in(
        &mut late,
        channel,
        message,
        c.id,
        echo.message_id.as_str(),
        reservation.document_id,
    )
    .await
    .unwrap();
    assert!(
        PgMessagingRepository::finish_attachment_in(
            &mut late,
            c.id,
            echo.message_id.as_str(),
            &reservation
        )
        .await
        .is_err()
    );
    late.rollback().await.unwrap();
    assert!(
        PgMessageRepository::new(pool)
            .get(&MessageParent::Channel(channel), message)
            .await
            .unwrap()
            .unwrap()
            .attachments
            .is_empty()
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn accepted_media_replaces_the_echo_preview_with_the_original_document(pool: PgPool) {
    let (native, c, _) = setup(&pool, Provider::Instagram).await;
    let mut echo = incoming(&c, "early-media-echo");
    echo.direction = Direction::Outbound;
    echo.provenance = Provenance::PhoneEcho;
    native.ingest(&c, &echo, vec![]).await.unwrap();
    let repo = PgMessagingRepository::new(pool.clone());
    let (channel, message) = repo
        .message_target(c.id, echo.message_id.as_str())
        .await
        .unwrap();
    let preview = Uuid::now_v7();
    let original = Uuid::now_v7();
    let mut tx = pool.begin().await.unwrap();
    PgMessageRepository::attach_external_file_in(
        &mut tx,
        channel,
        message,
        c.id,
        echo.message_id.as_str(),
        preview,
    )
    .await
    .unwrap();
    PgMessagingRepository::media_state_in(&mut tx, c.id, echo.message_id.as_str(), true)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let request = SendReply {
        idempotency_key: Uuid::now_v7(),
        message: ReplyContent::Media {
            document_id: original,
            kind: MediaKind::Image,
            caption: Some("My image".into()),
        },
        reply_to: None,
        human_support: false,
    };
    repo.enqueue_send(c.id, channel, &c.user_id, &request, &[9; 32])
        .await
        .unwrap();
    let work = repo.claim_send().await.unwrap().unwrap();
    repo.settle_send(
        &work.lease,
        DeliveryState::Accepted,
        Some(&echo.message_id),
        None,
        None,
    )
    .await
    .unwrap();
    let mut accepted = echo.clone();
    accepted.provenance = Provenance::MacroReply;
    accepted.message_type = "macro_media_reply".into();
    accepted.content = "My image".into();
    let author = ChannelSender::new_from_user(MacroUserIdStr::try_from(c.user_id.clone()).unwrap());
    native
        .persist(&c, &accepted, Some(author), Some(work.lease.id))
        .await
        .unwrap();
    assert!(
        !repo.media_stored(c.id, &echo.message_id).await.unwrap(),
        "the old preview must not suppress attachment of the original document"
    );
    let mut tx = pool.begin().await.unwrap();
    for _ in 0..2 {
        PgMessageRepository::attach_external_file_in(
            &mut tx,
            channel,
            message,
            c.id,
            echo.message_id.as_str(),
            original,
        )
        .await
        .unwrap();
    }
    PgMessagingRepository::media_state_in(&mut tx, c.id, echo.message_id.as_str(), true)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let row = PgMessageRepository::new(pool)
        .get(&MessageParent::Channel(channel), message)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.sender_id.as_ref(), c.user_id);
    assert_eq!(row.attachments.len(), 1);
    assert_eq!(row.attachments[0].entity_id, original.to_string());
}
