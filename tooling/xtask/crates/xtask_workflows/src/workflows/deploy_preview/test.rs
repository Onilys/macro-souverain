use super::*;

#[test]
fn preview_can_be_disabled_in_the_pull_request_title() {
    let workflow = serde_json::to_value(deploy_preview()).expect("workflow JSON");
    assert_eq!(
        workflow["jobs"]["deploy"]["if"],
        "!contains(github.event.pull_request.title, '[no preview]')"
    );
}

#[test]
fn preview_build_uses_shared_kache_and_wasm_cache() {
    let yaml = deploy_preview().to_string().expect("workflow yaml");
    let job = yaml.split("\n  deploy:\n").nth(1).expect("deploy job");
    let configure = job
        .find("nsc docker login")
        .expect("preview must read the shared kache remote");
    let build_command = job.find("just build-").expect("web build command");
    assert!(configure < build_command);
    assert!(
        job.contains(".wasm-pack"),
        "preview must persist wasm-pack's wasm-opt cache: {job}"
    );
    assert!(
        job.contains("just build-dev"),
        "preview still builds the vite bundle: {job}"
    );
}
