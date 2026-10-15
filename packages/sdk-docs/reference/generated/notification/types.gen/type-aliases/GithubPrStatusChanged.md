# Type Alias: GithubPrStatusChanged

> **GithubPrStatusChanged** = [`GithubPrNotificationCommon`](GithubPrNotificationCommon.md) & `object`

Metadata for a GitHub pull request lifecycle notification.

## Type Declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `action` | [`GithubPrEventAction`](GithubPrEventAction.md) | The webhook action that triggered this notification. |
| `baseBranch?` | `string` \| `null` | The pull request base branch, when available. |
| `headBranch?` | `string` \| `null` | The pull request head branch, when available. |
| `mergedAt?` | `string` \| `null` | When the pull request was merged, when available. |
| `previousStatus?` | `null` \| [`GithubPrEventStatus`](GithubPrEventStatus.md) | - |
| `status` | [`GithubPrEventStatus`](GithubPrEventStatus.md) | The current normalized pull request status. |
