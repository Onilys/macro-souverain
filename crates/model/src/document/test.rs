use super::basic::DocumentBasic;
use model_owner::Owner;
use serde_json::json;

fn user_owner(principal: &str) -> Owner {
    Owner::from_principal_str(principal).unwrap()
}

#[test]
fn test_document_basic_serde_roundtrip() {
    let original = DocumentBasic {
        document_id: "doc-123".to_string(),
        document_name: "Test Document".to_string(),
        owner: user_owner("macro|test@example.com"),
        file_type: Some("pdf".to_string()),
        sub_type: None,
        branched_from_id: Some("parent-doc-456".to_string()),
        branched_from_version_id: Some(42),
        document_family_id: Some(100),
        project_id: Some("project-789".to_string()),
        deleted_at: None,
    };

    let serialized = serde_json::to_value(&original).expect("Failed to serialize DocumentBasic");
    assert_eq!(serialized["owner"], "macro|test@example.com");
    let deserialized: DocumentBasic =
        serde_json::from_value(serialized).expect("Failed to deserialize DocumentBasic");

    assert_eq!(original, deserialized);
}

#[test]
fn document_basic_deserializes_bot_owner_principal() {
    let value = json!({
        "documentId": "doc-bot",
        "documentName": "Bot Doc",
        "owner": "bot|00000000-0000-0000-0000-00000000a1a1"
    });
    let parsed: DocumentBasic = serde_json::from_value(value).unwrap();
    assert_eq!(
        parsed.owner,
        Owner::from_principal_str("bot|00000000-0000-0000-0000-00000000a1a1").unwrap()
    );
}

#[test]
fn document_basic_deserializes_team_owner_principal() {
    let value = json!({
        "documentId": "doc-team",
        "documentName": "Team Doc",
        "owner": "01234567-89ab-cdef-0123-456789abcdef"
    });
    let parsed: DocumentBasic = serde_json::from_value(value).unwrap();
    assert_eq!(
        parsed.owner,
        Owner::from_principal_str("01234567-89ab-cdef-0123-456789abcdef").unwrap()
    );
}
