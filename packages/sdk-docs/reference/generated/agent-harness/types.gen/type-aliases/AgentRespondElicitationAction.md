# Type Alias: AgentRespondElicitationAction

> **AgentRespondElicitationAction** = [`ElicitationAnswer`](ElicitationAnswer.md) & `object`

Answer an elicitation the agent is waiting on.

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `requestId` | [`ElicitationRequestId`](ElicitationRequestId.md) | The agent's `elicitation/create` request id - not an [`AgentActionId`], because the agent minted it. |
