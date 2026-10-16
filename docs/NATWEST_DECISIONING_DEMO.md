# NatWest decisioning demo

Open `/profile-viewer/natwest-decisioning-demo.html`. The existing `?channel=email`,
`?channel=mobile`, and `?channel=web` links remain supported. Mobile is a phone
preview of the same responsive email, not a mobile application.

The visualiser has three resizable panes: collapsible banking signals, a
seven-step local objective ladder with expandable NBA scores, and customer
previews. The uploaded NatWest logo and photography are local assets. The Web
view is a reconstruction, not a running copy of the captured site. Product copy
is illustrative; no email, application, or live product offer is delivered.

## Profile drawer

The bottom drawer includes the BA-style customer hero, contact and consent cards,
banking KPIs, and ECID copy / new-anonymous-visitor controls. Checking Account
Type, product holdings, product interest, complaint status, eligible offers and
personalisation consent come from the loaded profile, not staged simulator edits.
Missing banking attributes remain **Not set**, not inferred from other holdings.
The KPIs show raw propensity/churn scores, eligible offers and product interest.
The full drawer is capped at **35rem (560px at the default font size)** on desktop,
or the available viewport if shorter, roughly the height of five recent events.
The compact profile card uses keyboard-accessible **Contact**, **Banking** and
**Identity** tabs below the hero/KPIs. Banking holdings are two-column tiles;
long content and events scroll internally rather than stretching every column.
On narrow screens the stacked drawer is capped at 55dvh with scrolling.
The height stays stable with unloaded, loaded and cleared profiles.

The event count opens the **Canvas flow**, **Swimlanes**, and **Stages** journey
views. Select an event for its details; Stages pairs a consecutive NatWest decision
request and PropositionDisplay within two minutes. Offer and strategy names are
shown only when present in the ingested event. The identity graph still opens
its linked-identifier timeline. Changing identity or sandbox clears the drawer.
Profile lookup does not send an application-login event.
Message-tracking events use the same envelope-with-tick SVG as the BA drawer,
in both recent events and the shared journey views.

Use `?nwDrawer=classic` to restore the classic customer/identity blocks and
`?journey=classic` for the classic event timeline. Restore with `?nwDrawer=hero`
and `?journey=concepts`; these choices persist in local storage.

## Live controls and setup

The shell uses the shared Spectrum environment strip, Tags injection, profile
drawer and decisioning runtime. Select the sandbox and identity, configure/inject
the existing Tags environment, enable Decisioning, and look up a **test profile**.
Local signal edits are staged. **Apply profile changes** re-fetches the latest
profile, validates the resolved schemas, and submits full writable snapshots for
the affected industry dataflows. It never provisions infrastructure.
Text and numeric edits stage immediately without waiting for blur. Apply can
look up the selected profile itself: enter an identifier and select the sandbox,
edit the controls, then Apply. Only explicitly edited signals are overlaid onto
the fetched profile; untouched illustrative defaults never overwrite its data.
An initial Apply without edits loads the profile and asks for a signal change,
without writing. Non-test profiles stay read-only and accepted updates are
confirmed automatically before another Apply. Disabled Apply buttons explain
why in their tooltip. Explicitly selecting a value can initialise a missing
field even when that value matches the simulator default.

All controls reuse existing generic fields from the supplied Operational profile
sample. Paths below are tenant-relative except root `consents.*`.

| Control | Path | Type / dataflow |
|---|---|---|
| Account Type (checking) | `individualCharacteristics.fsi.productOverview.checkingAcctType` | string / FSI |
| Current account held | `individualCharacteristics.fsi.productOverview.checkingAcct` | boolean / FSI |
| Savings held | `individualCharacteristics.fsi.productOverview.savingsAcct` | boolean / FSI |
| Mortgage held | `individualCharacteristics.fsi.productOverview.mortgageHolder` | boolean / FSI |
| Loan held | `individualCharacteristics.fsi.productOverview.loansAcct` | boolean / FSI |
| Investment held | `individualCharacteristics.fsi.productOverview.investmentAcct` | boolean / FSI |
| Product interest | `individualCharacteristics.fsi.financialDetails.customerBehavior.productInterest` | string / FSI |
| Propensity | `scoring.core.propensityScore` | number / Generic |
| Churn prediction | `scoring.churn.churnPrediction` | number / Generic |
| Complaint status | `complaint.status` | string / Generic |
| Eligible offer count | `offersAndPromotions.eligibleOffers` | number / Generic |
| Email marketing consent | `consents.marketing.email.val` | string / Generic, root |
| Content personalisation | `consents.personalize.content.val` | string / Generic, root |

Strings and decimal scores are preserved exactly; no low/medium/high conversion
is written back. Count controls use non-negative whole numbers. The sample does
not define enums or ranges; the resolved live schema is checked before writes.
Missing fields use illustrative defaults **only in the local simulator**, with
an explicit status warning. Only changed controls are overlaid onto full industry
snapshots. Known mapped values are preserved even on older servers that do not
yet annotate their ownership.
Existing `individualCharacteristics.fsi.*`, `industryFsi.*` and
`personalFinances.*` values are preserved in the FSI snapshot even when an older
table backend marks them unowned. A configured, writable dataflow does not need
existing writable rows before its first field update; only explicitly edited
missing signals are added, never the whole set of simulator defaults.

There are no `natwestDecisioning.*` definitions or writes. Unsupported application,
document, restriction, shopping-recency, contact-safety and frequency controls
have been removed, not mapped to unrelated profile or event fields.
The manifest and industry ownership map now reference the reused generic leaves;
no existing AEP schema was deleted, modified or provisioned.
Apply requires configured Generic/FSI dataflows whose resolved schemas contain
the affected paths; it refuses missing fields, wrong types, enums and numeric
bounds. **A Hosting preview does not deploy Functions or provision fields.**

The supplied Operational schema is a reference, not necessarily the schema used
by the selected sandbox's Lab dataflows. Missing-field errors identify the
sandbox, dataflow and actual schema ID. Offer delivery/display events do not
populate `offersAndPromotions.eligibleOffers`, which is a profile eligibility
count. Existing unowned `offersAndPromotions.*` and `complaint.*` siblings are
preserved in Generic full snapshots, not replaced by simulator defaults.
Preflight reads schema metadata first and requests the resolved schema at that
exact minor version. A major-only `version=1` resolved response can remain cached
at an older revision after an approved field-group attachment.

On 2026-10-16, following explicit user approval for **kirkham**, the existing
**Offers and Promotions Details** field group
(`https://ns.adobe.com/demoemea/mixins/feb718b0e3d9cf6e1709b2688ddf2219781c4b8b577f6a90`)
was attached additively to **AEP Lab - Generic Profile - Schema**
(`https://ns.adobe.com/demoemea/schemas/1c3c9979ae2192f041bf21b8ddeaca63b6042f79d0e3e091`).
The schema advanced from 1.4 to 1.5. No field definitions or profile values were
changed; `complaint.status` was already present in kirkham. No schema changes
were made in apalmer. Other sandboxes still need their own inspected and approved
configuration; the demo never attaches field groups automatically.

## Local rule conventions

The email-first preview requires explicit `y` in both email marketing and content
personalisation consent. Every other value holds content, including support
content; a marketing opt-out does not imply transactional permission.
Run also requires both consent values in the actual readback; missing fields
and illustrative local defaults never authorise a live decision.
Among permitted profiles the seven-step ladder selects: unresolved complaint
support; churn support at 65+; first-current-account exploration; guidance for an
interested product already held; new-product exploration at propensity 65+;
saver growth at propensity 35+; otherwise everyday guidance.
New-product exploration requires a positive eligible-offer count.
Complaint values other than blank, `none`, `resolved` or `closed` select support.
Product rules recognise `current`, `savings`, `mortgage`, `loan` and `investment`
case-insensitively. Other string values remain intact without implying holdings.
Account Type contributes to the local customer score; holdings, interest, offers,
propensity and churn affect gates or scores. These are illustrative thresholds
and preset values, not inferred schema enums, financial advice or underwriting.

**Apply -> confirmation -> Run:** after all snapshots are accepted, the demo
automatically polls Hub profile readback after 1.5 seconds, increasing the delay
by 1.5 up to six seconds, with a 120-second deadline and one-second progress text.
Run joins the same confirmation promise and disables Run/Apply while waiting,
then continues without another click. A timeout is a calm processing message;
a later Run starts another bounded wait. Context changes cancel the watcher.
Mismatch details are console-only. Failed or partial writes remain explicit;
there is no automatic write retry. A partial Apply is confirmed by lookup before
retrying only the remaining staged fields. NatWest has no Apply-triggered
operational tracking events.

Before writing, Apply reads all AJO eligibility-rule pages in the selected
sandbox and filters confirmation to changed rule-read fields plus the two
explicit consent gates. Other saved attributes are not readback gates. The
2026-10-16 read-only audit of **51 kirkham rules** found:

| Control | AJO rule usage |
|---|---|
| Account Type | `FSI - Current Account Holder` reads `checkingAcctType`, comparing to `Current Account` case-insensitively |
| Propensity | Read by existing sandbox rules, but not the sole FSI-named rule; this does not establish NatWest strategy linkage |
| Current/savings/mortgage/loan/investment holdings, product interest, churn, complaint status, eligible offer count | No current rule reads these paths; they affect only the local simulation, though Apply still saves them |
| Email/content-personalisation consent | Not read by current AJO rules; retained as mandatory client-side safety gates |

No controls or AJO rules were remapped. Only the known `Current account` /
`Current Account` labels are equivalent during readback, and only for Account
Type; other strings and numbers remain exact. Hub confirmation does not guarantee
Edge propagation. The Edge request carries no profile-attribute overrides.

Signal groups, objectives and Eligible NBAs start collapsed. Scenario selection
collapses all previous signal groups, opens all groups named in the full preset,
and expands the selected objective and NBAs. Consent-hold scenarios remain
applicable to this email-first demo. The existing compact drawer prevents block
tops peeking above the minimised strip; Messages Sent uses the same events poll,
and the shared Persona Journey supports viewport-fit layouts.

The optional `manualDisplay: true` mode in the shared runtime disables automatic
rendering. This demo accepts one fresh, explicitly hero-scoped proposition,
ignores default-content/fallback items, and waits for its HTTP(S) image to load
in the selected visible channel before sending a display notification with the
original proposition metadata and request identity. Channel switches do not
send another display. Existing runtime consumers retain automatic rendering.
Returned item IDs, names and selection metadata are retained in display events,
so offer/strategy details can be shown when AEP actually ingests them. Standard
`_experience.decisioning.*` and `identityMap` paths match the supplied event
sample; sample numeric flag values are not used as real event values.

The objective ladder and scores remain a **local simulation**, independent of
the live hero image/title/description. Local safety/consent holds hide previews.
Changing identity or sandbox clears the previous live hero.

## Development

Run `node --test scripts/test-natwest-decisioning.cjs` for model, compatibility,
browser layout and fixture-only profile/decision lifecycle coverage. The test
server mocks all platform operations; it never contacts AEP. Also run the
Profile Viewer route, environment strip, mount-zone, and environment-version
verifiers. Mirror canonical UI changes using the documented sync workflow.

The reusable upload-first workflow is
`.github/skills/create-decisioning-demo/SKILL.md`; it defaults to this three-pane
experience without requiring another customer's demo as an input.
Its `references/` now includes both actual Operational Profile/Event Schema
Registry exports alongside the sample payloads. Exports include resource links
and constraints but may omit Adobe standard dependencies; live resolved-schema
preflight remains the authority for explicit writes.
