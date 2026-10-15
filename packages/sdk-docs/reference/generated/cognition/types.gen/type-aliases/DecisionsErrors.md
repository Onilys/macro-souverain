# Type Alias: DecisionsErrors

> **DecisionsErrors** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-400"></a> `400` | [`DecisionErrorBody`](DecisionErrorBody.md) | Invalid or oversized compact request |
| <a id="property-401"></a> `401` | `unknown` | Unauthorized |
| <a id="property-402"></a> `402` | [`DecisionErrorBody`](DecisionErrorBody.md) | AI allowance exhausted |
| <a id="property-413"></a> `413` | `unknown` | HTTP body exceeds 128 KiB |
| <a id="property-500"></a> `500` | [`DecisionErrorBody`](DecisionErrorBody.md) | Decision task failed |
| <a id="property-502"></a> `502` | [`DecisionErrorBody`](DecisionErrorBody.md) | Classifier could not produce a valid result |
| <a id="property-503"></a> `503` | [`DecisionErrorBody`](DecisionErrorBody.md) | Decision capacity, provider, or usage validation unavailable |
| <a id="property-504"></a> `504` | [`DecisionErrorBody`](DecisionErrorBody.md) | Decision deadline exceeded |
