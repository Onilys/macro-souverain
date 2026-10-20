//! Owner-authored preferences shared by every agent runtime.

use std::future::Future;

use macro_user_id::user_id::MacroUserIdStr;
use trigger_context::TriggerContext;

use super::error::Result;
use super::model::PromptPeople;
use super::ports::AgentPromptComposer;

/// Reads the current, non-deleted AI instructions document for its owner.
pub trait UserInstructions: Send + Sync + 'static {
    /// Return the document body, or `None` if the owner has no live document.
    fn load(
        &self,
        owner: &MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Option<String>>> + Send;
}

/// Adds saved preferences before the existing trusted prompt composition.
pub struct UserInstructionsPromptComposer<Source, Composer> {
    source: Source,
    composer: Composer,
}

impl<Source, Composer> UserInstructionsPromptComposer<Source, Composer> {
    /// Wrap the runtime-independent composer with a live instructions source.
    pub const fn new(source: Source, composer: Composer) -> Self {
        Self { source, composer }
    }
}

impl<Source: UserInstructions, Composer: AgentPromptComposer> AgentPromptComposer
    for UserInstructionsPromptComposer<Source, Composer>
{
    #[tracing::instrument(name = "agent.compose_user_instructions", skip_all, err)]
    async fn compose(
        &self,
        prompt_markdown: &str,
        instructions: Option<&str>,
        people: Option<&PromptPeople>,
        trigger: Option<&TriggerContext>,
    ) -> Result<String> {
        // A collaborator may prompt the session, but its preferences belong
        // to the owner whose identity the agent runs under.
        let saved = match people {
            Some(people) => self.source.load(&people.owner).await?,
            None => None,
        };
        let combined = saved.filter(|text| !text.trim().is_empty()).map(|saved| {
            let mut combined = format!(
                "Apply these saved AI instructions from the session owner to this turn only. \
                 Later turns use the owner's then-current preferences:\n\n{saved}"
            );
            if let Some(instructions) = instructions {
                combined.push_str("\n\nAdditional session instructions and context:\n");
                combined.push_str(instructions);
            }
            combined
        });
        self.composer
            .compose(
                prompt_markdown,
                combined.as_deref().or(instructions),
                people,
                trigger,
            )
            .await
    }
}

#[cfg(test)]
mod test;
