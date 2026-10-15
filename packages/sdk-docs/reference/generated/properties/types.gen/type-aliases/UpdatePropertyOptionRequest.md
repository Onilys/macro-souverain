# Type Alias: UpdatePropertyOptionRequest

> **UpdatePropertyOptionRequest** = `object`

Request to update a property option in place. Omitted fields keep their current value.
The option id is preserved, so the change propagates to every entity referencing it.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-color"></a> `color?` | `string` \| `null` | New color as a hex string like `#RRGGBB`. |
| <a id="property-display_order"></a> `display_order?` | `number` \| `null` | New display order. |
| <a id="property-value"></a> `value?` | `string` \| `null` | New string value (label text). Only valid for SelectString and Tag properties. |
