# Type Alias: GetDatabaseTableChangesData

> **GetDatabaseTableChangesData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.id` | `string` | Database id |
| `path.table_id` | `string` | Table id |
| <a id="property-query"></a> `query` | `object` | - |
| `query.since` | `number` | The table version the reader last read. |
| <a id="property-url"></a> `url` | `"/databases/{id}/tables/{table_id}/changes"` | - |
