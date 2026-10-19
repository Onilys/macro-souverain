use super::*;
use crate::domain::conversion::{ConvertibleTask, TaskConversions};
use crate::domain::models::InitialPropertyValue;
use crate::domain::resources::ResourceFuture;
use models_properties::api::requests::SetPropertyValue;
use std::sync::{Arc, Mutex};
use unicode_segmentation::UnicodeSegmentation;

const TASK: &str = "0199b4a2-7c1e-7d3a-9f2b-4c5d6e7f8a90";

#[derive(Debug, Clone, PartialEq)]
enum Step {
    Read,
    MoveDiscussions(InitiativeId),
    AdoptSubtasks(Vec<String>, InitiativeId),
    Retire,
}

#[derive(Debug, Default)]
struct FakeConversions {
    steps: Mutex<Vec<Step>>,
    name: String,
    fail_move: bool,
    fail_retire: bool,
}

impl FakeConversions {
    fn named(name: &str) -> Self {
        Self {
            name: name.to_string(),
            ..Default::default()
        }
    }

    fn steps(&self) -> Vec<Step> {
        self.steps.lock().unwrap().clone()
    }
}

impl TaskConversions for FakeConversions {
    fn read(
        &self,
        _task: &EntityAccessReceipt<OwnerAccessLevel>,
    ) -> ResourceFuture<'_, ConvertibleTask> {
        self.steps.lock().unwrap().push(Step::Read);
        Box::pin(async {
            Ok(ConvertibleTask {
                name: self.name.clone(),
                description: vec![4, 2],
                property_values: vec![InitialPropertyValue {
                    property_definition_id: uuid::Uuid::from_u128(2),
                    value: SetPropertyValue::SelectOption {
                        option_id: uuid::Uuid::from_u128(9),
                    },
                }],
                subtask_ids: vec!["subtask".to_string()],
            })
        })
    }

    fn move_discussions(
        &self,
        _task: &EntityAccessReceipt<OwnerAccessLevel>,
        initiative: InitiativeId,
    ) -> ResourceFuture<'_, ()> {
        self.steps
            .lock()
            .unwrap()
            .push(Step::MoveDiscussions(initiative));
        Box::pin(async {
            if self.fail_move {
                Err(InitiativeError::Internal(rootcause::report!("move failed")))
            } else {
                Ok(())
            }
        })
    }

    fn adopt_subtasks(
        &self,
        _owner: MacroUserIdStr<'static>,
        subtask_ids: Vec<String>,
        initiative: InitiativeId,
    ) -> ResourceFuture<'_, ()> {
        self.steps
            .lock()
            .unwrap()
            .push(Step::AdoptSubtasks(subtask_ids, initiative));
        Box::pin(async { Ok(()) })
    }

    fn retire(&self, _task: EntityAccessReceipt<OwnerAccessLevel>) -> ResourceFuture<'_, ()> {
        self.steps.lock().unwrap().push(Step::Retire);
        Box::pin(async {
            if self.fail_retire {
                Err(InitiativeError::Internal(rootcause::report!(
                    "trash failed"
                )))
            } else {
                Ok(())
            }
        })
    }
}

fn task_receipt(owner: &str) -> EntityAccessReceipt<OwnerAccessLevel> {
    EntityAccessReceipt::try_new_authenticated_user(
        user(owner),
        Entity {
            entity_id: TASK.to_string(),
            entity_type: EntityType::Document,
        },
        EntityPermission::AccessLevel {
            access_level: AccessLevel::Owner,
        },
    )
    .unwrap()
}

fn direct(owner: &str) -> activity::Attribution {
    activity::Attribution::direct(activity::Actor::new_from_user(user(owner)))
}

/// A repo that creates the initiative it is given, under its generated id.
fn creating_repo(name: &'static str) -> MockInitiativeRepo {
    let mut repo = MockInitiativeRepo::new();
    repo.expect_get_team_default_link_share()
        .return_once(|_| Box::pin(async { Ok(None) }));
    repo.expect_create()
        .withf(move |args, _, team_share| {
            args.name == name
                && args.owner_id == user(OWNER)
                && args.member_ids.is_empty()
                && *team_share == TeamShareCreation::Initiative
        })
        .times(1)
        .returning(|args, _, _| {
            Box::pin(async move {
                Ok(InitiativeDetail {
                    id: args.id,
                    ..detail(Vec::new())
                })
            })
        });
    repo
}

fn seeding_surfaces() -> MockInitiativeDescriptionSurfaces {
    let mut surfaces = MockInitiativeDescriptionSurfaces::new();
    surfaces
        .expect_ensure_from_snapshot()
        .withf(|_, snapshot| snapshot == &[4, 2])
        .times(1)
        .returning(|_, _| Box::pin(async { Ok(()) }));
    surfaces
}

fn converting(
    repo: MockInitiativeRepo,
    surfaces: MockInitiativeDescriptionSurfaces,
    conversions: Arc<FakeConversions>,
) -> TestService {
    service_with(repo, surfaces).with_task_conversions(conversions)
}

#[tokio::test]
async fn converting_a_task_carries_its_body_comments_and_subtasks_then_trashes_it() {
    let conversions = Arc::new(FakeConversions::named("  Launch  "));

    let created = converting(
        creating_repo("Launch"),
        seeding_surfaces(),
        conversions.clone(),
    )
    .convert_task(task_receipt(OWNER), direct(OWNER))
    .await
    .expect("converted");

    assert_eq!(created.user_access_level, ShareAccessLevel::Owner);
    assert_eq!(
        conversions.steps(),
        vec![
            Step::Read,
            Step::MoveDiscussions(created.id),
            Step::AdoptSubtasks(vec!["subtask".to_string()], created.id),
            Step::Retire,
        ]
    );
}

#[tokio::test]
async fn a_failed_comment_move_discards_the_project_and_keeps_the_task() {
    let conversions = Arc::new(FakeConversions {
        fail_move: true,
        ..FakeConversions::named("Launch")
    });
    let mut repo = creating_repo("Launch");
    repo.expect_delete()
        .times(1)
        .returning(|_| Box::pin(async { Ok(()) }));
    let mut surfaces = seeding_surfaces();
    surfaces
        .expect_delete()
        .times(1)
        .returning(|_| Box::pin(async { Ok(()) }));

    let result = converting(repo, surfaces, conversions.clone())
        .convert_task(task_receipt(OWNER), direct(OWNER))
        .await;

    assert!(matches!(result, Err(InitiativeError::Internal(_))));
    assert!(!conversions.steps().contains(&Step::Retire));
}

#[tokio::test]
async fn a_task_left_out_of_the_trash_still_converts() {
    let conversions = Arc::new(FakeConversions {
        fail_retire: true,
        ..FakeConversions::named("Launch")
    });

    converting(creating_repo("Launch"), seeding_surfaces(), conversions)
        .convert_task(task_receipt(OWNER), direct(OWNER))
        .await
        .expect("the project exists");
}

#[tokio::test]
async fn an_untitled_task_becomes_an_untitled_project() {
    converting(
        creating_repo("Untitled project"),
        seeding_surfaces(),
        Arc::new(FakeConversions::named("   ")),
    )
    .convert_task(task_receipt(OWNER), direct(OWNER))
    .await
    .expect("converted");
}

#[tokio::test]
async fn only_the_task_owner_or_their_agent_converts_it() {
    let conversions = Arc::new(FakeConversions::named("Launch"));

    let result = converting(
        MockInitiativeRepo::new(),
        MockInitiativeDescriptionSurfaces::new(),
        conversions.clone(),
    )
    .convert_task(task_receipt(OWNER), direct(OTHER))
    .await;

    assert!(matches!(result, Err(InitiativeError::Unauthorized)));
    assert!(conversions.steps().is_empty());
}

#[tokio::test]
async fn a_project_receipt_is_not_a_task() {
    let conversions = Arc::new(FakeConversions::named("Launch"));

    let result = converting(
        MockInitiativeRepo::new(),
        MockInitiativeDescriptionSurfaces::new(),
        conversions.clone(),
    )
    .convert_task(owner_receipt(), direct(OWNER))
    .await;

    assert!(matches!(result, Err(InitiativeError::BadRequest(_))));
    assert!(conversions.steps().is_empty());
}

#[tokio::test]
async fn conversion_without_task_steps_is_unavailable() {
    let result = service(MockInitiativeRepo::new())
        .convert_task(task_receipt(OWNER), direct(OWNER))
        .await;
    assert!(matches!(result, Err(InitiativeError::Internal(_))));
}

#[test]
fn long_task_titles_fit_the_project_name_limit() {
    let name = super::super::converted_name(&"🎉".repeat(MAX_INITIATIVE_NAME_GRAPHEMES + 5));
    assert_eq!(name.graphemes(true).count(), MAX_INITIATIVE_NAME_GRAPHEMES);
}
