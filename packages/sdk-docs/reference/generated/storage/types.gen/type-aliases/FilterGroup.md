# Type Alias: FilterGroup

> **FilterGroup** = `object`

Conditions joined by one conjunction.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-conditions"></a> `conditions` | [`FilterNode`](FilterNode.md)[] | The conditions and nested groups. A group without any keeps every row. |
| <a id="property-conjunction"></a> `conjunction` | [`Conjunction`](Conjunction.md) | Whether every condition must hold, or any one. |
