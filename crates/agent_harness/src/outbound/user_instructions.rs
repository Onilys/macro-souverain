//! Resolve the owner's existing instructions document and read its live body.

use lexical_client::{LexicalClient, parse_markdown::MarkdownTarget};
use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;

use crate::domain::error::{HarnessError, Result};
use crate::domain::user_instructions::UserInstructions;

/// Uses the same owner-to-document mapping as the AI Instructions editor.
pub struct PgUserInstructions {
    pool: PgPool,
    lexical: LexicalClient,
}

impl PgUserInstructions {
    /// Build a source over the instructions mapping and live document renderer.
    pub const fn new(pool: PgPool, lexical: LexicalClient) -> Self {
        Self { pool, lexical }
    }
}

impl UserInstructions for PgUserInstructions {
    #[tracing::instrument(name = "agent.load_user_instructions", skip_all, err)]
    async fn load(&self, owner: &MacroUserIdStr<'static>) -> Result<Option<String>> {
        let document_id = macro_db_client::instructions::get::get_instructions_document(
            &self.pool,
            owner.clone(),
        )
        .await
        .map_err(|error| HarnessError::PromptComposition(rootcause::report!(error).into()))?;
        let Some(document_id) = document_id else {
            return Ok(None);
        };
        self.lexical
            .get_markdown(&document_id, MarkdownTarget::External)
            .await
            .map(Some)
            .map_err(|error| HarnessError::PromptComposition(rootcause::report!(error).into()))
    }
}

#[cfg(test)]
mod test;
