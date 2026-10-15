# Type Alias: InferColumnTypeRequest

> **InferColumnTypeRequest** = `object`

Request to settle an empty column's first-value type.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-baseversion"></a> `baseVersion` | [`TableVersion`](TableVersion.md) | Table version used when interpreting the first value. |
| <a id="property-datatype"></a> `dataType` | [`DataType`](DataType.md) | First-value type: STRING, NUMBER, or ENTITY. |
| <a id="property-specificentitytype"></a> `specificEntityType?` | `null` \| [`EntityType`](EntityType.md) | - |
