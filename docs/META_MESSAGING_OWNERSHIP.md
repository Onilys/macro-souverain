# External messaging ownership boundaries

This is the stage-2 prerequisite assessment for team-owned external messaging.
It records code evidence, not a claim that every lifecycle path is verified.

## Native channels

`ChannelType::Team` with `auto_join_team=false` is the existing representation.
`entity_access/.../queries/channel_role.rs` returns ViewOnly to matching team
members without active participation. Posting uses the existing MessageWrite
capability. Channel lists/sidebar queries distinguish active participation.
The team removal service calls `ChannelService::leave_by_team_id`, including
owner participants. Channel `owner_id` is attribution, not a substitute for an
active role. The ordinary remove-participants operation rejects the owner.

Use a narrowly scoped, owning-channel operation for an integration's bound
channels, plus source tracking for integration-managed admin roles. Authorize
account list edits/takeover using a current AdminTeamRole receipt. A background
worker must apply durable, idempotent list changes without impersonating the
connecting administrator. Creation and list changes need the same short account
lock so newly created channels use the current defaults. Manual leave must not
be undone by a later inbound event or an admin-role-only reconciliation.

The list is an automatic membership default, not an ACL: every current team
member can discover/read a converted or newly created conversation and join it.
A last-admin check belongs in the account edit transaction; team departures and
demotions must remain possible and yield Needs administrator. Reauthorization
and native takeover are distinct outcomes, even when offered as one UI flow.

## Native documents

Supported lower-level pieces:

- `PgDocumentRepo::create_document` accepts `Owner::Team`.
- `OwnedEntityRegistrar` registers the typed owner and uses the canonical owner
  grant policy. A team owner maps to a team source, not a former admin's grant.
- Entity access and Soup derive current team sources from `team_user`.
- Storage key construction, document-location reads, purge queue payloads, and
  the DSS deletion worker accept `Owner`, including teams.
- `deleted_item_poller` queues documents trashed for 30 days, independent of
  owner type. Authentication-service team deletion uses owning-domain permanent
  purge before deleting the team row.

Focused work is still required for new received files: the public received-file
preparation method hard-codes a user owner; the ordinary CreationPrincipal is
user/bot-shaped. Add a narrow team-authorized received-file entry point rather
than fabricating a user or widening every creation API. Legacy Recently Deleted
filters `d.owner = user_id`, so team trash listing also needs an owning-domain
path. All members' native team-owner grant semantics must be preserved.

## Existing ownership migration: prerequisite

No supported document rehome operation exists. `OwnedEntityRegistrar` explicitly
rejects an owner mismatch and documents that it is not an ownership-transfer
API. A metadata-only owner update breaks version storage paths and leaves
registry/access state inconsistent. Copying today's keys and then changing the
owner is also insufficient: an outstanding presigned upload/version writer can
commit under the old owner after the copy.

The proposed owning-document capability is a durable rehome operation with a
version/upload fence, immutable source and destination inventories, verified
copy of every stored version/hash, atomic registry/owner/grant cutover, and
retryable source-object cleanup. It must cooperate with version creation,
upload finalization, location signing, purge and team deletion. Existing direct
and project/channel shares remain independent grants. The external-messaging
backfill should call this capability; it must report blocked files and must
not mark them converted until storage and access verification succeed.

Do not convert existing customer files using direct SQL or impersonated user
credentials. A dry-run inventory is safe while the rehome capability is absent.

## Unsend cleanup: prerequisite

`comms_attachments`, entity mentions, project placement, direct shares and channel
shares are the actual reuse sources. `ChannelSharePermission` uses
`ON CONFLICT DO NOTHING`, and `PgChannelReferenceSharePermissions` returns when
the row already exists. Consequently an automatic integration grant and a later
explicit share to the same channel can be indistinguishable. A snapshot query
for references also races reference/share writers, which do not participate in
a common reuse-versus-trash fence.

The proposed owning-document capability is `trash_received_if_unreferenced`,
using explicit provenance for automatic grants and a durable deliberate-reuse
fact written by the native attachment, mention and sharing paths. The check and
trash transition must serialize with those writers. It should return Preserved
when deliberately reused and retire the unsend cleanup job permanently. Restore
must affect only the document, never a source message tombstone or attachment.
Until this capability exists, remove unsent message content/references but do
not guess that an integration-owned file is safe to trash. This prerequisite
also affects cleaning up files downloaded from an early outbound echo.

## Temporary provider media

The email viewer uses an opaque temporary object and a signed URL; the email
attachment bucket has a `temp/` one-day lifecycle rule. Its current key includes
link/attachment identifiers and a filename, so messaging should use a fresh
opaque UUID key without a filename or user principal. Prefer this existing
isolated temporary storage boundary to the native document bucket; verify the
composition's permissions and lifecycle configuration and add no public grant
to the original document. WhatsApp's byte upload does not need such a URL.
