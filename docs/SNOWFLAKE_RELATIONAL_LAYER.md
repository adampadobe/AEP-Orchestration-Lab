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

The **legacy travel Python runner** remains an alternative phased generator.
It carries the same ECID-derived recipient key in its base and customer rows,
but does not run this Node relational seed writer or populate its campaign
consent fields. The legacy `BASE_PROFILES` endpoint also remains unchanged;
it is not the shared parent described here.

## Run the generator

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
The error identifies those already-committed industries. Run seed jobs
serially: CRM ordinals use a maximum-plus-one scan of the shared base and
selected industry customer sources,
not a concurrent multi-writer allocator. ECID-derived recipient keys do not
make legacy CRMID allocation safe for overlapping jobs.

Each seed invocation creates new people. Reusing the writer with the same
records uses conditional `MERGE` operations with stable keys and preserves
creation timestamps; rerunning the CLI is intentionally not an idempotent
replay of the previous invocation. Generated travel
rows are derived from the same recipient/reservation/segment data as the
booking and disruption event payloads. A disrupted trip's event references
its actual segment key.

Preparation requires a role with permission to inspect existing object
definitions, read/write the relevant source tables, alter their schema, create
the `REL` schema/view/tables/dynamic tables, and use the configured warehouse.
Dynamic tables use warehouse compute for refreshes. The seeder does not grant
permissions or change network policies.

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
