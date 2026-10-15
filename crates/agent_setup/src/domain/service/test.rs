use std::time::Duration;

use import::domain::models::{ImportSource, ImportStatus, RunStatus};

use super::*;
use crate::domain::models::{HandoffKind, Selection};
use crate::test_support::{
    FakeAccounts, FakeConnections, FakeImports, FakeInbox, Fixture, fixture, linear_issue,
    notion_page, now, run, user,
};

fn apps(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| (*name).to_owned()).collect()
}

fn discovered() -> Vec<import::domain::models::ImportEntity> {
    vec![
        notion_page(1, "Eng Roadmap", ImportStatus::Staged),
        notion_page(2, "Onboarding Guide", ImportStatus::Staged),
        linear_issue(3, "ENG-12", "Fix login", ImportStatus::Staged),
        linear_issue(4, "ENG-13", "Ship search", ImportStatus::Staged),
        linear_issue(5, "OPS-2", "Rotate keys", ImportStatus::Staged),
    ]
}

fn golden() -> Fixture {
    fixture(
        FakeImports::new(Vec::new(), Vec::new(), discovered()),
        FakeConnections::with(&[]),
        FakeInbox(vec!["founder@startup.example".to_owned()]),
        FakeAccounts::default(),
    )
}

fn connect_all(fixture: &Fixture, ids: &[&str]) {
    fixture
        .connections
        .connected
        .lock()
        .unwrap()
        .extend(ids.iter().map(|id| (*id).to_owned()));
}

fn reference(n: u128) -> String {
    crate::domain::view::reference(&notion_page(n, "", ImportStatus::Staged))
}

#[tokio::test]
async fn without_named_apps_the_first_step_is_finding_out_what_the_person_uses() {
    let fixture = golden();

    let state = fixture.service.state(&user(), &[]).await.expect("state");

    assert!(state.apps.is_empty());
    assert!(
        state.next_step.contains("SetupGetState(apps: [...])"),
        "{}",
        state.next_step
    );
}

#[tokio::test]
async fn the_golden_path_walks_connect_discover_plan_import_report() {
    let fixture = golden();
    let named = apps(&["Notion", "Linear", "Gmail"]);

    // 1. Nothing connected yet: one batched connect step.
    let state = fixture.service.state(&user(), &named).await.expect("state");
    assert_eq!(
        state.next_step,
        "Call SetupConnect(apps: [\"notion\", \"linear\"]) and show the person every link in one message."
    );
    assert!(state.inbox.connected);

    // 2. Connect: one Macro link per app, handed over to the agent first.
    let connect = fixture
        .service
        .connect(&user(), &named)
        .await
        .expect("connect");
    assert_eq!(connect.already_connected, ["gmail"]);
    let urls: Vec<&str> = connect
        .handoffs
        .iter()
        .map(|handoff| handoff.url.as_str())
        .collect();
    assert_eq!(
        urls,
        [
            format!(
                "https://macro.com/app/connect/notion?account=founder%40startup.example&expires={}",
                (now() + chrono::Duration::hours(24)).timestamp()
            ),
            format!(
                "https://macro.com/app/connect/linear?account=founder%40startup.example&expires={}",
                (now() + chrono::Duration::hours(24)).timestamp()
            ),
        ]
    );
    assert!(
        connect
            .handoffs
            .iter()
            .all(|handoff| handoff.kind == HandoffKind::Connect)
    );
    assert!(
        connect.handoffs[0]
            .resume
            .contains("SetupConnect(apps: [\"notion\"])")
    );
    assert_eq!(*fixture.accounts.handovers.lock().unwrap(), 1);

    // 3. The person connected both: discovery is next.
    connect_all(&fixture, &["notion", "linear"]);
    let state = fixture.service.state(&user(), &named).await.expect("state");
    assert!(
        state
            .next_step
            .starts_with("Call SetupDiscover(apps: [\"notion\", \"linear\"])")
    );

    // 4. Discover: gathers start with automatic import off and list titles.
    let discovery = fixture
        .service
        .discover(&user(), &named, Duration::from_secs(1))
        .await
        .expect("discover");
    assert_eq!(
        fixture.imports.starts.lock().unwrap().as_slice(),
        &[
            (ImportSource::Notion, "gather"),
            (ImportSource::Linear, "gather")
        ]
    );
    let linear = discovery
        .apps
        .iter()
        .find(|app| app.app == "linear")
        .expect("linear");
    assert_eq!(linear.status, DiscoveryStatus::Ready);
    assert_eq!(linear.candidates.len(), 3);
    assert_eq!(linear.groups[0].label, "ENG");
    assert_eq!(linear.groups[0].count, 2);
    assert!(discovery.next_step.contains("SetupProposePlan"));

    // 5. One plan: all of Notion, two Linear issues, one declined.
    let request = PlanRequest {
        selections: vec![
            Selection {
                app: "notion".to_owned(),
                all: true,
                refs: Vec::new(),
            },
            Selection {
                app: "linear".to_owned(),
                all: false,
                refs: vec![reference(3), reference(4)],
            },
        ],
        declined: vec![reference(5)],
        scope_notes: Some("Eng work only".to_owned()),
        other_apps: apps(&["hubspot"]),
    };
    let plan = fixture
        .service
        .propose_plan(&user(), &request)
        .await
        .expect("plan");
    assert_eq!(plan.will_import, 4);
    assert!(plan.plan_text.contains("_You asked for: Eng work only_"));
    assert!(
        plan.plan_text
            .contains("**Notion**: 2 pages: Eng Roadmap, Onboarding Guide")
    );
    assert!(
        plan.plan_text
            .contains("**Linear**: 2 issues: ENG-12 Fix login, ENG-13 Ship search")
    );
    assert!(
        plan.plan_text
            .contains("**Leave out** (you can still bring these in later): OPS-2 Rotate keys")
    );
    assert!(plan.plan_text.contains("Macro has no HubSpot importer yet"));
    assert!(
        plan.plan_text
            .contains("doesn't share anything, invite anyone")
    );

    // 6. Import needs the approval, and exactly the approved plan.
    let refused = fixture
        .service
        .import(&user(), &request, &plan.plan_id, false)
        .await;
    assert!(
        matches!(refused, Err(SetupError::Actionable(message)) if message.contains("approves the plan"))
    );
    let mismatched = fixture
        .service
        .import(&user(), &request, "plan_other", true)
        .await;
    assert!(matches!(mismatched, Err(SetupError::Actionable(_))));

    let started = fixture
        .service
        .import(&user(), &request, &plan.plan_id, true)
        .await
        .expect("import");
    assert_eq!(started.started, 4);
    let imported_ids = fixture.imports.imports.lock().unwrap()[0].clone();
    assert_eq!(imported_ids.len(), 4);
    assert!(!imported_ids.contains(&linear_issue(5, "", "", ImportStatus::Staged).id));

    // Repeating the same import changes nothing.
    let again = fixture
        .service
        .import(&user(), &request, &plan.plan_id, true)
        .await
        .expect("import again");
    assert_eq!(again.started, 0);
    assert_eq!(again.already_underway, 2);

    // 7. Report: in progress, then done with links.
    let report = fixture
        .service
        .status(&user(), &named, Duration::ZERO)
        .await
        .expect("status");
    assert_eq!(report.status, ReportStatus::InProgress);

    {
        let mut state = fixture.imports.state.lock().unwrap();
        for row in state.entities.iter_mut() {
            if row.status == ImportStatus::Importing {
                row.status = ImportStatus::Imported;
                row.entity_type = Some(match row.source {
                    ImportSource::Notion => "md".to_owned(),
                    _ => "task".to_owned(),
                });
                row.entity_id = Some(format!("e{}", row.foreign_id));
            }
        }
        let failed = state
            .entities
            .iter_mut()
            .find(|row| row.foreign_id == "notion-2")
            .expect("row");
        failed.status = ImportStatus::Staged;
        failed.last_error = Some("fetched object is a Notion database".to_owned());
    }
    let report = fixture
        .service
        .status(
            &user(),
            &apps(&["notion", "linear", "hubspot"]),
            Duration::ZERO,
        )
        .await
        .expect("status");
    assert_eq!(report.status, ReportStatus::Done);
    assert_eq!(report.imported.len(), 3);
    assert!(
        report
            .imported
            .iter()
            .any(|item| item.link.as_deref() == Some("https://macro.com/app/md/enotion-1"))
    );
    assert_eq!(report.not_imported.len(), 1);
    assert_eq!(
        report.not_imported[0].reason.as_deref(),
        Some("fetched object is a Notion database")
    );
    let hubspot = report
        .not_covered
        .iter()
        .find(|item| item.app == "hubspot")
        .expect("hubspot");
    assert_eq!(
        hubspot.alternative.as_ref().map(|handoff| handoff.kind),
        Some(HandoffKind::CsvImport)
    );
    assert!(report.next_step.contains("https://macro.com/app"));
}

#[tokio::test]
async fn results_never_carry_document_content() {
    let fixture = golden();
    connect_all(&fixture, &["notion"]);

    let discovery = fixture
        .service
        .discover(&user(), &apps(&["notion"]), Duration::ZERO)
        .await
        .expect("discover");

    let json = serde_json::to_string(&discovery).expect("serializes");
    assert!(!json.contains("private summary"));
    assert!(json.contains("Eng Roadmap"));
}

#[tokio::test]
async fn a_missing_inbox_is_connected_first_when_the_person_uses_gmail() {
    let fixture = fixture(
        FakeImports::new(Vec::new(), Vec::new(), Vec::new()),
        FakeConnections::with(&[]),
        FakeInbox::default(),
        FakeAccounts::default(),
    );
    let named = apps(&["gmail", "notion"]);

    let state = fixture.service.state(&user(), &named).await.expect("state");
    assert!(
        state
            .missing
            .contains(&"Gmail inbox is not connected".to_owned())
    );
    assert!(
        state
            .next_step
            .contains("SetupConnect(apps: [\"gmail\", \"notion\"])")
    );

    let connect = fixture
        .service
        .connect(&user(), &apps(&["gmail"]))
        .await
        .expect("connect");
    assert_eq!(connect.handoffs[0].kind, HandoffKind::ConnectInbox);
    assert!(
        connect.handoffs[0]
            .url
            .starts_with("https://macro.com/app/connect/gmail?")
    );
}

#[tokio::test]
async fn crms_and_unknown_tools_get_a_clear_answer_instead_of_a_link() {
    let fixture = golden();

    let connect = fixture
        .service
        .connect(&user(), &apps(&["HubSpot", "Asana", "Basecamp Classic"]))
        .await
        .expect("connect");

    let hubspot = connect
        .not_connectable
        .iter()
        .find(|note| note.app == "hubspot")
        .expect("hubspot");
    assert!(hubspot.note.contains("no HubSpot importer"));
    assert!(hubspot.note.contains("https://macro.com/app/companies"));
    // Asana can be connected for agents to use, though nothing is imported.
    assert_eq!(connect.handoffs.len(), 1);
    assert_eq!(connect.handoffs[0].app, "asana");
    let basecamp = connect
        .not_connectable
        .iter()
        .find(|note| note.app == "basecamp_classic")
        .expect("basecamp");
    assert!(basecamp.note.contains("can't import Basecamp Classic"));
}

#[tokio::test]
async fn discovery_asks_for_a_connection_first() {
    let fixture = golden();

    let discovery = fixture
        .service
        .discover(&user(), &apps(&["linear"]), Duration::ZERO)
        .await
        .expect("discover");

    assert_eq!(discovery.apps[0].status, DiscoveryStatus::NotConnected);
    assert!(
        discovery
            .next_step
            .contains("SetupConnect(apps: [\"linear\"])")
    );
    assert!(fixture.imports.starts.lock().unwrap().is_empty());
}

#[tokio::test]
async fn slack_uses_repeatable_discovery_and_names_the_history_handoff() {
    let fixture = golden();
    connect_all(&fixture, &["slack"]);

    fixture
        .service
        .discover(&user(), &apps(&["slack"]), Duration::ZERO)
        .await
        .expect("discover");
    assert_eq!(
        fixture.imports.starts.lock().unwrap().as_slice(),
        &[(ImportSource::Slack, "discovery")]
    );

    let report = fixture
        .service
        .status(&user(), &apps(&["slack"]), Duration::ZERO)
        .await
        .expect("status");
    let slack = &report.not_covered[0];
    assert!(slack.reason.contains("export ZIP"));
    assert_eq!(
        slack
            .alternative
            .as_ref()
            .map(|handoff| handoff.url.as_str()),
        Some("https://macro.com/app/settings/team")
    );
}

#[tokio::test]
async fn a_web_onboarding_run_is_never_retried_or_re_gathered() {
    // An existing user whose web onboarding auto-imported Notion: retrying
    // that run would import again without a plan.
    let fixture = fixture(
        FakeImports::new(
            vec![run(ImportSource::Notion, RunStatus::Completed, true)],
            vec![notion_page(1, "Eng Roadmap", ImportStatus::Imported)],
            discovered(),
        ),
        FakeConnections::with(&["notion"]),
        FakeInbox::default(),
        FakeAccounts::onboarded_on_web(),
    );

    let discovery = fixture
        .service
        .discover(&user(), &apps(&["notion"]), Duration::ZERO)
        .await
        .expect("discover");

    assert!(fixture.imports.starts.lock().unwrap().is_empty());
    assert_eq!(discovery.apps[0].status, DiscoveryStatus::AlreadyImported);
    assert!(
        discovery.apps[0]
            .note
            .as_deref()
            .unwrap_or_default()
            .contains("isn't available yet")
    );
    assert_eq!(
        *fixture.accounts.status.lock().unwrap(),
        AccountStatus {
            agent_led: false,
            onboarded_on_web: true,
        }
    );
}

#[tokio::test]
async fn a_failed_agent_led_discovery_is_retried() {
    let fixture = fixture(
        FakeImports::new(
            vec![run(ImportSource::Linear, RunStatus::Failed, false)],
            Vec::new(),
            discovered(),
        ),
        FakeConnections::with(&["linear"]),
        FakeInbox::default(),
        FakeAccounts::default(),
    );

    let discovery = fixture
        .service
        .discover(&user(), &apps(&["linear"]), Duration::from_secs(1))
        .await
        .expect("discover");

    assert_eq!(
        fixture.imports.starts.lock().unwrap().as_slice(),
        &[(ImportSource::Linear, "retry")]
    );
    assert_eq!(discovery.apps[0].status, DiscoveryStatus::Ready);
}

#[tokio::test]
async fn discovery_answers_within_its_wait_while_macro_is_still_looking() {
    let mut imports = FakeImports::new(Vec::new(), Vec::new(), discovered());
    imports.stay_running = true;
    let fixture = fixture(
        imports,
        FakeConnections::with(&["notion"]),
        FakeInbox::default(),
        FakeAccounts::default(),
    );

    let discovery = fixture
        .service
        .discover(&user(), &apps(&["notion"]), Duration::from_millis(30))
        .await
        .expect("discover");

    assert_eq!(discovery.apps[0].status, DiscoveryStatus::Discovering);
    assert!(
        discovery
            .next_step
            .contains("Call SetupDiscover(apps: [\"notion\"]) again")
    );
}

#[tokio::test]
async fn an_unknown_ref_lists_the_valid_ones() {
    let fixture = golden();
    connect_all(&fixture, &["notion"]);
    fixture
        .service
        .discover(&user(), &apps(&["notion"]), Duration::ZERO)
        .await
        .expect("discover");

    let result = fixture
        .service
        .propose_plan(
            &user(),
            &PlanRequest {
                selections: vec![Selection {
                    app: "notion".to_owned(),
                    all: false,
                    refs: vec!["zzzz".to_owned()],
                }],
                ..PlanRequest::default()
            },
        )
        .await;

    let Err(SetupError::Actionable(message)) = result else {
        panic!("expected an actionable error");
    };
    assert!(message.contains("No Notion candidate has ref \"zzzz\""));
    assert!(message.contains(&reference(1)));
}

#[tokio::test]
async fn a_selection_for_an_app_with_nothing_to_import_is_refused_helpfully() {
    let fixture = golden();

    let result = fixture
        .service
        .propose_plan(
            &user(),
            &PlanRequest {
                selections: vec![Selection {
                    app: "hubspot".to_owned(),
                    all: true,
                    refs: Vec::new(),
                }],
                ..PlanRequest::default()
            },
        )
        .await;

    assert!(
        matches!(result, Err(SetupError::Actionable(message)) if message.contains("other_apps"))
    );
}

#[test]
fn a_setup_id_from_another_account_is_refused() {
    let mine = AgentSetupService::setup_id(&user());
    assert!(AgentSetupService::check_setup_id(&user(), Some(&mine.0)).is_ok());
    assert!(AgentSetupService::check_setup_id(&user(), None).is_ok());

    let other = MacroUserIdStr::try_from("macro|someone@else.example".to_string()).unwrap();
    let theirs = AgentSetupService::setup_id(&other);
    assert!(matches!(
        AgentSetupService::check_setup_id(&user(), Some(&theirs.0)),
        Err(SetupError::Actionable(_))
    ));
}

#[tokio::test]
async fn teammates_rows_are_not_this_persons_setup() {
    let mut teammate_row = notion_page(9, "Teammate Doc", ImportStatus::Imported);
    teammate_row.user_id = "macro|teammate@startup.example".to_owned();
    let fixture = fixture(
        FakeImports::new(Vec::new(), vec![teammate_row], Vec::new()),
        FakeConnections::with(&["notion"]),
        FakeInbox::default(),
        FakeAccounts::default(),
    );

    let report = fixture
        .service
        .status(&user(), &apps(&["notion"]), Duration::ZERO)
        .await
        .expect("status");

    assert_eq!(report.status, ReportStatus::NotStarted);
    assert!(report.imported.is_empty());
}

#[tokio::test]
async fn a_workspace_is_set_up_once_onboarded_on_the_web_or_once_work_came_in() {
    let fresh = golden();
    assert!(!fresh.service.is_set_up(&user()).await.unwrap());

    let web = fixture(
        FakeImports::new(Vec::new(), Vec::new(), Vec::new()),
        FakeConnections::with(&[]),
        FakeInbox::default(),
        FakeAccounts::onboarded_on_web(),
    );
    assert!(web.service.is_set_up(&user()).await.unwrap());

    let imported = fixture(
        FakeImports::new(
            Vec::new(),
            vec![notion_page(1, "Roadmap", ImportStatus::Imported)],
            Vec::new(),
        ),
        FakeConnections::with(&["notion"]),
        FakeInbox::default(),
        FakeAccounts::default(),
    );
    assert!(imported.service.is_set_up(&user()).await.unwrap());
}

#[tokio::test]
async fn tools_macro_cant_import_get_a_plain_no_and_a_pointer_to_what_it_can() {
    let fixture = golden();

    let state = fixture
        .service
        .state(&user(), &apps(&["Asana", "Google Docs"]))
        .await
        .expect("state");

    assert!(
        state
            .next_step
            .starts_with("Macro can't import Asana or Google Docs."),
        "{}",
        state.next_step
    );
    assert!(
        state
            .next_step
            .contains("Don't copy their files or records in yourself.")
    );
    let note = state.apps[0].note.as_deref().unwrap_or_default();
    assert!(note.contains("drag exported files into Macro yourself"));
}
