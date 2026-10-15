# Type Alias: SaveQueryRequest

> **SaveQueryRequest** = `object`

Request body for saving a query.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-databaseid"></a> `databaseId?` | `string` | The database whose tables win name resolution. The caller must be able to see it. |
| <a id="property-definition"></a> `definition` | [`QueryDefinition`](QueryDefinition.md) | What the query asks: `{"version": 1, "query": "<SELECT>"}`. |
