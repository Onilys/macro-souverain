//! Native channel deletion delegates to the same Meta domain operation as the UI.
use channels::domain::{
    ports::ChannelMutationErr,
    provider::{ProviderChannelLifecycle, ProviderDeletionGuard},
};
use macro_user_id::user_id::MacroUserIdStr;
use meta_messaging::domain::{meta::MetaService, ports::SubscriptionGuard};
use std::sync::Arc;
use uuid::Uuid;

pub(crate) struct GroupLifecycle(pub std::sync::OnceLock<Arc<MetaService>>);
struct DeletionGuard {
    _guard: Box<dyn SubscriptionGuard>,
}
impl ProviderDeletionGuard for DeletionGuard {}

#[async_trait::async_trait]
impl ProviderChannelLifecycle for GroupLifecycle {
    async fn prepare_delete(
        &self,
        channel: Uuid,
        user: MacroUserIdStr<'_>,
    ) -> Result<Box<dyn ProviderDeletionGuard>, ChannelMutationErr> {
        let guard = self
            .0
            .get()
            .ok_or_else(|| {
                ChannelMutationErr::Forbidden("WhatsApp group deletion is initializing".into())
            })?
            .prepare_group_deletion(channel, user.as_ref())
            .await
            .map_err(|error| ChannelMutationErr::Forbidden(error.current_context().to_string()))?;
        Ok(Box::new(DeletionGuard { _guard: guard }))
    }
}
