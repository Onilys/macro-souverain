# Type Alias: GetForeignEntityBySourceData

> **GetForeignEntityBySourceData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.foreign_entity_id` | `string` | Identifier assigned by the source system; may contain slashes |
| `path.source` | `string` | Foreign entity source, e.g. github_pull_request |
| <a id="property-query"></a> `query?` | `never` | - |
| <a id="property-url"></a> `url` | `"/foreign_entity/by_source/{source}/{foreign_entity_id}"` | - |
