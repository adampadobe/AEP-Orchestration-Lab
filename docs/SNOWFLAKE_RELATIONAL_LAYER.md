# Snowflake relational layer and generator

The relational layer is additive to the existing
`AEP_SCHEMA.AGENTIC_*` profile, event, and enrichment tables. It does not
replace or delete those source tables. The **existing
`AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE` is the single physical
recipient parent for every industry**, despite its historical travel name.
`REL.RECIPIENT` is only a read-only view of that parent, not another writable
table or a replacement ingestion source.

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
