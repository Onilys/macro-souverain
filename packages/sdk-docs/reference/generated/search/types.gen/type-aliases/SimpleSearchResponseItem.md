# Type Alias: SimpleSearchResponseItem

> **SimpleSearchResponseItem** = `object`

Simple response item to mimic what we get back from opensearch

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-entity_id"></a> `entity_id` | `string` | ID of the chat, channel, email, or document |
| <a id="property-entity_type"></a> `entity_type` | `string` | - |
| <a id="property-goto"></a> `goto?` | `null` \| [`SearchGotoContent`](SearchGotoContent.md) | - |
| <a id="property-highlight"></a> `highlight` | [`Highlight`](Highlight.md) | - |
| <a id="property-score"></a> `score?` | `number` \| `null` | - |
