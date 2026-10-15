# Type Alias: ListOccurrencesData

> **ListOccurrencesData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query` | `object` | - |
| `query.cursor?` | `string` | Opaque continuation cursor returned by the previous page. |
| `query.end` | `string` | Exclusive UTC viewport end. |
| `query.endDate?` | `string` | Exclusive local date boundary for all-day events. |
| `query.limit?` | `number` | Maximum number of occurrences, from 1 through 2,000. |
| `query.start` | `string` | Inclusive UTC viewport start. |
| `query.startDate?` | `string` | Inclusive local date boundary for all-day events. |
| <a id="property-url"></a> `url` | `"/calendar-events"` | - |
