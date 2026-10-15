# Type Alias: OpBatch

> **OpBatch** = `object`

A batch of ops for one database and the versions its tables must be at.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-baseversions"></a> `baseVersions?` | `object` | The version each named table must still be at; the batch is refused as a conflict if one moved. Without one, ops are last-write-wins. |
| <a id="property-ops"></a> `ops` | [`DatabaseOp`](DatabaseOp.md)[] | The ops, in the order they apply. |
