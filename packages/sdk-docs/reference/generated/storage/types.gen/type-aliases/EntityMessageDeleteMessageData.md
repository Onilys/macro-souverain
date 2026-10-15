# Type Alias: EntityMessageDeleteMessageData

> **EntityMessageDeleteMessageData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.id` | `string` | - |
| `path.parent_id` | `string` | - |
| `path.parent_type` | `string` | - |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.nonce?` | `string` \| `null` | Client nonce. |
| <a id="property-url"></a> `url` | `"/messages/{parent_type}/{parent_id}/items/{id}"` | - |
