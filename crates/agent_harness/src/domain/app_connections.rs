//! Picking a session back up once its owner connects the app it was waiting on.
//!
//! An agent that needs an app the owner has not connected asks for it with a
//! connect chip. When the owner finishes connecting, the session continues on
//! a prompt the harness writes as private context: the agent is told the app
//! is there, and the transcript shows no message the owner did not type.

use std::future::Future;
use std::sync::Arc;

use agent_runtime_protocol::domain::action::{AgentAction, AgentActionId};
use agent_session::domain::error::AgentSessionError;
use agent_session::domain::model::AgentSessionId;
use agent_session::domain::ports::{
    AcceptedControl, AgentSessionNotificationRecipient, AgentSessionRepo, ControlEvent,
};
use macro_user_id::user_id::MacroUserIdStr;

#[cfg(test)]
mod test;

/// Who owns a session, and whether it can still take a turn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionStanding {
    /// The owning user; `None` for a session a bot or team owns.
    pub owner: Option<MacroUserIdStr<'static>>,
    /// Archived sessions take no new turns.
    pub archived: bool,
}

/// Reads a session's [`SessionStanding`].
pub trait SessionStandings: Send + Sync + 'static {
    /// The standing of `session_id`.
    fn standing(
        &self,
        session_id: AgentSessionId,
    ) -> impl Future<Output = Result<SessionStanding, AgentSessionError>> + Send;
}

impl<Repo: AgentSessionRepo> SessionStandings for Repo {
    async fn standing(
        &self,
        session_id: AgentSessionId,
    ) -> Result<SessionStanding, AgentSessionError> {
        let session = self.get(session_id).await?;
        Ok(SessionStanding {
            owner: session.owner_user().ok().cloned(),
            archived: session.is_archived,
        })
    }
}

/// Starts or queues a turn in a session.
pub trait SessionControls: Send + Sync + 'static {
    /// Deliver `event` to `session_id`, queueing it behind a running turn.
    fn control_event(
        &self,
        session_id: AgentSessionId,
        event: ControlEvent,
    ) -> impl Future<Output = Result<AcceptedControl, AgentSessionError>> + Send;
}

impl<Recipient: AgentSessionNotificationRecipient> SessionControls for Recipient {
    fn control_event(
        &self,
        session_id: AgentSessionId,
        event: ControlEvent,
    ) -> impl Future<Output = Result<AcceptedControl, AgentSessionError>> + Send {
        AgentSessionNotificationRecipient::control_event(self, session_id, event)
    }
}

/// The apps a user has connected.
pub trait ConnectedApps: Send + Sync + 'static {
    /// Error reading the user's connections.
    type Err: std::error::Error + Send + Sync + 'static;

    /// The display name of `app_slug` when `user` has it connected and
    /// enabled for tool use.
    fn connected_app_name(
        &self,
        user: &MacroUserIdStr<'static>,
        app_slug: &str,
    ) -> impl Future<Output = Result<Option<String>, Self::Err>> + Send;
}

/// Why a session could not be continued after a connection.
#[derive(Debug, thiserror::Error)]
pub enum AppConnectedError {
    /// Only the owner's connections reach the session's tools, so only the
    /// owner may say one was made.
    #[error("only the session's owner can continue it after connecting an app")]
    NotOwner,
    /// The session is archived.
    #[error("the session is archived")]
    Archived,
    /// The owner has no enabled connection to the app.
    #[error("{0} is not connected")]
    NotConnected(String),
    /// Reading or prompting the session failed.
    #[error(transparent)]
    Session(#[from] AgentSessionError),
    /// The owner's connections could not be read.
    #[error("could not read the owner's connections")]
    Internal(rootcause::Report),
}

/// The private context the agent continues on once `app_name` is connected.
#[must_use]
pub fn continuation_context(app_name: &str) -> String {
    format!(
        "The user just connected {app_name}. Its tools are available from this turn on. \
         Continue the user's previous request with them; do not ask them to connect \
         {app_name} again."
    )
}

/// Continues a session on a hidden prompt once its owner connects an app.
pub struct AppConnectedContinuation<Sessions, Apps, Controls> {
    sessions: Arc<Sessions>,
    apps: Arc<Apps>,
    controls: Arc<Controls>,
}

impl<Sessions, Apps, Controls> AppConnectedContinuation<Sessions, Apps, Controls>
where
    Sessions: SessionStandings,
    Apps: ConnectedApps,
    Controls: SessionControls,
{
    /// Build the service.
    pub fn new(sessions: Arc<Sessions>, apps: Arc<Apps>, controls: Arc<Controls>) -> Self {
        Self {
            sessions,
            apps,
            controls,
        }
    }

    /// Continue `session_id` now that `user` has connected `app_slug`.
    ///
    /// The turn starts at once when the session is idle and queues behind a
    /// running one otherwise. `action_id` makes a retried request report the
    /// first one's fate rather than prompt twice.
    #[tracing::instrument(skip(self), fields(%session_id, %app_slug), err)]
    pub async fn continue_session(
        &self,
        session_id: AgentSessionId,
        user: &MacroUserIdStr<'static>,
        app_slug: &str,
        action_id: Option<AgentActionId>,
    ) -> Result<AcceptedControl, AppConnectedError> {
        let standing = self.sessions.standing(session_id).await?;
        if standing.owner.as_ref() != Some(user) {
            return Err(AppConnectedError::NotOwner);
        }
        if standing.archived {
            return Err(AppConnectedError::Archived);
        }
        let app_name = self
            .apps
            .connected_app_name(user, app_slug)
            .await
            .map_err(|error| {
                AppConnectedError::Internal(rootcause::Report::new(error).into_dynamic())
            })?
            .ok_or_else(|| AppConnectedError::NotConnected(app_slug.to_owned()))?;
        let accepted = self
            .controls
            .control_event(
                session_id,
                ControlEvent {
                    action: AgentAction::context_prompt(continuation_context(&app_name)),
                    action_id,
                    actor: Some(user.clone()),
                    context: None,
                },
            )
            .await?;
        Ok(accepted)
    }
}
