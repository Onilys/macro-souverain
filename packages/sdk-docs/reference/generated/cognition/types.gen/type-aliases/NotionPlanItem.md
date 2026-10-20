# Type Alias: NotionPlanItem

> **NotionPlanItem** = \{ `decision`: [`NotionDecision`](NotionDecision.md); `moreRows?`: `boolean`; `path?`: `string`[]; `reason?`: `string` \| `null`; `rows?`: `number` \| `null`; `taskFields?`: `null` \| [`NotionTaskFields`](NotionTaskFields.md); \}

One object's place in a workspace import plan.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-decision"></a> `decision` | [`NotionDecision`](NotionDecision.md) | What the import does with it. |
| <a id="property-morerows"></a> `moreRows?` | `boolean` | For a data source: whether it has more rows than `rows`. |
| <a id="property-path"></a> `path?` | `string`[] | Titles of the pages above it, outermost first. |
| <a id="property-reason"></a> `reason?` | `string` \| `null` | Why, in a short sentence, when the decision model gave one. |
| <a id="property-rows"></a> `rows?` | `number` \| `null` | For a data source: rows counted while planning. |
| <a id="property-taskfields"></a> `taskFields?` | `null` \| [`NotionTaskFields`](NotionTaskFields.md) | - |
