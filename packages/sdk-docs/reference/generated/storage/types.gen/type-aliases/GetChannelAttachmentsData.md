# Type Alias: GetChannelAttachmentsData

> **GetChannelAttachmentsData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.channel_id` | `string` | Channel ID |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.attachment_type?` | `string` | Filter by type: 'static' for images/videos, 'dss' for documents |
| `query.cursor?` | `string` | Base64 encoded cursor value |
| `query.limit?` | `number` | Page size (1-500, default 50) |
| <a id="property-url"></a> `url` | `"/channels/{channel_id}/attachments"` | - |
