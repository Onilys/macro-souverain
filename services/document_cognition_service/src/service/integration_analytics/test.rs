use super::*;
use serde_json::json;

#[test]
fn pipedream_apps_are_identified_by_their_slug() {
    assert_eq!(
        serde_json::to_value(IntegrationEvent::pipedream("google_drive")).unwrap(),
        json!({ "provider": "google_drive", "connection_type": "pipedream" })
    );
}

#[test]
fn mcp_servers_are_identified_by_host_without_path_or_query() {
    assert_eq!(
        serde_json::to_value(IntegrationEvent::mcp_server(
            "https://mcp.example.com/sse/abc123?token=secret"
        ))
        .unwrap(),
        json!({ "provider": "mcp.example.com", "connection_type": "mcp_server" })
    );
}

#[test]
fn unparseable_mcp_server_urls_are_recorded_as_unknown() {
    assert_eq!(
        serde_json::to_value(IntegrationEvent::mcp_server("not a url")).unwrap(),
        json!({ "provider": "unknown", "connection_type": "mcp_server" })
    );
}
