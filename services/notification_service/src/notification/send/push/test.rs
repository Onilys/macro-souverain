use super::*;
use notification::domain::models::apple::{self, ChannelPushTarget};
use utoipa::PartialSchema;

#[test]
fn wire_model_matches_channel_and_legacy_push_payloads() {
    for channel_target in [
        None,
        Some(ChannelPushTarget {
            channel_id: Uuid::from_u128(1),
            message_id: Uuid::from_u128(2),
            thread_id: Some(Uuid::from_u128(3)),
        }),
    ] {
        let inner = apple::PushNotificationData {
            channel_target,
            notification_id: Uuid::from_u128(4),
            sender_profile_picture_url: None,
        };
        let expected = serde_json::to_value(&inner).unwrap();
        let wire = PushNotificationData::new_from_inner(inner);
        assert_eq!(serde_json::to_value(wire).unwrap(), expected);
    }
    let schema = serde_json::to_value(PushNotificationData::schema()).unwrap();
    assert_eq!(schema["required"], serde_json::json!(["notificationId"]));
}
