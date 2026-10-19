use std::sync::{Arc, Mutex};

use agent_runtime_protocol::domain::action::{AgentAction, AgentActionId};
use agent_session::domain::error::AgentSessionError;
use agent_session::domain::model::AgentSessionId;
use agent_session::domain::ports::{AcceptedControl, ControlDisposition, ControlEvent};
use macro_user_id::user_id::MacroUserIdStr;

use super::*;

struct FixedStanding(SessionStanding);

impl SessionStandings for FixedStanding {
    async fn standing(
        &self,
        _session_id: AgentSessionId,
    ) -> Result<SessionStanding, AgentSessionError> {
        Ok(self.0.clone())
    }
}

/// Connections as `(user, slug, display name)`.
struct Connections(Vec<(&'static str, &'static str, &'static str)>);

#[derive(Debug, thiserror::Error)]
#[error("unreachable")]
struct NeverFails;

impl ConnectedApps for Connections {
    type Err = NeverFails;

    async fn connected_app_name(
        &self,
        user: &MacroUserIdStr<'static>,
        app_slug: &str,
    ) -> Result<Option<String>, NeverFails> {
        Ok(self
            .0
            .iter()
            .find(|(owner, slug, _)| *owner == user.as_ref() && *slug == app_slug)
            .map(|(_, _, name)| (*name).to_owned()))
    }
}

#[derive(Default)]
struct RecordedControls(Mutex<Vec<(AgentSessionId, ControlEvent)>>);

impl SessionControls for RecordedControls {
    async fn control_event(
        &self,
        session_id: AgentSessionId,
        event: ControlEvent,
    ) -> Result<AcceptedControl, AgentSessionError> {
        let action_id = event.action_id.unwrap_or_else(AgentActionId::mint);
        self.0.lock().unwrap().push((session_id, event));
        Ok(AcceptedControl {
            action_id,
            disposition: ControlDisposition::Sent,
        })
    }
}

fn user(email: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from_email(email).expect("a valid user id")
}

#[tokio::test]
async fn the_owner_connecting_notion_continues_the_session_on_a_hidden_prompt() {
    let session_id = AgentSessionId::new();
    let action_id = AgentActionId::mint();
    let controls = Arc::new(RecordedControls::default());
    let service = AppConnectedContinuation::new(
        Arc::new(FixedStanding(SessionStanding {
            owner: Some(user("owner@example.com")),
            archived: false,
        })),
        Arc::new(Connections(vec![(
            "macro|owner@example.com",
            "notion",
            "Notion",
        )])),
        Arc::clone(&controls),
    );

    let accepted = service
        .continue_session(
            session_id,
            &user("owner@example.com"),
            "notion",
            Some(action_id),
        )
        .await
        .unwrap();

    assert_eq!(accepted.action_id, action_id);
    let sent = controls.0.lock().unwrap();
    assert_eq!(sent.len(), 1);
    let (sent_to, event) = &sent[0];
    assert_eq!(*sent_to, session_id);
    assert_eq!(event.actor, Some(user("owner@example.com")));
    assert_eq!(event.action_id, Some(action_id));
    assert!(event.context.is_none());
    let AgentAction::Prompt(prompt) = &event.action else {
        panic!("expected a prompt, got {:?}", event.action);
    };
    assert_eq!(prompt.prompt, "", "the transcript shows nothing typed");
    assert_eq!(
        prompt.private_context.as_deref(),
        Some(
            "The user just connected Notion. Its tools are available from this turn on. \
             Continue the user's previous request with them; do not ask them to connect \
             Notion again."
        )
    );
}

#[tokio::test]
async fn someone_other_than_the_owner_cannot_continue_the_session() {
    let controls = Arc::new(RecordedControls::default());
    let service = AppConnectedContinuation::new(
        Arc::new(FixedStanding(SessionStanding {
            owner: Some(user("owner@example.com")),
            archived: false,
        })),
        Arc::new(Connections(vec![(
            "macro|editor@example.com",
            "notion",
            "Notion",
        )])),
        Arc::clone(&controls),
    );

    let result = service
        .continue_session(
            AgentSessionId::new(),
            &user("editor@example.com"),
            "notion",
            None,
        )
        .await;

    assert!(matches!(result, Err(AppConnectedError::NotOwner)));
    assert!(controls.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn an_app_the_owner_has_not_connected_sends_nothing() {
    let controls = Arc::new(RecordedControls::default());
    let service = AppConnectedContinuation::new(
        Arc::new(FixedStanding(SessionStanding {
            owner: Some(user("owner@example.com")),
            archived: false,
        })),
        Arc::new(Connections(vec![])),
        Arc::clone(&controls),
    );

    let result = service
        .continue_session(
            AgentSessionId::new(),
            &user("owner@example.com"),
            "notion",
            None,
        )
        .await;

    assert!(matches!(result, Err(AppConnectedError::NotConnected(slug)) if slug == "notion"));
    assert!(controls.0.lock().unwrap().is_empty());
}

#[tokio::test]
async fn an_archived_session_is_not_continued() {
    let controls = Arc::new(RecordedControls::default());
    let service = AppConnectedContinuation::new(
        Arc::new(FixedStanding(SessionStanding {
            owner: Some(user("owner@example.com")),
            archived: true,
        })),
        Arc::new(Connections(vec![(
            "macro|owner@example.com",
            "notion",
            "Notion",
        )])),
        Arc::clone(&controls),
    );

    let result = service
        .continue_session(
            AgentSessionId::new(),
            &user("owner@example.com"),
            "notion",
            None,
        )
        .await;

    assert!(matches!(result, Err(AppConnectedError::Archived)));
    assert!(controls.0.lock().unwrap().is_empty());
}
