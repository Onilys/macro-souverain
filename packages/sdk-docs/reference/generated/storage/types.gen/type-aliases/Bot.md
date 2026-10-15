# Type Alias: Bot

> **Bot** = `object`

Bot row.

Clients deserialize this, so both derives are used.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-avatar_url"></a> `avatar_url?` | `string` \| `null` | Optional avatar URL. |
| <a id="property-created_at"></a> `created_at` | `string` | Creation timestamp. |
| <a id="property-created_by"></a> `created_by?` | `string` \| `null` | User that created this bot. |
| <a id="property-deleted_at"></a> `deleted_at?` | `string` \| `null` | Soft-delete timestamp. |
| <a id="property-description"></a> `description?` | `string` \| `null` | Optional description. |
| <a id="property-handle"></a> `handle` | `string` | Stable handle. |
| <a id="property-has_agent"></a> `has_agent` | `boolean` | Whether mentioning this bot opens a sandboxed coding-agent session. |
| <a id="property-id"></a> `id` | [`BotId`](BotId.md) | Bot id. |
| <a id="property-kind"></a> `kind` | [`BotKind`](BotKind.md) | Bot kind. |
| <a id="property-name"></a> `name` | `string` | Display name. |
| <a id="property-owner"></a> `owner?` | `null` \| [`BotOwner`](BotOwner.md) | - |
| <a id="property-updated_at"></a> `updated_at` | `string` | Update timestamp. |
