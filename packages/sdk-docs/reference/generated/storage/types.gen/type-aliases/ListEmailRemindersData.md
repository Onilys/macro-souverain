# Type Alias: ListEmailRemindersData

> **ListEmailRemindersData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.attachments?` | `string`[] \| `null` | Repeated attachment categories: pdf, image, document. |
| `query.calendar?` | `boolean` \| `null` | Restrict to calendar mail. |
| `query.cursor?` | `string` \| `null` | Continuation from the previous page. |
| `query.done?` | `boolean` \| `null` | Email archive filter, independent of reminder completion. |
| `query.inboxIds?` | `string`[] \| `null` | Selected inboxes; omission selects all accessible inboxes. |
| `query.limit?` | `number` \| `null` | Maximum rows (1–100). |
| `query.noInboxes?` | `boolean` \| `null` | Explicitly empty inbox selection. |
| `query.read?` | `boolean` \| `null` | Email read status. |
| `query.tags?` | `string`[] \| `null` | Repeated property-definition:select-option UUID pairs. |
| <a id="property-url"></a> `url` | `"/reminders/email/collection"` | - |
