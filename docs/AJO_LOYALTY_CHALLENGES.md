# Adobe Journey Optimizer — Loyalty Challenges (lab setup)

This note explains how the **AEP Orchestration Lab** simulates **AJO Loyalty Challenges** (private beta): a sandbox-aware **reward fulfillment gateway** on Cloud Run, metadata API scripts, and alignment with existing profile loyalty fields.

## Policy — metadata APIs from the terminal

Follow the same rule as [AJO content templates](AJO_CONTENT_TEMPLATE_API.md): call **`https://platform.adobe.io/ajo`** from **this machine** (terminal scripts or `curl`), not via Firebase Functions, when registering reward providers or creating challenges.

Firebase in this repo proxies **health** and **ledger** reads for the Tools UI. The reward provider itself runs on **Cloud Run** so Adobe can reach fulfillment over HTTPS.

The read-only Loyalty MCP workflow below also uses a dedicated authenticated
Firebase backend for metadata and member-state **GETs only**. This does not change
the terminal-only policy for registering providers, creating or editing challenges.
The backend also supports server-verified test-member signup;
that mutation is not exposed to MCP. The Lloyds page's Join button uses that
protected enrollment endpoint, with Adobe authentication held server-side.

## Read-only Loyalty MCP workflow

### Lloyds Loyalty web demo

Open **Demos > Lloyds > Loyalty** (`profile-viewer/lloyds-loyalty-demo.html`).
This page reuses the shared Spectrum configuration bar and the Center Parcs
profile drawer, including its compact proposition event timeline. Profile lookup
is the first configuration row, above environment settings, so the identifier
and lookup button are visible without scrolling through SDK options. It is not
pinned to an owner's sandbox.

The desktop progress-ring / compact task rail sits beside a scrollable banking
app adapted from the supplied Rewards mockup. **Home** opens first, with a
current-account card, quick actions, a Rewards teaser, accounts, spending and
transactions. The greeting uses the loaded profile's first name; the banking
amounts are explicitly illustrative, not AEP balances.

The **Rewards** tab contains the summary/breakdown, quick navigation and
**Win £1 million** banner. The original live journey Content Card mount is
immediately below that banner, before the featured-offer carousel. Switching
tabs preserves the delivered card, subscription, signup receipt and task state
without sending any new events. The carousel supports native touch scrolling,
mouse dragging, previous/next controls, pagination dots and keyboard arrows /
Home / End. Its six authored offers are visual previews: saving one updates
only the current page's saved-offers row, never Adobe activation or task state.
Context changes clear these saved previews. Prize-draw and banking placeholders
explicitly perform no real action.

Live participation controls, joined-challenge partner offers and the mobile task
rail remain below the Rewards benefits. They and the desktop rail render the
same Adobe task response. A successful Join scrolls to the live challenge area;
the lab's Refresh content card action opens Rewards at the delivered-card slot.
Both themes use the shared `--dash-*` palette, with page-scoped Loyalty accent
tokens in `home.css` and `aep-theme.css`.
There are no local task-completion buttons, invented progress, countdowns,
lock ordering or reward-unlock claims. After challenge signup the phone also shows
the authored Waitrose, TK Maxx and PureGym partner offers from the combined design;
these offers are fixed demo UI, not content supplied by AJO. Before state is
available, the desktop rail shows those authored offers as **Not verified**, with
an unknown progress count rather than fabricated task completion. The phone's Active/Completed controls
switch the same participation filter used by the top-bar API options. Task
initials derive from returned names, not invented merchant brands. Raw counters,
IDs and history remain available in collapsed **Challenge API details**.
There is no second body setup panel: **Loyalty API options** lives in the existing
top configuration gear alongside the shared SDK configuration. This is a Web SDK mobile
preview, not a native Mobile SDK integration or journey authoring interface.

1. **No Portal sign-in is required for `kirkham` or `apalmer`.** These are the
   exact server-side demo allowlist, not a browser-supplied authorization flag.
   The page sends neither a Portal token nor Adobe credentials in this mode.
   Before every member-state read or signup, the backend independently reads
   the configured Loyalty namespace and strictly resolves one AEP test profile
   by `loyaltyid`. Its scalar tenant `identification.core.loyaltyId` must match
   exactly, and every reported root test-profile marker must be boolean `true`.
   Missing, ambiguous, conflicting or non-test profiles are rejected before any
   Loyalty member operation. Configuration summaries and one-challenge metadata
   reads are available to this demo; challenge catalogue listing is not.
   Outside these two sandboxes, the existing signed-in Adobe Portal account and
   active sandbox-scoped MCP enrollment remain required. MCP access itself is
   still authenticated, sandbox-scoped and read-only; invalid MCP credentials
   never fall back to no-login demo access.
2. Select your sandbox and look up a profile. This loads the shared profile drawer
   independently of the Loyalty API or SDK. A profile loaded through the drawer
   also hydrates the Loyalty page's table model and enables its actions, without
   requiring a second lookup or repeating the drawer request. Same-value identity
   and sandbox notifications do not clear a valid loaded profile.
   If a previous operation is still ending, the current drawer's successful load
   is queued and rechecked against the selected identity before table hydration.
   No region entry is required: reads use the backend's documented Adobe default
   **va7**. If your sandbox uses another confirmed region, expand **Loyalty API
   options** in the top configuration gear and set **State region override**.
   Regions are never probed automatically. An unavailable Function is reported as
   a deployment error, not disguised as missing browser configuration.
   **Get task status** reads the configured Loyalty namespace before resolving the member
   identifier. Matching namespaces use the selected identifier; ECID can use the
   loaded profile's ECID; `loyaltyId` uses its loaded scalar Loyalty ID.
   For another namespace, explicitly enter that profile's
   member identifier. Profile data and Loyalty state are separate reads.
   Opening the profile drawer while a lookup is pending shares the same drawer
   request for the identifier, namespace, sandbox and visitor context. It does
   not supersede the page's lookup or leave model signals unavailable after the
   basic name/contact fields arrive. Identity/sandbox changes still discard
   older requests. Genuine drawer API failures retain their underlying message;
   they are not retried automatically or treated as a successful profile load.
3. Select **Get task status**. SDK injection, Decisioning enablement and the event
   tenant are not prerequisites for this read. Optionally enable the 30-second
   state refresh in the top-bar API options after a successful manual read. Only
   Adobe's returned `taskState` marks a task complete. Numeric progress requires
   both a reported goal/type and the corresponding numeric accumulator.
   Zero, false, missing counters and previous-cycle completions remain distinct.
   Automatic reads pause when hidden, after an error or after configuration changes;
   a successful manual task read resumes them. Polling is off by default and profile
   lookup does not start it. No task-completion events are
   synthesized.
4. To personalize, select your Tags environment/event
   destination in the shared configuration bar and inject Tags. Enter the reviewed event schema's tenant
   namespace and the exact AJO **content-card surface URI** in the top-bar Loyalty
   API options when an override is needed. By default, both the request and
   subscription use the shared Decisioning lab channel:
   `web://<hosting-host>/profile-viewer/content-decision-live-edge.html#ContentCardContainerLoyalty`.
   No manual surface configuration is needed for this channel. The returned card
   renders inside the Lloyds phone's `#ContentCardContainerLoyalty`, independently
   of the shared channel page URL. The existing
   `#ContentCardContainer` remains its compatibility wrapper; it is not the
   default requested surface. A previously configured `#ContentCardLoyalty` or
   `#ContentCardContainer` surface remains usable by explicitly entering that URI.
   No **Decisioning** toggle or card enablement is required. After a profile is
   loaded and Web SDK is available, the page subscribes with
   `subscribeRulesetItems` to the content-card schema for this exact surface
   **before** sending a personalization request. Journey ruleset propositions
   arrive through that callback, not the `sendEvent` response. Later SDK events
   can evaluate the subscribed rulesets again. **Refresh content card** is an
   optional explicit refresh, not an enablement step. No background polling or
   automatic event retry is added.
   The highest-ranked renderable JSON card is used; a hero proposition is never
   treated as a card. JSON title/body, image, action buttons and dismissal follow
   the supplied Luma content-card contract. Direct decision-response JSON cards
   remain supported. Native AJO string `title`/`body`, `imageUrl`, `actionUrl`
   and `meta.buttonLabel` are also supported. The request enables SDK ruleset
   evaluation and retains the SDK's default schema support, rather than limiting
   it to the old decision-only schema list. See Adobe's
   [Web SDK content-card configuration](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/channels/content-card/configure/content-card-configuration-sdk)
   and [`subscribeRulesetItems`](https://experienceleague.adobe.com/en/docs/experience-platform/collection/js/commands/subscriberulesetitems).
5. Explicit card display/click events retain the original proposition ID, scope,
   scope details, selected item and selection metadata, SDK identity and
   datastream override. Native journey cards use the SDK-provided `collectEvent`
   for display, interaction and dismissal. Duplicate callbacks do not repeatedly
   collect display events, and callbacks for a previous profile/sandbox are
   ignored. Failures are not retried automatically. Missing card
   content does not establish that the member has no challenges. The authored
   hero remains on the page; `manageMounts:false` prevents the manual runtime
   from replacing or relocating the authored mounts.
6. To trigger a journey configured for **`abandoned.search`**, load an AEP test
   profile, inject Tags/Web SDK, and select the reviewed event datastream and event
   tenant namespace in the top configuration bar. Kirkham automatically uses
   **`_demoemea`**, matching the reviewed TUI / Center Parcs configuration, so
   no extra tenant entry is required there. Other sandboxes still require their
   own reviewed namespace; switching away from Kirkham clears its default and
   switching back restores it. An explicit tenant override remains available.
   Select **Send abandoned.search**. The status shows SDK preparation, dispatch
   and acceptance while the profile timeline refreshes.
   This copies the TUI / Center Parcs Web SDK event contract: active browser ECID
   plus the selected profile identity, tenant `identification.core.ecid` and
   profile email, page/view details, and the configured datastream override.
   The page reads the scalar tenant `identification.core.loyaltyId` from the
   loaded profile-table rows (`_demoemea.identification.core.loyaltyId` in the
   supplied Operational Profile schema) into `profileLoyaltyId`. The same value
   appears as **Loyalty ID** in the shared profile drawer's **Loyalty** tab.
   The existing tenant-relative drawer field matching supports other sandbox
   tenant prefixes. The separate standard `loyalty.loyaltyID` array is not used
   to guess this scalar identification field.
   When `profileLoyaltyId` is present, the event also includes
   `identityMap.loyaltyId` (authenticated, non-primary) and tenant
   `identification.core.loyaltyId`. Missing values are omitted, not invented.
   This is resolved in the page from existing API rows, without a new Function
   deployment. Clearing/changing the loaded profile also clears the drawer ID.
   Selecting a different ECID from the active SDK visitor blocks the send.
   The action requires neither a Loyalty state region nor a working Loyalty
   state proxy. It does not update profile snapshots, synthesize task completion,
   request/display content or enable/activate a journey. The shared drawer's event
   timeline refreshes after SDK acceptance. Journey entry still depends on the
   configured AJO event, sandbox, identity and journey eligibility; SDK acceptance
   alone does not verify it. Each click sends at most one event, with no automatic
   retry. If the response is interrupted, check stored profile events before
   deliberately sending again, because ingestion may already have occurred.
7. The delivered **Join Challenge** button is an API-owned action:
   `interactId: "joinChallenge"` with an empty `actionUrl`. An empty target no
   longer hides the button. The renderer retains the selected consequence's
   `data.meta`, including **`challengeId`**; it never substitutes proposition,
   item or campaign IDs, or a hardcoded challenge ID. This works for both raw
   ruleset consequences and evaluated native content-card items. Metadata-only
   changes also update the rendered action.
   The rendered button has `data-interact-id="joinChallenge"` and
   `data-challenge-id` from `contentCardMeta.challengeId` (the selected card's
   `data.meta`). One explicit click calls the protected
   `POST /api/ajo-loyalty?sandbox=<selected sandbox>` route with `action: signup`,
   `profile_id`, `challenge_id`, `region`, `test: false` and `confirmed: true`.
   The member is always the selected AEP profile's loaded scalar Loyalty ID,
   never the Portal operator, a manual member override or a standard Loyalty ID array.
   The backend independently verifies demo sandbox scope (or Portal enrollment
   outside the demo allowlist), the Loyalty namespace,
   the exact member identity and AEP `testProfile: true` before calling
   `POST /ajo/loyalty/challenges/signup/{challengeId}` on the confirmed regional
   host (documented default va7). Adobe receives only
   `{ "profileId": "<scalar Loyalty ID>", "test": false }`.
   State API test mode is separate from the AEP test-profile safety guard;
   signup always uses `test: false`.
   HTTP 200 leaves **Challenge Joined** disabled. An Adobe **signup** HTTP 409
   leaves **Challenge Already Joined** disabled; a configuration/namespace 409
   is an error, not enrollment. Definite errors restore the original button and
   show **Unable to join challenge**, with response status/body in the console.
   A timeout, lost/unreadable response or malformed success leaves the action
   disabled as **Check challenge status**. There is no automatic POST retry.
   During the current page lifetime, receipts are scoped to sandbox, region,
   scalar member ID and challenge, including across profile lookups/card rerenders.
   A successful live active-state read for the same scope resolves an unknown
   outcome: explicit `optedIn: true` confirms enrollment; explicit
   `optedIn: false` permits a deliberate retry. Missing challenges or failed,
   foreign-member, different-region or State API test-mode reads do not unlock it.
   Reloading loses these in-memory receipts; read task state before retrying an
   interrupted signup after a reload.
   No manually constructed `loyalty.challenge.challenge_signup` event is sent.
   A separate `decisioning.propositionInteract` retains the original card
   attribution after confirmed enrollment. Tracking failure does not undo
   enrollment, enable another signup, or prevent an independent task-state read.
   The page automatically reads exact-member/exact-challenge live state after
   HTTP 200/Adobe signup 409, without completing tasks locally. A failed state
   refresh leaves enrollment confirmed and reports the refresh failure.
   **Journey entry is not verified:** the Signup API must not be assumed to
   trigger an existing event-conditioned journey. Verify that behavior separately;
   do not add a second Tags/manual signup-event listener.
8. After API-confirmed enrollment, the phone shows the fixed partner rows and their
   **View offer** buttons. A matching state response with `optedIn: true` can restore
   these rows after a fresh profile lookup without another signup. Both the
   challenge ID and the returned participation must match the delivered card,
   and the state read must use the loaded profile's scalar Loyalty ID in the
   configured `loyaltyId` namespace. A newly delivered challenge cannot reuse
   a previous challenge's signup receipt or partner actions.
   Each offer view sends one `commerce.purchases` event for the loaded profile,
   with `commerce.purchases.value: 1`, a fresh `crypto.randomUUID()` purchase ID,
   GBP order/item totals, quantity 1 and these exact products:

   | Partner | SKU | Product name | GBP |
   | --- | --- | --- | --- |
   | Waitrose | `WAITROSE-OFFER-001` | Waitrose Offer | 10.00 |
   | TK Maxx | `TKMAXX-OFFER-001` | TK Maxx Offer | 20.00 |
   | PureGym | `PUREGYM-SIGNUP-001` | PureGym Signup | 25.00 |

   Purchase events use `CdEdgeMounts.buildIdentityMap`, the active SDK ECID,
   secondary `identityMap.loyaltyId`, and tenant `identification.core` ECID,
   email and scalar Loyalty ID, with the selected datastream override.
   They disable decision rendering/default personalization and do not issue
   real merchant purchases or create gym accounts.
   The offer sheet opens only after SDK acceptance and supports close, Escape
   and keyboard focus return. Closing it sends no event. A later deliberate
   offer view is a new demo purchase with a new purchase ID; there is no
   automatic retry, especially after an interrupted response.
   Partner purchase receipts are not task-completion ticks: only Adobe state
   reads (**Get task status**, the post-signup refresh or explicitly enabled
   state polling) update confirmed progress.
   Profile/sandbox/configuration changes clear the visible partner
   receipts and open sheet; scoped API signup receipts remain in memory to prevent
   accidental resubmission. Stale asynchronous identity results cannot dispatch
   a purchase for a different context. The supplied combined design's Gymshark
   row is intentionally PureGym here, matching the reviewed campaign and events.

The optional challenge ID filters active state and reads that exact metadata
definition for names, joined by challenge/task IDs. **Completed** uses Adobe's
separate completed-participation endpoint; it cannot be combined with State API
test mode. Returned pagination is identified explicitly, not presented as full
history. Changing sandbox clears the profile, region, tenant and challenge
settings so the previous sandbox's configuration is not silently reused.

Release Hosting through the normal PR/Validate/merge workflow for the API Join
handler and partner offer changes. **Get task status and Join Challenge require the updated
existing `aepProxy` Function and `/api/ajo-loyalty` Hosting rewrite**. No-login
access for `kirkham`/`apalmer` also requires the updated Function; Hosting alone
cannot remove the former backend Portal check. Other sandboxes still require
Portal authentication. An optional region override
is needed only when the documented va7 default is unsuitable. Rendering a card does not
enable that backend. The earlier MCP release alone does not enable Firebase
browser access or the separate test-member signup route.
The Functions release requires an authorized release owner; an IAM-blocked
release must not be bypassed or mistaken for a Hosting fix. Local browser checks use
synthetic fixtures and do not prove live Adobe access or reward delivery:
`npm run test:lloyds-loyalty`.
If Hosting returns an HTML 404 for this endpoint, the task-status button reports
that `aepProxy` and the Hosting route need updating by an authorized release owner. SDK
injection cannot substitute for that backend release; profile lookup remains
available independently.

### MCP reads

The source registers these tools in General (`/mcp`) and the existing Decisioning
connection (`/mcp/decisioning`, Coworker `lab-dps`). No browser-held Adobe token or
new credential is needed.

| Tool | Adobe GET |
|------|-----------|
| `lab_ajo_loyalty_config` | `/ajo/loyalty/metadata/config` (safe identity/event summary only) |
| `lab_ajo_loyalty_challenge_list` | `/ajo/loyalty/metadata/challenges?limit=25` (1-100; optional `start` cursor) |
| `lab_ajo_loyalty_challenge_get` | `/ajo/loyalty/metadata/challenges/{challenge_id}` |
| `lab_ajo_loyalty_profile_state` | `/ajo/loyalty/challenges/state?pid={profile_id}&v=2` (optional `challenge_id` as `cid`, and explicit `test`) |
| `lab_ajo_loyalty_profile_challenges` | `/ajo/loyalty/challenges/{profile_id}?state=active` (or `complete`) |

1. Call `lab_mcp_access_info` and choose an authorized sandbox.
2. Read `lab_ajo_loyalty_config` to confirm `data.namespace`. Do not assume it
   matches the coffee lab's `loyaltyId`, Email, ECID or an internal UPS ID. Provider
   and sink definitions are omitted because they can contain authentication.
3. List a bounded challenge page; follow Adobe's returned cursor explicitly.
   Read the exact challenge ID for tasks, dates, reward definitions and completion
   rules. Metadata publication alone is not member eligibility or participation.
   The observed Postman response uses `data.children`, `data._page` and
   `data._links`, with each challenge's ID in `_id`. The adapter also accepts the
   published OpenAPI's `data.challengeList` format (`get_id` on metadata).
   Both formats are preserved, not renamed or flattened.
4. Confirm the existing test member's identifier in that namespace and the
   sandbox's Adobe region. State reads default to `va7`, as the published State
   API production server does. Set `region` to a confirmed regional suffix (for
   example `nld2`) or `global` for `platform.adobe.io`; do not probe regions to guess.
   Metadata always uses `platform.adobe.io`.
5. Read member state; optionally filter to the exact challenge. Use
   `state:"complete"` on `lab_ajo_loyalty_profile_challenges` for completed
   participation. Tasks, zero counters, missing values, completion history and
   returned pagination are preserved rather than synthesized. Member-state reads
   still require `data.challengeList`; a metadata `children` response cannot
   establish progress. Missing or invalid collections are errors, not "no challenges".

The dedicated Loyalty handler inside `aepProxy` independently checks a user-generated MCP key or
validated Adobe IMS enrollment, the exact sandbox and configured Adobe org.
Shared operational keys and caller-supplied platform URLs, paths, methods or
authorization overrides are not accepted. Adobe calls use the existing
`adobeAuth.js` token cache and `aepHeaders()`. All API operations are GET-only,
make one attempt, reject redirects, time out after 60 seconds and cap response
bodies at 2 MiB. Adobe status and structured error bodies are returned to the
authorized caller, not written to tool audits. Configuration errors retain only
allowlisted scalar diagnostics, not embedded settings. Stop on 401/403; entitlement and
Loyalty permissions are separate from a successful Decisioning call.

There are no signup, withdrawal, event-send, reward-fulfillment, challenge-write or
balance-update tools. Challenge completion does not prove provider fulfillment or
a credited points balance. This is inspection support for later demo work, not a
new customer-facing or unrestricted proxy.

**Release boundary:** offline contract tests do not call Adobe. Live verification
requires the normal feature branch / PR / Validate / merge / exact-main release
of the named Function and MCP service, preserving all runtime secret bindings.
Refresh the existing MCP connection and start a new chat after release. The
optional Hosting rewrite `/api/ajo-loyalty` needs its normal Hosting release; MCP
uses the named Function directly. Do not describe a locally registered tool or
mock response as a successful live Loyalty test.

API contracts: [metadata](https://developer.adobe.com/journey-optimizer-apis/references/loyalty-challenges)
and [member state](https://developer.adobe.com/journey-optimizer-apis/references/loyalty-challenges-state).

### Authentication and deployment configuration

The two authentication hops have different purposes:

1. **Client to lab:** the existing `lab-decisioning` connection supplies its
   sandbox-scoped MCP key, or Coworker forwards its Adobe IMS session. The
   backend independently verifies the Portal principal and exact sandbox.
   Browser demo calls in `kirkham`/`apalmer` instead use the explicit no-login
   test-profile boundary described above; they do not borrow a Portal/MCP
   identity. Other browser sandboxes retain UID-bound Portal enrollment.
2. **Lab to Adobe:** the Loyalty handler uses the existing `createAdobeAuth()` to obtain/cache a
   server-to-server IMS token. `aepHeaders()` supplies `Authorization`,
   `x-api-key` and `x-gw-ims-org-id`; the route sets the principal's
   `x-sandbox-name`. Caller credentials are never reused as Adobe API overrides.

The handler runs inside the existing `aepProxy`: region `us-central1`, 120-second Function
timeout, and the existing Secret Manager bindings `ADOBE_CLIENT_ID`,
`ADOBE_CLIENT_SECRET`, `ADOBE_IMS_ORG` and `ADOBE_SCOPES`. The Adobe read itself
has a 60-second timeout. There is no new Postman environment, MCP connection,
credential file or token-pasting step. A credential that works for Decisioning
is not proof of Loyalty entitlement; stop and review the existing Adobe
integration/product permissions if the Loyalty read returns 401/403. Do not
silently add scopes or change secret values.

The metadata host is `platform.adobe.io`. The state region, configured identity
namespace and existing member ID must be confirmed before a member read.
Neither sandbox `kirkham` nor a challenge ID determines the state region.
The exported Postman `x-schema-id` belongs to schema-oriented APIs and is not
required by the published Loyalty contracts; this adapter does not forward it.

For a release owner, the rollout is:

1. Commit/push the focused feature branch, open a PR, and complete required
   Validate checks and review. Do not deploy the worktree.
2. After merge and release approval, deploy only `functions:aepProxy` through the
   existing Firebase workflow from clean `main` at freshly fetched `origin/main`.
   Preserve the four Adobe secret bindings and verify the Function's region,
   then release Hosting so `/api/ajo-loyalty` targets `aepProxy`.
   No separate Loyalty Function or IAM grant is introduced. Existing IAM and
   deployment gates still apply; updating an existing Function is not a guarantee
   that all deployment permissions are available.
3. Release the MCP image for that exact merged SHA with the existing guarded
   `tools/aep-lab-profile-mcp/scripts/release-main.sh`, retaining the running
   service's configuration. The release script's account/project guard is
   intentional: use the authorized release owner, never change the guard to
   accommodate a different account.
4. Verify revision/build identity, refresh the existing connection and start a
   new chat. Confirm all five Loyalty tools appear. MCP calls the direct
   Function URL `/aepProxy/api/ajo-loyalty`; browser calls retain
   `/api/ajo-loyalty`. Both enter the same protected handler before generic
   proxy processing. Hosting is not needed for MCP's direct Function call.
5. Run configuration, one metadata page and one exact member-state read.
   Confirm Adobe status and actual returned task fields, not just tool discovery.

### Retrieving a member's task status

After release, the read-only sequence on the existing connection is:

```text
lab_ajo_loyalty_config(sandbox="kirkham")
lab_ajo_loyalty_challenge_list(sandbox="kirkham", limit=25)
lab_ajo_loyalty_challenge_get(sandbox="kirkham", challenge_id="<metadata _id or get_id>")
lab_ajo_loyalty_profile_state(
  sandbox="kirkham",
  profile_id="<existing ID in the confirmed namespace>",
  challenge_id="<same challenge ID>",
  region="<confirmed Adobe region>"
)
```

The last tool performs a bodyless
`GET /ajo/loyalty/challenges/state?pid=<member>&cid=<challenge>&v=2`.
Without `cid`, Adobe documents the response as active challenges, not the
member's complete history. Use `lab_ajo_loyalty_profile_challenges` with
`state:"complete"` when completed participation is needed. The optional State
API `test` flag is separate from the AEP profile's `testProfile` attribute; do
not infer it from that attribute or silently switch modes.

| State response field | Interpretation |
|----------------------|----------------|
| `challengeList[].challenge_id` | Join to the selected metadata `_id` / `get_id`. |
| `challengeList[].optedIn` | Member opt-in as returned by Adobe; preserve `false` and distinguish missing. |
| `challengeList[].tasks[].taskId` | Join to the metadata task by ID, not array order or display name. |
| `tasks[].taskState` | Adobe's task status, not the metadata's draft/published state. |
| `tasks[].variables` | Goal, accumulation type and filters; retain actual values rather than guessing units. |
| `tasks[].accumulators` | Returned `qty`, `spend`, `days` and item details; zero is meaningful. Select the measure only after checking the task definition. |
| `tasks[].taskCompletions` | Completion history for that task; repeating tasks may reset their current counters. |
| `challengeList[].challengeCompletions`, `completionDate` | Challenge completion evidence, not proof of reward delivery or points credited. |

For example, "buy three items" can be **one task** with a goal of three:
`tasksToComplete:1` is not a purchase counter. Report the task's actual goal,
accumulator and returned state. Do not fabricate "0 of 3" when the accumulator
is missing, mark a member eligible from publication alone, or treat an empty
active page as proof they never completed a challenge.

The saved metadata response can validate parsing locally, but does not contain
a member's task status. Live namespace, region, member read and Loyalty
entitlement remain separate acceptance checks.

## What AJO expects from a reward provider

AJO Loyalty Challenges use a **standard challenge pattern** (not BYOD):

| Responsibility | Who handles it |
|----------------|----------------|
| Task progress (e.g. buy 3 coffees) | **AEP experience events + AJO** — event definitions map incoming XDM to task counters |
| Reward fulfillment when goal met | **Your reward provider URL** — AJO POSTs a fulfillment payload; you accept and act |
| Audience eligibility | **AEP segment** on the challenge |
| Member identity | **Loyalty admin namespace** aligned with profile `loyaltyId` |

**You are a reward gateway / fulfillment endpoint**, not a passive log collector. When a member earns a reward, AJO calls your registered URL with a fulfillment payload. A production provider would credit points in a loyalty system, issue coupon codes, update member balances, or call downstream APIs. The lab provider accepts the payload, returns `{ "status": "accepted", "transactionId": "<uuid>" }`, and logs to an in-memory ledger. Syncing fulfillment to AEP profile `loyalty.points` is noted as a future enhancement.

Progress tracking happens entirely in **AJO + AEP events** — the reward provider is invoked only at fulfillment time.

## Lab reward provider (Cloud Run)

Source: [`tools/loyalty-reward-provider/`](../tools/loyalty-reward-provider/)

Single service **`loyalty-reward-provider`** with **path-based sandboxes**:

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/health` | GET | None | Service health |
| `/{sandbox}/health` | GET | None | Sandbox ledger stats |
| `/{sandbox}/v1/fulfill` | POST | `X-API-Key` | `{ "status": "accepted", "transactionId", "sandbox" }` |
| `/{sandbox}/v1/ledger` | GET | `X-API-Key` | In-memory ledger for that sandbox |
| `/oauth/token` | POST | Optional | OAuth token generator stub |

Example fulfillment URL for **apalmer**:

```
https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill
```

Register in AJO as **`apalmer loyalty provider`** (not “fake loyalty”).

Deploy:

```bash
export LOYALTY_PROVIDER_API_KEY="$(openssl rand -hex 32)"
npm run loyalty-provider:deploy
```

Local smoke tests:

```bash
npm run loyalty-provider:test
```

Legacy aliases `npm run fake-loyalty:*` still work.

See [`tools/loyalty-reward-provider/README.md`](../tools/loyalty-reward-provider/README.md) for curl examples.

## Required HTTP headers (Platform / AJO loyalty metadata)

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <IMS access_token>` |
| `x-api-key` | OAuth client id |
| `x-gw-ims-org-id` | IMS org id |
| `x-sandbox-name` | Technical sandbox (e.g. `apalmer`) |

OpenAPI: [loyalty-challenges.yaml](https://github.com/AdobeDocs/journey-optimizer-apis/blob/main/static/loyalty-challenges.yaml)

## Reset lab config (idempotent)

Clears prior lab challenges, event definitions, and reward providers in a sandbox:

```bash
npm run ajo:loyalty-reset -- --sandbox apalmer
```

Implementation: [`scripts/ajo-loyalty-reset.mjs`](../scripts/ajo-loyalty-reset.mjs)

Deletes (when present):

- Challenges: `AEP Lab Standard Challenge`, `Buy 3 Coffees — Lab Challenge`
- Events: `AEP Lab Purchase Event`, `AEP Lab Coffee Purchase Event`
- Providers: guid `15b4d932-9d69-4c3a-b6bd-f8daa5656fdd`, names `AEP Lab Fake Loyalty`, `apalmer loyalty provider`

Global config (identity namespace) is retained.

## End-to-end setup — coffee challenge (script)

Idempotent orchestration: config namespace, sandbox provider URL, coffee event definition, audience, **buy 3 coffees** task, challenge publish:

```bash
npm run ajo:loyalty-reset -- --sandbox apalmer   # optional clean slate
npm run ajo:loyalty-setup -- --sandbox apalmer
```

Use `--dry-run` to print planned steps. Journey auto-create may return **403003** — finish **Generate journey → Publish** in Loyalty admin if API key lacks journey authoring.

Implementation: [`scripts/ajo-loyalty-setup.mjs`](../scripts/ajo-loyalty-setup.mjs)

### Coffee use case (apalmer)

| Item | Value |
|------|--------|
| Challenge | **Buy 3 Coffees — Lab Challenge** |
| Task | `aep-lab-coffee-purchase-task` — purchase qty goal **3** |
| Event | `loyalty.coffee.purchase` (`AEP Lab Coffee Purchase Event`) |
| Reward | 100 points via registered provider |
| Provider name | `apalmer loyalty provider` |
| Fulfillment URL | `https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill` |

After setup, update IDs in [`web/profile-viewer/loyalty-reward-provider-config.js`](../web/profile-viewer/loyalty-reward-provider-config.js) under `sandboxProfiles.apalmer`.

### Coffee use case (kirkham — Alan Kirkham)

Same challenge pattern as apalmer; audience is **Loyalty Members** (no hotel segment in kirkham yet):

```bash
npm run ajo:loyalty-reset -- --sandbox kirkham   # optional clean slate
npm run ajo:loyalty-setup -- --sandbox kirkham --skip-journey
```

| Item | Value |
|------|--------|
| Challenge | **Buy 3 Coffees — Lab Challenge** |
| Task | `aep-lab-coffee-purchase-task` — purchase qty goal **3** |
| Event | `loyalty.coffee.purchase` (`AEP Lab Coffee Purchase Event`) |
| Reward | 100 points via registered provider |
| Provider name | `kirkham loyalty provider` |
| Fulfillment URL | `https://loyalty-reward-provider-a5xduykcsq-uc.a.run.app/kirkham/v1/fulfill` |
| Audience | **Loyalty Members** |

After setup, update IDs in [`web/profile-viewer/loyalty-reward-provider-config.js`](../web/profile-viewer/loyalty-reward-provider-config.js) under `sandboxProfiles.kirkham`.

## Register reward provider (script)

```bash
export LOYALTY_PROVIDER_API_KEY='same-secret-as-cloud-run'
npm run ajo:loyalty-register-provider -- \
  --url https://<cloud-run-host>/apalmer/v1/fulfill \
  --sandbox apalmer \
  --name "apalmer loyalty provider"
```

Implementation: [`scripts/ajo-loyalty-register-provider.mjs`](../scripts/ajo-loyalty-register-provider.mjs)

## Tools UI

Profile Viewer → **Loyalty reward provider** (`loyalty-reward-provider.html`):

- Sandbox picker (global lab pattern)
- Sandbox-scoped fulfillment URL
- Reward provider role explanation
- Health + ledger via `/api/loyalty-provider/*` Firebase proxy

## Profile generator — loyalty fields

| UI / generator | Profile path |
|----------------|--------------|
| Loyalty ID | `_demoemea.identification.core.loyaltyId` |
| Points | `loyalty.points`, `loyaltyDetails.points` |
| Tier | `loyalty.tier` |

Align Loyalty admin **Global settings → identity namespace** with **`loyaltyId`**.

## API sequence (reference)

Base: `https://platform.adobe.io/ajo`

| Step | Method | Path |
|------|--------|------|
| Get org config | GET | `/loyalty/metadata/config` |
| Create reward provider | POST | `/loyalty/metadata/config/rewards/providers` |
| Delete reward provider | DELETE | `/loyalty/metadata/config/rewards/providers/{providerId}` |
| Create event definition | POST | `/loyalty/metadata/config/events` |
| Delete event | DELETE | `/loyalty/metadata/config/events/{eventId}` |
| Create challenge | POST | `/loyalty/metadata/challenges` |
| Delete challenge | DELETE | `/loyalty/metadata/challenges/{challengeId}` |
| Publish | POST | `/loyalty/metadata/challenges/{id}/publish` |
| Journey from challenge | PUT | `/loyalty/metadata/journeys/from-challenge/{id}` |

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| 403/404 on metadata APIs | Beta not enabled or missing IMS scopes |
| Journey initialize **403003** | OAuth client lacks journey authoring — create journey in Loyalty admin UI |
| AJO cannot reach provider | Cloud Run not public; wrong sandbox path in URL |
| Tasks never progress | Event definition / XDM mismatch; profile not in audience |
| Fulfillment 401 | `X-API-Key` mismatch between AJO admin and `LOYALTY_PROVIDER_API_KEY` |

## Migration from `fake-loyalty-provider`

| Old | New |
|-----|-----|
| `https://fake-loyalty-provider-a5xduykcsq-uc.a.run.app/v1/fulfill` | `https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill` |
| Service `fake-loyalty-provider` | `loyalty-reward-provider` |
| `/api/fake-loyalty/*` | `/api/loyalty-provider/*` (legacy path still works) |
| `FAKE_LOYALTY_API_KEY` | `LOYALTY_PROVIDER_API_KEY` (Firebase secret name unchanged: `FAKE_LOYALTY_API_KEY`) |

## Related

- [tools/loyalty-reward-provider/README.md](../tools/loyalty-reward-provider/README.md)
- [AJO_CONTENT_TEMPLATE_API.md](AJO_CONTENT_TEMPLATE_API.md)
