use super::*;
use serde_json::json;

#[test]
fn signature_covers_exact_bytes_and_product_must_match() {
    let body = br#"{"object":"instagram","entry":[]}"#;
    let mut mac = Hmac::<Sha256>::new_from_slice(b"test-only-secret").unwrap();
    mac.update(body);
    let digest = mac.finalize().into_bytes();
    let signature = format!(
        "sha256={}",
        digest
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    );
    assert!(verify_signature(b"test-only-secret", &signature, body).is_ok());
    assert!(verify_signature(b"wrong-secret", &signature, body).is_err());
    assert!(verify_signature(b"test-only-secret", &signature, b"changed").is_err());
    assert!(verify_signature(b"test-only-secret", "", body).is_err());
    assert!(
        decode(
            Provider::Whatsapp,
            &serde_json::from_slice::<Value>(body).unwrap()
        )
        .is_err()
    );
}

fn whatsapp_payload(field: &str, value: Value) -> Value {
    json!({"object":"whatsapp_business_account","entry":[{"id":"waba1","changes":[{"field":field,"value":value}]}]})
}

#[test]
fn whatsapp_live_echo_and_history_have_distinct_provenance() {
    let message = json!({"from":"16505550100","to":"16505550101","id":"wamid.1","timestamp":"1791288000","type":"text","text":{"body":"Hello"}});
    for (field, key, provenance) in [
        ("messages", "messages", Provenance::Customer),
        (
            "smb_message_echoes",
            "message_echoes",
            Provenance::PhoneEcho,
        ),
        ("history", "messages", Provenance::OnboardingHistory),
    ] {
        let mut value = json!({"metadata":{"phone_number_id":"phone1"}});
        value[key] = json!([message]);
        let events = decode(Provider::Whatsapp, &whatsapp_payload(field, value)).unwrap();
        let IncomingEvent::Message(message) = &events[0] else {
            panic!("expected message")
        };
        assert_eq!(message.provenance, provenance);
        assert_eq!(message.message_id.as_str(), "wamid.1");
        assert_eq!(
            message.direction,
            if field == "smb_message_echoes" {
                Direction::Outbound
            } else {
                Direction::Inbound
            }
        );
    }
}

#[test]
fn historical_threads_are_never_new_customer_messages() {
    let payload = whatsapp_payload(
        "history",
        json!({"metadata":{"phone_number_id":"phone1"},"history":[{"metadata":{"progress":75},"threads":[{"id":"customer1","messages":[{"id":"m1","from":"business1","timestamp":"1700000000","type":"media_placeholder"},{"id":"m2","from":"customer1","timestamp":"1700000001","type":"text","text":{"body":"past message"}}]}]}]}),
    );
    let events = decode(Provider::Whatsapp, &payload).unwrap();
    assert_eq!(events.len(), 3);
    for event in &events[..2] {
        let IncomingEvent::Message(message) = event else {
            panic!("expected message")
        };
        assert!(!message.provenance.is_new_customer_message());
    }
    let IncomingEvent::Message(message) = &events[0] else {
        panic!("expected message")
    };
    assert_eq!(message.direction, Direction::Outbound);
}

#[test]
fn instagram_uses_account_scoped_identity_and_preserves_media() {
    let payload = json!({"object":"instagram","entry":[{"id":"business1","messaging":[{"sender":{"id":"customer1"},"recipient":{"id":"business1"},"timestamp":1791288000123_i64,"message":{"mid":"m1","text":"Hello","attachments":[{"type":"image","payload":{"url":"https://scontent.cdninstagram.com/photo.jpg"}}]}}]}]});
    let result = decode(Provider::Instagram, &payload).unwrap();
    let IncomingEvent::Message(message) = &result[0] else {
        panic!("expected message")
    };
    assert_eq!(message.customer_id.as_str(), "customer1");
    assert_eq!(message.timestamp.timestamp_millis(), 1791288000123);
    assert_eq!(message.media.len(), 1);
    let mut bad = payload;
    bad["entry"][0]["id"] = json!("other-account");
    assert!(decode(Provider::Instagram, &bad).is_err());
}

#[test]
fn malformed_timestamp_is_not_replaced_by_processing_time() {
    let payload = whatsapp_payload(
        "messages",
        json!({"metadata":{"phone_number_id":"phone1"},"messages":[{"from":"customer1","id":"m1","type":"text","text":{"body":"body"}}]}),
    );
    assert!(decode(Provider::Whatsapp, &payload).is_err());
}

#[test]
fn captionless_media_has_no_synthetic_text_but_captions_are_preserved() {
    for caption in [None, Some("A real caption"), Some("[image attachment]")] {
        let payload = whatsapp_payload(
            "messages",
            json!({
                "metadata":{"phone_number_id":"phone1"},
                "messages":[{"from":"customer1","id":"m1","timestamp":"1791288000",
                    "type":"image","image":{"id":"media1","caption":caption}}]
            }),
        );
        let events = decode(Provider::Whatsapp, &payload).unwrap();
        let IncomingEvent::Message(message) = &events[0] else {
            panic!("expected media")
        };
        assert_eq!(message.content, caption.unwrap_or_default());
        assert_eq!(message.media.len(), 1);
        let payload = json!({"object":"instagram","entry":[{"id":"business1","messaging":[{
            "sender":{"id":"customer1"},"recipient":{"id":"business1"},"timestamp":1791288000123_i64,
            "message":{"mid":"m1","text":caption,"attachments":[{"type":"image","payload":{"url":"https://scontent.cdninstagram.com/photo.jpg"}}]}
        }]}]});
        let events = decode(Provider::Instagram, &payload).unwrap();
        let IncomingEvent::Message(message) = &events[0] else {
            panic!("expected media")
        };
        assert_eq!(message.content, caption.unwrap_or_default());
        assert_eq!(message.media.len(), 1);
    }
}

#[test]
fn history_chunks_can_contain_thousands_of_messages() {
    let messages:Vec<_>=(0..3000).map(|i|json!({"id":format!("old-{i}"),"from":"customer","timestamp":"1700000000","type":"text","text":{"body":"old"}})).collect();
    let payload = whatsapp_payload(
        "history",
        json!({"metadata":{"phone_number_id":"phone"},"history":[{"metadata":{"progress":100},"threads":[{"id":"customer","messages":messages}]}]}),
    );
    let events = decode(Provider::Whatsapp, &payload).unwrap();
    assert_eq!(events.len(), 3001);
    assert!(matches!(
        events.last(),
        Some(IncomingEvent::HistoryProgress {
            progress: Some(100),
            ..
        })
    ));
}
