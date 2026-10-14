//! Native Meta messaging composition and durable worker drivers.

mod effects;
mod files;
mod native;
mod settings;

use crate::api::context::{
    AuthorizationService, DssEventBroker, EntityAccessService, NotificationIngressType,
};
use messages::outbound::connection_gateway::ConnectionGatewayMessages;
use meta_messaging::{
    domain::{
        meta::MetaService,
        models::{DeliveryState, MessagingError},
        ports::*,
    },
    inbound::{router::MessagingRouterState, webhook},
    outbound::{repository::PgMessagingRepository, storage::KmsCredentialCipher},
};
use std::{sync::Arc, time::Duration};

pub(crate) type State = MessagingRouterState<EntityAccessService, AuthorizationService>;

pub(crate) struct Dependencies {
    pub pool: sqlx::PgPool,
    pub access: Arc<EntityAccessService>,
    pub authorization: macro_authorization::MacroAuthorizationState<AuthorizationService>,
    pub gateway: Arc<connection_gateway_client::client::ConnectionGatewayClient>,
    pub search: Arc<sqs_client::SQS>,
    pub environment: macro_env::Environment,
    pub documents: Arc<crate::api::context::DocumentService>,
    pub broker: DssEventBroker,
    pub notifications: Arc<NotificationIngressType>,
}

pub(crate) async fn build(dependencies: Dependencies) -> anyhow::Result<State> {
    let Dependencies {
        pool,
        access,
        authorization,
        gateway,
        search,
        environment,
        documents,
        broker,
        notifications,
    } = dependencies;
    let settings = settings::Settings::load(environment)?;
    let cipher: Arc<dyn CredentialCipher> = if let Some(key) = settings.kms_key {
        Arc::new(KmsCredentialCipher::new(
            aws_sdk_kms::Client::new(&macro_aws_config::get_macro_aws_config().await),
            key,
        )?)
    } else {
        Arc::new(UnconfiguredCipher)
    };
    let files = Arc::new(files::NativeFiles::new(
        pool.clone(),
        documents,
        access.clone(),
    )?);
    let effects = Arc::new(effects::NativeEffects {
        soup: soup_realtime::domain::service::SoupRealtimeServiceImpl::new(
            soup_realtime::outbound::entity_access::EntityAccessExpander::new((*access).clone()),
            soup_realtime::outbound::kafka_publisher::KafkaSoupRealtimePublisher::new(
                broker.clone(),
            ),
        ),
        activity: activity::domain::materializer::ActivityMaterializer::new(
            activity::outbound::pg_activity_repo::PgActivityRepo::new(pool.clone()),
            activity::domain::announcements::ActivityAnnouncements::new(
                activity::KafkaActivityRealtimePublisher::new(broker),
                crate::service::activity::EntityAccessActivityAudience::new(access.clone()),
            ),
        ),
        notifications: (*notifications).clone(),
    });
    let service = Arc::new(MetaService::new(
        Arc::new(PgMessagingRepository::new(pool.clone())),
        Arc::new(settings.provider),
        cipher,
        Arc::new(native::NativeChannels::new(
            pool,
            access.clone(),
            ConnectionGatewayMessages(gateway),
            (*search).clone(),
            files,
            effects,
        )),
        settings.public,
    ));
    spawn(service.clone());
    Ok(State {
        service,
        entity_access_service: access,
        authorization_state: authorization,
        webhooks: Arc::new(settings.webhooks),
    })
}

struct UnconfiguredCipher;
#[async_trait::async_trait]
impl CredentialCipher for UnconfiguredCipher {
    async fn encrypt(
        &self,
        _team: uuid::Uuid,
        _connection: uuid::Uuid,
        _token: &meta_messaging::domain::connection::AccessToken,
    ) -> PortResult<Vec<u8>> {
        Err(MessagingError::Invalid("Meta credential encryption is not configured").into())
    }
    async fn decrypt(
        &self,
        _team: uuid::Uuid,
        _connection: uuid::Uuid,
        _bytes: &[u8],
    ) -> PortResult<meta_messaging::domain::connection::AccessToken> {
        Err(MessagingError::Invalid("Meta credential encryption is not configured").into())
    }
}

fn spawn(service: Arc<MetaService>) {
    let history = service.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let result: PortResult<()> = async {
                if let Some(work) = history.repository.claim_history_import().await? {
                    history.process_history_import(&work).await?;
                }
                Ok(())
            }
            .await;
            if let Err(error) = result {
                tracing::warn!(error=?error.current_context(),"Meta history worker will recover durable work");
            }
        }
    });
    let receipts = service.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let result: PortResult<()> = async {
                let Some(work) = receipts.repository.claim_receipt().await? else {
                    return Ok(());
                };
                let decoded = match webhook::decode(work.provider, &work.payload) {
                    Ok(events) => events,
                    Err(_) => {
                        receipts
                            .repository
                            .settle_receipt(&work.lease, Some("invalid_provider_payload"), None)
                            .await?;
                        return Ok(());
                    }
                };
                match receipts.process_receipt(&work, decoded).await {
                    Ok(()) => {
                        receipts
                            .repository
                            .settle_receipt(&work.lease, None, None)
                            .await?
                    }
                    Err(error) => {
                        let retry =
                            if matches!(error.current_context(), MessagingError::Unavailable)
                                && work.attempts < 10
                            {
                                Some(
                                    5_u32
                                        .saturating_mul(2_u32.pow(u32::from(work.attempts.min(8)))),
                                )
                            } else {
                                None
                            };
                        receipts
                            .repository
                            .settle_receipt(
                                &work.lease,
                                Some(&error.current_context().to_string()),
                                retry,
                            )
                            .await?;
                    }
                }
                Ok(())
            }
            .await;
            if let Err(error) = result {
                tracing::warn!(error=?error.current_context(),"Meta receipt worker will recover durable work");
            }
        }
    });
    let sends = service.messaging.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let result: PortResult<()> = async {
                let Some(work) = sends.repository.claim_send().await? else {
                    return Ok(());
                };
                if let Err(error) = sends.process_send(&work).await {
                    // A provider acceptance may already have been stored. The lease
                    // CAS rejects this transition in that case, preserving acceptance.
                    sends
                        .repository
                        .settle_send(
                            &work.lease,
                            DeliveryState::Failed,
                            None,
                            Some(&error.current_context().to_string()),
                            None,
                        )
                        .await?;
                }
                Ok(())
            }
            .await;
            if let Err(error) = result {
                tracing::warn!(error=?error.current_context(),"Meta send worker will reconcile its durable result");
            }
        }
    });
    let recovery = service.messaging.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if let Err(error) = recovery.recover_native().await {
                tracing::warn!(error=?error.current_context(),"Meta native delivery recovery will retry");
            }
        }
    });
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if let Err(error) = service.maintain().await {
                tracing::warn!(error=?error.current_context(),"Meta account/native delivery maintenance will retry");
            }
        }
    });
}
