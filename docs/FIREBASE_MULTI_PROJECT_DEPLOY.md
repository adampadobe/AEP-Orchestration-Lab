# Single repo, multiple Firebase projects (aliases)

This lab keeps **one GitHub repo** and **one `firebase.json` / `functions/` tree**, while targeting more than one Firebase/GCP project. That scales better than duplicating repos: shared reviews, one CI surface, and less copy-paste drift between “environments.”

**Project ids in this repo (as of `.firebaserc`):**

| Alias (`-P`)   | Firebase project id        | Role |
|----------------|------------------------------|------|
| **`production`** | `aep-orchestration-lab`      | Current production / default until an explicit org cutover. |
| **`sandbox`**    | `adbe-gcp0819`               | Adobe-paid sandbox (primary new area for soak and validation). |

**`default`** in `.firebaserc` stays **`aep-orchestration-lab`** so teammates and scripts that omit `--project` / `-P` keep behaving like today. When the org agrees to cut over, change `default` (and docs) in a deliberate commit—do not flip it silently.

---

## Why aliases instead of a second repo?

- **One source of truth** for Hosting rewrites, Functions, and predeploy checks.
- **One PR** carries infra + app changes together.
- **Drift control:** no “we fixed it in repo A but forgot repo B.”
- **Firebase CLI** resolves **`-P <alias>`** to the real project id via `.firebaserc` (same as passing the raw project id).

---

## Everyday commands (alias-based)

Deploy Hosting + Functions to the **sandbox** project ( **`us-east4`** rewrites + runtime region):

```bash
npm run deploy:sandbox
```

Equivalent manual command:

```bash
npm run deploy:sandbox
# or:
node scripts/patch-firebase-tools-sandbox-build-sa.mjs && \
CLOUD_FUNCTIONS_REGION=us-east4 \
CF_RUNTIME_SERVICE_ACCOUNT=sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com \
CF_BUILD_SERVICE_ACCOUNT=sc-demo-sandbox-admin@adbe-gcp0819.iam.gserviceaccount.com \
node scripts/run-firebase-sandbox-deploy.mjs -- deploy --only functions,hosting \
  --config firebase.sandbox.json -P sandbox
```

**Switch active project** for a shell session (optional; may rewrite the `default` entry in `.firebaserc` when you choose “make this the default project”—prefer **`-P`** in scripts and CI to avoid accidental commits):

```bash
firebase use sandbox
# or: firebase use production
```

From repo root, npm shortcuts mirror the above:

```bash
npm run deploy:sandbox    # uses firebase.sandbox.json + us-east4 (see Regions below)
npm run deploy:production # uses firebase.json + us-central1
```

---

## Regions (org policy vs production)

| Target | GCP project | Functions / Hosting rewrites | Config file |
|--------|-------------|------------------------------|-------------|
| **production** (`-P production`) | `aep-orchestration-lab` | **`us-central1`** | `firebase.json` |
| **sandbox** (`-P sandbox`) | `adbe-gcp0819` | **`us-east4`** (org-allowed US region; **not** `us-central1`) | `firebase.sandbox.json` |

**Why two Firebase config files:** Hosting rewrites pin each `/api/*` route to a Functions **region**. Production stays on `firebase.json` with `"region": "us-central1"`. Sandbox deploy uses **`firebase.sandbox.json`** (same structure, all rewrite regions set to **`us-east4`**).

**Functions code:** `functions/index.js` resolves deploy/runtime region as:

1. `CLOUD_FUNCTIONS_REGION` (trimmed), if set — `npm run deploy:sandbox` sets `us-east4`
2. else if `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `FIREBASE_CONFIG.projectId` === `adbe-gcp0819` → `us-east4`
3. else `us-central1`

`setGlobalOptions({ region })` and per-function `region: REGION` follow that value.

**Deploy-time env (committed):** `functions/.env.adbe-gcp0819` sets `CLOUD_FUNCTIONS_REGION`, `CF_RUNTIME_SERVICE_ACCOUNT`, and `LAB_HOSTING_ORIGIN` when the Firebase CLI targets **`adbe-gcp0819`** (including function discovery / `setGlobalOptions`). `npm run deploy:sandbox` sets the same vars for clarity.

### First-time App Engine app (sandbox)

Gen2 Functions and some Firebase deploy steps expect an **App Engine application** in the target project. For **`adbe-gcp0819`**, create it in **`us-east4`** (matches Functions region):

```bash
gcloud app create --project=adbe-gcp0819 --region=us-east4
```

- Requires **`roles/appengine.appCreator`** (App Engine App Creator) on the project, or a project Owner.
- If the app already exists in another region, you cannot change region in place—use a new project or follow Google’s migration guidance.
- **Org policy:** Adobe GCP orgs often restrict `locations` to an allowlist (e.g. `us-east4`, `us-west1`). Sandbox must use an **allowed** region; production **`aep-orchestration-lab`** remains **`us-central1`** and is unchanged.

### Snowflake VPC connector (sandbox)

Snowflake egress functions use `vpcConnector` from **`SNOWFLAKE_VPC_CONNECTOR`**, defaulting to `snowflake-egress`. The connector must exist in the **same region** as the function (`us-east4` for sandbox). If your sandbox connector has a different name or lives only in another region, set before deploy:

```bash
export SNOWFLAKE_VPC_CONNECTOR=your-connector-name-in-us-east4
npm run deploy:sandbox
```

See [SNOWFLAKE_INTEGRATION.md](./SNOWFLAKE_INTEGRATION.md) and [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md) for NAT / allowlist setup.

Until a **`us-east4`** connector exists, `functions/.env.adbe-gcp0819` sets `SNOWFLAKE_VPC_CONNECTOR=disabled` so Gen2 deploy and Hosting finalize can create Snowflake Cloud Run services (Snowflake API calls fail at runtime until you add the connector and remove `disabled`).

---

## Pre-deploy checklist (new / non-production project)

Use this when first wiring **`adbe-gcp0819`** or any additional target.

1. **GCP / Firebase products** — Enable what this repo uses: Firebase Hosting, Functions (Cloud Run/Build), Firestore, Realtime Database, Storage, Auth, Secret Manager (Functions secrets), and any add-ons you rely on (e.g. Vertex if used). Match **region** expectations: **production** uses **`us-central1`** (`firebase.json`); **sandbox** uses **`us-east4`** (`firebase.sandbox.json`, `npm run deploy:sandbox`). Create the App Engine app in **`us-east4`** for sandbox (see above).
2. **Secrets (per project)** — `defineSecret` values are **not** copied between projects. Recreate each secret in the target project (names must match `functions/index.js`). See [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md) § Cloud Functions secrets.
3. **`LAB_HOSTING_ORIGIN`** — For sandbox deploys where the public lab URL is the default Hosting hostname, set (deploy env or function config as you do today):

   `LAB_HOSTING_ORIGIN=https://adbe-gcp0819.web.app`

   (No trailing slash.) This keeps scheduled pre-warm and approval-link fallbacks aligned with the host users hit in the browser. See migration doc § `LAB_HOSTING_ORIGIN`.
4. **Web Firebase config (sandbox login)** — Profile Viewer Auth uses the **Firebase Web SDK** on the **same** GCP project as Hosting (`adbe-gcp0819` on `https://adbe-gcp0819.web.app`). One-time setup:

   1. [Firebase Console](https://console.firebase.google.com/) → project **`adbe-gcp0819`** → **Build** → **Authentication** → enable **Email/Password**; create test users (e.g. `apalmer@adobe.com`) under **Users**.
   2. **Project settings** → **Your apps** → **Add app** → **Web** (register e.g. “AEP Lab Web sandbox”). Copy the `firebaseConfig` snippet (`apiKey`, `appId`, `messagingSenderId`, etc.).
   3. Paste **`apiKey`**, **`messagingSenderId`**, and **`appId`** into `sandboxDefaults` in `web/profile-viewer/firebase-database-config.js` (hostname `adbe-gcp0819.web.app` selects that object automatically), **or** inject before `firebase-database-config.js` loads:

      ```html
      <script>window.__FIREBASE_CONFIG__ = { apiKey: '…', appId: '…', messagingSenderId: '…' };</script>
      ```

   `apiKey` is a **public** client identifier (not a server secret), but avoid committing it until the sandbox Web app exists. If `apiKey` is empty on the sandbox host, the browser console warns and sign-in fails until step 2–3 are done.

   **Lab-access API:** org policy may block `allUsers` on Cloud Run, so `GET /api/lab/lab-access/status` returns **401/403 HTML** until IAM is fixed. `aep-access-onboarding.js` treats verified `@adobe.com` Firebase sessions on the sandbox host as **`missing`** (continue setup) or **`approved`** for `apalmer@adobe.com` when the API is unreachable — portal HTML works; `/api/aep` sandboxes still need IAM separately.
5. **Data plane** — Firestore indexes (`firestore.indexes.json`), RTDB rules, Storage CORS, and VPC connector / Snowflake egress (if used) must exist in the **target** project per [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md).

Before shipping Hosting changes from `main`, still run **`npm run verify:profile-viewer-routes`** (and follow CONTRIBUTING Phase C: sync `origin/main` immediately before deploy).

---

## SC demo sandbox service accounts (`adbe-gcp0819`)

Some GCP projects **do not** have the default Compute Engine identity
(`PROJECT_NUMBER-compute@developer.gserviceaccount.com`). For **`adbe-gcp0819`**
(project number **82276930773**) that account is **permanently missing** — do not
use it for Gen2 Functions.

Use **two** service accounts (runtime vs build/deploy are intentional):

| Role | Service account | Used for |
|------|-----------------|----------|
| **Runtime** | `sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com` | Cloud Run / Gen2 execution (AEP, Firestore, secrets at runtime) |
| **Build / CI deploy** | `sc-demo-sandbox-admin@adbe-gcp0819.iam.gserviceaccount.com` | Cloud Build (`buildConfig.serviceAccount`); optional automation deploy identity |

**Who runs `firebase deploy`:** your user (**`apalmer@adobe.com`**) or, in CI,
**`sc-demo-sandbox-admin`** — not the runtime SA.

**Env (auto-loaded for this Firebase project):** `functions/.env.adbe-gcp0819` sets
`CF_RUNTIME_SERVICE_ACCOUNT`, `CF_BUILD_SERVICE_ACCOUNT`, `CLOUD_FUNCTIONS_REGION`, and
`FIRESTORE_DATABASE_ID=aep-lab` (Native DB; `(default)` is Datastore mode).
`npm run deploy:sandbox` / `deploy:sandbox:functions:batched` run
`node scripts/patch-firebase-tools-sandbox-build-sa.mjs` first so Cloud Build does not
default to the missing compute SA (until [firebase-tools#9598](https://github.com/firebase/firebase-tools/pull/9598) ships).

Deploy from **repo root**.

### Admin/deploy SA (`adbe-gcp0819`)

Human deploys from a laptop usually use **`gcloud auth login`** and **`firebase login`** as your `@adobe.com` user. For automation—or to grant a single principal repeatable deploy rights without your user account—use the dedicated **admin / deploy** service account:

| Field | Value |
|-------|--------|
| Account id | `sc-demo-sandbox-admin` |
| Email | `sc-demo-sandbox-admin@adbe-gcp0819.iam.gserviceaccount.com` |
| Display name | SC demo Sandbox (admin / deploy) |

Create once (ignore `ALREADY_EXISTS`):

```bash
gcloud iam service-accounts create sc-demo-sandbox-admin \
  --display-name="SC demo Sandbox (admin / deploy)" \
  --project=adbe-gcp0819
```

**Recommended project roles** (adjust with your org’s least-privilege policy; these cover Firebase CLI deploy of Hosting + Gen2 Functions, Firestore rules/indexes, and IAM bindings on the runtime SA):

| Role | Why |
|------|-----|
| `roles/firebase.admin` | Firebase deploy (Hosting, Functions, rules) |
| `roles/iam.serviceAccountUser` | Attach `sc-demo-sandbox-cf-runtime@…` to Cloud Run revisions |
| `roles/secretmanager.admin` | Create/update `defineSecret` secrets in the target project |
| `roles/datastore.owner` | Firestore database create + rules/index deploy |
| `roles/run.admin` | Cloud Run services created by Gen2 Functions |
| `roles/cloudbuild.builds.editor` | Cloud Build for function images |
| `roles/artifactregistry.writer` | Push function container images |
| `roles/serviceusage.serviceUsageAdmin` | Enable APIs during first deploy |

Example bindings (run as a project Owner, or have an admin apply them):

```bash
ADMIN_SA="sc-demo-sandbox-admin@adbe-gcp0819.iam.gserviceaccount.com"
for role in roles/firebase.admin roles/iam.serviceAccountUser roles/secretmanager.admin \
            roles/datastore.owner roles/run.admin roles/cloudbuild.builds.editor \
            roles/artifactregistry.writer roles/serviceusage.serviceUsageAdmin; do
  gcloud projects add-iam-policy-binding adbe-gcp0819 \
    --member="serviceAccount:${ADMIN_SA}" \
    --role="$role"
done
```

To deploy as this SA from CI: use **Workload Identity** or a key stored in Secret Manager; authenticate Firebase CLI with a CI token (`firebase login:ci`) scoped to the same human/project access model your org allows—do not commit keys to git.

Your **user** account still needs equivalent permissions (or `roles/owner` / `roles/editor` on the project) for first-time setup: creating the default Firestore database, enabling APIs, and `cloudfunctions.functions.setIamPolicy` during deploy. If deploy fails on `setIamPolicy`, ask a project Owner to grant you `roles/cloudfunctions.admin` or `roles/owner` on `adbe-gcp0819`.

### IAM to apply once (project `adbe-gcp0819`)

Replace **`PROJECT_NUMBER`** with `82276930773` (or
`gcloud projects describe adbe-gcp0819 --format='value(projectNumber)'`).

| Principal | Role / binding | Why |
|-----------|----------------|-----|
| **cf-runtime** | `roles/logging.logWriter`, `roles/monitoring.metricWriter`, `roles/cloudtrace.agent` | Telemetry |
| **cf-runtime** | `roles/datastore.user` | Firestore from functions |
| **cf-runtime** | `roles/secretmanager.secretAccessor` | Per-secret (below) + optional project-level |
| **cf-runtime** | `roles/vpcaccess.user` | Snowflake VPC connector (if used) |
| **cf-runtime** | `roles/storage.objectAdmin` or narrower | Only if functions write GCS directly |
| **Cloud Build** `PROJECT_NUMBER@cloudbuild.gserviceaccount.com` | `roles/iam.serviceAccountUser` on **cf-runtime** | Attach runtime SA to Cloud Run revision |
| **Cloud Build** | `roles/iam.serviceAccountUser` on **admin** (if admin is build SA) | Run builds as admin when default compute is missing |
| **Deployer** (`apalmer@adobe.com` or **admin** SA) | `roles/iam.serviceAccountUser` + `roles/iam.serviceAccountTokenCreator` on **cf-runtime** and **admin** | `actAs` for deploy |
| **Deployer** | `roles/cloudfunctions.admin`, `roles/firebase.admin`, `roles/run.admin`, … | Firebase CLI deploy (see admin table below) |

Copy-paste (adjust if bindings already exist):

```bash
PROJECT=adbe-gcp0819
PN=82276930773
RUNTIME_SA="sc-demo-sandbox-cf-runtime@${PROJECT}.iam.gserviceaccount.com"
ADMIN_SA="sc-demo-sandbox-admin@${PROJECT}.iam.gserviceaccount.com"
CLOUDBUILD_SA="${PN}@cloudbuild.gserviceaccount.com"
DEPLOYER="user:apalmer@adobe.com"   # or serviceAccount:${ADMIN_SA} for CI

# Runtime telemetry + Firestore
for role in roles/logging.logWriter roles/monitoring.metricWriter roles/cloudtrace.agent roles/datastore.user roles/vpcaccess.user; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role="$role" --condition=None
done

# Cloud Build → runtime + build SAs
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/iam.serviceAccountUser"
gcloud iam service-accounts add-iam-policy-binding "$ADMIN_SA" --project="$PROJECT" \
  --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/iam.serviceAccountUser"

# Human deployer can actAs both SAs
for sa in "$RUNTIME_SA" "$ADMIN_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$sa" --project="$PROJECT" \
    --member="$DEPLOYER" --role="roles/iam.serviceAccountUser"
  gcloud iam service-accounts add-iam-policy-binding "$sa" --project="$PROJECT" \
    --member="$DEPLOYER" --role="roles/iam.serviceAccountTokenCreator"
done
```

1. **Secret accessor** on every `defineSecret` secret (names in `functions/index.js`):

   `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`, `ADOBE_IMS_ORG`, `ADOBE_SCOPES`,
   `EASTER_EGG_MAILGUN_API_KEY`, `EASTER_EGG_MAILGUN_DOMAIN`, `CONTEXT7_API_KEY`

   ```bash
   RUNTIME_SA="sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com"
   for s in ADOBE_CLIENT_ID ADOBE_CLIENT_SECRET ADOBE_IMS_ORG ADOBE_SCOPES \
            EASTER_EGG_MAILGUN_API_KEY EASTER_EGG_MAILGUN_DOMAIN CONTEXT7_API_KEY; do
     gcloud secrets add-iam-policy-binding "$s" \
       --project=adbe-gcp0819 \
       --member="serviceAccount:${RUNTIME_SA}" \
       --role="roles/secretmanager.secretAccessor"
   done
   ```

2. **Runtime telemetry** (typical minimum for Cloud Run / Gen2):

   ```bash
   RUNTIME_SA="sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com"
   for role in roles/logging.logWriter roles/monitoring.metricWriter roles/cloudtrace.agent; do
     gcloud projects add-iam-policy-binding adbe-gcp0819 \
       --member="serviceAccount:${RUNTIME_SA}" \
       --role="$role"
   done
   ```

3. **Cloud Build → runtime SA** — see copy-paste block above (`CLOUDBUILD_SA` → **cf-runtime**).

4. **Snowflake / VPC** — functions use `SNOWFLAKE_VPC_CONNECTOR` (default `snowflake-egress`) in the **function region**. For sandbox, provision or reference a connector in **`us-east4`**, or set `SNOWFLAKE_VPC_CONNECTOR` before deploy. Extra roles (e.g. `roles/compute.networkUser`) may be required; if routes fail at **runtime**, see [SNOWFLAKE_INTEGRATION.md](./SNOWFLAKE_INTEGRATION.md).

---

## CI / GitHub Actions

Today **`.github/workflows/validate.yml`** runs lint/verify jobs only; it does **not** deploy to Firebase. There is no production deploy workflow to extend here.

If you add a **manual** deploy workflow later, prefer **explicit** flags so merges never guess the target:

```yaml
# Example pattern (not wired in this repo): workflow_dispatch input "target" = production | sandbox
# - run: npx -y firebase-tools@latest deploy --only functions,hosting -P ${{ inputs.target }}
```

Keep **service account / token** scopes separate per environment; never reuse production credentials for sandbox deploys unless your org explicitly allows that.

---

## Decommissioning the old project (after soak)

High level only—align with org retention and compliance before acting.

1. **Soak complete** — Traffic, errors, and backups validated on the new project; stakeholders signed off.
2. **Stop writes** — Freeze Auth/Firestore/RTDB/Storage mutations on the old project (disable writes via rules or decommission app entry points).
3. **Export / backups** — Final Firestore export, RTDB export, and GCS bucket copies to durable storage the org owns.
4. **Billing and IAM** — Remove or downgrade billing linkage; remove human/service accounts from the old project when no longer needed.
5. **DNS / bookmarks** — Custom domains and internal links updated to the new hostname; keep minimal **redirect** Hosting on the old project only if the org requires a transition period.

---

## Troubleshooting (sandbox `adbe-gcp0819`)

### Login: “Could not verify lab access status. Try again in a moment.”

**Client flow:** `web/profile-viewer/aep-access-onboarding.js` calls `GET /api/lab/lab-access/status` with `Authorization: Bearer <Firebase ID token>` after Adobe email/password sign-in. The handler is `labLabAccessStatus` (`functions/labWorkspaceAuthService.js` → `getLabAccessStatusFromIdTokenRequest`). Any non-JSON response or `{ ok: false }` surfaces that error.

**Diagnose with curl** (invalid token should return JSON `400`, not HTML):

```bash
# Via Hosting (what the browser uses)
curl -sS -w "\nHTTP:%{http_code}\n" \
  "https://adbe-gcp0819.web.app/api/lab/lab-access/status" \
  -H "Authorization: Bearer invalid"

# Production reference (should be JSON 400)
curl -sS -w "\nHTTP:%{http_code}\n" \
  "https://aep-orchestration-lab.web.app/api/lab/lab-access/status" \
  -H "Authorization: Bearer invalid"
```

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| **404** HTML “Page not found” on `/api/*` | Hosting deployed with `firebase.json` (`us-central1` rewrites) or without API rewrites | Redeploy Hosting with sandbox config: `npm run deploy:sandbox:hosting` (or `node scripts/run-firebase-sandbox-deploy.mjs -- deploy --only hosting --config firebase.sandbox.json -P sandbox`). |
| **403** HTML “permission to get URL” on `/api/*` | Gen2 functions deployed but **no** `roles/run.invoker` for `allUsers` (browser + Hosting backend are unauthenticated at Cloud Run IAM). Adobe org blocks `allUsers` and `invoker-iam-disabled`. | See **Org policy and public invoke** below — **must** be fixed by a project/org admin; code deploy alone cannot unblock. |
| **401** HTML with `www-authenticate: Bearer invalid_token` when sending `Authorization: Bearer …` | Cloud Run IAM has `domain:adobe.com` on `roles/run.invoker` (misguided workaround). IAM treats the header as a **Google** identity token before the function runs. | Remove `domain:adobe.com` from Cloud Run invoker bindings on Gen2 services; still need `allUsers` (or org-approved public invoke) for anonymous browser traffic. |
| **400** JSON `Invalid or expired ID token` | Routing + IAM OK | Use a real Firebase ID token in the browser; check Auth project and `@adobe.com` gate / Firestore approval doc. |
| **500** after IAM fixed | Firestore `(default)` in **Datastore mode** on `adbe-gcp0819` | Admin SDK requires **Firestore Native**. This repo uses database **`aep-lab`** (`functions/.env.adbe-gcp0819` → `FIRESTORE_DATABASE_ID=aep-lab`). Create with `gcloud firestore databases create --database=aep-lab --location=us-east4 --type=firestore-native --project=adbe-gcp0819`. Seed approval: `node scripts/seed-sandbox-lab-access-approval.mjs apalmer@adobe.com`. |
| Login OK but “pending approval” | No `approved` doc in `labWorkspaceAccessApprovals` / user disabled | Approve via `GET /api/lab/workspace-auth/approve?uid=…&token=…` or create doc with `status: approved`. `@adobe.com` users with **no** doc and **not** disabled get `status: missing` and may continue onboarding. |
| **403/401 HTML** + “Could not verify lab access status” (older deploy) | Same IAM block; client used production Firebase `projectId` | Redeploy Hosting with `firebase-database-config.js` hostname sandbox defaults + `aep-access-onboarding.js` sandbox fallback (May 2026). On `adbe-gcp0819.web.app`, verified `@adobe.com` sign-in continues with `missing` or `approved` (`apalmer@adobe.com`) when the API is unreachable. |

### Org policy and public invoke (Adobe GCP)

Sandbox Gen2 functions use `invoker: 'public'` in code, but deploy **cannot** attach `allUsers:roles/run.invoker` when these org constraints apply:

- **Domain restricted sharing** (`constraints/iam.allowedPolicyMemberDomains`) — blocks `allUsers` / `allAuthenticatedUsers` on Cloud Run IAM.
- **Require Invoker IAM** (`constraints/run.managed.requireInvokerIam`) — blocks `--no-invoker-iam-check` / `run.googleapis.com/invoker-iam-disabled`.

**What we verified (May 2026):** `gcloud run services add-iam-policy-binding … --member=allUsers` fails with `permitted customer` / org policy. `gcloud run services update … --update-annotations=run.googleapis.com/invoker-iam-disabled=true` fails with `run.managed.requireInvokerIam`. Production `aep-orchestration-lab` returns JSON through Hosting; sandbox returned **404** until Hosting was redeployed with `firebase.sandbox.json`, then **401** until public invoke is allowed.

**Resolution (needs org / project admin):** Pick one approach for project `adbe-gcp0819`:

1. **Project override** on Domain restricted sharing to allow `allUsers` (or tag-based conditional allow for tagged Cloud Run services — [Google Cloud blog](https://cloud.google.com/blog/topics/developers-practitioners/how-create-public-cloud-run-services-when-domain-restricted-sharing-enforced)).
2. **Relax** `run.managed.requireInvokerIam` for this project, then redeploy or run `gcloud run services update SERVICE --no-invoker-iam-check` per service.
3. After policy allows it, grant invoker on all Gen2 services:

   ```bash
   node scripts/sandbox-grant-cloud-run-public-invoker.mjs
   ```

   Re-test Hosting:

   ```bash
   curl -sS "https://adbe-gcp0819.web.app/api/lab/lab-access/status" \
     -H "Authorization: Bearer invalid"
   # expect: {"ok":false,"error":"Invalid or expired ID token"} and HTTP 400
   ```

`domain:adobe.com` on `roles/run.invoker` does **not** fix browser traffic (requests are still unauthenticated at the Cloud Run IAM layer).

---

## Related

- Full migration steps (export/import, Auth, Snowflake VPC): [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md)
- Git + deploy order and Phase C: [CONTRIBUTING.md](../CONTRIBUTING.md)
