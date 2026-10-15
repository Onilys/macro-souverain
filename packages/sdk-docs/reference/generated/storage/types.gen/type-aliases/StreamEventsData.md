# Type Alias: StreamEventsData

> **StreamEventsData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query` | `object` | - |
| `query.filters?` | `string` | URL-encoded JSON array of webhook filters, identical to the persisted webhook `filters` field. |
| `query.scope` | [`WebhookScope`](WebhookScope.md) | Personal or team workspace whose webhook lifecycle events are delivered. |
| <a id="property-url"></a> `url` | `"/webhook/events/stream"` | - |
