# Type Alias: MessageTimelineEntriesData

> **MessageTimelineEntriesData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.parent_id` | `string` | - |
| `path.parent_type` | `string` | - |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.selection?` | `string` \| `null` | Serialized MessageTimelineQuery; absent selects the latest roots. |
| <a id="property-url"></a> `url` | `"/messages/{parent_type}/{parent_id}/timeline"` | - |
