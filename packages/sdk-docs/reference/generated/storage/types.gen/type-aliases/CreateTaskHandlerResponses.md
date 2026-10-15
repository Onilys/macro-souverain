# Type Alias: CreateTaskHandlerResponses

> **CreateTaskHandlerResponses** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-200"></a> `200` | `object` | Response for creating a task. |
| `200.documentId` | `string` | The document ID of the created task. |
| `200.documentMetadata` | [`DocumentResponseMetadata`](DocumentResponseMetadata.md) | Metadata for the created document |
| `200.initialSnapshot` | `string` | Base64-encoded canonical Loro snapshot used to initialize the task. |
| `200.teamId?` | `string` \| `null` | The team this task number is scoped to. |
| `200.teamTaskId?` | `number` \| `null` | The task number assigned within the team. |
| `200.token` | `string` | A pre-generated permission token that you can use for SS |
