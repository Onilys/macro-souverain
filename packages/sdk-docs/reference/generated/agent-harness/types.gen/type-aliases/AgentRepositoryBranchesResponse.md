# Type Alias: AgentRepositoryBranchesResponse

> **AgentRepositoryBranchesResponse** = `object`

Response body for `GET /agent-repositories/branches`.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-branches"></a> `branches` | `string`[] | Branch names on the repository, in the order GitHub returned them. Empty when the repository has no commits yet. |
