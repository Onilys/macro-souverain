use super::carried::{project_values, subtask_ids};
use initiative::domain::models::InitialPropertyValue;
use models_properties::api::requests::SetPropertyValue;
use models_properties::service::property_value::PropertyValue;
use models_properties::{DataType, EntityReference, EntityType, PropertyOwner};
use properties::EntityPropertyInfo;
use system_properties::SystemPropertyKey;
use uuid::Uuid;

fn property(id: Uuid, multi: bool, value: Option<PropertyValue>) -> EntityPropertyInfo {
    EntityPropertyInfo {
        property_definition_id: id,
        owner: PropertyOwner::System,
        display_name: String::new(),
        data_type: DataType::SelectString,
        is_multi_select: multi,
        is_system: true,
        value,
        options: Vec::new(),
    }
}

fn task(id: &str) -> EntityReference {
    EntityReference::new(id, EntityType::Task)
}

#[test]
fn a_project_keeps_the_task_values_it_has_a_place_for() {
    let status = Uuid::from_u128(11);
    let assignee = EntityReference::new("macro|a@macro.com", EntityType::User);
    let values = project_values(vec![
        property(
            SystemPropertyKey::STATUS_UUID,
            false,
            Some(PropertyValue::SelectOption(vec![status])),
        ),
        property(
            SystemPropertyKey::ASSIGNEES_UUID,
            true,
            Some(PropertyValue::EntityRef(vec![assignee.clone()])),
        ),
        property(SystemPropertyKey::PRIORITY_UUID, false, None),
        property(
            SystemPropertyKey::PROJECT_UUID,
            false,
            Some(PropertyValue::EntityRef(vec![EntityReference::new(
                "project",
                EntityType::Initiative,
            )])),
        ),
        property(
            SystemPropertyKey::SUBTASKS_UUID,
            true,
            Some(PropertyValue::EntityRef(vec![task("subtask")])),
        ),
        property(
            SystemPropertyKey::DEPENDS_ON_UUID,
            true,
            Some(PropertyValue::EntityRef(vec![task("blocker")])),
        ),
    ]);

    assert_eq!(
        values,
        vec![
            InitialPropertyValue {
                property_definition_id: SystemPropertyKey::STATUS_UUID,
                value: SetPropertyValue::SelectOption { option_id: status },
            },
            InitialPropertyValue {
                property_definition_id: SystemPropertyKey::ASSIGNEES_UUID,
                value: SetPropertyValue::MultiEntityReference {
                    references: vec![assignee],
                },
            },
        ]
    );
}

#[test]
fn empty_selections_write_nothing() {
    let values = project_values(vec![
        property(
            Uuid::from_u128(1),
            false,
            Some(PropertyValue::SelectOption(Vec::new())),
        ),
        property(
            Uuid::from_u128(2),
            true,
            Some(PropertyValue::EntityRef(Vec::new())),
        ),
        property(
            Uuid::from_u128(3),
            false,
            Some(PropertyValue::Link(Vec::new())),
        ),
    ]);
    assert!(values.is_empty());
}

#[test]
fn subtasks_come_from_the_subtasks_property() {
    let properties = vec![property(
        SystemPropertyKey::SUBTASKS_UUID,
        true,
        Some(PropertyValue::EntityRef(vec![task("one"), task("two")])),
    )];
    assert_eq!(subtask_ids(&properties), vec!["one", "two"]);
    assert!(subtask_ids(&[]).is_empty());
}
