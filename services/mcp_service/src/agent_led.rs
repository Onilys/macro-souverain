//! Handing an account's setup to the person's own AI agent.
//!
//! An account the agent sets up skips the web onboarding flow (decision:
//! agent-led accounts go straight to a "here's what your agent built" first
//! visit). Two things make that so: the onboarding row is marked agent-led and
//! completed, so nothing auto-imports behind the plan the agent agrees with
//! the person, and the account's tutorial is completed, so the web app stops
//! forcing `/onboarding`.
//!
//! Only accounts that never finished web onboarding qualify. Someone who
//! already onboarded on the web and later adds Macro to their agent keeps
//! their account exactly as it was.

#[cfg(test)]
mod test;

use std::{sync::Arc, time::Duration};

use macro_user_id::user_id::{MacroUserId, MacroUserIdStr};
use onboarding::domain::service::OnboardingService;
use sqlx::PgPool;

/// How long to wait for the account row a brand-new sign-in creates. The
/// identity provider's user-created webhook writes it, and a sign-in can
/// complete before that lands.
const ACCOUNT_ROW_RETRY_DELAYS: [Duration; 4] = [
    Duration::from_millis(250),
    Duration::from_millis(500),
    Duration::from_secs(1),
    Duration::from_secs(2),
];

/// The legacy account record's onboarding bit (`"User"."tutorialComplete"`),
/// which the web app reads to decide whether to force `/onboarding`.
pub trait AccountDirectory: Send + Sync + 'static {
    /// Whether the account finished the web tutorial. `None` when the account
    /// row does not exist (yet).
    fn tutorial_complete(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> impl Future<Output = anyhow::Result<Option<bool>>> + Send;

    /// Marks the web tutorial done so the web app stops forcing onboarding.
    fn complete_tutorial(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> impl Future<Output = anyhow::Result<()>> + Send;
}

/// [`AccountDirectory`] on MacroDB, through the queries that own the table.
#[derive(Clone)]
pub struct PgAccountDirectory {
    db: PgPool,
}

impl PgAccountDirectory {
    /// A directory on the MacroDB pool.
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }
}

impl AccountDirectory for PgAccountDirectory {
    async fn tutorial_complete(
        &self,
        user: &MacroUserIdStr<'static>,
    ) -> anyhow::Result<Option<bool>> {
        let user_id = MacroUserId::parse_from_str(user.as_ref())?.lowercase();
        match macro_db_client::user::get::get_legacy_user_info(&self.db, &user_id).await {
            Ok(info) => Ok(Some(info.tutorial_complete)),
            Err(error) if is_row_not_found(&error) => Ok(None),
            Err(error) => Err(error),
        }
    }

    async fn complete_tutorial(&self, user: &MacroUserIdStr<'static>) -> anyhow::Result<()> {
        let user_id = MacroUserId::parse_from_str(user.as_ref())?.lowercase();
        macro_db_client::user::patch::patch_user_tutorial(&self.db, &user_id, true).await
    }
}

fn is_row_not_found(error: &anyhow::Error) -> bool {
    matches!(
        error.downcast_ref::<sqlx::Error>(),
        Some(sqlx::Error::RowNotFound)
    )
}

/// What handing an account to the agent did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Handover {
    /// The account is agent-led (newly, or it already was).
    AgentLed,
    /// The account finished web onboarding; nothing changed.
    WebOnboarded,
}

/// Marks accounts agent-led. Shared by the sign-in hook and the setup tools,
/// which also reach accounts that signed in some other way.
pub struct AgentHandover<O, A> {
    onboarding: Arc<O>,
    accounts: A,
    retry_delays: &'static [Duration],
}

impl<O, A: Clone> Clone for AgentHandover<O, A> {
    fn clone(&self) -> Self {
        Self {
            onboarding: Arc::clone(&self.onboarding),
            accounts: self.accounts.clone(),
            retry_delays: self.retry_delays,
        }
    }
}

impl<O: OnboardingService, A: AccountDirectory> AgentHandover<O, A> {
    /// A handover over the onboarding service and the account directory.
    pub fn new(onboarding: Arc<O>, accounts: A) -> Self {
        Self {
            onboarding,
            accounts,
            retry_delays: &ACCOUNT_ROW_RETRY_DELAYS,
        }
    }

    #[cfg(test)]
    fn without_retry_delays(mut self) -> Self {
        self.retry_delays = &[];
        self
    }

    async fn tutorial_complete(&self, user: &MacroUserIdStr<'static>) -> anyhow::Result<bool> {
        for delay in self.retry_delays {
            if let Some(done) = self.accounts.tutorial_complete(user).await? {
                return Ok(done);
            }
            tokio::time::sleep(*delay).await;
        }
        self.accounts
            .tutorial_complete(user)
            .await?
            .ok_or_else(|| anyhow::anyhow!("account row for the signed-in user does not exist"))
    }

    /// Hands the account's setup to the agent `client`, if it never finished
    /// web onboarding. Idempotent.
    #[tracing::instrument(skip(self, user), err)]
    pub async fn hand_over(
        &self,
        user: &MacroUserIdStr<'static>,
        client: Option<&str>,
    ) -> anyhow::Result<Handover> {
        if let Some(row) = self.onboarding.row(user.clone()).await? {
            if row.is_agent_led() {
                return Ok(Handover::AgentLed);
            }
        }
        if self.tutorial_complete(user).await? {
            return Ok(Handover::WebOnboarded);
        }
        let marked = self
            .onboarding
            .mark_agent_led(user.clone(), client.map(str::to_owned))
            .await?;
        if marked.is_none() {
            return Ok(Handover::WebOnboarded);
        }
        self.accounts.complete_tutorial(user).await?;
        Ok(Handover::AgentLed)
    }
}
