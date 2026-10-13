use entity_access::domain::models::{EntityAccessReceipt, MemberTeamRole};
use macro_user_id::user_id::MacroUserIdStr;
use models_properties::service::property_definition_with_options::PropertyDefinitionWithOptions;
use serde::Serialize;

use crate::domain::{
    models::{
        EnrichedSoupItem, GroupedSortRequest, IntoSoupReqAst, SoupErr, SoupProjectionHydration,
        SoupPropertiesField, SoupRequest, WorkFeedSoupPage, WorkFeedSoupRequest,
        grouping::ItemGroupingInfo,
    },
    ports::{SoupOutput, SoupService},
};

#[cfg(test)]
mod test;

/// [`SoupService`] that reads the replica and reruns a read the replica
/// cancelled once on the primary.
///
/// A hot standby cancels statements that conflict with WAL replay; the same
/// read on the primary has no replay to conflict with. Every other error,
/// and any error from the primary, is returned unchanged.
#[derive(Clone)]
pub struct ReplicaFallbackSoupService<S> {
    replica: S,
    primary: S,
    is_replica_conflict: fn(&SoupErr) -> bool,
}

impl<S> ReplicaFallbackSoupService<S> {
    /// Read through `replica`, retrying on `primary` when `is_replica_conflict`
    /// matches the replica's error.
    pub fn new(replica: S, primary: S, is_replica_conflict: fn(&SoupErr) -> bool) -> Self {
        Self {
            replica,
            primary,
            is_replica_conflict,
        }
    }

    async fn or_primary<O, Fut>(
        &self,
        operation: &'static str,
        replica: Result<O, SoupErr>,
        primary: impl FnOnce() -> Fut,
    ) -> Result<O, SoupErr>
    where
        Fut: Future<Output = Result<O, SoupErr>>,
    {
        match replica {
            Err(error) if (self.is_replica_conflict)(&error) => {
                tracing::warn!(%error, operation, "replica cancelled a Soup read; retrying on the primary");
                primary().await
            }
            output => output,
        }
    }
}

impl<S> SoupService for ReplicaFallbackSoupService<S>
where
    S: SoupService,
{
    async fn get_user_soup<T>(
        &self,
        req: SoupRequest<T>,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        let replica = self
            .replica
            .get_user_soup(req.clone(), team_receipt.clone())
            .await;
        self.or_primary("get_user_soup", replica, || {
            self.primary.get_user_soup(req, team_receipt)
        })
        .await
    }

    async fn get_user_soup_with_projection<T>(
        &self,
        req: SoupRequest<T>,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, SoupProjectionHydration>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        let replica = self
            .replica
            .get_user_soup_with_projection(req.clone(), team_receipt.clone())
            .await;
        self.or_primary("get_user_soup_with_projection", replica, || {
            self.primary
                .get_user_soup_with_projection(req, team_receipt)
        })
        .await
    }

    async fn get_user_soup_with_properties<T>(
        &self,
        req: SoupRequest<T>,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, EnrichedSoupItem>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        let replica = self
            .replica
            .get_user_soup_with_properties(req.clone(), team_receipt.clone())
            .await;
        self.or_primary("get_user_soup_with_properties", replica, || {
            self.primary
                .get_user_soup_with_properties(req, team_receipt)
        })
        .await
    }

    async fn get_user_soup_with_frecency<T>(
        &self,
        req: SoupRequest<T>,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, EnrichedSoupItem>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        let replica = self
            .replica
            .get_user_soup_with_frecency(req.clone(), team_receipt.clone())
            .await;
        self.or_primary("get_user_soup_with_frecency", replica, || {
            self.primary.get_user_soup_with_frecency(req, team_receipt)
        })
        .await
    }

    async fn get_user_soup_with_frecency_and_projection<T>(
        &self,
        req: SoupRequest<T>,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, SoupProjectionHydration<EnrichedSoupItem>>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        let replica = self
            .replica
            .get_user_soup_with_frecency_and_projection(req.clone(), team_receipt.clone())
            .await;
        self.or_primary(
            "get_user_soup_with_frecency_and_projection",
            replica,
            || {
                self.primary
                    .get_user_soup_with_frecency_and_projection(req, team_receipt)
            },
        )
        .await
    }

    async fn get_user_soup_with_properties_and_frecency<T>(
        &self,
        req: SoupRequest<T>,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, EnrichedSoupItem>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        let replica = self
            .replica
            .get_user_soup_with_properties_and_frecency(req.clone(), team_receipt.clone())
            .await;
        self.or_primary(
            "get_user_soup_with_properties_and_frecency",
            replica,
            || {
                self.primary
                    .get_user_soup_with_properties_and_frecency(req, team_receipt)
            },
        )
        .await
    }

    async fn get_user_soup_grouped(
        &self,
        req: GroupedSortRequest<'_>,
    ) -> Result<impl Iterator<Item = ItemGroupingInfo<SoupPropertiesField>> + Send, SoupErr> {
        let replica = self.replica.get_user_soup_grouped(req.clone()).await;
        self.or_primary("get_user_soup_grouped", replica, || {
            self.primary.get_user_soup_grouped(req)
        })
        .await
    }

    async fn caller_tag_sets<'a>(
        &self,
        user_id: MacroUserIdStr<'a>,
    ) -> Result<Vec<PropertyDefinitionWithOptions>, SoupErr> {
        let replica = self.replica.caller_tag_sets(user_id.clone()).await;
        self.or_primary("caller_tag_sets", replica, || {
            self.primary.caller_tag_sets(user_id)
        })
        .await
    }

    async fn get_work_feed_page(
        &self,
        req: WorkFeedSoupRequest,
        team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<WorkFeedSoupPage, SoupErr> {
        let replica = self
            .replica
            .get_work_feed_page(req.clone(), team_receipt.clone())
            .await;
        self.or_primary("get_work_feed_page", replica, || {
            self.primary.get_work_feed_page(req, team_receipt)
        })
        .await
    }
}
