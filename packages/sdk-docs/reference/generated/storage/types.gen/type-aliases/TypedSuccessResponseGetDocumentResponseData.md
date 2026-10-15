# Type Alias: TypedSuccessResponseGetDocumentResponseData

> **TypedSuccessResponseGetDocumentResponseData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-data"></a> `data` | `object` | Get document response data with content lifecycle metadata. |
| `data.documentMetadata` | [`DocumentMetadataWithContent`](DocumentMetadataWithContent.md) | The metadata of the document. |
| `data.userAccessLevel` | [`AccessLevel`](AccessLevel.md) | The user's level of access to the document. |
| `data.viewLocation?` | `string` \| `null` | The user's view location if there is one. |
| <a id="property-error"></a> `error` | `boolean` | Indicates if an error occurred |
