# Type Alias: IngestTranscriptData

> **IngestTranscriptData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body` | [`TranscriptSegmentRequest`](TranscriptSegmentRequest.md) | - |
| <a id="property-path"></a> `path` | `object` | - |
| `path.room_name` | `string` | RTC room name; the transcription agent passes its LiveKit room verbatim |
| <a id="property-query"></a> `query?` | `never` | - |
| <a id="property-url"></a> `url` | `"/call/{room_name}/transcript"` | - |
