# Type Alias: ImportRun

> **ImportRun** = \{ `error?`: `string` \| `null`; `source`: [`ImportSource`](ImportSource.md); `status`: [`RunStatus`](RunStatus.md); `updated_at`: `string`; \}

Discovery-run state for one user × source.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-error"></a> `error?` | `string` \| `null` | Discovery failure detail, when the run failed. |
| <a id="property-source"></a> `source` | [`ImportSource`](ImportSource.md) | The source this run discovered from. |
| <a id="property-status"></a> `status` | [`RunStatus`](RunStatus.md) | Where the run is in its lifecycle. |
| <a id="property-updated_at"></a> `updated_at` | `string` | When the run state last changed. |
