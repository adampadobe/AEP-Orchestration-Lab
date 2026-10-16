# TUI holiday decisioning skill test

Entry: `/profile-viewer/tui-decisioning-demo.html` (dashboard shell) or
`/profile-viewer/tui-decisioning-visualiser.html` (standalone).
Both accept `?channel=email`, `?channel=mobile`, `?channel=web`.
The dashboard navigation lists Demos -> TUI -> Web for owner/sandbox `kirkham`
with in-development capabilities enabled.

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

All profile data belongs to a fictional local fixture, Alex Morgan. There is no
ECID, AEP lookup, ingestion, identity reset or real customer drawer. The compact
fixture drawer is explicitly labelled fictional. The outer dashboard retains
shared Lab navigation and its standard usage-configuration/telemetry loader;
the standalone simulator itself makes no API/external requests or tracking.
The live shared environment strip/drawer is intentionally absent because this
test is static. No deployment or AJO activation is implied.

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
intended owning dataflow only; they do not provision or verify live write
connections. No manifest change is necessary because nothing is streamed.
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
The complete per-asset IDs and readback status are preserved in the session's
`tui-catalog-journal.json`; reuse that journal, never create a fresh one to retry
this bundle. No offers were approved and no policy was activated. The website
remains a local simulation, not a client of these newly created strategies.

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
pane widths use `tuiDecisioningWidth-signals` and `tuiDecisioningWidth-decision`.
Resizable gutters support pointer and keyboard input. On narrower viewports
panes stack without horizontal scrolling.
The dashboard sidebar peeks from the left edge and opens on hover/focus or the
Lab menu button; Escape closes the explicitly opened menu.

```powershell
npm run test:tui-decisioning
npm run test:tui-browser
npm run test:decisioning-catalog-plan
npm run verify:profile-viewer-routes
```

Browser checks use only a local read-only server. Standalone external/API
requests fail the test; shell navigation reads use local fixtures and writes
or external requests fail. Set `TUI_SCREENSHOTS` to a session artifact directory
for screenshots.
Canonical UI files and the exact imported assets must be copied to the Express
mirror if `rsync` is unavailable; verify matching hashes, never reverse-sync.
