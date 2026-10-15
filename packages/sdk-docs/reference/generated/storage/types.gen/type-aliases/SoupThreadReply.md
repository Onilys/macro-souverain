# Type Alias: SoupThreadReply

> **SoupThreadReply** = `object`

A thread reply shown in preview.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-attachments"></a> `attachments` | [`SoupMessageAttachment`](SoupMessageAttachment.md)[] | Attachments on this reply. |
| <a id="property-content"></a> `content` | `string` | Reply content. |
| <a id="property-created_at"></a> `created_at` | `string` | Creation timestamp. |
| <a id="property-edited_at"></a> `edited_at?` | `string` \| `null` | Edit timestamp. |
| <a id="property-id"></a> `id` | `string` | Reply id. |
| <a id="property-reactions"></a> `reactions` | [`SoupCountedReaction`](SoupCountedReaction.md)[] | Reactions on this reply. |
| <a id="property-sender"></a> `sender` | [`SoupMessageSender`](SoupMessageSender.md) | Structured sender identity. |
| <a id="property-sender_id"></a> `sender_id` | `string` | Sender id. |
| <a id="property-updated_at"></a> `updated_at` | `string` | Update timestamp. |
