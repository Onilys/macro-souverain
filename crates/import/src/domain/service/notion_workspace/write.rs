//! Writing an approved plan: folders mirroring the page tree, documents,
//! databases with their rows and relations, and task lists.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use futures::{FutureExt, StreamExt, stream};
use import_notion::domain::inventory::{all_rows, full_markdown};
use import_notion::domain::model::{NotionId, NotionPage, NotionPropertyKind};
use import_notion::domain::ports::NotionApi;
use macro_user_id::user_id::MacroUserIdStr;
use models_databases::{
    CellValue, CellWrite, ColumnChange, ColumnId, ColumnKind, DatabaseId, DatabaseOp, EntityKind,
    EntityRef, NewColumn, NewOption, OpResult, RowChange, RowChanges, RowId, RowsChange,
    RowsResult, TableChange, TableId,
};
use uuid::Uuid;

use crate::domain::models::{
    ImportEntity, ImportKind, NotionDecision, NotionDocMeta, NotionTaskFields,
};
use crate::domain::ports::{ImportedDocumentProperties, WorkspaceWriter};

use super::super::{normalize_notion_markdown, remove_notion_databases};
use super::values::{
    PeopleMap, PlannedColumn, capped_name, cell, planned_column, task_body, task_properties,
};

#[cfg(test)]
mod test;

/// Objects written at once.
pub(super) const WRITE_CONCURRENCY: usize = 4;
/// Row bodies fetched at once within one database.
const BODY_CONCURRENCY: usize = 3;
/// Rows per insert batch, well under the 10,000-row batch limit.
const ROWS_PER_BATCH: usize = 500;
/// Name of the folder every workspace import writes into.
pub(super) const ROOT_FOLDER: &str = "Notion";
/// Name of the column linking a database row to its page body.
const PAGE_COLUMN: &str = "Page";

/// Ledger entity types for what an import creates.
pub(super) const DOCUMENT_ENTITY: &str = "md";
pub(super) const DATABASE_ENTITY: &str = "database";
pub(super) const FOLDER_ENTITY: &str = "project";

/// A plan row ready to write.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct WriteItem {
    /// The ledger row.
    pub import_id: Uuid,
    /// The ledger row it sits under, if any.
    pub parent: Option<Uuid>,
    /// The Notion object.
    pub notion_id: NotionId,
    /// A page or a data source.
    pub kind: ImportKind,
    /// The title.
    pub title: String,
    /// What to do with it.
    pub decision: NotionDecision,
    /// For a task list: which columns hold the task fields.
    pub task_fields: NotionTaskFields,
}

impl WriteItem {
    /// Read a staged ledger row; `None` for rows that are not plan items.
    pub fn from_entity(entity: &ImportEntity) -> Option<Self> {
        let meta: NotionDocMeta = serde_json::from_value(entity.metadata.clone()).ok()?;
        let plan = meta.plan?;
        Some(Self {
            import_id: entity.id,
            parent: entity.parent_id,
            notion_id: NotionId::parse(&entity.foreign_id)?,
            kind: entity.kind,
            title: meta.title,
            decision: plan.decision,
            task_fields: plan.task_fields.unwrap_or_default(),
        })
    }
}

/// Which folder each written object goes in.
#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct FolderLayout {
    /// Pages that become folders (they have something under them), in the
    /// order to create them: parents first.
    pub folders: Vec<Uuid>,
}

/// Plan rows that have something being written under them, in an order
/// where every such row's parents come first.
pub(super) fn folder_layout(items: &[WriteItem]) -> FolderLayout {
    let by_id: HashMap<Uuid, &WriteItem> =
        items.iter().map(|item| (item.import_id, item)).collect();
    let mut needs_folder: HashSet<Uuid> = HashSet::new();
    for item in items {
        // Every page above a written object becomes a folder, so the tree
        // survives even when a page in the middle is not written itself.
        let mut current = item.parent;
        let mut guard = 0;
        while let Some(parent) = current {
            guard += 1;
            if guard > items.len() || !needs_folder.insert(parent) {
                break;
            }
            current = by_id.get(&parent).and_then(|parent| parent.parent);
        }
    }
    let mut ordered: Vec<Uuid> = needs_folder.into_iter().collect();
    ordered.sort_by_key(|id| depth(*id, &by_id));
    FolderLayout { folders: ordered }
}

fn depth(id: Uuid, by_id: &HashMap<Uuid, &WriteItem>) -> usize {
    let mut depth = 0;
    let mut current = by_id.get(&id).and_then(|item| item.parent);
    while let Some(parent) = current {
        depth += 1;
        if depth > by_id.len() {
            break;
        }
        current = by_id.get(&parent).and_then(|item| item.parent);
    }
    depth
}

/// The folder `item` goes in: its own when it became one, otherwise its
/// nearest folder above, otherwise the import's root.
pub(super) fn folder_for(
    item: &WriteItem,
    own: bool,
    folders: &HashMap<Uuid, Uuid>,
    parents: &HashMap<Uuid, Option<Uuid>>,
    root: Uuid,
) -> Uuid {
    if own && let Some(folder) = folders.get(&item.import_id) {
        return *folder;
    }
    let mut current = item.parent;
    let mut guard = 0;
    while let Some(parent) = current {
        if let Some(folder) = folders.get(&parent) {
            return *folder;
        }
        guard += 1;
        if guard > parents.len() {
            break;
        }
        current = parents.get(&parent).copied().flatten();
    }
    root
}

/// A page body in Macro's markdown. Child databases are dropped: they are
/// imported as databases of their own.
pub(super) fn page_markdown(notion_markdown: &str) -> String {
    normalize_notion_markdown(&remove_notion_databases(notion_markdown))
        .trim()
        .to_string()
}

/// One row of a written database, for linking relations afterwards.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct WrittenRow {
    /// The database.
    pub database: DatabaseId,
    /// Its table.
    pub table: TableId,
    /// The row.
    pub row: RowId,
}

/// A relation column waiting until every table exists.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct PendingRelation {
    /// The database holding the column.
    pub database: Uuid,
    /// Its table.
    pub table: TableId,
    /// The column name.
    pub name: String,
    /// The data source the relation points at.
    pub target: Option<NotionId>,
    /// Each written row's related Notion pages.
    pub links: Vec<(RowId, Vec<NotionId>)>,
}

/// What writing one data source produced.
#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct WrittenDatabase {
    /// The Macro database.
    pub database_id: Uuid,
    /// The data source's table in it.
    pub table: Option<TableId>,
    /// Notion row id → written row.
    pub rows: HashMap<NotionId, WrittenRow>,
    /// Relations to link once every table exists.
    pub relations: Vec<PendingRelation>,
}

/// Write one data source as a database: columns from its schema, every row,
/// each row's body as a linked document, and relations left pending.
pub(super) async fn write_database<Api: NotionApi, Writer: WorkspaceWriter>(
    api: &Api,
    writer: &Writer,
    user: &MacroUserIdStr<'static>,
    item: &WriteItem,
    folder: Uuid,
    people: &PeopleMap,
) -> anyhow::Result<WrittenDatabase> {
    let source = api.data_source(&item.notion_id).await?;
    let created = writer
        .create_database(user, &capped_name(&item.title))
        .await?;
    let table = created.table;
    let title_property = source
        .properties
        .iter()
        .find(|property| property.kind == NotionPropertyKind::Title)
        .map(|property| property.name.clone());
    let columns: Vec<PlannedColumn> = source
        .properties
        .iter()
        .filter_map(planned_column)
        .collect();
    let page_column = ColumnId::new();

    let mut ops = vec![DatabaseOp::Table {
        table,
        change: TableChange::Rename {
            name: capped_name(&item.title),
            previous_name: None,
        },
    }];
    if let Some(title) = &title_property {
        ops.push(DatabaseOp::Column {
            table,
            column: created.title_column,
            change: ColumnChange::Rename {
                name: capped_name(title),
                previous_name: None,
            },
        });
    }
    let mut after = created.title_column;
    for column in &columns {
        ops.push(DatabaseOp::Column {
            table,
            column: column.id,
            change: ColumnChange::Create {
                definition: NewColumn::New {
                    name: column.name.clone(),
                    kind: column.shape.kind(),
                    options: match &column.shape {
                        super::values::ColumnShape::Select { options, .. } => options
                            .iter()
                            .map(|(id, label)| NewOption {
                                id: *id,
                                label: label.clone(),
                            })
                            .collect(),
                        _ => Vec::new(),
                    },
                    infer_type: false,
                },
                after: Some(after),
            },
        });
        after = column.id;
    }
    ops.push(DatabaseOp::Column {
        table,
        column: page_column,
        change: ColumnChange::Create {
            definition: NewColumn::New {
                name: PAGE_COLUMN.to_string(),
                kind: ColumnKind::Entity {
                    target: EntityKind::Document,
                    multi: false,
                },
                options: Vec::new(),
                infer_type: false,
            },
            after: Some(after),
        },
    });
    writer
        .apply_database_ops(user, created.database_id, ops)
        .await?;

    let rows = all_rows(api, &item.notion_id).await?;
    let database = DatabaseId::from_uuid(created.database_id);
    let mut written = WrittenDatabase {
        database_id: created.database_id,
        table: Some(table),
        ..WrittenDatabase::default()
    };
    for (index, batch) in owned_batches(&rows).into_iter().enumerate() {
        let start = index * ROWS_PER_BATCH;
        let cells: Vec<Vec<CellWrite>> = batch
            .iter()
            .map(|row| row_cells(row, created.title_column, &columns, people))
            .collect();
        let results = writer
            .apply_database_ops(
                user,
                created.database_id,
                vec![DatabaseOp::Rows {
                    table,
                    change: RowsChange::Insert { rows: cells },
                }],
            )
            .await?;
        let ids = inserted_rows(&results);
        anyhow::ensure!(
            ids.len() == batch.len(),
            "database insert returned {} rows for {} written",
            ids.len(),
            batch.len()
        );
        for (row, id) in rows[start..].iter().zip(ids) {
            written.rows.insert(
                row.id.clone(),
                WrittenRow {
                    database,
                    table,
                    row: id,
                },
            );
        }
    }

    for property in &source.properties {
        let NotionPropertyKind::Relation { data_source_id } = &property.kind else {
            continue;
        };
        let links = rows
            .iter()
            .filter_map(|row| {
                let related = match row.properties.get(&property.name)? {
                    import_notion::domain::model::NotionValue::Relation(ids) => ids.clone(),
                    _ => return None,
                };
                let written_row = written.rows.get(&row.id)?;
                (!related.is_empty()).then_some((written_row.row, related))
            })
            .collect();
        written.relations.push(PendingRelation {
            database: created.database_id,
            table,
            name: capped_name(&property.name),
            target: data_source_id.clone(),
            links,
        });
    }

    write_row_bodies(
        api,
        writer,
        user,
        item,
        folder,
        &rows,
        &written,
        page_column,
    )
    .await?;
    Ok(written)
}

fn row_cells(
    row: &NotionPage,
    title_column: ColumnId,
    columns: &[PlannedColumn],
    people: &PeopleMap,
) -> Vec<CellWrite> {
    let mut cells = Vec::with_capacity(columns.len() + 1);
    if !row.title.trim().is_empty() {
        cells.push(CellWrite {
            column: title_column,
            value: CellValue::Text(row.title.trim().to_string()),
        });
    }
    for column in columns {
        if let Some(value) = row
            .properties
            .get(&column.property)
            .and_then(|value| cell(value, column, people))
        {
            cells.push(CellWrite {
                column: column.id,
                value,
            });
        }
    }
    cells
}

fn inserted_rows(results: &[OpResult]) -> Vec<RowId> {
    results
        .iter()
        .filter_map(|result| match result {
            OpResult::Rows {
                change: RowsResult::Inserted { rows },
                ..
            } => Some(rows.clone()),
            _ => None,
        })
        .flatten()
        .collect()
}

/// Rows with page content get a document in a folder beside the database,
/// linked from the row's Page column.
#[allow(clippy::too_many_arguments)]
async fn write_row_bodies<Api: NotionApi, Writer: WorkspaceWriter>(
    api: &Api,
    writer: &Writer,
    user: &MacroUserIdStr<'static>,
    item: &WriteItem,
    folder: Uuid,
    rows: &[NotionPage],
    written: &WrittenDatabase,
    page_column: ColumnId,
) -> anyhow::Result<()> {
    let bodies_folder: tokio::sync::OnceCell<Uuid> = tokio::sync::OnceCell::new();
    let bodies_name = capped_name(&format!("{} pages", item.title));
    let linked: Vec<anyhow::Result<Option<RowChange>>> = stream::iter(rows.iter().cloned())
        .map(|row| {
            let bodies_folder = &bodies_folder;
            let bodies_name = &bodies_name;
            async move {
                let markdown = page_markdown(&full_markdown(api, &row.id).await?);
                if markdown.is_empty() {
                    return Ok(None);
                }
                let Some(written_row) = written.rows.get(&row.id) else {
                    return Ok(None);
                };
                let folder = *bodies_folder
                    .get_or_try_init(|| writer.create_folder(user, bodies_name, Some(folder)))
                    .await?;
                let title = if row.title.trim().is_empty() {
                    super::plan::UNTITLED_PAGE.to_string()
                } else {
                    row.title.trim().to_string()
                };
                let document = writer
                    .create_document(
                        user,
                        &title,
                        &markdown,
                        &ImportedDocumentProperties::default(),
                        Some(folder),
                    )
                    .await?;
                Ok(Some(RowChange {
                    row: written_row.row,
                    cells: vec![CellWrite {
                        column: page_column,
                        value: CellValue::Entities(vec![EntityRef {
                            entity_type: EntityKind::Document,
                            entity_id: document,
                        }]),
                    }],
                }))
            }
            .boxed()
        })
        .buffer_unordered(BODY_CONCURRENCY)
        .collect()
        .await;
    let mut changes = Vec::new();
    for outcome in linked {
        match outcome {
            Ok(Some(change)) => changes.push(change),
            Ok(None) => {}
            // One unreadable row body never loses the row itself.
            Err(error) => tracing::warn!(error = ?error, "notion row body was not imported"),
        }
    }
    let Some(table) = written.table else {
        return Ok(());
    };
    for batch in owned_batches(&changes) {
        writer
            .apply_database_ops(
                user,
                written.database_id,
                vec![DatabaseOp::Rows {
                    table,
                    change: RowsChange::Update {
                        changes: RowChanges::PerRow { rows: batch },
                    },
                }],
            )
            .await?;
    }
    Ok(())
}

/// `items` in insert-sized batches, owned so no borrow is held across the
/// writes.
fn owned_batches<Item: Clone>(items: &[Item]) -> Vec<Vec<Item>> {
    items.chunks(ROWS_PER_BATCH).map(<[Item]>::to_vec).collect()
}

/// Link relations once every database exists: each relation whose target
/// data source was written becomes a relation column filled with the written
/// rows. A relation to something left in Notion is dropped.
pub(super) async fn link_relations<Writer: WorkspaceWriter>(
    writer: &Writer,
    user: &MacroUserIdStr<'static>,
    databases: &HashMap<NotionId, WrittenDatabase>,
) -> anyhow::Result<()> {
    let rows: HashMap<&NotionId, WrittenRow> = databases
        .values()
        .flat_map(|database| database.rows.iter().map(|(id, row)| (id, *row)))
        .collect();
    for database in databases.values() {
        for relation in &database.relations {
            let Some(target) = relation
                .target
                .as_ref()
                .and_then(|target| databases.get(target))
            else {
                continue;
            };
            let Some(target_table) = target.table else {
                continue;
            };
            let column = ColumnId::new();
            let mut ops = vec![DatabaseOp::Column {
                table: relation.table,
                column,
                change: ColumnChange::Create {
                    definition: NewColumn::New {
                        name: relation.name.clone(),
                        kind: ColumnKind::Relation {
                            database: DatabaseId::from_uuid(target.database_id),
                            table: target_table,
                        },
                        options: Vec::new(),
                        infer_type: false,
                    },
                    after: None,
                },
            }];
            let changes: Vec<RowChange> = relation
                .links
                .iter()
                .filter_map(|(row, related)| {
                    let linked: Vec<RowId> = related
                        .iter()
                        .filter_map(|id| rows.get(id))
                        .filter(|written| written.table == target_table)
                        .map(|written| written.row)
                        .collect();
                    (!linked.is_empty()).then(|| RowChange {
                        row: *row,
                        cells: vec![CellWrite {
                            column,
                            value: CellValue::Rows(linked),
                        }],
                    })
                })
                .collect();
            let mut batches = owned_batches(&changes).into_iter();
            if let Some(first) = batches.next() {
                ops.push(DatabaseOp::Rows {
                    table: relation.table,
                    change: RowsChange::Update {
                        changes: RowChanges::PerRow { rows: first },
                    },
                });
            }
            writer
                .apply_database_ops(user, relation.database, ops)
                .await?;
            for batch in batches {
                writer
                    .apply_database_ops(
                        user,
                        relation.database,
                        vec![DatabaseOp::Rows {
                            table: relation.table,
                            change: RowsChange::Update {
                                changes: RowChanges::PerRow { rows: batch },
                            },
                        }],
                    )
                    .await?;
            }
        }
    }
    Ok(())
}

/// Write a task list: a folder of Macro tasks, one per row. Returns the
/// folder id.
pub(super) async fn write_tasks<Api: NotionApi, Writer: WorkspaceWriter>(
    api: &Api,
    writer: &Writer,
    user: &MacroUserIdStr<'static>,
    item: &WriteItem,
    folder: Uuid,
    people: &PeopleMap,
) -> anyhow::Result<Uuid> {
    let rows = all_rows(api, &item.notion_id).await?;
    let tasks_folder = writer
        .create_folder(user, &capped_name(&item.title), Some(folder))
        .await?;
    let failures = Mutex::new(0usize);
    stream::iter(rows.iter().cloned())
        .map(|row| {
            let failures = &failures;
            async move {
                let outcome: anyhow::Result<()> = async {
                    let content = page_markdown(&full_markdown(api, &row.id).await?);
                    let body = task_body(&row, &content, &item.task_fields, people);
                    let properties = task_properties(&row, &item.task_fields, people);
                    let title = if row.title.trim().is_empty() {
                        super::plan::UNTITLED_PAGE
                    } else {
                        row.title.trim()
                    };
                    writer
                        .create_task(user, title, &body, &properties, Some(tasks_folder))
                        .await?;
                    Ok(())
                }
                .await;
                if let Err(error) = outcome {
                    tracing::warn!(error = ?error, "notion task row was not imported");
                    if let Ok(mut failed) = failures.lock() {
                        *failed += 1;
                    }
                }
            }
            .boxed()
        })
        .buffer_unordered(BODY_CONCURRENCY)
        .collect::<Vec<()>>()
        .await;
    let failed = failures.into_inner().unwrap_or_default();
    anyhow::ensure!(
        failed < rows.len() || rows.is_empty(),
        "none of the {} task rows could be imported",
        rows.len()
    );
    Ok(tasks_folder)
}
