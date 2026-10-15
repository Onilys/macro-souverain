# Type Alias: GetThreadMessagesHandlerData

> **GetThreadMessagesHandlerData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.id` | `string` | Thread ID |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.limit?` | `number` | Limit number of messages returned |
| `query.since?` | `string` | Filter messages after this date |
| <a id="property-url"></a> `url` | `"/email/threads/{id}/messages"` | - |
