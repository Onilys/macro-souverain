use std::collections::BTreeMap;
use std::sync::Mutex;

use chrono::{TimeZone, Utc};
use import_notion::domain::model::{
    NotionDataSource, NotionOption, NotionParent, NotionPropertySchema, NotionUser, NotionValue,
    PageMarkdown, Paged, SearchHit, SearchObject,
};
use import_notion::domain::ports::NotionError;
use macro_user_id::cowlike::CowLike;

use super::*;
use crate::domain::ports::{ImportedTaskProperties, NewDatabase, TeamMember};

fn id(hex: char) -> NotionId {
    NotionId::parse(&hex.to_string().repeat(32)).unwrap()
}

fn user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|owner@acme.test")
        .unwrap()
        .into_owned()
}

fn item(import: u128, parent: Option<u128>, title: &str) -> WriteItem {
    WriteItem {
        import_id: Uuid::from_u128(import),
        parent: parent.map(Uuid::from_u128),
        notion_id: id('a'),
        kind: ImportKind::Page,
        title: title.to_string(),
        decision: NotionDecision::Copy,
        task_fields: NotionTaskFields::default(),
    }
}

#[test]
fn every_page_above_a_written_object_becomes_a_folder_parents_first() {
    // Engineering > Q3 plan > Launch checklist, and a lone page.
    let items = vec![
        item(3, Some(2), "Launch checklist"),
        item(1, None, "Engineering"),
        item(2, Some(1), "Q3 plan"),
        item(4, None, "Scratchpad"),
    ];

    let layout = folder_layout(&items);

    assert_eq!(layout.folders, [Uuid::from_u128(1), Uuid::from_u128(2)]);

    let root = Uuid::from_u128(100);
    let folders: HashMap<Uuid, Uuid> = [
        (Uuid::from_u128(1), Uuid::from_u128(101)),
        (Uuid::from_u128(2), Uuid::from_u128(102)),
    ]
    .into_iter()
    .collect();
    let parents: HashMap<Uuid, Option<Uuid>> = items
        .iter()
        .map(|item| (item.import_id, item.parent))
        .collect();
    // A page with children goes in its own folder.
    assert_eq!(
        folder_for(&items[1], true, &folders, &parents, root),
        Uuid::from_u128(101)
    );
    // The folder itself sits in its parent's folder.
    assert_eq!(
        folder_for(&items[2], false, &folders, &parents, root),
        Uuid::from_u128(101)
    );
    assert_eq!(
        folder_for(&items[0], true, &folders, &parents, root),
        Uuid::from_u128(102)
    );
    assert_eq!(folder_for(&items[3], true, &folders, &parents, root), root);
}

#[test]
fn page_markdown_drops_child_databases_imported_on_their_own() {
    let markdown = page_markdown(
        "Intro paragraph.\n\n<database url=\"https://www.notion.so/ffffffffffffffffffffffffffffffff\">Bugs</database>\n\nOutro.",
    );
    assert!(markdown.contains("Intro paragraph."));
    assert!(markdown.contains("Outro."));
    assert!(!markdown.contains("database"), "{markdown}");
}

/// A Notion workspace holding one data source with two rows.
struct FakeNotion {
    source: NotionDataSource,
    rows: Vec<NotionPage>,
    bodies: HashMap<NotionId, String>,
}

impl NotionApi for FakeNotion {
    async fn search(
        &self,
        _object: SearchObject,
        _cursor: Option<String>,
    ) -> std::result::Result<Paged<SearchHit>, NotionError> {
        unimplemented!("writing never searches")
    }

    async fn page(&self, _id: &NotionId) -> std::result::Result<NotionPage, NotionError> {
        unimplemented!("rows come from the query")
    }

    async fn page_markdown(&self, id: &NotionId) -> std::result::Result<PageMarkdown, NotionError> {
        Ok(PageMarkdown {
            markdown: self.bodies.get(id).cloned().unwrap_or_default(),
            unknown_block_ids: Vec::new(),
        })
    }

    async fn data_source(
        &self,
        _id: &NotionId,
    ) -> std::result::Result<NotionDataSource, NotionError> {
        Ok(self.source.clone())
    }

    async fn database_sources(
        &self,
        _database: &NotionId,
    ) -> std::result::Result<Vec<NotionId>, NotionError> {
        unimplemented!("writing never expands databases")
    }

    async fn query_data_source(
        &self,
        _id: &NotionId,
        _cursor: Option<String>,
    ) -> std::result::Result<Paged<NotionPage>, NotionError> {
        Ok(Paged {
            results: self.rows.clone(),
            next_cursor: None,
        })
    }

    async fn users(
        &self,
        _cursor: Option<String>,
    ) -> std::result::Result<Paged<NotionUser>, NotionError> {
        unimplemented!("people come in as a map")
    }
}

/// Records what the import asks Macro to create.
#[derive(Default)]
struct FakeWriter {
    folders: Mutex<Vec<(String, Option<Uuid>)>>,
    documents: Mutex<Vec<(String, String, Option<Uuid>)>>,
    batches: Mutex<Vec<Vec<DatabaseOp>>>,
}

const DATABASE: Uuid = Uuid::from_u128(500);
const TABLE: Uuid = Uuid::from_u128(501);
const TITLE_COLUMN: Uuid = Uuid::from_u128(502);

impl WorkspaceWriter for FakeWriter {
    async fn create_folder(
        &self,
        _user: &MacroUserIdStr<'static>,
        name: &str,
        parent: Option<Uuid>,
    ) -> anyhow::Result<Uuid> {
        let mut folders = self.folders.lock().unwrap();
        folders.push((name.to_string(), parent));
        Ok(Uuid::from_u128(900 + folders.len() as u128))
    }

    async fn create_document(
        &self,
        _user: &MacroUserIdStr<'static>,
        name: &str,
        markdown: &str,
        _properties: &ImportedDocumentProperties,
        folder: Option<Uuid>,
    ) -> anyhow::Result<String> {
        let mut documents = self.documents.lock().unwrap();
        documents.push((name.to_string(), markdown.to_string(), folder));
        Ok(format!("doc-{}", documents.len()))
    }

    async fn create_task(
        &self,
        _user: &MacroUserIdStr<'static>,
        _name: &str,
        _markdown: &str,
        _properties: &ImportedTaskProperties,
        _folder: Option<Uuid>,
    ) -> anyhow::Result<String> {
        unimplemented!("a copied database writes no tasks")
    }

    async fn create_database(
        &self,
        _user: &MacroUserIdStr<'static>,
        _name: &str,
    ) -> anyhow::Result<NewDatabase> {
        Ok(NewDatabase {
            database_id: DATABASE,
            table: TableId::from_uuid(TABLE),
            title_column: ColumnId::from_uuid(TITLE_COLUMN),
        })
    }

    async fn apply_database_ops(
        &self,
        _user: &MacroUserIdStr<'static>,
        _database_id: Uuid,
        ops: Vec<DatabaseOp>,
    ) -> anyhow::Result<Vec<OpResult>> {
        let results = ops
            .iter()
            .filter_map(|op| match op {
                DatabaseOp::Rows {
                    change: RowsChange::Insert { rows },
                    ..
                } => Some(OpResult::Rows {
                    table: TableId::from_uuid(TABLE),
                    table_version: models_databases::TableVersion(1),
                    change: RowsResult::Inserted {
                        rows: (0..rows.len())
                            .map(|index| RowId::from_uuid(Uuid::from_u128(700 + index as u128)))
                            .collect(),
                    },
                }),
                _ => None,
            })
            .collect();
        self.batches.lock().unwrap().push(ops);
        Ok(results)
    }

    async fn team_members(
        &self,
        _user: &MacroUserIdStr<'static>,
    ) -> anyhow::Result<Vec<TeamMember>> {
        Ok(Vec::new())
    }
}

fn notion_row(hex: char, title: &str, properties: Vec<(&str, NotionValue)>) -> NotionPage {
    NotionPage {
        id: id(hex),
        title: title.to_string(),
        url: id(hex).url(),
        parent: NotionParent::DataSource {
            data_source: id('e'),
            database: id('f'),
        },
        last_edited: Utc.with_ymd_and_hms(2026, 10, 1, 9, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 9, 1, 9, 0, 0).unwrap(),
        in_trash: false,
        properties: properties
            .into_iter()
            .map(|(name, value)| (name.to_string(), value))
            .collect::<BTreeMap<_, _>>(),
    }
}

#[tokio::test]
async fn a_data_source_becomes_a_database_with_typed_columns_rows_bodies_and_pending_relations() {
    let notion = FakeNotion {
        source: NotionDataSource {
            id: id('e'),
            database_id: id('f'),
            title: "Bugs".to_string(),
            database_parent: NotionParent::Workspace,
            in_trash: false,
            properties: vec![
                NotionPropertySchema {
                    id: "title".to_string(),
                    name: "Bug".to_string(),
                    kind: NotionPropertyKind::Title,
                },
                NotionPropertySchema {
                    id: "sev".to_string(),
                    name: "Severity".to_string(),
                    kind: NotionPropertyKind::Select {
                        options: vec![NotionOption {
                            id: "o1".to_string(),
                            name: "High".to_string(),
                            color: "red".to_string(),
                        }],
                    },
                },
                NotionPropertySchema {
                    id: "proj".to_string(),
                    name: "Project".to_string(),
                    kind: NotionPropertyKind::Relation {
                        data_source_id: Some(id('9')),
                    },
                },
            ],
        },
        rows: vec![
            notion_row(
                '1',
                "Login fails",
                vec![
                    ("Severity", NotionValue::Option("High".to_string())),
                    ("Project", NotionValue::Relation(vec![id('8')])),
                ],
            ),
            notion_row('2', "Typo on pricing", vec![]),
        ],
        bodies: [(id('1'), "Steps to reproduce:\n\n1. Sign in".to_string())]
            .into_iter()
            .collect(),
    };
    let writer = FakeWriter::default();
    let folder = Uuid::from_u128(42);
    let mut source_item = item(1, None, "Bugs");
    source_item.kind = ImportKind::DataSource;
    source_item.notion_id = id('e');

    let written = write_database(
        &notion,
        &writer,
        &user(),
        &source_item,
        folder,
        &PeopleMap::new(),
        &Cancel::default(),
    )
    .await
    .unwrap();

    let batches = writer.batches.lock().unwrap();
    // Schema first: rename the starter table and title, add the select and
    // the Page column; the relation waits.
    let schema = &batches[0];
    assert!(matches!(
        &schema[0],
        DatabaseOp::Table { change: TableChange::Rename { name, .. }, .. } if name == "Bugs"
    ));
    assert!(matches!(
        &schema[1],
        DatabaseOp::Column { change: ColumnChange::Rename { name, .. }, .. } if name == "Bug"
    ));
    let created: Vec<(String, ColumnKind)> = schema
        .iter()
        .filter_map(|op| match op {
            DatabaseOp::Column {
                change:
                    ColumnChange::Create {
                        definition: NewColumn::New { name, kind, .. },
                        ..
                    },
                ..
            } => Some((name.clone(), *kind)),
            _ => None,
        })
        .collect();
    assert_eq!(
        created,
        [
            ("Severity".to_string(), ColumnKind::Select { multi: false }),
            (
                "Page".to_string(),
                ColumnKind::Entity {
                    target: EntityKind::Document,
                    multi: false
                }
            ),
        ]
    );

    // Then the rows, title first.
    let DatabaseOp::Rows {
        change: RowsChange::Insert { rows },
        ..
    } = &batches[1][0]
    else {
        panic!("expected a row insert, got {:?}", batches[1]);
    };
    assert_eq!(rows.len(), 2);
    assert_eq!(
        rows[0][0],
        CellWrite {
            column: ColumnId::from_uuid(TITLE_COLUMN),
            value: CellValue::Text("Login fails".to_string()),
        }
    );
    assert!(matches!(rows[0][1].value, CellValue::Options(_)));
    assert_eq!(rows[1].len(), 1, "an empty row keeps only its title");

    // The row with a body got a document in a folder beside the database,
    // linked from its Page column.
    assert_eq!(
        writer.folders.lock().unwrap().as_slice(),
        [("Bugs pages".to_string(), Some(folder))]
    );
    let documents = writer.documents.lock().unwrap();
    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].0, "Login fails");
    assert!(documents[0].1.contains("Steps to reproduce"));
    let DatabaseOp::Rows {
        change:
            RowsChange::Update {
                changes: RowChanges::PerRow { rows: linked },
            },
        ..
    } = &batches[2][0]
    else {
        panic!("expected the Page links, got {:?}", batches[2]);
    };
    assert_eq!(linked.len(), 1);
    assert_eq!(linked[0].row, RowId::from_uuid(Uuid::from_u128(700)));
    assert_eq!(
        linked[0].cells[0].value,
        CellValue::Entities(vec![EntityRef {
            entity_type: EntityKind::Document,
            entity_id: "doc-1".to_string(),
        }])
    );

    assert_eq!(written.database_id, DATABASE);
    assert_eq!(written.rows.len(), 2);
    assert_eq!(written.relations.len(), 1);
    assert_eq!(written.relations[0].name, "Project");
    assert_eq!(written.relations[0].target, Some(id('9')));
    assert_eq!(
        written.relations[0].links,
        [(RowId::from_uuid(Uuid::from_u128(700)), vec![id('8')])]
    );
}

#[tokio::test]
async fn a_cancelled_import_stops_before_writing_rows() {
    let notion = FakeNotion {
        source: NotionDataSource {
            id: id('e'),
            database_id: id('f'),
            title: "Bugs".to_string(),
            database_parent: NotionParent::Workspace,
            in_trash: false,
            properties: Vec::new(),
        },
        rows: vec![notion_row('1', "Login fails", vec![])],
        bodies: HashMap::new(),
    };
    let writer = FakeWriter::default();
    let cancel = Cancel::default();
    cancel.stop();
    let mut source_item = item(1, None, "Bugs");
    source_item.kind = ImportKind::DataSource;

    let outcome = write_database(
        &notion,
        &writer,
        &user(),
        &source_item,
        Uuid::from_u128(42),
        &PeopleMap::new(),
        &cancel,
    )
    .await;

    assert_eq!(outcome.unwrap_err().to_string(), "Cancelled");
    let batches = writer.batches.lock().unwrap();
    assert_eq!(batches.len(), 1, "only the schema was written");
    assert!(
        !batches[0]
            .iter()
            .any(|op| matches!(op, DatabaseOp::Rows { .. }))
    );
}
