use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[cfg(test)]
mod test;

#[derive(Serialize, Deserialize, Debug, Clone, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushNotificationData {
    // Explicit optional fields keep OpenAPI compatible with old pushes.
    // Flattening Option<ChannelPushTarget> would require the target's IDs in
    // the generated allOf schema even when the whole target is absent.
    /// Channel containing the target message, when provided by the producer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<Uuid>,
    /// Message to reveal and highlight.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_id: Option<Uuid>,
    /// Root message of the thread when the target is a reply.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<Uuid>,
    /// The id of the notification record (UserNotification.id)
    pub notification_id: Uuid,
    /// The sender's profile picture URL, used by the Notification Service Extension
    /// to download and attach as a rich notification image.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub sender_profile_picture_url: Option<String>,
}

impl PushNotificationData {
    pub fn new_from_inner(val: notification::domain::models::apple::PushNotificationData) -> Self {
        Self {
            channel_id: val.channel_target.as_ref().map(|target| target.channel_id),
            message_id: val.channel_target.as_ref().map(|target| target.message_id),
            thread_id: val.channel_target.and_then(|target| target.thread_id),
            notification_id: val.notification_id,
            sender_profile_picture_url: val.sender_profile_picture_url,
        }
    }
}
