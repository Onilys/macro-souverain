# Type Alias: MessageEvent

> **MessageEvent** = `object`

A committed message or thread change sent to delivery adapters.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-actor"></a> `actor` | `string` | User or bot who initiated the operation. |
| <a id="property-change"></a> `change` | [`MessageChange`](MessageChange.md) | Persisted change. |
| <a id="property-nonce"></a> `nonce?` | `string` \| `null` | Mutation nonce for optimistic reconciliation. |
| <a id="property-parent"></a> `parent` | [`MessageParent`](MessageParent.md) | Changed parent, used for subscriptions and cache invalidation. |
