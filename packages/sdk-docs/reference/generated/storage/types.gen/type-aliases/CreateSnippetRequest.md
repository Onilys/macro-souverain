# Type Alias: CreateSnippetRequest

> **CreateSnippetRequest** = `object`

Request body for creating a snippet — a reusable markdown document that can
be inserted into any markdown area.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-markdown"></a> `markdown?` | `string` \| `null` | Markdown source text. Defaults to an empty snippet document. |
| <a id="property-projectid"></a> `projectId?` | `string` \| `null` | Optional project ID to associate the snippet with. |
| <a id="property-snippetname"></a> `snippetName` | `string` | The name of the snippet. |
