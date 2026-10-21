use super::*;

#[test]
fn active_channel_survives_history_eviction_until_closed() {
    let mut buffer = EventBuffer::default();
    let id = Uuid::new_v4();
    let channel = Uuid::new_v4();
    buffer.frontend(
        id,
        FrontendEvent::Started {
            previous_instance_id: None,
        },
        1,
    );
    buffer.frontend(
        id,
        FrontendEvent::Channel {
            channel_id: channel,
            open: true,
        },
        2,
    );
    for time in 3..200 {
        buffer.native(NativeEvent::MemoryWarning, time);
    }
    let snapshot = buffer.snapshot();
    assert!(snapshot.events.iter().all(|entry| entry.timestamp_ms > 2));
    assert_eq!(snapshot.active_context.len(), 1);
    buffer.frontend(
        id,
        FrontendEvent::Channel {
            channel_id: channel,
            open: false,
        },
        200,
    );
    assert!(buffer.snapshot().active_context.is_empty());
}

#[test]
fn a_delayed_start_cannot_reclaim_a_newer_document() {
    let mut buffer = EventBuffer::default();
    let old = Uuid::new_v4();
    let next = Uuid::new_v4();
    buffer.frontend(
        old,
        FrontendEvent::Started {
            previous_instance_id: None,
        },
        1,
    );
    buffer.frontend(
        next,
        FrontendEvent::Started {
            previous_instance_id: Some(old),
        },
        2,
    );
    buffer.frontend(
        old,
        FrontendEvent::Started {
            previous_instance_id: None,
        },
        3,
    );
    buffer.native(NativeEvent::Foreground, 4);
    assert_eq!(buffer.snapshot().current_frontend_instance_id, Some(next));
    assert_eq!(buffer.snapshot().events.len(), 3);
}

#[test]
fn heartbeats_do_not_evict_events_and_history_is_bounded() {
    let mut buffer = EventBuffer::default();
    let id = Uuid::new_v4();
    buffer.frontend(
        id,
        FrontendEvent::Started {
            previous_instance_id: None,
        },
        1,
    );
    for time in 2..300 {
        buffer.frontend(
            id,
            FrontendEvent::Heartbeat {
                visible: true,
                online: true,
                last_scroll_age_ms: None,
                last_interaction_age_ms: None,
            },
            time,
        );
    }
    assert_eq!(buffer.snapshot().events.len(), 1);
    assert_eq!(
        buffer.snapshot().heartbeat.map(|event| event.timestamp_ms),
        Some(299)
    );
    for time in 300..500 {
        buffer.native(NativeEvent::MemoryWarning, time);
    }
    let snapshot = buffer.snapshot();
    assert_eq!(snapshot.events.len(), CAPACITY);
    assert_eq!(snapshot.dropped, 73);
    assert_eq!(
        snapshot.events.first().map(|event| event.timestamp_ms),
        Some(372)
    );
}

#[test]
fn logout_erases_identifiers_and_ignores_late_callbacks() {
    let mut buffer = EventBuffer::default();
    let old = Uuid::new_v4();
    let next = Uuid::new_v4();
    buffer.frontend(
        old,
        FrontendEvent::Started {
            previous_instance_id: None,
        },
        1,
    );
    buffer.frontend(
        old,
        FrontendEvent::Channel {
            channel_id: Uuid::new_v4(),
            open: true,
        },
        2,
    );
    buffer.frontend(old, FrontendEvent::AccountCleared, 3);
    buffer.frontend(
        old,
        FrontendEvent::Channel {
            channel_id: Uuid::new_v4(),
            open: true,
        },
        4,
    );
    assert_eq!(buffer.snapshot().events.len(), 1);
    buffer.frontend(
        next,
        FrontendEvent::Started {
            previous_instance_id: Some(old),
        },
        5,
    );
    buffer.frontend(old, FrontendEvent::Visibility { visible: false }, 6);
    assert_eq!(buffer.snapshot().events.len(), 2);
    buffer.native(NativeEvent::WebContentTerminated, 7);
    assert_eq!(
        buffer
            .snapshot()
            .events
            .last()
            .and_then(|event| event.frontend_instance_id),
        Some(next)
    );
}

#[test]
fn native_events_and_previous_heartbeat_survive_until_next_document_reads_them() {
    let mut buffer = EventBuffer::default();
    let old = Uuid::new_v4();
    buffer.frontend(
        old,
        FrontendEvent::Started {
            previous_instance_id: None,
        },
        1,
    );
    buffer.frontend(
        old,
        FrontendEvent::Heartbeat {
            visible: true,
            online: true,
            last_scroll_age_ms: Some(20),
            last_interaction_age_ms: None,
        },
        2,
    );
    buffer.native(NativeEvent::Background, 3);
    buffer.native(NativeEvent::MemoryWarning, 4);
    buffer.native(NativeEvent::WebContentTerminated, 5);
    let recovery = buffer.snapshot();
    buffer.frontend(
        Uuid::new_v4(),
        FrontendEvent::Started {
            previous_instance_id: Some(old),
        },
        6,
    );
    assert_eq!(recovery.events.len(), 4);
    assert_eq!(recovery.heartbeat.map(|event| event.timestamp_ms), Some(2));
    assert!(buffer.snapshot().heartbeat.is_none());
}

/// UPDATE_NATIVE_DIAGNOSTIC_TYPES=1 cargo test ... diagnostic_wire_types
#[test]
fn diagnostic_wire_types() {
    let generated = specta_typescript::Typescript::default()
        .export(
            &specta::Types::default().register::<EventSnapshot>(),
            specta_serde::Format,
        )
        .expect("export diagnostic wire types");
    let generated = generated
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    let output = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../src/observability/generated/native-diagnostics.ts");
    if std::env::var_os("UPDATE_NATIVE_DIAGNOSTIC_TYPES").is_some() {
        std::fs::create_dir_all(output.parent().expect("generated directory"))
            .expect("create directory");
        std::fs::write(&output, &generated).expect("write types");
    }
    assert_eq!(
        std::fs::read_to_string(output).expect("generated types"),
        generated
    );
}
