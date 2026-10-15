# Type Alias: McpAuthCallbackData

> **McpAuthCallbackData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query?` | `object` | - |
| `query.code?` | `string` | Authorization code from the OAuth provider. Present on success. |
| `query.error?` | `string` | OAuth error code from the provider, e.g. `access_denied`. Present on failure. |
| `query.error_description?` | `string` | Human-readable error description from the provider. |
| `query.state?` | `string` | CSRF state parameter. |
| <a id="property-url"></a> `url` | `"/mcp/servers/auth/callback"` | - |
