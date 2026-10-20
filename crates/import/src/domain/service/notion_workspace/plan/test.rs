use chrono::{TimeZone, Utc};
use import_notion::domain::model::{NotionDataSource, NotionPage, NotionPropertySchema};

use super::*;

fn id(hex: char) -> NotionId {
    NotionId::parse(&hex.to_string().repeat(32)).unwrap()
}

fn page(hex: char, title: &str, parent: NotionParent) -> NotionPage {
    NotionPage {
        id: id(hex),
        title: title.to_string(),
        url: id(hex).url(),
        parent,
        last_edited: Utc.with_ymd_and_hms(2026, 10, 1, 9, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 9, 1, 9, 0, 0).unwrap(),
        in_trash: false,
        properties: Default::default(),
    }
}

#[test]
fn the_tree_puts_parents_first_and_plans_every_object_under_its_page() {
    let inventory = Inventory {
        pages: vec![
            page('b', "Q3 plan", NotionParent::Page { id: id('a') }),
            page('a', "Engineering", NotionParent::Workspace),
            page('c', "", NotionParent::Page { id: id('b') }),
            // Its parent was not shared with the connection, so it is a root.
            page('d', "Orphan", NotionParent::Page { id: id('9') }),
        ],
        data_sources: vec![DataSourceSummary {
            source: NotionDataSource {
                id: id('e'),
                database_id: id('f'),
                title: "Bugs".to_string(),
                database_parent: NotionParent::Page { id: id('a') },
                in_trash: false,
                properties: vec![
                    NotionPropertySchema {
                        id: "title".to_string(),
                        name: "Name".to_string(),
                        kind: NotionPropertyKind::Title,
                    },
                    NotionPropertySchema {
                        id: "stat".to_string(),
                        name: "Status".to_string(),
                        kind: NotionPropertyKind::Status {
                            options: Vec::new(),
                        },
                    },
                ],
            },
            row_count: 12,
            sample_titles: vec!["Fix login".to_string()],
        }],
    };

    let tree = PlanTree::new(&inventory);

    let order: Vec<&str> = tree.nodes.iter().map(|node| node.title.as_str()).collect();
    assert_eq!(
        order,
        ["Engineering", "Orphan", "Q3 plan", "Bugs", UNTITLED_PAGE]
    );

    let items = tree.triage_items();
    let engineering = items
        .iter()
        .find(|item| item.title == "Engineering")
        .unwrap();
    assert_eq!(engineering.children, 2);
    let untitled = items
        .iter()
        .find(|item| item.title == UNTITLED_PAGE)
        .unwrap();
    assert_eq!(untitled.path, ["Engineering", "Q3 plan"]);
    let bugs = items.iter().find(|item| item.title == "Bugs").unwrap();
    assert_eq!(
        bugs.table.as_ref().map(|table| table.columns.clone()),
        Some(vec![
            "Name (title)".to_string(),
            "Status (status)".to_string()
        ])
    );

    let verdicts: HashMap<String, Verdict> = [(
        id('e').to_string(),
        Verdict {
            key: id('e').to_string(),
            decision: NotionDecision::Tasks,
            reason: Some("A bug tracker".to_string()),
            task_fields: Some(crate::domain::models::NotionTaskFields {
                status: Some("Status".to_string()),
                ..Default::default()
            }),
        },
    )]
    .into_iter()
    .collect();
    let rows = tree.plan_rows(&verdicts);

    assert_eq!(rows.len(), 5);
    let bugs_row = rows
        .iter()
        .find(|row| row.foreign_id == id('e').to_string())
        .unwrap();
    assert_eq!(bugs_row.kind, ImportKind::DataSource);
    assert_eq!(bugs_row.parent_foreign_id, Some(id('a').to_string()));
    let meta: NotionDocMeta = serde_json::from_value(bugs_row.metadata.clone()).unwrap();
    let plan = meta.plan.unwrap();
    assert_eq!(plan.decision, NotionDecision::Tasks);
    assert_eq!(plan.rows, Some(12));
    assert_eq!(plan.path, ["Engineering"]);
    assert_eq!(meta.url.as_deref(), Some(id('f').url().as_str()));

    let engineering_row = rows
        .iter()
        .find(|row| row.foreign_id == id('a').to_string())
        .unwrap();
    let meta: NotionDocMeta = serde_json::from_value(engineering_row.metadata.clone()).unwrap();
    assert_eq!(meta.plan.unwrap().decision, NotionDecision::Copy);
    assert_eq!(engineering_row.parent_foreign_id, None);
}

#[test]
fn a_parent_cycle_cannot_hide_its_members() {
    let inventory = Inventory {
        pages: vec![
            page('a', "One", NotionParent::Page { id: id('b') }),
            page('b', "Two", NotionParent::Page { id: id('a') }),
        ],
        data_sources: Vec::new(),
    };

    let tree = PlanTree::new(&inventory);

    assert_eq!(tree.nodes.len(), 2);
    assert_eq!(tree.nodes[0].parent, None);
    assert_eq!(tree.nodes[1].parent, Some(tree.nodes[0].id.clone()));
}
