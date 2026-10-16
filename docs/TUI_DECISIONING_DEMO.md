# TUI holiday decisioning skill test

Entry: `/profile-viewer/tui-decisioning-demo.html` (dashboard shell) or
`/profile-viewer/tui-decisioning-visualiser.html` (standalone).
Both accept `?channel=email`, `?channel=mobile`, `?channel=web`.
The dashboard navigation lists Demos -> TUI -> Web for owner/sandbox `kirkham`
with in-development capabilities enabled.

Feature preview:
`https://aep-orchestration-lab--tui-decisioning-jc5oi5wy.web.app/profile-viewer/tui-decisioning-demo.html`.
This is an expiring Hosting preview, not a production release or Functions deploy.

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
consent, travel attributes, linked identities, audiences and five recent events
are separate from staged simulator values. Missing values show Not set,
unloaded values Not loaded, and unavailable KPIs Unavailable.

The compact traveller hero has visible Contact / Travel / Identity sections,
without profile tabs. Overflow scrolls inside the existing bounded drawer.
The shared anonymous-visitor control is moved, not cloned; reset remains
an explicit action. Drawer height is capped at 560px and available viewport,
or 55dvh on narrow screens, with internal scrolling. The event count opens
Canvas flow / Swimlanes / Stages. Offer and strategy names come only from
ingested event data, never the simulated winner. Identity/sandbox changes clear
the drawer, dialogs and signals and discard late responses.

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
schemas. Unknown API ownership or missing write configuration blocks Apply
rather than sending a partial snapshot. Accepted or ambiguous writes are
reconciled by readback without automatic resending. A partial multi-dataflow
update preserves the remaining staged fields. No live profile writes were
performed while implementing this correction.

**Run** checks actual test-profile and email/personalisation consent readback,
then requests the explicitly configured live policy through the shared runtime.
A genuine hero image/copy replaces all three channel previews only after a
successful response and image load, followed by one attributed display event.
It does not send messages or activate the TUI drafts. The objective ladder
remains an explicitly labelled local simulation, not an explanation of a
different live policy's result.

## One model for the website and catalog

`web/profile-viewer/tui-decisioning-model.js` is the source for all seven
objectives, 21 items, typed controls, rule conditions and scenario assertions.
The website tests eligibility before item priority and stops at the first
qualifying objective. Explanations show those actual conditions and priorities,
not invented model predictions. Numeric thresholds are demo conventions.

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
release; a Hosting preview does not deploy them. Until the live API reports
compatible ownership/configuration, Apply fails closed.
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

Email desktop and mobile share the same table-based content. The web hero uses
the same selected item. Suppression removes prior personalised images and CTAs.
Tabs support roving focus, Left/Right/Home/End, deep links and back/forward.
The shell and iframe keep their channel state aligned. Theme follows `aepTheme`;
pane proportions use `tuiDecisioningPaneRatios` and adapt to viewport width.
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
