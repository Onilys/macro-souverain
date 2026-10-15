use super::*;

#[test]
fn shared_kache_logs_in_to_the_registry_only_for_trusted_refs() {
    let step = serde_json::to_value(configure_kache(KacheStore::Shared)).unwrap();
    let run = step["run"].as_str().expect("configure_kache is a run step");
    let trusted = step["env"]["TRUSTED"]
        .as_str()
        .expect("the trust check is evaluated into the step env");

    assert!(trusted.contains("github.event.pull_request.head.repo.full_name"));
    assert!(trusted.contains("github.repository"));
    let untrusted = run
        .find("if [ \"$TRUSTED\" != true ]; then\n  echo \"KACHE_LOCAL_ONLY=1\"")
        .expect("untrusted refs stay local");
    let login = run.find("nsc docker login").expect("trusted refs log in");
    assert!(untrusted < login, "{run}");
    assert!(!run.contains("KACHE_TRUST_DOMAIN"), "{run}");
}

#[test]
fn deploy_kache_never_touches_the_shared_remote() {
    let step = serde_json::to_value(configure_kache(KacheStore::Deploy)).unwrap();
    let run = step["run"].as_str().expect("configure_kache is a run step");

    assert!(run.contains("KACHE_TRUST_DOMAIN=deploy"), "{run}");
    assert!(run.contains("KACHE_LOCAL_ONLY=1"), "{run}");
    assert!(!run.contains("nsc"), "{run}");
    assert!(step["env"].get("TRUSTED").is_none(), "{step}");
}

#[test]
fn named_dev_shell_passes_the_flake_attribute() {
    let step = setup_dev_shell_named("agent-daemon");
    let with = step.value.with.expect("named shell should set with.shell");
    assert_eq!(
        with.0.get("shell").and_then(|value| value.as_str()),
        Some("agent-daemon")
    );
}

#[test]
fn default_dev_shell_does_not_pass_a_shell_input() {
    let step = setup_dev_shell();
    assert!(
        step.value.with.is_none(),
        "unspecified shell must keep the action default so other workflows stay unchanged"
    );
}

#[test]
fn web_build_cache_volume_includes_wasm_pack_and_cargo() {
    let step = mount_web_build_cache_volume();
    let with = step.value.with.expect("cache volume should set paths");
    let path = with
        .0
        .get("path")
        .and_then(|value| value.as_str())
        .expect("path list");
    assert!(path.contains("/home/runner/.bun/install/cache"));
    assert!(path.contains("/home/runner/.cargo/registry"));
    assert!(path.contains("/home/runner/.cargo/git"));
    assert!(path.contains("/home/runner/.cache/.wasm-pack"));
    assert_eq!(
        with.0.get("cache").and_then(|value| value.as_str()),
        Some("nix")
    );
}
