use super::*;
const EVENTBRIDGE_SWEEP_PAYLOAD: &str = r#"{"operation":"sweep"}"#;

#[test]
fn the_eventbridge_sweep_payload_round_trips() {
    let parsed: ReminderDispatchMessage =
        serde_json::from_str(EVENTBRIDGE_SWEEP_PAYLOAD).expect("parses");

    assert_eq!(parsed.operation, ReminderDispatchOperation::Sweep);
    assert_eq!(
        serde_json::to_string(&parsed).expect("serializes"),
        EVENTBRIDGE_SWEEP_PAYLOAD
    );
}

#[test]
fn an_unknown_operation_is_rejected() {
    // The worker relies on this to discard a message it cannot act on rather
    // than letting it cycle to the dead-letter queue.
    let result = serde_json::from_str::<ReminderDispatchMessage>(r#"{"operation":"explode"}"#);

    assert!(result.is_err());
}
