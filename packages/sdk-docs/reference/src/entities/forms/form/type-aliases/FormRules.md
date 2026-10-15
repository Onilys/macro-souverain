# Type Alias: FormRules

> **FormRules** = `object`

Conditions over columns asked in earlier sections.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="property-conditions"></a> `conditions` | (\{ `column`: [`DatabaseColumn`](../../../databases/column/classes/DatabaseColumn.md); `kind`: `"condition"`; `test`: [`FormRuleTest`](FormRuleTest.md); \} \| `object` & `FormRules`)[] |
| <a id="property-conjunction"></a> `conjunction` | [`FilterGroup`](../../../../../generated/storage/types.gen/type-aliases/FilterGroup.md)\[`"conjunction"`\] |
