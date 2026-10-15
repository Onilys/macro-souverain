# Type Alias: LoadAgentModelsRequest

> **LoadAgentModelsRequest** = `object`

HTTP request selecting one provider to probe.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-harness"></a> `harness` | [`ModelHarnessDto`](ModelHarnessDto.md) | Provider to probe. |
| <a id="property-harnessid"></a> `harnessId?` | `string` \| `null` | Required for macrod and forbidden for other targets. |
