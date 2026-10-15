# Type Alias: MessageMentionedMetadata

> **MessageMentionedMetadata** = `object`

One mentioned entity in a committed post; the full mention list travels on
the posted fact.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-content"></a> `content` | `string` | Macro Markdown body. |
| <a id="property-created_at"></a> `created_at` | `string` | Message creation timestamp. |
| <a id="property-mentioned"></a> `mentioned` | [`SimpleMention`](SimpleMention.md) | The mentioned entity this fact is about (`user`, `bot`, `document`, …). |
| <a id="property-message_id"></a> `message_id` | `string` | The id of the message carrying the mention. |
| <a id="property-parent"></a> `parent` | [`MessageParent`](MessageParent.md) | Entity that owns the message. |
| <a id="property-root_id"></a> `root_id` | `string` | Stable identity of the conversation. |
| <a id="property-sender"></a> `sender` | [`ChannelSender`](ChannelSender.md) | Message author; may be a bot. |
| <a id="property-thread_id"></a> `thread_id?` | `string` \| `null` | Root identifier for a reply; absent for a root. |
