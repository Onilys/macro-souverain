# Type Alias: GetThreadData

> **GetThreadData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.thread_id` | `string` | Thread ID |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.limit?` | `number` | Limit for message pagination. Default is 5, max 100. |
| `query.offset?` | `number` | Offset for message pagination. Default is 0. |
| <a id="property-url"></a> `url` | `"/email/threads/{thread_id}"` | - |
