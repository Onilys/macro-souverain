//! Provider-managed native channels retain native ownership but require a remote
//! deletion decision. Unwired hosts fail closed for these channels.
use super::ports::ChannelMutationErr;
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

/// Held through native deletion to exclude a concurrent provider setup attempt.
pub trait ProviderDeletionGuard: Send {}

/// Owning provider's deletion use case, wired by the host.
#[async_trait::async_trait]
pub trait ProviderChannelLifecycle: Send + Sync {
    /// Revalidate native ownership/team permission and confirm remote deletion.
    async fn prepare_delete(
        &self,
        channel: Uuid,
        user: MacroUserIdStr<'_>,
    ) -> Result<Box<dyn ProviderDeletionGuard>, ChannelMutationErr>;
}
