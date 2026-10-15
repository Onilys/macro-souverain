# Type Alias: InferColumnTypeOptions

> **InferColumnTypeOptions** = `object`

Settle an empty inferred column using the table version the caller read.

## Properties

| Property | Type |
| ------ | ------ |
| <a id="property-baseversion"></a> `baseVersion` | [`TableVersion`](../../../../../generated/storage/types.gen/type-aliases/TableVersion.md) |
| <a id="property-datatype"></a> `dataType` | `"STRING"` \| `"NUMBER"` \| `"ENTITY"` |
| <a id="property-specificentitytype"></a> `specificEntityType?` | [`InferColumnTypeRequest`](../../../../../generated/storage/types.gen/type-aliases/InferColumnTypeRequest.md)\[`"specificEntityType"`\] |
