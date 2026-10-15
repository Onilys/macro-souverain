# Type Alias: ChannelSearchRequest

> **ChannelSearchRequest** = `null` \| [`ChannelFilters`](ChannelFilters.md) & `object`

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `collapse?` | `boolean` \| `null` | If true, returns only 1 result per entity. False by default. |
| `match_type` | [`MatchType`](MatchType.md) | The match type to use when searching |
| `query?` | `string` \| `null` | The query to search for |
| `search_on?` | [`SearchOn`](SearchOn.md) | Fields to search on (Name, Content, NameContent). Defaults to Content |
| `sort?` | [`ChannelSortTimestamp`](ChannelSortTimestamp.md) | Sort key for results. Defaults to `message`. |
| `terms?` | `string`[] \| `null` | Multiple terms to search over |
