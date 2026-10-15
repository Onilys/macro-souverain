# Type Alias: ApiAttachmentGenericReference

> **ApiAttachmentGenericReference** = `object`

A reference to an attachment entity from a non-message source.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-created_at"></a> `created_at` | `string` | When this reference was created. |
| <a id="property-entity_id"></a> `entity_id` | `string` | ID of the referenced entity. |
| <a id="property-entity_type"></a> `entity_type` | `string` | Type of the referenced entity. |
| <a id="property-source_entity_id"></a> `source_entity_id` | `string` | ID of the source entity. |
| <a id="property-source_entity_type"></a> `source_entity_type` | `string` | Type of the source entity (e.g., "document", "chat", etc.). |
| <a id="property-user_id"></a> `user_id?` | `string` \| `null` | User who created this reference (optional for non-user sources). |
