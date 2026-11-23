---
name: ajo-loyalty-customer-demo
description: >-
  Reproduce the Lloyds and Jet2holidays AJO Loyalty customer demo with branded
  mobile/web previews, real member progress, ranked AJO Content Cards, separate
  Experience Decisioning offers, signup, real Spend purchases and read diagnostics.
  Use when creating or rebranding a Loyalty demo for another customer.
---

# Reusable AJO Loyalty customer demo

## References and scope

Use `web/profile-viewer/lloyds-loyalty-demo.html` as the functional reference and
`web/profile-viewer/jet2-loyalty-demo.html` as the proven branded example.
Canonical model/engine/styles remain `lloyds-loyalty-model.js`,
`lloyds-loyalty-demo.js` and `lloyds-loyalty-demo.css`. The filenames are retained
for compatibility; do not fork their business logic for another customer.
The API, integration findings and evidence workflow are documented in
`docs/AJO_LOYALTY_CHALLENGES.md`.

This skill reproduces the website, not Adobe configuration. Page creation does
not publish journeys/challenges, configure Tags, provision datasets, grant
entitlements or activate a reward provider. Those are separate reviewed actions.
Never include credentials, private customer identities or production tokens.

## Before editing

1. Read `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` and applicable `.cursor/rules`.
   Fetch origin, inspect status and integrate main before substantive edits.
2. Confirm customer name, menu location and provided design assets. Inspect the
   attachment safely: list ZIP entries, reject traversal, select necessary
   images/styles and inspect images. Do not execute or vendor downloaded site
   scripts, analytics, cookies, tokens or the complete saved website.
3. Use the canonical environment strip (`shared/env-bar.js`) and profile-modal
   mount, not a parallel auth/profile/event interface. Consult the existing
   `profile-viewer-lab-demo-strip` skill.
4. Separate confirmed integration from assumptions. Existing sandbox settings,
   member namespace and Adobe surfaces are not inferred from the customer's
   industry or logo. Preserve an explicitly reused working surface; a new surface
   requires separately configured Adobe content.

## Create a customer page without duplicating logic

1. Copy the Jet2 or Lloyds HTML to `<customer>-loyalty-demo.html`.
   Retain the complete functional DOM contract: `loyaltyTasks`, `loyaltyAvailable`,
   `loyaltyPhoneTasks`, `loyaltyPhoneAvailable`, preview mounts, action controls,
   API options, diagnostics, `profileViewerModalMount`, `TopRibbon`, `hero-banner`
   and all carousel IDs. Rebrand illustrative chrome, never Adobe-delivered copy.
2. Use a unique prefix in the strip and both configurations:

   ```js
   window.LoyaltyDemoConfig = {
     prefix: 'customerLoyalty',
     viewName: 'Customer Loyalty',
     homeLabel: 'Your rewards',
     homeAvatar: 'C'
   };
   // envBarConfig.prefix and envBarConfig.decisioning.viewName must match.
   // labCoreScript loads the shared lloyds-loyalty-demo.js, not a copied engine.
   ```

   Place this before `shared/env-bar.js` loads the engine. Separate prefixes
   isolate saved Tags, identity-picker and environment preferences. Never copy a
   profile identifier or challenge ID into the customer template.
3. Load shared model/core/styles plus one customer stylesheet. Keep the
   early-paint theme/sidebar IIFE, `home-dashboard-concierge`,
   `mod-demo-page tui-demo-shell lloyds-loyalty-page` and add the customer class.
   The historical Lloyds class is the shared layout hook, not customer content.
   Load `aep-theme.css` last. Define customer `--dash-*` palette tokens with
   customer-scoped light/dark selectors; preserve semantic error/success states.
4. Rebrand both mobile Home/Rewards and web previews, toolbar, document title,
   accessibility names, navigation/footer and illustrative placeholder content.
   Do not represent invented balances/bookings/points as real profile data.
   Retain `Your challenges`, dynamic `Chosen for you` counts, live task state and
   the explicit demo/qualification disclaimers.
5. Put only reviewed static assets in a dedicated `<customer>-loyalty/` folder.
   Add a customer `demoCustomer` group and `Loyalty` item to `aep-lab-nav.js`,
   preserving the user's requested owner visibility. Bump touched cache stamps.
   Register the page in `scripts/verify-demo-env-strip.mjs`; a reused core is
   already registered and needs no duplicate runtime. Add explicit positive
   assertions for the customer's shared manual runtime/drawer in
   `scripts/test-tui-decisioning-runtime.cjs`, alongside Lloyds/Jet2; preserve
   the assertions that unrelated demos keep their existing runtime.
   Run `npm run build:lab-nav-catalogue` to update the generated navigation source.
6. Mirror only relevant canonical HTML/CSS/JS/navigation/assets to
   `aep-prototypes/AEP Profile/03 Profile Viewer/public` using the existing sync
   workflow. Never reverse-sync. On Windows use explicit scoped copies and
   verify matching hashes if the existing rsync script is unavailable.

## Functional contracts to preserve

### Profile, identity and member state

- Profile lookup/runtime/drawer and identity selection stay shared.
- Only resolved AEP test profiles can send events. `prepareProfileEvent` obtains
  the active SDK ECID, checks selected ECID/tenant/datastream and uses the existing
  identity-map builder. Email and scalar Loyalty ID accompany ECID in the
  established identityMap and tenant identification.core. Never invent an ECID.
- Read Loyalty configuration first. State `pid` is the ID in the configured
  namespace, not necessarily email. Default State API region is `va7`; never
  probe regions. Server-side IMS stays in the existing `/api/ajo-loyalty` proxy.
- `readTasks(..., true)` automatically loads existing participation after profile
  resolution and uses the resolved member rather than a manual debugging override.
  Manual `Get task status` remains. Automatic reads never sign up a member.
- Match challenge `challenge_id` to metadata `_id/get_id`, tasks by `taskId`.
  `optedIn:true` means joined; false means available; missing means unknown.
  Publication/ranking/content eligibility is not participation. Preserve generic
  classification and separate Active/Completed state endpoints.

### Signup and AJO Journey Content Cards

- Generic explicit signup uses the existing Loyalty Signup API handler and its
  receipt/unknown-outcome guards. Keep signup separate from state reads. Do not
  introduce automatic signup, replay a timed-out write, or claim Journey entry.
- `Your challenges` uses AJO Journey Content Cards, not Experience Decisioning.
  The existing configured surface ends in `#ContentCardContainerLoyalty`.
- Website rendering is authoritative. Keep `data-content-card-renderer="website"`
  and the existing mount classes. Do not add the Tags `.ContentCardContainer`
  or `.ContentCardContainerLoyalty` target classes: the generic Tags rule uses
  `container.innerHTML = html` and would overwrite the multiple-card UI.
- Retain all candidates in diagnostics, stable descending Adobe rank order
  between independent challenges, supplied
  image/title/body/CTA state and each card's own proposition/item/consequence ID,
  challengeId, interactId, scopeDetails, activity/correlation/event tokens and
  attribution. Never collapse interaction contexts or hard-code current cards.
- Show one current card per exact `meta.challengeId` and optional
  `meta.lifecycleGroup` (separate journeys). Prefer explicit `meta.loyaltyStage`
  or `meta.stage`: `launch`, `inProgress`, `completion`; then SDK
  `qualifiedDate`, falling back to `publishedDate`. Without either, a newly
  observed delivery replaces the previous card and stays selected. An initial
  ambiguous batch falls back to Adobe rank with an explicit console/diagnostic
  warning; never infer a stage from rank, title, body or image. Cards without a
  challenge ID remain independent. Keep original proposition/item/consequence
  IDs and tokens. Replacement never collects an automatic dismiss.
- Accepted signup and purchases schedule up to three fresh SDK Content Card
  requests (2s, then 5s/5s; 32s scheduling deadline), using the existing guarded
  SDK/identity/datastream/surface and Loyalty state reads. Spend
  polling retains sole ownership of its state reads; card refresh waits for it
  to settle, never adds state reads to that transaction, and stops on a failed
  Spend read rather than retrying it through another path. Reject a changed
  SDK, ECID or datastream before requesting another card. Confirmed Spend
  completion also schedules retrieval unless a genuine completion card is
  already present. No Featured request, purchase/signup/interaction replay or
  local completion card. Cancel on context/navigation changes, stop on a
  same-challenge replacement or failed request, and report missing replacement.
  `LoyaltyDemoContentCardDebug.getLifecycle()/getRefresh()` expose selected and
  suppressed originals, selection reason, stage metadata and refresh evidence.
  A reported stage is Adobe card metadata, not proof of Journey entry or points
  issuance. Preserve terminal `sent` completion handling.
- A new Journey activity does not automatically disqualify the old Content Card.
  AJO delivery/disqualification rules still determine the qualified inventory.
  Website grouping does not publish rules or repair a wrong challenge ID, and
  cannot display completion content Adobe has not delivered. Use separate
  lifecycle groups carefully; retire prior-cycle cards through reviewed AJO
  rules, not local fabricated state.
- Card interaction events can carry `_experience.ajo.loyalty.challenge` with
  the exact `id`, an independently resolved challenge `name` when available,
  and string `metadata` (`contextType`, `cardTitle`, `consequenceId`, `interactId`).
  Successful card signup adds its confirmed API `signupOutcome` to that same
  interaction, never a second tracking/signup event. Card title is not assumed
  to be the challenge's name. Preserve original proposition scopeDetails/tokens;
  do not relabel a Journey activity as a campaign. Native `collectEvent` cannot
  add custom XDM: supported enrichment uses one explicit interaction with the
  original attribution, otherwise the existing native collection stays intact.
- One card fills the viewport without controls. Multiple cards use the independent
  compact snap carousel: primary card plus next-card peek, touch/trackpad/mouse,
  keyboard arrows/Home/End, dots and small arrows. Display tracking applies to the
  settled primary card, not a partially visible peek. Preserve switching previews.

### Featured Offers and real purchases

- The website owns Featured Offers impressions. Read the configured published
  Tags carousel and generic offer-display actions first; neither should also
  notify Featured displays. Do not change/publish Tags as part of page work.
  Retain the original SDK decision response before dispatching it to Tags.
  Only an actual Adobe-returned offer on the settled primary card, at least
  50% visible for one second while the document is visible, sends
  `decisioning.propositionDisplay` with `propositionEventType.display:1`.
  Hidden Home, off-screen/peek cards and fallback placeholders are not impressions.
- Preserve original wrapper proposition/item IDs, scope, complete scopeDetails
  and item tracking/selection tokens. Verify the displayed ID against that
  wrapper's original JSON content; never use a Tags-invented fallback ID.
  Keep the catalog ID separate in native item `characteristics.displayedOfferId`
  and the supplied name or visible presentation label in `displayedOfferName`.
  Verify matching Event Tool datastream/schema and string-map support first;
  unavailable support blocks only optional tracking with explicit diagnostics.
  Never mutate schemas or pretend wrapper selection is the DPS winning strategy.
- Use the original SDK, identity and datastream, with `renderDecisions:false`
  and default personalization disabled, without requesting another decision.
  Deduplicate profile/identity/datastream/proposition/item/offer in the page
  session across rerenders, preview changes and revisits. Reserve before sending;
  uncertain sends are never replayed. Context changes invalidate pending work.
  Do not add Featured interaction, purchase or signup tracking as collateral.
- `LoyaltyDemoFeaturedDisplayDebug.getLatest()` exposes payload, SDK acceptance,
  errors and bounded Profile readback. SDK acceptance is not storage proof.
  Three read-only checks (2s, then 5s and 5s) look for the exact stored display
  attribution; missing storage never triggers another notification. Timeline
  labels distinguish delivery/send, display and interaction using actual event
  types/flags, without relabeling delivery as an impression or a Journey as a campaign.
  Catalog IDs use `dps:<namespace>:<itemId>`; recognize the `dps:` prefix,
  not a literal `dps:offer:` namespace. Cover native namespaced IDs in delivery
  timeline fixtures so real delivered offer names are not hidden.

- Featured Offers are Experience Decisioning with independent retrieval, renderer,
  ranking and interaction metadata. Similar presentation is not shared business
  logic. Preserve the existing `ajo:featured-offers` contract and attribution.
  Render every valid returned item in Adobe order in both the carousel and Profile
  offers, without a website-side count cap. Keep the existing required-field
  validation; campaign/Tags delivery determines how many items reach the page.
  Cover more than seven items in branded browser regressions so no fixed limit
  is accidentally reintroduced.
- Existing offer purchases and the inspector-only Spend control share
  `prepareProfileEvent`, `purchasePayload` and `dispatchProfileEvent`.
  Do not create another purchase schema or reuse activation/modal side effects.
- Purchase XDM: fresh UUID `_id`, ISO timestamp, `commerce.purchases`,
  identityMap and tenant core, purchases.value 1, order.purchaseID UUID,
  order.priceTotal/currencyCode, and productListItems SKU/name/quantity/
  priceTotal/currencyCode. The Spend demo sends GBP 10, quantity 1 and independent
  order/event IDs per click. Acceptance is not qualification or storage proof.
- The inspector Spend purchase carries its exact challenge/task context using
  `_experience.ajo.loyalty.challenge.id/name/metadata`: `contextType` is
  `spendDemoPurchase`, task ID/name identify the clicked control, and
  `qualification` is `notConfirmed`. Do not attach the currently visible card's
  proposition or set Loyalty state, signup/completion dates or accumulators.
  Enrichment first checks `/api/events/config` for the explicit matching
  datastream/schema and resolves `/api/schema-viewer/registry` to verify `id`
  and `name` are strings and `metadata` is a string map; checks cache for five
  minutes per sandbox/datastream. Unsupported/unverified schemas keep the
  original event unchanged with a `[Loyalty event context]` warning and
  `LoyaltyDemoEventContextDebug.getLatest()` evidence, not unsupported XDM.
  The Kirkham Operational Event schema supports these native Adobe fields;
  another sandbox/datastream must be independently verified. No automatic
  schema mutation, extra attribution event or event replay is allowed.
  The shared drawer shows stored challenge/task context and original Adobe
  activity/proposition/item references when they are present on an event.
- Spend detection primarily uses `taskClass:"spend"` (often `taskType:"purchase"`),
  then explicit Spend variables when class is absent. Use spendMin/goal and
  actual returned accumulators.spend. A purchase class alone is not Spend.
  Missing/invalid accumulator is not zero; metadata/history never replaces state.
- Customer Content Cards match the returned joined challenge by exact
  `meta.challengeId`, never title/visible slide. Shared `spendPresentation`
  formats both inspector and customer progress from the same state/definition
  references. Use the Rewards `.loyalty-added` treatment with brand tokens;
  hide the joined CTA only while real Spend presentation is available.
  State refreshes update existing panels without rebuilding/retracking the
  carousel. Only Adobe task/challenge completion replaces the meter with
  completion copy; never claim points issued. Preserve true zero versus missing.
- Both pages use session-only web/inspector width sliders and a native collapsed
  Profile offers disclosure. Keep these presentation controls separate from
  profile, event, Decisioning or progress state.
- Only an opted-in, incomplete appropriate GBP Spend task for the resolved member
  shows the small left inspector demo control. Respect include/exclude SKU filters
  and singleTrans constraints; do not insert it in the customer previews.
- Sending disables the control, reports acceptance/errors and re-enables.
  No local increments/storage, optimistic completion or locally awarded points.
  Remaining = max(goal - actualSpend, 0); percentage capped at 100.
  Task/challenge completed states must still be returned by Adobe.
- Bounded read polling: ~2s first read, ~5s subsequent, six total attempts and
  32s scheduling deadline. Stop on real Spend change/completion, absence/error,
  context change, navigation, another deliberate purchase or exhaustion.
  Missing-to-zero reporting continues latency polling. Transient network,
  408/429/500/502/503/504 and unreadable successful JSON can retry reads within
  that bound. Never replay purchases. Preserve stale state/error evidence;
  authorization/configuration/malformed valid state contracts do not retry.

## Evidence and acceptance

Use generic aliases on any customer page:
`window.LoyaltyDemoSpendDebug.getLatest()` and
`window.LoyaltyDemoContentCardDebug.getEvaluated()/getLatest()`.
The historical `LloydsLoyalty*Debug` aliases remain compatible.

- Inspect full pre-selection propositions/candidates, selected/ranked cards and
  per-card attribution in existing Content Card diagnostics.
- Inspect purchase payload/SDK response separately from Loyalty responses and
  `poll.errors`/stop reason in Spend evidence. Console: `[Loyalty Spend demo]`.
- Challenge API details expose raw variables, accumulators, IDs, class/type,
  task/challenge states and matching definitions. Unknown shapes remain unknown.
- Offline fixtures prove code behavior, not production enrollment, ingestion,
  eligibility, accumulator mapping or reward delivery. Do not send live purchases
  merely to validate branding. Confirm live test identity and obtain explicit
  mutation authorization before performing a live event demonstration.

## Validate and ship

Run existing model/browser tests and add focused customer tests to
`scripts/test-lloyds-loyalty-browser.cjs`: isolated prefix, automatic resolved-member
read, joined/available, one/multiple cards and per-card metadata, independent
Featured Offers, GBP purchase/Adobe-only Spend, mobile/web switching, light/dark,
small viewport, navigation and no accidental writes. Preserve Lloyds regressions.
Run `npm run test:loyalty-spend-presentation` for the shared real-zero/missing,
Spend mapping, completion, no-retracking and adjustable-layout cases on both brands.
Run `verify:profile-viewer-routes`, `verify:demo-env-strip`,
`verify:decisioning-mount-zones`, `git diff --check` and mirror parity.

Fresh fetch/integrate main before push, focused handle-prefixed commit and PR,
required Validate, protected merge, exact-main validation and existing serialized
Hosting-only deploy. Verify live SHA and changed asset bytes. Do not deploy from
a feature branch, bypass gates or change Functions/Adobe configuration for a skin.

Example request:
> Use ajo-loyalty-customer-demo to create Acme Loyalty from Jet2's working page,
> matching the supplied Acme design assets. Add Demos > Acme > Loyalty. Reuse the
> current configured Adobe surfaces and sandbox settings without changing Adobe.
> Validate both Acme and Lloyds, commit and deploy.
