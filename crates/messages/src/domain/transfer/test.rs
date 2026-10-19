use super::*;
use entity_access::domain::models::{AccessLevel, Entity, EntityAccessAuth, EntityPermission};
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
struct Repo {
    moves: Arc<Mutex<Vec<(MessageParent, MessageParent)>>>,
}

impl DiscussionTransferRepository for Repo {
    async fn move_discussions(
        &self,
        from: &MessageParent,
        to: &MessageParent,
    ) -> Result<u64, MessageError> {
        self.moves.lock().unwrap().push((from.clone(), to.clone()));
        Ok(3)
    }
}

fn owner(entity_type: EntityType, entity_id: &str) -> EntityAccessReceipt<OwnerAccessLevel> {
    EntityAccessReceipt::try_new(
        EntityAccessAuth::Authenticated("macro|owner@example.com".to_owned().try_into().unwrap()),
        Entity {
            entity_id: entity_id.into(),
            entity_type,
        },
        EntityPermission::AccessLevel {
            access_level: AccessLevel::Owner,
        },
    )
    .unwrap()
}

#[tokio::test]
async fn moves_a_task_discussion_to_the_initiative() {
    let repo = Repo::default();
    let service = DiscussionTransferService::new(repo.clone());
    let initiative = Uuid::from_u128(7);

    let moved = service
        .move_task_discussions_to_initiative(&owner(EntityType::Document, "task"), initiative)
        .await
        .unwrap();

    assert_eq!(moved, 3);
    assert_eq!(
        *repo.moves.lock().unwrap(),
        vec![(
            MessageParent::Document(DocumentId::try_from("task".to_string()).unwrap()),
            MessageParent::Initiative(initiative),
        )]
    );
}

#[tokio::test]
async fn refuses_a_receipt_for_another_entity_type() {
    let repo = Repo::default();
    let service = DiscussionTransferService::new(repo.clone());

    let refused = service
        .move_task_discussions_to_initiative(
            &owner(EntityType::Channel, &Uuid::from_u128(1).to_string()),
            Uuid::from_u128(7),
        )
        .await;

    assert!(matches!(refused, Err(MessageError::Invalid(_))));
    assert!(repo.moves.lock().unwrap().is_empty());
}
