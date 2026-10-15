# Type Alias: GetDocumentLocationV3Data

> **GetDocumentLocationV3Data** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.document_id` | `string` | Document ID |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.document_version_id?` | `number` | A specific document version id to get the location for. |
| `query.get_converted_docx_url?` | `boolean` | If true, this will return the converted docx url. |
| <a id="property-url"></a> `url` | `"/documents/{document_id}/location_v3"` | - |
