# Class: CalendarNamespace

The calendar surface: the caller's visible calendars, event creation, and
handles to individual events and calendars. Backed by calendar_service (the
SDK reaches it on the gateway's `/calendar` route).

## Constructors

### Constructor

> **new CalendarNamespace**(`client`): `CalendarNamespace`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `client` | `MacroClient` |

#### Returns

`CalendarNamespace`

## Methods

### availabilityCalendars()

> **availabilityCalendars**(): `Promise`\<\{ `calendar`: [`Calendar`](../../calendar/classes/Calendar.md); `contributesToAvailability`: `boolean`; `isPrimary`: `boolean`; `name`: `string`; \}[]\>

Calendar availability settings, each referring to a typed calendar.

#### Returns

`Promise`\<\{ `calendar`: [`Calendar`](../../calendar/classes/Calendar.md); `contributesToAvailability`: `boolean`; `isPrimary`: `boolean`; `name`: `string`; \}[]\>

***

### calendar()

> **calendar**(`id`): [`Calendar`](../../calendar/classes/Calendar.md)

A handle to a calendar by id. Detail loads on first access.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Calendar`](../../calendar/classes/Calendar.md)

***

### calendars()

> **calendars**(): `Promise`\<[`Calendar`](../../calendar/classes/Calendar.md)[]\>

The caller's visible calendars, primaries and writable first.

#### Returns

`Promise`\<[`Calendar`](../../calendar/classes/Calendar.md)[]\>

***

### createEvent()

> **createEvent**(`options`): `Promise`\<[`CalendarEvent`](../../event/classes/CalendarEvent.md)\>

Create a calendar event and return a handle to its synced record.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`CreateEventOptions`](../interfaces/CreateEventOptions.md) |

#### Returns

`Promise`\<[`CalendarEvent`](../../event/classes/CalendarEvent.md)\>

***

### event()

> **event**(`id`): [`CalendarEvent`](../../event/classes/CalendarEvent.md)

A handle to a calendar event by id, for driving mutations.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`CalendarEvent`](../../event/classes/CalendarEvent.md)

***

### occurrences()

> **occurrences**(`options`): `AsyncGenerator`\<\{ `event`: [`CalendarEvent`](../../event/classes/CalendarEvent.md); `occurrence`: [`CalendarOccurrence`](../../../../../generated/storage/types.gen/type-aliases/CalendarOccurrence.md); \}, `any`, `any`\>

Calendar occurrences in a viewport, automatically paginated.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `Omit`\<[`ListOccurrencesData`](../../../../../generated/storage/types.gen/type-aliases/ListOccurrencesData.md)\[`"query"`\], `"cursor"`\> |

#### Returns

`AsyncGenerator`\<\{ `event`: [`CalendarEvent`](../../event/classes/CalendarEvent.md); `occurrence`: [`CalendarOccurrence`](../../../../../generated/storage/types.gen/type-aliases/CalendarOccurrence.md); \}, `any`, `any`\>

***

### replacement()

> **replacement**(`operationId`): [`CalendarReplacement`](../../replacement/classes/CalendarReplacement.md)

Recover a saved replacement, including after its original event was retired.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `operationId` | `string` |

#### Returns

[`CalendarReplacement`](../../replacement/classes/CalendarReplacement.md)

***

### setTeamSharing()

> **setTeamSharing**(`sharing`): `Promise`\<[`TeamCalendarSharing`](../../../../../generated/calendar/types.gen/type-aliases/TeamCalendarSharing.md)\>

Replace the team calendar sharing preference.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sharing` | [`TeamCalendarSharing`](../../../../../generated/calendar/types.gen/type-aliases/TeamCalendarSharing.md) |

#### Returns

`Promise`\<[`TeamCalendarSharing`](../../../../../generated/calendar/types.gen/type-aliases/TeamCalendarSharing.md)\>

***

### teamOutOfOffice()

> **teamOutOfOffice**(`options`): `Promise`\<\{ `hasMore`: `boolean`; `items`: \{ `event`: [`CalendarEvent`](../../event/classes/CalendarEvent.md); `occurrenceKey`: `string`; `owner`: [`User`](../../../users/user/classes/User.md); `time`: [`EventTime`](../../../../../generated/storage/types.gen/type-aliases/EventTime.md); `title`: `string` \| `undefined`; \}[]; \}\>

Teammates' out-of-office occurrences in a bounded viewport. Check hasMore for truncation.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | \{ `end`: `string`; `endDate?`: `string`; `limit?`: `number`; `start`: `string`; `startDate?`: `string`; \} | - |
| `options.end` | `string` | Exclusive UTC viewport end. |
| `options.endDate?` | `string` | Exclusive local date boundary for all-day events. |
| `options.limit?` | `number` | Maximum number of occurrences, from 1 through 2,000. |
| `options.start` | `string` | Inclusive UTC viewport start. |
| `options.startDate?` | `string` | Inclusive local date boundary for all-day events. |

#### Returns

`Promise`\<\{ `hasMore`: `boolean`; `items`: \{ `event`: [`CalendarEvent`](../../event/classes/CalendarEvent.md); `occurrenceKey`: `string`; `owner`: [`User`](../../../users/user/classes/User.md); `time`: [`EventTime`](../../../../../generated/storage/types.gen/type-aliases/EventTime.md); `title`: `string` \| `undefined`; \}[]; \}\>

***

### teamPage()

> **teamPage**(`options`): `Promise`\<\{ `items`: (\{ `contributesToAvailability`: `boolean`; `id`: `string`; `kind`: `"busy"`; `owner`: [`User`](../../../users/user/classes/User.md); `time`: [`EventTime`](../../../../../generated/storage/types.gen/type-aliases/EventTime.md); \} \| \{ `contributesToAvailability`: `boolean`; `details`: [`TeamCalendarDetails`](../../../../../generated/storage/types.gen/type-aliases/TeamCalendarDetails.md); `id`: `string`; `kind`: `"details"`; `owner`: [`User`](../../../users/user/classes/User.md); `time`: [`EventTime`](../../../../../generated/storage/types.gen/type-aliases/EventTime.md); \})[]; `members`: \{ `coverage`: [`TeamCalendarCoverage`](../../../../../generated/storage/types.gen/type-aliases/TeamCalendarCoverage.md); `sharing`: [`TeamCalendarSharing`](../../../../../generated/storage/types.gen/type-aliases/TeamCalendarSharing.md); `user`: [`User`](../../../users/user/classes/User.md); \}[]; `nextCursor`: `string` \| `undefined`; \}\>

A page of team availability, including its roster and continuation cursor.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | \{ `cursor?`: `string` \| `null`; `end`: `string`; `limit?`: `number` \| `null`; `start`: `string`; \} | - |
| `options.cursor?` | `string` \| `null` | Continuation returned by the preceding page. |
| `options.end` | `string` | Exclusive instant. |
| `options.limit?` | `number` \| `null` | Maximum source occurrences, at most 2,000. Zero returns the roster only. |
| `options.start` | `string` | Inclusive instant. |

#### Returns

`Promise`\<\{ `items`: (\{ `contributesToAvailability`: `boolean`; `id`: `string`; `kind`: `"busy"`; `owner`: [`User`](../../../users/user/classes/User.md); `time`: [`EventTime`](../../../../../generated/storage/types.gen/type-aliases/EventTime.md); \} \| \{ `contributesToAvailability`: `boolean`; `details`: [`TeamCalendarDetails`](../../../../../generated/storage/types.gen/type-aliases/TeamCalendarDetails.md); `id`: `string`; `kind`: `"details"`; `owner`: [`User`](../../../users/user/classes/User.md); `time`: [`EventTime`](../../../../../generated/storage/types.gen/type-aliases/EventTime.md); \})[]; `members`: \{ `coverage`: [`TeamCalendarCoverage`](../../../../../generated/storage/types.gen/type-aliases/TeamCalendarCoverage.md); `sharing`: [`TeamCalendarSharing`](../../../../../generated/storage/types.gen/type-aliases/TeamCalendarSharing.md); `user`: [`User`](../../../users/user/classes/User.md); \}[]; `nextCursor`: `string` \| `undefined`; \}\>

***

### teamSharing()

> **teamSharing**(): `Promise`\<[`TeamCalendarSharing`](../../../../../generated/calendar/types.gen/type-aliases/TeamCalendarSharing.md)\>

Current sharing preference for the team calendar.

#### Returns

`Promise`\<[`TeamCalendarSharing`](../../../../../generated/calendar/types.gen/type-aliases/TeamCalendarSharing.md)\>
