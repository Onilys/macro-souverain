# Type Alias: AgentSessionFilters

> **AgentSessionFilters** = \{ `exclude_routine_runs?`: `boolean`; `ids?`: `string`[]; `include?`: `boolean`; `owners?`: `string`[]; \}

Filters for agent sessions.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-exclude_routine_runs"></a> `exclude_routine_runs?` | `boolean` | Leave out sessions a routine's unattended run created. Constrains the sessions a query already asks for; it does not opt the query in. |
| <a id="property-ids"></a> `ids?` | `string`[] | Agent session ids to filter by. Empty to include all accessible sessions. |
| <a id="property-include"></a> `include?` | `boolean` | Opt this query into agent sessions at all. Agent sessions are off by default — see [`crate::ast::agent_session::AgentSessionLiteral::Include`]. Asking for specific `ids` or `owners` also opts in. |
| <a id="property-owners"></a> `owners?` | `string`[] | Filter by session owner principal — a user ('macro\|user1@user.com'), a bot ('bot\|<uuid>'), or a team (a bare hyphenated uuid). Empty to include every owner. |
