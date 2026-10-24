# TUI holiday decisioning skill test

Entry: `/profile-viewer/tui-decisioning-demo.html` (dashboard shell) or
`/profile-viewer/tui-decisioning-visualiser.html` (standalone).
Both accept `?channel=email`, `?channel=mobile`, `?channel=web`.
The dashboard navigation lists Demos -> TUI -> Web for owner/sandbox `kirkham`
with in-development capabilities enabled.

Feature preview:
`https://aep-orchestration-lab--tui-decisioning-jc5oi5wy.web.app/profile-viewer/tui-decisioning-demo.html`.
This is an expiring Hosting preview, not a production release or Functions deploy.

Signals use BA-style rounded accordion cards with category icons, compact
field labels/schema keys and segmented choices. Exact numeric inputs are
preserved alongside the departure-day slider; profile readback can add arbitrary
schema-valid string choices. Scenario/Reset/lookup keep selected pills in sync,
and Apply/Run disables every signal control. The compact branded header places
live status immediately left of Apply on desktop. Selection Strategies has
icon-only expand/collapse controls; repeated scenario instructions and the blue
local/live policy summary are removed, without changing strategy evaluation,
explicit Apply/Run, error feedback or returned-content retention.
Eligible NBAs is separated from Selection Strategies by 18px. The desktop drawer
follows the supplied drawer HTML: profile / identity graph / audience-messages /
decision timeline in 1.25 / .75 / .45 / 1.15 proportions, with minimum readable widths.
Last Events is narrower than the profile and sized to its five compact cards; classic and mobile layouts retain their
height limits.
Attribute cards size to their contents rather than stretching down the column.
Labels are at least 13px and values at least 16px at default desktop zoom.
Two-column signal tiles have larger padding, and KPI cards reflow into two
compact rows when the profile column is narrow, avoiding truncated values.
Contact, grouped-attribute and Identity tabs remain keyboard accessible; normal
tabs fit without scrolling within the existing 560px drawer cap.

## Source and limits

Built from the owner-supplied **TUI.co.uk | Holidays, Flights & Cruises
2026 / 2027** ZIP. Only three raster photographs and the inspected, inert TUI SVG
logo are imported. Captured HTML, third-party scripts, analytics, chat, forms,
trackers, rates and promotional amounts are not served or executed.
The website panel is a reconstruction, not an exact snapshot.

Copy uses captured destinations, navigation and product concepts: Manage My
Booking, Help Centre, arrivals/departures, luggage information, check-in, seat
selection, package holidays, experiences, hotels and TUI Smiles Rewards Club.
Personalised service wording is illustrative demo copy, not an actual TUI
product promise or policy. No current prices, rewards balances, eligibility or
availability are asserted. CTAs explicitly simulate an interaction.

The standalone simulator retains the clearly labelled fictional Alex Morgan
fixture and makes no API/external requests. The dashboard shell instead uses
the canonical Spectrum site-configuration strip, Tags controls and shared
bottom profile drawer. Lookup is read-only and disables application-login
events; it never creates activity to fill the drawer. Actual loaded identity,
consent, travel attributes, linked identities, audiences and recent events
are separate from staged simulator values. Missing values show Not set,
unloaded values Not loaded, and unavailable KPIs Unavailable.

The compact traveller hero uses Contact / Holiday / Support / Shopping /
Preferences / Consent / Identity tabs, replacing the long stacked attribute
list. Only one panel is shown; ordinary attributes fit without vertical panel
scrolling. Keyboard arrows/Home/End switch tabs, and event polling preserves the
selected tab. The ECID has a 24px icon-only copy button immediately beside its
digits, with accessible labelling and success/failure feedback.
The shared anonymous-visitor control is moved, not cloned; reset remains
an explicit action. Drawer height is capped at 560px and available viewport,
or 55dvh on narrow screens, with internal scrolling for stacked sections.
The desktop panel is titled **Last Events**, without filters, an event scrollbar
or pagination. It shows the latest five events of any type.
The separate journey dialog retains the fetched history.
Every event uses the same bordered decision-card design, with the newest
highlighted. Display cards use ingested offer titles and strategy names;
other activity retains its actual title, channel and event type without invented
offer/strategy details. Long titles retain full hover text and the
journey event details. Email, SMS and Push consent indicators sit in one
three-column row within the Contact tab. The event count opens
Canvas flow / Swimlanes / Stages. Offer and strategy names come only from
ingested event data, never the simulated winner. Identity/sandbox changes clear
the drawer, dialogs and signals and discard late responses.

NatWest and TUI both use the shared one-second event poll. Requests now bypass
browser caching and share one in-flight refresh per identity/context, preventing
overlapping responses from replacing newer data. Returning focus to the page
refreshes immediately. Email totals come from that same event response, not a
second profile lookup; failed refreshes log an error and retain the last
successful activity/totals. Upstream AEP ingestion and API latency remain outside
this client refresh cadence.

`?tuiDrawer=classic|hero` persists in `tuiProfileDrawerLayout`;
`?journey=classic|concepts` persists in `decisioningPersonaJourneyLayout`, and
the selected journey view in `decisioningPersonaJourneyView`. Channel deep
links and history remain aligned between shell and iframe.

The shell defaults a new browser context to `kirkham` without overwriting an
existing sandbox selection. Apply and Run both reject other sandboxes because
the provisioned TUI catalog belongs to `kirkham`.

**Apply** is explicit and restricted to test profiles. It fetches current full
writable snapshots, overlays only staged fields and validates them against the
exact current owning schema version before streaming. It does not provision
schemas. Older deployed API ownership labels can incorrectly call
`airlineCustomer.*` Generic or non-writable even when the saved Travel schema
and dataflow are correct. These labels are static mappings, not dataset
provenance. Apply recovers the complete known owning subtrees, including
unchanged scalar siblings, and checks every recovered path/type against the
configured live write schema before sending any group. It never works around
the problem by streaming only edited leaves. Missing/disabled write
configuration, tenant disagreement, incompatible fields and read-only leaves
still block all writes with a specific schema/path error. A configured writable
industry can be populated for the first time without existing writable rows.
Accepted or ambiguous writes are
reconciled by readback without automatic resending. A partial multi-dataflow
update preserves the remaining staged fields. No live profile writes were
performed while implementing this correction.

**Abandoned-search activity:** Scenario 5 stages the Boolean profile flag;
choosing it does not itself send an event. Once explicit Apply accepts all
snapshots for a missing/false-to-true transition, Web SDK sends one
`abandoned.search` event. Reapplying unchanged Yes, Run and lookup do not resend
it. Applying No rearms a subsequent Yes transition. The matching Apply-event
pattern was verified in BA; the inspected NatWest preview only contained its
decision display event, not this transition event.

The event captures Alloy, active SDK ECID, selected identity and datastream
override before writes, rejects a different selected ECID, and uses root
`eventType`, `identityMap` and `web.webPageDetails`, with the reviewed event
tenant's `identification.core.ecid/email`. It does not send the profile flag as
an event field or fabricate flight/search details. Partial snapshot acceptance
retains the prepared event until the remaining snapshots succeed. Each send is
reserved before dispatch; uncertain tracking failures are explicit and never
retried automatically or on Run/reapply. Failed tracking does not start profile
confirmation; a later explicit Run may reconcile the accepted snapshots without
resending the event. Context changes discard deferred state.

Datastream options come from the shared
`DemoLabEdgeConfig.edgeConfigOverrides()` API exported by
`demo-tags-injection.js`, not `DemoTagsInjection`. Apply and the captured-context
decision/display runtime use that same helper. An empty override preserves
Tags' configured datastream; a missing helper fails before profile writes or
the decision request. Regression fixtures execute the actual helper with
sandbox-scoped stored UUIDs rather than inventing an export in a mock.

After an acknowledged send the loaded drawer's events are refreshed; its shared
poll retrieves delayed ingested activity without fabricating a card or counting
it as a message sent. Intercepted-SDK fixtures cover the full Apply-to-events
flow; no real abandonment event/profile write was sent during implementation,
so live dataset ingestion still requires readback of a real authorised test run.
`abandoned.search` uses the existing local circle-and-cross abandonment SVG in
recent events and all three journey views, not the unrelated external artwork
selected by the legacy generic abandonment fallback.
Journey cards label it Abandoned search rather than treating the shared TUI
page name as evidence of a decision request.

**Run** checks actual test-profile and email/personalisation consent readback,
then requests the explicitly configured live policy through the shared runtime.
Decisioning must be enabled in the configuration gear panel. Run does not
silently enable it; a disabled toggle now produces that specific instruction
instead of "Decision runtime lookup failed". Explicit Run requests opt into
runtime lookup errors, preserving API/HTTP, network and invalid-JSON failure
details. Failed lookups clear cached runtime profile data and never request a
decision or send display tracking. Existing boolean lookup callers are unchanged.
One fresh runtime profile lookup now supplies both those checks and the runtime
identity context, replacing two serial reads of the same profile. It does not
reuse stale loaded values or bypass pending Apply confirmation. Console
`[tui-decisioning-timing]` entries separate profile-readback, Edge-decision,
image-ready and display-tracking durations; AEP Hub-to-Edge propagation is still
upstream and is not accelerated by this client-side round-trip reduction.
A genuine hero image/copy replaces all three channel previews only after a
successful response and image load, followed by one attributed display event.
Following the BA reference, Run first captures the active SDK ECID using
`getIdentity`, retaining the selected email in the request identity map. Both
request and display carry that same ECID in `identityMap.ECID` and
`_demoemea.identification.core.ecid`. The configured event tenant comes from
the reviewed kirkham Operational Event / Demo Website schema contract, not
Generic's profile-write `xdmKey`. That event schema requires the tenant ECID;
omitting it can prevent ingestion even when Edge returns a decision. A selected
ECID different from the active visitor is rejected before the decision request.
Only the parent loads Tags, avoiding a second SDK identity inside the visualiser.
Run captures the environment strip's datastream override once and reuses it for
display, along with the original Alloy callback, identity map, returned
item/selection metadata and root web page/view details. Missing SDK identity or
invalid event tenant fails before requesting content, never after replacing it.
There is no additional stitch event on read-only lookup. The decision request
itself carries the selected email and active ECID. After delivery the shell refreshes the loaded
profile's events; the shared drawer's one-second poll then catches delayed Hub
ingestion without another full profile lookup. Actual ingested events update the
five-card box and journey, not optimistic local cards. Content displays do not
increment Messages Sent. Context changes invalidate old event responses.
The browser regression uses the real shared runtime with an intercepted SDK:
only schema-valid outbound displays become delayed fixture API events, preserving
their actual returned item and strategy fields. This verifies the client
request/display/retrieval contract, not live datastream ingestion.
It does not send messages or activate the TUI drafts. The objective ladder
remains an explicitly labelled local simulation, not an explanation of a
different live policy's result.

## One model for the website and catalog

`web/profile-viewer/tui-decisioning-model.js` is the source for all seven
objectives, 21 items, typed controls, rule conditions and scenario assertions.
The website tests eligibility before item priority and stops at the first
qualifying objective. The panel is labelled **Selection Strategies**.
Exactly seven scenario buttons are presented in reverse rank order **7 to 1**;
the strategy ladder still evaluates in unchanged priority order **1 to 7**.
Scenario **5 - Abandoned search** uses scenario 7's baseline with
`_demoemea.airlineCustomer.abandonedSearchFlag` set to boolean `true` (Yes),
selecting **Find your getaway** and the **Return to holiday search** item in
the local model. Scenario 7 resets this flag to `false` (No). The flag remains
staged until Apply; changing the preset does not modify AJO rules or run a decision.
There is no scenario dropdown or duplicate selector. Each button stages
a complete preset, so its intended objective wins regardless of the previous
scenario. Only rule-relevant scenario keys and keys being reset from the
previous state are marked for updates and expand their signal groups; all
unrelated groups collapse on each selection. Initial signal groups are closed.
The duplicate customer/instruction block above the attributes is removed.
Twenty-five regression cases remain in the model for all 21 winning
items, negative/consent holds and boundaries; they are not extra UI buttons.

The TUI-branded dark objective panel follows BA's numbered chevrons and status
pills. The separate Eligible NBAs panel shows only the selected objective's
eligible offers, ordered by unchanged catalog priority, with numbered cards,
a highlighted winner, a coloured contribution bar/legend and right-aligned total.
The total is the actual objective base plus item priority, not fabricated
six-factor model scores or a live AJO response. Excluded items appear separately
as muted dashed cards with their actual rule conditions. Explanations show those
actual conditions and priorities, not invented model predictions. Numeric
thresholds are demo conventions.

| Ranked objective | Item choices | Main strategy fields |
|---|---|---|
| Protect / Recover | Booking help, Help Centre, service-first communication | disruption type OR case status |
| Enjoy the holiday | Flight information, luggage help, in-resort support | journey stage |
| Get ready to go | Check-in, documents, seats | journey stage AND days until departure <= 14 |
| Welcome home | Luggage follow-up, case follow-up, inspiration | journey stage |
| Find your getaway | Package search, alternatives, return to search | shopping intent OR abandoned-search flag |
| Make it extra special | Experiences, seats, hotels | journey stage AND days until departure > 14 |
| Keep the smiles coming | Inspiration, Smiles information, digital tools | journey stage AND shopping intent |

Controls display their exact Operational Profile paths. Travel data uses
`_demoemea.travelReservations.flightReservations.*` and
`_demoemea.airlineCustomer.*`; generic scoring/loyalty data uses
`_demoemea.scoring.core.propensityScore` and `_demoemea.loyaltyDetails.points`.
These are existing schema paths, not a new TUI subtree. Mappings declare the
owning dataflows; Apply verifies their actual writable metadata and schemas.
Newly streamed airline and reservation leaves are included in the Travel
manifest and both backend/MCP ownership maps. These backend changes require
normal PR validation/merge and a separately authorised production Functions
release; a Hosting preview does not deploy them. The schema-checked client
compatibility path handles older ownership labels without that Functions release;
it does not bypass missing write configuration or schema incompatibility.
Holiday stage uses the actual `airlineCustomer.journeyStage` field with its
suggested `Dreaming`, `Booked`, `In-Trip` and `Post-Trip` values, not itinerary
booking status relabelled as a journey stage.

Email content requires explicit `y` at both root paths
`consents.marketing.email.val` and `consents.personalize.content.val`.
Missing, unknown and negative values hold **all** previews, including service
content. Consent is a local safety gate, not a catalog PQL clause: the current
draft catalog needs a separately reviewed policy-level consent gate before live
use. A marketing opt-out is never assumed to permit a service email.

Every field affects an actual rule or explicit safety gate. Scores remain
numeric, booleans remain boolean. Scenarios cover every winning item, no-content
and consent holds, service precedence, 1/2/14/15-day transitions and 2/3 score
boundaries. Presets reset the entire fictional state; they collapse signal
groups then open those containing preset keys (even if the values match).

## Catalog plan generation

```powershell
node scripts\tui-decisioning-catalog-plan.mjs "C:\path\verified-kirkham-raw-offers.json" "C:\path\tui-catalog-plan.json"
npm run decisioning:catalog-plan -- "C:\path\tui-catalog-plan.json"
```

Input is a read-only raw offer inventory with real `itemTags` and
`itemTagDetails`, not normalised rows. The builder checks the seven existing
objective UUIDs and catalog, then derives all payloads from the website model.
Output is created exclusively, not overwritten. Keep generated customer plans,
inventories and journals outside Hosting. The generic runner's contract and
explicit apply confirmation are documented in
[DECISIONING_CATALOG_PLANS.md](DECISIONING_CATALOG_PLANS.md).

**Draft catalog provisioned; live decisions are not verified.** On 16 October
2026 the user explicitly approved shared BA/TUI objective tags. The governed
runner created and read back all 59 assets in `kirkham`: 21 draft items,
24 eligibility rules, seven collections and seven strategies. Collections are
not TUI-exclusive; customer-scoped tags remain necessary if isolation is later
required. The imported local images are omitted
from DPS payloads because there are no verified publicly hosted TUI media URLs.
Offer schema/content fields and owning dataflow schemas need live validation.
Policy ordering, fallback, consent gating, draft approval and Edge scenario
verification remain separate reviewed steps. No AJO objects are created by
building or previewing this plan.

Applied plan fingerprint:
`9c90403dae0c7010644c46ac7678f283b3c5cb6f972d3a30cab587e20ffde324`.
All 24 original rules subsequently received matching visual `segmentModel`
attributes through governed in-place patches. Their original IDs, PQL and
strategy/item links were retained and read back. Repair fingerprint:
`446f8580f62d74ae66c7c53865bbc7d54da2fc1769594ed29542d21cbc547f7b`.
The repair journal is `tui-rule-model-repair.json`; do not recreate these rules.
Readback verifies stored metadata, not a visual inspection of Adobe's editor.

The complete per-asset IDs and readback status are preserved in the session's
`tui-catalog-journal.json`; reuse that journal, never create a fresh one to retry
this bundle. No offers were approved and no policy was activated. The website
does not automatically select these newly created strategies. A configured live
policy can be tested explicitly, separately from the local ranking.

| Objective | Created collection | Created strategy |
|---|---|---|
| Protect / Recover | `dps:item-collection:1d4c6e582ec09cb1` | `dps:selection-strategy:1d4c6e59a587f5ca` |
| Enjoy the holiday | `dps:item-collection:1d4c6e6a7618c156` | `dps:selection-strategy:1d4c6e6bfec7f5cb` |
| Get ready to go | `dps:item-collection:1d4c6e7d2b409cb2` | `dps:selection-strategy:1d4c6e7e9887f5cc` |
| Welcome home | `dps:item-collection:1d4c6e8fe2d8c157` | `dps:selection-strategy:1d4c6e915d07f5cd` |
| Find your getaway | `dps:item-collection:1d4c6ea50bd8c158` | `dps:selection-strategy:1d4c6ea671a7c833` |
| Make it extra special | `dps:item-collection:1d4c6eb9ca809cb3` | `dps:selection-strategy:1d4c6ebb4787f5ce` |
| Keep the smiles coming | `dps:item-collection:1d4c6ecf7998c159` | `dps:selection-strategy:1d4c6ed13867c834` |

## Interaction and checks

The desktop email, TUI mobile app and web hero use the same selected
item with channel-specific presentation. Mobile is no longer a resized email:
it has a TUI header, recipient greeting, native-style offer card, holiday tools,
bottom navigation and home indicator. Its content scrolls inside the phone while
navigation stays visible. Unconnected quick actions/navigation report that fact;
they do not open bookings or perform account actions. No real booking details,
balances or app services are fabricated. Without a supplied app capture, this
is a branded reconstruction, not an exact production app replica. At the user's
request, the customer-facing surfaces omit simulation/app-concept/illustrative
labels, the email/app/web disclaimer blocks and the full explanatory boundary
row. The workspace follows the header directly; profile lookup cannot recreate
that row. These presentation changes do not connect app/booking services or
activate delivery. Unconnected actions still report that fact when clicked.
The Smiles information copy no longer includes the illustrative-points caveat;
this updates website copy only, not the already-created AJO draft items.
Existing conservative email/personalisation consent gates still hold
all personalised slots; the app preview adds no new consent or messaging rights.
The live shell starts with a neutral Run-to-load state, not local offer imagery.
After a successful Run, its returned image/title/copy remain mounted across
scenario changes, manual edits (including temporarily invalid signals), Reset,
channel switches and same-context profile lookup or Apply/readback. Only the
local ranked objectives and eligibility change while signals are staged.
Pending, failed, empty/ambiguous or broken-image Runs retain that last result;
a fresh successful response replaces all three slots only after its image loads.
Intervening signal/context changes invalidate pending image loads. Same-context
refreshes use the complete sandbox/namespace/identifier tuple. Identity/sandbox
changes and actual readback consent holds clear prior personalised images and
CTAs, retaining the app shell without reverting to a local offer. Standalone
visualiser scenarios still render their local model content.
Tabs support roving focus, Left/Right/Home/End, deep links and back/forward.
The shell and iframe keep their channel state aligned. Theme follows `aepTheme`.
Apply/Run and their status now sit to the right of the logo and **A little more
you.** in a single branded parent header. There is no separate action toolbar
or repeated brand header inside the live iframe. Narrow layouts wrap the
controls within that same header; its measured height sets the iframe offset.
Pane proportions use `tuiDecisioningPaneRatios` and adapt to viewport width.
The default split is approximately 22% signals, 42% objectives and 36% preview;
drag either divider, use arrow keys (Shift for larger steps), or double-click
to reset that pane. Old fixed-pixel preferences are ignored.
Shared Edge mounts are hidden staging targets: only explicit Run populates the
channel previews, so an empty runtime ribbon never reserves top-of-page space.
Apply resolves tenant fields using the dataflow XDM key and schema namespace
metadata, rejects mismatches, and excludes reserved `_id` / `_repo` roots from
fallback tenant discovery.
Resizable gutters support pointer and keyboard input. On narrower viewports
panes stack without horizontal scrolling.
The compact BA-style channel switcher sits beside the preview title: **Email ·
Desktop**, **Mobile App**, **Web**. Only email is capped at 600px and the
app phone at 390px. Existing `?channel=mobile` links still work. There is no
channel-description/dimensions row below the switcher. Web fills the stage,
with browser chrome, readable navigation, a container-responsive hero and
destination sections. The non-working Search Preview strip is removed so the
hero follows site navigation directly. Its scroll
area is independent of the channel header; stacked layouts have no 760px cap.
The dashboard sidebar peeks from the left edge and opens on hover/focus; the
shared configuration bar retains its Lab menu controls.

```powershell
npm run test:tui-decisioning
npm run test:tui-browser
npm run test:decisioning-catalog-plan
npm run verify:profile-viewer-routes
```

Browser checks use only a local read-only server. Standalone external/API
requests fail the test; shell lookup and explicit Apply use local fixtures.
No test reaches live profile, schema or decisioning services.
Set `TUI_SCREENSHOTS` to a session artifact directory
for screenshots.
Canonical UI files and the exact imported assets must be copied to the Express
mirror if `rsync` is unavailable; verify matching hashes, never reverse-sync.
