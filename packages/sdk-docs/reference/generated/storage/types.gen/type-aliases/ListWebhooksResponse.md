# Type Alias: ListWebhooksResponse

> **ListWebhooksResponse** = `object`

Webhooks visible to the caller across their personal and team workspaces.

Clients deserialize this, so both derives are used.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-webhooks"></a> `webhooks` | [`Webhook`](Webhook.md)[] | The caller's webhooks, newest first. Signing secrets are omitted. |
