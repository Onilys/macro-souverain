# Type Alias: ChangedFileDto

> **ChangedFileDto** = `object`

One changed file.

Clients deserialize this, so both derives are used.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-additions"></a> `additions` | `number` | Lines added. |
| <a id="property-binary"></a> `binary` | `boolean` | The diff carries no text for this file. |
| <a id="property-deletions"></a> `deletions` | `number` | Lines removed. |
| <a id="property-kind"></a> `kind` | [`FileChangeKindDto`](FileChangeKindDto.md) | What happened to the file. |
| <a id="property-patchomitted"></a> `patchOmitted` | `boolean` | The file's hunks were left out of the patch to fit the size budget. |
| <a id="property-path"></a> `path` | `string` | The file's path after the change, or before it for a deletion. |
| <a id="property-previouspath"></a> `previousPath?` | `string` \| `null` | Where a renamed file came from. |
