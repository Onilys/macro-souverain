use super::*;

#[test]
fn build_uses_only_the_deploy_kache_store_and_wasm_cache() {
    let yaml = build_web_app().to_string().expect("workflow yaml");
    let job = yaml.split("\n  build:\n").nth(1).expect("build job");
    assert!(
        !job.contains("nsc docker login"),
        "deploy builds must never read the shared remote: {job}"
    );
    let configure = job
        .find("KACHE_TRUST_DOMAIN=deploy")
        .expect("deploy builds compile in their own kache trust domain");
    assert!(job.contains("KACHE_LOCAL_ONLY=1"), "{job}");
    let build_command = job.find("just build-").expect("web build command");
    assert!(configure < build_command);
    assert!(
        job.contains(".wasm-pack"),
        "build must persist wasm-pack's wasm-opt cache: {job}"
    );
    assert!(
        job.contains("just build-${{ inputs.environment }}"),
        "build still runs via just: {job}"
    );
}
