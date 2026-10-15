# Type Alias: SimpleUnifiedSearchData

> **SimpleUnifiedSearchData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body` | [`UnifiedSearchRequest`](UnifiedSearchRequest.md) | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query` | `object` | - |
| `query.cursor?` | `string` | Base64 encoded cursor for pagination. |
| `query.page_size` | `number` | The page size. Defaults to 10. |
| <a id="property-url"></a> `url` | `"/search/simple"` | - |
