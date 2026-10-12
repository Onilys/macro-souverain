use super::*;

#[test]
fn create_routine_tells_the_model_how_to_run_on_a_channel_message() {
    let schema = schemars::schema_for!(CreateRoutine).to_value();
    let description = schema["description"].as_str().unwrap();
    assert!(description.contains("channel.message_posted"));
    assert!(description.contains("omit schedule"));
}
