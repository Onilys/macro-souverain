# Type Alias: FormDetail

> **FormDetail** = `object`

A form with its layout, as the caller may see it.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-access"></a> `access` | [`FormAccess`](FormAccess.md) | The caller's level on it. |
| <a id="property-form"></a> `form` | [`Form`](Form.md) | The form's facts. |
| <a id="property-sections"></a> `sections` | [`FormSectionDetail`](FormSectionDetail.md)[] | Its sections, in order. |
| <a id="property-tablegone"></a> `tableGone` | `boolean` | Whether its database is in the trash, so it has no table to show or write: its sections keep no questions and it takes no responses. |
