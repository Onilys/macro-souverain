use super::list_labels::build_summary;
use super::*;
use crate::domain::models::UserProvider;
use ai_toolset::schema::generate_validated_input_schema;
use chrono::Utc;
use macro_user_id::email::EmailStr;

fn make_link(macro_id: &'static str, email: &'static str, is_primary: bool) -> Link {
    Link {
        id: uuid::Uuid::new_v4(),
        macro_id: MacroUserIdStr::parse_from_str(macro_id).unwrap(),
        fusionauth_user_id: "fa-user".to_string(),
        email_address: EmailStr::parse_from_str(email).unwrap(),
        provider: UserProvider::Gmail,
        is_sync_active: true,
        is_primary,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

#[test]
fn test_build_summary_empty() {
    let summary = build_summary(&[]);
    assert_eq!(summary, "No email labels found.");
}

#[test]
fn test_build_summary_with_labels() {
    let labels = vec![
        ToolLabel {
            id: uuid::Uuid::new_v4(),
            name: "INBOX".to_string(),
            type_: "system".to_string(),
        },
        ToolLabel {
            id: uuid::Uuid::new_v4(),
            name: "SENT".to_string(),
            type_: "system".to_string(),
        },
        ToolLabel {
            id: uuid::Uuid::new_v4(),
            name: "Work".to_string(),
            type_: "user".to_string(),
        },
    ];

    let summary = build_summary(&labels);
    assert!(summary.contains("2 system labels"));
    assert!(summary.contains("1 custom label"));
    assert!(summary.starts_with("Found"));
}

#[test]
fn test_update_thread_labels_schema_validation() {
    let result = generate_validated_input_schema::<UpdateThreadLabels>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "UpdateThreadLabels",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("label"),
        "Description should contain expected text"
    );
}

#[test]
fn test_send_email_schema_validation() {
    let result = generate_validated_input_schema::<SendEmail>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "SendEmail",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("send"),
        "Description should contain expected text"
    );
}

/// The confirmed variant takes exactly `SendEmail`'s fields plus the
/// confirmation, and the confirmation is required: the schema is the gate.
#[test]
fn send_confirmed_email_is_send_email_plus_a_required_confirmation() {
    let confirmed = generate_validated_input_schema::<SendConfirmedEmail>().unwrap();
    let plain = generate_validated_input_schema::<SendEmail>().unwrap();
    assert_eq!(confirmed.name, "SendConfirmedEmail");
    assert!(
        confirmed.description.contains("userConfirmation"),
        "{}",
        confirmed.description
    );

    let confirmed = confirmed.schema.to_value();
    let plain = plain.schema.to_value();
    let properties = |schema: &serde_json::Value| {
        let mut names: Vec<String> = schema["properties"]
            .as_object()
            .expect("an object schema")
            .keys()
            .cloned()
            .collect();
        names.sort();
        names
    };
    let mut expected = properties(&plain);
    expected.push("userConfirmation".to_owned());
    expected.sort();
    assert_eq!(properties(&confirmed), expected);
    assert!(
        confirmed["required"]
            .as_array()
            .expect("required is an array")
            .contains(&serde_json::json!("userConfirmation")),
        "{confirmed:#}"
    );
}

#[test]
fn test_get_thread_schema_validation() {
    let result = generate_validated_input_schema::<GetThread>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "GetThread",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("thread"),
        "Description should contain expected text"
    );
}

#[test]
fn test_list_inboxes_schema_validation() {
    let result = generate_validated_input_schema::<ListInboxes>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "ListInboxes",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("inbox"),
        "Description should contain expected text"
    );
}

#[test]
fn resolve_inbox_selector_defaults_to_caller_primary() {
    // The delegated inbox is primary for its own account but must not be chosen
    // as the caller's default — only is_primary AND owned by the caller counts.
    let inboxes = vec![
        make_link("macro|gabtest2@macro.com", "gabtest2@macro.com", true),
        make_link("macro|gab@macro.com", "gabtest1@macro.com", false),
        make_link("macro|gab@macro.com", "gab@macro.com", true),
    ];
    let link = resolve_inbox_selector(&inboxes, "macro|gab@macro.com", None).unwrap();
    assert_eq!(link.email_address.0.as_ref(), "gab@macro.com");
}

#[test]
fn resolve_inbox_selector_matches_address_case_insensitively() {
    let inboxes = vec![
        make_link("macro|gab@macro.com", "gab@macro.com", true),
        make_link("macro|gabtest2@macro.com", "gabtest2@macro.com", true),
    ];
    let link = resolve_inbox_selector(&inboxes, "macro|gab@macro.com", Some("GabTest2@macro.com"))
        .unwrap();
    assert_eq!(link.email_address.0.as_ref(), "gabtest2@macro.com");
}

#[test]
fn test_set_sender_policy_schema_validation() {
    let result = generate_validated_input_schema::<SetSenderPolicy>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "SetSenderPolicy",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("block"),
        "Description should contain expected text"
    );
}

#[test]
fn tool_sender_policy_deserializes_snake_case_values() {
    assert_eq!(
        serde_json::from_str::<ToolSenderPolicy>("\"signal\"").unwrap(),
        ToolSenderPolicy::Signal
    );
    assert_eq!(
        serde_json::from_str::<ToolSenderPolicy>("\"noise\"").unwrap(),
        ToolSenderPolicy::Noise
    );
    assert_eq!(
        serde_json::from_str::<ToolSenderPolicy>("\"block\"").unwrap(),
        ToolSenderPolicy::Block
    );
    assert!(serde_json::from_str::<ToolSenderPolicy>("\"unknown\"").is_err());
}

#[test]
fn resolve_inbox_selector_rejects_unknown_address() {
    let inboxes = vec![make_link("macro|gab@macro.com", "gab@macro.com", true)];
    // Avoid `unwrap_err` so the test does not require `Link: Debug`.
    let err = resolve_inbox_selector(&inboxes, "macro|gab@macro.com", Some("nope@macro.com"))
        .err()
        .expect("unknown inbox address should error");
    assert!(
        err.description.contains("No connected inbox matches"),
        "{}",
        err.description
    );
}

/// The composer's export, as `prepareEmailBody` encodes it: base64url of the
/// body element's outer HTML, unpadded.
fn composer_body(html: &str) -> String {
    URL_SAFE_NO_PAD.encode(html)
}

#[test]
fn composer_html_is_recognized_and_left_alone() {
    let encoded = composer_body("<body><p>hello</p></body>");

    let decoded = decode_composer_html(&encoded).expect("composer body");

    assert_eq!(decoded, "<body><p>hello</p></body>");
}

#[test]
fn model_markdown_is_not_mistaken_for_composer_html() {
    // Whitespace and punctuation put real prose outside the base64url
    // alphabet, so the decode fails before the tag check matters.
    for body in [
        "Hello world",
        "Hi Dana,\n\nFollowing up on the **Q3 migration**.",
        "- one\n- two",
        "# Heading",
    ] {
        assert!(
            decode_composer_html(body).is_none(),
            "markdown treated as composer html: {body}"
        );
    }
}

#[test]
fn base64_that_decodes_to_prose_is_not_treated_as_html() {
    // A single word can be valid base64url by accident; only markup counts.
    let encoded = composer_body("just prose, no markup");

    assert!(decode_composer_html(&encoded).is_none());
}

#[test]
fn leading_whitespace_before_the_tag_still_counts_as_html() {
    let encoded = composer_body("\n  <div>hi</div>");

    assert!(decode_composer_html(&encoded).is_some());
}

mod attachments {
    use super::super::{collect_resolved_attachments, parse_attachment_refs};
    use crate::domain::models::MAX_RAW_ATTACHMENTS_SIZE_BYTES;
    use crate::inbound::toolset::EmailAttachmentRef;
    use attachment::{AttachmentError, EntityFile, ResolutionError};
    use model_entity::EntityType;

    fn reference(entity_type: &str, id: &str) -> EmailAttachmentRef {
        EmailAttachmentRef {
            entity_id: id.to_owned(),
            entity_type: entity_type.to_owned(),
            name: None,
        }
    }

    fn file(name: &str, size: usize) -> EntityFile {
        EntityFile {
            reference: EntityType::Document.with_entity_string("d".to_owned()),
            file_name: name.to_owned(),
            content_type: "application/pdf".to_owned(),
            bytes: vec![0; size],
        }
    }

    fn failure(entity_type: EntityType, id: &str, error: AttachmentError) -> ResolutionError {
        ResolutionError::new(entity_type.with_entity_string(id.to_owned()), error)
    }

    #[test]
    fn parses_known_entity_types() {
        let parsed =
            parse_attachment_refs(&[reference("document", "d1"), reference("static_file", "s1")])
                .expect("both types are known");

        assert_eq!(parsed[0].entity_type, EntityType::Document);
        assert_eq!(parsed[0].entity_id, "d1");
        assert_eq!(parsed[1].entity_type, EntityType::StaticFile);
    }

    /// A type the model invented must be caught before any fetch happens, and
    /// the message has to name the reference so the model can correct itself.
    #[test]
    fn rejects_an_unknown_entity_type_naming_the_reference() {
        let err = parse_attachment_refs(&[reference("spreadsheet_file", "d1")])
            .expect_err("not an EntityType");

        assert!(err.description.contains("spreadsheet_file"));
        assert!(err.description.contains("d1"));
    }

    #[test]
    fn resolved_files_become_attachments_in_order() {
        let attachments =
            collect_resolved_attachments(vec![Ok(file("a.pdf", 10)), Ok(file("b.md", 20))], 2)
                .expect("both resolved");

        assert_eq!(attachments.len(), 2);
        assert_eq!(attachments[0].file_name, "a.pdf");
        assert_eq!(attachments[1].file_name, "b.md");
    }

    /// The whole point of the feature: one unattachable reference stops the
    /// send rather than producing an email that quietly lacks it.
    #[test]
    fn one_failure_fails_the_whole_call() {
        let err = collect_resolved_attachments(
            vec![
                Ok(file("a.pdf", 10)),
                Err(failure(
                    EntityType::Chat,
                    "c1",
                    AttachmentError::NotFileBacked(EntityType::Chat),
                )),
            ],
            2,
        )
        .expect_err("a chat has no file form");

        assert!(err.description.contains("chat"));
        assert!(err.description.contains("c1"));
        assert!(err.description.contains("not sent"));
    }

    /// Every failure is named at once, so the user hears the full story in a
    /// single turn instead of one reference per retry.
    #[test]
    fn every_failure_is_named_in_one_error() {
        let err = collect_resolved_attachments(
            vec![
                Err(failure(
                    EntityType::Document,
                    "d1",
                    AttachmentError::UnsupportedFileType("spreadsheet".to_owned()),
                )),
                Err(failure(
                    EntityType::CalendarEvent,
                    "e1",
                    AttachmentError::NotFileBacked(EntityType::CalendarEvent),
                )),
            ],
            2,
        )
        .expect_err("neither resolves");

        assert!(err.description.contains("d1"));
        assert!(err.description.contains("spreadsheet"));
        assert!(err.description.contains("e1"));
        assert!(err.description.contains("2 of 2"));
    }

    #[test]
    fn attachments_over_the_size_ceiling_are_refused() {
        let err = collect_resolved_attachments(
            vec![
                Ok(file("big.pdf", MAX_RAW_ATTACHMENTS_SIZE_BYTES)),
                Ok(file("one-more.pdf", 1)),
            ],
            2,
        )
        .expect_err("one byte over the ceiling");

        assert!(err.description.contains("18MB"));
    }

    #[test]
    fn attachments_exactly_at_the_ceiling_are_allowed() {
        let attachments = collect_resolved_attachments(
            vec![Ok(file("big.pdf", MAX_RAW_ATTACHMENTS_SIZE_BYTES))],
            1,
        )
        .expect("the ceiling is inclusive");

        assert_eq!(attachments.len(), 1);
    }
}
