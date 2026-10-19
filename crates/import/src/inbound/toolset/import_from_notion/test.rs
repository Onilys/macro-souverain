use super::*;

#[test]
fn a_ready_plan_tells_the_agent_to_present_it_for_review() {
    let report = NotionImportReport {
        status: Some(RunStatus::Ready),
        pages: 40,
        data_sources: 3,
        copy: 38,
        tasks: 1,
        skip: 3,
        hand: 1,
        hand_items: vec![crate::domain::models::NotionReportItem {
            import_id: uuid::Uuid::nil(),
            title: "CRM".to_string(),
            kind: crate::domain::models::ImportKind::DataSource,
            url: None,
            reason: Some("Mixed records".to_string()),
        }],
        ..NotionImportReport::default()
    };

    assert_eq!(
        message(NotionImportAction::Plan, &report),
        "The plan is ready: 40 pages and 3 databases: 38 to copy, 1 task lists to turn into tasks, 3 to skip, 1 to handle by hand. Present it to the user now with PresentReview (kind \"import\", a short title such as \"Import from Notion\", drafts [{\"source\":\"notion\"}]). Nothing is written until they approve it. Objects to handle by hand (with your own tools, after the import): \"CRM\" (Mixed records)."
    );
}

#[test]
fn roots_parse_from_notion_urls_and_an_empty_list_means_everything() {
    assert_eq!(scope(&[]).unwrap(), ImportScope::Everything);
    assert_eq!(scope(&["  ".to_string()]).unwrap(), ImportScope::Everything);
    assert_eq!(
        scope(&["https://www.notion.so/Q3-plan-3fb607323e2e80629886fc0c028d50a7".to_string()])
            .unwrap(),
        ImportScope::Roots {
            ids: vec![NotionId::parse("3fb607323e2e80629886fc0c028d50a7").unwrap()],
        }
    );
    assert!(scope(&["not a page".to_string()]).is_err());
}
