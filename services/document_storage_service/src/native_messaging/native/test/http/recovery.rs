use super::*;

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn partial_decode_is_durable_without_replaying_successful_siblings_after_reconnect(
    pool: PgPool,
) {
    let f = fixture(&pool, Provider::Whatsapp, None).await;
    let at = connected_time(&f.repo, f.c.id).await;
    let message = |id: &str| json!({"id":id,"from":"customer","type":"text","timestamp":at.timestamp(),"text":{"body":"Valid sibling"}});
    let payload = json!({"object":"whatsapp_business_account","entry":[{"id":"waba","changes":[{"field":"messages","value":{
        "metadata":{"phone_number_id":f.c.account_id},"messages":[message("before"),{"type":"text"},message("after")]
    }}]}]});
    assert_eq!(
        signed(&f.app, Provider::Whatsapp, payload, true).await,
        StatusCode::OK
    );
    let work = f.repo.claim_receipt().await.unwrap().unwrap();
    let batch = webhook::decode(work.provider, &work.payload).unwrap();
    assert_eq!(batch.invalid_items, 1);
    f.service
        .process_receipt_attempt(&work, batch)
        .await
        .unwrap();
    assert!(f.repo.message_target(f.c.id, "before").await.is_ok());
    assert!(f.repo.message_target(f.c.id, "after").await.is_ok());
    let row = sqlx::query!(
        "SELECT status,error_code,payload,decode_failures FROM meta_messaging_receipt WHERE id=$1",
        work.lease.id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.status, "failed");
    assert_eq!(row.decode_failures, 1);
    assert_eq!(row.error_code.as_deref(), Some("invalid_provider_payload"));
    assert_eq!(row.payload, work.payload);
    f.repo.connect(&f.c, b"new", Some(f.c.id)).await.unwrap();
    assert!(f.repo.claim_receipt().await.unwrap().is_none());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn healthy_account_in_the_same_delivery_progresses_while_media_is_blocked(pool: PgPool) {
    let f = fixture(&pool, Provider::Whatsapp, None).await;
    let mut healthy = f.c.clone();
    healthy.id = Uuid::now_v7();
    healthy.account_id = "healthy-account".to_owned().try_into().unwrap();
    let healthy = f.repo.connect(&healthy, b"test", None).await.unwrap();
    let at = connected_time(&f.repo, healthy.id).await;
    let entry = |account: &ProviderId, message: Value| json!({"id":"waba","changes":[{"field":"messages","value":{"metadata":{"phone_number_id":account},"messages":[message]}}]});
    let payload = json!({"object":"whatsapp_business_account","entry":[
        entry(&f.c.account_id,json!({"id":"slow-message","from":"customer","type":"image","timestamp":at.timestamp(),"image":{"id":"slow-test-media"}})),
        entry(&healthy.account_id,json!({"id":"healthy-message","from":"customer","type":"text","timestamp":at.timestamp(),"text":{"body":"Progress while another account waits"}}))
    ]});
    assert_eq!(
        signed(&f.app, Provider::Whatsapp, payload, true).await,
        StatusCode::OK
    );
    let work = f.repo.claim_receipt().await.unwrap().unwrap();
    let batch = webhook::decode(work.provider, &work.payload).unwrap();
    let service = f.service.clone();
    let processing =
        tokio::spawn(async move { service.process_receipt_attempt(&work, batch).await });
    tokio::time::timeout(
        std::time::Duration::from_secs(3),
        f.remote.operation_entered.notified(),
    )
    .await
    .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            if f.repo
                .message_target(healthy.id, "healthy-message")
                .await
                .is_ok()
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("healthy sibling must commit without waiting on the slow media request");
    assert!(!processing.is_finished());
    f.remote.operation_release.notify_one();
    processing.await.unwrap().unwrap();
}
