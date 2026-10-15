# Type Alias: ChannelCreatedMetadata

> **ChannelCreatedMetadata** = `object`

Metadata for [`ChannelTopicEvent::Created`].

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-actor"></a> `actor` | [`ChannelSender`](ChannelSender.md) | Actor that created the channel (channel owner). |
| <a id="property-channel_id"></a> `channel_id` | `string` | The id of the created channel. |
| <a id="property-channel_name"></a> `channel_name?` | `string` \| `null` | Stored channel name; `None` for direct message / unnamed channels. |
| <a id="property-channel_type"></a> `channel_type` | [`ChannelType`](ChannelType.md) | Type of channel that was created. |
| <a id="property-on_behalf_of"></a> `on_behalf_of?` | `null` \| [`MacroUserIdStr`](MacroUserIdStr.md) | - |
| <a id="property-participant_user_ids"></a> `participant_user_ids` | [`MacroUserIdStr`](MacroUserIdStr.md)[] | Active participants after creation (including the owner). |
