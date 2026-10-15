# Type Alias: GithubPullRequestMergeabilityResponse

> **GithubPullRequestMergeabilityResponse** = `object`

Response body for pull request mergeability. Pull requests the user
cannot see are left out.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-pullrequests"></a> `pullRequests` | [`GithubPullRequestMergeabilityEntry`](GithubPullRequestMergeabilityEntry.md)[] | The mergeability of each visible pull request. |
