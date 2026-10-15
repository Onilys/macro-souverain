# Type Alias: UploadFolderHandlerResponses

> **UploadFolderHandlerResponses** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-200"></a> `200` | `object` | - |
| `200.data` | `object` | Data to be returned |
| `200.data.destinationMap` | [`HashMap`](HashMap.md) | maps document id to presigned url (external) or s3 info (internal) |
| `200.data.fileSystem` | [`FileSystemNodeWithIds`](FileSystemNodeWithIds.md) | file system with project ids and document ids |
| `200.error` | `boolean` | Indicates if an error occurred |
