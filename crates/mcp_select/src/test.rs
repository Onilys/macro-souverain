use super::*;
use mcp_client::domain::models::McpServerRecord;
use pipedream_mcp::domain::models::{McpServer, PipedreamConnection};
use std::sync::Mutex;

const SLACK: ConnectorRef<'static> = ConnectorRef {
    pipedream_app_slugs: &["slack", "slack_v2"],
    native_server_url: "https://mcp.slack.com/mcp",
};

fn user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|test@example.com").unwrap()
}

#[derive(Default)]
struct FakeStore {
    connections: Vec<PipedreamConnection>,
    native_records: Vec<McpServerRecord>,
}

impl ConnectionStore for FakeStore {
    type Err = ();

    async fn save(&self, _: &PipedreamConnection) -> Result<(), Self::Err> {
        panic!("selection must not save connections")
    }

    async fn load(
        &self,
        _: &MacroUserIdStr<'static>,
        _: &str,
    ) -> Result<Option<PipedreamConnection>, Self::Err> {
        panic!("selection must list connections")
    }

    async fn delete(&self, _: &MacroUserIdStr<'static>, _: &str) -> Result<(), Self::Err> {
        panic!("selection must not delete connections")
    }

    async fn list(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> Result<Vec<PipedreamConnection>, Self::Err> {
        assert_eq!(user, &self::user());
        Ok(self.connections.clone())
    }
}

impl McpServerStore for FakeStore {
    type Err = ();

    async fn save(&self, _: &McpServerRecord) -> Result<(), Self::Err> {
        panic!("selection must not save native servers")
    }

    async fn load(
        &self,
        _: &MacroUserIdStr<'static>,
        _: &str,
    ) -> Result<Option<McpServerRecord>, Self::Err> {
        panic!("selection must list native servers")
    }

    async fn delete(&self, _: &MacroUserIdStr<'static>, _: &str) -> Result<(), Self::Err> {
        panic!("selection must not delete native servers")
    }

    async fn list(&self, _: &MacroUserIdStr<'static>) -> Result<Vec<McpServerRecord>, Self::Err> {
        assert!(
            self.connections.is_empty() || !self.native_records.is_empty(),
            "Pipedream connections exclude the native stack"
        );
        Ok(self.native_records.clone())
    }
}

#[derive(Default)]
struct FakeConnection {
    attempts: Mutex<Vec<String>>,
}

impl McpConnection for FakeConnection {
    fn is_configured(&self) -> bool {
        true
    }

    async fn connect(&self, record: &PipedreamConnection) -> anyhow::Result<McpServer> {
        self.attempts.lock().unwrap().push(record.app_slug.clone());
        // Exercise selection without a live MCP transport. Failed sessions
        // are skipped by PipedreamToolSet, but must not try another alias.
        anyhow::bail!("synthetic connection failure")
    }
}

fn connections(slugs: &[&str]) -> Vec<PipedreamConnection> {
    slugs
        .iter()
        .map(|slug| PipedreamConnection {
            user_id: user(),
            app_slug: (*slug).to_string(),
            server_name: "Slack".to_string(),
            account_id: format!("apn_{slug}"),
            enabled: true,
        })
        .collect()
}

fn selector(slugs: &[&str]) -> McpToolSelector<FakeStore, FakeStore, FakeConnection> {
    let store = Arc::new(FakeStore {
        connections: connections(slugs),
        ..Default::default()
    });
    McpToolSelector::new(store.clone(), store, Arc::new(FakeConnection::default()))
}

#[tokio::test]
async fn unconfigured_pipedream_preserves_native_connector_selection() {
    let connectors = [
        SLACK,
        ConnectorRef {
            pipedream_app_slugs: &["notion"],
            native_server_url: "https://mcp.notion.com/mcp",
        },
        ConnectorRef {
            pipedream_app_slugs: &["linear"],
            native_server_url: "https://mcp.linear.app/mcp",
        },
    ];
    let store = Arc::new(FakeStore {
        connections: connections(&["slack", "notion", "linear"]),
        native_records: connectors
            .iter()
            .map(|connector| McpServerRecord {
                user_id: user(),
                url: connector.native_server_url.to_string(),
                server_name: connector.pipedream_app_slugs[0].to_string(),
                credentials: None,
                // Only exercise routing; no live server should be contacted.
                enabled: false,
            })
            .collect(),
    });
    let selector =
        McpToolSelector::new(store.clone(), store, Arc::new(None::<Arc<FakeConnection>>));

    assert!(matches!(
        selector.user_toolset(&user()).await,
        UserMcpTools::Native(_)
    ));
    for connector in connectors {
        assert!(matches!(
            selector
                .connector_toolset(&user(), connector)
                .await
                .unwrap(),
            Some(UserMcpTools::Native(_))
        ));
        assert!(
            !selector
                .connector_connected(&user(), connector)
                .await
                .unwrap(),
            "stored Pipedream accounts must not report a usable connection"
        );
    }
}

#[tokio::test]
async fn configured_optional_pipedream_keeps_precedence_over_native() {
    let configured = selector(&["slack"]);
    let selector = McpToolSelector::new(
        configured.native_store,
        configured.pipedream_store,
        Arc::new(Some(configured.pipedream_connection)),
    );

    assert!(matches!(
        selector.connector_toolset(&user(), SLACK).await.unwrap(),
        Some(UserMcpTools::Pipedream(_))
    ));
    assert!(selector.connector_connected(&user(), SLACK).await.unwrap());
}

#[test]
fn matches_only_declared_slugs() {
    assert!(SLACK.matches_pipedream_slug("slack"));
    assert!(SLACK.matches_pipedream_slug("slack_v2"));
    for slug in ["slack_bot", "Slack", "slack_v", "linear", ""] {
        assert!(!SLACK.matches_pipedream_slug(slug), "{slug}");
    }
    assert!(
        !ConnectorRef {
            pipedream_app_slugs: &[],
            ..SLACK
        }
        .matches_pipedream_slug("slack")
    );
}

#[tokio::test]
async fn either_slack_alias_is_connected_and_selected() {
    for slug in SLACK.pipedream_app_slugs {
        let selector = selector(&["linear", slug]);
        assert!(selector.connector_connected(&user(), SLACK).await.unwrap());
        let tools = selector.connector_toolset(&user(), SLACK).await.unwrap();
        assert!(matches!(tools, Some(UserMcpTools::Pipedream(_))));
        assert_eq!(
            *selector.pipedream_connection.attempts.lock().unwrap(),
            [*slug]
        );
    }
}

#[tokio::test]
async fn selects_only_first_preferred_alias_regardless_of_store_order() {
    for slugs in [["slack", "slack_v2"], ["slack_v2", "slack"]] {
        for preference in [["slack", "slack_v2"], ["slack_v2", "slack"]] {
            let selector = selector(&slugs);
            let connector = ConnectorRef {
                pipedream_app_slugs: &preference,
                ..SLACK
            };
            assert!(
                selector
                    .connector_connected(&user(), connector)
                    .await
                    .unwrap()
            );
            let tools = selector
                .connector_toolset(&user(), connector)
                .await
                .unwrap();
            assert!(matches!(tools, Some(UserMcpTools::Pipedream(_))));
            assert_eq!(
                *selector.pipedream_connection.attempts.lock().unwrap(),
                [preference[0]],
            );
        }
    }
}

#[tokio::test]
async fn unrelated_or_missing_connections_do_not_match() {
    for slugs in [vec!["linear", "slack_bot"], vec![]] {
        let selector = selector(&slugs);
        assert!(!selector.connector_connected(&user(), SLACK).await.unwrap());
        assert!(
            selector
                .connector_toolset(&user(), SLACK)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            selector
                .pipedream_connection
                .attempts
                .lock()
                .unwrap()
                .is_empty()
        );
    }
}

#[tokio::test]
async fn empty_alias_list_does_not_match() {
    let selector = selector(&["slack", "slack_v2"]);
    let connector = ConnectorRef {
        pipedream_app_slugs: &[],
        ..SLACK
    };
    assert!(
        !selector
            .connector_connected(&user(), connector)
            .await
            .unwrap()
    );
    assert!(
        selector
            .connector_toolset(&user(), connector)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        selector
            .pipedream_connection
            .attempts
            .lock()
            .unwrap()
            .is_empty()
    );
}
