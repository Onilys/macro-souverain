# Type Alias: SimpleCalendarEventSearchResponseBaseItemHumanReadableTimestamp

> **SimpleCalendarEventSearchResponseBaseItemHumanReadableTimestamp** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-calendar_event_id"></a> `calendar_event_id` | `string` | The calendar event id |
| <a id="property-created_at"></a> `created_at` | `string` | DateTime<Utc> ts_seconds deserialization + RFC3339 serialization |
| <a id="property-highlight"></a> `highlight` | [`SearchHighlight`](SearchHighlight.md) | The highlights on the event |
| <a id="property-is_recurring"></a> `is_recurring` | `boolean` | Whether the series carries a recurrence rule |
| <a id="property-occurrence_key"></a> `occurrence_key?` | `string` \| `null` | Stable key of the instance this row points at, when one resolved |
| <a id="property-title"></a> `title` | `string` | The event title |
| <a id="property-updated_at"></a> `updated_at` | `string` | DateTime<Utc> ts_seconds deserialization + RFC3339 serialization |
| <a id="property-user_id"></a> `user_id` | `string` | The owner of this event projection |
