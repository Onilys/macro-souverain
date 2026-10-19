use super::*;

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn moving_a_discussion_carries_threads_and_replies_and_detaches_anchors(pool: PgPool) {
    setup(&pool).await;
    let repo = PgMessageRepository::new(pool.clone());
    let task = MessageParent::parse("document", "message-doc-a").unwrap();
    let other = MessageParent::parse("document", "message-doc-b").unwrap();
    let initiative = MessageParent::Initiative(macro_uuid::generate_uuid_v7());

    let general = repo
        .create(command("message-doc-a", None, "general"))
        .await
        .unwrap();
    repo.create(command("message-doc-a", Some(general.id), "reply"))
        .await
        .unwrap();
    let mut anchored = command("message-doc-a", None, "inline");
    anchored.input.anchor = Some(NewThreadAnchor::Markdown {
        mark_id: Uuid::from_u128(301),
        marked_text: None,
    });
    let anchored = repo.create(anchored).await.unwrap();
    let untouched = repo
        .create(command("message-doc-b", None, "elsewhere"))
        .await
        .unwrap();

    let moved = repo.move_discussions(&task, &initiative).await.unwrap();

    assert_eq!(moved, 3);
    assert!(repo.get(&task, general.id).await.unwrap().is_none());
    assert_eq!(
        repo.replies(&initiative, general.id).await.unwrap()[0].content,
        "reply"
    );
    let general_thread = repo.thread(&initiative, general.id).await.unwrap().unwrap();
    assert!(general_thread.anchor.is_none());
    let anchored_thread = repo
        .thread(&initiative, anchored.id)
        .await
        .unwrap()
        .unwrap();
    assert!(anchored_thread.anchor.is_none());
    assert!(repo.get(&other, untouched.id).await.unwrap().is_some());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn moving_a_parent_without_discussions_moves_nothing(pool: PgPool) {
    setup(&pool).await;
    let repo = PgMessageRepository::new(pool);
    let moved = repo
        .move_discussions(
            &MessageParent::parse("document", "message-doc-a").unwrap(),
            &MessageParent::Initiative(macro_uuid::generate_uuid_v7()),
        )
        .await
        .unwrap();
    assert_eq!(moved, 0);
}
