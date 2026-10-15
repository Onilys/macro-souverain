# Type Alias: CreateSkillRequest

> **CreateSkillRequest** = `object`

Request body for creating a skill — a markdown document containing
instructions that AI reads and follows when the skill is referenced in an
AI input.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-markdown"></a> `markdown?` | `string` \| `null` | Markdown source text. Defaults to an empty skill document. |
| <a id="property-projectid"></a> `projectId?` | `string` \| `null` | Optional project ID to associate the skill with. |
| <a id="property-skillname"></a> `skillName` | `string` | The name of the skill. |
