# CP decisioning demo

Open **Demos > Center Parcs > Decisioning**, or
`/profile-viewer/cp-decisioning-demo.html`. The released navigation entry does not
require the in-development switch; ordinary owner/sandbox filters and hide settings
still apply. This reuses the latest TUI
environment bar, manual-decision runtime, compact profile drawer, journey renderer
and event icons rather than creating a generic website clone. Brand photography
is selected from the supplied website ZIP; original site scripts and trackers are
not executed. All new asset names use **CP**.

Email Desktop, Mobile App and full-width Web share the same selected content.
Scenarios run 7 to 1; strategy precedence is 1 to 7. Only relevant signal groups
expand for a scenario. Local simulated eligibility is explicitly labelled and
never substituted for a live AJO result. A successful live result survives staged
edits, consent holds, failed requests and failed image loads. After a new live
decision succeeds and renders, display-tracking or refresh failures are reported
explicitly as follow-up failures; they do not mislabel the decision as failed. Changing
identity or sandbox clears it to avoid presenting another person's decision.

The site configuration selects `kirkham`; profile reads and writes refuse another
sandbox. Lookup is read-only. Apply validates existing write schemas, previews the
exact changes and requires explicit confirmation before streaming full writable
test-profile snapshots. An abandoned-search transition also sends its disclosed
event. Accepted/uncertain writes reconcile by readback; they are not resent.
Run requires loaded actual consent and a test profile, configured Tags and a
matching live policy; it never applies staged changes. Profile/drawer data refresh
after successful Run and every 30 seconds while this page has focus.

The shared live TUI drawer polls events/email-send counts every second and
audiences every five seconds. CP uses the same event icons, offer/strategy cards
and campaign/CBE attribution helper. Display events retain the CP shell URL and
selected email/app/web preview channel without presenting those preview modes as
three separate AJO delivery channels. Campaign names come from returned metadata
or the existing read-only name resolver, never from local offer predictions.
Publishing this page does not create, activate or change Adobe catalog assets,
campaigns, policies or profiles.

## AJO plan and approval boundary

`web/profile-viewer/cp-decisioning-catalog-plan.json` is the original preview
snapshot. It contains 21 CP offer items, seven CP tags, seven tag-based collections
with historical SQL and visual `uiModel`
templates, seven ranked strategies, and objective/item eligibility rules with
PQL and Adobe `segmentModel` attribute containers. The visual structures were
checked against existing kirkham rules and collections. Rule-model
`lifecycleState: published` mirrors the editor's model format, **not activation
of an AJO asset**. All planned offers are drafts. The SQL field is not the current
collection API contract; use the reconciled Coworker handoff below rather than
submitting this historical export directly.

`node scripts/prepare-cp-catalog-plan.mjs` reads the current resolved Operational
Profile schema and generates the plan only if every mapped field exists with the
correct storage type and date format. It performs no Adobe mutations. All 14
controls use schema-backed paths; none use airline attributes. The six optional
hospitality additions are available on Operational - Profile - Schema v1.12:
`hotel.customerContext.{journeyStage,shoppingIntent,abandonedSearchFlag,engagementStatus,mobileAppUser}`
and `individualCharacteristics.travel.preferences.hotel.accommodationType`
(all under `_demoemea`). These schema fields have no suggested values, enums or
defaults; UI scenario choices remain local demonstration presets.

Complaint status uses `_demoemea.complaint.status`, not a generic support-case
surrogate. Days until arrival derives from `_demoemea.hotel.bookingDetails.checkInDate`
using UTC calendar dates, and Apply serializes it back to `YYYY-MM-DD`. Date
eligibility uses future rolling windows, not a stored countdown: arrival preparation
covers today through 14 days; extras cover days 15 through 365. Past/missing arrivals
satisfy neither window. The relative-date visual model is based on existing
kirkham audience `588ec48d-766f-4774-8b02-d51931e8d5b6`; the extras rule uses an
excluded nested date-window container. Review the date editor's anchor before any
live rule creation. Accommodation preference is independent of booked `roomType`.
Existing loyalty points and lodge readiness are informational, and the generic
experience-fit score remains explicitly labelled as a demo score, not a calibrated
CP prediction or a CP rewards scheme.

Each configured industry write schema is checked separately before Apply; adding
fields to the Operational schema does not automatically add them to other ingestion
schemas or mappings. A missing write-schema field blocks Apply before any profile
write. Full snapshots preserve unrelated existing data without using it for CP rules.

The plan is **not directly executable**: tag, collection and rule ID placeholders
must be resolved after individually approved creation. Before any catalog apply,
preview the exact payloads with governed decisioning tools, show their confirmation
phrases, and obtain explicit confirmation. The attachment design was subsequently
confirmed as **combined consent AND objective AND optional item eligibility on
each offer**, leaving strategies unconstrained. That design approval does not
authorize exact mutations. Static strategy
priority alone does not establish live policy precedence.

Preparation did not change profiles, RTDB settings, policies or deployments.
A subsequent approved partial run created seven legacy DPS tags, seven collections
referencing those tags and seven strategies; no offers or eligibility rules were
created. Those tags are not Unified Tag UUIDs and the collection definitions need
live reconciliation, not blind reuse or replacement. The original plan/UI's
no-assets-created statements are historical, not a current inventory.
No activation is allowed by this task. The existing
live policy may return non-CP items: raw returned item/strategy metadata is shown
without claiming those items belong to this proposed CP catalog.

## Coworker handoff

[CP_COWORKER_HANDOFF.md](CP_COWORKER_HANDOFF.md) is the self-contained copy/paste
prompt and source-derived specification for Coworker. It includes all 21 exact
offers, initial draft create candidates, combined PQL and full visual rule models,
seven UUID-tag collection/strategy candidates, historical reconciliation IDs,
page mounts/surface requirements and the returned-ID/etag integration checklist.
A read-only check of the kirkham offer schema v1.1 verified all nine text mappings
under `_demoemea.content.textContent`; no schema changes were made for the handoff.
Public media values, delivery-slot mapping, date-editor equivalence and live
policy wiring remain explicit unresolved requirements, not invented defaults.

Regenerate with `node scripts/prepare-cp-coworker-handoff.mjs`; check source drift
with the same command plus `--check`. Run
`node --test scripts/test-cp-coworker-handoff.mjs` for its source/contract checks.
Generation is local-only and does not create Adobe assets. Coworker must inspect,
preview and obtain explicit approval before mutations, use the authorized Unified
Tags service, and report catalog completeness separately from Edge readiness.

## Local preview

`npm run preview:cp-decisioning` serves repository assets on loopback,
with an allowlisted read-only proxy for existing lab lookups. Its profile-update
route is deliberately blocked, even after clicking Apply. Live decisioning
requires the separately configured Adobe Web SDK and may require an authorised
origin; a failed live request does not erase the last successful response.
This is not a production or Firebase deployment workflow.

Run `npm run test:cp-decisioning` for schema-plan/model, shared runtime and browser
regressions, including cancellation of Apply without any outbound profile write.
