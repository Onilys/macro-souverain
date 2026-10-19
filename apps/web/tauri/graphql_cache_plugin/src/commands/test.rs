use super::HydrationResultWire;
use tauri::Manager;

#[test]
fn enqueue_combines_optional_count_patches_with_membership_and_rolls_back_both() {
    let schema = cache_core::meta::Schema::from_sdl(
        "type Query { bucket: Bucket! } type Mutation { move: Thing! }
         type Bucket { id: ID!, totalCount: Int!, members: [Thing!]! }
         type Thing { id: ID! }",
    )
    .unwrap();
    let handle = crate::EngineHandle::with_schema(
        cache_turso::TursoStorage::open_in_memory("count-ipc").unwrap(),
        None,
        schema,
    );
    let query = "query { bucket { id totalCount members { id } } }";
    let initial = serde_json::json!({"bucket": {
        "id": "bucket-1", "totalCount": 2,
        "members": [{"id": "thing-1"}, {"id": "thing-2"}]
    }});
    pollster::block_on(handle.write(crate::engine::WriteRequest {
        origin_op_id: None,
        registration: None,
        query: query.into(),
        operation_name: None,
        variables: Default::default(),
        data: initial.clone(),
        identity: None,
    }))
    .unwrap();
    let app = tauri::test::mock_builder()
        .manage(crate::CacheState(std::sync::Mutex::new(Some(
            crate::InitializedCache {
                scope: "count-ipc".into(),
                handle: handle.clone(),
            },
        ))))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let membership = serde_json::from_value(serde_json::json!({
        "query": query, "variablesJson": "{}",
        "path": [{"field": "bucket"}, {"field": "members"}],
        "operation": {"kind": "remove", "entityKey": "Thing:thing-1"}
    }))
    .unwrap();
    let count = serde_json::from_value(serde_json::json!({
        "query": query, "variablesJson": "{}",
        "path": [{"field": "bucket"}, {"field": "totalCount"}],
        "operation": {"kind": "adjustCount", "delta": -1}
    }))
    .unwrap();
    let queued = pollster::block_on(super::graphql_cache_enqueue_optimistic_mutation(
        app.handle().clone(),
        app.state(),
        None,
        "00000000-0000-4000-8000-000000000004".into(),
        "mutation { move { id } }".into(),
        None,
        None,
        serde_json::json!({"move": {"id": "thing-1"}}),
        Some(vec![membership]),
        Some(vec![count]),
        None,
        None,
        0,
        "runner".into(),
        10,
        1000,
        None,
        None,
    ))
    .unwrap();
    let visible =
        pollster::block_on(handle.read(None, query.into(), None, Default::default(), vec![]))
            .unwrap();
    assert_eq!(
        serde_json::to_value(visible).unwrap()["data"],
        serde_json::json!({"bucket": {
            "id": "bucket-1", "totalCount": 1, "members": [{"id": "thing-2"}]
        }})
    );
    let crate::InitialMutationClaimWire::Claimed { mutation } = queued.initial_claim else {
        panic!("expected the native command to claim the mutation")
    };
    pollster::block_on(handle.rollback_optimistic_write(
        queued.transaction_id,
        "runner".into(),
        mutation.lease_generation,
    ))
    .unwrap();
    let restored =
        pollster::block_on(handle.read(None, query.into(), None, Default::default(), vec![]))
            .unwrap();
    assert_eq!(serde_json::to_value(restored).unwrap()["data"], initial);
    drop(app.state::<crate::CacheState>().0.lock().unwrap().take());
    drop(app);
    handle.shutdown().unwrap();
}

#[test]
fn hydration_results_preserve_the_native_advancement_bit() {
    for revision_advanced in [false, true] {
        for result in [
            HydrationResultWire::Data {
                search_changed_buckets: ["note".into()].into(),
                data: serde_json::json!({"cursor": null}),
                revision: "7".to_string(),
                revision_advanced,
            },
            HydrationResultWire::Void {
                search_changed_buckets: ["note".into()].into(),
                revision: "7".to_string(),
                revision_advanced,
            },
        ] {
            let json = serde_json::to_value(result).unwrap();
            assert_eq!(json["revisionAdvanced"], revision_advanced);
            assert_eq!(json["revision"], "7");
            assert_eq!(json["searchChangedBuckets"], serde_json::json!(["note"]));
            assert!(json.get("revision_advanced").is_none());
        }
    }
}
