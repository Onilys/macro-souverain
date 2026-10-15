use super::*;

/// The EventBridge rule sends this exact static payload straight to the
/// queue (see infra/stacks/email-service/index.ts). If the serde shape of
/// the wrapper or enum changes, the nightly cron silently stops parsing —
/// this test pins the wire format.
#[test]
fn start_job_static_payload_deserializes() {
    let msg: CrmCleanupPubsubMessage = serde_json::from_str(r#"{"operation":"start_job"}"#)
        .expect("EventBridge static payload must deserialize");
    assert_eq!(msg.operation, CrmCleanupOperation::StartJob);
}
