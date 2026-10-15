# Type Alias: AgentAction

> **AgentAction** = [`AgentPromptAction`](AgentPromptAction.md) & `object` \| [`AgentSetModelAction`](AgentSetModelAction.md) & `object` \| [`AgentSetConfigOptionAction`](AgentSetConfigOptionAction.md) & `object` \| \{ `type`: `"compact"`; \} \| \{ `type`: `"stop"`; \} \| [`AgentRespondElicitationAction`](AgentRespondElicitationAction.md) & `object` \| [`AgentPermissionAction`](AgentPermissionAction.md) & `object`

One thing a caller wants an agent to do.
