# Snowflake integration — Profile generation (Snowflake) page

This page covers the AEP Orchestration Lab's Snowflake integration, surfaced
in the Profile Viewer at **`/profile-viewer/profile-generation-snowflake.html`**
(menu: **Profiles → Profile generation – Snowflake (in development)**).

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
| `travel.base_profiles.v1` | `create_if_not_exists` | `CREATE TABLE IF NOT EXISTS BASE_PROFILES` (38-column batch shape) |
| `travel.agentic_phase1.preinstalled.v1` | `preinstalled` | Verify Phase 1 Agentic tables exist (no DDL) |
| `travel.agentic_all.preinstalled.v1` | `preinstalled` | Verify all 14 manifest tables exist (no DDL) |

Coworker workflow: **lab_snowflake_industry_catalog** → **lab_snowflake_validate_proposal** (`recipe_id`) → **lab_snowflake_provision** `dry_run true` → **lab_snowflake_provision** `dry_run false`.

Verifier: `npm run verify:snowflake-industry-manifest` (manifest ↔ recipe registry alignment).

Retail **draft** manifest supports read-only **proposed_tables** validation only — no CREATE recipes yet.

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
