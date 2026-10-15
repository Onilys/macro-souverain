# Grafana ingestion token ownership

`observability/prd/OTLP_TOKEN` in Doppler is the source of truth. The
`doppler-projects/prod` Pulumi stack reads that one existing secret and manages
its raw-string copy at `observability/dev-ingest` in AWS account `569036502058`,
`us-east-1`. It does not create, generate, or rotate the Doppler source.

This is **deployment-time synchronization**: after an approved source change,
run a reviewed update of this stack. It is not a continuous native Doppler sync.
The installed `@pulumiverse/doppler@0.9.0` native AWS sync resource supports a
whole-config JSON bundle, not this existing raw-string interface. Do not add
observability to `SERVICE_NAMES`: that would sync the OAuth/encryption bundle
and create different AWS paths. Do not configure a second writer for this copy.

ECS still injects the entire raw secret as `GRAFANA_OTLP_TOKEN`. The workflow from merged CI PR
[#7883](https://github.com/macro-inc/macro/pull/7883) still assumes
`macro-observability-ci` through GitHub OIDC and reads this same AWS secret before
`gha-otel-export` sends traces to `https://otlp.macro-internal.com`. No Doppler
credential is needed in telemetry jobs. Datadog is unaffected.

## Verified starting state (2026-10-15)

Read-only inspection found:

- Doppler already holds `observability/prd/OTLP_TOKEN`; its computed value exactly
  matches the raw AWS `AWSCURRENT` value (compared in memory, without printing it).
- The AWS ARN is
  `arn:aws:secretsmanager:us-east-1:569036502058:secret:observability/dev-ingest-7UhJbL`.
- Its only version is `b9927655-bb8e-4fad-a82a-f186a9abb932`, labeled `AWSCURRENT`.
- The Doppler integrations list contains `macro_aws` and 38 service syncs, with no
  observability sync. The existing secret description names Doppler as its source,
  but that copy is not covered by `doppler-projects` today.

These are observations, not a completed migration. Recheck before rollout.

## Prerequisites and rollout

Use the existing authenticated Doppler CLI, AWS CLI and Pulumi access. The
`doppler-projects/prod` stack already has encrypted `doppler:dopplerToken` and AWS
region configuration. Ensure that provider credential can read
`observability/prd/OTLP_TOKEN`. The deployment AWS identity needs
`DescribeSecret`, `GetSecretValue`, `PutSecretValue`, and `UpdateSecretVersionStage`
on the exact ARN above. Consumers retain only their existing read access. No new
Doppler service token, integration ID, consumer config or GitHub secret is needed.

1. Recheck Doppler's integration list and the AWS metadata. If a native sync or
   another stack now owns this destination, stop and reconcile ownership; do not
   establish a second writer. Freeze token edits during adoption.
2. Compare the current source and destination without printing either. From the
   repository root, run this read-only preflight (Python 3 plus both CLIs):

   ```sh
   python3 infra/stacks/doppler-projects/check_observability_ingest.py
   ```

   A mismatch is a blocker, not permission to overwrite or rotate. Investigate
   with the observability owner; retain the currently accepted token.
3. Install infra dependencies with `bun install --frozen-lockfile` in `infra`.
   In `infra/stacks/doppler-projects`, select `macro-inc/doppler-projects/prod`.
   Import the **current version**, not the secret container, before any update:

   ```sh
   pulumi stack select macro-inc/doppler-projects/prod
   ingest_arn=arn:aws:secretsmanager:us-east-1:569036502058:secret:observability/dev-ingest-7UhJbL
   ingest_version=$(aws secretsmanager get-secret-value --region us-east-1 \
     --secret-id "$ingest_arn" --version-stage AWSCURRENT --query VersionId --output text)
   pulumi import aws:secretsmanager/secretVersion:SecretVersion observability-dev-ingest \
     "$ingest_arn|$ingest_version" --generate-code=false --protect=false
   ```

   Import is an operator rollout step that writes Pulumi state. The CLI query
   emits only a version ID. Do not export plaintext state or use `--show-secrets`.
   `retainOnDelete` in code retains previous versions during future replacement;
   protection is disabled on this version so a deliberate rotation can replace it.
4. Run `pulumi preview --diff`. Expect the existing version to remain unchanged,
   the read-only Doppler lookup, and retention metadata. There must be **no secret
   creation, value replacement, AWSCURRENT move, or unrelated service changes**.
   Stop on any other diff. Apply only the reviewed plan with `pulumi up`.
5. Rerun the preflight; verify the ARN and current version are unchanged. Existing
   ECS tasks need no restart for an unchanged token. The GitHub OIDC provider and
   CI role from #7883 were deployed separately; verify a main-branch export succeeds
   and its traces appear in Grafana. Do not rotate the token to test adoption.

The source's raw/computed outputs and destination string are Pulumi secrets;
values are encrypted in state. Keep stack access restricted. Importing the
existing version avoids writing an unnecessary new AWS version during migration.

## Rotation and rollback (separate approved operation)

Do not rotate as part of adoption. The Ohio receiver currently reads `otlp_token`
from the existing `observability/prod` JSON bundle in `us-east-2`. This PR does not
manage that bundle or its other credentials. Before a future rotation, identify
all producers and plan a maintenance window: the receiver has no dual-token
grace period, and running ECS tasks keep the value injected at task startup.

1. Record the current version IDs in both regions (never the values). Securely
   retain access to the prior token for rollback. Change only Doppler
   `observability/prd/OTLP_TOKEN` through the approved secret-management process.
2. In the same maintenance window, update only the Ohio bundle's `otlp_token`
   from that source through the existing secure process, preserving all its
   other fields. Run `sudo systemctl restart observability-secrets` on the host
   to refresh the receiver. This also briefly restarts Grafana and ingress Alloy.
3. Preview and apply `doppler-projects/prod` to publish the source to Virginia.
   This intentionally creates a new version and moves `AWSCURRENT`; Pulumi retains
   the old version. Replace dev ECS tasks to pick it up; subsequent CI export jobs
   read the new current value automatically. Coordinate in-flight CI exports and
   producer retry queues; some telemetry may be lost during the cutover.
4. Run the preflight and verify authenticated ingestion, ECS Alloy health and CI
   export traces. Do not log authorization headers or task secret environments.

For rotation rollback, restore the previous token in Doppler first, update only
Ohio's token and refresh the receiver, then preview/apply this stack and replace
ECS tasks again. Do not leave an AWS-only rollback that the next Pulumi update
would overwrite. Keep existing AWS versions; never delete/recreate the secret.
For adoption rollback with the value unchanged, remove the managed version from
Pulumi state only through a reviewed state change; leave AWS and Doppler intact.
