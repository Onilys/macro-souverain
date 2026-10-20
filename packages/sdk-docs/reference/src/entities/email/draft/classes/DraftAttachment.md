# Class: DraftAttachment

An uploaded or forwarded attachment belonging to a draft.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-draft"></a> `draft` | `readonly` | [`EmailDraft`](EmailDraft.md) | Parent draft. |
| <a id="property-forwarded"></a> `forwarded` | `readonly` | `boolean` | Whether this attachment was forwarded. |
| <a id="property-id"></a> `id` | `readonly` | `string` | Attachment identity. |

## Methods

### complete()

> **complete**(): `Promise`\<`void`\>

Complete verification after uploading the file.

#### Returns

`Promise`\<`void`\>

***

### remove()

> **remove**(): `Promise`\<`void`\>

Remove this attachment from its draft.

#### Returns

`Promise`\<`void`\>

***

### toJSON()

> **toJSON**(): \{ `draftId`: `string`; `forwarded`: `boolean`; `id`: `string`; \}

Serialize identity without credentials.

#### Returns

\{ `draftId`: `string`; `forwarded`: `boolean`; `id`: `string`; \}

| Name | Type |
| ------ | ------ |
| `draftId` | `string` |
| `forwarded` | `boolean` |
| `id` | `string` |

***

### byId()

> `static` **byId**(`_client`, `draft`, `id`, `forwarded?`): `DraftAttachment`

Construct a draft scoped attachment handle.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `_client` | `MacroClient` | `undefined` |
| `draft` | [`EmailDraft`](EmailDraft.md) | `undefined` |
| `id` | `string` | `undefined` |
| `forwarded?` | `boolean` | `false` |

#### Returns

`DraftAttachment`
