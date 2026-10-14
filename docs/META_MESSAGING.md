# Native WhatsApp Business and Instagram messaging

This release is scoped to two-way messaging in native Macro channels. This scope
supersedes the original broader integration brief. Export import, CRM changes,
new routines/proactive automation, and Support ticketing are deferred. Ordinary
agent reads retain the channel's existing permissions; agent output and notes
are internal unless a human deliberately submits an external reply.

See [message content coverage](META_MESSAGE_CONTENT.md) for the bounded follow-up:
Instagram share previews/links, story reply context, edit/unsend reconciliation,
readable WhatsApp structured content and deliberate remaining limitations.

For the first real phone-to-Macro test, follow [the practical testing walkthrough](META_MESSAGING_TESTING.md).

Connecting receives **new activity only by default**. A new customer message or
phone-app echo creates/reuses its native channel. An administrator can explicitly
choose **Import history** beside that account in Settings → Integrations →
Accounts → Manage, review the provider limits, then confirm **Import available history**.
There is no automatic backfill and no export-upload parser or conversation picker.

The account-level import brings all provider-available one-to-one conversations
into the same private native channels. Provider IDs deduplicate overlapping live
and historical messages. Original times, manual channel names, permissions and
private attachments are preserved. History does not open reply windows or send
messages. A subsequent eligible live customer message can establish its normal
reply window even if its historical copy arrived first.

- **WhatsApp:** coexistence only; up to 180 days of messages, with media available
  from the last 14 days. The business must consent in WhatsApp Business and the
  import must start within Meta's 24-hour onboarding window. Keep the phone app
  open. Test numbers cannot import Business-app history. Contacts synchronization
  is requested first as required by Meta; it does not restructure Macro contacts.
- **Instagram:** all API-visible conversations, up to the latest 20 messages in
  each. Requests inactive for over 30 days and older message content are not
  available. This is not a complete account archive.

Imports use an explicit generation-bound consent record and leased checkpoints.
Legacy history flags and receipts queued before consent cannot start an import.
Instagram reads resume after worker restart and transient failures; failed imports
can be resumed from Settings. WhatsApp's one-time POSTs are fenced before dispatch:
unknown acceptance is never blindly replayed, and signed late results can recover.
Unprovided/expired media has an honest notice in the original message. Reconnecting
invalidates old import consent while retaining all already imported content.
WhatsApp history receipts also recheck the administrator who granted import consent;
removing that access stops late history and progress events for that consent.

Provider limits verified against Meta's [WhatsApp coexistence guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users),
[history webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history), and
[Instagram Conversations API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/conversations-api).

## Code boundaries

`meta_messaging::domain::service` owns native conversation access, explicit human
send authority, durable intents, dispatch fencing and accepted-message recovery.
Its ports use account identity, team, health and authorization generation; they
carry no Meta configuration or credentials. `domain::meta` owns account lifecycle,
subscriptions, credentials and explicit history. Meta reply policy and transport
implement the shared ports, including preparation before the final access/policy
recheck. Provider acceptance is recorded before native materialization; recovery
never resends an accepted or uncertain intent.

The composer receives implemented capabilities and current server eligibility
through a feature-owned reply source. Native Channel consumes one interaction
state: internal, external, loading or error. Provider content is normalized into
plain text and validated supplied links before native rendering; private files,
source-scoped repair and revisions retain their existing owning-domain paths.
Database schemas, queued requests, intent hashes, IDs, callbacks and v1 draft keys
remain unchanged. Conversation responses add capabilities/eligibility while
retaining old fields for older clients. Deploy the server response before the new
composer; a missing capability contract keeps the new client disabled.

## Account and team model

A connected WhatsApp number or Instagram professional account belongs to one Macro
team. A team can connect several accounts. Each customer/account pair maps to one
private native channel; only the connecting administrator initially has access.
Viewing and attachments use ordinary channel permissions. Sending additionally
requires membership in the connected account's team and current channel posting
permission. Authorized teammates all send as the same external business account;
Macro retains the human send initiator for audit. Adding Macro teammates does not
create an external group chat.

The connected account must be WhatsApp Business with eligible coexistence, or an
Instagram Business/Creator account. Customers can use ordinary personal accounts.
Consumer inbox connection is outside these official APIs. Instagram group messaging
is unsupported; Meta's separate WhatsApp Groups API requires Official Business
Account eligibility and excludes Business-app coexistence numbers. This integration
therefore stays one-to-one. More provider message actions and team workflow could
be added later, but they are separate from the first release's scope.

## Development isolation

Use a named local stack and a fresh messaging-only database. Do not reset an
existing database or apply this release over an earlier mixed-scope development
migration. Retain any existing source/data snapshots independently of the release.
See [running locally](RUNNING_LOCALLY.md) for stack setup and port allocation.

## Meta setup dependencies

Use Meta directly with Graph API **v26.0**, the version examined for this release.
One Meta business app can host the WhatsApp and Instagram use cases, but
Instagram Login has its own Instagram app ID/secret. Configure the correct
credentials and callback signature secret for each product; they are not
interchangeable.

For WhatsApp production onboarding, complete business verification and Tech
Provider onboarding. Obtain Advanced Access to `whatsapp_business_management`
and `whatsapp_business_messaging`. Configure Facebook Login for Business
Embedded Signup **v4** with coexistence enabled and the exact HTTPS origin and
redirect URI allowlisted. Meta documents retirement of v2/v3 on October 15, 2026.
Keep `featureType: whatsapp_business_app_onboarding` in the SDK launch extras.
Coexistence numbers are already registered: do not call the registration API.

For development, use Meta's WhatsApp API Setup test phone, its messaging-account
ID, phone-number ID, and a server-side token. Add and verify intended test
recipients in Meta's dashboard. The development connection must be explicitly
enabled and account/recipient allowlisted in local configuration. A test-number
connection never proves coexistence, phone-app echoes, or onboarding history.

For Instagram, use a Business or Creator account and Instagram Login with
`instagram_business_basic` and `instagram_business_manage_messages`. Add test
roles/account access for development; request Advanced Access for accounts not
owned/managed by the app business. Instagram Login does not require a linked
Facebook Page. Register the exact HTTPS redirect URI and messaging subscriptions.
HUMAN_AGENT requires the applicable approval and must not be used by automated
sends. Request that approval separately if the extended support window is needed.

Provide a public HTTPS webhook endpoint for each product, configure its
verification token, and test signed notifications. Do not expose the entire
passwordless local stack publicly. Provide local secret-file paths rather than
pasting secrets into chat or committing them. Real test sends require authorized
test recipients; no shared deployment or customer messaging is implied.

## Provider references

Recheck Meta’s documentation before changing versions or supported sending rules.

- [WhatsApp coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [Tech Provider onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers/)
- [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/)
- [Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Instagram messaging](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api)
- [Instagram webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)

Coexistence changes some phone-app features and unlinks companion devices during
onboarding; eligible devices can be linked again. Group history is not included.
Phone-app echoes and historical messages do not open Cloud API reply windows.
Cloud API pricing applies independently of messages sent in the phone app.
Instagram normally permits a 24-hour reply window, with separately documented
ad-entry and human-support exceptions. Local policy must not assume every
conversation qualifies for an extension.

## Server configuration

Register these exact names in the DSS Doppler configuration before enabling a
provider. Secret registration and Meta app provisioning require environment
access; this branch does not deploy or modify shared secrets.

| Variable | Value / purpose |
| --- | --- |
| `META_WHATSAPP_APP_ID` | Parent Meta business app ID |
| `META_WHATSAPP_APP_SECRET` | Parent app secret; used only server-side |
| `META_WHATSAPP_CONFIGURATION_ID` | Facebook Login for Business Embedded Signup v4 configuration ID |
| `META_WHATSAPP_VERIFY_TOKEN` | Random webhook verification token, matching the WhatsApp dashboard |
| `META_INSTAGRAM_APP_ID` | Instagram app ID from Instagram API setup |
| `META_INSTAGRAM_APP_SECRET` | Instagram app secret, also authenticating Instagram webhook bodies |
| `META_INSTAGRAM_REDIRECT_URI` | Exact public HTTPS DSS callback: `<origin>/dss/meta/oauth/instagram/callback` |
| `META_INSTAGRAM_VERIFY_TOKEN` | Independent Instagram webhook verification token |
| `META_INSTAGRAM_HUMAN_AGENT_APPROVED` | Optional `true` only after Meta grants the configured app HUMAN_AGENT approval; defaults to `false`. Reconnect to record approval. Turning it off disables the extension immediately. |
| `META_CREDENTIAL_KMS_KEY` | Dedicated KMS key ARN/alias. Pulumi supplies it to DSS; local provisioning supplies `alias/macro-local-meta-messaging`. |
| `META_WHATSAPP_TEST_BUSINESS_ACCOUNT_ID` | Local-only Meta API Setup test WABA |
| `META_WHATSAPP_TEST_PHONE_NUMBER_ID` | Local-only API Setup phone-number ID |
| `META_WHATSAPP_TEST_TOKEN` | Local-only server token belonging to the selected test WABA/phone |
| `META_WHATSAPP_TEST_RECIPIENTS` | One to five verified and explicitly authorized test WhatsApp IDs, comma-separated, country code included |

Configure either all four normal WhatsApp variables or all four Instagram
variables; absent providers show an unavailable connection action. A partial
configuration fails startup. The isolated local WhatsApp test path may omit
`META_WHATSAPP_CONFIGURATION_ID` but still requires app ID, app secret, verification
token and KMS configuration. It cannot be enabled in a deployed environment and
cannot send outside its recipient allowlist. Production signup still verifies
account ownership, app/scopes and the selected number's coexistence eligibility.

WhatsApp callback: `<origin>/dss/meta/webhooks/whatsapp`. Subscribe to `messages`,
`smb_message_echoes`, `account_update`, `history` and `smb_app_state_sync` for coexistence.
History is consumed only after explicit import consent; contact-sync payloads do
not create channels or CRM records. Instagram callback: `<origin>/dss/meta/webhooks/instagram`; the
integration subscribes each connected professional account to its messaging
fields. Complete the dashboard verification GET, then verify a signed POST for
each product. Use a gateway exposing only the callback paths for local Meta
verification. Meta must also be able to retrieve short-lived native attachment
URLs for Instagram; a private LocalStack URL is not usable by Meta.

KMS Encrypt/Decrypt is restricted to the dedicated key and the
`meta-business-messaging-v1` purpose with team and connection encryption context.
Credentials are erased on disconnect. No plaintext fallback is available.

WhatsApp subscriptions belong to the messaging account (WABA), not one phone.
Disconnect removes only that connection's credentials and stops its pending sends.
If another number still uses the same WABA, including on another Macro team, the
shared subscription stays active and Settings reports a successful local disconnect.
The last disconnected number can remove the subscription. Connect and subscription
maintenance coordinate through the same PostgreSQL advisory lock; contended
maintenance is deferred, and OAuth persistence waits without occupying the DB pool.
The guard is released on cancellation. A small per-repository limit keeps DB
connections available for the guarded operations' ordinary queries.

Account health retains stable, sanitized reasons for expired/revoked authorization,
blocked Meta API access, lost connecting-admin access, transient failures, setup
issues and other provider rejections. Settings and the customer composer explain
the appropriate recovery; a temporary failure does not tell the user to repeat
OAuth. Raw provider diagnostics, tokens and message contents are not exposed.


## Supported sending and recovery

Ordinary channel posts, thread replies, and agent output do not reach providers.
Customer channels expose a single external reply composer; the internal-note
composer and local-only message mutation controls are absent there. Progress,
failures and uncertain delivery appear beside their message. Successful sends
have no visible delivered/read markers; provider state is retained for recovery. A bounded channel-authorized history lookup keeps
older visible replies covered beyond the recent 100-send feed. Recovery actions
restore a draft without sending or overwriting another draft. The
server rechecks team membership, native channel write permission, account state,
quoted-message scope and the reply window after preparation, immediately before
dispatch. User API keys, bots and harness credentials cannot submit external
replies. Existing permissioned channel reads continue through Macro's ordinary
message APIs.

WhatsApp supports text (4096 characters), JPEG/PNG (5 MiB), supported AAC/MP4/MP3/OGG
audio (16 MiB), MP4 video (16 MiB), PDF and plain text files (32 MiB). Non-audio
captions allow 1024 characters. Instagram supports text (1000 UTF-8 bytes),
JPEG/PNG (8 MiB), AAC/MP4/WAV audio, MP4/MOV/WebM video and PDF (25 MiB).
Instagram attachments are sent separately from text. Provider codec and account
restrictions still apply. Unsupported incoming types produce a visible notice;
unsupported or oversized outgoing files are rejected before dispatch.

Approved WhatsApp templates support positional and named text parameters in
headers/bodies, plus static supported buttons and footers. Templates needing
media headers, dynamic buttons or other interactive inputs are visibly disabled.
Approval is checked again at dispatch and resolved text is retained before the
provider call, so restart recovery can display what was sent. The composer offers
templates only when the free-form window is closed, as an explicit choice that keeps
any typed text as a draft; template drafts and failed template sends restore intact.

Provider acceptance is persisted before native message creation. Recovery creates
only the missing native message/attachment/effects and never repeats that provider
send. Rate limits, and temporary failures before the dispatch fence, retry a bounded
number of times. Once dispatch starts, a failure is never recorded as Failed: a
timeout, interrupted attempt or unrecorded acceptance becomes **Unknown**, because it
may have been accepted. Restoring an unknown reply requires a person to check the
original app and explicitly confirm sending again. Reconnect retains account/channel
mappings and retries failed inbound work for that account, including customer
messages and revisions received while its authorization needed renewal; it never
resets outbound sends. An explicit disconnect stops receiving.
Lease and publication-revision mismatches are errors, not successful settlement.

Webhook events within one decoded batch are independent: an unavailable account or
failed attachment does not prevent the remaining messages from being processed.
The receipt still retains its failure/retry outcome. A queued provider revocation
cannot disconnect a newer authorization generation. Dispatch preparation atomically
checks the connected account generation; an attempt already dispatched can still
record provider acceptance after disconnect so recovery never sends it twice.
Failed native materialization and publication retain a durable 30-second retry time.
They yield to later records, including beyond the worker's bounded page, without
making an accepted reply sendable again. New attachment revisions can publish
immediately and are protected from an older worker's retry update.

Files are private Macro documents. Source reservations retain the same document
ID and content hash after a crash. Channel sharing uses Macro's existing access
services. A ready file is never overwritten during recovery, and loss of access
after provider acceptance produces an explicit unavailable-attachment notice.

## Verification

Run from the repository root in the Nix shell. The commands below use the named
`whatsapp` instance's PostgreSQL at port 33000 and a fresh, disposable review
database. Choose a new database name for each migration validation; preserve
`macrodb_messaging`, `macrodb` and their conversations.

```sh
export DATABASE_URL=postgres://user:password@localhost:33000/macrodb_messaging_review
sqlx database create
sqlx migrate run --source crates/macro_db_client/migrations
cargo test -p meta_messaging --all-features -- --test-threads=1
cargo test -p document_storage_service --bin document_storage_service native_messaging -- --test-threads=1
cargo test -p documents --all-features received_file
cargo test -p channel_sender
cargo test -p mention_utils
cargo test -p messages --all-features
just sqlx::prepare_db "$DATABASE_URL" --tests
(\cd apps/web && bun scripts/generate-api-schema.ts cloud-storage)
just check
```

Leave `SQLX_OFFLINE` unset for tests. The repository build/generation tools enable
it only for their builds. For the full web type check, this large checkout needs
more than Node's default heap:

```sh
\cd apps/web
NODE_OPTIONS=--max-old-space-size=12288 bun run type-check
```

The HTTP integration tests use real Axum routes, access services, PostgreSQL and
native message/channel adapters. Only Meta transport and credential encryption
are simulated there. They cannot establish live Meta delivery or coexistence. A configured-agent live
exercise also remains unqualified; existing channel access regressions cover the
permission boundary.

A deliberately ignored `create_local_browser_fixture` test creates conspicuously
labeled synthetic native conversations for browser verification. It requires
`META_MESSAGING_UI_FIXTURE_DATABASE_URL` pointing at the local release DB
`macrodb_messaging` and refuses other hosts/databases. Stop this instance's DSS worker before
running it; restart DSS afterwards. Its invalid fixture credentials cannot be
used to reach Meta. The test prints the local channel URLs and fixture login.
The displayed fixture delivery status is simulated, not evidence of delivery.

## Running locally

Enter the existing development environment without recreating the local stack:

```sh
nix develop
messaging_repo="$PWD"
export DATABASE_URL=postgres://user:password@localhost:33000/macrodb_messaging
```

Select the Docker context/socket for your named local instance. All applicable local services, including readonly database URLs, must point to
`macrodb_messaging`. The original `macrodb` must stay intact. On a new isolated
instance, create the separate database first, then run the migration command
above; the SQLx integration tests also create fresh disposable databases.

Rebuild and restart the existing local DSS after Rust changes:

```sh
CARGO_BUILD_JOBS=2 cargo x zigbuild
docker restart macro-whatsapp-document_storage_service-1
```

The already-built equivalent is `target/debug/xtask_local zigbuild`. When shared
sender or message adapters change, restart this instance's cognition, notification
and search-processing services as well. Provision the local messaging KMS alias
without resetting data using:

```sh
target/debug/xtask_local localstack-provision --instance whatsapp --port-base 33000
```

For live-test configuration, place the server variables from the table above in
this instance's private `infra/local/generated/whatsapp/local.generated.env`,
including `META_CREDENTIAL_KMS_KEY=alias/macro-local-meta-messaging`, while keeping
its database URLs on the release database. Regeneration may replace manual local
environment changes. Recreate only DSS to apply environment changes (a plain
restart does not reload container environment):

```sh
MACRO_ENV_FILE="$messaging_repo/infra/local/generated/whatsapp/local.generated.env" \
  docker compose --project-directory "$messaging_repo" \
  -p macro-whatsapp -f docker/docker-compose.yml \
  -f infra/local/generated/whatsapp/docker-compose.override.yml \
  --env-file infra/local/generated/whatsapp/local.generated.env \
  up -d --no-deps --force-recreate document_storage_service
```

Run the web server behind the existing trusted HTTPS proxy:

```sh
\cd apps/web
PORT=33010 VITE_LOCAL_SERVERS=ALL VITE_LOCAL_BACKEND_ORIGIN=same-origin \
  MACRO_LOCAL_BACKEND_PROXY=https://localhost:33009 \
  MACRO_LOCAL_BACKEND_ROUTES=/preview,/auth,/connection-gateway,/contacts,/cognition,/dss,/email,/calendar,/notification,/scheduled-action,/unfurl,/image-proxy,/agent-harness \
  MACRO_DEV_HTTPS=false \
  NODE_EXTRA_CA_CERTS="$messaging_repo/infra/local/certs/ca.pem" \
  node ../../node_modules/vite/bin/vite.js -c vite.config.ts --host 0.0.0.0
```

Open `https://localhost:33009/app/`. Trust the existing local CA through the
browser/OS if needed. Settings → Integrations → Accounts shows both providers. Open Connect or Manage
for setup, import and recovery. Missing server setup is explained before connection.

## UI and refresh behavior

Customer conversations show the full customer name and a small provider logo.
Click the logo for phone/handle and account details. One customer reply composer
replaces the internal-note switch. Agent work remains private. Successful replies
show no delivery/read markers; progress, failures and uncertain outcomes retain
visible feedback and an explicit recovery action. Captionless files use native attachment cards with no
synthetic message label; real captions and unavailable-file notices remain.

Channel-specific messaging orchestration lives in
`features/meta-messaging/queries/channel-messaging.ts`; the native channel only
supplies its timeline and viewport and renders the composed slots. Native message
publication still uses Macro’s existing realtime services. Account/window and
receipt metadata use bounded polling: 2 seconds for recent active sends, 10 seconds
for recent delivery, 30 seconds for idle conversations. History stops fast polling
after the initial receipt window. Queries pause in background/offline tabs and
refresh stale data on focus; local account changes invalidate open conversations.
The worker remains responsible for durable processing, independent of open UI.

External drafts use the same local persistence mechanism as native composers,
scoped to the signed-in user and customer channel. Text, staged files, templates
and the enqueue idempotency key survive navigation. Restoring an uncertain reply
still requires a fresh check of the original app before sending again.

Native publication also refreshes the Soup channel/thread lists through the existing
permission-scoped stream. Live customer messages record native activity and create
notifications with an external display name and no impersonated Macro user. History,
later attachment revisions and business replies do not create customer notifications.
These presentation events do not publish message topics that trigger agents or routines.
Background query rereads resume on visibility changes; a new channel should appear
without reloading when its tab is visible.

## Production rollout gates

Code verification and the dedicated test app do not establish these prerequisites:

- Confirm the company owns the production Meta app and business portfolio, assign
  operational owners, and finish business verification. An advertising relationship
  does not establish messaging approval.
- Obtain the required messaging permissions, App Review/Advanced Access and
  WhatsApp Tech Provider approval. Verify the configured Embedded Signup v4 flow,
  business token model and exact allowlisted origins/callbacks. A developer token,
  even with a longer expiry, is not the production credential model.
- Qualify a real eligible WhatsApp Business-app number through coexistence. Prove
  phone-app echoes, synchronization, explicit history sharing and multi-number
  lifecycle behavior. The test number cannot satisfy this gate.
- Provision stable HTTPS callbacks, matching verification/signature secrets, and
  private, expiring signed media URLs reachable by Meta. Test expiration, private
  file permissions and supported media with the actual deployed storage origin.
- Register the server variables in the target secrets system, provision the dedicated
  KMS key/policy, apply compatible migrations before services, and deploy the DSS
  workers together with native activity, Soup, notification and search consumers.
- Establish alerts for receipt failures/age, unknown or failed sends, accepted sends
  awaiting native materialization, unpublished native revisions, failed history jobs,
  and revoked/expiring credentials. Report IDs, states, counts and age; exclude
  tokens, payloads and message content from operational diagnostics. Rehearse
  restart recovery and explicit human handling of uncertain sends.

The native notification service retains its existing delivery semantics: notification
records are idempotent, but a crash between its database write and egress publication
can miss a push update. Native conversation content and persisted notifications remain
available by fetch; this integration does not promise exactly-once push delivery.
