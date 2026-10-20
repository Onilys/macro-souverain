# Type Alias: PushNotificationData

> **PushNotificationData** = \{ `channelId?`: `string` \| `null`; `messageId?`: `string` \| `null`; `notificationId`: `string`; `senderProfilePictureUrl?`: `string` \| `null`; `threadId?`: `string` \| `null`; \}

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-channelid"></a> `channelId?` | `string` \| `null` | Channel containing the target message, when provided by the producer. |
| <a id="property-messageid"></a> `messageId?` | `string` \| `null` | Message to reveal and highlight. |
| <a id="property-notificationid"></a> `notificationId` | `string` | The id of the notification record (UserNotification.id) |
| <a id="property-senderprofilepictureurl"></a> `senderProfilePictureUrl?` | `string` \| `null` | The sender's profile picture URL, used by the Notification Service Extension to download and attach as a rich notification image. |
| <a id="property-threadid"></a> `threadId?` | `string` \| `null` | Root message of the thread when the target is a reply. |
