# Type Alias: OutOfOfficeProperties

> **OutOfOfficeProperties** = `object`

The extra properties Google requires on an out-of-office event, mirroring
its `outOfOfficeProperties` block. Their presence on a draft or patch is
what marks the mutation as out-of-office.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-autodeclinemode"></a> `autoDeclineMode?` | [`OutOfOfficeAutoDeclineMode`](OutOfOfficeAutoDeclineMode.md) | How conflicting invitations are handled while the user is out. |
| <a id="property-declinemessage"></a> `declineMessage?` | `string` \| `null` | Message returned to organizers whose invitations are auto-declined. |
