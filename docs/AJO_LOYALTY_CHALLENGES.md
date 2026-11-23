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

### Loyalty context on profile events

Lloyds and Jet2 share optional event enrichment at
`_experience.ajo.loyalty.challenge`: exact challenge `id`, independently resolved
`name` when available, and string `metadata`. Card interactions retain their
original Adobe proposition/item/scopeDetails and add the card's consequence,
action and supplied title. Confirmed or already-joined card signup records that
API outcome on the existing interaction; it does not emit an additional event.
Native display collection remains unchanged. Journey activity references are
shown as Adobe activities, not invented campaigns.

The inspector's existing GBP 10 purchase includes the clicked Spend
challenge/task, with `contextType:spendDemoPurchase` and
`qualification:notConfirmed`. It does not borrow a visible card's proposition,
change commerce/identity fields, write progress or claim qualification,
completion, Journey entry or reward issuance.

Before enrichment, the explicit event datastream must match
`GET /api/events/config?sandbox=...`. The resolved registered schema from
`GET /api/schema-viewer/registry` must support native challenge string `id/name`
and a string-map `metadata`; results cache for five minutes per sandbox/datastream.
Kirkham's Operational Event schema has these fields. Other schemas are not
assumed compatible. Unverified or unsupported configuration keeps the original
event unchanged and exposes the reason through a `[Loyalty event context]`
console warning and `LoyaltyDemoEventContextDebug.getLatest()`. This does not
provision or modify any Adobe schema.

Check the outgoing event XDM and existing Spend evidence for intended context.
After ingestion latency, the profile timeline renders stored Loyalty
challenge/task/card context and supplied Adobe activity/proposition/item
references. A purchase's context is not evidence that Loyalty accepted it:
Challenge API details and their genuine accumulators/state remain authoritative.

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

The **Mobile app / Web page** control changes presentation only. The website
preview uses an original Lloyds-inspired banking header, navigation and rewards
hero informed by the supplied saved-page archive, without importing its scripts,
trackers or third-party styles. The same live Loyalty Content Card and Featured
Offers carousel nodes move between the two previews; switching neither requests
decisions nor resets subscriptions, signup receipts or accepted purchase offers.
The mobile app layout is unchanged. Both previews support light and dark themes
and narrow browser widths.

The shared challenge-progress panel places the completion count and task caption
to the right of its text-free progress ring, above the challenge title. It uses a task rail,
current-task emphasis and a completion banner, while retaining Adobe's actual
states and the reward-delivery caveat. **Profile offers** beneath it shows only
the valid items received through `ajo:featured-offers`, in returned order, with
safe images, available copy/priority fields and expandable complete item response
details. Local fallback offers are excluded and a profile change clears the prior
results. This is an inspection view, not an independent eligibility evaluation.
Joining a challenge no longer scrolls the phone to the static partner-offer list;
the user stays in place and can use the Featured Offers carousel for purchases.

The **Rewards** tab contains the summary/breakdown, quick navigation and
**Win £1 million** banner. The original live journey Content Card mount is
immediately below that banner, before the featured-offer carousel. Switching
tabs preserves the delivered card, subscription, signup receipt and task state
without sending any new events. The carousel supports native touch scrolling,
mouse dragging, previous/next controls, pagination dots and keyboard arrows /
Home / End. Featured offers arrive from the Data Collection rule's
`CustomEvent("ajo:featured-offers", { detail: { offers, propositionId,
propositionScope, propositionScopeDetails } })`, after it processes the AJO
Code-based Experience at location **`featured-offers`**. This is the Adobe
personalization location, not a replacement DOM ID: the existing carousel
and `renderFeaturedOffers(items)` remain the presentation layer.

`requestFeaturedOffers()` now explicitly requests that experience through the
configured Web SDK: `sendEvent` with `renderDecisions: false` and
`personalization: { surfaces: ["web://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html#featured-offers"] }`.
This is the existing shared AJO surface, not a relative fragment or a surface
derived from the Rewards document URL. Like the Center Parcs
decision request, it first resolves the browser ECID, combines it with the
selected test profile's identity, and preserves the configured datastream
overrides and reviewed tenant identification fields. It is attached to the
existing `tui-profile-changed` event emitted by `lookup()` only after profile
table and drawer setup succeed. The existing operation queue delays dispatch
until that setup finishes. If SDK injection happens later, the existing
`aep-demo-tags-injected` lifecycle also schedules the request. Failed/missing
profile setup, non-test profiles, changed context and mismatched ECIDs block
dispatch. No offer ranking or eligibility logic is added.

Immediately after a successful SDK response, the function dispatches
`CustomEvent("ajo:featured-offers-response", { detail: result })` with the raw
result for a Data Collection Core Custom Event rule, and logs that dispatch.
The function also logs the complete SDK response and `result.propositions`
separately, but never renders them or dispatches the offers event itself.
Data Collection processes that raw response and dispatches `ajo:featured-offers`; no received
event means no live carousel result, even if the SDK request succeeded.
`window.requestFeaturedOffers()` exposes the same guarded request for console
testing. Repeated calls/loads coalesce while busy and suppress duplicate
submissions for the same selected profile, browser identity, SDK instance,
tenant and datastream context. A submitted request is reserved before awaiting
its response, so an uncertain result is not automatically replayed. A profile,
sandbox or visitor change resets that reservation; a new SDK/datastream context
also permits a new request. The console entry point obeys the same protection.

The existing event listener accepts non-empty object entries with string
`id`, `merchant` and `title`, keeps the first five valid offers in strategy order,
and replaces the cards through `renderFeaturedOffers(items)`. Media uses the
HTTP(S) URL and CSS URL guards; copy remains text. Complete offer objects,
including `detailTitle`, `detailSubtitle`, `detailDescription`, `image`, `cta`,
`endDate`, `propositionId`, `propositionScope`, `propositionScopeDetails` and
`propositionItemId` and `sku`, remain available to the detail popup and purchase
action. Missing per-item proposition ID/scope/scope-details inherit
the event-level values; explicit item metadata takes precedence. The AJO CTA is
shown in the detail popup. Featured-offer display/interaction tracking is
deliberately not added yet; existing challenge Content Card tracking remains.
The listener is registered before app initialization and retains an early response.
Repeated AJO ID/order signatures preserve the existing cards and scroll position;
changed IDs or order rerender. The carousel initially shows **Loading personalised
offers…**, with no mock cards. After five seconds without valid AJO offers, its
six authored development previews appear with an explicit preview label. A valid
late response replaces them and cancels the fallback. The rest of the app,
including Ready to use, does not wait for AJO.
Card clicks (or Enter/Space on a focused card) open a shared accessible
decision-driven detail dialog; Escape, its close button and backdrop close it.
Viewing sends no purchase. The existing `+` stops propagation and sends one
`commerce.purchases` event through the same `prepareProfileEvent` and
`dispatchProfileEvent` helpers as the challenge partner purchase flow.
The item must supply a nonblank `sku`; it is copied unchanged into
`productListItems[0].SKU`, never inferred from merchant or copy.
The shared payload builder supplies UUID event/order IDs, an ISO timestamp,
`commerce.purchases.value: 1`, one product with quantity 1, priceTotal 10 and
currencyCode GBP for Featured Offers. The selected test profile's Email,
scalar loyaltyId, active SDK ECID, reviewed tenant and datastream are required.
The button stays busy with + until acceptance, then shows the existing tick and
adds the complete offer to the purchase row. Duplicate in-flight/accepted clicks
do not resend. Failures leave + available and explicitly warn that an uncertain
submission may already have been ingested; inspect profile events before retrying.
SDK acceptance is not cashback activation, profile-storage proof, challenge
completion or reward delivery. Static challenge partner offers are retained
until live profile ingestion and Loyalty task evaluation have been verified.
Context changes clear purchase-row state. Prize-draw and banking placeholders
explicitly perform no real action.
Identity/sandbox changes also clear the prior personalised carousel result and
restart its wait, so another profile does not inherit the previous result.
The rule still owns request/identity correlation because its event contract has
no profile or sandbox token.

**Refresh card & offers** uses the existing button to refresh the challenge
Content Card, then explicitly re-request Featured Offers for the same loaded
profile. Both run under the existing busy/context guard. Explicit refresh bypasses
only the automatic Featured Offers same-profile request reservation; profile/SDK
ready notifications and the console function remain deduplicated. The current
carousel stays visible while waiting and the raw response still goes through
Data Collection and `ajo:featured-offers`. Switching profile, enrolment and
purchase state are not reset. An unchanged ordered-ID response retains the
existing cards; a changed result replaces them. Refresh does not force audience
qualification, and an error is shown without automatically retrying either request.

An explicit Content Card refresh with an empty proposition array removes the
previous card instead of leaving obsolete content visible. A newer ruleset
subscription update delivered during the request takes precedence over an
older direct response. Unchanged cards and successful empty responses finish
with an explicit status; empty responses are recorded in proposition evidence.
SDK preparation, identity, subscription, decision request and display collection
have separate status messages. The existing 120-second request deadline releases
the UI even when an SDK/shared-drawer promise does not settle. A late resolution
cannot continue into a new request context. This does not cancel an Adobe
operation already submitted; inspect its state before retrying, and do not
automatically retry. Repeated subscription callbacks still deduplicate display
tracking; Content Card SDK behavior is separate from the carousel CustomEvent.

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
   A newly created profile can exist before any experience events are indexed.
   The shared `profileEventsProxy` treats only Adobe's explicit entity-absence
   response (`UPLIB-201001-404`, HTTP 404, `Entity not found.`) as no indexed
   events, after the remaining event lookup. This is not a failed profile lookup
   or proof that an event was never sent. Authentication, other API failures and
   missing later pages remain errors. This correction requires a Functions
   release of `profileEventsProxy`; changing Hosting or `aepProxy` alone is not
   sufficient.
3. Resolving a profile with a scalar Loyalty ID automatically performs the existing
   read-only state lookup. It waits for profile resolution to finish, displays
   joined progress for records reporting `optedIn:true` and separate available
   cards for `optedIn:false`; lookup never submits signup.
   Repeated notifications for the same resolved profile are deduplicated; a fresh
   lookup reads again. Context changes discard queued reads and stale responses.
   The automatic read resolves the loaded profile in the configured namespace,
   ignoring the manual debugging member override.
   **Get task status** remains available for debugging with the existing filters
   and unjoined records shown separately in **Available challenges**.
   SDK injection, Decisioning enablement and the event
   tenant are not prerequisites for either read. Optionally enable the 30-second
   state refresh in the top-bar API options after a successful read. Only
   Adobe's returned `taskState` marks a task complete. Numeric progress requires
   both a reported goal/type and the corresponding numeric accumulator.
   Zero, false, missing counters and previous-cycle completions remain distinct.
   Adobe advances completed tasks and challenges from `complete` to `sent`
   after completion processing. Both states (and `completed`) count as complete
   in the desktop and phone displays; `sent` is not an unfinished purchase.
   Raw states remain in API details. An incomplete or unknown current task state
   is never completed merely because `taskCompletions` contains history.
   A completed challenge is labelled explicitly, but neither this label nor
   `sent` proves that points were credited to the profile's balance.
   Automatic reads pause when hidden, after an error or after configuration changes;
   a successful manual task read resumes them. Polling is off by default and profile
   lookup performs a one-off read without enabling the polling option. No task-completion events are
   synthesized.

   All state reads are parsed by `normaliseChallengeResponse` and classified by
   `classifyChallenges` in the shared Loyalty model. The same rendering boundary
   applies to automatic lookup, manual status, polling, participation tabs,
   post-signup and Content Card state refreshes. Boolean strings are normalized
   once; unknown participation is shown only as an API-details warning, never
   assumed joined or available. Invalid challenge IDs, duplicate IDs and malformed
   lists/tasks produce explicit errors rather than silently losing records.
   Missing tasks are safely represented as unreported, without inventing goals.

   **Available challenges** renders one ID-keyed card per unjoined record in the
   current response/filter, on both the inspector and mobile Rewards views. It
   shows supplied names, descriptions, dates, state, reward denomination/value
   and task counts when reported. `getChallengeSummary` uses Adobe-authored task
   descriptions, recognized target variables or task names; it never reads
   accumulators to invent available-challenge progress or infers GBP.
   Every card includes expandable challenge/task API details.

   `joinAvailableChallenge` passes the selected ID and the loaded scalar Loyalty
   member to the existing `submitSignup` API action. It requires an AEP test
   profile and reuses existing duplicate/uncertain-outcome receipts. The available
   card stays available after signup acceptance until a fresh `readTasks` response
   reports `optedIn:true`; only then does the shared renderer move it into progress.
   Definite rejections restore Join and show the error on the card. An accepted or
   uncertain outcome instead offers **Check challenge status**, a read-only check
   rather than a duplicate POST. Content Card tracking and Journey events remain
   independent. Its post-signup state refresh now reads the member list, so other
   returned challenges are not lost by restricting the request to the selected ID.

   No raw Spend accumulator display is implemented. Joined tasks retain the
   existing task-state/count rendering and progress helper; missing current
   accumulators are not zero. There are no locally simulated Loyalty counters.
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
   **Your challenges** renders every matching renderable JSON Content Card.
   One card fills the available width without controls or empty trailing space.
   Multiple cards use a compact horizontal strip: one primary card plus a peek
   of the next, native touch/trackpad scrolling, scroll snapping, mouse dragging,
   compact circular arrows and pagination indicators. A focused viewport supports
   ArrowLeft/ArrowRight/Home/End; navigation stops at either end. The indicator
   reports **Chosen for you · N of count**. Width, spacing, corners and image
   proportions follow Featured Offers, without copying its merchant-logo spacing.
   These are independent DOM, styling and interaction handlers: this AJO Content
   Card carousel is not the Featured Offers Decisioning carousel.
   Cards are ordered by descending effective rank (`data.meta.rank`, then
   `scopeDetails.rank`), preserving response order for ties and placing unranked
   cards last. This retains the old selector's highest-ranked first card.
   A hero proposition is never treated as a card. JSON title/body, image, action buttons and dismissal follow
   the supplied Luma content-card contract. Direct decision-response JSON cards
   remain supported. Native AJO string `title`/`body`, `imageUrl`, `actionUrl`
   and `meta.buttonLabel` are also supported. The request enables SDK ruleset
   evaluation and retains the SDK's default schema support, rather than limiting
   it to the old decision-only schema list. See Adobe's
   [Web SDK content-card configuration](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/channels/content-card/configure/content-card-configuration-sdk)
   and [`subscribeRulesetItems`](https://experienceleague.adobe.com/en/docs/experience-platform/collection/js/commands/subscriberulesetitems).

   Temporary read-only Content Card diagnostics capture the complete callback
   `propositions` before ranking/presentation. Open **Last successful response /
   proposition evidence → Content Card pre-selection diagnostics** beneath the
   demo, or run `window.LloydsLoyaltyContentCardDebug.getEvaluated()` in DevTools.
   Its `propositions` preserves the full response array. `inventory` lists every
   matching-surface item/consequence, including rejected/default entries, with
   title/body, CTA, challenge metadata, rank, priority and original attribution
   fields. `totalContentCardCandidates` counts candidates accepted by the existing
   selector; `selectedCandidate` reports the highest-ranked first candidate for
   backwards-compatible evidence. `totalPropositions`
   counts the full input array; `surfacePropositions` counts exact surface matches.

   `window.LloydsLoyaltyContentCardDebug.getLatest()` also exposes direct-response
   fallback snapshots, explicitly labelled `evaluated:false`. Do not interpret
   unevaluated direct rules as proof of eligible Journey cards. Snapshots include
   the captured profile identifier/time and clear on context reset. They stay in
   page memory only, preserve opaque event tokens without decoding them and send
   no additional SDK requests or tracking events. Treat exported evidence as
   profile-specific data; do not publish tokens or check live responses into Git.
   The main proposition evidence shows the currently visible card and its position.
5. Explicit card display/click events retain the original proposition ID, scope,
   scope details, selected item and selection metadata, SDK identity and
   datastream override. Native journey cards use the SDK-provided `collectEvent`
   for display, interaction and dismissal. Duplicate callbacks do not repeatedly
   collect display events. Only the settled primary card collects a display:
   a partially visible next-card peek does not. Revisiting an unchanged card does
   not collect again. Each display,
   click and dismissal uses only that card's original item, retaining its
   proposition scope details and opaque tokens, never all sibling items.
   A dismissed card leaves the carousel without changing member challenge state.
   Navigation never switches the joined challenge or resets purchase receipts.
   Joining still uses the clicked card's `meta.challengeId` and existing signup API.
   Callbacks for a previous profile/sandbox are
   ignored. Failures are not retried automatically. Missing card
   content does not establish that the member has no challenges. The authored
   hero remains on the page; `manageMounts:false` prevents the manual runtime
   from replacing or relocating the authored mounts.

   **Renderer ownership:** this page's evaluated website renderer is authoritative.
   The supplied Adobe Tags action selects `.ContentCardContainerLoyalty` for the
   Loyalty surface and `.ContentCardContainer` for generic card surfaces, then
   replaces `innerHTML`. Neither class exists on this page: the retained
   `#ContentCardContainer` wrapper uses `loyalty-card-wrapper`, and
   `#ContentCardContainerLoyalty` uses `ContentCardLoyalty` with
   `data-content-card-renderer="website"`. Thus that Tags action finds no target,
   including for generic propositions, and cannot overwrite the carousel or set
   its height to 500px. Surface URIs and IDs are unchanged; the shared Tags action
   is not edited or republished, preserving other pages' rendering. Do not add
   either Tags-target class to this page or retarget that action to these IDs.
6. To express interest for the separately configured **Interested in Rewards**
   edge audience, load an AEP test
   profile, inject Tags/Web SDK, and select the reviewed event datastream and event
   tenant namespace in the top configuration bar. Kirkham automatically uses
   **`_demoemea`**, matching the reviewed TUI / Center Parcs configuration, so
   no extra tenant entry is required there. Other sandboxes still require their
   own reviewed namespace; switching away from Kirkham clears its default and
   switching back restores it. An explicit tenant override remains available.
   Select **Show interest in Rewards** to send **`rewards.interest`** with a
   current ISO timestamp. No orchestration event ID is added. The status shows SDK preparation, dispatch
   and acceptance while the profile timeline refreshes. Acceptance does not
   confirm audience membership; AEP must evaluate the event separately.
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
   timeline refreshes after SDK acceptance. Audience qualification depends on
   the separately created AEP audience and its evaluation; SDK acceptance alone
   does not verify membership. Each click sends at most one event, with no automatic
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

When state omits a usable challenge name, the page reads each displayed challenge's
exact-ID Adobe metadata, including in the all-challenges view and after signup.
Desktop and phone headings show the trimmed name; technical IDs remain in
**Challenge API details**. Metadata identity must match the requested challenge.
A failed name read shows **Challenge name unavailable** and an explicit details
warning without hiding Adobe-reported task progress or inventing a name.
The optional challenge ID filters state and reads that exact metadata definition
for challenge/task names, joined by IDs. **Completed** uses Adobe's
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

The Spend task's raw definition/state can instead report
`taskClass:"spend"`, `taskType:"purchase"`, `variables.spendMin` (the target)
and `variables.singleTrans`. The left-hand Spend display now reads this native
goal and an actual numeric `accumulators.spend`; it also accepts the existing
normalized Spend goal/type. A purchase activity alone is not Spend, and an
explicit non-Spend class takes precedence over a misleading monetary variable.
Missing accumulators are not zero. Definition counters and completion history
never substitute for the returned member accumulator. The site's purchase demo
contract is GBP; an explicitly reported currency takes precedence, and non-GBP
tasks do not offer this GBP purchase control.

### Real GBP 10 Spend purchase demo

An active, opted-in Spend task for the **resolved Loyalty member** can show
**Simulate qualifying purchase** beneath its left-hand task row. It is not
mounted in the phone or customer website. It requires a positive reported goal
and a usable SKU; single-transaction targets above GBP 10 are not appropriate.
The included/excluded SKU lists select an eligible product where reported.
An unrestricted task uses `LOYALTY-SPEND-DEMO-10`, not a partner-offer SKU.
Adobe still decides actual qualification; other eligibility conditions and
processing latency can prevent an accepted event from advancing the task.

Each deliberate click calls existing `prepareProfileEvent`, `purchasePayload`
and `dispatchProfileEvent`, not Featured Offers activation or its receipt/modal
handler. The order and single product both contain `priceTotal:10`,
`currencyCode:"GBP"`, and quantity/purchase count 1. Separate UUID event and
purchase IDs make repeated clicks independent transactions. Existing test-profile,
active ECID, selected identity, resolved Email/Loyalty ID, tenant and datastream
checks remain authoritative. No event is retried automatically.

Acceptance re-enables the button and shows **£10 purchase sent**; it does not
increment a local counter or prove qualification. A read-only state refresh starts
after approximately two seconds, then retries at five-second intervals, with at
most six reads and a 32-second scheduling deadline. Busy unrelated requests can
reduce the number of attempts. The existing `readTasks(..., true)` ignores a
manual debugging member override. Polling stops on a changed reported Spend,
Adobe task/challenge completion, a missing/non-opted-in task, a non-transient error, context
invalidation, another deliberate purchase, navigation away or the bound.
Transient read failures (network transport, HTTP 408/429/500/502/503/504,
or unreadable JSON on a successful response) consume the same six-attempt
budget and can recover automatically. Only the Loyalty read is retried;
the accepted purchase is never resent. HTTP status and errors persist in
`poll.errors`. A JSON-labelled gateway response containing plain text such as
`upstream request timeout` is reported with its HTTP status rather than leaking
an unexplained JSON parse error and ending the first read. The UI warns that
previous progress may be stale while retrying. Exhaustion retains the real prior
progress, shows the last read error, and recommends **Get task status** without
resending the purchase. Authorization/configuration failures and valid JSON with
a malformed Loyalty state contract are not automatically retried. A failed read
is never converted into an empty/complete state.
If the initial accumulator was missing, first reporting zero does not stop
latency polling; zero is displayed honestly while waiting for positive Spend.
Manual **Get task status** remains available afterward.

Only an actual returned Spend accumulator renders money, remaining amount and
percentage of the goal. Reaching the goal does not locally complete a task,
complete its challenge or award points. Those states still come from Adobe.
The initial member accumulator and the precise live monetary mapping are not
proven by published metadata or SDK acceptance; inspect the first real readback.

For the first click, open:

- **Browser console:** filter `[Loyalty Spend demo]`. Inspect the exact purchase
  payload, accepted SDK result and each returned challenge/task. A send error is
  logged without automatic resubmission.
- **Last successful response / proposition evidence → Spend purchase and
  Loyalty state evidence:** the request, UUID purchase ID, full `sdkResponse`,
  `sdkAccepted`, bounded `poll.responses`, `poll.errors` and stop reason persist separately from
  the general evidence panel. Console command:
  `window.LloydsLoyaltySpendDebug.getLatest()`. `qualification:"Not confirmed"`
  deliberately is not inferred from acceptance or a concurrent state change.
- **Challenge API details:** inspect task ID/type/class, `variables.spendMin`,
  the unmodified returned `accumulators` and task/challenge states. Spend tasks
  additionally expose full `returnedTask` and matching `definitionTask` JSON.
  If Adobe returns an unfamiliar accumulator shape, inspect it rather than
  manufacturing a Spend value. No accumulator means **Progress not yet reported**.

Multiple entries in `challengeList` can include `optedIn:false` records, not just
joined challenges. Join metadata `_id` to state `challenge_id`, and match tasks
by `taskId`, never list position.

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

### Customer-facing Spend progress (Lloyds and Jet2)

The same `spendTask` and `spendPresentation` model helpers format the inspector
and customer Content Cards from the selected member's returned Loyalty state.
An exact Content Card `meta.challengeId` match to an `optedIn === true` challenge
is required. Task definitions are matched by task ID; only the returned task's
numeric `accumulators.spend` supplies accumulated money. An explicit zero is
displayed; a missing/invalid accumulator, non-Spend task, unjoined challenge or
unmapped card produces no customer progress panel.

The compact Rewards `.loyalty-added` treatment replaces the joined signup button
visually while meaningful progress is available. Lloyds uses its existing green
palette; Jet2 uses the same component with its existing orange brand tokens.
Other actions, supplied Content Card content and per-card attribution remain
unchanged. Refreshing state updates the existing card DOM only, without rebuilding
the carousel, reordering cards or collecting another proposition display.
Neither SDK purchase acceptance nor reaching the monetary goal marks completion:
only returned task/challenge completion replaces the active meter with completion
copy. No points/reward issuance is claimed.

Both customer pages offer **Web preview width** and **Challenge column width**
sliders in web-preview mode. Widths are constrained to the available screen and
the narrow layout still stacks. These are presentation-only, page-session
controls, not persisted profile or Spend data. **Profile offers** starts collapsed
and uses a native keyboard-accessible disclosure; offer retrieval is unchanged.

Validate both brands with `npm run test:loyalty-spend-presentation` alongside
`test:lloyds-loyalty` and `test:jet2-loyalty`.

- [Reusable customer Loyalty demo skill](../.agents/skills/ajo-loyalty-customer-demo/SKILL.md)
- [Jet2holidays Loyalty demo](../web/profile-viewer/jet2-loyalty-demo.html), under **Demos > Jet2 > Loyalty**.
  It reuses the Lloyds model, real state/purchase helpers and separate Adobe
  Content Card/Featured Offers engines, with independent `jet2Loyalty` settings.
  The supplied Jet2 website archive provides only the reviewed logo/beach imagery
  and visual reference; no saved-site scripts or trackers are imported.
  Existing configured Adobe surfaces are reused, not reauthored for Jet2.
  Adobe-returned challenge content and eligibility remain unchanged, including
  any shared lab/FSI copy. No actual Jet2 booking, points balance or reward benefit
  is implied. Generic diagnostics are available as
  `window.LoyaltyDemoSpendDebug` and `window.LoyaltyDemoContentCardDebug`;
  the historical Lloyds aliases remain supported.
  Run `node scripts/test-jet2-loyalty-browser.cjs` alongside the existing Lloyds
  suite before changing customer configuration or the shared engine.

- [tools/loyalty-reward-provider/README.md](../tools/loyalty-reward-provider/README.md)
- [AJO_CONTENT_TEMPLATE_API.md](AJO_CONTENT_TEMPLATE_API.md)
