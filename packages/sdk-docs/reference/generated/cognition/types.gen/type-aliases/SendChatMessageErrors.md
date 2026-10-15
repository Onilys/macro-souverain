# Type Alias: SendChatMessageErrors

> **SendChatMessageErrors** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-400"></a> `400` | [`ChatMessageError`](ChatMessageError.md) | Bad request |
| <a id="property-401"></a> `401` | `unknown` | Unauthorized |
| <a id="property-402"></a> `402` | [`ChatMessageError`](ChatMessageError.md) | Payment required — the user's AI allowance is used up |
| <a id="property-403"></a> `403` | [`ChatMessageError`](ChatMessageError.md) | Forbidden — user lacks access to the requested model |
| <a id="property-503"></a> `503` | [`ChatMessageError`](ChatMessageError.md) | AI usage validation unavailable — retry later |
