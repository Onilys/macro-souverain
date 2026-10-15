//! `Build Desktop on Tag` — orchestrator workflow that triggers AppImage and DMG
//! builds in parallel when a release tag is pushed. Also supports manual
//! dispatch. Generated into `build_desktop_on_tag.yml`.
//!
//! The reusable job definitions live in [`super::build_appimage_on_tag`] and
//! [`super::build_dmg_on_tag`].

use std::collections::HashMap;

use gh_workflow::{
    Concurrency, Event, Expression, Job, Level, Permissions, Push, Run, Step, Workflow,
    WorkflowDispatch, WorkflowDispatchInput,
};

use crate::workflows::{build_appimage_on_tag, build_dmg_on_tag, runners, steps, vars};

#[cfg(test)]
mod test;

const RESOLVED_REF: &str = "${{ needs.resolve-ref.outputs.ref }}";

/// Build the workflow.
pub fn build_desktop_on_tag() -> Workflow {
    Workflow::new("Build Desktop on Tag")
        .on(desktop_events())
        .concurrency(
            Concurrency::new(Expression::new("${{ inputs.ref == 'diagnose-pf-toggle' && 'cloudkit-pf-toggle-diagnostic-' || inputs.ref == 'diagnose-transport' && 'cloudkit-transport-diagnostic-' || inputs.ref == 'diagnose-staple' && 'cloudkit-staple-diagnostic-' || inputs.ref == 'diagnose-cloudkit' && 'cloudkit-diagnostic-' || '' }}desktop-${{ inputs.ref || (github.event.ref_type == 'tag' && github.event.ref || github.ref_name) }}"))
                .cancel_in_progress(true),
        )
        .add_job("resolve-ref", resolve_ref())
        .add_job(
            "diagnose-cloudkit-small",
            diagnose_cloudkit_job(
                vec![runners::Runner::MacOsArm.to_string()],
                "6x14",
                "cloudkit-diagnostics-6x14",
            ),
        )
        .add_job(
            "diagnose-cloudkit-large",
            diagnose_cloudkit_job(
                vec![runners::Runner::MacOsArmLarge.to_string()],
                "12x28",
                "cloudkit-diagnostics-12x28",
            ),
        )
        .add_job(
            "diagnose-cloudkit-production",
            diagnose_cloudkit_job(
                build_dmg_on_tag::macos_runner_labels(runners::Runner::MacOsArmLarge),
                "12x28 with cache",
                "cloudkit-diagnostics-12x28-with-cache",
            ),
        )
        .add_job(
            "diagnose-cloudkit-previous",
            diagnose_cloudkit_job(
                build_dmg_on_tag::macos_runner_labels(runners::Runner::MacOsArm),
                "6x14 with cache",
                "cloudkit-diagnostics-6x14-with-cache",
            ),
        )
        .add_job(
            "diagnose-staple-small",
            diagnose_staple_job(
                vec![runners::Runner::MacOsArm.to_string()],
                "6x14",
                "cloudkit-staple-6x14",
            ),
        )
        .add_job(
            "diagnose-staple-large",
            diagnose_staple_job(
                vec![runners::Runner::MacOsArmLarge.to_string()],
                "12x28",
                "cloudkit-staple-12x28",
            ),
        )
        .add_job(
            "diagnose-staple-production",
            diagnose_staple_job(
                build_dmg_on_tag::macos_runner_labels(runners::Runner::MacOsArmLarge),
                "12x28 with cache",
                "cloudkit-staple-12x28-with-cache",
            ),
        )
        .add_job(
            "diagnose-staple-previous",
            diagnose_staple_job(
                build_dmg_on_tag::macos_runner_labels(runners::Runner::MacOsArm),
                "6x14 with cache",
                "cloudkit-staple-6x14-with-cache",
            ),
        )
        .add_job(
            "diagnose-transport-large",
            diagnose_transport_job(
                vec![runners::Runner::MacOsArmLarge.to_string()],
                "12x28",
                "cloudkit-transport-12x28",
                "ABAB",
            ),
        )
        .add_job(
            "diagnose-transport-production",
            diagnose_transport_job(
                build_dmg_on_tag::macos_runner_labels(runners::Runner::MacOsArmLarge),
                "12x28 with cache",
                "cloudkit-transport-12x28-with-cache",
                "BABA",
            ),
        )
        .add_job(
            "diagnose-pf-toggle-first",
            diagnose_pf_toggle_job(
                "before-first",
                "cloudkit-pf-toggle-before-first",
            ),
        )
        .add_job(
            "diagnose-pf-toggle-between",
            diagnose_pf_toggle_job(
                "between-samples",
                "cloudkit-pf-toggle-between-samples",
            ),
        )
        .add_job(
            "build-appimage",
            build_appimage_on_tag::build_appimage_job(RESOLVED_REF).add_needs("resolve-ref"),
        )
        .add_job(
            "build-dmg",
            build_dmg_on_tag::build_dmg_job(RESOLVED_REF).add_needs("resolve-ref"),
        )
        // The installers users download must reach the release on their own.
        // Updater signing needs Doppler, Apple, and the stable channel; none of
        // that may stand between a green build and macro.com/download.
        .add_job(
            "publish-installers",
            build_appimage_on_tag::publish_job(
                RESOLVED_REF,
                xtask_paths::runtime_path!("release-artifacts/*"),
            )
            .name("Publish desktop installers")
            .add_needs("resolve-ref")
            .add_needs("build-appimage")
            .add_needs("build-dmg"),
        )
        .add_job(
            "publish-release",
            publish_desktop_job()
                .add_needs("resolve-ref")
                .add_needs("publish-installers"),
        )
}

fn publish_desktop_job() -> Job {
    Job::default()
        .name("Sign and publish desktop updates")
        .runs_on("ubuntu-latest")
        // Serialize channel promotion across tags; an older build cannot win a race.
        .concurrency(
            Concurrency::new(Expression::new("desktop-stable-publish")).cancel_in_progress(false),
        )
        // A wedged signer must not hold the channel lock, and must not sit long
        // enough for the runner to be reaped with its logs still unuploaded.
        .timeout_minutes(20u32)
        .cond(Expression::new(
            "startsWith(needs.resolve-ref.outputs.ref, 'refs/tags/v')",
        ))
        .permissions(Permissions {
            contents: Some(Level::Write),
            ..Default::default()
        })
        .add_step(steps::checkout_ref(RESOLVED_REF))
        .add_step(steps::setup_nix())
        .add_step(steps::derive_artifact_metadata(RESOLVED_REF))
        .add_step(steps::download_artifacts(xtask_paths::runtime_path!(
            "release-artifacts"
        )))
        .add_step(
            Step::new("Sign updater artifacts")
                .run(include_str!("scripts/sign_desktop_updates.sh"))
                .shell("bash")
                .add_env(("DOPPLER_TOKEN", vars::MACOS_RELEASE_DOPPLER_TOKEN))
                .add_env(("GH_TOKEN", "${{ github.token }}"))
                .add_env(("RELEASE_TAG", "${{ steps.metadata.outputs.tag }}"))
                .add_env(("RELEASE_REPOSITORY", "${{ github.repository }}")),
        )
        .add_step(
            Step::new("Publish desktop release and update feed")
                .run(include_str!("scripts/publish_desktop_updates.sh"))
                .shell("bash")
                .add_env(("GH_TOKEN", "${{ github.token }}"))
                .add_env(("RELEASE_TAG", "${{ steps.metadata.outputs.tag }}"))
                .add_env(("RELEASE_REPOSITORY", "${{ github.repository }}")),
        )
    // No Teardown Nix here. This job runs on a hosted runner with no /nix cache
    // volume to unmount, where the teardown's `fuser -km /nix` kills the runner
    // process itself — the job dies with "lost communication with the server"
    // and its logs are never uploaded.
}

fn desktop_events() -> Event {
    Event::default()
        .push(Push::default().add_tag(build_appimage_on_tag::DESKTOP_TAG_PATTERN))
        .workflow_dispatch(workflow_dispatch())
}

fn workflow_dispatch() -> WorkflowDispatch {
    let mut inputs = HashMap::new();
    inputs.insert(
        "ref".into(),
        WorkflowDispatchInput {
            description: "Optional release tag override (v* or refs/tags/v*); use diagnose-cloudkit, diagnose-staple, diagnose-transport, or diagnose-pf-toggle for no-release ticket checks. Leave empty to build the selected branch or tag.".into(),
            required: false,
            input_type: "string".into(),
            default: None,
        },
    );

    WorkflowDispatch { inputs }
}

fn resolve_ref() -> Job {
    Job::default()
        .cond(Expression::new(
            "(github.event_name == 'workflow_dispatch' && inputs.ref != 'diagnose-cloudkit' && inputs.ref != 'diagnose-staple' && inputs.ref != 'diagnose-transport' && inputs.ref != 'diagnose-pf-toggle') || github.event_name == 'push' || (github.event_name == 'create' && github.event.ref_type == 'tag')",
        ))
        .name("Resolve build ref")
        .runs_on("ubuntu-latest")
        .add_output("ref", "${{ steps.resolve.outputs.ref }}")
        .add_step(resolve_ref_step())
}

fn diagnose_cloudkit_job(runner_labels: Vec<String>, size: &str, artifact_name: &str) -> Job {
    Job::default()
        .name(format!("CloudKit ticket lookup ({size})"))
        .runs_on(runner_labels)
        .cond(Expression::new(
            "github.event_name == 'workflow_dispatch' && inputs.ref == 'diagnose-cloudkit'",
        ))
        .timeout_minutes(20u32)
        .permissions(Permissions::default().contents(Level::Read))
        .add_step(
            Step::new("Download an already stapled DMG")
                .run(include_str!("scripts/download_cloudkit_diagnostic_dmg.sh"))
                .shell("bash")
                .add_env(("GH_TOKEN", "${{ github.token }}"))
                .add_env(("GH_REPO", "${{ github.repository }}")),
        )
        .add_step(
            Step::new("Compare stapler and CloudKit requests")
                .run(include_str!("scripts/probe_cloudkit_ticket.sh"))
                .shell("bash"),
        )
        .add_step(
            steps::upload_artifact(
                artifact_name,
                xtask_paths::runtime_path!("cloudkit-diagnostics/*"),
            )
            .if_condition(Expression::new("always()"))
            .add_with(("if-no-files-found", "warn")),
        )
}

fn diagnose_staple_job(runner_labels: Vec<String>, size: &str, artifact_name: &str) -> Job {
    Job::default()
        .name(format!(
            "CloudKit stapling without separate validation ({size})"
        ))
        .runs_on(runner_labels)
        .cond(Expression::new(
            "github.event_name == 'workflow_dispatch' && inputs.ref == 'diagnose-staple'",
        ))
        .timeout_minutes(20u32)
        .permissions(Permissions::default().contents(Level::Read))
        .add_step(
            Step::new("Download already stapled release artifacts")
                .run(include_str!(
                    "scripts/download_cloudkit_staple_artifacts.sh"
                ))
                .shell("bash")
                .add_env(("GH_TOKEN", "${{ github.token }}"))
                .add_env(("GH_REPO", "${{ github.repository }}")),
        )
        .add_step(
            Step::new("Restaple and assess without separate validation")
                .run(include_str!(
                    "scripts/probe_cloudkit_staple_without_validate.sh"
                ))
                .shell("bash"),
        )
        .add_step(
            steps::upload_artifact(
                artifact_name,
                xtask_paths::runtime_path!("cloudkit-staple-diagnostics/*"),
            )
            .if_condition(Expression::new("always()"))
            .add_with(("if-no-files-found", "warn")),
        )
}

fn diagnose_transport_job(
    runner_labels: Vec<String>,
    size: &str,
    artifact_name: &str,
    phase_order: &str,
) -> Job {
    Job::default()
        .name(format!("CloudKit TCP fallback ({size})"))
        .runs_on(runner_labels)
        .cond(Expression::new(
            "github.event_name == 'workflow_dispatch' && inputs.ref == 'diagnose-transport'",
        ))
        .timeout_minutes(20u32)
        .permissions(Permissions::default().contents(Level::Read))
        .add_step(
            Step::new("Download already stapled release artifacts")
                .run(include_str!(
                    "scripts/download_cloudkit_staple_artifacts.sh"
                ))
                .shell("bash")
                .add_env(("GH_TOKEN", "${{ github.token }}"))
                .add_env(("GH_REPO", "${{ github.repository }}")),
        )
        .add_step(
            Step::new("Compare direct and TCP-only stapling")
                .run(include_str!("scripts/probe_cloudkit_transport.sh"))
                .shell("bash")
                .add_env(("PHASE_ORDER", phase_order)),
        )
        .add_step(
            steps::upload_artifact(
                artifact_name,
                xtask_paths::runtime_path!("cloudkit-transport-diagnostics/*"),
            )
            .if_condition(Expression::new("always()"))
            .add_with(("if-no-files-found", "warn")),
        )
}

fn diagnose_pf_toggle_job(toggle_position: &str, artifact_name: &str) -> Job {
    Job::default()
        .name(format!("CloudKit PF toggle ({toggle_position}, 12x28)"))
        .runs_on(vec![runners::Runner::MacOsArmLarge.to_string()])
        .cond(Expression::new(
            "github.event_name == 'workflow_dispatch' && inputs.ref == 'diagnose-pf-toggle'",
        ))
        .timeout_minutes(20u32)
        .permissions(Permissions::default().contents(Level::Read))
        .add_step(
            Step::new("Download already stapled release artifacts")
                .run(include_str!(
                    "scripts/download_cloudkit_staple_artifacts.sh"
                ))
                .shell("bash")
                .add_env(("GH_TOKEN", "${{ github.token }}"))
                .add_env(("GH_REPO", "${{ github.repository }}")),
        )
        .add_step(
            Step::new("Compare direct stapling around an empty PF cycle")
                .run(include_str!("scripts/probe_cloudkit_pf_toggle.sh"))
                .shell("bash")
                .add_env(("TOGGLE_POSITION", toggle_position)),
        )
        .add_step(
            steps::upload_artifact(
                artifact_name,
                xtask_paths::runtime_path!("cloudkit-pf-toggle-diagnostics/*"),
            )
            .if_condition(Expression::new("always()"))
            .add_with(("if-no-files-found", "warn")),
        )
}

fn resolve_ref_step() -> Step<Run> {
    Step::new("Resolve ref")
        .run(include_str!("scripts/resolve_desktop_ref.sh"))
        .id("resolve")
        .shell("bash")
        .add_env(("EVENT_NAME", "${{ github.event_name }}"))
        .add_env(("INPUT_REF", "${{ inputs.ref }}"))
        .add_env(("GITHUB_EVENT_REF", "${{ github.event.ref }}"))
        .add_env(("GITHUB_EVENT_REF_TYPE", "${{ github.event.ref_type }}"))
        .add_env(("SELECTED_REF", "${{ github.ref }}"))
}
