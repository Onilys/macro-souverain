# Type Alias: CalendarEventSearchResponseItemWithMetadata

> **CalendarEventSearchResponseItemWithMetadata** = [`CalendarEventSearchResponseItem`](CalendarEventSearchResponseItem.md) & `object`

CalendarEventSearchResponseItem with metadata fetched from macrodb.

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `metadata?` | `null` \| [`CalendarEventMetadata`](CalendarEventMetadata.md) | - |
| `properties?` | [`SoupProperty`](SoupProperty.md)[] \| `null` | Entity properties (e.g. tags) on the event. |
