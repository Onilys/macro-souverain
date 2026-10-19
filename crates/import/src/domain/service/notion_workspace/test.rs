use chrono::{TimeZone, Utc};

use super::*;
use crate::domain::models::{ImportRun, Initiator, NotionPlanItem};

fn row(
    title: &str,
    kind: ImportKind,
    status: ImportStatus,
    decision: NotionDecision,
    review: Option<Uuid>,
    last_error: Option<&str>,
) -> ImportEntity {
    let plan = NotionPlanItem {
        decision,
        reason: (decision == NotionDecision::Hand).then(|| "Mixed records".to_string()),
        path: Vec::new(),
        rows: None,
        more_rows: false,
        task_fields: None,
    };
    ImportEntity {
        id: Uuid::now_v7(),
        user_id: "macro|owner@acme.test".to_string(),
        team_id: None,
        source: ImportSource::Notion,
        kind,
        foreign_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
        parent_id: None,
        review_id: review,
        status,
        initiator: Initiator::Chat,
        metadata: serde_json::to_value(NotionDocMeta::for_plan(
            title.to_string(),
            "https://www.notion.so/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            plan,
        ))
        .unwrap(),
        entity_id: (status == ImportStatus::Imported).then(|| "doc-1".to_string()),
        entity_type: (status == ImportStatus::Imported).then(|| "md".to_string()),
        last_error: last_error.map(str::to_string),
        created_at: Utc.with_ymd_and_hms(2026, 10, 19, 12, 0, 0).unwrap(),
        updated_at: Utc.with_ymd_and_hms(2026, 10, 19, 12, 0, 0).unwrap(),
    }
}

#[test]
fn the_report_counts_the_current_plan_and_lists_what_needs_attention() {
    let review = Uuid::now_v7();
    let older_review = Uuid::now_v7();
    let mut older = row(
        "Old import",
        ImportKind::Page,
        ImportStatus::Imported,
        NotionDecision::Copy,
        Some(older_review),
        None,
    );
    older.updated_at = Utc.with_ymd_and_hms(2026, 10, 1, 12, 0, 0).unwrap();
    let rows = vec![
        older,
        row(
            "Roadmap",
            ImportKind::Page,
            ImportStatus::Imported,
            NotionDecision::Copy,
            Some(review),
            None,
        ),
        row(
            "Bugs",
            ImportKind::DataSource,
            ImportStatus::Importing,
            NotionDecision::Tasks,
            Some(review),
            None,
        ),
        row(
            "Specs",
            ImportKind::Page,
            ImportStatus::Staged,
            NotionDecision::Copy,
            Some(review),
            Some("Notion request failed"),
        ),
        row(
            "Untitled",
            ImportKind::Page,
            ImportStatus::Staged,
            NotionDecision::Skip,
            Some(review),
            None,
        ),
        row(
            "CRM",
            ImportKind::DataSource,
            ImportStatus::Staged,
            NotionDecision::Hand,
            Some(review),
            None,
        ),
    ];
    let run = ImportRun {
        source: ImportSource::Notion,
        status: RunStatus::Importing,
        error: None,
        updated_at: Utc.with_ymd_and_hms(2026, 10, 19, 12, 0, 0).unwrap(),
    };

    let report = report(Some(&run), &rows);

    assert_eq!(report.status, Some(RunStatus::Importing));
    assert_eq!(report.review_id, Some(review));
    assert_eq!((report.pages, report.data_sources), (3, 2));
    assert_eq!(
        (report.copy, report.tasks, report.skip, report.hand),
        (2, 1, 1, 1)
    );
    assert_eq!((report.imported, report.writing, report.waiting), (1, 1, 1));
    assert_eq!(report.hand_items.len(), 1);
    assert_eq!(report.hand_items[0].title, "CRM");
    assert_eq!(
        report.hand_items[0].reason.as_deref(),
        Some("Mixed records")
    );
    assert_eq!(report.failures.len(), 1);
    assert_eq!(report.failures[0].title, "Specs");
    assert_eq!(
        report.failures[0].reason.as_deref(),
        Some("Notion request failed")
    );
}

#[test]
fn before_any_plan_the_report_is_empty() {
    assert_eq!(report(None, &[]), NotionImportReport::default());
}
