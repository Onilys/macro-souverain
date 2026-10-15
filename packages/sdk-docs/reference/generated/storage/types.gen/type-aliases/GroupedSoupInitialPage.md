# Type Alias: GroupedSoupInitialPage

> **GroupedSoupInitialPage** = `object`

Response for the initial grouped soup query.

Items are returned as a pool keyed by id; each `ApiGroupMeta.item_ids`
describes the ordered membership of one group.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-groups"></a> `groups` | [`ApiGroupMeta`](ApiGroupMeta.md)[] | Ordered group metadata for this grouped response. |
| <a id="property-items"></a> `items` | `object` | Items in this page, keyed by id. Ordering lives in `groups[].item_ids`. |
