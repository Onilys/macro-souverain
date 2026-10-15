use super::*;

#[test]
fn names_resolve_to_one_canonical_app() {
    for name in ["Notion", "notion", " NOTION "] {
        assert_eq!(
            resolve(name).map(|app| app.id().to_owned()).as_deref(),
            Some("notion")
        );
    }
    for name in ["Gmail", "Google Mail", "google-workspace"] {
        assert_eq!(
            resolve(name).map(|app| app.id().to_owned()).as_deref(),
            Some("gmail")
        );
    }
    assert_eq!(
        resolve("slack_v2")
            .map(|app| app.id().to_owned())
            .as_deref(),
        Some("slack")
    );
    assert_eq!(
        resolve("HubSpot").map(|app| app.id().to_owned()).as_deref(),
        Some("hubspot")
    );
}

#[test]
fn unknown_tools_keep_a_normalized_slug_and_a_readable_name() {
    let app = resolve("Google Docs").expect("resolves");
    assert_eq!(app, App::Other("google_docs".to_owned()));
    assert_eq!(app.name(), "Google Docs");
    assert_eq!(app.import_source(), None);
}

#[test]
fn only_import_apps_have_an_import_source() {
    assert_eq!(
        resolve("linear").and_then(|app| app.import_source()),
        Some(ImportSource::Linear)
    );
    assert_eq!(resolve("gmail").and_then(|app| app.import_source()), None);
    assert_eq!(resolve("hubspot").and_then(|app| app.import_source()), None);
}

#[test]
fn every_import_source_maps_back_to_its_app() {
    for source in ImportSource::all() {
        assert_eq!(for_source(source).support, Support::Import(source));
    }
}

#[test]
fn resolving_a_list_drops_blanks_and_duplicates() {
    let apps = resolve_all(&[
        "Notion".to_owned(),
        "".to_owned(),
        "notion".to_owned(),
        "Linear".to_owned(),
    ]);
    let ids: Vec<&str> = apps.iter().map(App::id).collect();
    assert_eq!(ids, ["notion", "linear"]);
}

#[test]
fn normalize_collapses_separators() {
    assert_eq!(normalize("  Zoho -- CRM "), "zoho_crm");
    assert_eq!(normalize("!!!"), "");
}
