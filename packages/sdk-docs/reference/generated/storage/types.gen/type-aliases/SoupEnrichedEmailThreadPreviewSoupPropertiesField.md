# Type Alias: SoupEnrichedEmailThreadPreviewSoupPropertiesField

> **SoupEnrichedEmailThreadPreviewSoupPropertiesField** = [`SoupEmailThreadPreview`](SoupEmailThreadPreview.md) & `object` & `object`

Email thread preview enriched with related metadata for Soup.

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `properties` | [`SoupProperty`](SoupProperty.md)[] | Properties attached to the entity. |

| Name | Type | Description |
| ------ | ------ | ------ |
| `attachments` | [`SoupAttachment`](SoupAttachment.md)[] | Attachments on the thread. |
| `labels` | [`SoupLabel`](SoupLabel.md)[] | Labels attached to the thread. |
| `participants` | [`SoupContact`](SoupContact.md)[] | Contacts participating in the thread. |
