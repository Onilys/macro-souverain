# Type Alias: FormErrorResponse

> **FormErrorResponse** = `object`

Why a forms request was refused or failed.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | [`FormErrorCode`](FormErrorCode.md) | What went wrong. |
| <a id="property-message"></a> `message` | `string` | What went wrong, in words. |
| <a id="property-problem"></a> `problem` | `null` \| [`LayoutProblem`](LayoutProblem.md) | - |
| <a id="property-question"></a> `question` | `string` \| `null` | The question it is about, if one. |
