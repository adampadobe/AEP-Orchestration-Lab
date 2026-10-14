# Riyadh Air website demo

Canonical route: `/profile-viewer/riyadh-air-demo.html`. Find it under **Demos →
Riyadh Air → Web**, with Show in development capabilities enabled. The owner filter
is `apalmer`; Global values → All lab demos also exposes it. This is an original
interactive customer website, not the official site. Aviation/city/cabin artwork
is authored SVG/CSS, and font stacks are local fallbacks; no saved proprietary
page, brand photography or font binaries are copied.

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

The shared environment bar, profile drawer, web-push registration, Adobe Target,
decisioning and Brand Concierge controls remain available. Customer sections and
the canonical `TopRibbon`, `hero-banner` and `ContentCardContainer` mounts are in
the **top document**, suitable for AJO visual web authoring. Brand Concierge
supports the existing modal, bottom dock and opt-in parent-document overlay modes;
its configured runtime/catalog still requires working external bindings.

## Customer walkthrough

1. Search a one-way flight, choose an illustrative fare, complete passenger names,
   choose a seat/bag/lounge, and confirm the explicitly labelled demo payment.
   No card data is requested and no ticket is issued.
2. Manage the booking and explore an Economy-to-Business upgrade. Record interest,
   then choose **Not now** or return home/manage booking to record abandonment.
   Closing the browser is not treated as verified abandonment: no unreliable
   unload beacon or timer is used.
3. Deliver engagement and complete any purchase using the user's existing AJO
   channels, including WhatsApp. This page does **not** simulate purchase success
   or claim to read an external booking system. The shared drawer remains the
   source for real profile/channel activity; external upgrade state is labelled
   **Not verified**.
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

## ExperienceEvent contract

| Interaction | `eventType` |
|---|---|
| Flight search / selection | `travel.flight.search` / `travel.flight.select` |
| Passenger step / extras | `travel.booking.passengerDetails` / `travel.ancillary.select` |
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

## Local validation and remaining live checks

Run `npm run test:riyadh-air` (contract + isolated browser walkthrough), then
`npm run verify:profile-viewer-routes`, `npm run verify:demo-env-strip` and
`npm run verify:decisioning-mount-zones`. Run `npm run sync-profile-viewer-ui`
to update the vendored Express mirror from canonical `web/profile-viewer/`.

The local walkthrough passed under Node 22, including rejected-request recovery,
namespace/sandbox isolation, actual shared drawer opening, reload without duplicate
booking ingestion, responsive layouts, both themes and Etihad's retained iframe.
The route and decisioning-mount verifiers also passed. The repository-wide
environment-strip and environment-version checks currently fail on pre-existing
cache-bust and embedded-version drift in unchanged shared assets and other demos;
Riyadh Air uses the current manifest. These failures remain release blockers.

Browser tests intercept all API/cloud requests with fixtures; they do not send
events or create resources. Test receipts are not proof of live ingestion.
Before presenting, verify sandbox `apalmer` has the existing field groups and
Profile-enabled event dataset/datastream, choose the intended customer, and inspect
the exact event in the drawer after normal ingestion lag (30–60 seconds or more).
Verify real AJO event ID/filter/booking correlation, channel execution and actual
suppression separately in the user's journey. There is no live ingestion,
WhatsApp-purchase reconciliation or AJO-suppression certification from local tests.
