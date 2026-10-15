# Riyadh Air website demo

Canonical route: `/profile-viewer/riyadh-air-demo.html`. Find it under **Demos →
Riyadh Air → Web**, with Show in development capabilities enabled. The owner filter
is `apalmer`; Global values → All lab demos also exposes it. This is an original
interactive customer website, not the official site. The revised homepage follows
the user-supplied screenshot/HTML composition: compact gradient navigation and
booking pill, travel updates, photographic destinations, offers, Sfeer,
experience cards, cargo, Riyadh, newsletter, visa information, contact and footer.
There is no oversized illustrated airplane hero.

The full gradient customer navigation remains visible on booking screens.
Flight-search controls stay in a separate white pill below that header on home,
results, return and guest/contact screens; they are never embedded in the navigation.
Mobile airport/calendar popovers reserve space beside the floating presenter rail.

User-supplied logo/photographic assets are stored locally in
`web/profile-viewer/riyadh-air-assets/`. They include Jakarta,
Milan, Bangkok, the offers collage, Sfeer banner, cabin/entertainment/lounge/fleet,
cargo mosaic, Riyadh and Saudi visitors. No captured scripts, trackers, fonts,
forms or original site code are imported. The saved HTML is used only as a visual
and structural reference; markup, CSS and interactions are implemented here.
System font fallbacks are used because proprietary font binaries were not supplied.
This is a close visual adaptation, not a certified pixel-identical reproduction.
The booking revision also uses the supplied London photograph for the cart.
The browsing revision adds sixteen supplied Riyadh photographs, two photographic
panels extracted from the supplied Plan & book screenshot (about 1.3 MB combined),
and an original scalable purple-wave illustration. The current live reference
site returned HTTP 403 and the supplied Riyadh folder contained photos, not HTML:
the compositions follow the supplied reference, without claiming a pixel-identical
reproduction or importing the airline’s runtime.

Destination cards populate the booking bar with Riyadh departures. The initial
London-to-Riyadh route remains available for the original demo story. Experience,
cargo and visa controls open local informational details; they do not invent
connected airline services. The newsletter form validates locally, clears its
fields and explicitly confirms that no data was sent or subscription created.

## Browsing pages and natural event titles

The same mounted customer shell supports the following shareable page routes:

| `?step=` | Page |
| --- | --- |
| `home` | Home page |
| `plan` | Plan & book: reference-style wave hero, destinations and manage-order readouts |
| `discover` | Discover Riyadh: places, culture, dining, outdoor inspiration and events |
| `destinations` | Where we fly: Riyadh, London, Jakarta, Milan and Bangkok |
| `experience` | Cabin, lounge and onboard inspiration |
| `diriyah`, `edge-of-world`, `masmak`, `kafd`, `boulevard-city`, `souq` | Individual place pages with related places and a flight-search CTA |

Header, homepage and footer links connect these pages. Place/destination CTAs
populate the existing search controls without inventing a booking or sending
flight intent before Search. Public editorial deep links and reloads do not need
a stored booking. History restores pages without re-ingesting booking events.
The environment bar, Sfeer login, profile drawer, decisioning, Brand Concierge
and personalisation mounts remain in the same document.

Page titles are natural labels such as **Web page view - Home page** and
**Web page view - Discover Riyadh**, rather than “AEP Lab customer website”.
The shared Tags initial page view uses that document title. Subsequent actual
page transitions, including Back/Forward, send one standard
`web.webPageDetails.pageViews` event via the existing injected Alloy SDK.
Rerenders, same-page clicks, selecting a cabin tab and profile refresh do not
send additional page views. The SDK uses the shared per-sandbox datastream
override (`DemoLabEdgeConfig`) or its injected Tags configuration, **not** a new
generator mirror. Virtual views require an SDK-resolved ECID in the current
sandbox; changing sandbox requires reinjection. A typed but unverified identity
cannot be substituted. Known views carry the same verified email/ECID context
as the existing profile stitch, plus the required tenant core ECID.

Virtual page URLs contain only the route (`step`), never email, booking reference
or arbitrary query values. Page-view failures remain in presenter diagnostics,
do not block reading, and are never retried automatically. A request already in
flight cannot be recalled on context change. Tags rules configured to independently
send on the same navigation can still duplicate tracking; do not add such a rule.
SDK acceptance is not proof of Profile ingestion or AJO execution.

Business events also use natural labels such as **Flight search**, **Booking
confirmed**, **Flight delayed** and **Gate changed** in existing `viewName` and
generic CTA-label fields. Their event types, travel fields, URL context,
orchestration event ID and generator transport are unchanged.

## Presenter setup

Use the existing Lab menu/environment bar to select the technical sandbox, Tags
property/environment and **Lab Event tool Edge** destination. That sandbox's
Event tool datastream must be configured and its dataset Profile-enabled. The
rich payload uses the existing **Event Travel v1** and **Event Generic v1** field
groups. Other destination schemas are deliberately blocked rather than assuming
compatibility. No schema, dataset, datastream, journey or channel is provisioned
by opening this page.

Look up the existing customer using the shared identity picker. Known-customer
events require that lookup to independently resolve **both canonical email and
ECID in the selected sandbox**. The drawer's display can merge prior identity
hints; the sender does not trust that fallback. Typing a different identifier or
switching namespace/sandbox invalidates the verified identity. For an anonymous
visit, clear the identifier and inject Tags to obtain the browser ECID.

Tags handles page views and the distinct `riyadhAir.identity.stitch` event. All
business events go only through `POST /api/events/generator`; there is no business
`alloy('sendEvent')`, custom DOM tracking event, or generator page-view mirror.
Keep customer Tags rules from independently ingesting the same booking clicks.
User-supplied Tags rules and datastream configuration are outside this guarantee.

The customer header's **My profile** menu offers the reference-style **Join now**
and **Log in** experience. Both use an existing Lab profile email, the shared
profile lookup and the same Tags email/ECID stitching mechanism used by Etihad.
No password is collected and Join now does not create a real airline or Sfeer
account. A successful lookup must independently resolve email and ECID in the
selected sandbox, and the selected Adobe Web SDK must accept the identity stitch
before the header becomes **My Sfeer**. Inject the chosen Tags library first.
Failed lookups or stitching remain explicit; changing identity or sandbox clears
the signed-in display. Signing in adds no generator business/login event.
The display is tab-memory-only and is not restored as authentication after reload.
SDK acceptance is not independent confirmation of live Profile ingestion; verify
the identity graph/activity using the shared profile drawer when connected.
If context changes while the SDK call is already in flight, the site cannot undo
that request; it rejects local sign-in rather than claiming the new context was
stitched. There is no automatic retry.

The shared environment bar, profile drawer, web-push registration, Adobe Target,
decisioning and Brand Concierge controls remain available. Customer sections and
the canonical `TopRibbon`, `hero-banner` and `ContentCardContainer` mounts are in
the **top document**, suitable for AJO visual web authoring. Brand Concierge
supports the existing modal, bottom dock and opt-in parent-document overlay modes;
its configured runtime/catalog still requires working external bindings.

The Riyadh-only screen icon below the shared side rail opens a modal presenter
panel. Close, Escape and outside click dismiss it; native dialog focus containment
and focus return keep keyboard use within the panel. The panel includes the
existing controls, a read-only disruption payload preview (identity values masked),
technical status and receipt history. Technical loading/success/ingestion notes
are not shown on the customer surface or shared environment-strip message.
Customer action errors remain visible; checkout retains the demo-payment disclosure.

Before each business event and after API acceptance, the sender reads the current
authenticated sandbox target and compares its transport/datastream/style with
the loaded selection. Identity, namespace and environment changes also prevent
local advancement. This detects observable configuration changes, not an atomic
backend configuration lock: changes between reads or schema changes behind an
unchanged datastream cannot be ruled out. The existing target-based generator and
event schema mapping are unchanged; there is no raw JSON sender or new schema leaf.

Network/response uncertainty, server errors and accepted events whose context
changed preserve local trip state and block further sends, including after reload.
The presenter must check profile/AJO activity and explicitly allow another attempt.
Only non-PII attempt metadata is retained in tab storage. The prior UUID is available
for reconciliation, not automatically replayed; neither reused nor new UUIDs are
claimed to guarantee deduplication. Definitive 4xx rejections can be corrected and
retried. Profile refresh is a read, not proof of the exact event or AJO execution.

## Customer walkthrough

1. Search a one-way or round-trip flight. London → Riyadh remains the initial
   route; the supplied reference journey Riyadh → London is also selectable.
   Searchable airport popovers, a keyboard-operable two-month departure/return
   calendar and a seven-day results strip work locally. Past dates are disabled.
   Select an outbound cabin/bundle to unlock return selection. Complete Adult 1
   and contact details, review the basket and confirm the **base-flight-only**
   demo payment. No card data is requested and no ticket is issued.
2. From the **confirmed** My Trip, choose **Choose seats and extras**. Inspect
   extra-legroom seat 14A at illustrative **SAR 180**, optionally record interest,
   then **Continue without paid seat or extras**. This records booking-correlated
   **ancillary abandonment**, not flight-booking abandonment or an ancillary
   purchase. Tentative seat/bag/lounge selections are separate from assignment,
   purchased extras and the paid booking amount. Flex includes an outbound
   standard-seat entitlement; the paid offer is extra legroom/preferred, not
   charging again for the included standard tier. The confirmed flight amount
   remains unchanged. Cabin-upgrade interest remains separately available.
3. Deliver engagement and complete any purchase using the user's existing AJO
   channels, including WhatsApp. This page does **not** simulate purchase success
   or claim to read an external booking system. The shared drawer remains the
   source for real profile/channel activity; unverified external purchase state is
   not presented as part of the customer's booking. Channel/verification caveats
   remain in the presenter panel.
4. Open **Presenter controls** and send a delay or gate change for the confirmed
   booking. Optional **AJO disruption event ID** uses the user's existing event
   binding. After API acceptance, the website shows care instead of its local
   upgrade promotion and hides its three decisioning promotion mounts. This is a
   local customer-surface pivot, **not verified AJO promotional suppression**.

One tab's illustrative trip is retained in `sessionStorage`, scoped to
sandbox/email/ECID. A different identity cannot manage or disrupt that trip. Reset
local trip changes only browser state, never AEP events or AJO state. Acceptance
advances the customer flow; rejected requests leave the current step intact.
No automatic event retry is performed (an ambiguous network failure requires
checking profile activity before manually repeating the action).

### Booking reference coverage and navigation

Steps have stable query URLs on the canonical HTML entry point:
`?step=results`, `return`, `passenger`, `contact`, `cart`, `payment`, `trip`,
`extras` and `upgrade`. Browser back/forward and reload restore the valid step
without sending events. Selections are retained in tab-local state, not encoded
as personal data in URLs. Invalid/deep-linked steps are gated by available
selections/completion. The same selected profile must be resolved after reload.
The site does not turn a URL into permission to access a different booking.

The supplied references cover airport/calendar controls, outbound/return
results and Lite/Smart/Flex bundles, guest/loyalty fields, incomplete cart and
completed cart. Economy outbound Flex **SAR 2,341** plus return Smart **SAR 1,788**
is exactly **SAR 4,129**, including illustrative taxes. All new booking-path
amounts use SAR. Premium/Business base prices come from the reference; their
bundle differences and non-London schedules use illustrative fixture values,
not live fare or policy claims. Benefits are sample reference inventory, not a
promise of availability. No fare lookup or airline reservation API is connected.
Fares also vary deterministically with travel date: illustrative weekday demand,
seasonality and route-specific inventory demand adjust each directional base.
Premium/Business bundle increments scale with cabin. The seven-day strip shows
the matching starting fare for each date. This is simulated pricing, not live
yield management; the same route/date/cabin/bundle always quotes the same amount.
Selected fares are retained through basket, checkout and reload. The supplied
1 November outbound / 19 November return reference fares remain the baseline.
Supported airports are RUH, LHR, CGK, MXP and BKK, each with supplied imagery.
Direct demo inventory is offered only to/from Riyadh; other combinations return
explicit availability feedback. Route-specific fixture flight numbers, local
times/durations, fares and destination images propagate into both leg summaries,
basket, checkout, confirmation and My Trip. Return reverses the airports and uses
the selected return date. New searches invalidate draft selections; confirmed
bookings require an explicit local reset before replacement.

Guest title, name, DOB, optional loyalty/contact fields and the Sfeer toggle are
demo-only tab-local inputs. They are never added to ExperienceEvent fields or
URLs and do not change the selected Lab identity or enrol anyone in Sfeer.
Reset clears these tab-local details. No real guest data should be entered.

Paid-seat interaction adapts the existing Etihad pattern (seat rows, availability,
tentative selection and seat benefits/price), restyled for Riyadh Air. It does not
copy Etihad's free-seat confirmation behavior. Checkout, confirmation, My Trip
and upgrade-detail screens remain original demo layouts; actual reference
captures for those screens would improve their visual fidelity. Real seat-map
screenshots are not required for this user-authorised illustrative adaptation.

A same-tab offer link such as
`?step=extras&booking=RA123ABC&offer=extra-legroom-outbound` can reopen the stored
booking/offer after the same profile is resolved. It is **not** a server booking
lookup, cross-device handoff or connected WhatsApp purchase callback. Reload and
history do not re-ingest intent/abandonment. Explicit decline/home/manage records
abandonment once for the current selection; back, closing a browser or timing out
does not claim a verified abandonment event.

## ExperienceEvent contract

| Interaction | `eventType` |
|---|---|
| Flight search / selection | `travel.flight.search` / `travel.flight.select` |
| Passenger step / extras | `travel.booking.passengerDetails` / `travel.ancillary.select` |
| Post-booking ancillary browse / intent / leave | `travel.ancillary.view` / `travel.ancillary.intent` / `travel.ancillary.abandon` |
| Demo booking confirmed / viewed | `travel.booking.confirm` / `travel.booking.view` |
| Upgrade browse / intent / leave | `travel.upgrade.view` / `travel.upgrade.intent` / `travel.upgrade.abandon` |
| Delay / gate change | `travel.flight.delay` / `travel.flight.gateChange` |

`channel: "Web"`, explicit `sandbox`, selected `targetId`, UUID `_id`, timestamp,
and `xdmStyle: "full"` are sent to the existing generator. The server builds XDM
using its tenant convention; this page does not hardcode another brand's tenant,
schema IDs or datastream IDs. ECID is primary; canonical email is secondary for
known customers.

Within `_<tenant>.public.travel`, only existing schema leaves are used:
`departureAirport`, `arrivalAirport`, `confirmationNumber` (the stable local
booking reference). Search has no reference yet; selection establishes it.
Within `_<tenant>.public.generic`, `ctaLabel` is the exact event type and
`linkUrl` is a versioned context URL. `web.webPageDetails.URL` carries the same URL.
Parameters: `journey=riyadh-air-v1`, `action`, `booking`, `flight`, `departure`,
`cabin`, optional `seat`, `bag=extra-23kg`, `lounge=true`, and disruption-specific
`delayMinutes` or `gate`. No passenger identity/name or payment data is in the URL.
Round-trip context adds `return`; fare/ancillary context can add `leg`, `bundle`,
`offer`, `seatTier`, `amount` and `currency=SAR`. Ancillary `seat` is the tentative
offer selection, **not** a confirmed assignment. Base-flight confirmation carries
no unpaid seat or ancillary selection.
For example:

```text
/profile-viewer/riyadh-air-demo.html?journey=riyadh-air-v1&action=delay&booking=RA123ABC&flight=RX100&departure=2026-11-01&cabin=Economy&delayMinutes=90
```

The existing Travel v1 schema has **no dedicated flight number, seat, upgrade,
delay-minutes or gate leaves**. The URL representation deliberately avoids
inventing unsupported XDM fields. Bind AJO disruption/filter logic to `eventType`
and `public.travel.confirmationNumber`; richer variables must be parsed from the
context URL or added later through a separately approved schema change. Supplying
an orchestration ID alone does not prove that an AJO journey is bound or running;
without an explicit ID the generator's existing default applies.

These are append-only **ExperienceEvents**, not updates to profile travel
reservations, loyalty, purchase status or suppression attributes. No
`/api/profile/update` request is made.
The `travel.ancillary.*` event strings fit the existing generic `eventType` /
`ctaLabel` and context URL schema; no new XDM leaves are introduced. They are
an explicit demo contract, **not a verified pre-existing AJO event binding**.
Configure/verify the user's AJO targeting against ancillary abandonment and the
booking reference separately; no AJO resources are modified by this change.

## Local validation and remaining live checks

Run `npm run test:riyadh-air` (contract + isolated browser walkthrough), then
`npm run verify:profile-viewer-routes`, `npm run verify:demo-env-strip` and
`npm run verify:decisioning-mount-zones`. Run `npm run sync-profile-viewer-ui`
to update the vendored Express mirror from canonical `web/profile-viewer/`.

The local walkthrough passed under Node 22, including rejected-request recovery,
namespace/sandbox isolation, actual shared drawer opening, reload without duplicate
booking ingestion, responsive layouts, both themes and Etihad's retained iframe.
The route and decisioning-mount verifiers also passed. The repository-wide
environment-strip and environment-version checks also cover every shared-loader
consumer, including mobile shells and generated-demo templates. Loader cache
versions and embedded offline defaults are synchronized from the shared manifest;
CI rejects drift before merge.

Browser tests intercept all API/cloud requests with fixtures; they do not send
events or create resources. Test receipts are not proof of live ingestion.
Before presenting, verify sandbox `apalmer` has the existing field groups and
Profile-enabled event dataset/datastream, choose the intended customer, and inspect
the exact event in the drawer after normal ingestion lag (30–60 seconds or more).
Verify real AJO event ID/filter/booking correlation, channel execution and actual
suppression separately in the user's journey. There is no live ingestion,
WhatsApp-purchase reconciliation or AJO-suppression certification from local tests.
