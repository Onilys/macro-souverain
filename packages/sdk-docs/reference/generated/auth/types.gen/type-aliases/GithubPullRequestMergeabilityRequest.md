# Type Alias: GithubPullRequestMergeabilityRequest

> **GithubPullRequestMergeabilityRequest** = `object`

Request body for the mergeability of several pull requests.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-pullrequests"></a> `pullRequests` | [`GithubPullRequestNumber`](GithubPullRequestNumber.md)[] | The pull requests to check, at most [`GithubPullRequestMergeabilityRequest::MAX`]. |
