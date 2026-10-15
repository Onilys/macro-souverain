use import::domain::models::{ImportState, ImportStatus};

use super::*;
use crate::domain::models::Selection;
use crate::test_support::{notion_page, user};

fn request(refs: &[&str], all: bool, declined: &[&str]) -> PlanRequest {
    PlanRequest {
        selections: vec![Selection {
            app: "Notion".to_owned(),
            all,
            refs: refs.iter().map(|r| (*r).to_owned()).collect(),
        }],
        declined: declined.iter().map(|r| (*r).to_owned()).collect(),
        ..PlanRequest::default()
    }
}

#[test]
fn the_plan_id_depends_on_what_was_chosen_not_how_it_was_written() {
    let a = plan_id(&user(), &request(&["b", "a"], false, &[]));
    let b = plan_id(&user(), &request(&["A", "b", "a"], false, &[]));
    let c = plan_id(&user(), &request(&["a"], false, &[]));
    assert_eq!(a, b);
    assert_ne!(a, c);
    assert!(a.starts_with("plan_"));
}

#[test]
fn the_plan_id_is_per_person() {
    let other = MacroUserIdStr::try_from("macro|other@example.com".to_string()).unwrap();
    assert_ne!(
        plan_id(&user(), &request(&[], true, &[])),
        plan_id(&other, &request(&[], true, &[]))
    );
}

#[test]
fn all_brings_every_staged_candidate_except_declined_ones() {
    let state = ImportState {
        runs: Vec::new(),
        entities: vec![
            notion_page(1, "Keep", ImportStatus::Staged),
            notion_page(2, "Declined", ImportStatus::Staged),
            notion_page(3, "Already in", ImportStatus::Imported),
        ],
    };
    let view = SourceView::of(&state, &user(), ImportSource::Notion);
    let declined = view::reference(&notion_page(2, "", ImportStatus::Staged));

    let resolved = resolve_selection(
        &view,
        &Selection {
            app: "notion".to_owned(),
            all: true,
            refs: Vec::new(),
        },
        &[declined],
    )
    .expect("resolves");

    assert_eq!(resolved.to_import.len(), 1);
    assert_eq!(view::title(resolved.to_import[0]), "Keep");
    assert_eq!(resolved.declined.len(), 1);
}

#[test]
fn the_plan_text_caps_long_lists() {
    let rows: Vec<_> = (1..=15u128)
        .map(|n| notion_page(n, &format!("Page {n:02}"), ImportStatus::Staged))
        .collect();
    let refs: Vec<&import::domain::models::ImportEntity> = rows.iter().collect();
    let app = ResolvedApp {
        source: ImportSource::Notion,
        to_import: refs,
        underway: Vec::new(),
        declined: Vec::new(),
    };

    let text = render(&PlanText {
        apps: &[app],
        scope_notes: None,
        not_covered: &[],
        inbox: &[],
    });

    assert!(text.contains("15 pages"));
    assert!(text.contains("and 3 more"));
}

#[test]
fn not_covered_explains_crm_slack_history_and_unknown_tools() {
    let base = "https://macro.com";
    let crm = not_covered(&catalog::resolve("hubspot").unwrap(), base).unwrap();
    assert!(crm.text.contains("CSV"));
    let slack = not_covered(&catalog::resolve("slack").unwrap(), base).unwrap();
    assert!(slack.text.contains("export ZIP"));
    let other = not_covered(&catalog::resolve("Trello").unwrap(), base).unwrap();
    assert!(other.text.contains("can't import Trello"));
    assert!(not_covered(&catalog::resolve("notion").unwrap(), base).is_none());
    assert!(not_covered(&catalog::resolve("gmail").unwrap(), base).is_none());
}
