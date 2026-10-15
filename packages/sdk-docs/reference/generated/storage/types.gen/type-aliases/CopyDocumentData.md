# Type Alias: CopyDocumentData

> **CopyDocumentData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body` | [`CopyDocumentRequest`](CopyDocumentRequest.md) | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.document_id` | `string` | Document ID |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.version_id?` | `number` | The version id of the document to copy. Defaults to copying the latest version of the document. |
| <a id="property-url"></a> `url` | `"/documents/{document_id}/copy"` | - |
