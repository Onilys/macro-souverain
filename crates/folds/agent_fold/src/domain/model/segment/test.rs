use std::path::PathBuf;

use super::*;
use crate::domain::model::{
    AgentRequestId, AnsiText, ElicitationRequestId, ElicitationSchema, ToolUseId,
};

fn text(text: &str) -> MessagePart {
    MessagePart::Text {
        text: text.to_owned(),
    }
}

fn thought(text: &str) -> MessagePart {
    MessagePart::Thought {
        text: text.to_owned(),
    }
}

fn run(id: &str, command: &str, status: ToolStatus) -> MessagePart {
    MessagePart::ToolUse {
        id: ToolUseId(id.to_owned()),
        name: ToolName::native("Bash"),
        status,
        detail: ToolDetail::Terminal {
            command: Some(command.to_owned()),
            output: Some(AnsiText(String::new())),
            exit_code: None,
        },
    }
}

fn read(id: &str, paths: &[&str], status: ToolStatus) -> MessagePart {
    MessagePart::ToolUse {
        id: ToolUseId(id.to_owned()),
        name: ToolName::native("Read"),
        status,
        detail: ToolDetail::Read {
            paths: paths.iter().map(PathBuf::from).collect(),
        },
    }
}

fn macro_tool(id: &str, name: &str, input: serde_json::Value, status: ToolStatus) -> MessagePart {
    MessagePart::ToolUse {
        id: ToolUseId(id.to_owned()),
        name: ToolName::native(name),
        status,
        detail: ToolDetail::Macro {
            input,
            output: None,
            error: None,
        },
    }
}

fn macro_result(
    id: &str,
    name: &str,
    input: serde_json::Value,
    output: serde_json::Value,
) -> MessagePart {
    MessagePart::ToolUse {
        id: ToolUseId(id.to_owned()),
        name: ToolName::native(name),
        status: ToolStatus::Completed,
        detail: ToolDetail::Macro {
            input,
            output: Some(output),
            error: None,
        },
    }
}

fn user_tool(
    id: &str,
    name: &str,
    input: serde_json::Value,
    outcome: UserToolOutcome,
) -> MessagePart {
    MessagePart::ToolUse {
        id: ToolUseId(id.to_owned()),
        name: ToolName::native(name),
        status: ToolStatus::Completed,
        detail: ToolDetail::UserTool { input, outcome },
    }
}

fn permission(id: i64, outcome: PermissionOutcome) -> MessagePart {
    MessagePart::Permission {
        request_id: AgentRequestId::Number(id),
        tool_call: ToolUseId(format!("call-{id}")),
        options: Vec::new(),
        outcome,
    }
}

fn kinds(segments: &[Segment]) -> Vec<(SegmentKind, bool)> {
    segments
        .iter()
        .map(|segment| (segment.kind, segment.sealed))
        .collect()
}

#[test]
fn an_unfinished_passage_is_the_one_open_segment() {
    let parts = [text("Looking into it")];
    assert_eq!(
        kinds(&segments(&parts, false)),
        [(SegmentKind::Prose, false)]
    );
    assert_eq!(kinds(&segments(&parts, true)), [(SegmentKind::Prose, true)]);
}

#[test]
fn narration_work_and_answer_are_three_segments_with_the_steps_grouped() {
    let parts = [
        text("Checking the tests first."),
        run("a", "cargo test", ToolStatus::Completed),
        read("b", &["/repo/src/lib.rs"], ToolStatus::Completed),
        text("All green."),
    ];
    let segments = segments(&parts, true);
    assert_eq!(
        kinds(&segments),
        [
            (SegmentKind::Prose, true),
            (SegmentKind::Activity, true),
            (SegmentKind::Prose, true),
        ]
    );
    assert_eq!((segments[1].start, segments[1].end), (1, 3));
    assert_eq!(
        segments[1].rows,
        [
            ActivityRow {
                id: "a".to_owned(),
                label: "Ran".to_owned(),
                detail: Some("cargo test".to_owned()),
                status: ActivityStatus::Completed,
                card: None,
            },
            ActivityRow {
                id: "b".to_owned(),
                label: "Read".to_owned(),
                detail: Some("lib.rs".to_owned()),
                status: ActivityStatus::Completed,
                card: None,
            },
        ]
    );
    assert_eq!(
        segments.iter().map(|s| s.index).collect::<Vec<_>>(),
        [0, 1, 2]
    );
}

#[test]
fn a_blank_line_between_tool_calls_does_not_split_their_activity() {
    let parts = [
        run("a", "ls", ToolStatus::Completed),
        text("\n\n"),
        run("b", "pwd", ToolStatus::Running),
    ];
    let segments = segments(&parts, false);
    assert_eq!(kinds(&segments), [(SegmentKind::Activity, false)]);
    assert_eq!(segments[0].rows.len(), 2);
    assert_eq!(segments[0].rows[1].label, "Running");
}

#[test]
fn a_thought_inside_a_passage_belongs_to_no_segment() {
    let parts = [text("First half."), thought("hmm"), text("Second half.")];
    let segments = segments(&parts, true);
    assert_eq!(kinds(&segments), [(SegmentKind::Prose, true)]);
    assert_eq!(
        prose_text(&parts, &segments[0]),
        "First half.\n\nSecond half."
    );
}

#[test]
fn each_request_for_the_user_is_its_own_segment() {
    let parts = [
        permission(1, PermissionOutcome::Pending),
        permission(2, PermissionOutcome::Pending),
    ];
    assert_eq!(
        kinds(&segments(&parts, false)),
        [
            (SegmentKind::Interaction, true),
            (SegmentKind::Interaction, false),
        ]
    );
}

#[test]
fn an_answered_request_is_history_and_splits_no_run() {
    let parts = [
        run("a", "ls", ToolStatus::Completed),
        permission(1, PermissionOutcome::Cancelled),
        run("b", "pwd", ToolStatus::Completed),
    ];
    let segments = segments(&parts, true);
    assert_eq!(kinds(&segments), [(SegmentKind::Activity, true)]);
    assert_eq!(segments[0].rows.len(), 2);
}

fn email_review(outcome: ElicitationOutcome, tool_outcome: Option<UserToolOutcome>) -> MessagePart {
    MessagePart::Elicitation {
        request_id: ElicitationRequestId::Number(7),
        tool_call: Some(ToolUseId("call-email".to_owned())),
        message: "Send email?".to_owned(),
        request: ElicitationRequest::UserTool {
            tool: "SendEmail".to_owned(),
            draft: Box::new(serde_json::json!({
                "subject": "Launch plan",
                "to": [{"email": "ana@example.com", "name": "Ana Ruiz"}],
                "body": "Hi Ana"
            })),
            schema: Box::new(ElicitationSchema {
                title: None,
                description: None,
                properties: Vec::new(),
                required: Vec::new(),
            }),
        },
        outcome,
        reported: None,
        tool_outcome,
    }
}

#[test]
fn a_reviewed_email_is_the_step_that_sent_it_with_its_receipt() {
    let accepted = || ElicitationOutcome::Accepted {
        answers: Vec::new(),
    };
    let sent = [
        run("a", "ls", ToolStatus::Completed),
        email_review(
            accepted(),
            Some(UserToolOutcome::Sent {
                message_id: "m-1".to_owned(),
                thread_id: "thread-1".to_owned(),
            }),
        ),
    ];
    let segments_sent = segments(&sent, true);
    assert_eq!(kinds(&segments_sent), [(SegmentKind::Activity, true)]);
    let row = &segments_sent[0].rows[1];
    assert_eq!(row.label, "Sent email");
    assert_eq!(row.detail.as_deref(), Some("Launch plan"));
    assert_eq!(row.status, ActivityStatus::Completed);
    assert_eq!(
        row.card,
        Some(ActivityCard::Item {
            item_type: CardItemType::EmailThread,
            item_id: "thread-1".to_owned(),
            file_type: None,
            action: CardAction::Sent,
            title: Some("Launch plan".to_owned()),
            summary: Some("to Ana Ruiz".to_owned()),
        })
    );

    let sending = [email_review(accepted(), None)];
    let row = &segments(&sending, false)[0].rows[0];
    assert_eq!(
        (row.label.as_str(), row.status),
        ("Sending email", ActivityStatus::Running)
    );

    let discarded = [email_review(ElicitationOutcome::Declined, None)];
    let row = &segments(&discarded, true)[0].rows[0];
    assert_eq!(row.label, "Discarded email draft");
    assert_eq!(row.card, None);

    let waiting = [email_review(ElicitationOutcome::Pending, None)];
    assert_eq!(
        kinds(&segments(&waiting, false)),
        [(SegmentKind::Interaction, false)]
    );
}

#[test]
fn an_answered_question_says_it_was_answered_and_never_what() {
    let question = |tool_call: Option<&str>| MessagePart::Elicitation {
        request_id: ElicitationRequestId::Number(3),
        tool_call: tool_call.map(|id| ToolUseId(id.to_owned())),
        message: "Which deck should I start from?".to_owned(),
        request: ElicitationRequest::Form {
            schema: ElicitationSchema {
                title: None,
                description: None,
                properties: Vec::new(),
                required: Vec::new(),
            },
        },
        outcome: ElicitationOutcome::Accepted {
            answers: Vec::new(),
        },
        reported: None,
        tool_outcome: None,
    };
    let in_place = [question(Some("call-ask"))];
    let row = &segments(&in_place, true)[0].rows[0];
    assert_eq!(row.label, "Answered");
    assert_eq!(
        row.detail.as_deref(),
        Some("Which deck should I start from?")
    );
    // A question its own tool asked is told by that tool's row.
    let beside_its_tool = [
        macro_tool(
            "ask",
            "AskUser",
            serde_json::json!({"question": "Which deck should I start from?"}),
            ToolStatus::Completed,
        ),
        question(None),
    ];
    let segments = segments(&beside_its_tool, true);
    assert_eq!(kinds(&segments), [(SegmentKind::Activity, true)]);
    assert_eq!(segments[0].rows.len(), 1);
}

#[test]
fn a_step_still_running_when_the_turn_ended_is_interrupted() {
    let parts = [run("a", "sleep 100", ToolStatus::Running)];
    let row = &segments(&parts, true)[0].rows[0];
    assert_eq!(row.status, ActivityStatus::Interrupted);
    assert_eq!(row.label, "Ran");
}

#[test]
fn only_sealed_prose_carries_its_text_to_the_server() {
    let parts = [
        text("Narration."),
        run("a", "ls", ToolStatus::Running),
        text("Answer in progress"),
    ];
    let open = project(&parts, false);
    assert_eq!(open[0].text.as_deref(), Some("Narration."));
    assert_eq!(open[1].text, None);
    assert_eq!(open[2].text, None);
    let closed = project(&parts, true);
    assert_eq!(closed[2].text.as_deref(), Some("Answer in progress"));
}

#[test]
fn the_phase_follows_the_last_thing_the_agent_did() {
    assert_eq!(phase(&[], false), Some(TurnPhase::Thinking));
    assert_eq!(phase(&[text("Hi")], false), Some(TurnPhase::Writing));
    assert_eq!(
        phase(&[text("Hi"), thought("now what")], false),
        Some(TurnPhase::Thinking)
    );
    assert_eq!(
        phase(&[run("a", "ls", ToolStatus::Running)], false),
        Some(TurnPhase::Working)
    );
    assert_eq!(
        phase(&[run("a", "ls", ToolStatus::Completed)], false),
        Some(TurnPhase::Thinking)
    );
    assert_eq!(
        phase(&[permission(1, PermissionOutcome::Pending)], false),
        Some(TurnPhase::Waiting)
    );
    assert_eq!(phase(&[text("Done")], true), None);
}

#[test]
fn a_pending_request_waits_even_when_its_tool_reports_after_it() {
    // AskUser sends its question, then reports itself running.
    let parts = [
        permission(1, PermissionOutcome::Pending),
        run("a", "ask", ToolStatus::Running),
    ];
    assert_eq!(phase(&parts, false), Some(TurnPhase::Waiting));
    let answered = [
        permission(
            1,
            PermissionOutcome::Selected {
                option_id: "allow".to_owned(),
            },
        ),
        run("a", "ask", ToolStatus::Running),
    ];
    assert_eq!(phase(&answered, false), Some(TurnPhase::Working));
}

#[test]
fn long_commands_keep_their_first_line_cut_to_length() {
    let long = format!("echo {}\nsecond line", "x".repeat(200));
    let parts = [run("a", &long, ToolStatus::Completed)];
    let detail = segments(&parts, true)[0].rows[0].detail.clone().unwrap();
    assert!(detail.ends_with('…'));
    assert_eq!(detail.chars().count(), DETAIL_MAX_CHARS);
    assert!(!detail.contains("second"));
}

#[test]
fn several_files_are_counted_rather_than_listed() {
    let parts = [read(
        "a",
        &["/a.rs", "/b.rs", "/c.rs"],
        ToolStatus::Completed,
    )];
    assert_eq!(
        segments(&parts, true)[0].rows[0].detail.as_deref(),
        Some("3 files")
    );
}

#[test]
fn macro_tools_read_as_their_name_with_what_they_acted_on() {
    let parts = [
        macro_tool(
            "a",
            "SearchDocuments",
            serde_json::json!({"query": "quarterly report", "limit": 5}),
            ToolStatus::Completed,
        ),
        macro_tool(
            "b",
            "list_entities",
            serde_json::json!({"limit": 5}),
            ToolStatus::Failed,
        ),
        macro_tool(
            "c",
            "CreateDocument",
            serde_json::json!({"documentName": "Launch FAQ", "fileContent": "..."}),
            ToolStatus::Completed,
        ),
    ];
    let rows = &segments(&parts, true)[0].rows;
    assert_eq!(rows[0].label, "Search documents");
    assert_eq!(rows[0].detail.as_deref(), Some("quarterly report"));
    assert_eq!(rows[1].label, "List entities failed");
    assert_eq!(rows[1].detail, None);
    assert_eq!(rows[2].label, "Create document");
    assert_eq!(rows[2].detail.as_deref(), Some("Launch FAQ"));
}

#[test]
fn a_created_document_is_a_card_named_as_the_agent_named_it() {
    let parts = [macro_result(
        "a",
        "CreateDocument",
        serde_json::json!({"documentName": "Launch FAQ", "fileExtension": "md", "fileContent": "..."}),
        serde_json::json!({"documentId": "doc-1"}),
    )];
    let rows = &segments(&parts, true)[0].rows;
    assert_eq!(
        rows[0].card,
        Some(ActivityCard::Item {
            item_type: CardItemType::Document,
            item_id: "doc-1".to_owned(),
            file_type: Some("md".to_owned()),
            action: CardAction::Created,
            title: Some("Launch FAQ".to_owned()),
            summary: None,
        })
    );
}

#[test]
fn a_step_earns_its_card_only_once_it_has_finished() {
    let parts = [
        macro_tool(
            "a",
            "CreateDocument",
            serde_json::json!({"documentName": "Launch FAQ"}),
            ToolStatus::Running,
        ),
        macro_tool(
            "b",
            "EditSpreadsheet",
            serde_json::json!({"documentId": "sheet-1"}),
            ToolStatus::Failed,
        ),
    ];
    let rows = &segments(&parts, false)[0].rows;
    assert!(rows.iter().all(|row| row.card.is_none()));
}

#[test]
fn edits_name_the_document_they_changed() {
    let parts = [
        macro_tool(
            "a",
            "EditDocument",
            serde_json::json!({"document_id": "doc-1", "instructions": "tighten it"}),
            ToolStatus::Completed,
        ),
        macro_tool(
            "b",
            "EditSpreadsheet",
            serde_json::json!({"documentId": "sheet-1", "operations": []}),
            ToolStatus::Completed,
        ),
    ];
    let cards: Vec<_> = segments(&parts, true)[0]
        .rows
        .iter()
        .map(|row| row.card.clone())
        .collect();
    assert_eq!(
        cards,
        [
            Some(ActivityCard::Item {
                item_type: CardItemType::Document,
                item_id: "doc-1".to_owned(),
                file_type: Some("md".to_owned()),
                action: CardAction::Edited,
                title: None,
                summary: None,
            }),
            Some(ActivityCard::Item {
                item_type: CardItemType::Document,
                item_id: "sheet-1".to_owned(),
                file_type: Some("spreadsheet".to_owned()),
                action: CardAction::Edited,
                title: None,
                summary: None,
            }),
        ]
    );
}

#[test]
fn an_edit_that_asked_for_clarification_changed_nothing() {
    let parts = [macro_result(
        "a",
        "EditDocument",
        serde_json::json!({"document_id": "doc-1", "instructions": "tighten it"}),
        serde_json::json!({
            "summary": "Paused for clarification; no edits applied.",
            "clarification": "Which section?"
        }),
    )];
    assert_eq!(segments(&parts, true)[0].rows[0].card, None);
}

#[test]
fn a_shown_view_is_its_card() {
    let view =
        serde_json::json!({"title": "Your week", "widgets": [{"type": "md", "markdown": "Hi"}]});
    let parts = [macro_tool(
        "a",
        "DisplayResults",
        serde_json::json!({"view": view.clone()}),
        ToolStatus::Completed,
    )];
    assert_eq!(
        segments(&parts, true)[0].rows[0].card,
        Some(ActivityCard::View { view })
    );
}

#[test]
fn calendar_tools_card_the_event_they_returned() {
    let event = serde_json::json!({"eventId": "event-1", "title": "Design review", "start": "2026-10-09T15:00:00Z"});
    let parts = [
        macro_result(
            "a",
            "CreateConfirmedCalendarEvent",
            serde_json::json!({}),
            event.clone(),
        ),
        macro_result(
            "b",
            "UpdateCalendarEvent",
            serde_json::json!({}),
            event.clone(),
        ),
        user_tool(
            "c",
            "CreateCalendarEvent",
            serde_json::json!({"title": "Design review"}),
            UserToolOutcome::Completed { result: event },
        ),
    ];
    let actions: Vec<_> = segments(&parts, true)[0]
        .rows
        .iter()
        .map(|row| match &row.card {
            Some(ActivityCard::Item {
                item_type: CardItemType::CalendarEvent,
                item_id,
                title,
                action,
                ..
            }) => {
                assert_eq!(item_id, "event-1");
                assert_eq!(title.as_deref(), Some("Design review"));
                *action
            }
            other => panic!("expected an event card, got {other:?}"),
        })
        .collect();
    assert_eq!(
        actions,
        [CardAction::Created, CardAction::Edited, CardAction::Created]
    );
}

#[test]
fn a_sent_email_is_a_card_and_an_unsent_draft_is_not() {
    let draft = serde_json::json!({"subject": "Launch plan", "to": ["ada@example.com"]});
    let parts = [
        user_tool(
            "a",
            "SendEmail",
            draft.clone(),
            UserToolOutcome::Sent {
                message_id: "message-1".to_owned(),
                thread_id: "thread-1".to_owned(),
            },
        ),
        user_tool("b", "SendEmail", draft, UserToolOutcome::Pending),
    ];
    let rows = &segments(&parts, true)[0].rows;
    assert_eq!(
        rows[0].card,
        Some(ActivityCard::Item {
            item_type: CardItemType::EmailThread,
            item_id: "thread-1".to_owned(),
            file_type: None,
            action: CardAction::Sent,
            title: Some("Launch plan".to_owned()),
            summary: Some("to ada@example.com".to_owned()),
        })
    );
    assert_eq!(rows[1].card, None);
}

#[test]
fn a_card_travels_in_the_row_it_belongs_to() {
    let plain = ActivityRow {
        id: "a".to_owned(),
        label: "Ran".to_owned(),
        detail: None,
        status: ActivityStatus::Completed,
        card: None,
    };
    assert_eq!(
        serde_json::to_value(&plain).unwrap(),
        serde_json::json!({"id": "a", "label": "Ran", "detail": null, "status": "completed", "card": null})
    );
    let carded = ActivityRow {
        card: Some(ActivityCard::Item {
            item_type: CardItemType::EmailThread,
            item_id: "thread-1".to_owned(),
            file_type: None,
            action: CardAction::Sent,
            title: None,
            summary: None,
        }),
        ..plain
    };
    assert_eq!(
        serde_json::to_value(&carded).unwrap()["card"],
        serde_json::json!({
            "kind": "item",
            "itemType": "email_thread",
            "itemId": "thread-1",
            "fileType": null,
            "action": "sent",
            "title": null,
            "summary": null,
        })
    );
}

/// The kind, id, action and summary of each card the rows earned.
fn receipts(
    parts: &[MessagePart],
) -> Vec<Option<(CardItemType, String, CardAction, Option<String>)>> {
    segments(parts, true)[0]
        .rows
        .iter()
        .map(|row| match &row.card {
            Some(ActivityCard::Item {
                item_type,
                item_id,
                action,
                summary,
                ..
            }) => Some((*item_type, item_id.clone(), *action, summary.clone())),
            _ => None,
        })
        .collect()
}

fn receipt(
    item_type: CardItemType,
    id: &str,
    action: CardAction,
    summary: Option<&str>,
) -> Option<(CardItemType, String, CardAction, Option<String>)> {
    Some((item_type, id.to_owned(), action, summary.map(str::to_owned)))
}

#[test]
fn a_spreadsheet_edit_says_what_it_changed() {
    let parts = [
        macro_result(
            "a",
            "EditSpreadsheet",
            serde_json::json!({"documentId": "sheet-1"}),
            serde_json::json!({"applied": true, "changes": [
                {"type": "cells", "sheetId": "s1", "summary": "12 cells in EMEA"}
            ]}),
        ),
        macro_result(
            "b",
            "EditSpreadsheet",
            serde_json::json!({"documentId": "sheet-2"}),
            serde_json::json!({"applied": true, "changes": [
                {"type": "cells", "sheetId": "s1", "summary": "A"},
                {"type": "format", "sheetId": "s1", "summary": "B"},
                {"type": "sheet", "sheetId": "s2", "summary": "C"}
            ]}),
        ),
        macro_result(
            "c",
            "EditSpreadsheet",
            serde_json::json!({"documentId": "sheet-3"}),
            serde_json::json!({"applied": false, "changes": []}),
        ),
    ];
    assert_eq!(
        receipts(&parts),
        [
            receipt(
                CardItemType::Document,
                "sheet-1",
                CardAction::Edited,
                Some("12 cells in EMEA")
            ),
            receipt(
                CardItemType::Document,
                "sheet-2",
                CardAction::Edited,
                Some("3 changes")
            ),
            None,
        ]
    );
}

#[test]
fn a_sent_email_says_who_it_went_to() {
    let parts = [
        macro_result(
            "a",
            "SendConfirmedEmail",
            serde_json::json!({
                "subject": "Q4 pricing",
                "to": [{"email": "ana@example.com", "name": "Ana Ruiz"}, {"email": "leo@example.com"}]
            }),
            serde_json::json!({"sent": {"message_id": "m-1", "thread_id": "thread-1"}}),
        ),
        user_tool(
            "b",
            "SendEmail",
            serde_json::json!({"subject": "Launch plan", "to": ["ada@example.com"]}),
            UserToolOutcome::Sent {
                message_id: "m-2".to_owned(),
                thread_id: "thread-2".to_owned(),
            },
        ),
    ];
    assert_eq!(
        receipts(&parts),
        [
            receipt(
                CardItemType::EmailThread,
                "thread-1",
                CardAction::Sent,
                Some("to Ana Ruiz and 1 other")
            ),
            receipt(
                CardItemType::EmailThread,
                "thread-2",
                CardAction::Sent,
                Some("to ada@example.com")
            ),
        ]
    );
}

#[test]
fn a_channel_post_is_summed_up_by_its_first_line() {
    let long = format!("<p>{}</p>\n\nSecond paragraph", "word ".repeat(30));
    let parts = [
        macro_result(
            "a",
            "SendChannelMessage",
            serde_json::json!({"channel_id": "channel-1", "content": "  Pricing review   moves to **Thu 10:00**\nDetails below"}),
            serde_json::json!({"channel_id": "channel-1", "message_id": "m-1"}),
        ),
        macro_result(
            "b",
            "SendChannelMessage",
            serde_json::json!({"channel_id": "channel-2", "content": long}),
            serde_json::json!({"channel_id": "channel-2", "message_id": "m-2"}),
        ),
    ];
    let summaries: Vec<_> = receipts(&parts)
        .into_iter()
        .map(|card| card.and_then(|(_, _, _, summary)| summary))
        .collect();
    assert_eq!(
        summaries[0].as_deref(),
        Some("Pricing review moves to Thu 10:00")
    );
    let cut = summaries[1].as_deref().unwrap();
    assert!(cut.ends_with('…') && cut.chars().count() <= 80, "{cut}");
    assert!(!cut.contains('<'), "{cut}");
}

#[test]
fn every_kind_of_item_a_step_changes_is_a_receipt() {
    let parts = [
        macro_result(
            "a",
            "CreateProject",
            serde_json::json!({"name": "Q4 launch"}),
            serde_json::json!({"projectId": "project-1", "projectName": "Q4 launch"}),
        ),
        macro_result(
            "b",
            "MoveToProject",
            serde_json::json!({"entityType": "document", "entityId": "doc-1", "projectId": "project-1"}),
            serde_json::json!({"success": true, "message": "Moved"}),
        ),
        macro_result(
            "c",
            "MoveToProject",
            serde_json::json!({"entityType": "email", "entityId": "thread-1"}),
            serde_json::json!({"success": true, "message": "Moved"}),
        ),
        macro_result(
            "d",
            "CreateChannel",
            serde_json::json!({"name": "pricing"}),
            serde_json::json!({"channelId": "channel-1", "name": "pricing"}),
        ),
        macro_result(
            "e",
            "RenameChannel",
            serde_json::json!({"channelId": "channel-1", "name": "pricing-q4"}),
            serde_json::json!({"channelId": "channel-1", "name": "pricing-q4", "previousName": "pricing"}),
        ),
        macro_result(
            "f",
            "CreateRoutine",
            serde_json::json!({"configuration": {"name": "Weekly digest"}}),
            serde_json::json!({"id": "routine-1", "name": "Weekly digest", "enabled": true}),
        ),
        macro_result(
            "g",
            "UpdateRoutine",
            serde_json::json!({"routineId": "routine-1", "change": {"type": "enabled", "enabled": false}}),
            serde_json::json!({"id": "routine-1", "name": "Weekly digest", "enabled": false}),
        ),
        macro_result(
            "h",
            "CreateForm",
            serde_json::json!({"name": "Intake"}),
            serde_json::json!({"state": "partiallyApplied", "formId": "form-1"}),
        ),
        macro_result(
            "i",
            "CreateInitiative",
            serde_json::json!({"name": "Renewals"}),
            serde_json::json!({"initiativeId": "initiative-1", "name": "Renewals"}),
        ),
        macro_result(
            "j",
            "RenameDocument",
            serde_json::json!({"documentId": "doc-2", "documentName": "Plan v2"}),
            serde_json::json!({"success": true, "documentId": "doc-2", "message": "Renamed"}),
        ),
        macro_result(
            "k",
            "CommentOnDocument",
            serde_json::json!({"documentId": "doc-3"}),
            serde_json::json!({"documentId": "doc-3", "threadId": "t", "commentId": "c", "markedText": "Q4 targets"}),
        ),
        macro_result(
            "l",
            "DeleteCalendarEvent",
            serde_json::json!({"eventId": "event-1", "scope": "this_event"}),
            serde_json::json!({"eventId": "event-1", "summary": "Deleted one occurrence of the event."}),
        ),
        macro_result(
            "m",
            "SetEntityProperty",
            serde_json::json!({"entity_id": "doc-4", "entity_type": "document"}),
            serde_json::json!({"success": true, "message": "Property updated successfully."}),
        ),
    ];
    assert_eq!(
        receipts(&parts),
        [
            receipt(
                CardItemType::Project,
                "project-1",
                CardAction::Created,
                None
            ),
            receipt(CardItemType::Document, "doc-1", CardAction::Moved, None),
            receipt(
                CardItemType::EmailThread,
                "thread-1",
                CardAction::Moved,
                Some("to the top level")
            ),
            receipt(
                CardItemType::Channel,
                "channel-1",
                CardAction::Created,
                None
            ),
            receipt(
                CardItemType::Channel,
                "channel-1",
                CardAction::Renamed,
                Some("was pricing")
            ),
            receipt(
                CardItemType::Routine,
                "routine-1",
                CardAction::Created,
                None
            ),
            receipt(
                CardItemType::Routine,
                "routine-1",
                CardAction::Updated,
                Some("Paused")
            ),
            receipt(
                CardItemType::Form,
                "form-1",
                CardAction::Created,
                Some("Partly saved")
            ),
            receipt(
                CardItemType::Initiative,
                "initiative-1",
                CardAction::Created,
                None
            ),
            receipt(CardItemType::Document, "doc-2", CardAction::Renamed, None),
            receipt(
                CardItemType::Document,
                "doc-3",
                CardAction::Commented,
                Some("on “Q4 targets”")
            ),
            receipt(
                CardItemType::CalendarEvent,
                "event-1",
                CardAction::Deleted,
                Some("One occurrence")
            ),
            receipt(CardItemType::Document, "doc-4", CardAction::Updated, None),
        ]
    );
}

#[test]
fn a_change_that_did_not_happen_is_no_receipt() {
    let parts = [
        macro_result(
            "a",
            "MoveToProject",
            serde_json::json!({"entityType": "document", "entityId": "doc-1", "projectId": "p"}),
            serde_json::json!({"success": false, "message": "No access"}),
        ),
        macro_result(
            "b",
            "SetEntityProperty",
            serde_json::json!({"entity_id": "macro|ana@example.com", "entity_type": "user"}),
            serde_json::json!({"success": true, "message": "Property updated successfully."}),
        ),
        macro_result(
            "c",
            "MoveToProject",
            serde_json::json!({"entityType": "chat", "entityId": "chat-1", "projectId": "p"}),
            serde_json::json!({"success": true, "message": "Moved"}),
        ),
    ];
    assert_eq!(receipts(&parts), [None, None, None]);
}

#[test]
fn an_upload_and_a_saved_copy_are_new_files() {
    let parts = [
        macro_result(
            "a",
            "UploadFile",
            serde_json::json!({"fileName": "Vendor MSA.PDF"}),
            serde_json::json!({"documentId": "doc-1", "fileName": "Vendor MSA.PDF", "sizeBytes": 10}),
        ),
        macro_result(
            "b",
            "EditPresentation",
            serde_json::json!({"documentId": "deck-1", "saveAs": {"name": "Board deck v2"}}),
            serde_json::json!({"documentId": "deck-2"}),
        ),
        macro_result(
            "c",
            "EditPresentation",
            serde_json::json!({"documentId": "deck-1"}),
            serde_json::json!({"documentId": "deck-1"}),
        ),
    ];
    let cards: Vec<_> = segments(&parts, true)[0]
        .rows
        .iter()
        .map(|row| row.card.clone())
        .collect();
    assert_eq!(
        cards,
        [
            Some(ActivityCard::Item {
                item_type: CardItemType::Document,
                item_id: "doc-1".to_owned(),
                file_type: Some("pdf".to_owned()),
                action: CardAction::Created,
                title: Some("Vendor MSA.PDF".to_owned()),
                summary: None,
            }),
            Some(ActivityCard::Item {
                item_type: CardItemType::Document,
                item_id: "deck-2".to_owned(),
                file_type: Some("pptx".to_owned()),
                action: CardAction::Created,
                title: Some("Board deck v2".to_owned()),
                summary: None,
            }),
            Some(ActivityCard::Item {
                item_type: CardItemType::Document,
                item_id: "deck-1".to_owned(),
                file_type: Some("pptx".to_owned()),
                action: CardAction::Edited,
                title: None,
                summary: None,
            }),
        ]
    );
}

#[test]
fn a_web_search_cards_the_pages_it_found() {
    let parts = [
        macro_result(
            "a",
            "WebSearch",
            serde_json::json!({"input": "lumen pricing change"}),
            serde_json::json!({"tool_use_id": "t", "content": [
                {"type": "web_search_result", "title": "Lumen raises prices", "url": "https://lumen.example/blog"},
                {"type": "web_search_result", "title": "Lumen raises prices", "url": "https://lumen.example/blog"},
                {"type": "web_search_result", "title": "Script", "url": "javascript:alert(1)"},
                {"type": "web_search_result", "title": "Pricing", "url": "https://news.example/lumen"}
            ]}),
        ),
        macro_result(
            "b",
            "WebFetch",
            serde_json::json!({"input": "https://lumen.example/pricing"}),
            serde_json::json!({"tool_use_id": "t", "content": {
                "type": "web_fetch_result",
                "url": "https://lumen.example/pricing",
                "content": {"source": {}, "title": "Pricing · Lumen"},
                "retrieved_at": "2026-10-10T00:00:00Z"
            }}),
        ),
        macro_result(
            "c",
            "WebSearch",
            serde_json::json!({"input": "nothing"}),
            serde_json::json!({"tool_use_id": "t", "content": {"type": "web_search_tool_result_error", "error_code": "unavailable"}}),
        ),
    ];
    let cards: Vec<_> = segments(&parts, true)[0]
        .rows
        .iter()
        .map(|row| row.card.clone())
        .collect();
    assert_eq!(
        cards,
        [
            Some(ActivityCard::Sources {
                query: Some("lumen pricing change".to_owned()),
                sources: vec![
                    Source::Web {
                        url: "https://lumen.example/blog".to_owned(),
                        title: Some("Lumen raises prices".to_owned()),
                    },
                    Source::Web {
                        url: "https://news.example/lumen".to_owned(),
                        title: Some("Pricing".to_owned()),
                    },
                ],
                total: 2,
            }),
            Some(ActivityCard::Sources {
                query: None,
                sources: vec![Source::Web {
                    url: "https://lumen.example/pricing".to_owned(),
                    title: Some("Pricing · Lumen".to_owned()),
                }],
                total: 1,
            }),
            None,
        ]
    );
}

#[test]
fn a_workspace_search_cards_items_by_kind_and_id_only() {
    let results: Vec<_> = (0..14)
        .map(|n| serde_json::json!({"type": "document", "id": format!("doc-{n}"), "name": "Secret plan"}))
        .chain([
            serde_json::json!({"type": "email", "id": "message-1", "thread_id": "thread-1", "name": "Re: pricing"}),
            serde_json::json!({"type": "channelMessage", "channel_id": "channel-1"}),
            serde_json::json!({"type": "chat", "id": "chat-1"}),
        ])
        .collect();
    let parts = [macro_result(
        "a",
        "ContentSearch",
        serde_json::json!({"query": "pricing floor"}),
        serde_json::json!({"results": results}),
    )];
    let Some(ActivityCard::Sources {
        query,
        sources,
        total,
    }) = segments(&parts, true)[0].rows[0].card.clone()
    else {
        panic!("expected a sources card");
    };
    assert_eq!(query.as_deref(), Some("pricing floor"));
    assert_eq!(total, 16);
    assert_eq!(sources.len(), 12);
    assert_eq!(
        sources[0],
        Source::Item {
            item_type: CardItemType::Document,
            item_id: "doc-0".to_owned(),
        }
    );
    assert!(
        !serde_json::to_string(&sources).unwrap().contains("Secret"),
        "names stay out of the message"
    );
}

#[test]
fn a_database_answer_is_a_card_only_when_the_agent_asked_to_show_it() {
    let select = serde_json::json!({"results": [], "statement": {"kind": "select"}});
    let parts = [
        macro_result(
            "a",
            "QueryDatabase",
            serde_json::json!({"sql": "SELECT plan, arr FROM deals", "databaseId": "db-1", "display": "bar"}),
            select.clone(),
        ),
        macro_result(
            "b",
            "QueryDatabase",
            serde_json::json!({"sql": "SELECT count(*) FROM deals"}),
            select,
        ),
        macro_result(
            "c",
            "QueryDatabase",
            serde_json::json!({"sql": "UPDATE deals SET arr = 0", "display": "table"}),
            serde_json::json!({"results": [], "statement": {"kind": "write"}}),
        ),
    ];
    let cards: Vec<_> = segments(&parts, true)[0]
        .rows
        .iter()
        .map(|row| row.card.clone())
        .collect();
    assert_eq!(
        cards,
        [
            Some(ActivityCard::Data {
                sql: "SELECT plan, arr FROM deals".to_owned(),
                database_id: Some("db-1".to_owned()),
                display: Some("bar".to_owned()),
            }),
            None,
            None,
        ]
    );
}

#[test]
fn humanize_keeps_acronyms_and_splits_every_convention() {
    assert_eq!(humanize("ListEntities"), "List entities");
    assert_eq!(humanize("read_document"), "Read document");
    assert_eq!(humanize("web-search"), "Web search");
    assert_eq!(humanize("FetchURL"), "Fetch URL");
    assert_eq!(humanize(""), "Tool");
}

#[test]
fn session_activity_retains_command_and_tool_input_details_for_authorized_live_views() {
    let command = "TOKEN=private-value run-report";
    let query = "confidential acquisition";
    let parts = [
        run("terminal", command, ToolStatus::Completed),
        macro_tool(
            "search",
            "search",
            serde_json::json!({"query": query}),
            ToolStatus::Completed,
        ),
    ];
    let live = segments(&parts, true);
    assert_eq!(live[0].rows[0].detail.as_deref(), Some(command));
    assert_eq!(live[0].rows[1].detail.as_deref(), Some(query));
}
