# Snowflake relational layer and generator

The relational layer is additive to the existing
`AEP_SCHEMA.AGENTIC_*` profile, event, and enrichment tables. It does not
replace or delete those source tables. The **existing
`AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE` is the single physical
recipient parent for every industry**, despite its historical travel name.
`REL.RECIPIENT` is only a read-only view of that parent, not another writable
table or a replacement ingestion source.

## Legacy Travel retirement boundary

On 13 Nov 2026, the four older Travel Recipient, Bookings, Booking Segments and
Booking Ancillaries destinations returned exact Catalog 404. Their flow IDs are
retained in `functions/myDataFlowsRegistry.js` as retirement contracts, outside
the active 28 REL / 44 XDM ingestion bindings. The shared Agentic parent table
remains writable; `REL.RECIPIENT` remains its read-only projection. Neither
current Base/Booking XDM ingestion nor the current travel REL model is retired.

The existing owner-scoped cleanup disable/delete previews can clear protection
for those four **flows only**, in the reviewed organisation and `apalmer`
sandbox. Each preview must verify the exact legacy connections, mapping version,
an exact missing-destination 404, unshared connections/mapping, the intact REL
baseline and enabled current XDM flows, and ready replacement REL ingestion/OC
configuration. These checks are rerun before application; configuration drift
invalidates the review. Companion connections, schemas and datasets, and the
shared Snowflake account remain protected.

This is not external campaign/application usage clearance. Normal independent
usage review, exact-operation confirmation, disable/drain/delete verification,
and repository release gates still apply. No live retirement or scheduler
recovery is implied by changing the registry. Removing obsolete dependencies
does not relax the scheduler's two-hour health window or its rejection of unknown
failure counts, replay the failed slot, or establish that source records landed
in AEP. Fresh health and subsequent scheduled-run provenance must be verified
separately.

## Private architecture reference and walkthrough

The Lab owner's **Architecture -> My data flows** page
(`web/profile-viewer/my-data-flows.html`) explains direct Lab streaming,
Snowflake-first generation, and the separate XDM and REL ingestion paths.
It includes expandable, zoomable diagrams and five **simulation-only**
walkthroughs: new Snowflake-first profile, direct AEP profile, dual-load,
existing-profile update, and an event. Play/Next never generate identities,
send events, change data, or invoke a repair.

The diagram automatically fills the available width and adjusts its height to
the flow's proportions. Zoom controls enlarge the flow for scrollable inspection;
manual zoom survives viewport resizing until **Fit diagram** restores auto-fit.
**Flow view** is the default: simulation steps progressively reveal their nodes
and connections without changing node coordinates. **Full architecture** shows
the entire topology, dimming unrelated paths without resetting playback.
Live flow view starts at the Lab and retains systems once their checks begin;
waiting, failed and unavailable checks never imply verified arrival.

The static page is only a shell. Reference content, flow identifiers, inventory
and dated evidence are returned by
`GET /api/architecture/my-data-flows?sandbox=apalmer` after server-side Firebase
owner authorization, including revocation and current owner UID checks. Hiding
the sidebar link is not the security boundary. Other users and direct
unauthorized API requests receive no private content. Responses use
`Cache-Control: private, no-store`; sign-out/account changes clear the page and
invalidate pending requests. No Firestore client rules are relaxed.

`refresh=true` requests bounded, read-only metadata from the reviewed
`functions/myDataFlowsRegistry.js` bindings. The service verifies actual source
tables and resolves target datasets, mapping versions, schedules and latest
run metrics. It also checks saved HTTP streaming connections and reads the
shared event configuration. It does not read Snowflake rows, run Query Service,
inspect base-connection credentials, return inlet URLs, discover every sandbox
flow, or automatically repair anything. Replaced/new flows require a reviewed
registry update. Only `apalmer` in the reviewed Adobe organization is supported;
changing the global sandbox does not silently rebind this owner-specific model.

Complete snapshots may be reused for 60 seconds; their original `fetchedAt`
remains visible. Errors and budget exhaustion produce explicit incomplete
metadata, not empty green success. Missing counts remain unknown. The reference
and historical stored-data evidence remain dated snapshots, not live claims.
The source/reference modules are deployed server-side, not bundled under `web/`.

Timing distinguishes **configured cadence**, **asynchronous refresh target**,
**observed execution**, **unknown indexing/commit time**, and **illustrative
playback**. A 15-minute source schedule is not an end-to-end availability SLA.
Parallel XDM and REL steps are independent; OC extension completion is not
campaign targeting, consent or send readiness.

Run `npm run test:my-data-flows` for owner-access, service/reference contracts
and browser fixtures without production credentials. Apply the standard
Profile Viewer mirror/route checks. Hosting and the named `myDataFlows`
Function must be released together through the normal approved release gates;
the public shell cannot provide a private fallback if the API is absent.

### Live create-and-trace mode

The separate **Live** mode accepts an industry and an explicit **Create profile
& trace** action. It creates exactly one Snowflake-first test recipient and the
existing generator's linked industry sample data. It does not stream directly
to AEP, send messages, repair flows, replay ingestion or alter schemas. Simulation
Play/Next remain presentation-only. Natural XDM and REL ingestion runs independently.

`/api/architecture/my-data-flows/trace` uses the same server-side owner gate.
`POST {industry, requestId}` creates a durable run; the UUID request ID is scoped
to the owner and is single-use for generation, including concurrent requests.
Repeating that request returns its receipt, never another profile. GET without
an ID resumes the latest run; `GET ?runId=<uuid>&refresh=true` checks that same
identity. A persisted lease bounds overlapping checks; manual refresh and browser
polling do not cause more generation. Source creation blocks concurrent new runs
and subsequent creates have a one-minute cooldown.

Server-only Firestore receipts live at
`myDataFlowsTraces/{uid}/runs/{requestId}`. Identity is saved **before** row writes.
An interrupted or uncertain write is never retried automatically; after six
minutes a stale creation can be inspected as uncertain. Reserved counter values
are not reused. Stop watching stops observation only, not the source write,
ingestion or stored data. Refresh/reopening resumes the existing identity.

The live adapter preflights existing objects without DDL and invokes the
shared industry generator with `prepareTables:false`, count one and
`testProfile:true`. Missing readiness blocks creation and points to existing
settings/setup. Generation uses the shared UTC daily email counter, and the saved
mobile is applied to both the industry CRM and shared parent. Identity settings
must remain consistent with the preview/preflight; this is not a second counter
or independent credential store.

Snowflake checks are identity-filtered, parameter-bound and bounded. Source rows,
REL projections, flow metadata and AEP Profile reads are independent evidence.
Optional industry records may legitimately be absent. AEP Profile verification
requires the same entity by Email and ECID with the expected mobile and test flag;
it is not a complete industry-field comparison or a source-specific dataset audit.
Read errors remain explicit and never become zero counts or green destinations.

The current AEP REST integration cannot read general ad-hoc Query Service result
rows. XDM/REL storage stages therefore stay **Unavailable**, even when a flow
succeeds or Profile becomes visible. Their details show resolved destination
datasets and clearly marked, unexecuted SQL templates: replace the Query Service
table and mapped-field placeholders using that dataset's schema. No arbitrary
SQL execution endpoint or unsupported results reader is introduced.

The live trace adds named Function `myDataFlowsTrace` to the coordinated
Hosting/Functions release. It inherits the existing Snowflake static-egress VPC
options and binds the existing Adobe secrets; no new credential store is added.
Offline tests cover duplicate protection, uncertain
creation, owner isolation, readback semantics and browser controls; no real profile
is generated by those tests. A separately authorized live run after deployment is
still needed for end-to-end operational acceptance.

## Snowflake-first workflow

1. Open **Profile generation – Snowflake**, save the connection, and select
   Travel, FSI, Retail, Telecom, Media, or Sports.
2. Choose a count and **Seed recipients & industry data** (the default scope).
   The generator creates new shared base recipients plus selected-industry
   customer, event, enrichment, and relational detail data. It uses the existing
   Profile Generation email preferences; no prior profiles or AEP write are needed.
3. Inspect the result's parent table, per-table row counts, and sample industry rows.
   Travel's relational rows are written immediately. Non-travel dynamic tables
   derive from the seeded source data asynchronously with a one-minute target
   lag; this is not a guaranteed refresh deadline.
4. Use the existing base-table ingestion flow and map the industry tables into
   AEP/AJO as appropriate. This code does not create or change Adobe schemas,
   flows, identities, or Campaign Orchestration relationships automatically.

The **legacy travel Python runner** remains an alternative phased generator,
but must not write to a sequence-managed target (see allocator cutover below).
It carries the same ECID-derived recipient key in its base and customer rows,
but does not run this Node relational seed writer or populate its campaign
consent fields. The legacy `BASE_PROFILES` endpoint also remains unchanged;
it is not the shared parent described here.

## Run the generator

### New person versus existing-person extension

A Snowflake seed allocates a **new** email, ECID and CRMID. It does not find an
existing AEP person simply because the persona looks similar. For an existing
person, read the authoritative AEP profile by Email and ECID first, then call
`lab_snowflake_create_profile` with that exact pair and selected industry.
Snowflake allocates CRMID only if that ECID has no CRM row; a matching existing
row keeps its CRMID and consumes no CRM sequence block. Duplicate ECID matches
and a different stored email fail before recipient-store changes. Reuse does
not overwrite the existing CRM persona with new attributes.

For non-travel activity, call `lab_snowflake_enrich_profiles` with the same
Email/ECID/CRMID and approved event keys, then read the complete paginated bundle.
Conflicting selectors and duplicate CRM matches fail explicitly. Run enrichment
serially. Travel's standalone legacy runner is a separate contract, not equivalent
to the Node recipient-first relational seed.

For a Snowflake-first person, wait until the existing Profile-enabled flow makes
the same ECID discoverable in AEP. Use `lab_update_profile` for a full-snapshot
behavioral update to that person; do not seed a replacement or generate again
to compensate for ingestion lag. HTTP `appendIfExisting` is opportunistic reuse,
not an existing-person-only guarantee. Neither identity reuse nor a REL row alone
proves the merged AEP identity graph. Do not silently change the shared parent's
industry or consent ownership to model a cross-industry person.

### Shared source quality rules

The operational generators are consumed by both the existing XDM flows and the
REL projections. These rules improve newly generated source rows without changing
Adobe schemas or existing flow mappings. FSI adds source columns for explicit
account/card links and balance limits; existing Snowflake tables need the
reviewed additive-column migration before they can accept the new FSI rows.

- Retail returns reference delivered orders, use the purchased item and price,
  and occur at least two hours after purchase, no later than the generation time
  or 60 days after purchase. No eligible purchase means no return. SKU keys are
  stable for product name/category; pre-link order keys use the unique event key.
- FSI uses `current_account`, `savings_account` and `credit_card` consistently.
  Transactions link by `ACCOUNT_ID` or `CARD_ID`; `DIRECTION=credit` increases
  the displayed balance and `DIRECTION=debit` reduces it. Card balances represent
  amount owed, so purchases increase the balance and payments/refunds reduce it.
  `INTEREST_RATE` is an annual APR fraction (`0.25` means 25%). Account balances
  are opening balance plus signed transactions, with a configured current-account
  overdraft and a credit-card limit. Salary is monthly and only posts to current
  accounts; savings activity is limited to transfers and interest.
- Media viewing, engagement, downloads and watchlists reuse title/genre/type
  catalog identities. Expired download dates fall between download day and
  generation day; active downloads expire later.
- Sports seed and standalone attendance enrichment use the same validated event
  catalog builder. Attendance and its catalog MERGE commit together or roll back
  together. Serial replay reconciles catalog gaps from **actual stored attendance**,
  preserving source occurrence/version values rather than regenerated timestamps.

Standalone sports attendance requires the existing
`REL.REL_SPORTS_EVENT_CATALOG` with its reviewed column contract and MERGE
permissions. The six-table sports source recipe alone does not provide that
REL prerequisite. Missing/incompatible catalog objects fail explicitly; enrichment
does not create them automatically. Transactions are per source table, not per
whole enrichment request: earlier successful tables can remain committed when a
later table fails. Inspect stored state before a separately approved retry.

These changes do not retroactively rewrite historical source or AEP rows.
Source business dates and REL `record_updated` versions must be checked separately
in actual AEP storage, at exact precision. A successful Data Prep preview is not
stored-data acceptance. Flow replacements remain an independently coordinated
canary operation; identity namespace resolution, OC targeting dimensions,
channel configuration and delivery consent require separate verification.
Synthetic consent flags and demo push tokens do not authorize campaign sends.

### MCP

`lab_generate_profile`, `lab_generate_profiles_batch`, and
`lab_preflight_profile_generate` default to `target:"snowflake"`.
Confirm the selected industry and shared email preferences first:

```text
lab_preflight_profile_generate sandbox apalmer industry travel target snowflake
lab_generate_profile sandbox apalmer industry travel target snowflake
```

These calls use the same recipient-first Node writer as the Snowflake UI,
without streaming into AEP or requiring the legacy Python runner. Omit email
so the shared counter supplies it. Batch generation accepts 1–100 and returns
synchronously; do not poll it as an AEP batch job. Responses include
`recipientTable`, `recipientRowcount`, `profiles[].recipientId`,
`tableRowcounts` and `relationalRefresh`. Preflight checks saved configuration
and preferences only; use `lab_snowflake_test_connection` to test reachability.
Run serially and never automatically retry new-identity generation.

The focused `/mcp/profile` endpoint exposes single generation, batch generation,
and `lab_batch_job_status`. Polling applies only to the explicit `target:"aep"`
asynchronous batch workflow, not Snowflake seeding. Generic AEP batches do not
currently provide a cancellation tool; do not describe closing the client as
cancelling a submitted job.

For the existing AEP persona/streaming workflow, explicitly pass
`target:"aep"` to these three tools. AEP-only persona options are rejected on
the default Snowflake path rather than silently ignored. Brand-scrape demo prep
and geo-specific tools retain their existing AEP workflows.

### Verify the separate Snowflake-to-AEP ingestion contract

Successful generation, a successful source run, and a merged Profile lookup
prove different things. For a bounded, explicitly approved sample, verify each:

1. Read the full industry CRM row with `lab_snowflake_get_profile_by_email`.
   Require exactly one row and matching `EMAIL`, `ECID`, and `CRMID`; inspect
   `TESTPROFILE`, array types, timestamps and the reported `columnCount`.
   Independently generated operational CRM fields need not equal behavioral
   AEP persona fields.
2. Compare the exact streamed industry payload with Profile readbacks by both
   Email and ECID, including false booleans, arrays and numeric leaves. A
   streaming acceptance receipt is not evidence that these values were stored.
3. Inspect the selected industry CRM flow **and** the shared Base flow. Require
   a scheduled run after the source write, inspect its counts and batch IDs,
   and compare that dataset's ingested Parquet row with the mapped source
   columns. Zero-input success is not a pass. A merged Profile may contain a
   value supplied by another dataset and cannot replace source-specific checks.
   Record columns that were not independently verified rather than marking
   the whole row as passed.
4. Verify the merged Profile again after batch ingestion. Report acceptance,
   source storage, mapping fidelity and final Profile results separately.
   Existing `AEP_SCHEMA` flows do not automatically consume new `REL` objects,
   events or enrichment tables; inspect those connections separately.
   For an approved rich AEP event sample, inspect the stored ExperienceEvent
   by both identities and compare `_<tenant>.public.<industry>` field values,
   channel and identity flags. An Edge receipt or activity count alone does
   not prove the rich fields survived.

Audit event and enrichment ingestion by the actual Snowflake source-connection
IDs, table bindings and enabled recurring flows, not flow names. Names can be
misleading, and a similarly named one-shot flow is not the recurring ingestion
path. Inspect each target's schema class before choosing a readback: a
`PROFILE`-named enrichment table can intentionally publish ExperienceEvent
snapshots instead of merged Profile attributes. Compare its exported batch
values with the corresponding stored events by both identities; use merged
Profile readbacks only for Profile-class targets.

Array representation also depends on the **resolved destination schema**.
In the verified Retail event schema, `retailEvent.order.items` is a string
containing JSON array text, not an XDM array. Require valid JSON with object
entries; do not mistake that schema-conforming representation for the
malformed push-token array described below. Converting it to an XDM array
requires a reviewed schema and mapping change, not an automatic application
of the token-decoding expression.

**Snowflake arrays can arrive as JSON strings.** Inspect the active Data Prep
input schema, not just the Snowflake column type or the MCP row representation.
When `PUSHTOKENS` is declared as `string` and contains JSON array text, map
`json_to_object(PUSHTOKENS)` with `sourceType: "text/x.aep-xl"` to
`_<tenant>.identification.core.pushTokens`. A direct whole-array destination
alone can produce a single element containing the entire serialized array;
targeting `pushTokens[0]` also loses the array contract. Do not JSON-decode a
native array input. See Adobe's
[Data Prep mapping functions](https://experienceleague.adobe.com/en/docs/experience-platform/data-prep/functions).

**Keep shared recipient arrays single-owned.** Correct source-specific arrays
can still concatenate into duplicate values in the merged Profile when both
the shared Base and an industry CRM dataset publish them. In the verified
`apalmer` configuration, Base owns `identification.core.pushTokens`; Travel's
redundant token mapping was removed with explicit approval, leaving its other
CRM mappings unchanged. Check both contributing datasets and the final Profile:
require the expected token values and cardinality, not merely a valid array
type. Treat any equivalent change in another sandbox as a separately reviewed
configuration change; do not remove mappings automatically.

Before changing a live mapping, preview the **actual source representation**
with synthetic one/multiple-token, escaped-token, empty-array and null samples.
An array-only preview does not validate a connector that sends JSON text.
For exported mappings that contain both `source` and `sourceAttribute`, update
both to the approved expression; a stale `sourceAttribute` can override `source`
when the mapping is saved. Read back the saved version and preview it again.
Preserve every other mapping and schema definition, then conditionally update
only the reviewed flow's mapping version using its current ETag. Adobe may
normalize mapping metadata and increment the embedded output schema's version;
compare schema definitions and authored mapping semantics, not just version
numbers. If a save or activation is uncertain, read back its state before any
further mutation; do not blindly repeat it.

Obtain explicit approval for each live configuration change. Preserve flow
bindings, state and schedule, and verify the completed operation. These changes
apply to future ingestion: they do not repair previously ingested arrays.
Historical replay, new identities, events and enrichment each require their
own approved scope; never resend a profile merely because indexing is delayed.

### CLI

The standalone generator creates new profiles and uses the same writer as the
Snowflake page. It provisions missing allowlisted seed tables and adds shared
fields without replacing existing columns, tables, or flow mappings.
It does not call Adobe APIs.
Run it only when you intend to write to the configured Snowflake database:

```bash
npm --prefix functions run snowflake:generate-relational -- \
  --industry travel --count 10 --base-email demo@example.com \
  --hero-profiles 5 --as-of-date 2026-10-15
```

Options:

| Option | Default | Behavior |
| --- | --- | --- |
| `--industry <name\|all>` | `all` | One industry, or the same new recipients linked to all six industries. |
| `--count <number>` | `10` | New shared recipients created per invocation; range 1–1000. With `all`, each person has one shared identity, not six recipients. |
| `--base-email <email>` | `SNOWFLAKE_SEED_BASE_EMAIL` | Required demo seed email. CLI aliases include a date and random suffix; the authenticated UI uses existing generation preferences instead. |
| `--hero-profiles <number>` | `5` for travel/all; otherwise `0` | First travel profiles receive named hero personas, gold status, window preference, a future trip, and WhatsApp consent. |
| `--as-of-date <YYYY-MM-DD>` | current UTC date | Stable reference date for generated travel trips. Other industries use the seed run time. |

Connection configuration is read from environment variables only:
`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_DATABASE`, and
`SNOWFLAKE_WAREHOUSE`, plus either `SNOWFLAKE_PASSWORD` or
`SNOWFLAKE_PRIVATE_KEY_PATH` (and optional
`SNOWFLAKE_PRIVATE_KEY_PASSPHRASE`). `SNOWFLAKE_SCHEMA` defaults to `AEP_SCHEMA`; `SNOWFLAKE_ROLE` is optional.
Both entry points qualify source tables with the configured database/schema
and relational objects with that database's `REL` schema.
Connect to **corporate VPN** before using Adobe development Snowflake.
Do not put credentials in command arguments or repository files.

The SQL files in [`functions/sql/rel/`](../functions/sql/rel/) ship with the
Functions package. Preparation occurs before the write transaction because
Snowflake DDL commits implicitly. Base recipients, industry profiles, and their
generated detail rows are then written in a single transaction per industry;
an insertion failure rolls the related data writes back. Prepared schemas and
tables can remain after failure. The CLI's `all` mode commits each industry
separately, so an error can leave earlier industries populated.
The error identifies those already-committed industries. The Node API, CLI, and
AEP industry dual-load writer reserve disjoint 1,000-ID blocks from one
Snowflake sequence per physical parent. Each invocation uses at most 1,000 IDs,
retaining `CRM<number>` identifiers; unused IDs and rolled-back reservations
leave intentional gaps. MAX+1 is now only a migration/sanity check, never the
runtime allocator. Missing/inaccessible or incompatible sequences fail explicitly,
without an unsafe fallback. Run serially when practical and never automatically
retry generation: allocation uniqueness does not make creating new people
idempotent or serialize simultaneous updates to the same existing ECID.

Each seed invocation creates new people. Reusing the writer with the same
records uses conditional `MERGE` operations with stable keys and preserves
creation timestamps; rerunning the CLI is intentionally not an idempotent
replay of the previous invocation. Generated travel
rows are derived from the same recipient/reservation/segment data as the
booking and disruption event payloads. A disrupted trip's event references
its actual segment key. Booking `SEATSELECTION` is a Boolean purchase flag;
the selected seat number (for example, `18A`) belongs in
`REL.REL_TRAVEL_ANCILLARY_PURCHASE.SEAT_NUMBER`, not in the booking flag.

For non-travel industries, the seed and enrich paths share generated event,
order, fixture, and enrichment row identities. Enrichment rows use a group
`GENERATIONID` plus a row suffix; existence checks also recognize historical
unsuffixed groups. Enriching a seeded recipient (or repeating enrichment)
ensures missing selected table activity, rather than appending a second rewards,
membership, products, or device snapshot. It does not request a new activity run.
Previously duplicated rows are not deleted automatically by this change.

FSI product generation includes a funded personal-loan scenario when the
profile's account count leaves room after its current/savings, mortgage, and
card products. Loans include an interest rate, future term end, and amortized
monthly payment, and feed `REL.REL_FSI_LOAN` through the existing products
projection. Low-account-count profiles need not have a loan.
Sports merchandise items include a stable SKU derived from the team, product
name, and size; the existing merchandise order-line projection exposes it.
Sports betting remains opt-in through
`industrySports.fanFlags.betsRegularly`; the standard Snowflake-first seed
path does not enable that flag automatically. These changes apply to newly
generated activity; they do not backfill historical products or merchandise.

Preparation requires a role with permission to inspect existing object
definitions, read/write the relevant source tables, alter their schema, create
the `REL` schema/view/tables/dynamic tables, and use the configured warehouse.
Dynamic tables use warehouse compute for refreshes. The seeder does not grant
permissions or change network policies.

### CRM allocator migration and release gate

This implementation does **not** create or reset its sequence during generation.
It requires a separately approved migration before enabling the updated writers.
No live migration is implied by tests or by installing/deploying this code.

1. Pause **all** writers to the target account/database/schema: UI/MCP generation,
   CLI jobs, AEP dual-load, legacy Python runner generation, scheduled imports,
   and any external process allocating CRMIDs. Wait for active requests to finish.
   Prepare the shared parent and required industry tables through the existing
   approved setup if they do not exist.
2. From an already authorized connection, generate the read-only plan:
   `npm --prefix functions run snowflake:generate-relational -- --plan-crm-sequence`.
   It requires no seed email, performs SELECTs only, scans the shared parent and
   **all existing governed customer tables** in the configured schema, and prints
   a candidate statement such as:
   ```sql
   CREATE SEQUENCE IF NOT EXISTS <database>.<schema>.AEP_LAB_RECIPIENT_CRM_SEQUENCE
     START WITH <maximum-existing-ordinal-plus-one> INCREMENT BY 1000 ORDER;
   ```
   Keep every writer paused between planning and applying. A stale plan must be
   recomputed; never use an earlier captured MAX while writes continue.
3. Review the physical target and plan, then obtain separate approval to apply
   its CREATE statement using the migration role. That role needs `CREATE SEQUENCE`
   on the configured schema plus usage of its database/schema. Runtime roles need
   `USAGE` on that exact sequence and its database/schema, as well as their existing
   table/warehouse privileges. Apply grants only through the approved IAM process.
   `IF NOT EXISTS` makes competing bootstrap applications preserve the first
   created sequence; it never resets an existing allocator. Never use
   `CREATE OR REPLACE`, decrement/alter its interval, or recreate an allocator.
4. Verify `INFORMATION_SCHEMA.SEQUENCES` reports `INCREMENT = 1000`. In the approved
   migration session, reserve **one** `SELECT <qualified-sequence>.NEXTVAL` and
   compare it with a fresh maximum across all plan tables. Its full 1,000-ID block
   must be above existing CRMIDs and within JavaScript's safe-integer range.
   This verification consumes a block but creates no profiles. If an existing
   sequence is behind, stop and review forward-only recovery with the owner;
   neither the planner nor runtime resets/reseeds it automatically.
5. Deploy/enable the sequence-backed Node API, CLI and AEP dual-load together,
   while legacy writers remain paused. Confirm allocation failures surface
   without reserving profile emails or inserting profiles. Resume only compatible
   writers after the normal release gates. The CLI's `all` mode reserves one block
   and shares its identities across all six industries.

The legacy Python runner and legacy `BASE_PROFILES` generator **do not** consume
this sequence. The backend full-generation endpoint checks the actual saved
database/schema for the allocator before contacting the Python runner and returns
`LEGACY_GENERATION_BLOCKED` with the recipient-seeding alternative when present.
Connection/metadata failures return `CRM_ALLOCATOR_CHECK_FAILED`; they never
fall back to invoking the runner. Unmanaged targets retain legacy generation.
The saved role must be able to see target sequence metadata; do not use a
restricted legacy-only role that hides the allocator. This preflight does not
replace pausing writers during allocator cutover, since a legacy job already
running when the sequence is created cannot be stopped by a later check.
Keep direct Python generation disabled/paused against the shared parent
and governed customer tables, or use a separate physical database/schema.
Legacy custom/base-only targets remain independent. Arbitrary external writers
must join the allocation protocol or remain excluded; this is not a universal
database lock. A runtime maximum sanity check can detect some incompatible writes
but is not protection against a concurrent bypassing writer.

## Recipient model

The existing base-profile table is the writable parent. Original column names,
types, and CRMID primary-key declaration remain intact. Shared canonical fields
are added as nullable columns so older rows and flows remain valid; new seeded
rows fill both legacy fields such as `BIRTHDATE`, `HOMEADDRESS_*`,
`PERSONALEMAIL_ADDRESS`, and `MOBILEPHONE_NUMBER`, and their canonical aliases.

`RECIPIENT_ID` is `R-` plus the first 32 hexadecimal characters of SHA-256 of the
ECID. It does not contain the industry: the same ECID links the same person
across industries, even if legacy industry tables reused CRMID suffixes.
Existing base rows with ECIDs receive a key only when their key is null.
Rows without ECIDs need identity remediation, not a guessed cross-industry join.
Industry source joins use ECID; relational children expose `RECIPIENT_ID`.
`INDUSTRY` on the shared parent is the most recently seeded industry, **not**
an exclusive membership filter; use child-table relationships for membership.

Both Snowflake-first seeding and the Snowflake leg of AEP dual-load validate an
existing `REL.RECIPIENT` before preparing the shared parent. When
`INFORMATION_SCHEMA.VIEWS.VIEW_DEFINITION` is hidden from the integration role,
the validator uses Snowflake `GET_OBJECT_REFERENCES` and requires exactly the
configured database/schema's physical base table as its dependency. Missing,
unexpected, or inaccessible dependency metadata blocks preparation; it does not
bypass validation or change grants. Existing recipient views are not recreated.
Secure-view dependency inspection can require ownership and remains blocked
without separately reviewed access. AEP XDM streaming is independent: a failed
Snowflake leg can leave a stored AEP profile, so preserve its identity and inspect
the partial-success receipt rather than generating it again.

Travel owns the parent's passport, upcoming holiday, and seat-preference fields.
Other industry writes omit those columns when their profiles do not supply them,
so CLI `--industry all` retains the travel campaign fields after its final Sports
pass. Explicitly supplied updates (including null clears) are still applied;
this is not a blanket “ignore nulls” merge policy.

The base parent stores deterministic demo push tokens, language, timezone,
channel consent, preferred channel, `INDUSTRY`, `VERSION_TS`, record timestamps,
and `TESTPROFILE` with the core profile identity and contact fields. The
preferred channel is selected only from channels with consent; travel hero
recipients are guaranteed WhatsApp consent. Demo push tokens are synthetic
identifiers, not registered device tokens.

## Relational mappings

Every relational output includes its industry and test-profile metadata, plus
version and record timestamps. Dynamic tables follow source profile/event
changes; the travel booking entities and sports fixture catalog are populated
by the generator.

| Industry | Relational output | Source and key mapping |
| --- | --- | --- |
| Shared | `AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE` | Existing physical parent with additive `RECIPIENT_ID` and campaign fields. `REL.RECIPIENT` is its read-only alias. |
| Travel | `REL.REL_TRAVEL_RESERVATION` | Generated reservation; stable `RESERVATION_ID`, `RECIPIENT_ID`, PNR, fare, and scenario. |
| Travel | `REL.REL_TRAVEL_FLIGHT_SEGMENT` | One or two segments per reservation; stable `SEGMENT_ID` and parent reservation key. |
| Travel | `REL.REL_TRAVEL_PASSENGER` | Lead recipient plus optional companions; companion `RECIPIENT_ID` is null. |
| Travel | `REL.REL_TRAVEL_ANCILLARY_PURCHASE` | Seat or cabin-upgrade purchase references an existing segment, passenger, recipient, and product. |
| Travel | `REL.REL_TRAVEL_PRODUCT_CATALOG` | Deterministic seat, upgrade, bag, lounge, and fast-track catalog. |
| FSI | `REL.REL_FSI_ACCOUNT`, `REL.REL_FSI_CARD`, `REL.REL_FSI_LOAN`, `REL.REL_FSI_MORTGAGE` | `AGENTIC_FSI_PROFILE_PRODUCTS`, categorized by `PRODUCT_TYPE`, joined to the parent by ECID. |
| FSI | `REL.REL_FSI_TRANSACTION` | `AGENTIC_FSI_EVENT_TRANSACTION`, joined by ECID. |
| FSI | `REL.REL_FSI_PRODUCT_CATALOG` | Distinct product types in `AGENTIC_FSI_PROFILE_PRODUCTS`. |
| Retail | `REL.REL_RETAIL_ORDER`, `REL.REL_RETAIL_ORDER_LINE` | `AGENTIC_RETAIL_EVENT_ORDER`; `ITEMS` is flattened to stable order-line keys. |
| Retail | `REL.REL_RETAIL_RETURN` | `AGENTIC_RETAIL_EVENT_RETURN`, retaining its source `ORDER_ID`. |
| Retail | `REL.REL_RETAIL_REWARDS` | `AGENTIC_RETAIL_PROFILE_REWARDS`, joined by ECID. |
| Retail | `REL.REL_RETAIL_PRODUCT_CATALOG` | Distinct SKUs and product attributes flattened from order items. |
| Telecom | `REL.REL_TELECOM_SUBSCRIPTION` | Customer profile contract and plan fields. |
| Telecom | `REL.REL_TELECOM_DEVICE` | `AGENTIC_TELECOM_PROFILE_DEVICES`, joined by ECID. |
| Telecom | `REL.REL_TELECOM_PLAN_CATALOG` | Distinct plan/bundle/allowance combinations from customer profiles. |
| Media | `REL.REL_MEDIA_SUBSCRIPTION` | Media customer subscription and preference fields. |
| Media | `REL.REL_MEDIA_VIEWING` | `AGENTIC_MEDIA_EVENT_VIEWING`, joined by ECID. |
| Media | `REL.REL_MEDIA_TITLE_CATALOG` | Distinct viewed content titles. |
| Sports | `REL.REL_SPORTS_MEMBERSHIP` | `AGENTIC_SPORTS_PROFILE_MEMBERSHIP`, joined by ECID. |
| Sports | `REL.REL_SPORTS_TICKET` | `AGENTIC_SPORTS_EVENT_ATTENDANCE`, joined by ECID and retaining its fixture ID. |
| Sports | `REL.REL_SPORTS_MERCH_ORDER`, `REL.REL_SPORTS_MERCH_ORDER_LINE` | `AGENTIC_SPORTS_EVENT_MERCHANDISE`; `ITEMS` is flattened to stable order-line keys. |
| Sports | `REL.REL_SPORTS_EVENT_CATALOG` | Generator-seeded demo fixtures, keyed by `EVENT_ID`. |

## Migration and compatibility

The migration is additive:

1. Preserve the existing base table and AEP source/flow. Add nullable recipient
   and campaign columns. Backfill only missing base recipient keys from ECID;
   do not change existing ECID, CRMID, email, or consent values.
2. Add `SEGMENT_ID` to the existing travel disruption event table. Existing
   disruption rows remain valid with a null value.
3. Create the read-only `REL.RECIPIENT` view, travel relational tables, and
   industry dynamic tables. Existing `AGENTIC_*` tables remain in place and
   are not renamed or dropped.
4. Seed new recipients and selected-industry details. New data writes include
   `RECIPIENT_ID` in the selected customer profile. Old industry records are
   not silently regenerated or re-ingested.

The earlier unshipped design with a physical `REL.RECIPIENT` table and
industry-prefixed IDs is superseded. If such a table already exists in a target,
stop and review its data before migration; do not drop it or silently replace it
with the view. Runtime preparation rejects incompatible recipient objects,
duplicate base ECIDs, and non-null base keys that disagree with their ECID hash
rather than silently duplicating people or rewriting their keys.
Existing AEP flows do not automatically expose added fields:
review schema/data-prep mapping and incremental ingestion before relying on
them in a demo.

`CREATE ... IF NOT EXISTS` intentionally does not replace an existing
relational table or dynamic-table definition. If a future release changes an
existing relational contract, use a reviewed migration that adds or transforms
the required columns before running the generator; do not drop and recreate
source tables to apply this feature.

## Validation

Run the relevant read-only checks in [`functions/sql/rel/90_validate.sql`](../functions/sql/rel/90_validate.sql)
after the generator. They cover recipient uniqueness, missing consent metadata,
orphaned relational rows, travel parent/child keys, event/booking consistency,
and a consent-filtered test-profile audience example. Run only the sections for
industries you have provisioned. Standard Snowflake PK/FK declarations do not
enforce referential integrity; validate the data and configure AJO relationships
explicitly. Live Snowflake SQL execution and AEP/AJO mapping are separate
validation steps, not implied by offline tests.
