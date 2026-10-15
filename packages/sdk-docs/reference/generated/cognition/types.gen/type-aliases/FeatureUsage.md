# Type Alias: FeatureUsage

> **FeatureUsage** = `object`

Recorded invocations and total for one feature.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-entries"></a> `entries` | [`CompletionUsage`](CompletionUsage.md)[] | Recorded invocations. |
| <a id="property-feature"></a> `feature` | [`AiFeature`](AiFeature.md) | Feature attribution. |
| <a id="property-total"></a> `total` | `number` | Total cost (USD). |
