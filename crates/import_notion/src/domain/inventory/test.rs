use std::collections::{BTreeMap, HashMap};
use std::sync::Mutex;

use chrono::{TimeZone, Utc};

use super::{full_markdown, inventory};
use crate::domain::model::{
    DataSourceSummary, ImportScope, Inventory, InventoryProgress, NotionDataSource, NotionId,
    NotionPage, NotionParent, NotionUser, PageMarkdown, Paged, SearchHit, SearchObject,
};
use crate::domain::ports::{NotionApi, NotionError};

/// A workspace held in memory. Searches return everything on one page.
#[derive(Default)]
struct FakeWorkspace {
    pages: Vec<NotionPage>,
    data_sources: Vec<NotionDataSource>,
    /// Data sources a database container holds, by database id.
    databases: HashMap<NotionId, Vec<NotionId>>,
    /// Rows by data source id; the first page of a query.
    rows: HashMap<NotionId, Paged<NotionPage>>,
    markdown: HashMap<NotionId, PageMarkdown>,
    markdown_requests: Mutex<Vec<NotionId>>,
}

impl NotionApi for FakeWorkspace {
    async fn search(
        &self,
        object: SearchObject,
        _cursor: Option<String>,
    ) -> Result<Paged<SearchHit>, NotionError> {
        let results = match object {
            SearchObject::Page => self.pages.iter().cloned().map(SearchHit::Page).collect(),
            SearchObject::DataSource => self
                .data_sources
                .iter()
                .cloned()
                .map(SearchHit::DataSource)
                .collect(),
        };
        Ok(Paged {
            results,
            next_cursor: None,
        })
    }

    async fn page(&self, id: &NotionId) -> Result<NotionPage, NotionError> {
        self.pages
            .iter()
            .find(|page| &page.id == id)
            .cloned()
            .ok_or(NotionError::NotFound)
    }

    async fn page_markdown(&self, id: &NotionId) -> Result<PageMarkdown, NotionError> {
        self.markdown_requests.lock().unwrap().push(id.clone());
        self.markdown.get(id).cloned().ok_or(NotionError::NotFound)
    }

    async fn data_source(&self, id: &NotionId) -> Result<NotionDataSource, NotionError> {
        self.data_sources
            .iter()
            .find(|source| &source.id == id)
            .cloned()
            .ok_or(NotionError::NotFound)
    }

    async fn database_sources(&self, database: &NotionId) -> Result<Vec<NotionId>, NotionError> {
        self.databases
            .get(database)
            .cloned()
            .ok_or(NotionError::NotFound)
    }

    async fn query_data_source(
        &self,
        id: &NotionId,
        _cursor: Option<String>,
    ) -> Result<Paged<NotionPage>, NotionError> {
        Ok(self.rows.get(id).cloned().unwrap_or(Paged {
            results: Vec::new(),
            next_cursor: None,
        }))
    }

    async fn users(&self, _cursor: Option<String>) -> Result<Paged<NotionUser>, NotionError> {
        Ok(Paged {
            results: Vec::new(),
            next_cursor: None,
        })
    }
}

#[tokio::test]
async fn everything_lists_documents_and_summarized_data_sources_without_rows_or_trash() {
    let plan = NotionPage {
        id: NotionId::parse("598337872cf94fdf8782e53db20768a5").unwrap(),
        title: "Q3 plan".into(),
        url: "https://www.notion.so/598337872cf94fdf8782e53db20768a5".into(),
        parent: NotionParent::Workspace,
        last_edited: Utc.with_ymd_and_hms(2026, 3, 2, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 3, 1, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let trashed = NotionPage {
        id: NotionId::parse("c7f0aa501f0e4a529a17e2f6f3a3b0c1").unwrap(),
        title: "Old notes".into(),
        url: "https://www.notion.so/c7f0aa501f0e4a529a17e2f6f3a3b0c1".into(),
        parent: NotionParent::Workspace,
        last_edited: Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        in_trash: true,
        properties: BTreeMap::new(),
    };
    let row = NotionPage {
        id: NotionId::parse("ee5f0f84409a440f983aa5315961c6e4").unwrap(),
        title: "Ship onboarding".into(),
        url: "https://www.notion.so/ee5f0f84409a440f983aa5315961c6e4".into(),
        parent: NotionParent::DataSource {
            data_source: NotionId::parse("1a44be1209534631a1d67d4c2b1b4a2f").unwrap(),
            database: NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
        },
        last_edited: Utc.with_ymd_and_hms(2026, 2, 2, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 2, 1, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let roadmap = NotionDataSource {
        id: NotionId::parse("1a44be1209534631a1d67d4c2b1b4a2f").unwrap(),
        database_id: NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
        title: "Roadmap".into(),
        database_parent: NotionParent::Page {
            id: NotionId::parse("598337872cf94fdf8782e53db20768a5").unwrap(),
        },
        in_trash: false,
        properties: vec![],
    };
    let workspace = FakeWorkspace {
        pages: vec![plan.clone(), trashed, row.clone()],
        data_sources: vec![roadmap.clone()],
        rows: HashMap::from([(
            roadmap.id.clone(),
            Paged {
                results: vec![row.clone()],
                next_cursor: Some("more".into()),
            },
        )]),
        ..FakeWorkspace::default()
    };
    let reports = Mutex::new(Vec::new());

    let found = inventory(&workspace, &ImportScope::Everything, &|progress| {
        reports.lock().unwrap().push(progress)
    })
    .await
    .unwrap();

    assert_eq!(
        found,
        Inventory {
            pages: vec![plan],
            data_sources: vec![DataSourceSummary {
                source: roadmap,
                row_count: 1,
                more_rows: true,
                sample_titles: vec!["Ship onboarding".into()],
            }],
        }
    );
    assert_eq!(
        reports.into_inner().unwrap(),
        vec![
            InventoryProgress {
                pages: 1,
                data_sources: 0,
            },
            InventoryProgress {
                pages: 1,
                data_sources: 1,
            },
            InventoryProgress {
                pages: 1,
                data_sources: 1,
            },
        ]
    );
}

#[tokio::test]
async fn roots_keep_their_descendants_through_rows_and_databases() {
    // root page
    //   └ database d98… / data source 1a4… (Roadmap)
    //       └ row ee5…
    //           └ page under the row 9a3…
    //   └ column block b10…
    //       └ page in a column a1b…
    // unrelated page c7f…
    let root = NotionPage {
        id: NotionId::parse("598337872cf94fdf8782e53db20768a5").unwrap(),
        title: "Team".into(),
        url: "https://www.notion.so/598337872cf94fdf8782e53db20768a5".into(),
        parent: NotionParent::Workspace,
        last_edited: Utc.with_ymd_and_hms(2026, 3, 2, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 3, 1, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let row = NotionPage {
        id: NotionId::parse("ee5f0f84409a440f983aa5315961c6e4").unwrap(),
        title: "Ship onboarding".into(),
        url: "https://www.notion.so/ee5f0f84409a440f983aa5315961c6e4".into(),
        parent: NotionParent::DataSource {
            data_source: NotionId::parse("1a44be1209534631a1d67d4c2b1b4a2f").unwrap(),
            database: NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
        },
        last_edited: Utc.with_ymd_and_hms(2026, 2, 2, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 2, 1, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let under_row = NotionPage {
        id: NotionId::parse("9a3b5ae0c6e6482db0e1ed315ee6dc57").unwrap(),
        title: "Onboarding spec".into(),
        url: "https://www.notion.so/9a3b5ae0c6e6482db0e1ed315ee6dc57".into(),
        parent: NotionParent::Page {
            id: NotionId::parse("ee5f0f84409a440f983aa5315961c6e4").unwrap(),
        },
        last_edited: Utc.with_ymd_and_hms(2026, 2, 3, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 2, 3, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let in_column = NotionPage {
        id: NotionId::parse("a1b2c3d4000040008000000000000001").unwrap(),
        title: "Column page".into(),
        url: "https://www.notion.so/a1b2c3d4000040008000000000000001".into(),
        parent: NotionParent::Block {
            id: NotionId::parse("b1000000000040008000000000000000").unwrap(),
        },
        last_edited: Utc.with_ymd_and_hms(2026, 2, 4, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 2, 4, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let unrelated = NotionPage {
        id: NotionId::parse("c7f0aa501f0e4a529a17e2f6f3a3b0c1").unwrap(),
        title: "Elsewhere".into(),
        url: "https://www.notion.so/c7f0aa501f0e4a529a17e2f6f3a3b0c1".into(),
        parent: NotionParent::Workspace,
        last_edited: Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap(),
        created: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        in_trash: false,
        properties: BTreeMap::new(),
    };
    let roadmap = NotionDataSource {
        id: NotionId::parse("1a44be1209534631a1d67d4c2b1b4a2f").unwrap(),
        database_id: NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
        title: "Roadmap".into(),
        database_parent: NotionParent::Page {
            id: NotionId::parse("598337872cf94fdf8782e53db20768a5").unwrap(),
        },
        in_trash: false,
        properties: vec![],
    };
    let workspace = FakeWorkspace {
        pages: vec![
            root.clone(),
            row,
            under_row.clone(),
            in_column.clone(),
            unrelated,
        ],
        data_sources: vec![roadmap.clone()],
        ..FakeWorkspace::default()
    };

    let found = inventory(
        &workspace,
        &ImportScope::Roots {
            ids: vec![root.id.clone()],
        },
        &|_| {},
    )
    .await
    .unwrap();

    // The column block's owning page is not knowable from search results.
    let titles: Vec<&str> = found.pages.iter().map(|page| page.title.as_str()).collect();
    assert_eq!(titles, vec!["Team", "Onboarding spec"]);
    assert_eq!(
        found.data_sources,
        vec![DataSourceSummary {
            source: roadmap,
            row_count: 0,
            more_rows: false,
            sample_titles: vec![],
        }]
    );
}

#[tokio::test]
async fn a_database_root_missing_from_search_is_expanded_into_its_data_sources() {
    let tasks = NotionDataSource {
        id: NotionId::parse("1a44be1209534631a1d67d4c2b1b4a2f").unwrap(),
        database_id: NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
        title: "Tasks".into(),
        database_parent: NotionParent::Workspace,
        in_trash: false,
        properties: vec![],
    };
    let archive = NotionDataSource {
        id: NotionId::parse("ee5f0f84409a440f983aa5315961c6e4").unwrap(),
        database_id: NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
        title: "Archive".into(),
        database_parent: NotionParent::Workspace,
        in_trash: false,
        properties: vec![],
    };
    let other = NotionDataSource {
        id: NotionId::parse("c7f0aa501f0e4a529a17e2f6f3a3b0c1").unwrap(),
        database_id: NotionId::parse("9a3b5ae0c6e6482db0e1ed315ee6dc57").unwrap(),
        title: "Other".into(),
        database_parent: NotionParent::Workspace,
        in_trash: false,
        properties: vec![],
    };
    // Search only finds the unrelated data source; the root database's
    // sources are reachable by id.
    struct PartialSearch(FakeWorkspace);
    impl NotionApi for PartialSearch {
        async fn search(
            &self,
            object: SearchObject,
            _cursor: Option<String>,
        ) -> Result<Paged<SearchHit>, NotionError> {
            let results = match object {
                SearchObject::Page => vec![],
                SearchObject::DataSource => {
                    vec![SearchHit::DataSource(self.0.data_sources[2].clone())]
                }
            };
            Ok(Paged {
                results,
                next_cursor: None,
            })
        }
        async fn page(&self, id: &NotionId) -> Result<NotionPage, NotionError> {
            self.0.page(id).await
        }
        async fn page_markdown(&self, id: &NotionId) -> Result<PageMarkdown, NotionError> {
            self.0.page_markdown(id).await
        }
        async fn data_source(&self, id: &NotionId) -> Result<NotionDataSource, NotionError> {
            self.0.data_source(id).await
        }
        async fn database_sources(
            &self,
            database: &NotionId,
        ) -> Result<Vec<NotionId>, NotionError> {
            self.0.database_sources(database).await
        }
        async fn query_data_source(
            &self,
            id: &NotionId,
            cursor: Option<String>,
        ) -> Result<Paged<NotionPage>, NotionError> {
            self.0.query_data_source(id, cursor).await
        }
        async fn users(&self, cursor: Option<String>) -> Result<Paged<NotionUser>, NotionError> {
            self.0.users(cursor).await
        }
    }
    let workspace = PartialSearch(FakeWorkspace {
        data_sources: vec![tasks.clone(), archive.clone(), other],
        databases: HashMap::from([(
            NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap(),
            vec![tasks.id.clone(), archive.id.clone()],
        )]),
        ..FakeWorkspace::default()
    });

    let found = inventory(
        &workspace,
        &ImportScope::Roots {
            ids: vec![NotionId::parse("d9824bdc84454327be8b5b47500af6ce").unwrap()],
        },
        &|_| {},
    )
    .await
    .unwrap();

    let titles: Vec<&str> = found
        .data_sources
        .iter()
        .map(|summary| summary.source.title.as_str())
        .collect();
    assert_eq!(titles, vec!["Tasks", "Archive"]);
    assert_eq!(found.pages, vec![]);
}

#[tokio::test]
async fn full_markdown_splices_unknown_blocks_into_their_placeholders() {
    let page = NotionId::parse("598337872cf94fdf8782e53db20768a5").unwrap();
    let toggle = NotionId::parse("c7f0aa501f0e4a529a17e2f6f3a3b0c1").unwrap();
    let nested = NotionId::parse("ee5f0f84409a440f983aa5315961c6e4").unwrap();
    let orphan = NotionId::parse("9a3b5ae0c6e6482db0e1ed315ee6dc57").unwrap();
    let workspace = FakeWorkspace {
        markdown: HashMap::from([
            (
                page.clone(),
                PageMarkdown {
                    markdown: "# Plan\n\n<unknown url=\"https://www.notion.so/598337872cf94fdf8782e53db20768a5#c7f0aa50-1f0e-4a52-9a17-e2f6f3a3b0c1\" alt=\"toggle\"/>\n\nEnd".into(),
                    unknown_block_ids: vec![toggle.clone(), orphan.clone()],
                },
            ),
            (
                toggle,
                PageMarkdown {
                    markdown: "<details>\n<summary>More</summary>\n<unknown url=\"https://www.notion.so/x#ee5f0f84409a440f983aa5315961c6e4\" alt=\"table\"/>\n</details>\n".into(),
                    unknown_block_ids: vec![nested.clone()],
                },
            ),
            (
                nested,
                PageMarkdown {
                    markdown: "| a | b |".into(),
                    unknown_block_ids: vec![],
                },
            ),
            (
                orphan,
                PageMarkdown {
                    markdown: "Trailing block".into(),
                    unknown_block_ids: vec![],
                },
            ),
        ]),
        ..FakeWorkspace::default()
    };

    let markdown = full_markdown(&workspace, &page).await.unwrap();

    assert_eq!(
        markdown,
        "# Plan\n\n<details>\n<summary>More</summary>\n| a | b |\n</details>\n\nEnd\n\nTrailing block"
    );
    assert_eq!(workspace.markdown_requests.lock().unwrap().len(), 4);
}

#[tokio::test]
async fn full_markdown_keeps_the_placeholder_of_an_unreadable_block() {
    let page = NotionId::parse("598337872cf94fdf8782e53db20768a5").unwrap();
    let workspace = FakeWorkspace {
        markdown: HashMap::from([(
            page.clone(),
            PageMarkdown {
                markdown: "Intro <unknown alt=\"c7f0aa501f0e4a529a17e2f6f3a3b0c1\"/>".into(),
                unknown_block_ids: vec![
                    NotionId::parse("c7f0aa501f0e4a529a17e2f6f3a3b0c1").unwrap(),
                ],
            },
        )]),
        ..FakeWorkspace::default()
    };

    let markdown = full_markdown(&workspace, &page).await.unwrap();

    assert_eq!(
        markdown,
        "Intro <unknown alt=\"c7f0aa501f0e4a529a17e2f6f3a3b0c1\"/>"
    );
}
