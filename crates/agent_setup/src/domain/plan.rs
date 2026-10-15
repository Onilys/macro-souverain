//! The one plan the person approves: what comes in, what is left out, and
//! what setup does not cover — rendered so the agent can show it as written.

#[cfg(test)]
mod test;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use import::domain::models::{ImportEntity, ImportSource, ImportStatus};
use macro_user_id::user_id::MacroUserIdStr;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::{
    catalog::{self, App, Support},
    models::{PlanRequest, Selection},
    ports::{Result, SetupError},
    view::{self, SourceView},
};

/// How many titles a plan lists per app before summarizing the rest.
const TITLES_SHOWN: usize = 12;

/// What one app's selection resolved to.
#[derive(Debug, Clone)]
pub struct ResolvedApp<'a> {
    /// The source.
    pub source: ImportSource,
    /// Staged rows to copy in now.
    pub to_import: Vec<&'a ImportEntity>,
    /// Selected rows already copying in or already in Macro.
    pub underway: Vec<&'a ImportEntity>,
    /// Staged rows the person declined.
    pub declined: Vec<&'a ImportEntity>,
}

impl ResolvedApp<'_> {
    /// Ids to hand to the import service.
    pub fn import_ids(&self) -> impl Iterator<Item = Uuid> + '_ {
        self.to_import.iter().map(|row| row.id)
    }
}

/// The plan's id: a digest of who asked for what. The same request always
/// gets the same id, so approving and importing can be retried safely.
pub fn plan_id(user: &MacroUserIdStr<'static>, request: &PlanRequest) -> String {
    let mut selections: Vec<String> = request
        .selections
        .iter()
        .map(|selection| {
            let app = catalog::resolve(&selection.app)
                .map(|app| app.id().to_owned())
                .unwrap_or_default();
            let mut refs: Vec<String> = selection
                .refs
                .iter()
                .map(|r| r.trim().to_lowercase())
                .collect();
            refs.sort();
            refs.dedup();
            format!("{app}:{}:{}", selection.all, refs.join(","))
        })
        .collect();
    selections.sort();
    let mut declined: Vec<String> = request
        .declined
        .iter()
        .map(|r| r.trim().to_lowercase())
        .collect();
    declined.sort();
    declined.dedup();

    let mut hasher = Sha256::new();
    hasher.update(user.as_ref().as_bytes());
    hasher.update(b"\n");
    hasher.update(selections.join(";").as_bytes());
    hasher.update(b"\n");
    hasher.update(declined.join(",").as_bytes());
    let digest = URL_SAFE_NO_PAD.encode(hasher.finalize());
    format!("plan_{}", &digest[..12])
}

fn matches_ref(row: &ImportEntity, reference: &str) -> bool {
    let reference = reference.trim().to_lowercase();
    !reference.is_empty() && row.id.simple().to_string().starts_with(&reference)
}

/// Resolves one selection against the source's rows.
pub fn resolve_selection<'a>(
    view: &SourceView<'a>,
    selection: &Selection,
    declined: &[String],
) -> Result<ResolvedApp<'a>> {
    let app_name = catalog::for_source(view.source).name;
    let is_declined = |row: &ImportEntity| declined.iter().any(|r| matches_ref(row, r));

    let mut resolved = ResolvedApp {
        source: view.source,
        to_import: Vec::new(),
        underway: Vec::new(),
        declined: view
            .staged()
            .copied()
            .filter(|row| is_declined(row))
            .collect(),
    };

    if selection.all {
        resolved.to_import = view
            .staged()
            .copied()
            .filter(|row| !is_declined(row))
            .collect();
        return Ok(resolved);
    }

    for reference in &selection.refs {
        let matches: Vec<&ImportEntity> = view
            .rows
            .iter()
            .copied()
            .filter(|row| row.status != ImportStatus::Discarded && matches_ref(row, reference))
            .collect();
        let row = match matches.as_slice() {
            [row] => *row,
            [] => {
                let valid: Vec<String> = view.staged().map(|row| view::reference(row)).collect();
                return Err(SetupError::Actionable(format!(
                    "No {app_name} candidate has ref \"{reference}\". Use the refs SetupDiscover \
                     returned for {app_name}: {}.",
                    if valid.is_empty() {
                        "there are none waiting".to_owned()
                    } else {
                        valid.join(", ")
                    }
                )));
            }
            _ => {
                return Err(SetupError::Actionable(format!(
                    "The ref \"{reference}\" matches more than one {app_name} candidate. Use the full \
                     ref SetupDiscover returned."
                )));
            }
        };
        if is_declined(row) {
            continue;
        }
        match row.status {
            ImportStatus::Staged => resolved.to_import.push(row),
            ImportStatus::Importing | ImportStatus::Imported => resolved.underway.push(row),
            ImportStatus::Discarded => {}
        }
    }
    resolved.to_import.dedup_by_key(|row| row.id);
    Ok(resolved)
}

/// The import app a selection names, or an error the agent can act on.
pub fn selection_source(selection: &Selection) -> Result<ImportSource> {
    let app = catalog::resolve(&selection.app).ok_or_else(|| {
        SetupError::Actionable(
            "A selection is missing its app. Name the app, e.g. \"notion\".".to_owned(),
        )
    })?;
    app.import_source().ok_or_else(|| {
        SetupError::Actionable(format!(
            "{} has nothing to import, so it cannot be part of the import selections. Mention it \
             under other_apps instead and the plan will say what happens with it.",
            app.name()
        ))
    })
}

fn list_titles(rows: &[&ImportEntity]) -> String {
    let mut titles: Vec<String> = rows.iter().map(|row| view::title(row)).collect();
    titles.sort();
    let shown = titles
        .iter()
        .take(TITLES_SHOWN)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    match titles.len().saturating_sub(TITLES_SHOWN) {
        0 => shown,
        more => format!("{shown} and {more} more"),
    }
}

fn noun(source: ImportSource, count: usize) -> &'static str {
    match (source, count) {
        (ImportSource::Notion, 1) => "page",
        (ImportSource::Notion, _) => "pages",
        (ImportSource::Linear, 1) => "issue",
        (ImportSource::Linear, _) => "issues",
        (ImportSource::Slack, 1) => "channel",
        (ImportSource::Slack, _) => "channels",
    }
}

/// A line for something setup does not bring over.
#[derive(Debug, Clone)]
pub struct NotCoveredLine {
    /// Display name.
    pub name: String,
    /// What happens with it, including any link.
    pub text: String,
}

/// Everything the plan text needs.
pub struct PlanText<'a> {
    /// What comes in, per app.
    pub apps: &'a [ResolvedApp<'a>],
    /// What the person asked for, in their words.
    pub scope_notes: Option<&'a str>,
    /// What setup does not bring over.
    pub not_covered: &'a [NotCoveredLine],
    /// Connected inbox addresses.
    pub inbox: &'a [String],
}

/// Renders the plan for the person.
pub fn render(plan: &PlanText<'_>) -> String {
    let mut text = String::from("**Your Macro setup plan**\n");
    if let Some(notes) = plan
        .scope_notes
        .map(str::trim)
        .filter(|notes| !notes.is_empty())
    {
        text.push_str(&format!("_You asked for: {notes}_\n"));
    }

    text.push_str("\n**Bring into Macro**\n");
    let mut any = false;
    for app in plan.apps {
        let name = catalog::for_source(app.source).name;
        if !app.to_import.is_empty() {
            any = true;
            text.push_str(&format!(
                "- **{name}**: {} {}: {}\n",
                app.to_import.len(),
                noun(app.source, app.to_import.len()),
                list_titles(&app.to_import)
            ));
        }
        if !app.underway.is_empty() {
            text.push_str(&format!(
                "- **{name}**: {} already in Macro or on the way\n",
                app.underway.len()
            ));
        }
    }
    if !any {
        text.push_str("- Nothing new\n");
    }
    if !plan.inbox.is_empty() {
        text.push_str(&format!(
            "- **Gmail**: your inbox ({}) is already connected\n",
            plan.inbox.join(", ")
        ));
    }

    let declined: Vec<&ImportEntity> = plan
        .apps
        .iter()
        .flat_map(|app| app.declined.iter().copied())
        .collect();
    if !declined.is_empty() {
        text.push_str(&format!(
            "\n**Leave out** (you can still bring these in later): {}\n",
            list_titles(&declined)
        ));
    }

    if !plan.not_covered.is_empty() {
        text.push_str("\n**Not brought in by setup**\n");
        for line in plan.not_covered {
            text.push_str(&format!("- **{}**: {}\n", line.name, line.text));
        }
    }

    text.push_str(
        "\nEverything stays private to you. Setup doesn't share anything, invite anyone, send \
         email or change billing.\n",
    );
    text
}

/// What setup says about an app it does not import, with a link when there
/// is one. `None` for apps setup covers fully.
pub fn not_covered(app: &App, base_url: &str) -> Option<NotCoveredLine> {
    let name = app.name();
    let text = match app {
        App::Known(known) => match known.support {
            Support::Inbox => return None,
            Support::Import(ImportSource::Slack) => format!(
                "channels come in through the connection; message history needs a workspace admin \
                 to upload Slack's export ZIP at {base_url}/app/settings/team"
            ),
            Support::Import(_) => return None,
            Support::CrmNoImporter => format!(
                "Macro has no {name} importer yet. Turn on CRM in Settings, then import companies \
                 from a CSV with name and domain columns at {base_url}/app/companies"
            ),
        },
        App::Other(_) => format!(
            "Macro can't import {name} yet. You can drag exported files into Macro yourself, or \
             keep using {name} alongside it"
        ),
    };
    Some(NotCoveredLine { name, text })
}
