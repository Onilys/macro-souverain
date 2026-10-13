# Your first real WhatsApp and Instagram test

## Live setup checkpoint — October 11–12, 2026

The Meta test app is published and the business is verified. The isolated Macro
instance is connected to Meta's WhatsApp test number and the dedicated Instagram
Business account. Credentials and resumable setup state are private and outside
the repository.

WhatsApp now passes the real phone → native channel → phone workflow. Meta has
confirmed delivery/read for text, PNG and the approved hello_world template, plus
delivery of a plain-text document. A forwarded JPEG arrived, was stored privately
and opens in Macro's native image viewer. An uninvited teammate cannot fetch it.
The UI now has one customer composer; older notes and private agent work are not forwarded. Failed-send recovery does not auto-send, and actual
disconnect/reconnect retains the channel while server-side sending is blocked
during disconnection.

Instagram also passes the real customer → native channel → customer workflow.
Text and PNG replies received real read receipts. A forwarded JPEG recovered on
its saved retry after fixing the provider User-Agent and opened in Macro's native
private image viewer. Exactly four native messages remained (two in, two out).
The owner could fetch both real channels/files; an uninvited teammate could not.

The Instagram outgoing-image test used a 15-minute URL allowing only the harmless
test image. That URL is now revoked and the local document origin is private again.
For repeat Instagram outbound-media tests, configure stable signed public media
hosting. The callback-only gateway must not expose the entire local storage bucket.

Live testing fixed an attachment event arriving as an edit before its first
publication, grouped delivery badges disappearing during lazy rendering, and
Instagram token-response/subscription compatibility. Local file URLs use
`https://localhost:33009`, matching the trusted browser origin.

The temporary gateway exposes only the two webhooks and Instagram OAuth callback.
It rejects unsigned events and blocks app/auth/account-management paths. Keep
both the local stack and gateway running for phone tests. If the tunnel hostname
changes, update the callbacks in Meta and the private local configuration.
The general steps below describe a fresh setup; this checkpoint records the
completed configuration of this instance.

Start with **Meta’s WhatsApp test number and accounts you control**. The Macro UI
is running at `https://localhost:33009/app/`. The conversations labeled
`LOCAL FIXTURE` are demonstrations; use a newly connected account for the real test.

## 1. Get the Meta accounts ready

Open [Meta’s app dashboard](https://developers.facebook.com/apps/), create or use
the business app for this integration, and add the WhatsApp and Instagram use
cases. Dashboard labels vary: WhatsApp testing may appear under **API Setup**,
**Getting Started**, or **Use cases → Test**.

For **WhatsApp**, use the provided test phone number. Add your own WhatsApp number
as a recipient and complete its verification. Generate a fresh testing access
token and record the app ID, WhatsApp Business Account ID and Phone Number ID.
First use Meta’s sample test message and confirm it arrives on your phone.
The dashboard token is short-lived; refresh it if a later test loses access.
Meta’s [Cloud API reference](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
and [official quickstart](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/) describe
these test resources and sending the sample message. We use the existing Rust
adapter; you do not need to install the archived Node SDK.

For **Instagram**, choose **API setup with Instagram Login** and use a Business
or Creator account you control. This flow does not require a linked Facebook
Page. The scopes Macro requests are `instagram_business_basic` and
`instagram_business_manage_messages`. The customer must message the professional
account before Macro can reply. Use another account you control as that customer.
See [Meta’s Instagram Login and Send API reference](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00).

Add the applicable accounts under **App Roles → Instagram Testers**, accept the
invitations, and grant the requested messaging access. Confirm message access for
connected tools is enabled in the professional account’s Instagram settings.
[AWS’s working setup guide](https://github.com/aws-samples/sample-amazon-connect-social-integration/blob/main/instagram_setup.md#62-testing-in-development-mode)
also walks through tester invitations; use Meta’s reference above for the current
account types and scopes.

## 2. Wire those accounts to this Macro instance

Keep tokens and app secrets in a local private file, not chat. The implementation
and exact variable names are in [the server setup guide](META_MESSAGING.md#server-configuration).
The identifiers alone are not sufficient: we also need the matching app secrets,
the WhatsApp test token and the verified recipient number.

Before live testing, the local instance needs:

| Item | Exact value or requirement |
| --- | --- |
| WhatsApp webhook | `<public-origin>/dss/meta/webhooks/whatsapp` |
| Instagram webhook | `<public-origin>/dss/meta/webhooks/instagram` |
| Instagram OAuth redirect | `<public-origin>/dss/meta/oauth/instagram/callback` — identical in Meta and `META_INSTAGRAM_REDIRECT_URI` |
| Verification tokens | Separate secrets chosen for each webhook, matching Macro’s configuration |
| Credential encryption | Local KMS alias provisioned and `META_CREDENTIAL_KMS_KEY` set; instructions in the server guide |
| WhatsApp recipient | The verified test number also listed in `META_WHATSAPP_TEST_RECIPIENTS` |

Meta cannot call `localhost`. Provide a public HTTPS callback gateway forwarding
only the webhook and OAuth callback paths to this local instance. Do not expose
the passwordless local app or its databases. Keep callback origins in local configuration. Instagram attachment testing additionally needs publicly reachable,
short-lived attachment URLs; prove the text flow first.

After server configuration, open **Macro → Settings → Integrations → Accounts**:

- WhatsApp: open **Connect** or **Manage**, then **Connect test number**. The regular
  WhatsApp connection uses production Embedded Signup and checks coexistence
  eligibility; the test button is the intended local developer path.
- Instagram: open **Connect** or **Manage**, choose **Connect account** or
  **Add account**, and authorize the professional account in the Instagram window.
  Return to Settings and wait for **Connected**.

Meta’s webhook verification and the account’s messaging subscription must both
be active. Macro subscribes the connected account as part of connection. The
dashboard verification check or a synthetic webhook test alone does not prove
that real customer messages will be forwarded.

Before the phone test, read the **published/unpublished notice on each product’s
Webhooks page**. Recent WhatsApp developers report a dashboard notice that real
inbound events are withheld until the Meta app is published, even for testers.
If your app shows that notice, complete its Publish/Live requirements first using
the app’s real privacy/data-deletion information. Meta app publication, Advanced
Access review, and deploying Macro are separate operations.
[WhatsApp developer report](https://www.reddit.com/r/WhatsappBusinessAPI/comments/1qq6fo2/messages_to_test_number_never_delivered_to_test/)

## What appears after connection

Connecting does not populate the entire existing inbox. The next live customer
message or business phone-app echo creates/reuses that customer's native channel.
Without explicit import consent, onboarding-history webhooks are ignored, including
after reconnect/restart. In **Settings → Integrations → Accounts → Manage**, each
account has an **Import history** action. Open it to inspect limits and availability;
only **Import available history** starts the job. This imports all API-visible
conversations into native channels; there is no individual picker or export upload.

For WhatsApp, use an eligible coexistence Business-app number, enable history
sharing on the phone during setup, subscribe `history` and `smb_app_state_sync`,
and start within 24 hours. Keep WhatsApp Business open. Expect up to six months of
text but only 14 days of media; the developer test number cannot prove this flow.
An uncertain one-time request must not be blindly repeated. Meta may require the
business to disconnect Business Platform on the phone and complete setup again.

For Instagram, approve the two existing messaging scopes and ensure the app has
API access. Only the most recent 20 messages per conversation are retrievable;
Requests inactive over 30 days are absent. On 2026-10-12 the configured test account's
Conversations endpoint initially returned OAuth code 200, “API access blocked”.
The developer dashboard requested account confirmation; the email was in Spam.
After confirmation, access recovered and the actual Settings import completed:
five existing messages, one reused channel, no duplicates or external sends, and
no reply-window changes. A working OAuth login alone does not establish current
Conversations API access; verify the actual import after resolving account checks.

Meta's current WhatsApp setup navigation is **Use cases → WhatsApp → Basic setup →
Step 1. Try it out** (older dashboards label this **API Setup**). Generate a fresh
short-lived test token there when it expires, update the ignored local environment,
recreate DSS, then use Reconnect on the configured test account in Macro. This
keeps the same channel and customer mapping. Production uses the approved business
onboarding flow rather than this developer-only token path.

Verify: without clicking import, old messages create no channels; after clicking,
history appears in the same private channels with original authors/times. Rename a
channel and receive a new live message: it reuses that channel and retains the name.
History alone must not enable free-form sending. Replay history, restart a worker,
and revoke account/admin access. No duplicate chats, external sends, or unauthorized
attachment access should result. Progress must settle or expose a recovery message.

## 3. Do this on your phone and in Macro

1. From your verified personal WhatsApp number, send “Hi Macro” to Meta’s test
   number. From your second Instagram account, DM the connected professional
   account. Accept a message request in Instagram if needed.
2. In Macro, open the new customer channel. Check the customer and account label.
3. Verify that the customer conversation has one reply box and no internal-note
   switch. The provider logo opens the customer and connected-account details.
4. Write a reply and click the send arrow. Confirm the text actually arrives in
   the original app. Pending or failed sends show feedback beside their message.
5. Confirm successful replies have no visible read/delivery badges. Delivery
   events are retained on the server for recovery and verification, and provider
   acceptance alone is not proof of customer delivery.
6. Test a small PNG/PDF after text works. Check that an invited teammate can use
   the channel and an uninvited teammate cannot access the channel or its files.
7. Disconnect/reconnect the test account and repeat. A failed message should show
   an explanation beside it. **Edit and retry** restores the customer draft; it never sends
   automatically. For **Delivery not confirmed**, check the phone before resending.

## Common setup traps found in current developer reports

These are troubleshooting reports, not replacements for Meta’s rules:

- **WhatsApp accepts the request but nothing arrives.** Developers report this
  when delivery later fails. Inspect the status webhook and confirm receipt on
  the phone; an API message ID is not a delivery receipt.
  [Discussion](https://www.reddit.com/r/WhatsappBusinessAPI/comments/1oa4ftw/whatsapp_test_number_fails_to_deliver_messages/)
- **Test number missing / recipient error 131030.** Recent reports describe an
  empty test-number dropdown even when the number exists in WhatsApp Manager.
  Verify the app/WABA and recipient list; resolve that dashboard issue before
  debugging Macro’s send path or moving a real number.
  [Discussion](https://www.reddit.com/r/WhatsappBusinessAPI/comments/1vwjexd/anyone_else_new_meta_panel_wont_show_the_whatsapp/)
- **Instagram dashboard tests arrive but real DMs do not.** Check tester roles,
  permissions, account subscriptions, message requests and the Webhooks page’s
  published/unpublished notice. Recent developers report dashboards that withhold
  real events until the Meta app is published, including tester events. Follow
  the notice on your app; adding a tester is not always sufficient. Publishing
  the Meta app and obtaining Advanced Access through review are separate steps.
  [Discussion](https://www.reddit.com/r/webdev/comments/1ryispa/cant_receive_instagram_message_webhooks_from_real/)

Do not mix Instagram Login instructions with older Facebook Login / Page-token
instructions. For onboarding other businesses, complete the required Meta
permissions/access review. Test WhatsApp **coexistence separately** with an eligible
Business app number through Embedded Signup. A successful test-number conversation
does not prove synchronization with the WhatsApp phone app.

Reviewed October 11, 2026 using Meta’s published API references and the linked
developer reports. Some main Meta documentation URLs returned rate-limit errors;
their published Postman references were used where accessible.

## Account lifecycle regressions

The `native_messaging::native::test::http::lifecycle` tests cover two phone
connections sharing a WABA across separate Macro teams. Disconnecting one must
retain the other; disconnecting the last removes the provider subscription. A new
connection must not subscribe before an in-flight removal finishes. Late cleanup
after a subscription request must retain a sibling's subscription. Instagram
subscriptions remain scoped to the individual professional account.

Health tests exercise the real service and API response for authorization expiry,
Meta access denial, Macro administrator removal, temporary errors, setup errors
and successful recovery. In the browser, check the message both in Settings and
above the customer composer, with the draft preserved and sending disabled.


## Live founder demo

Use the existing authorized test recipients; no new business setup is needed.

1. Keep the `macro-whatsapp` stack, frontend, and public callback tunnel running.
   Open Settings → Integrations → Accounts → Manage and confirm both accounts
   are Connected. Refresh the temporary WhatsApp developer token before it expires;
   load it into the ignored local environment, recreate DSS, and reconnect the
   same test number. Never put the token in source or presentation material.
2. Put the native Macro customer channel beside the **customer-side** Instagram
   account or WhatsApp screen. For Instagram, send from the second account to
   `@dqniaf1`. For WhatsApp, send from the authorized personal phone to Meta's
   test number `+1 555-643-5162`; do not migrate the personal number.
3. Send a fresh greeting into each provider first to establish the current reply
   window. Watch it appear in Macro without refreshing, then reply from Macro
   and watch the original app. A short text exchange is the simplest demo.
4. Existing private attachment handling is implemented and verified, but outbound
   Instagram media on this localhost stack also requires the documented temporary
   public media capability. Do not use an image as the first rehearsal step.

An iPhone can be shown beside Macro with Apple's iPhone Mirroring (the phone stays
locked and is controlled from the Mac), or with a cable and QuickTime's connected-
device screen capture while operating the phone itself. Enable a quiet notification
mode before screen sharing. See [Apple's iPhone Mirroring guide](https://support.apple.com/en-us/120421)
and [QuickTime connected-device recording](https://support.apple.com/guide/quicktime-player/record-a-movie-qtp356b55534/mac).

The October 12 text checks measured 1.62 seconds from Macro enqueue to Instagram
acceptance/native persistence, and 5.22 seconds to WhatsApp's delivered receipt.
These are individual observations, not a percentile or guarantee of screen latency.
Normal incoming examples reached native storage in roughly 1–3 seconds; one delayed
message took two minutes during earlier testing. Provider delays, restarts and
recovery can take longer. Rehearse once on the network used for the presentation.

CEO framing: customer conversations now live inside Macro's native channels.
A team connects its business account, shares each customer conversation through
normal permissions, and replies from Macro while the customer stays in WhatsApp
or Instagram. This is a working local integration; production Meta onboarding,
real WhatsApp coexistence qualification and normal engineering review remain.
