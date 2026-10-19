use super::*;

#[cfg(test)]
mod test;
use notification::domain::models::apple::ChannelPushTarget;

pub(super) fn with_target(
    mut apns: APNSPushNotification<PushNotificationData>,
    entity: &Entity<'_>,
    message_id: &str,
    thread_id: Option<&str>,
) -> APNSPushNotification<PushNotificationData> {
    // Older producers can carry non-channel entities or malformed IDs. Preserve
    // their alert and notification-ID lookup instead of emitting a partial route.
    apns.push_notification_data.channel_target = (|| {
        if entity.entity_type != EntityType::Channel {
            return None;
        }
        Some(ChannelPushTarget {
            channel_id: entity.entity_id.parse().ok()?,
            message_id: message_id.parse().ok()?,
            thread_id: thread_id.map(str::parse).transpose().ok()?,
        })
    })();
    apns
}
