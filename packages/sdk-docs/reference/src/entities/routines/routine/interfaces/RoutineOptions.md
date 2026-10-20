# Interface: RoutineOptions

Configuration of an agent routine.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-agent"></a> `agent?` | [`Agent`](../../../agents/agent/classes/Agent.md) | Agent to run the task. |
| <a id="property-enabled"></a> `enabled?` | `boolean` | Whether triggers can start executions. Defaults to true on creation. |
| <a id="property-model"></a> `model?` | `string` | Model override. |
| <a id="property-name"></a> `name` | `string` | Display name. |
| <a id="property-prompt"></a> `prompt` | `string` | Instructions delivered to the agent. |
| <a id="property-trigger"></a> `trigger` | [`RoutineTriggerOptions`](../type-aliases/RoutineTriggerOptions.md) | Schedules or Macro events that start the routine. |
| <a id="property-userprompt"></a> `userPrompt` | `string` | Original user instructions. |
