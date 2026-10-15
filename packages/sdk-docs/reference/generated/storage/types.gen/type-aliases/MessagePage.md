# Type Alias: MessagePage

> **MessagePage** = `object`

Bidirectional, bounded timeline page, ordered newest root first.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-items"></a> `items` | [`MessageListItem`](MessageListItem.md)[] | Root messages with bounded previews. |
| <a id="property-next_cursor"></a> `next_cursor?` | `null` \| [`MessageCursor`](MessageCursor.md) | - |
| <a id="property-previous_cursor"></a> `previous_cursor?` | `null` \| [`MessageCursor`](MessageCursor.md) | - |
