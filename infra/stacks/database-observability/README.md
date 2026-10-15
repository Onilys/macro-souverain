# PostgreSQL metrics pilot

This stack adds one native NixOS/Alloy collector in a private Virginia subnet,
with no inbound ports or public IP. It monitors the dev writer and replica over
verified PostgreSQL TLS and forwards metrics to the existing Ohio Prometheus.
Datadog, application tasks, RDS parameter groups, and production are unchanged.

This is the database health baseline. It does not collect SQL text, query
fingerprints, samples or execution plans, change existing alerts, or provide
Grafana Cloud's Database Observability UI. PostgreSQL 14 and 18 compatibility
must be verified before expanding the dev-only stack to production.

## Deployment order

1. Build and publish a new **Ohio observability** AMI from
   `infra/stacks/observability`; deploy it first. This adds
   `https://otlp.macro-internal.com/api/v1/write`, an exact POST-only endpoint
   protected by HTTP Basic (`metrics`, existing OTLP token) over ALB TLS. It
   exposes no query/administration routes. Existing OTLP bearer access is
   unchanged. The password is hashed at boot and passed privately to nginx.
   Grafana gets the provisioned **Macro PostgreSQL** dashboard at
   `/d/macro-postgres`.
2. As an authorized database administrator, connect **to dev writer / macrodb**
   with TLS and run `psql --file monitoring-role.sql`. Choose a random password
   of at least 32 characters at its secure prompt. The role/grants replicate to
   the reader. The script grants statistics access via `pg_monitor`, not
   application-table SELECT; it sets connection and query timeouts and defaults
   to read-only transactions. It doesn't install extensions or restart RDS.
   `pg_monitor` can read activity/query information, so treat this credential as
   sensitive even though this collector does not export query text.
3. Save that password in Doppler `observability/dev` as
   `GRAFANA_POSTGRES_PASSWORD` and an AWS-managed-key Secrets Manager secret in
   Virginia with JSON shape `{"password":"..."}`. Use the existing raw-string
   dev-ingest secret for `ingestSecretArn`. Doppler is the operator source;
   the host retrieves only the two explicit AWS secrets using its instance
   role. There is no automatic Doppler-to-Secrets-Manager synchronization.
   Never put values in Pulumi config, command-line arguments or user data.
4. Build the pinned collector image:
   `nix build ./infra/stacks/observability#database-collector --out-link result-database-collector`.
   Publish with
   `python3 infra/stacks/observability/nixos/publish-image.py result-database-collector VIRGINIA_PRIVATE_IMAGE_BUCKET --region us-east-1 --name-prefix macro-database-collector`.
   The image is fixed; EC2 user data carries validated nonsecret settings only.
5. Initialize the separate Pulumi project here with a `dev` stack. Configure
   `aws:region=us-east-1`, `amiId`, `subnetId`, `secretArn`, and `ingestSecretArn`.
   The subnet must be private, in the database VPC, with outbound NAT/HTTPS
   access to AWS APIs and Ohio. The AMI must be the reviewed collector image
   owned by our account. The stack discovers dev writer/replica endpoints and
   adds port 5432 rules allowing traffic from the collector security group to
   their existing security groups. These rules cover every resource attached
   to those destination groups; verify their membership during preview.
   Run `pulumi preview --stack dev`, review only additive collector resources,
   then deploy. No database resource belongs to this stack.

The stack deliberately requires a reviewed image and secret references, rather
than a fake AMI, generated admin password or automatic database mutation.
Use AWS-managed encryption for the two secrets; a customer-managed key would
also need narrowly scoped `kms:Decrypt` permission.

## Verification before relying on it

Check SSM connectivity and `database-collector-bootstrap` / `alloy` units. Each
endpoint must report `pg_up=1`, `pg_exporter_last_scrape_error=0`, and scrape
`up=1` with distinct `db_instance` and `db_role` labels. Inspect the dashboard's
transaction, connection, lock and vacuum metrics during representative dev
traffic. Missing metrics are not replaced with reassuring zeros. The freshness
panel measures the latest sample's age within Prometheus's five-minute lookback;
after that it shows no data, not an increasing outage timer. Verify no passwords,
connection-string labels, SQL statements or parameter values appear
in ingested data or logs. The exporter runs once per minute with five-second
SQL timeouts; a failing collector does not imply the database is down.

Exercise a temporary receiver outage in an isolated smoke environment, restore
it and verify remote-write catch-up. Alloy self-metrics expose pending/failed
samples. No alert notifications are enabled in this PR; collection-health
alert routing and independent host/disk alarms are follow-up rollout work.
This pilot must not be the sole database monitor.

## Storage, rotation and rollback

The encrypted 20 GiB gp3 data volume is retained/protected across host
replacement; stable ownership and volume-ID verification prevent silent
fallback to root storage. Prometheus remote-write WAL is retained up to 24 hours,
not an unlimited queue or a guarantee against a whole Virginia failure. Monitor
volume capacity, measure actual telemetry volume and tune the retention before
production. Metrics delivered to Ohio use its existing Prometheus retention.

For credential rotation, update the role password and AWS secret, then restart
`database-collector-bootstrap.service` over SSM. Alloy stops with bootstrap and
starts with new private systemd credentials; the WAL remains. A partial failure
leaves collection stopped and retrying. Rotating the shared ingest token also
requires updating its Ohio source and all existing OTLP clients.

Rollback by stopping Alloy or removing this collector stack and its added
security-group rules; the WAL volume remains protected. The role may be removed
by an administrator after its last consumer is gone. Keep Datadog running during
all pilot work. Query statistics, richer investigations, full Datadog inventory
and alert-by-alert migration remain later passes.
