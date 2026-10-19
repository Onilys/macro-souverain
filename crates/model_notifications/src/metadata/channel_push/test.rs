use super::*;
use serde_json::json;

#[test]
fn channel_alerts_carry_the_message_destination_in_flat_native_payload_fields() {
    let metadata = json!({
        "sender": "macro|sender@example.com", "userId": "macro|sender@example.com",
        "messageId": "01943210-1234-7000-8000-000000000001",
        "threadId": "01943210-1234-7000-8000-000000000002",
        "messageContent": "Hello", "channelType": "public", "channelName": "general",
        "emoji": "👍", "documentName": "Plan", "owner": "macro|sender@example.com"
    });
    let send: ChannelMessageSendMetadata = serde_json::from_value(metadata.clone()).unwrap();
    let mention: ChannelMentionMetadata = serde_json::from_value(metadata.clone()).unwrap();
    let reply: ChannelReplyMetadata = serde_json::from_value(metadata.clone()).unwrap();
    let reaction: ChannelMessageReactionMetadata =
        serde_json::from_value(metadata.clone()).unwrap();
    let document: DocumentMentionMetadata = serde_json::from_value(metadata).unwrap();
    let entity = EntityType::Channel.with_entity_str("01943210-1234-7000-8000-000000000003");
    let notification_id = Uuid::nil();
    let sender = MacroUserIdStr::try_from_email("sender@example.com").unwrap();
    let alerts = [
        send.as_apns(Some(sender.clone()), &entity, notification_id)
            .unwrap(),
        mention
            .as_apns(Some(sender.clone()), &entity, notification_id)
            .unwrap(),
        reply
            .as_apns(Some(sender.clone()), &entity, notification_id)
            .unwrap(),
        reaction
            .as_apns(Some(sender.clone()), &entity, notification_id)
            .unwrap(),
        document
            .as_apns(Some(sender), &entity, notification_id)
            .unwrap(),
    ];
    for (index, alert) in alerts.iter().enumerate() {
        let payload = serde_json::to_value(alert).unwrap();
        assert_eq!(payload["notificationId"], notification_id.to_string());
        assert_eq!(payload["channelId"], "01943210-1234-7000-8000-000000000003");
        assert_eq!(payload["messageId"], "01943210-1234-7000-8000-000000000001");
        if index == 0 {
            assert!(payload.get("threadId").is_none());
        } else {
            assert_eq!(payload["threadId"], "01943210-1234-7000-8000-000000000002");
        }
        let decoded: APNSPushNotification<PushNotificationData> =
            serde_json::from_value(payload).unwrap();
        assert!(decoded.push_notification_data.channel_target.is_some());
    }
}

#[test]
fn old_pushes_and_invalid_destinations_keep_notification_id_navigation() {
    let old: PushNotificationData = serde_json::from_value(json!({
        "notificationId": "01943210-1234-7000-8000-000000000001"
    }))
    .unwrap();
    assert!(old.channel_target.is_none());
    let apns = APNSPushNotification {
        aps: Aps::default(),
        push_notification_data: old,
    };
    let valid_id = "01943210-1234-7000-8000-000000000003";
    for (entity, message_id, thread_id) in [
        (
            EntityType::Channel.with_entity_str("not-a-uuid"),
            valid_id,
            None,
        ),
        (
            EntityType::Document.with_entity_str(valid_id),
            valid_id,
            None,
        ),
        (
            EntityType::Channel.with_entity_str(valid_id),
            "not-a-uuid",
            None,
        ),
        (
            EntityType::Channel.with_entity_str(valid_id),
            valid_id,
            Some("not-a-uuid"),
        ),
    ] {
        let alert = with_target(
            APNSPushNotification {
                aps: Aps::default(),
                push_notification_data: apns.push_notification_data.clone(),
            },
            &entity,
            message_id,
            thread_id,
        );
        assert!(alert.push_notification_data.channel_target.is_none());
        assert!(
            serde_json::to_value(alert)
                .unwrap()
                .get("channelId")
                .is_none()
        );
    }
}
