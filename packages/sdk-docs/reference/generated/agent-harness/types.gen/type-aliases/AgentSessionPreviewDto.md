# Type Alias: AgentSessionPreviewDto

> **AgentSessionPreviewDto** = [`AgentSessionPreviewData`](AgentSessionPreviewData.md) & `object` \| [`WithAgentSessionId`](WithAgentSessionId.md) & `object` \| [`WithAgentSessionId`](WithAgentSessionId.md) & `object`

What one requested id resolved to, on the wire.

Tagged the same way the chat and document preview endpoints tag theirs
(`type` in `access` / `no_access` / `does_not_exist`), so a client that
renders those chips can render this one with the same branch.

Clients deserialize this, so both derives are used.
