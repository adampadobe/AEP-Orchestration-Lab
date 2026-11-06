# Snowflake integration — Profile generation (Snowflake) page

This page covers the AEP Orchestration Lab's Snowflake integration, surfaced
in the Profile Viewer at **`/profile-viewer/profile-generation-snowflake.html`**
(menu: **Profiles → Profile generation – Snowflake (in development)**).

The shared base-recipient model and Snowflake-first seed generator are
documented in [`SNOWFLAKE_RELATIONAL_LAYER.md`](SNOWFLAKE_RELATIONAL_LAYER.md).
On this page, select an industry and use **Seed recipients & industry data**:
the authenticated API writes the existing
`AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE` parent plus the selected industry's
profile, event, and detail records. No prior industry profile rows or Adobe
API calls are required. The CLI uses the same seed writer. Existing AEP flows
remain separate and unchanged; map added recipient and relational fields
explicitly before using them in Campaign Orchestration.

## Governed Snowflake workspace

The focused **`/mcp/snowflake`** endpoint adds a general-purpose workspace
alongside the existing profile-generation tools. It has 16 tools: access
information, saved connection configuration/testing, and 13 workspace tools.
The General catalog exposes these tools too. Coworker, Claude and Copilot
marketplace manifests include the focused connection.

This is a local implementation until released; a manifest change alone does
not deploy the Cloud Function or Cloud Run server. Existing saved Snowflake
credentials **do not enable workspace access**. An administrator must enable
a separate per-user, per-sandbox policy, using a dedicated least-privilege
Snowflake role and an explicit account, user, warehouse, database and schema.
Shared sandbox credentials require an additional policy opt-in. The MCP cannot
modify that policy or approve its own changes.

| Capability | MCP tools | Boundary |
|---|---|---|
| Readiness and metadata | `lab_snowflake_capabilities`, `lab_snowflake_objects_list`, `lab_snowflake_object_describe` | Policy and saved connection must agree; metadata is scoped to the workspace |
| SQL jobs | `lab_snowflake_query_submit`, `lab_snowflake_query_status`, `lab_snowflake_query_results`, `lab_snowflake_query_cancel` | One read-only SELECT/WITH statement; durable request IDs; bounded results |
| Data checks | `lab_snowflake_data_check` | Row count, null count, duplicate-value groups, maximum freshness timestamp; no invented freshness SLA |
| Table/data changes | `lab_snowflake_change_preview`, `lab_snowflake_change_apply` | Typed create-table, add-column, insert, update and delete operations; updates/deletes require exact predicates |
| Permissions | `lab_snowflake_grants_inspect`, the same preview/apply tools | Allowlisted target roles and table privileges only |
| Snowflake AI | `lab_snowflake_agents_list`, `lab_snowflake_agent_run` | Explicitly allowlisted Cortex Agents, native REST delegation and optional thread continuation |

### Query and change workflow

Administrator policy documents live in `snowflakeWorkspacePolicies` under
`SHA256(uid + '\0' + sandbox)`, with the Portal UID and lower-case sandbox.
Manage these through existing administrator tooling, never through an MCP tool.
The required shape is:

```json
{
  "enabled": true,
  "account": "YOUR_ORG-YOUR_ACCOUNT",
  "user": "LAB_WORKSPACE_USER",
  "role": "LAB_WORKSPACE_ROLE",
  "warehouse": "LAB_WH",
  "database": "LAB_DB",
  "schema": "DEMO",
  "allowSharedCredential": false,
  "read": true,
  "write": false,
  "grants": false,
  "grantRoles": [],
  "agents": [],
  "timeoutSeconds": 60,
  "maxRows": 500
}
```

Match saved connection identifiers exactly, including case. Grant targets are
simple role names; agents use `DATABASE.SCHEMA.AGENT`. Enabling `write` or
`grants` does not bypass per-change Portal approval.

Configure Firestore TTL on `expireAt` in `snowflakeWorkspaceJobs` (24-hour
request/audit retention) and `snowflakeWorkspacePreviews` (10 minutes). Previews
contain SQL and bound values; jobs do not retain result rows or Cortex responses.
TTL deletion is asynchronous and is not an exact deletion deadline. Preview
expiry is also enforced by the service. After job retention ends, request-ID
deduplication cannot protect a replay: never reuse old request IDs. Result pages
are bounded to the policy row window and one MiB, and Snowflake result retention
may end before job metadata is deleted.

Grant inspection returns an owned `job_id` for its exact `SHOW GRANTS` result.
When `truncated` is true and `next_offset` is non-null, call
`lab_snowflake_query_results` with that job ID and offset, not another grant
inspection. Pages do not rerun `SHOW` and cannot drift between snapshots.
Grant snapshots allow up to one million rows in policy-sized pages (MCP requests
cap `limit` at 500), with a one-MiB byte cap per page. This is separate from the
unchanged SQL query row window. A final page has `next_offset: null`; never call a
partial inventory complete when `truncated` or `row_window_exhausted` is true.
An oversized individual row can produce `truncated: true` with no continuation.
Grant jobs expire logically after 24 hours, are owner/sandbox/context-bound and
cannot be cancelled through the query cancellation tool. Reinspect if Snowflake
has already discarded the underlying result.

1. Inspect capabilities for the intended sandbox. A disabled/mismatched policy
   is an error, not permission to fall back to the profile generator.
2. List/describe objects, then submit a read query with a new UUID
   `request_id`. Save the returned job ID and use status/results for follow-up.
   Reuse the same request ID only to recover that exact submission.
3. For a mutation, request a typed preview. Open the returned `review_url` to
   deep-link into the Portal with this exact preview and sandbox. The page loads
   the server-held preview but never approves it automatically. The link's
   sandbox applies only to review, not the page's other Snowflake actions. If a link is
   unavailable, open **Profile Generation - Snowflake**
   (`/profile-viewer/profile-generation-snowflake.html`) and paste the preview
   ID into **Review an MCP workspace change**.
4. Sign into the Portal, review the preview's account, user,
   role, warehouse, database, schema, SQL, bound values, state and expiry,
   explicitly confirm, then choose **Approve this preview**.
   The panel uses direct Firebase-authenticated `change_get` and
   `change_approve` requests. MCP-key and Coworker IMS requests cannot review
   through that endpoint or approve. The panel never executes SQL or enables
   workspace permissions. It clears on user/sandbox/connection changes and
   expiry; late responses cannot repopulate a different target.
   After an uncertain approval outcome, load the preview to inspect its state
   rather than blindly retrying. Never copy session tokens into chat or files.
5. Apply the approved preview once. Connection/policy changes invalidate it.
   An expired or consumed preview cannot authorise another operation.

The API is `POST /api/snowflake/workspace` (direct Cloud Function:
`/snowflakeWorkspace`). All actions carry `sandbox`; responses contain the
workspace result under `result`. Use the direct function for potentially
long-running calls; Hosting has the shorter timeout described below.

No arbitrary mutation SQL, DROP, CREATE OR REPLACE, ownership transfers,
future grants, grant option, user creation or broad account administration is
provided. Table privileges are SELECT, INSERT, UPDATE, DELETE and REFERENCES.
DDL is not transactionally reversible. Cancellation does not prove rollback.
Unknown, partial or timed-out outcomes must be reconciled against the original
job/preview and Snowflake history before new work is submitted. The transport
does not automatically retry workspace operations.

Read SQL is enforced in a Snowflake read-only session; lexical validation is
defence in depth, **not an SQL sandbox**. The configured Snowflake role is the
actual object-access boundary: arbitrary read SQL can address other schemas
that role can read. Do not assign a broadly privileged role and rely on the
workspace's metadata filter to provide isolation. Secondary roles are disabled.

### Cortex delegation versus A2A

Cortex delegation uses the saved connection's key-pair or programmatic access
token (PAT) authentication. Password-only connections cannot use this REST
path. Account availability and privileges still need to be verified in the
target Snowflake organisation after activation. Cortex calls can incur AI
charges and invoke the agent's configured tools; an agent allowlist is not a
claim that those tools are read-only.

Supply `thread_id` and `parent_message_id` together when continuing an existing
thread. Preserve returned citations, warnings and continuation metadata instead
of presenting the delegated output as independently verified fact.

This is **native Cortex Agent REST delegation, not formal A2A**. A separate
authenticated A2A bridge and direct Cortex Search/Analyst tools are not included.
Snowflake's managed MCP supports additional native surfaces; this workspace
does not claim full feature parity or account-verified capability merely from
tool discovery.

Official references:

- [Snowflake-managed MCP](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp)
- [SQL API overview and limitations](https://docs.snowflake.com/en/developer-guide/sql-api/intro)
- [Snowflake REST APIs](https://docs.snowflake.com/en/developer-guide/snowflake-rest-api/snowflake-rest-api)
- [Cortex Agent run API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run)
- [Cortex Agent threads](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-threads)
- [Snowflake-Labs A2A reference bridge](https://github.com/Snowflake-Labs/cortex_agent_a2a)

### Long-running requests and gateway errors

Snowflake SQL calls from the page and MCP use the direct Cloud Function URLs,
not Firebase Hosting's `/api/snowflake/*` rewrites, which stop waiting after
60 seconds. Seed preparation and linked writes can exceed that limit even for
one recipient. MCP uses `AEP_LAB_FUNCTIONS_ORIGIN`; the page derives the origin
from `firebaseDatabaseConfig.projectId` or the existing
`window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__` override. Authentication, sandbox
scope, static-IP egress, and the backend transaction are unchanged.
For local MCP endpoint overrides, configure `AEP_LAB_FUNCTIONS_ORIGIN` as well
as `AEP_LAB_API_ORIGIN`.

A timeout or HTML gateway error does **not** prove a write failed: the backend
can commit after the caller stops waiting. Never automatically regenerate,
rewind the counter, or reuse reserved emails on that evidence. Wait for the
backend request to finish, inspect its request logs, and look up the exact
identity with `lab_snowflake_get_profile_by_email` or
`lab_snowflake_get_profile_bundle` before deciding how to reconcile it.

### Delta timestamps after a seed commit

Generation's `runStamp` is not a commit timestamp. The shared seed writer first
commits the parent, CRM, event, and relational/enrichment rows atomically, then
publishes their metadata timestamps in bounded, per-table autocommit updates.
Updates use Snowflake's UTC clock, not the caller's generation-start clock.
New rows receive refreshed `_RECORDCREATEDTIMESTAMP` and, where present,
`_RECORDUPDATEDTIMESTAMP` and `VERSION_TS`. Existing creation timestamps are
preserved on replay; business/event occurrence dates and identity keys are unchanged.
The API reads the CRM timestamps back before returning its profile samples.

This addresses a long seed committing after a source run has advanced past its
original timestamp. It is a post-commit publication step, not an exact Snowflake
commit-time timestamp or a guarantee against every source scheduling race.
Publication is not atomic across tables. If it fails, the API returns `ok:false`,
`committed:true`, the committed identities/counts, and the failed/refreshed tables.
Inspect those rows and repair metadata only; do not regenerate or reuse emails.
Previously skipped rows require a separately reviewed timestamp repair and a
subsequent source-flow readback. Existing AEP flow schedules/watermarks are not reset.

### Shared recipient email settings

**Recipient email** shows the saved base email, read-only next counter, and
server-generated address previews before generation. Save edits explicitly;
generation is blocked while settings are missing, unsaved, loading, or in error.
Use **Refresh** after changes from another device. Returning to the page or
receiving a cross-tab settings notification refreshes saved settings without
discarding an unsaved email edit.

The settings are shared with Profile Generator and MCP for the **same authenticated
account and sandbox**, across industries. Counters reset at midnight **UTC**;
changing the base email does not reset N. Different accounts or sandboxes have
independent counters, so choosing the same base email does not guarantee global
address uniqueness. Browser caches for signed-in users are account-scoped, and
an empty server setting is not automatically populated from a legacy local cache.

Preview requests do not reserve emails. Snowflake generation validates the saved
email before preparing tables or reserving CRM IDs, then atomically reserves the
whole batch against one base-email/date snapshot using the same Firestore counter
as single-profile generation. If the saved email changes before reservation, the
run stops rather than silently switching base addresses. Concurrent requests can
advance N after a preview; each batch's actual email allocation is returned with
the generated profiles and displayed in the result.

**Advanced email counter** allows a confirmed reset/manual override, including on
the standard Profile Generator. Lowering N can reuse addresses. Email reservations
are independent of the Snowflake write transaction: failed writes can consume
numbers, and retries never automatically rewind them. This email counter is
separate from the Snowflake CRMID sequence.

### Generator context and relational subscription upgrade

The recipient workspace separates **Generate linked demo data** from
**Explore & enrich profiles**. Enter an exact recipient count (1–1,000), then
use **Seed recipients & industry data** for the shared-parent workflow.
Batch-size tuning and the separate legacy generation mode are under
**Advanced generation options**; legacy runner diagnostics remain collapsed.
The data-path strip explains the shared recipient → industry data → relational
table relationship without implying automatic AEP/AJO ingestion.

The Snowflake UI clears selected profiles and pending results when the Portal
identity, sandbox, or industry changes. Responses from the previous context
cannot repopulate the new one. A submitted mutation may still complete in its
original target: inspect that target before retrying. Batch history is scoped
to Portal user, sandbox, and industry; older unscoped history is not imported.

Telecom subscriptions expose `PLAN_CODE` alongside the existing `PLAN` tier.
Join `PLAN_CODE` to the catalog's `PLAN_CODE`: its stable composite identifier
covers tier, bundle, and data allowance. Telecom and media subscription
version/update timestamps use the source update timestamp, falling back to
creation time only when needed.

Existing dynamic tables are **not** upgraded by `CREATE ... IF NOT EXISTS`.
Generate the targeted SQL for review, using the intended connection's explicit
database, source schema, and warehouse:

```bash
node functions/scripts/plan-relational-subscription-migration.js \
  --database YOUR_DATABASE --schema YOUR_SCHEMA --warehouse YOUR_WAREHOUSE
```

This command only prints SQL; it does not authenticate or execute it. The plan
replaces the two subscription projections and telecom plan catalog, not their
source tables. Before an approved application, inspect current definitions,
ownership/grants, downstream dependencies and ingestion mappings. Replacement
DDL is not transactional; pause incremental ingestion and plan a refreshed
snapshot, then run `functions/sql/rel/90_validate.sql` after the projections
have refreshed. Update any tier-based telecom catalog relationship to the
new `PLAN_CODE` on both sides.

The integration ports the AgenticAI Demo (`AI Projects/AgenticAI Demo/Agentic_Demo_Platform/`)
into the lab. **Phase 1** ships per-user Snowflake connection management plus a
server-side connection test. **Phase 2 (this commit)** adds a minimal
base-profile generator that ports `data_generator.py → generate_base_profiles`
to Node and bulk-INSERTs Faker-driven rows into a target Snowflake table.
**Phase 3** will port the remaining generators (full profiles, website /
booking events, loyalty, mobile, call, disruption, in-flight, hotel, POS) and
the query / enrich panel.

---

## Static egress IP (the value to allowlist in Snowflake)

Cloud Functions Gen 2 by default egresses from a wide pool of dynamic Google
IPs, which Snowflake admins generally will not allowlist. To present a single
fixed IP, the Snowflake-touching functions in this project route through a
Serverless VPC Access connector that exits Cloud NAT using a reserved static
external IPv4.

> **Lab static egress IP:** `34.58.81.28`
>
> Region: `us-central1`. Project: `aep-orchestration-lab`.

If the IP ever needs to change (rotation, region move), update both this doc
and the `STATIC_EGRESS_IP` constant in
[`web/profile-viewer/profile-generation-snowflake.js`](../web/profile-viewer/profile-generation-snowflake.js).

### Snowflake NETWORK POLICY (admin task)

Run this as `ACCOUNTADMIN` (or someone with the `CREATE NETWORK POLICY`
privilege) in Snowflake:

```sql
CREATE NETWORK POLICY aep_orchestration_lab_policy
  ALLOWED_IP_LIST = ('34.58.81.28/32');

-- Apply to the integration user the lab will connect with:
ALTER USER <your_user> SET NETWORK_POLICY = aep_orchestration_lab_policy;
```

If the user already has a network policy attached, append the lab IP to its
existing `ALLOWED_IP_LIST` rather than replacing the policy.

---

## Portal login and sandbox-shared configuration

Connection details are scoped to **(Portal login, AEP sandbox)** — your Adobe
@adobe.com Firebase account, not anonymous browser auth. Anonymous tokens are
rejected on all `/api/snowflake/*` routes (`AUTH_PORTAL_LOGIN_REQUIRED`).

On **team sandboxes** (technical names containing `apalmer` or `kirkham`), saves
also dual-write a **sandbox-shared** credential so teammates on the same sandbox
can test connections without re-pasting the PEM.

### Resolution order (GET config, connection test, MCP)

1. **User-specific** `(Firebase uid, sandbox)` when `hasCredential` is true in Secret Manager.
2. Else **sandbox-shared** doc + secret when present (eligible sandboxes only).

Saving on an eligible sandbox **dual-writes** the same config + credential to both
stores. Lazy migration copies an existing user-only credential to sandbox-shared
on the next GET when shared is still empty.

### Firestore

| Doc id | Purpose |
| ------ | ------- |
| `{labUserUid}__{sandbox}` | Per-user non-secret fields |
| `_sandbox__{sandbox}` | Sandbox-shared non-secret fields |

Non-secret fields only: `account`, `user`, `role`, `warehouse`, `database`,
`schema`, `authMethod`, `credentialSetAt`, `updatedAt`, `updatedBy`. The
credential value is **never** written to Firestore.

### Secret Manager

| Secret id | Purpose |
| --------- | ------- |
| `snowflake-cred-<labUserSlug>-<sandboxSlug>` | Per-user credential |
| `snowflake-cred-sandbox-<sandboxSlug>` | Sandbox-shared credential |
| `…-pass` suffix | Optional key-pair passphrase (sibling secret) |

Lab user identity comes from a **non-anonymous** Firebase ID token
(`snowflakePrincipalAuth.resolveSnowflakePrincipal`). MCP API keys use the same
`principalUid` stored on the key doc when you generate the key while signed in.

### Legacy anonymous migration

Before Portal login, Snowflake config was keyed by anonymous Firebase uids
(per-browser). The Profile Viewer stores the old uid in
`localStorage` (`aepLabSnowflakeLegacyAnonymousUid`) and sends
`legacyAnonymousUid` on the first authenticated GET/POST. The backend copies
Firestore + Secret Manager rows to your Portal uid (and to sandbox-shared when
empty on apalmer/kirkham).

### Auth methods

| Method     | What to paste in the credential field                                  |
| ---------- | ---------------------------------------------------------------------- |
| `password` | The Snowflake user's password.                                         |
| `pat`      | A Snowflake [Programmatic Access Token](https://docs.snowflake.com/en/user-guide/programmatic-access-tokens). Recommended over passwords. |
| `keyPair`  | PEM private key text (including `BEGIN` / `END` lines). The Cloud Function normalizes PKCS#1 (`BEGIN RSA PRIVATE KEY`) and encrypted PKCS#8 (common `.p8` exports) to **PKCS#8 PEM**, which the Snowflake Node driver requires for JWT auth. If the key is encrypted, set the passphrase field; otherwise leave it blank. |

The AgenticAI Demo's `snowflake_settings.py` uses key-pair auth with
`aep_integration_1.p8`. The lab supports the same flow: paste the PEM
contents into the credential field with `Authentication method = Key pair`
and the passphrase into the optional passphrase field.

---

## API surface (Firebase Functions, region `us-central1`)

All endpoints require a **Portal-signed-in** Firebase Auth Bearer token (Adobe
@adobe.com, not anonymous) or a user-generated MCP API key, plus a `sandbox`
parameter (`?sandbox=…` for GET, request body for POST). Wired via
[`firebase.json`](../firebase.json) rewrites and exported in
[`functions/index.js`](../functions/index.js):

| Method | Path                                       | Function name                    | Purpose                                                                  |
| ------ | ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/snowflake/config`                    | `snowflakeConfig`                | Public projection of saved config (never the credential).                |
| POST   | `/api/snowflake/config`                    | `snowflakeConfig`                | Save / update config; credential, if supplied, is written to Secret Manager. |
| POST   | `/api/snowflake/connection-test`           | `snowflakeConnectionTest`        | Open a Snowflake connection, run `SELECT CURRENT_VERSION()`, tear down.  |
| POST   | `/api/snowflake/generate-base-profiles`    | `snowflakeGenerateBaseProfiles`  | Phase 2 — generate `count` Faker-driven base profiles and bulk-INSERT into the target table (auto-creates the table if missing). Returns `{ rowcount, table, sample[3] }`. |
| POST   | `/api/snowflake/provision`                 | `snowflakeProvision`             | Phase C — governed allowlisted table recipes only (`CREATE TABLE IF NOT EXISTS` or preinstalled existence checks). Body `{ sandbox, industry?, recipe_id, dry_run?, approval_id? }`. Audit: Firestore `snowflakeProvisionAuditLog`. |
| POST   | `/api/snowflake/industry-catalog`          | `snowflakeIndustryCatalog`       | Travel manifest + optional INFORMATION_SCHEMA table checks. |
| POST   | `/api/snowflake/industry-validate-proposal`| `snowflakeIndustryValidateProposal` | Read-only validate enrich/generate proposals, `recipe_id`, or retail draft `proposed_tables`. |

All four handlers attach the `snowflake-egress` VPC connector with
`vpcConnectorEgressSettings: 'ALL_TRAFFIC'`, which is the bit that actually
forces the static-IP path. Without `ALL_TRAFFIC` only RFC1918 traffic would
go through the connector and Snowflake calls would still leak the dynamic
Google egress pool.

---

## One-time GCP infrastructure

These commands provision the static-IP egress for the project. Already run
once in `aep-orchestration-lab` (this doc is the audit trail). They are
idempotent for new projects but will fail with `Already exists` on this one.

```bash
PROJECT=aep-orchestration-lab
REGION=us-central1

# 1. Enable APIs
gcloud services enable compute.googleapis.com vpcaccess.googleapis.com \
  --project=$PROJECT

# 2. Reserve static external IPv4
gcloud compute addresses create snowflake-nat-ip \
  --region=$REGION --project=$PROJECT

# 3. Custom subnet inside the default VPC
gcloud compute networks subnets create snowflake-egress-subnet \
  --network=default --range=10.124.0.0/28 \
  --region=$REGION --project=$PROJECT

# 4. Cloud Router + Cloud NAT bound to that subnet using the reserved IP
gcloud compute routers create snowflake-router \
  --network=default --region=$REGION --project=$PROJECT

gcloud compute routers nats create snowflake-nat \
  --router=snowflake-router --region=$REGION --project=$PROJECT \
  --nat-custom-subnet-ip-ranges=snowflake-egress-subnet \
  --nat-external-ip-pool=snowflake-nat-ip

# 5. Serverless VPC Access connector on the same subnet
gcloud compute networks vpc-access connectors create snowflake-egress \
  --region=$REGION --project=$PROJECT \
  --subnet=snowflake-egress-subnet \
  --min-instances=2 --max-instances=3 --machine-type=e2-micro

# 6. Print the IP to paste into Snowflake's NETWORK POLICY
gcloud compute addresses describe snowflake-nat-ip \
  --region=$REGION --project=$PROJECT --format='value(address)'
```

### Required IAM (one-time)

```bash
SA="$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" --role="roles/vpcaccess.user"
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" --role="roles/secretmanager.admin"
```

`roles/vpcaccess.user` lets the Cloud Functions runtime use the connector;
`roles/secretmanager.admin` is needed because the snowflake config endpoint
creates secrets the first time a user saves a credential. If you prefer
finer-grained IAM, swap `secretmanager.admin` for `secretmanager.secretAccessor`
plus `secretmanager.admin` only on the resource prefix `snowflake-cred-*`.

---

## Phase C — governed table provisioning (MCP v3.23+)

Allowlisted recipes live in [`functions/snowflakeProvisionRecipes.js`](../functions/snowflakeProvisionRecipes.js). Execution is in [`functions/snowflakeProvisionService.js`](../functions/snowflakeProvisionService.js). **No DROP, ALTER, or arbitrary SQL.**

| Recipe id | Mode | Purpose |
| --------- | ---- | ------- |
| `travel.all.v1` | `create_if_not_exists` | Create all 16 travel tables in the caller's saved database/schema; preview and explicit confirmation required |
| `travel.base_profiles.v1` | `create_if_not_exists` | `CREATE TABLE IF NOT EXISTS BASE_PROFILES` (38-column batch shape) |
| `travel.agentic_phase1.preinstalled.v1` | `preinstalled` | Verify Phase 1 Agentic tables exist (no DDL) |
| `travel.agentic_all.preinstalled.v1` | `preinstalled` | Verify all 16 manifest tables exist (no DDL) |
| `{industry}.all.v1` | `create_if_not_exists` | All six tables for `fsi`, `retail`, `telecom`, `media`, or `sports` |

Coworker workflow: **lab_snowflake_config** → **lab_snowflake_test_connection** → **lab_snowflake_industry_catalog** → **lab_snowflake_validate_proposal** (`recipe_id`) → **lab_snowflake_provision** `dry_run true`. Show the fully qualified targets and SQL, then obtain explicit colleague confirmation before execution. For `travel.all.v1`, execute with `dry_run:false`, `confirmed:true`, and the unchanged `preview_fingerprint`. Omitting `dry_run` on this recipe defaults to preview. A changed saved connection or recipe requires a new preview.

The travel recipe contains the 14 original Phase 1–3 tables captured using exact `GET_DDL` metadata, plus `AGENTIC_TRAVEL_EVENT_BOOKING_SEGMENTS` and `AGENTIC_TRAVEL_EVENT_ANCILLARIES` from the runner's fixed CREATE definitions. Monetary precision/scale, arrays, defaults, nullability, and primary keys are preserved. All targets use the caller's saved database/schema; the runner no longer hardcodes Adam's target for booking detail writes or enrichment reads.

Every colleague must save credentials under the **same Lab identity and sandbox** used by MCP/Coworker. A user-generated key or independently validated IMS enrollment selects that user's connection, not Adam's. Their role needs USAGE on the existing database/schema/warehouse, CREATE TABLE on the schema, and SELECT/INSERT on the target tables (booking detail MERGE also needs UPDATE). No recipe creates databases/schemas or grants privileges. Snowflake network policy must permit the Lab's static egress IP.

`CREATE TABLE IF NOT EXISTS` is not a migration or a column-compatibility check: existing incompatible tables remain unchanged. A successful connection test does not prove DDL/DML permissions. Creation stops at the first failure, returns per-table results, and can be retried safely without replacing existing tables.

Verifier: `npm run verify:snowflake-industry-manifest` (manifest ↔ recipe registry alignment).

### Setup-to-generation coverage

| Industry | Governed table count | Activity/enrichment keys |
| -------- | -------------------- | ------------------------ |
| Travel | 16 | website, booking (segments and ancillaries), mobile, call, checkin, disruption, inflight, hotel, loyalty, pos; full generation also creates base/customer/loyalty/preferences profiles |
| FSI | 6 | digital, transaction, application, advisory, products |
| Retail | 6 | order, browse, return, service, rewards |
| Telecom | 6 | usage, billing, service, network, devices |
| Media | 6 | viewing, engagement, billing, download, watchlist |
| Sports | 6 | attendance, merchandise, engagement, betting, membership |

For a **Snowflake-only** demo, confirm generation preferences and the requested count, then call **lab_snowflake_generate_base_profiles** with explicit `industry` and `count` after provisioning. This selects the same `/api/snowflake/generate-industry-profiles` CRM generator as the UI and returns compact `profiles` identity selectors for **lab_snowflake_enrich_profiles**. Omit `industry` only for the legacy `BASE_PROFILES` generator; do not combine industry mode with a `table` override or legacy email preferences. This path does not create AEP profiles.

For **AEP + Snowflake**, use **lab_generate_profile** or **lab_generate_profiles_batch** with `dual_load_snowflake:true`, shared generation preferences, and `snowflake_enrichment:true` for non-travel activity. Alternatively enrich existing CRM profiles using the manifest keys above. Verify non-travel joins with **lab_snowflake_get_profile_bundle** and bounded samples; use the catalog/table preview for travel, including booking details. Full travel generation/enrichment still requires the configured Python runner; saving a Snowflake connection alone does not configure it.

### Bounded non-travel stored-row readback

`lab_snowflake_get_profile_bundle` accepts optional `table_key` (an exact registered
activity/enrichment key for the chosen industry, listed above) and `event_offset`
(a nonnegative safe integer, default `0`). Keep `event_limit` between `1` and `100`
(default `25`). Select one table and a small page to avoid oversized MCP receipts:

```json
{
  "sandbox": "<your-sandbox>",
  "industry": "telecom",
  "ecid": "<profile-ecid>",
  "table_key": "usage",
  "event_limit": 10,
  "event_offset": 0
}
```

Each returned `tables.<key>` retains `count` as **returned rows**, and adds
`totalCount` from an independent `COUNT(*) WHERE ECID = ?` over all stored rows
for that profile, `offset`, `hasMore`, and `nextOffset` (`null` at the end).
Use that table's `nextOffset` for the next request until `hasMore` is `false`;
125 stored usage rows can therefore be read in thirteen pages of at most ten
rows. `totalReturnedRows` remains the sum of returned rows, not stored totals.
An empty table or an offset at/beyond its end returns no rows and no continuation,
while preserving its stored total.

The Function endpoint `POST /api/snowflake/agentic/profile-bundle` accepts
`tableKey`/`table_key` and `eventOffset`/`event_offset`; the camel-case value takes
precedence when supplied. Offsets must be JSON numbers, not numeric strings.
Invalid offsets and unregistered/wrong-industry table keys return HTTP `400`
using the existing error envelope (MCP surfaces a tool error). Omitted selectors
still return all five tables, each independently paged at the supplied offset;
legacy Function limit clamping to `1`–`100` is unchanged.

Pages order by record timestamp descending, then event ID (where present),
generation ID and remaining registered values, with explicit null ordering.
Enrichment snapshots have no unique row ID; all values, including JSON-serialized
arrays, break ties. Identical duplicate rows are indistinguishable. Counts and
pages are separate reads, not a transactional snapshot: finish verification while
data is unchanged, or restart if writes occur between reads.

Travel is deliberately excluded from this endpoint and MCP tool; keep its
separate runner and catalog/table-preview path. Releasing this contract requires
both the `snowflakeAgenticProfileBundle` **Cloud Function** and the
**aep-lab-profile-mcp** service; no schema changes or data writes are required.

### AEP dual-stream and partial-failure diagnostics

Non-generic AEP generation streams the Generic base first and the industry-owned
overlay second. The base response issues a short-lived, signed continuation token
bound to its email, sandbox, and ECID; the overlay must present it and reuse that
ECID rather than race UPS profile visibility. The MCP does not expose the token
in its final result. If the deployed Functions revision does not return a token,
the MCP stops before the overlay and reports a partial success; do not regenerate
that identity.

The token is signed and verified in Cloud Functions using the existing bound
`ADOBE_CLIENT_SECRET`; the MCP only forwards it and needs no new signing secret
or IAM grant. The read-only `/api/profile-infra/status-all` response exposes
`profileContinuation.ready` without exposing the secret. AEP preflight checks
this flag for non-generic industries without reserving an email; run preflight
before generation.
`MERGE_TOKEN_SECRET_UNAVAILABLE` requires checking route dependency wiring as
well as runtime secret availability, not blindly creating a new secret.

Recent-profile synchronization and Snowflake dual-load happen after AEP accepts
the profile and are independent operations. A 403 from recent-profile sync does
not undo the AEP profile, and a Snowflake 400 does not mean AEP generation failed.
Each MCP generate request carries a `correlation_id` across the profile stream,
recent-profile sync, and Snowflake insert. Cloud Function logs use structured
events with that ID, phase, duration, and safe error metadata; Snowflake errors
preserve vendor code, SQL state, query ID when supplied by the error or SDK
statement, and phase without logging credentials,
SQL binds, email, or ECID. On partial failure, inspect the exact returned email
and correlation ID before repair. Never automatically rerun generation.

Industry dual-load and Travel seed inserts use declared column types for
`ARRAY`, `OBJECT` and `VARIANT`, including null values, through
`PARSE_JSON(?)::<TYPE>`. The sixteen Travel table contracts are audited, including
`FAVORITEDESTINATIONS`, `SPECIALASSISTANCE` and event item arrays; the Python
runner uses equivalent typed SELECT expressions. Legacy loyalty/preferences
`PUSHTOKENS` columns remain text by design. Lab readback preserves arrays and
objects instead of coercing arrays to comma-separated strings.

In `crm_generate` mode, all six Node CRM generators preserve supplied shared
persona values instead of independently re-randomizing them. The explicit
column/path contract is `functions/snowflakePersonaContract.js`: common names,
birth date, gender, nationality, phone, address and LTV; industry CRM paths under
`customerProfile` (Travel), `fsiProfile`, `retailProfile`, `telecomProfile`,
`mediaProfile` and `sportsProfile`; and supported aliases used by the MCP persona
builders. These include FSI credit score/income, Retail brand/category/order
values, Travel cabin/seat/meal, and Telecom/Media/Sports flags. Missing fields
retain synthetic operational defaults. CRM-only seeding with no supplied persona
retains its randomized behavior. The legacy `mirror` mode is unchanged.

Explicit `false`, zero, empty arrays and null are not replaced with random
values. Conflicting aliases, invalid column types, oversized strings and unknown
paths inside the selected CRM profile root fail explicitly rather than silently
choosing a different persona value. Primary email must match the generated
identity. Identity allocation and demo push-token generation remain governed by
the existing recipient service; this contract does not accept replacement ECIDs
or arbitrary push tokens. It is not a promise that every XDM attribute has a CRM
column: for example, preferred language is streamed to AEP but has no Snowflake
CRM column.

Exact Snowflake storage and AEP projection are separate checks. Source mappings
must carry the intended columns, and pinned dataflow mapping versions must be
updated when those mappings change. `allowNullValues:false` does not clear an
existing AEP value when Snowflake contains null. Travel's existing source mappings
target element `[0]` for favorite destinations and special assistance; full-array
projection still needs its own mapping review and live acceptance. Matching a
merged AEP profile alone cannot prove that a Snowflake source supplied the value.

The Python runner validates the complete input batch before issuing bound
`cursor.execute` calls for each typed `INSERT ... SELECT`; Snowflake's
`executemany` INSERT rewriter requires `VALUES` and rejects this SELECT shape.
Enrichment inserts generated mobile, check-in, call and disruption rows before
counting them. A write error stops the remaining event types and returns
`success:false` with `write_state:potentially_partial`; earlier types may already
be committed. The internal generate/enrich endpoints return HTTP 500 on failure
so the Cloud Function, Portal and MCP do not treat a failed run as successful.
Inspect stored rows before any separately approved retry.
Raw JavaScript array bindings can fail with `Unsupported data type 'VARIANT'`.
Compilation failure
rolls back the profile/recipient transaction; it does not undo the preceding
AEP writes. Do not retry generation to repair this partial failure.

FSI personas stream the tenant paths `industryFsi.*`, which require the
dedicated `AEP Lab - Profile FSI Generator v1` field group. The existing tenant
groups named `Profile FSI v1` and `Profile FSI v2` are preserved as optional
extensions: their names do not prove they declare generator fields. In
`apalmer`, the existing v1 defines `individualCharacteristics.fsi.*`, not
`industryFsi.*`. Provisioning creates/attaches the dedicated group additively;
it does not modify or detach those existing groups.
Aggregate status and MCP preflight preserve required-field-group/identity
readiness instead of inferring it from Profile-enabled schema/dataset flags.
FSI readiness also checks the resolved schema's required tenant fields and
types, exposing `requiredTenantFields.ready`, `missing`, and `conflicts`.
Media applies the same checks to its dedicated
`AEP Lab - Profile Media Generator v1` group and all twelve `industryMedia`
fields. Existing `Profile Media v1/v2` groups are optional extensions, not proof
that those generator paths exist.
Missing required groups produce `attach_required_field_groups_and_identity`;
review and approve `attachFieldGroups` separately before running it. If fields
have conflicting types, stop for schema review rather than overwriting them.

Primary Email identity accepts the tenant path
`/_demoemea/identification/core/email` (or the sandbox's tenant equivalent).
Descriptor discovery uses the Schema Registry's maximum list limit of 300,
reads both `results`/`children` and type-keyed `xdm:descriptorIdentity` arrays,
and follows pagination before deciding readiness. Registry request failures
are surfaced as errors, not reported as missing identities. A secondary ECID
descriptor must designate `/_demoemea/identification/core/ecid` (or its tenant
equivalent), namespace `ECID`, with `isPrimary:false`; carrying an ECID field or
setting a payload identity entry alone does not establish that schema identity.
The approved attach step adds missing descriptors without replacing primary
Email. The standard `https://ns.adobe.com/xdm/context/identitymap` field group
is also required on every profile schema so the outgoing root `identityMap`
is declared rather than discarded during ingestion. The approved attach step
adds this reference without removing existing field groups or changing Email's
primary status. Applying this change to an existing sandbox requires separate
schema-change approval; it does not replay or repair old records.
Read-only status exposes `secondaryEcidDescriptor`. Cache version 5
invalidates earlier readiness results; it changes status metadata only.
Descriptor and field-group readiness is configuration evidence, not proof that
Identity Service indexed a record. Generate returns `accepted:true`,
`upsVerified:false`, and an inlet-acceptance receipt; never treat it as successful
profile readback. A verified Adobe entity-not-found response becomes HTTP 404
with `code:UPS_ENTITY_NOT_FOUND` and `stage:profile_access`, not an HTTP 500.
Unknown 404s and other upstream failures remain errors. Only read operations
may be retried while awaiting indexing; never retry generation automatically.
Profile readback includes identity namespaces, Email/ECID map-presence flags,
and contributing dataset IDs in `profileAccessHints`. An ECID tenant attribute
alone does not satisfy those identity-map flags. For release acceptance, look up
the same new profile by Email and ECID and confirm matching identities. Use an
approved AEP-only test to isolate Lab ingestion from later CRM dataset ingestion;
a merged profile containing CRM datasets is not proof of Lab-only stitching.
For an explicit fresh check use `lab_sandbox_profile_config` with `refresh:true`,
`lab_preflight_profile_generate` with `target:"aep", refresh:true` (the default),
or `/api/profile-infra/status-all?sandbox=apalmer&refresh=1`.
Preflight does not create profiles or consume an email counter.
If a client rejects `refresh` before invoking preflight, omit that optional
argument: the default is still a fresh check. Reconnect and verify the discovered
tool schema separately; do not present a client-side rejection as a passed check.

Two-step generation reports the Generic step's place mirror result; an industry
overlay intentionally lacking place must not replace it with `no_place`. The
streaming envelope retains the bare tenant alias (`demoemea` alongside
`_demoemea`) for legacy Data Prep mappings. It is not a second profile write;
removing it requires auditing those mappings first.

Start with a small batch, inspect representative rows, then scale in bounded batches, honoring returned rate-limit hints. Identity keys are shared; operational profile data and correlated activity are synthetic. Realistic conditions intentionally leave some tables empty for individual profiles (for example, non-bettors have no betting rows). Non-travel activity uses deterministic generation IDs; each table's INSERT chunks commit together so a failed chunk can be retried without silently skipping earlier partial rows. Do not run concurrent enrichment for the same identities, or automatically retry a profile-generation request: profile generation creates new identities and is not idempotent.

`proposed_tables` remains a read-only legacy validation input; it does not authorize arbitrary table creation.

---

## Agentic travel runner (Cloud Run)

Full phased generate/enrich (`lab_snowflake_generate_full`, `lab_snowflake_enrich_profiles`) forward to the Python runner at [`services/agentic-travel-runner/`](../services/agentic-travel-runner/) when Cloud Functions env is set:

| Cloud Functions env | Runner env | Purpose |
| ------------------- | ---------- | ------- |
| `AGENTIC_TRAVEL_RUNNER_URL` | — | HTTPS base URL of deployed runner (no trailing slash) |
| `AGENTIC_TRAVEL_RUNNER_HMAC_SECRET` | `RUNNER_HMAC_SECRET` | Shared HMAC secret for `X-Runner-Signature` (store in Secret Manager — **never commit**) |

Cloud Functions bind the secret via `defineSecret('AGENTIC_TRAVEL_RUNNER_HMAC_SECRET')` on all Snowflake Gen2 handlers (`SNOWFLAKE_FN_OPTS.secrets`). Set the runner base URL in **`functions/.env.aep-orchestration-lab`** (gitignored) as `AGENTIC_TRAVEL_RUNNER_URL`, then redeploy Snowflake functions.

The runner receives Snowflake credentials in the POST body; attach **`snowflake-egress`** with **`all-traffic`** egress so outbound Snowflake uses the allowlisted static IP. Cloud Run is **`--allow-unauthenticated`** at IAM; only callers with the shared HMAC can run generate/enrich.

Ops script: [`scripts/deploy-agentic-travel-runner.sh`](../scripts/deploy-agentic-travel-runner.sh)

```bash
# One-time secret (do not commit the value)
openssl rand -hex 32 | gcloud secrets create AGENTIC_TRAVEL_RUNNER_HMAC_SECRET --project=aep-orchestration-lab --data-file=-

./scripts/deploy-agentic-travel-runner.sh

# functions/.env.aep-orchestration-lab
# AGENTIC_TRAVEL_RUNNER_URL=https://agentic-travel-runner-….run.app

npx -y firebase-tools@latest deploy --only functions:snowflakeIndustryCatalog,functions:snowflakeAgenticGenerateFull,functions:snowflakeAgenticEnrichProfiles,functions:snowflakeAgenticQueryProfiles,functions:snowflakeAgenticTableStructure,functions:snowflakeConfig,functions:snowflakeConnectionTest,functions:snowflakeGenerateBaseProfiles,functions:snowflakeIndustryValidateProposal,functions:snowflakeInsertProfileFromAep,functions:snowflakeProvision
```

Redeploy functions after setting env. Confirm with **lab_snowflake_industry_catalog** → `manifest.runner.configured: true`.

---

1. **Sign in to the Portal** with your Adobe @adobe.com email (home.html → Login).
   Anonymous browser auth is not enough for Snowflake. Pick a sandbox in
   the **Global values** sidebar — the connection is saved per (you, that
   sandbox).
2. Open **Profiles → Profile generation – Snowflake (in development)**. If the
   menu item is hidden, enable in-development capabilities for your sandbox
   in **Global values**.
3. Fill account, user, role, warehouse, database, schema. Pick the auth
   method, paste the credential (and passphrase if keyPair). Click
   **Save connection**.
4. Click **Test connection**. Expect "Connected — Snowflake \<version\>".
5. If the test reports `IP not allowed`, the Snowflake admin still needs to
   add `34.58.81.28/32` to the `NETWORK POLICY` for the user.
6. **Generate base profiles (Phase 2):** in the *Generate base profiles*
   panel, set the count (default 10, max 1000) and target table (default
   `BASE_PROFILES`), then click **Generate profiles**. The function
   idempotently `CREATE TABLE IF NOT EXISTS` for the target, then bulk
   INSERTs Faker-generated rows in batches (default 200/batch). The
   response shows the rowcount, fully-qualified table, and a sample of
   the first three rows that were inserted.

---

## MCP / Coworker (`lab_snowflake_config`)

Snowflake credentials resolve **per Firebase uid + sandbox**, with **sandbox-shared
fallback** on team sandboxes (`apalmer`, `kirkham`). Coworker must use a
**user-generated MCP API key** (Profile Viewer → **MCP servers**), not the shared
ops/env key. The ops key has no `principalUid`, so Snowflake tools return
`MCP_USER_KEY_REQUIRED`.

| Symptom | Likely cause |
| ------- | ------------ |
| `AUTH_PORTAL_LOGIN_REQUIRED` | Not signed in with Adobe @adobe.com — use Portal Login on home.html before Snowflake Save/Test. |
| MCP says all connection fields empty for `apalmer` | **Apalmer preset bug (fixed):** GET `/api/snowflake/config` used to return an empty shell object and skip Agentic travel defaults; the UI applied presets client-side only. MCP now receives the same preset fields as the UI. |
| UI shows saved config; MCP shows empty / no credential | **Uid mismatch:** MCP key `principalUid` differs from the Portal user who saved. Regenerate the MCP key while signed in as the same user, or re-save Snowflake. On team sandboxes, sandbox-shared fallback should still expose `hasCredential: true` after any teammate saves. |
| `MCP_USER_KEY_REQUIRED` | Coworker is using the shared ops key — generate a personal MCP key in Profile Viewer. |

**Apalmer sandboxes:** when no saved `account` exists for the current uid,
GET config returns Agentic travel preset fields (`dh96551.west-europe.azure`,
`AEP_INTEGRATION_1`, `TRAVEL_DATABASE`, `AEP_SCHEMA`, key-pair). Check
`hasCredential` separately — preset fields do not mean the PEM is saved.
When a teammate saved on `apalmer`, `credentialScope: sandbox_shared` and
`hasCredential: true` appear for new browsers without re-pasting the key.

The API response includes `labUserEmail`, `labUserDisplayName`, and
`labUserUidPrefix` so Coworker can confirm it matches the Portal user who saved config.

---

## Related files

- Page: [`web/profile-viewer/profile-generation-snowflake.html`](../web/profile-viewer/profile-generation-snowflake.html)
  · [`profile-generation-snowflake.css`](../web/profile-viewer/profile-generation-snowflake.css)
  · [`profile-generation-snowflake.js`](../web/profile-viewer/profile-generation-snowflake.js)
- Nav entry: [`web/profile-viewer/aep-lab-nav.js`](../web/profile-viewer/aep-lab-nav.js)
- Backend: [`functions/snowflakeConnectionStore.js`](../functions/snowflakeConnectionStore.js)
  · [`functions/snowflakeService.js`](../functions/snowflakeService.js)
  · [`functions/snowflakeDataGeneratorService.js`](../functions/snowflakeDataGeneratorService.js) (Phase 2 — base-profile generator)
  · [`functions/snowflakeProvisionRecipes.js`](../functions/snowflakeProvisionRecipes.js)
  · [`functions/snowflakeProvisionService.js`](../functions/snowflakeProvisionService.js) (Phase C — governed provision)
  · [`functions/snowflakeIndustryManifest.js`](../functions/snowflakeIndustryManifest.js)
  · handler exports + `SNOWFLAKE_FN_OPTS` in [`functions/index.js`](../functions/index.js)
- Hosting rewrites: [`firebase.json`](../firebase.json) (`/api/snowflake/*`)
- Source project mirrored: `/Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AI Projects/AgenticAI Demo/Agentic_Demo_Platform/`

---

## Roadmap

- ✅ **Phase 1** — connection plumbing, Secret Manager + Firestore store,
  static-IP egress, connection test.
- ✅ **Phase 2** — minimal port of `data_generator.py → generate_base_profiles` in
  [`functions/snowflakeDataGeneratorService.js`](../functions/snowflakeDataGeneratorService.js).
- ✅ **Phase C (MCP v3.23)** — governed provision recipes, `POST /api/snowflake/provision`,
  `lab_snowflake_provision`, Firestore audit log, retail draft table proposal validation.
- **Phase 3+** — additional CREATE recipes for Agentic event tables; full query/enrich UI in Profile Viewer.
