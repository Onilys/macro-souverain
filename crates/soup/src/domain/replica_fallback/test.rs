use std::sync::{Arc, Mutex};

use email::domain::models::{PreviewView, PreviewViewStandardLabel};
use item_filters::ast::EntityFilterAst;
use models_grouping::{GroupByField, GroupingConfig};
use models_pagination::{Paginated, PaginatedCursor, Query, SimpleSortMethod, Sortable};

use super::*;
use crate::domain::models::{SoupQuery, SoupSortDirection, SoupType, WorkFeedSoupMode};

type Log = Arc<Mutex<Vec<(&'static str, &'static str)>>>;

/// Soup service that records which pool served each read and fails every
/// read with `error` when set.
#[derive(Clone)]
struct FakeSoup {
    pool: &'static str,
    log: Log,
    error: Option<fn() -> SoupErr>,
}

impl FakeSoup {
    fn read<O>(&self, operation: &'static str, output: O) -> Result<O, SoupErr> {
        self.log
            .lock()
            .expect("log lock")
            .push((self.pool, operation));
        match self.error {
            Some(error) => Err(error()),
            None => Ok(output),
        }
    }
}

fn empty_page<T, Item, C: Sortable>() -> PaginatedCursor<Item, String, C, T> {
    Paginated::from_parts(Vec::new(), None)
}

impl SoupService for FakeSoup {
    async fn get_user_soup<T>(
        &self,
        _req: SoupRequest<T>,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        self.read("get_user_soup", SoupOutput::Simple(empty_page()))
    }

    async fn get_user_soup_with_projection<T>(
        &self,
        _req: SoupRequest<T>,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, SoupProjectionHydration>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        self.read(
            "get_user_soup_with_projection",
            SoupOutput::Simple(empty_page()),
        )
    }

    async fn get_user_soup_with_properties<T>(
        &self,
        _req: SoupRequest<T>,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, EnrichedSoupItem>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        self.read(
            "get_user_soup_with_properties",
            SoupOutput::Simple(empty_page()),
        )
    }

    async fn get_user_soup_with_frecency<T>(
        &self,
        _req: SoupRequest<T>,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, EnrichedSoupItem>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        self.read(
            "get_user_soup_with_frecency",
            SoupOutput::Frecency(empty_page()),
        )
    }

    async fn get_user_soup_with_frecency_and_projection<T>(
        &self,
        _req: SoupRequest<T>,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, SoupProjectionHydration<EnrichedSoupItem>>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        self.read(
            "get_user_soup_with_frecency_and_projection",
            SoupOutput::Frecency(empty_page()),
        )
    }

    async fn get_user_soup_with_properties_and_frecency<T>(
        &self,
        _req: SoupRequest<T>,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<SoupOutput<T, EnrichedSoupItem>, SoupErr>
    where
        SoupRequest<T>: IntoSoupReqAst,
        T: Clone + Serialize + Send,
    {
        self.read(
            "get_user_soup_with_properties_and_frecency",
            SoupOutput::Frecency(empty_page()),
        )
    }

    async fn get_user_soup_grouped(
        &self,
        _req: GroupedSortRequest<'_>,
    ) -> Result<impl Iterator<Item = ItemGroupingInfo<SoupPropertiesField>> + Send, SoupErr> {
        self.read(
            "get_user_soup_grouped",
            Vec::<ItemGroupingInfo<SoupPropertiesField>>::new().into_iter(),
        )
    }

    async fn caller_tag_sets<'a>(
        &self,
        _user_id: MacroUserIdStr<'a>,
    ) -> Result<Vec<PropertyDefinitionWithOptions>, SoupErr> {
        self.read("caller_tag_sets", Vec::new())
    }

    async fn get_work_feed_page(
        &self,
        _req: WorkFeedSoupRequest,
        _team_receipt: Option<EntityAccessReceipt<MemberTeamRole>>,
    ) -> Result<WorkFeedSoupPage, SoupErr> {
        self.read(
            "get_work_feed_page",
            WorkFeedSoupPage {
                items: Vec::new(),
                next: None,
            },
        )
    }
}

const READS: [&str; 9] = [
    "get_user_soup",
    "get_user_soup_with_projection",
    "get_user_soup_with_properties",
    "get_user_soup_with_frecency",
    "get_user_soup_with_frecency_and_projection",
    "get_user_soup_with_properties_and_frecency",
    "get_user_soup_grouped",
    "caller_tag_sets",
    "get_work_feed_page",
];

fn conflict() -> SoupErr {
    SoupErr::CommsErr
}

fn other_error() -> SoupErr {
    SoupErr::CallErr
}

fn is_conflict(error: &SoupErr) -> bool {
    matches!(error, SoupErr::CommsErr)
}

fn service(
    replica_error: Option<fn() -> SoupErr>,
    primary_error: Option<fn() -> SoupErr>,
) -> (ReplicaFallbackSoupService<FakeSoup>, Log) {
    let log = Log::default();
    let fake = |pool, error| FakeSoup {
        pool,
        log: log.clone(),
        error,
    };
    let service = ReplicaFallbackSoupService::new(
        fake("replica", replica_error),
        fake("primary", primary_error),
        is_conflict,
    );
    (service, log)
}

fn user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|test@example.com").unwrap()
}

fn soup_request() -> SoupRequest<EntityFilterAst> {
    SoupRequest {
        soup_type: SoupType::Expanded,
        limit: 20,
        cursor: SoupQuery::new_sort_simple(SimpleSortMethod::UpdatedAt, EntityFilterAst::default()),
        sort_direction: SoupSortDirection::default(),
        user: user(),
        email_preview_view: PreviewView::StandardLabel(PreviewViewStandardLabel::All),
        link_ids: Vec::new(),
    }
}

/// Run every Soup read once, keeping only whether each succeeded.
async fn read_everything(
    service: &ReplicaFallbackSoupService<FakeSoup>,
) -> Vec<Result<(), SoupErr>> {
    vec![
        service.get_user_soup(soup_request(), None).await.map(drop),
        service
            .get_user_soup_with_projection(soup_request(), None)
            .await
            .map(drop),
        service
            .get_user_soup_with_properties(soup_request(), None)
            .await
            .map(drop),
        service
            .get_user_soup_with_frecency(soup_request(), None)
            .await
            .map(drop),
        service
            .get_user_soup_with_frecency_and_projection(soup_request(), None)
            .await
            .map(drop),
        service
            .get_user_soup_with_properties_and_frecency(soup_request(), None)
            .await
            .map(drop),
        service
            .get_user_soup_grouped(GroupedSortRequest {
                limit: 20,
                cursor: Query::Sort(SimpleSortMethod::UpdatedAt, EntityFilterAst::default()),
                user_id: user(),
                grouping: GroupingConfig {
                    field: GroupByField::EntityType,
                    group_key: None,
                    per_group_limit: None,
                },
            })
            .await
            .map(drop),
        service.caller_tag_sets(user()).await.map(drop),
        service
            .get_work_feed_page(
                WorkFeedSoupRequest {
                    user: user(),
                    link_ids: Vec::new(),
                    limit: 20,
                    mode: WorkFeedSoupMode::Work,
                    types: Vec::new(),
                    filter: EntityFilterAst::default(),
                    after: None,
                    only: None,
                },
                None,
            )
            .await
            .map(drop),
    ]
}

fn served_by(pools: &[&'static str]) -> Vec<(&'static str, &'static str)> {
    READS
        .into_iter()
        .flat_map(|operation| pools.iter().map(move |&pool| (pool, operation)))
        .collect()
}

#[tokio::test]
async fn retries_every_replica_conflict_once_on_the_primary() {
    let (service, log) = service(Some(conflict), None);

    let results = read_everything(&service).await;

    assert!(results.iter().all(Result::is_ok), "{results:?}");
    assert_eq!(*log.lock().unwrap(), served_by(&["replica", "primary"]));
}

#[tokio::test]
async fn serves_successful_reads_from_the_replica_alone() {
    let (service, log) = service(None, None);

    let results = read_everything(&service).await;

    assert!(results.iter().all(Result::is_ok), "{results:?}");
    assert_eq!(*log.lock().unwrap(), served_by(&["replica"]));
}

#[tokio::test]
async fn returns_other_replica_errors_without_retrying() {
    let (service, log) = service(Some(other_error), None);

    let results = read_everything(&service).await;

    assert!(
        results
            .iter()
            .all(|result| matches!(result, Err(SoupErr::CallErr))),
        "{results:?}"
    );
    assert_eq!(*log.lock().unwrap(), served_by(&["replica"]));
}

#[tokio::test]
async fn returns_the_primary_error_without_retrying_again() {
    let (service, log) = service(Some(conflict), Some(conflict));

    let results = read_everything(&service).await;

    assert!(
        results
            .iter()
            .all(|result| matches!(result, Err(SoupErr::CommsErr))),
        "{results:?}"
    );
    assert_eq!(*log.lock().unwrap(), served_by(&["replica", "primary"]));
}
