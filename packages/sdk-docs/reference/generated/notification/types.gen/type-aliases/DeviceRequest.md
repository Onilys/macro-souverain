# Type Alias: DeviceRequest

> **DeviceRequest** = \{ `deviceType`: [`DeviceType`](DeviceType.md); `token`: `string`; \}

Request to register or unregister a device for push notifications.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-devicetype"></a> `deviceType` | [`DeviceType`](DeviceType.md) | The device platform type (iOS or Android). |
| <a id="property-token"></a> `token` | `string` | The device push notification token. |
