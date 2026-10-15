# Type Alias: PostChannelBotWebhookData

> **PostChannelBotWebhookData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body` | [`ChannelWebhookRequest`](ChannelWebhookRequest.md) | - |
| <a id="property-headers"></a> `headers?` | `object` | - |
| `headers.x-macro-bot-token?` | `string` \| `null` | Preferred bot authentication token |
| ~~`headers.x-macro-channel-bot-token?`~~ | `string` \| `null` | Legacy channel-scoped bot authentication token **Deprecated** |
| <a id="property-path"></a> `path` | `object` | - |
| `path.channel_id` | `string` | Channel ID |
| <a id="property-query"></a> `query?` | `never` | - |
| <a id="property-url"></a> `url` | `"/channels/{channel_id}/webhook"` | - |
