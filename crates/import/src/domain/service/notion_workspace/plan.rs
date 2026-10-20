//! The plan's shape: the workspace as a tree of pages and data sources, the
//! items the decision model sees, and the rows the ledger stages.

use std::collections::{HashMap, HashSet, VecDeque};

use import_notion::domain::model::{
    DataSourceSummary, Inventory, NotionId, NotionParent, NotionPropertyKind,
};

use crate::domain::models::{ImportKind, NotionDecision, NotionDocMeta, NotionPlanItem};
use crate::domain::ports::PlanRow;

use super::triage::{TriageItem, TriageTable, Verdict, default_verdict};

#[cfg(test)]
mod test;

/// Titles given to objects Notion has none for.
pub(super) const UNTITLED_PAGE: &str = "Untitled";
pub(super) const UNTITLED_DATABASE: &str = "Untitled database";

/// One object in the plan's tree.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct Node {
    /// The object's id.
    pub id: NotionId,
    /// A page or a data source.
    pub kind: ImportKind,
    /// The title, never empty.
    pub title: String,
    /// Its Notion URL.
    pub url: String,
    /// The node it sits under, when that node is in scope.
    pub parent: Option<NotionId>,
    /// For a data source: what planning learned about its rows.
    pub table: Option<TriageTable>,
}

/// The objects in scope, parents before children.
#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct PlanTree {
    /// Every node, in breadth-first order from the roots.
    pub nodes: Vec<Node>,
}

impl PlanTree {
    /// Arrange an inventory into a tree. A page under a page or a data source
    /// under a page hangs off that page when it is in scope; everything else
    /// is a root.
    pub fn new(inventory: &Inventory) -> Self {
        let mut nodes: Vec<Node> = inventory
            .pages
            .iter()
            .map(|page| Node {
                id: page.id.clone(),
                kind: ImportKind::Page,
                title: titled(&page.title, UNTITLED_PAGE),
                url: page.url.clone(),
                parent: parent_page(&page.parent),
                table: None,
            })
            .collect();
        nodes.extend(inventory.data_sources.iter().map(data_source_node));

        let known: HashSet<NotionId> = nodes.iter().map(|node| node.id.clone()).collect();
        for node in &mut nodes {
            if node
                .parent
                .as_ref()
                .is_some_and(|parent| !known.contains(parent))
            {
                node.parent = None;
            }
        }
        Self {
            nodes: breadth_first(nodes),
        }
    }

    /// The titles above `id`, outermost first.
    fn path(&self, id: &NotionId, index: &HashMap<&NotionId, &Node>) -> Vec<String> {
        let mut path = Vec::new();
        let mut seen = HashSet::new();
        let mut current = index.get(id).and_then(|node| node.parent.as_ref());
        while let Some(parent) = current {
            if !seen.insert(parent) {
                break;
            }
            let Some(node) = index.get(parent) else { break };
            path.push(node.title.clone());
            current = node.parent.as_ref();
        }
        path.reverse();
        path
    }

    /// What the decision model sees of each node.
    pub fn triage_items(&self) -> Vec<TriageItem> {
        let index = self.index();
        let children = self.child_counts();
        self.nodes
            .iter()
            .map(|node| TriageItem {
                key: node.id.to_string(),
                kind: node.kind,
                title: node.title.clone(),
                path: self.path(&node.id, &index),
                children: children.get(&node.id).copied().unwrap_or(0),
                table: node.table.clone(),
            })
            .collect()
    }

    /// The ledger rows for the plan, parents first.
    pub fn plan_rows(&self, verdicts: &HashMap<String, Verdict>) -> Vec<PlanRow> {
        let index = self.index();
        self.nodes
            .iter()
            .map(|node| {
                let key = node.id.to_string();
                let verdict = verdicts.get(&key).cloned().unwrap_or_else(|| {
                    default_verdict(
                        &TriageItem {
                            key: key.clone(),
                            kind: node.kind,
                            title: node.title.clone(),
                            path: Vec::new(),
                            children: 0,
                            table: node.table.clone(),
                        },
                        "The decision model gave no answer",
                    )
                });
                let plan = NotionPlanItem {
                    decision: verdict.decision,
                    reason: verdict.reason,
                    path: self.path(&node.id, &index),
                    rows: node
                        .table
                        .as_ref()
                        .map(|table| u32::try_from(table.rows).unwrap_or(u32::MAX)),
                    task_fields: (verdict.decision == NotionDecision::Tasks)
                        .then_some(verdict.task_fields)
                        .flatten(),
                };
                let metadata = NotionDocMeta::for_plan(node.title.clone(), node.url.clone(), plan);
                PlanRow {
                    kind: node.kind,
                    foreign_id: key,
                    parent_foreign_id: node.parent.as_ref().map(NotionId::to_string),
                    metadata: serde_json::to_value(metadata).unwrap_or_default(),
                }
            })
            .collect()
    }

    fn index(&self) -> HashMap<&NotionId, &Node> {
        self.nodes.iter().map(|node| (&node.id, node)).collect()
    }

    fn child_counts(&self) -> HashMap<NotionId, usize> {
        let mut counts = HashMap::new();
        for parent in self.nodes.iter().filter_map(|node| node.parent.clone()) {
            *counts.entry(parent).or_insert(0) += 1;
        }
        counts
    }
}

fn data_source_node(summary: &DataSourceSummary) -> Node {
    let source = &summary.source;
    let columns = source
        .properties
        .iter()
        .map(|property| format!("{} ({})", property.name, kind_name(&property.kind)))
        .collect();
    Node {
        id: source.id.clone(),
        kind: ImportKind::DataSource,
        title: titled(&source.title, UNTITLED_DATABASE),
        url: source.database_id.url(),
        parent: parent_page(&source.database_parent),
        table: Some(TriageTable {
            columns,
            rows: summary.row_count,
            sample_titles: summary.sample_titles.clone(),
        }),
    }
}

/// The page an object sits directly under, when it sits under one.
fn parent_page(parent: &NotionParent) -> Option<NotionId> {
    match parent {
        NotionParent::Page { id } => Some(id.clone()),
        NotionParent::Workspace
        | NotionParent::Database { .. }
        | NotionParent::DataSource { .. }
        | NotionParent::Block { .. }
        | NotionParent::Other => None,
    }
}

fn titled(title: &str, fallback: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn kind_name(kind: &NotionPropertyKind) -> &str {
    match kind {
        NotionPropertyKind::Title => "title",
        NotionPropertyKind::RichText => "text",
        NotionPropertyKind::Number => "number",
        NotionPropertyKind::Select { .. } => "select",
        NotionPropertyKind::MultiSelect { .. } => "multi_select",
        NotionPropertyKind::Status { .. } => "status",
        NotionPropertyKind::Date => "date",
        NotionPropertyKind::People => "people",
        NotionPropertyKind::Files => "files",
        NotionPropertyKind::Checkbox => "checkbox",
        NotionPropertyKind::Url => "url",
        NotionPropertyKind::Email => "email",
        NotionPropertyKind::PhoneNumber => "phone",
        NotionPropertyKind::Formula => "formula",
        NotionPropertyKind::Relation { .. } => "relation",
        NotionPropertyKind::Rollup => "rollup",
        NotionPropertyKind::CreatedTime => "created_time",
        NotionPropertyKind::CreatedBy => "created_by",
        NotionPropertyKind::LastEditedTime => "last_edited_time",
        NotionPropertyKind::LastEditedBy => "last_edited_by",
        NotionPropertyKind::UniqueId { .. } => "unique_id",
        NotionPropertyKind::Unsupported { notion_type } => notion_type,
    }
}

/// Nodes reordered so every parent comes before its children. A cycle
/// (which Notion should never report) leaves its members as roots.
fn breadth_first(nodes: Vec<Node>) -> Vec<Node> {
    let mut children: HashMap<NotionId, Vec<usize>> = HashMap::new();
    let mut roots = VecDeque::new();
    for (position, node) in nodes.iter().enumerate() {
        match &node.parent {
            Some(parent) => children.entry(parent.clone()).or_default().push(position),
            None => roots.push_back(position),
        }
    }
    let mut ordered = Vec::with_capacity(nodes.len());
    let mut visited = vec![false; nodes.len()];
    let mut queue = roots;
    loop {
        while let Some(position) = queue.pop_front() {
            if std::mem::replace(&mut visited[position], true) {
                continue;
            }
            ordered.push(position);
            if let Some(below) = children.get(&nodes[position].id) {
                queue.extend(below.iter().copied());
            }
        }
        // Anything unvisited is in a cycle: start again from one of them.
        match visited.iter().position(|seen| !seen) {
            Some(position) => queue.push_back(position),
            None => break,
        }
    }
    let mut slots: Vec<Option<Node>> = nodes.into_iter().map(Some).collect();
    let mut emitted: HashSet<NotionId> = HashSet::with_capacity(slots.len());
    ordered
        .into_iter()
        .filter_map(|position| {
            let mut node = slots[position].take()?;
            // A cycle member emitted before its parent becomes a root.
            if node
                .parent
                .as_ref()
                .is_some_and(|parent| !emitted.contains(parent))
            {
                node.parent = None;
            }
            emitted.insert(node.id.clone());
            Some(node)
        })
        .collect()
}
