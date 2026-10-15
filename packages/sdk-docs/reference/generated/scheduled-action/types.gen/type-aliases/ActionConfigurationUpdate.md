# Type Alias: ActionConfigurationUpdate

> **ActionConfigurationUpdate** = `object`

Canonical configuration replacement. Activation has its own endpoint, so
omitting `enabled` keeps the stored value.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-enabled"></a> ~~`enabled?`~~ | `boolean` \| `null` | Still sent by clients deployed before the activation endpoint. **Deprecated** |
| <a id="property-kind"></a> `kind` | [`ActionKind`](ActionKind.md) | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-task"></a> `task` | `object` | - |
| <a id="property-trigger"></a> `trigger` | [`ActionTrigger`](ActionTrigger.md) | - |
