# Type Alias: GroupedSoupGroupPage

> **GroupedSoupGroupPage** = `object`

Response for fetching a page within one group.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-group"></a> `group` | [`ApiGroupMeta`](ApiGroupMeta.md) | Metadata and item membership for the requested group page. |
| <a id="property-items"></a> `items` | `object` | Items in this page, keyed by id. Ordering lives in `group.item_ids`. |
