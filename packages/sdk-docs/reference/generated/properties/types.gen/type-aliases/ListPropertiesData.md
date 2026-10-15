# Type Alias: ListPropertiesData

> **ListPropertiesData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query` | `object` | - |
| `query.for_entity_type?` | [`EntityType`](EntityType.md) | Filter properties applicable to a specific entity type |
| `query.include_options?` | `boolean` | Whether to include property options in the response |
| `query.scope` | [`PropertyScope`](PropertyScope.md) | Filter by scope: 'user', 'team', 'system', or 'all' |
| <a id="property-url"></a> `url` | `"/properties/definitions"` | - |
