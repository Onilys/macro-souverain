# Type Alias: NotionImportReport

> **NotionImportReport** = \{ `copy`: `number`; `dataSources`: `number`; `error?`: `string` \| `null`; `failures?`: [`NotionReportItem`](NotionReportItem.md)[]; `hand`: `number`; `handItems?`: [`NotionReportItem`](NotionReportItem.md)[]; `imported`: `number`; `pages`: `number`; `reviewId?`: `string` \| `null`; `skip`: `number`; `status?`: `null` \| [`RunStatus`](RunStatus.md); `tasks`: `number`; `waiting`: `number`; `writing`: `number`; \}

Where a Notion workspace import stands.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-copy"></a> `copy` | `number` | Objects to copy as they are. |
| <a id="property-datasources"></a> `dataSources` | `number` | Data sources (database tables) in the plan. |
| <a id="property-error"></a> `error?` | `string` \| `null` | Why the run failed, when it did. |
| <a id="property-failures"></a> `failures?` | [`NotionReportItem`](NotionReportItem.md)[] | Objects that failed to import, with the failure. |
| <a id="property-hand"></a> `hand` | `number` | Objects that need handling by hand. |
| <a id="property-handitems"></a> `handItems?` | [`NotionReportItem`](NotionReportItem.md)[] | Objects that need handling by hand, with reasons. |
| <a id="property-imported"></a> `imported` | `number` | Plan objects already imported. |
| <a id="property-pages"></a> `pages` | `number` | Pages in the plan. |
| <a id="property-reviewid"></a> `reviewId?` | `string` \| `null` | The review the plan is tied to, once presented. |
| <a id="property-skip"></a> `skip` | `number` | Objects left in Notion. |
| <a id="property-status"></a> `status?` | `null` \| [`RunStatus`](RunStatus.md) | - |
| <a id="property-tasks"></a> `tasks` | `number` | Data sources whose rows become tasks. |
| <a id="property-waiting"></a> `waiting` | `number` | Plan objects still waiting to be written. |
| <a id="property-writing"></a> `writing` | `number` | Plan objects being written now. |
