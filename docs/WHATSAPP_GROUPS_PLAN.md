# WhatsApp messaging: finish #7981, then add groups

Status: implementation plan, reviewed against local head `cdb27b219` on
2026-10-16. Verify the current head and deployment state before implementing.

**Current scope is step 1 below, not group support.** Step 1 means the first
item in the former “Order of work”: simplify #7981, allow member connection,
support WhatsApp business-scoped identities, and support Cloud API numbers
without the Business app. Member connection alone is only one part of it.

## Product boundary

Keep the existing native Macro channels, file storage, permissions, external
composer and shared sending/recovery services. Provider adapters own Meta
onboarding, payloads and restrictions. Do not add a separate inbox or redesign
the shared API for hypothetical providers.

Message actions must not imply that an internal-only operation reaches the
customer. Keep unsupported external threads, reactions, edits, deletes and calls
hidden. Channel sharing, navigation and local renaming remain Macro operations.
Agent reads and output retain their ordinary permissioned, internal behavior;
only an explicit human external reply sends to Meta.

Customer conversations stay private channels with user-owned files. Account
management does not grant access to those channels or transfer their ownership.
No CRM restructuring, team ownership, admin takeover, automation or group UI in
step 1. Keep the fixed Instagram browser proof and authenticated completion.

## Step 1 — improve the existing PR

This is a moderate extension plus cleanup, not a cosmetic pass. Make small
logical commits; validate each changed behavior before stacking the next one.
No line-removal target. Do not turn every convention observation into a rewrite.

### 1A. Remove proven duplication and obsolete code

| Area | Action and condition |
| --- | --- |
| Unused projections | Trace consumers of connection `history_status`/`history_progress`, conversation `standard_window_until`, and message `event_published_at`. Remove redundant storage and writes where confirmed; retain the real history-job state, `last_customer_message_at`, revision fencing and recovery scheduling. These fields also appear in DTOs: regenerate contracts and update callers together. |
| Earlier implementation compatibility | Remove placeholder repair and rolling-upgrade handling for the disposable demo; retain compatibility only for an actual shared deployment boundary. Removing `tracked_lease_id` must preserve the distinction between claimed-but-unsent work and dispatched work using `dispatch_started_at`; keep receipt completion timestamps for retention. |
| One-shot send wrapper | Remove `process_next_send` if its only caller is a test; exercise the actual claim/process path instead. |
| Calls and composer wiring | Reuse one feature-owned call-eligibility helper where the behavior is identical. Render a known internal channel's native composer without waiting for the external composer chunk. Preserve loading/error safety for unresolved private-channel bindings. |
| Native UI controls | Reuse existing controls, touch focus/keyboard handling, autosize and disconnect confirmation. Give the provider trigger a 44px touch target and touch-safe hover styling. If the editor remains editable during send, successful completion must not erase newer text or attachments. |
| Test-number names | Stop adding the suffix at the provider boundary. Remove generic author-name stripping only after handling any retained labels; preserve external-author rendering for other integrations. |
| Browser harness | Move equivalent scenarios into the existing functional runner if it supports the same isolation. Verify both discovery and CI execution before deleting the old runner; main-only coverage is not automatically a PR check. Keep normal-channel regression coverage. |
| Shared code changes | Compare against current main. Remove unrelated changes introduced by this PR; do not revert main's agent-DM behavior or route fixes because they appear in the branch history. Confirm any Slack-import author-rendering impact is intended. |

Three proposed deletions need more than a grep:

- **Temporary Instagram copies:** keep opaque keys, private originals and
  15-minute signed URLs. The email bucket declares a one-day `temp/` lifecycle
  and does not request versioning. Lifecycle can replace the messaging cleanup
  ledger only if every configured bucket has equivalent coverage, previous
  copies remain covered, and the contract is eventual deletion—not verified
  deletion on a deadline. S3 expiration is asynchronous; versioned buckets need
  noncurrent-version cleanup. If those conditions hold, remove the redundant
  ledger, worker and IAM permissions together and update the retention docs.
  Otherwise leave this deletion out; do not rebuild storage infrastructure.
- **Attachment staging:** use normal native document upload only after tracing
  its channel/document authorization, private-by-default sharing, readiness,
  size/type checks and abandoned-upload cleanup. `document_id` in the send API
  does not by itself prove equivalence. Delete the dedicated staging route only
  once the existing upload path supplies those guarantees.
- **Fairness caps:** the proposed product choice is to remove account fairness
  caps, not to remove dispatch safety. Keep bounded workers, per-conversation
  ordering and fencing across replicas. Prove simultaneous claims cannot send
  two replies in one conversation out of order before removing the global claim
  lock. Meta rate limits do not prevent a busy account occupying Macro workers;
  document that tradeoff rather than calling the policy behavior-neutral.

Apply focused repository conventions where touching these paths: tracked worker
shutdown, existing hex/enum helpers, safe secret ownership and configuration
loading. Verify credential rotation/decryption before changing the stored key
format. Do not sweep all row decoding into `query_as!` or rewrite encryption just
to reduce perceived noise. Clean expired OAuth rows without retaining secrets.

### 1B. Any team member can connect; management remains restricted

| Operation | Authorization |
| --- | --- |
| Connect a new WhatsApp or Instagram account | Current team member, through the provider's authorized login |
| List accounts | Current team member; account metadata and “Connected by” only, no customer messages or credentials |
| Reconnect, disconnect, start history import | Current connector who is still a member, or a current team admin |
| Receive and maintain the connection | Connector remains a current team member |
| Continue an import | Connector and consenting user remain current team members; recorded consent remains valid |
| Send externally | Existing account-team membership and channel posting checks, at enqueue and dispatch |

Change typed access receipts and domain policy together; changing HTTP extractors
or hiding Settings buttons alone is insufficient. Keep a distinct `require_admin`
for manager fallback and add a narrow member/manager check at the owning domain.
Recheck management authority at reconnect completion and import initiation.
Before subsequent import effects, recheck membership and recorded consent; admin
demotion alone does not cancel already-authorized history while both remain members.
A fresh “connect” must not bypass management checks for an already-bound account.
The local developer number remains local-only and recipient-allowlisted.

Admin demotion alone no longer revokes a connection while its connector remains a
member. If the connector leaves, stop receiving/sending under that authorization,
retain eligible receipts for recovery and show a clear reconnect explanation.
A current admin can reauthorize the same account or disconnect it. Reconnect
changes the connector but does not transfer existing channel/file grants. Make
that limitation explicit; do not advertise account recovery as channel takeover.
No new account role system or automatic channel roster.

### 1C. WhatsApp identity without requiring a phone number

Use Meta's BSUID as the preferred WhatsApp identity when supplied; retain phone
numbers separately as optional routing/display data. Preserve connection/business
scope. Do not turn customers into Macro users or CRM records.

Before choosing the final schema, trace live messages, contacts, statuses, phone
app echoes, history, sends, revisions and `user_id_update`. Legacy and phone-only
payloads must still resolve safely. Do not assume every source or API version has
already adopted BSUIDs.

Required outcomes:

- A phone-hidden message can create or find its customer conversation.
- A later BSUID-bearing message and an earlier phone-only message resolve to
  the same native channel when Meta supplies an authoritative association.
  Never merge customers by name, username, or a merely matching recycled phone.
- Identity updates preserve channel ID, external sender ID, messages, media,
  revision tombstones and queued/accepted send recovery. Keep enough previous-ID
  resolution for late events; `ON UPDATE CASCADE` alone does not cover JSON
  payloads, unlinked pending revisions or redelivered old identifiers.
- Conflicting identities fail safely rather than merging two customer histories.
- Use the documented phone destination when valid, otherwise the documented
  BSUID destination once verified for the configured API/account. Do not invent
  a phone or silently drop an unaddressable reply; surface a clear limitation.
- Validate both phone and BSUID destinations against the controlled developer
  recipient allowlist. Username/display changes never change permissions.

Keep changes inside messaging records and adapters. Do not prebuild a group
participant model in this step. Official field names, update payloads and BSUID
send availability are implementation prerequisites to verify, not assumptions
that tests with invented fixtures can establish.

### 1D. Support Cloud API numbers without the Business app

Retain coexistence and the isolated developer path. Add an explicit connect choice
for a Business Platform number, using the supported Embedded Signup configuration.
Verify the returned WABA, phone ID, token permissions and number mode server-side;
missing provider facts must not be interpreted as eligibility.

For a number requiring registration:

- Obtain the required PIN through the supported flow. Keep it out of logs,
  persisted drafts, URLs and durable jobs. Verify the actual code expiry and
  registration deadline; do not hard-code the old plan's timing assumptions.
- Preserve exchanged credentials encrypted before a fallible registration step
  can lose a consumed authorization code. A pending connection is not send-ready.
- Check actual registration state before another attempt. On timeout or crash,
  reconcile with Meta rather than blindly registering again. If the PIN must be
  re-entered, say so without losing the retained connection.
- Activate sending only after required registration/subscription succeeds. Keep
  coexistence behavior unchanged and give registration errors understandable copy.

Store only account mode needed by current policy. Do not add OBA-only fields,
“Groups ready” copy or group eligibility polling until group support uses them.
Platform accounts do not gain coexistence history capabilities. Enabling
Platform numbers is useful independently of groups; registration is not a
promise of OBA approval or a guaranteed 30-day route to groups.

### Migration handling

The user has confirmed that this task's existing local demo data is disposable.
Do not build a backfill, compatibility layer or data-preservation workflow for
that demo. Recreate its isolated database when needed, preserving source work
and the configuration needed to reconnect the controlled test accounts.

Confirm that the feature migrations have not run in a shared environment, then
squash the unshipped feature migrations and validate a fresh isolated database.
Disposable demo data does not authorize resetting shared databases, other tasks'
instances or Meta accounts. If a shared deployment is discovered, use forward
migrations for that boundary; continue independent work.
Finalize schema cleanup and the identity/onboarding changes before regenerating
SQLx/OpenAPI/SDK contracts; keep only required generated changes.

### Completion criteria for step 1

- Member/connector/admin/outsider access works through the real domain and HTTP
  paths, including reconnect, demotion, leaving, import and alternate connect.
- BSUID-only, phone-only, mixed history/echo and identity-update cases preserve
  conversation identity without cross-account leakage or duplicate sends.
- Platform onboarding survives failure after token exchange and uncertain
  registration; coexistence and Instagram login still work.
- Native channels retain their ordinary behavior. External replies, attachments,
  closed windows, templates, retry/draft handling and mobile controls still work.
- Removed mechanisms have their guarantees covered by the replacement or an
  explicitly documented behavior change. Remove duplicate upload paths/runners
  where equivalence is verified; document any retained exceptions.
- Run focused regressions and required repository checks. Validate real provider
  onboarding and text/media against controlled accounts where available; clearly
  separate that evidence from fixtures and external rollout blockers.
- Update #7981's title/body, setup docs and generated contracts to match the final
  scope. Commit by concern, push only when requested, do not merge or deploy.

Suggested order: settle verified removals and the migration strategy; member
permissions; identity handling; Platform onboarding; final native UI/functional
runner cleanup. Do not wait for groups or OBA approval to finish this step.

## Later: WhatsApp groups (not authorized for step 1)

Keep one native channel per connected account/group; distinguish group identity
from individual customer identity. Group participants are external authors, never
Macro channel members. Local teammates still need Macro access and send authority.

The original proposal can be reused after resolving these requirements:

- Use the native channel creation flow, but bind only a channel the caller is
  authorized to manage, on the account's team. Atomically reserve the empty
  channel before it can receive normal internal messages. A pending binding must
  already suppress unsupported customer-facing actions; team channels cannot
  bypass external-binding lookup.
- Match creation only with an authoritative provider correlation ID or an
  explicitly verified recovery mechanism. Never match by newest request or group
  subject: two groups can share a name. Retain early webhooks and uncertain
  requests; never blindly repeat an uncertain create. Known rejection can retry
  with a new attempt, while old callbacks cannot bind to the replacement attempt.
- Retain unknown-group facts until their binding can be reconciled, without
  creating a participant's direct chat. Define what happens to remotely created
  groups if the pending native channel is deleted; an empty local channel does
  not prove there is no remote orphan.
- Keep group authors stable and membership changes idempotent/out-of-order safe.
  Apply names from authoritative group facts, not participant display names.
- Use server capabilities for recipient type, content restrictions and reply
  windows. Enforce known suspended/deleted state before dispatch. Do not assume
  the direct-chat window policy applies unchanged until Meta confirms it.
- Delivery/read receipts may be per participant. Do not mark the entire group
  delivered/read because one participant acknowledged it. Define truthful
  aggregation or omit that claim; no read-receipt UI is required.
- Use native Members/Bots-style presentation for external people. View requires
  channel access; invite-link access and removal require explicit authorized
  group-management policy. These controls affect customer access, not just text
  sending. Preserve the proposed minimal controls: copy invite link and remove.
- Keep unsupported external actions hidden. Local channel deletion/renaming must
  not silently promise deletion/renaming of the WhatsApp group. No billing,
  participant-limit or rejoin promises beyond the supported provider contract.

The provider logo on sidebar/search/split surfaces is a separate presentation
change. Reuse the existing batched channel presentation pattern (`agent_dm` is a
reference) without granting access or adding a per-row messaging request. Verify
all surfaces consume the metadata; changing `EntityIcon` alone is not proof.

## Provider evidence and rollout

Meta pages linked below returned HTTP 429 during this review. Their earlier
claims have therefore not been independently revalidated here. Do not present
exact participant limits, BSUID rollout dates, registration-code lifetime, OBA
eligibility or a 30-day approval schedule as confirmed implementation facts.
Confirm the relevant official contract before implementing each dependent path;
a blocked group fact does not block independent step-1 cleanup.

- [BSUIDs and identity updates](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids)
- [Phone registration](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration)
- [Groups](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups)
- [Group webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/webhooks)
- [Group creation/management](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/groups-management-api)
- [Official Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts)
- [Group pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/pricing)
- [S3 expiration semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)

Production still requires company-owned Meta configuration, appropriate access,
secure callbacks, secrets/storage configuration and live smoke checks. Existing
controlled test accounts can validate supported flows, but do not establish group
eligibility or production onboarding. Do not create/register a new number,
subscribe group webhooks or deploy infrastructure as part of this plan review.
