//! Which of a task's property values a project keeps.

use initiative::domain::models::InitialPropertyValue;
use models_properties::api::requests::SetPropertyValue;
use models_properties::service::property_value::PropertyValue;
use properties::EntityPropertyInfo;
use system_properties::SystemPropertyKey;
use uuid::Uuid;

/// Task relations a project has no place for: its project, its parent and
/// subtasks (which become the project's tasks), and task-to-task dependencies.
const TASK_ONLY: [Uuid; 4] = [
    SystemPropertyKey::PROJECT_UUID,
    SystemPropertyKey::PARENT_TASK_UUID,
    SystemPropertyKey::SUBTASKS_UUID,
    SystemPropertyKey::DEPENDS_ON_UUID,
];

/// The task's set values the project starts with.
pub(crate) fn project_values(properties: Vec<EntityPropertyInfo>) -> Vec<InitialPropertyValue> {
    properties
        .into_iter()
        .filter(|property| !TASK_ONLY.contains(&property.property_definition_id))
        .filter_map(|property| {
            Some(InitialPropertyValue {
                property_definition_id: property.property_definition_id,
                value: set_value(property.value?, property.is_multi_select)?,
            })
        })
        .collect()
}

/// The tasks the task lists as its subtasks.
pub(crate) fn subtask_ids(properties: &[EntityPropertyInfo]) -> Vec<String> {
    properties
        .iter()
        .find(|property| property.property_definition_id == SystemPropertyKey::SUBTASKS_UUID)
        .and_then(|property| match &property.value {
            Some(PropertyValue::EntityRef(references)) => Some(
                references
                    .iter()
                    .map(|reference| reference.entity_id.clone())
                    .collect(),
            ),
            _ => None,
        })
        .unwrap_or_default()
}

/// A stored value as the write that recreates it; empty values write nothing.
fn set_value(value: PropertyValue, is_multi_select: bool) -> Option<SetPropertyValue> {
    Some(match value {
        PropertyValue::Bool(value) => SetPropertyValue::Boolean { value },
        PropertyValue::Num(value) => SetPropertyValue::Number { value },
        PropertyValue::Str(value) => SetPropertyValue::String { value },
        PropertyValue::Date(value) => SetPropertyValue::Date { value },
        PropertyValue::SelectOption(option_ids) if is_multi_select && !option_ids.is_empty() => {
            SetPropertyValue::MultiSelectOption { option_ids }
        }
        PropertyValue::SelectOption(option_ids) => SetPropertyValue::SelectOption {
            option_id: *option_ids.first()?,
        },
        PropertyValue::EntityRef(references) if is_multi_select && !references.is_empty() => {
            SetPropertyValue::MultiEntityReference { references }
        }
        PropertyValue::EntityRef(references) => SetPropertyValue::EntityReference {
            reference: references.into_iter().next()?,
        },
        PropertyValue::Link(urls) if is_multi_select && !urls.is_empty() => {
            SetPropertyValue::MultiLink { urls }
        }
        PropertyValue::Link(urls) => SetPropertyValue::Link {
            url: urls.into_iter().next()?,
        },
    })
}
