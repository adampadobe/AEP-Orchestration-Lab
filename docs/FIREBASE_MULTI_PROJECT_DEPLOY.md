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

Deploy Hosting + Functions to the **sandbox** project without changing your local `default`:

```bash
npx -y firebase-tools@latest deploy --only functions,hosting -P sandbox
```

Equivalent **explicit** project id (same outcome):

```bash
npx -y firebase-tools@latest deploy --only functions,hosting --project adbe-gcp0819
```

**Switch active project** for a shell session (optional; may rewrite the `default` entry in `.firebaserc` when you choose “make this the default project”—prefer **`-P`** in scripts and CI to avoid accidental commits):

```bash
firebase use sandbox
# or: firebase use production
```

From repo root, npm shortcuts mirror the above:

```bash
npm run deploy:sandbox
npm run deploy:production
```

---

## Pre-deploy checklist (new / non-production project)

Use this when first wiring **`adbe-gcp0819`** or any additional target.

1. **GCP / Firebase products** — Enable what this repo uses: Firebase Hosting, Functions (Cloud Run/Build), Firestore, Realtime Database, Storage, Auth, Secret Manager (Functions secrets), and any add-ons you rely on (e.g. Vertex if used). Match **region** expectations: Hosting rewrites assume **`us-central1`** for Functions (see `firebase.json` and `functions/index.js`).
2. **Secrets (per project)** — `defineSecret` values are **not** copied between projects. Recreate each secret in the target project (names must match `functions/index.js`). See [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md) § Cloud Functions secrets.
3. **`LAB_HOSTING_ORIGIN`** — For sandbox deploys where the public lab URL is the default Hosting hostname, set (deploy env or function config as you do today):

   `LAB_HOSTING_ORIGIN=https://adbe-gcp0819.web.app`

   (No trailing slash.) This keeps scheduled pre-warm and approval-link fallbacks aligned with the host users hit in the browser. See migration doc § `LAB_HOSTING_ORIGIN`.
4. **Web Firebase config** — Create/register the web app in the Firebase Console for the **target** project; for local smoke tests against the new host, inject `window.__FIREBASE_CONFIG__` or update the project-specific path documented in `web/profile-viewer/firebase-database-config.js` **without** committing secrets or long-lived keys into git.
5. **Data plane** — Firestore indexes (`firestore.indexes.json`), RTDB rules, Storage CORS, and VPC connector / Snowflake egress (if used) must exist in the **target** project per [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md).

Before shipping Hosting changes from `main`, still run **`npm run verify:profile-viewer-routes`** (and follow CONTRIBUTING Phase C: sync `origin/main` immediately before deploy).

---

## SC demo Sandbox — dedicated Cloud Functions runtime SA (`adbe-gcp0819`)

Some GCP projects **do not** have the default Compute Engine identity
(`PROJECT_NUMBER-compute@developer.gserviceaccount.com`). Firebase Gen2 then
errors when binding Secret Manager access to that missing principal.

**Pattern used here:** user-managed **`sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com`**
(display name *SC demo Sandbox (Cloud Functions runtime)*). `functions/index.js` calls
`setGlobalOptions({ serviceAccount })` when the deploy target is **`adbe-gcp0819`**
(detected from `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `FIREBASE_CONFIG.projectId`)
or when **`CF_RUNTIME_SERVICE_ACCOUNT`** is set. `npm run deploy:sandbox` still sets
the env var for clarity.

### IAM to apply once (project `adbe-gcp0819`)

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

3. **Let Cloud Build attach this SA** to revisions (replace `PROJECT_NUMBER` with
   `gcloud projects describe adbe-gcp0819 --format='value(projectNumber)'`):

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com \
     --project=adbe-gcp0819 \
     --member="serviceAccount:PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

4. **Snowflake / VPC** — functions using `vpcConnector: snowflake-egress` may need
   extra roles (e.g. `roles/compute.networkUser` on the right network). If those
   routes fail at **runtime**, see [SNOWFLAKE_INTEGRATION.md](./SNOWFLAKE_INTEGRATION.md)
   and adjust IAM with your network admin.

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

## Related

- Full migration steps (export/import, Auth, Snowflake VPC): [FIREBASE_PROJECT_MIGRATION.md](./FIREBASE_PROJECT_MIGRATION.md)
- Git + deploy order and Phase C: [CONTRIBUTING.md](../CONTRIBUTING.md)
