# Snowflake integration — Profile generation (Snowflake) page

This page covers the AEP Orchestration Lab's Snowflake integration, surfaced
in the Profile Viewer at **`/profile-viewer/profile-generation-snowflake.html`**
(menu: **Profiles → Profile generation – Snowflake (in development)**).

The integration ports the AgenticAI Demo (`AI Projects/AgenticAI Demo/Agentic_Demo_Platform/`)
into the lab. **Phase 1** ships per-user Snowflake connection management plus a
server-side connection test. **Phases 2 and 3** will port the data generators.

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

## Per-user, per-sandbox configuration

Connection details are scoped to **(lab user, AEP sandbox)** so multiple
people can use the same lab against different Snowflake targets without
overwriting each other.

- **Firestore** collection: `snowflakeConnections/{labUserUid}__{sandbox}`.
  Stores only non-secret fields (`account`, `user`, `role`, `warehouse`,
  `database`, `schema`, `authMethod`, `credentialSetAt`, `updatedAt`,
  `updatedBy`). The credential value is **never** written to Firestore.
- **Secret Manager** secret per (lab user, sandbox):
  `snowflake-cred-<labUserSlug>-<sandboxSlug>`. Holds the password / PAT /
  PEM private key. For key-pair auth, the optional passphrase lives in a
  sibling secret with `-pass` suffix.

Lab user identity comes from a Firebase ID token (`labUserSandboxStore.verifyIdTokenFromRequest`);
anonymous Firebase auth (already booted by `aep-lab-sandbox-sync.js`) is enough.

### Auth methods

| Method     | What to paste in the credential field                                  |
| ---------- | ---------------------------------------------------------------------- |
| `password` | The Snowflake user's password.                                         |
| `pat`      | A Snowflake [Programmatic Access Token](https://docs.snowflake.com/en/user-guide/programmatic-access-tokens). Recommended over passwords. |
| `keyPair`  | The full PEM private key (including `-----BEGIN PRIVATE KEY-----` lines). If the `.p8` is encrypted, fill in the passphrase field; otherwise leave it blank. |

The AgenticAI Demo's `snowflake_settings.py` uses key-pair auth with
`aep_integration_1.p8`. The lab supports the same flow: paste the PEM
contents into the credential field with `Authentication method = Key pair`
and the passphrase into the optional passphrase field.

---

## API surface (Firebase Functions, region `us-central1`)

All endpoints require a Firebase Auth Bearer token (anonymous OK) and a
`sandbox` parameter (`?sandbox=…` for GET, request body for POST). Wired via
[`firebase.json`](../firebase.json) rewrites and exported in
[`functions/index.js`](../functions/index.js):

| Method | Path                              | Function name              | Purpose                                                                  |
| ------ | --------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/snowflake/config`           | `snowflakeConfig`          | Public projection of saved config (never the credential).                |
| POST   | `/api/snowflake/config`           | `snowflakeConfig`          | Save / update config; credential, if supplied, is written to Secret Manager. |
| POST   | `/api/snowflake/connection-test`  | `snowflakeConnectionTest`  | Open a Snowflake connection, run `SELECT CURRENT_VERSION()`, tear down.  |

All three handlers attach the `snowflake-egress` VPC connector with
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

## End-user flow

1. Sign in to the lab (anonymous Firebase auth is fine). Pick a sandbox in
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

---

## Related files

- Page: [`web/profile-viewer/profile-generation-snowflake.html`](../web/profile-viewer/profile-generation-snowflake.html)
  · [`profile-generation-snowflake.css`](../web/profile-viewer/profile-generation-snowflake.css)
  · [`profile-generation-snowflake.js`](../web/profile-viewer/profile-generation-snowflake.js)
- Nav entry: [`web/profile-viewer/aep-lab-nav.js`](../web/profile-viewer/aep-lab-nav.js)
- Backend: [`functions/snowflakeConnectionStore.js`](../functions/snowflakeConnectionStore.js)
  · [`functions/snowflakeService.js`](../functions/snowflakeService.js)
  · handler exports + `SNOWFLAKE_FN_OPTS` in [`functions/index.js`](../functions/index.js)
- Hosting rewrites: [`firebase.json`](../firebase.json) (`/api/snowflake/*`)
- Source project mirrored: `/Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AI Projects/AgenticAI Demo/Agentic_Demo_Platform/`

---

## Roadmap

- **Phase 2** — port `data_generator.py` Phase 1 base-profile generation to
  `functions/snowflakeDataGeneratorService.js` and wire the "Generate profiles"
  button on the page.
- **Phase 3** — port Phase 2/3 generators (loyalty, mobile, website, booking,
  check-in, call, disruption, in-flight, hotel, POS) and the query / enrich
  panel from the original Flask app.
