# Type Alias: CallRecordSource

> **CallRecordSource** = \{ `externalUrl?`: `string` \| `null`; `provider`: `string`; \}

Where an imported call came from.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-externalurl"></a> `externalUrl?` | `string` \| `null` | Link to the call in the provider's app, if it has one. |
| <a id="property-provider"></a> `provider` | `string` | Provider slug, e.g. `granola`. |
