use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use models_email::service::attachment::AttachmentUploadDestination;
use system_properties::SystemPropertyKey;

fn metadata(filename: &str) -> AttachmentUploadMetadata {
    AttachmentUploadMetadata {
        attachment_db_id: Uuid::nil(),
        email_provider_id: String::new(),
        provider_attachment_id: String::new(),
        mime_type: "application/pdf".to_string(),
        filename: Some(filename.to_string()),
        internal_date_ts: Default::default(),
        message_db_id: Uuid::nil(),
        thread_db_id: Uuid::nil(),
        sender_email: String::new(),
        subject: None,
    }
}

fn check(filename: &str, expected_name: &str) {
    let (name, file_type) = determine_file_metadata(&metadata(filename)).unwrap();

    assert_eq!(name, expected_name, "name for {filename:?}");
    assert_eq!(file_type, "pdf", "file type for {filename:?}");
    assert!(name.graphemes(true).count() <= MAX_DOCUMENT_NAME_GRAPHEMES);
}

#[test]
fn short_names_are_unchanged() {
    check("report.pdf", "report");
    check(&format!("{}.pdf", "a".repeat(200)), &"a".repeat(200));
}

#[test]
fn long_names_keep_the_leading_graphemes_dss_accepts() {
    // Each unit is one grapheme: ASCII, a two-byte char, a combining mark, and a ZWJ sequence.
    for unit in ["a", "\u{e9}", "e\u{301}", "👨‍👩‍👧"] {
        check(&format!("{}.pdf", unit.repeat(250)), &unit.repeat(200));
    }
}

fn upload_args(thread_id: Uuid, subject: &str) -> AttachmentUploadArgs {
    AttachmentUploadArgs {
        attachment_metadata: AttachmentUploadMetadata {
            thread_db_id: thread_id,
            message_db_id: Uuid::now_v7(),
            sender_email: "sender@example.com".to_string(),
            subject: Some(subject.to_string()),
            ..metadata("deck.pdf")
        },
        recipient_emails: vec!["contact@example.com".to_string()],
        backfill: false,
        upload_destination: AttachmentUploadDestination::Dss,
    }
}

/// Inserts a link with two threads, the inboxes two copies of one attachment arrive in.
async fn two_threads(db: &sqlx::PgPool) -> (Uuid, Uuid) {
    let link = Uuid::now_v7();
    let (first, second) = (Uuid::now_v7(), Uuid::now_v7());
    sqlx::query!(
        "INSERT INTO email_links(id,macro_id,fusionauth_user_id,email_address,provider) VALUES($1,'macro|owner@example.com','owner','owner@example.com','GMAIL')",
        link
    )
    .execute(db)
    .await
    .unwrap();
    sqlx::query!(
        "INSERT INTO email_threads(id,link_id) VALUES($1,$3),($2,$3)",
        first,
        second,
        link
    )
    .execute(db)
    .await
    .unwrap();
    (first, second)
}

async fn stored_subject(db: &sqlx::PgPool, document_id: &str) -> serde_json::Value {
    sqlx::query_scalar!(
        "SELECT values FROM entity_properties WHERE entity_id = $1 AND property_definition_id = $2",
        document_id,
        SystemPropertyKey::SUBJECT_UUID,
    )
    .fetch_one(db)
    .await
    .unwrap()
    .unwrap()
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn a_reused_document_keeps_its_first_email_while_that_thread_exists(db: sqlx::PgPool) {
    let (first, second) = two_threads(&db).await;
    let properties = Arc::new(SystemPropertiesServiceImpl::new(
        PgSystemPropertiesRepository::new(db.clone()),
    ));

    set_email_attachment_properties(&db, &properties, "deck", &upload_args(first, "Deck"))
        .await
        .unwrap();
    set_email_attachment_properties(&db, &properties, "deck", &upload_args(second, "Fwd: Deck"))
        .await
        .unwrap();

    assert_eq!(
        properties
            .email_attachment_source_thread("deck")
            .await
            .unwrap(),
        Some(first.to_string())
    );
    assert_eq!(
        stored_subject(&db, "deck").await,
        serde_json::json!({"type": "String", "value": "Deck"})
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn a_reused_document_moves_to_the_next_email_once_its_thread_is_deleted(db: sqlx::PgPool) {
    let (first, second) = two_threads(&db).await;
    let properties = Arc::new(SystemPropertiesServiceImpl::new(
        PgSystemPropertiesRepository::new(db.clone()),
    ));
    set_email_attachment_properties(&db, &properties, "deck", &upload_args(first, "Deck"))
        .await
        .unwrap();
    sqlx::query!("DELETE FROM email_threads WHERE id = $1", first)
        .execute(&db)
        .await
        .unwrap();

    assert!(
        email_attachment_source_is_gone(&db, &properties, "deck")
            .await
            .unwrap()
    );
    set_email_attachment_properties(&db, &properties, "deck", &upload_args(second, "Fwd: Deck"))
        .await
        .unwrap();

    assert_eq!(
        properties
            .email_attachment_source_thread("deck")
            .await
            .unwrap(),
        Some(second.to_string())
    );
    assert_eq!(
        stored_subject(&db, "deck").await,
        serde_json::json!({"type": "String", "value": "Fwd: Deck"})
    );
    assert!(
        !email_attachment_source_is_gone(&db, &properties, "deck")
            .await
            .unwrap()
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn a_document_without_a_source_is_not_stale(db: sqlx::PgPool) {
    let properties = Arc::new(SystemPropertiesServiceImpl::new(
        PgSystemPropertiesRepository::new(db.clone()),
    ));

    assert!(
        !email_attachment_source_is_gone(&db, &properties, "uploaded-file")
            .await
            .unwrap()
    );
}
