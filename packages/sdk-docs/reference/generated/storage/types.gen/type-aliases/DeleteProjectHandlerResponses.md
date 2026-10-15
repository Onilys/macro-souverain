# Type Alias: DeleteProjectHandlerResponses

> **DeleteProjectHandlerResponses** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-200"></a> `200` | `object` | - |
| `200.data` | `object` | Identifiers affected by a recursive project soft deletion. |
| `200.data.chat_ids` | `string`[] | Deleted chats. |
| `200.data.document_ids` | `string`[] | Deleted documents. |
| `200.data.project_ids` | `string`[] | Deleted projects, including the requested root. |
| `200.error` | `boolean` | Indicates if an error occurred |
