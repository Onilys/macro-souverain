# Type Alias: UnsubscribeItemData

> **UnsubscribeItemData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.item_id` | `string` | - |
| `path.item_type` | [`EntityType`](EntityType.md) | - |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.snoozed_until?` | `string` \| `null` | A future resume time. Omit to mute indefinitely. |
| <a id="property-url"></a> `url` | `"/unsubscribe/item/{item_type}/{item_id}"` | - |
