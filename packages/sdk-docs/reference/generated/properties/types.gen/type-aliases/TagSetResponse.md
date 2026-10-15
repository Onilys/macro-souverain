# Type Alias: TagSetResponse

> **TagSetResponse** = `object`

A tag set the caller can use. `definition` is absent until the set is provisioned
(on first label create), in which case `options` is empty.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="property-definition"></a> `definition?` | `null` \| [`PropertyDefinitionDetailResponse`](PropertyDefinitionDetailResponse.md) |
| <a id="property-options"></a> `options` | [`PropertyOptionResponse`](PropertyOptionResponse.md)[] |
| <a id="property-scope"></a> `scope` | [`TagScope`](TagScope.md) |
