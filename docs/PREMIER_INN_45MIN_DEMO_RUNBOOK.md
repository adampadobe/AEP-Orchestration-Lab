# Premier Inn × Adobe — 45‑minute persona-led lab (runbook)

This runbook maps the **persona-led hospitality narrative** (business traveller, reactivation, Manchester city break, filters, breakfast, checkout abandon) to **this repository’s** Profile Viewer + Cloud Functions so you can rehearse and deliver without missing wiring.

Canonical lab UI lives under **`web/profile-viewer/`** (Firebase Hosting: `https://aep-orchestration-lab.web.app/profile-viewer/…`).

## 1. What the repo already covers

| PDF / story beat | Lab asset | Notes |
|------------------|-----------|--------|
| Known guest / unified profile | Profile Viewer **Travel** profile streaming + **Profile table** lookup | Use **email** primary identity after you stream the profile. |
| Website journey (search → filters → breakfast → checkout → abandon) | **`premier-inn-demo.html`** embeds **`premier-inn/premier-inn-site.html`** → **`premier-inn-booking-flow.html`** | Iframe posts `hotel.*` events to the parent; parent **`POST /api/events/generator`** with sandbox + ECID + optional email. See `premier-inn/premier-inn-events.js`. |
| Identity + ECID alignment | `premier-inn-demo.js` + `DemoTagsInjection` with **`iframeIds: []`** | Same pattern as `docs/ANONYMOUS_EDGE_DEMO_PATTERN.md` — one ECID on the shell, generator uses `#infoEcid`. |
| Streamed experience events (fast segment qualification) | Generator merges **`body.public`** keys matching **`hotel*`** into **`_demoemea.public`** (`mergeGeneratorPublicIntoTenant` in `functions/eventGeneratorService.js`) | Segment rules should target **`eventType`** plus tenant **`public.*`** fields your Experience Event schema actually exposes (use Data Explorer / attribute picker to confirm the exact path). |
| High LTV / churn / loyalty / travel prefs on profile | Travel generator + **`POST /api/profile/generate`** (`industry: "travel"`) | Analytics scores and reservations use the same dotted paths as `profile-generation-travel.js` (tenant vs root is resolved in `functions/profileStreamingCore.js`). |

**Out of scope for this repo (prepare separately):** slide deck, Adobe Journey Optimizer / AI assistant guardrail UI, production Premier iframe or brand approvals, and **creating segments inside your AEP org** (do that in the Segmentation UI or Segmentation API with your credentials).

## 2. Prep checklist (before the room)

1. **Sandbox** — Technical sandbox name saved in the lab (Travel connection + generator target for `_demoemea`).
2. **Travel profile HTTP stream** — Travel wizard: schema, dataset, HTTP flow, **Profile enabled** on the dataset (see Travel page hints).
3. **Experience Event dataset** — Generator target must ingest **`eventType`** and **`_demoemea`** (or your tenant key) with **`public`** object carrying `hotelDestination`, etc., per your Event Tool schema.
4. **Miranda email** — Use the naming pattern in §4; stream the profile **before** identity stitch + website walkthrough if you want email-visible attributes immediately.
5. **ECID field** — Shell shows ECID; after **Lookup profile** / stitch, confirm **Profile table** and **Last events** populate (allow UPS lag; generator path is usually faster than Edge-only).

## 3. Lab URLs (hosted)

- **Shell (Tags + iframe + generator):** `/profile-viewer/premier-inn-demo.html`
- **Site clone (search):** `/profile-viewer/premier-inn/premier-inn-site.html`
- **Booking flow (filters, breakfast, abandon):** `/profile-viewer/premier-inn/premier-inn-booking-flow.html?where=Manchester&…`
- **Travel profile streaming:** `/profile-viewer/profile-generation-travel.html`
- **Event Tool (if you need to adjust EE schema):** `/profile-viewer/event-tool.html`

After local edits under `web/profile-viewer/`, run **`npm run sync-profile-viewer-ui`** for the Express mirror and **`npm run verify:profile-viewer-routes`** before PR / deploy (see `CONTRIBUTING.md`).

## 4. Email naming convention (profiles)

Use Gmail plus-addressing so each demo day gets a fresh primary key without new inboxes:

```text
adamp.adobedemo+DDMMYYYY-n@gmail.com
```

- **`DDMMYYYY`** — demo date, e.g. `12052026` for 12 May 2026.
- **`n`** — integer suffix for multiple personas the same day (`1` primary “Miranda-style”, `2` contrast traveller, etc.).

**Example (primary persona):** `adamp.adobedemo+12052026-1@gmail.com`

Stream this with **`industry: "travel"`** and the attributes in **`scripts/premier-inn-demo-profile-recipes.json`** (or paste into Travel **Customer analytics** + **Travel preferences** + flight fields for parity with the UI).

## 5. Agnostic segments (create in AEP)

Keep names **vendor-neutral** so you can reuse them in other hospitality demos. Build definitions with your schema’s **actual** XDM paths (picker differs by field group). Below, **`public.*`** means the generator’s hospitality payload merged under your tenant’s **`public`** object (commonly `_demoemea.public.*` on the experience event).

| Segment name (suggested) | Definition intent | Quick rule shape |
|--------------------------|--------------------|------------------|
| **Lab — EE: payment abandon (hospitality)** | Checkout abandon for recovery | `eventType` = `hotel.checkout.abandon` in last **1 day** (tighten to hours day-of). |
| **Lab — EE: search intent city break** | Manchester / city-break narrative | `eventType` in (`hotel.search`,`hotel.availability.view`) **AND** `public.hotelDestination` contains `Manchester` (or equals if you normalize). |
| **Lab — EE: filter engagement** | Guests narrowing results | `eventType` = `hotel.filter.apply` in last 1 day. |
| **Lab — EE: product content (breakfast)** | Educational content step | `eventType` = `hotel.content.view` **AND** `public.hotelContentTopic` = `breakfast`. |
| **Lab — Profile: churn risk elevated** | “At risk” without naming Premier | Profile attribute **`churnPrediction`** (from streamed **`scoring.churn.churnPrediction`**) **≥ 75**. Pick the path the **Profile** UI shows after lookup. |
| **Lab — Profile: commercial value proxy** | High spend proxy | **`orderProfile.avgOrderSize`** above your threshold (e.g. **> 300**). |
| **Lab — Profile: premium loyalty** | Tier match | **`loyalty.tier`** in (`Gold`,`Platinum`) or equivalent. |
| **Lab — Profile: low near-term interest** | “Lapsed interest” proxy when you lack a true last-booking date | **`scoring.core.propensityScore`** **< 35** (tune per sandbox). |

**Optional composite (advanced):** “Lapsed booker” usually needs **no** `hotel.booking.complete` for N days **plus** a profile or propensity signal — only add this once the simple segments above qualify, so you are not blocked on long lookback windows during the session.

## 6. Experience events the iframe already emits

Relevant **`eventType`** values: `hotel.search`, `hotel.availability.view`, `hotel.filter.apply`, `hotel.content.view`, `hotel.room.select`, `hotel.booking.start`, `hotel.payment.expose`, `hotel.checkout.abandon`, `hotel.booking.complete`.

Representative **`public`** keys (merged for segment rules): `itineraryId` → **`hotelItineraryId`** on tenant, plus `hotelDestination`, `hotelCheckIn`, `hotelCheckOut`, `hotelSearchIntent`, `hotelFunnelStep`, `hotelFiltersActive`, `hotelContentTopic`, `hotelPropertyId`, `hotelAbandonReason`, `linkUrl`, `ctaLabel`, etc. (see `premier-inn-booking-flow.html`).

## 7. Profile data aligned to targeting

Use **`scripts/premier-inn-demo-profile-recipes.json`**:

- **Primary** — High churn, moderate–low propensity, high **AOV proxy**, **Gold** loyalty, **business** flight MAN→LHR, travel prefs (club room, breakfast, MAN departure airport). Supports “high value at risk”, “premium guest”, and airport/city-break talking points.
- **Contrast** — Low churn / lower AOV for “does not qualify” checks.

Generate curls:

```bash
node scripts/print-premier-demo-profile-curl.mjs --sandbox YOUR_TECHNICAL_SANDBOX --recipe hospitality-persona-primary
```

Set **`LAB_ORIGIN`** if you are hitting local hosting (defaults to production lab URL in the script).

## 8. Gaps to be aware of (honest)

- **“Lapsed 10 months since last stay”** is not a single built-in profile leaf in the Travel generator; use **events** (no recent completion), **churn**, and **propensity** for the story unless you add a custom field group and stream it.
- **Hotel reservation objects** from the Travel form are **not** streamed to AEP (by design — see comments in `profile-generation-travel.js`); use **`travelPreferences.*`** and **`travelReservations.flightReservations.*`** for schema-backed hospitality-adjacent depth.
- **Reactivation email** in the PDF is often a **narrative** beat; the lab does not send real email — show AJO / email proof in platform or slides.

When those three are covered in talk track or platform, the **lab repo** side is sufficient for the unified profile + behaviour + segment qualification loop.
