# Type Alias: BulkDeleteResponse

> **BulkDeleteResponse** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-failed"></a> `failed` | `number` | Number of failed deletions |
| <a id="property-results"></a> `results` | [`DeleteResult`](DeleteResult.md)[] | Individual results for each file |
| <a id="property-succeeded"></a> `succeeded` | `number` | Number of successful deletions |
| <a id="property-total"></a> `total` | `number` | Total number of files attempted |
