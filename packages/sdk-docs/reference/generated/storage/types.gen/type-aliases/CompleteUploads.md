# Type Alias: CompleteUploads

> **CompleteUploads** = `object`

Explicit upload completion; a seal can be submitted separately with an empty list.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-seal"></a> `seal?` | `null` \| [`ConversationSeal`](ConversationSeal.md) | - |
| <a id="property-uploads"></a> `uploads` | [`UploadId`](UploadId.md)[] | Registered identities to verify against storage (at most 50). |
