# Type Alias: PreviewsInboxCursorData

> **PreviewsInboxCursorData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.view` | `string` | View type. Supported values: inbox, sent, drafts, starred, all, important, other, user:<label> |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.cursor?` | `string` | Cursor value. Base64 encoded timestamp and item id, separated by \|. |
| `query.limit?` | `number` | Limit for pagination. Default is 20. Max is 500. |
| `query.sort_method?` | [`ApiSortMethod`](ApiSortMethod.md) | Sort method. Options are viewed_at, created_at, updated_at, viewed_updated. Defaults to viewed_updated. |
| <a id="property-url"></a> `url` | `"/email/threads/previews/cursor/{view}"` | - |
