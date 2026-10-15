# Type Alias: QuestionTally

> **QuestionTally** = `object`

One question's counts.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-buckets"></a> `buckets` | [`TallyBucket`](TallyBucket.md)[] | A count per option in the column's order, zeros included; for a checkbox, checked then unchecked. |
| <a id="property-question"></a> `question` | `string` | The question. |
| <a id="property-responses"></a> `responses` | `number` | Rows with a value in its column. |
