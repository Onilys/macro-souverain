# Type Alias: UndoDatabaseChangeData

> **UndoDatabaseChangeData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.change` | `number` | The change's journal id |
| `path.id` | `string` | Database id |
| <a id="property-query"></a> `query?` | `never` | - |
| <a id="property-url"></a> `url` | `"/databases/{id}/changes/{change}/undo"` | - |
