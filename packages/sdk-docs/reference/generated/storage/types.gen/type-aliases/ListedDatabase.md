# Type Alias: ListedDatabase

> **ListedDatabase** = `object`

A database as listed for a viewer.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-database"></a> `database` | [`Database`](Database.md) | The database. |
| <a id="property-grant"></a> `grant` | [`AccessLevel`](AccessLevel.md) | The viewer's access. |
| <a id="property-tables"></a> `tables` | [`Table`](Table.md)[] | Tables in tab order, so discovery can find a table independently of the containing database's display name. |
