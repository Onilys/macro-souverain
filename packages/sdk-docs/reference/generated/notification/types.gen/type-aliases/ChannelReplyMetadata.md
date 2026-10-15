# Type Alias: ChannelReplyMetadata

> **ChannelReplyMetadata** = [`CommonChannelMetadata`](CommonChannelMetadata.md) & `object`

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `messageContent` | `string` | The message content |
| `messageId` | `string` | The id of the new message |
| `senderDisplayName?` | `string` \| `null` | Display name for non-user senders such as bots |
| `senderProfilePictureUrl?` | `string` \| `null` | - |
| `threadId` | `string` | The id of the thread that has the reply |
| `threadParentSenderId?` | `string` \| `null` | The user who sent the root message of the thread |
| `userId?` | `string` \| `null` | The sender id of the reply, when sent by a user |
