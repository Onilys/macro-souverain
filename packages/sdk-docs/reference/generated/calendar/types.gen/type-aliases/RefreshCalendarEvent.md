# Type Alias: RefreshCalendarEvent

> **RefreshCalendarEvent** = \{ `event`: `"synced"`; `link_id`: `string`; \} \| \{ `event`: `"team_sharing_changed"`; \}

Realtime signal that a connected inbox's calendar projection changed.

## Union Members

### Type Literal

\{ `event`: `"synced"`; `link_id`: `string`; \}

| Name | Type | Description |
| ------ | ------ | ------ |
| `event` | `"synced"` | - |
| `link_id` | `string` | Connected inbox whose calendars changed. |

***

### Type Literal

\{ `event`: `"team_sharing_changed"`; \}
