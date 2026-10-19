use super::*;

#[tokio::test]
async fn prepares_the_default_view_for_this_version() {
    let body = prepare(
        PREPARE_VERSION,
        Some(r#"<p>New</p><div class="gmail_signature">Me</div><img src="https://example.com/a.png">"#),
        None,
    )
    .await
    .unwrap()
    .expect("prepared");
    assert_eq!(body.version, PREPARE_VERSION);
    assert!(body.html.starts_with("<p>New</p>"), "{}", body.html);
    assert!(!body.html.contains("Me"));
    assert!(body.has_hidden_content);
    assert_eq!(
        body.source_length,
        r#"<p>New</p><div class="gmail_signature">Me</div><img src="https://example.com/a.png">"#
            .len() as i32
    );
    if let Some(proxy) = &body.image_proxy_url {
        assert!(body.html.contains(&format!("{proxy}?url=")));
    }
}

#[tokio::test]
async fn leaves_other_versions_and_bodies_without_html_to_the_client() {
    assert!(
        prepare(PREPARE_VERSION + 1, Some("<p>Hi</p>"), None)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        prepare(PREPARE_VERSION, None, None)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        prepare(PREPARE_VERSION, Some(""), None)
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn prepares_large_bodies() {
    let html = format!("<p>{}</p>", "word ".repeat(20_000));
    let body = prepare(PREPARE_VERSION, Some(&html), None)
        .await
        .unwrap()
        .expect("prepared");
    assert!(body.html.len() > 100_000, "{}", body.html.len());
}

#[tokio::test]
async fn leaves_the_body_to_the_client_while_every_preparation_slot_is_busy() {
    let preparations = Arc::new(Semaphore::new(0));
    let body = prepare_within(
        &preparations,
        PREPARE_TIMEOUT,
        PREPARE_VERSION,
        Some("<p>Hi</p>"),
        None,
    )
    .await
    .unwrap();
    assert!(body.is_none());
}

#[tokio::test]
async fn leaves_a_slow_body_to_the_client_and_holds_its_slot_until_the_work_ends() {
    let preparations = Arc::new(Semaphore::new(1));
    let html = format!("<p>{}</p>", "word ".repeat(200_000));
    let body = prepare_within(
        &preparations,
        Duration::ZERO,
        PREPARE_VERSION,
        Some(&html),
        None,
    )
    .await
    .unwrap();
    assert!(body.is_none());
    assert_eq!(preparations.available_permits(), 0);
    // The abandoned preparation returns its slot when it finishes.
    drop(preparations.acquire().await.unwrap());
}

#[tokio::test]
async fn measures_the_source_in_utf16_units_like_the_client() {
    let body = prepare(PREPARE_VERSION, Some("<p>é😀</p>"), Some("<p>é</p>"))
        .await
        .unwrap()
        .expect("prepared");
    assert_eq!(
        body.source_length,
        "<p>é😀</p>".encode_utf16().count() as i32 + 8
    );
}
