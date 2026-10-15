//! Which of the person's tools Macro can bring in during setup, and how.
//!
//! The agent names tools the way the person does ("Google Mail", "HubSpot",
//! "slack_v2"). This module turns those names into one canonical app and the
//! one way setup handles it, so every tool result speaks about apps the same
//! way.

#[cfg(test)]
mod test;

use import::domain::models::ImportSource;

/// What setup can do with an app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Support {
    /// The person's email inbox. Connected through their Google account, not
    /// through a connector.
    Inbox,
    /// Macro's import service brings it in: connect, discover, plan, import.
    Import(ImportSource),
    /// A CRM. No importer yet; companies come in from a CSV instead.
    CrmNoImporter,
}

/// An app setup knows by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KnownApp {
    /// Canonical id used in every tool result, e.g. `notion`.
    pub id: &'static str,
    /// Display name, e.g. `Notion`.
    pub name: &'static str,
    /// The Pipedream app slug a connection uses, when it has one.
    pub connect_slug: Option<&'static str>,
    /// How setup handles it.
    pub support: Support,
    aliases: &'static [&'static str],
}

const KNOWN_APPS: &[KnownApp] = &[
    KnownApp {
        id: "gmail",
        name: "Gmail",
        connect_slug: None,
        support: Support::Inbox,
        aliases: &[
            "gmail",
            "google_mail",
            "googlemail",
            "google_workspace",
            "email",
            "google",
        ],
    },
    KnownApp {
        id: "notion",
        name: "Notion",
        connect_slug: Some("notion"),
        support: Support::Import(ImportSource::Notion),
        aliases: &["notion"],
    },
    KnownApp {
        id: "linear",
        name: "Linear",
        connect_slug: Some("linear"),
        support: Support::Import(ImportSource::Linear),
        aliases: &["linear", "linear_app"],
    },
    KnownApp {
        id: "slack",
        name: "Slack",
        connect_slug: Some("slack_v2"),
        support: Support::Import(ImportSource::Slack),
        aliases: &["slack", "slack_v2"],
    },
    KnownApp {
        id: "hubspot",
        name: "HubSpot",
        connect_slug: Some("hubspot"),
        support: Support::CrmNoImporter,
        aliases: &["hubspot", "hub_spot"],
    },
    KnownApp {
        id: "salesforce",
        name: "Salesforce",
        connect_slug: Some("salesforce_rest_api"),
        support: Support::CrmNoImporter,
        aliases: &["salesforce", "salesforce_rest_api", "sfdc"],
    },
    KnownApp {
        id: "pipedrive",
        name: "Pipedrive",
        connect_slug: Some("pipedrive"),
        support: Support::CrmNoImporter,
        aliases: &["pipedrive"],
    },
    KnownApp {
        id: "attio",
        name: "Attio",
        connect_slug: Some("attio"),
        support: Support::CrmNoImporter,
        aliases: &["attio"],
    },
    KnownApp {
        id: "close",
        name: "Close",
        connect_slug: Some("close"),
        support: Support::CrmNoImporter,
        aliases: &["close", "close_crm", "close_io"],
    },
    KnownApp {
        id: "zoho_crm",
        name: "Zoho CRM",
        connect_slug: Some("zoho_crm"),
        support: Support::CrmNoImporter,
        aliases: &["zoho_crm", "zoho"],
    },
    KnownApp {
        id: "copper",
        name: "Copper",
        connect_slug: Some("copper"),
        support: Support::CrmNoImporter,
        aliases: &["copper", "copper_crm"],
    },
];

/// An app the person named, resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum App {
    /// One setup knows.
    Known(KnownApp),
    /// Anything else, as a normalized slug (`google_docs`). Setup cannot
    /// import it; whether it can at least be connected depends on the
    /// connector directory.
    Other(String),
}

impl App {
    /// The canonical id used in tool results.
    pub fn id(&self) -> &str {
        match self {
            Self::Known(app) => app.id,
            Self::Other(slug) => slug,
        }
    }

    /// A display name.
    pub fn name(&self) -> String {
        match self {
            Self::Known(app) => app.name.to_owned(),
            Self::Other(slug) => display_name(slug),
        }
    }

    /// The import source behind the app, when Macro can import it.
    pub fn import_source(&self) -> Option<ImportSource> {
        match self {
            Self::Known(KnownApp {
                support: Support::Import(source),
                ..
            }) => Some(*source),
            _ => None,
        }
    }
}

/// `Google Docs`, `google-docs` and `google_docs` all become `google_docs`.
pub fn normalize(name: &str) -> String {
    let mut slug = String::with_capacity(name.len());
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if !slug.ends_with('_') && !slug.is_empty() {
            slug.push('_');
        }
    }
    slug.trim_end_matches('_').to_owned()
}

fn display_name(slug: &str) -> String {
    slug.split('_')
        .filter(|word| !word.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(|first| first.to_ascii_uppercase().to_string() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Resolves a name the person or agent used. Empty names resolve to nothing.
pub fn resolve(name: &str) -> Option<App> {
    let slug = normalize(name);
    if slug.is_empty() {
        return None;
    }
    let known = KNOWN_APPS
        .iter()
        .find(|app| app.aliases.contains(&slug.as_str()));
    Some(match known {
        Some(app) => App::Known(*app),
        None => App::Other(slug),
    })
}

/// The app an import source belongs to.
pub fn for_source(source: ImportSource) -> KnownApp {
    *KNOWN_APPS
        .iter()
        .find(|app| app.support == Support::Import(source))
        .expect("every import source has a known app")
}

/// The Gmail app.
pub fn gmail() -> KnownApp {
    KNOWN_APPS[0]
}

/// Resolves a list of names, dropping blanks and duplicates while keeping the
/// order the agent gave.
pub fn resolve_all(names: &[String]) -> Vec<App> {
    let mut apps: Vec<App> = Vec::new();
    for app in names.iter().filter_map(|name| resolve(name)) {
        if !apps.iter().any(|seen| seen.id() == app.id()) {
            apps.push(app);
        }
    }
    apps
}
