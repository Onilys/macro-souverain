use super::*;
use chrono::TimeZone;
use serde_json::json;
#[test]
fn once_has_exactly_one_future_firing_and_normalizes_offsets() {
    let now = Utc.with_ymd_and_hms(2026, 10, 2, 0, 0, 0).unwrap();
    let schedule: RoutineSchedule = serde_json::from_value(
        serde_json::json!({"type":"once", "at":"2026-10-03T09:15:00-04:00"}),
    )
    .unwrap();
    let trigger = schedule.cron(now).unwrap();
    assert_eq!(trigger.1, "UTC");
    let cron = trigger.0.parse::<cron::Schedule>().unwrap();
    let runs: Vec<_> = cron.after(&now).take(2).collect();
    assert_eq!(
        runs,
        vec![Utc.with_ymd_and_hms(2026, 10, 3, 13, 15, 0).unwrap()]
    );
    assert!(schedule.cron(runs[0]).is_err());
}
#[test]
fn recurring_schedules_validate_timezone_and_future_runs() {
    let now = Utc::now();
    assert!(
        RoutineSchedule::Cron {
            expression: "0 0 9 * * MON-FRI".into(),
            timezone: "America/New_York".into()
        }
        .cron(now)
        .is_ok()
    );
    assert!(
        RoutineSchedule::Cron {
            expression: "0 0 9 * * *".into(),
            timezone: "imaginary".into()
        }
        .cron(now)
        .is_err()
    );
    assert!(
        RoutineSchedule::Cron {
            expression: "0 0 9 1 1 * 2000".into(),
            timezone: "UTC".into()
        }
        .cron(now)
        .is_err()
    );
}

fn config(
    schedule: Option<RoutineSchedule>,
    events: Option<Vec<RoutineEventFilter>>,
) -> RoutineConfiguration {
    RoutineConfiguration {
        name: "Bug reports".into(),
        instructions: "Dispatch a coding agent for this bug report.".into(),
        target: RoutineTarget::Model {
            model: "model".into(),
        },
        schedule,
        events,
    }
}

#[test]
fn event_names_match_the_scheduler_allowlist() {
    let cases = [
        (RoutineEventName::DocumentCreated, "document.created"),
        (RoutineEventName::DocumentUpdated, "document.updated"),
        (RoutineEventName::DocumentDeleted, "document.deleted"),
        (RoutineEventName::TaskCreated, "task.created"),
        (RoutineEventName::TaskStatusChanged, "task.status_changed"),
        (
            RoutineEventName::TaskPriorityChanged,
            "task.priority_changed",
        ),
        (
            RoutineEventName::TaskPropertyChanged,
            "task.property_changed",
        ),
        (
            RoutineEventName::EmailMessageReceived,
            "email.message_received",
        ),
        (RoutineEventName::ChannelCreated, "channel.created"),
        (
            RoutineEventName::ChannelMessagePosted,
            "channel.message_posted",
        ),
        (RoutineEventName::ChannelMentioned, "channel.mentioned"),
        (
            RoutineEventName::ChannelMessagePatched,
            "channel.message_patched",
        ),
        (
            RoutineEventName::ChannelMessageAttachmentCreated,
            "channel.message_attachment_created",
        ),
    ];
    assert_eq!(cases.len(), 13);
    for (name, wire) in cases {
        match name {
            RoutineEventName::DocumentCreated
            | RoutineEventName::DocumentUpdated
            | RoutineEventName::DocumentDeleted
            | RoutineEventName::TaskCreated
            | RoutineEventName::TaskStatusChanged
            | RoutineEventName::TaskPriorityChanged
            | RoutineEventName::TaskPropertyChanged
            | RoutineEventName::EmailMessageReceived
            | RoutineEventName::ChannelCreated
            | RoutineEventName::ChannelMessagePosted
            | RoutineEventName::ChannelMentioned
            | RoutineEventName::ChannelMessagePatched
            | RoutineEventName::ChannelMessageAttachmentCreated => {}
        }
        assert_eq!(name.as_str(), wire);
        assert_eq!(serde_json::to_value(name).unwrap(), json!(wire));
        let parsed: RoutineEventName = serde_json::from_value(json!(wire)).unwrap();
        assert_eq!(parsed, name);
    }
}

#[test]
fn a_channel_message_is_an_event_trigger_without_a_schedule() {
    let channel = Uuid::from_u128(7);
    let now = Utc::now();
    let trigger = config(
        None,
        Some(vec![RoutineEventFilter {
            events: vec![
                RoutineEventName::ChannelMessagePosted,
                RoutineEventName::ChannelMessagePosted,
            ],
            ids: Some(vec![channel, channel]),
            condition: Some("  Is this a bug report?  ".into()),
        }]),
    )
    .trigger(now)
    .unwrap();
    assert_eq!(
        trigger,
        json!({
            "type": "events",
            "filters": [{
                "events": ["channel.message_posted"],
                "ids": [channel],
                "condition": "Is this a bug report?"
            }]
        })
    );
}

#[test]
fn scoped_events_require_an_item_and_creation_events_do_not() {
    let now = Utc::now();
    let missing = config(
        None,
        Some(vec![RoutineEventFilter {
            events: vec![RoutineEventName::ChannelMessagePosted],
            ids: None,
            condition: None,
        }]),
    )
    .trigger(now);
    assert!(missing.is_err());
    let created = config(
        None,
        Some(vec![RoutineEventFilter {
            events: vec![RoutineEventName::ChannelCreated],
            ids: None,
            condition: None,
        }]),
    )
    .trigger(now)
    .unwrap();
    assert_eq!(
        created,
        json!({"type": "events", "filters": [{"events": ["channel.created"]}]})
    );
}

#[test]
fn schedule_and_events_combine_into_one_trigger_list() {
    let now = Utc.with_ymd_and_hms(2026, 10, 2, 0, 0, 0).unwrap();
    let trigger = config(
        Some(RoutineSchedule::Cron {
            expression: "0 0 9 * * *".into(),
            timezone: "UTC".into(),
        }),
        Some(vec![RoutineEventFilter {
            events: vec![RoutineEventName::EmailMessageReceived],
            ids: None,
            condition: None,
        }]),
    )
    .trigger(now)
    .unwrap();
    assert_eq!(trigger["type"], "multiple");
    assert_eq!(trigger["triggers"][0]["type"], "cron");
    assert_eq!(trigger["triggers"][1]["type"], "events");
}

#[test]
fn a_routine_needs_a_schedule_or_an_event_and_a_bounded_condition() {
    let now = Utc::now();
    assert!(config(None, None).trigger(now).is_err());
    assert!(config(None, Some(vec![])).trigger(now).is_err());
    let too_long = config(
        None,
        Some(vec![RoutineEventFilter {
            events: vec![RoutineEventName::EmailMessageReceived],
            ids: None,
            condition: Some("x".repeat(MAX_CONDITION_CHARS + 1)),
        }]),
    )
    .trigger(now);
    assert!(too_long.is_err());
}

fn schema_consts(value: &serde_json::Value, found: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                schema_consts(item, found);
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(name) = map.get("const").and_then(|item| item.as_str()) {
                found.push(name.to_owned());
            }
            for (key, child) in map {
                if key != "description" && key != "const" {
                    schema_consts(child, found);
                }
            }
        }
        _ => {}
    }
}

#[test]
fn the_tool_schema_offers_message_events_without_requiring_a_schedule() {
    let schema = schemars::schema_for!(RoutineConfiguration).to_value();
    let required = schema["required"].as_array().unwrap();
    assert!(required.iter().any(|field| field == "name"));
    assert!(
        required
            .iter()
            .all(|field| field != "schedule" && field != "events")
    );
    let mut names = Vec::new();
    schema_consts(&schema, &mut names);
    assert!(names.iter().any(|name| name == "channel.message_posted"));
    assert!(names.iter().any(|name| name == "channel.mentioned"));
    assert!(names.iter().any(|name| name == "email.message_received"));
}
