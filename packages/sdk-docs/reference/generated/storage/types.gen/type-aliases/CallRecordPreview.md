# Type Alias: CallRecordPreview

> **CallRecordPreview** = [`CallRecordPreviewData`](CallRecordPreviewData.md) & `object` \| [`WithCallId`](WithCallId.md) & `object`

Lightweight preview of a call record, returned by the batch preview endpoint.

Each requested id resolves to one of two outcomes: the call exists
(`Exists`) or it does not (`DoesNotExist`). The endpoint does not perform
access checks, so there is no separate "not authorized" variant.
