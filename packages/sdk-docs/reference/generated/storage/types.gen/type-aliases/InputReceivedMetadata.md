# Type Alias: InputReceivedMetadata

> **InputReceivedMetadata** = `object`

The pending question was answered or withdrawn.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-action_id"></a> `action_id` | [`AgentActionId`](AgentActionId.md) | The action that opened the turn. |
| <a id="property-identity"></a> `identity` | [`SessionIdentity`](SessionIdentity.md) | The session. |
| <a id="property-turn"></a> `turn` | `number` | The turn that was asking. |
