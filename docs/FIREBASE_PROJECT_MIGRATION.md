# Firebase project migration (AEP Orchestration Lab)

This document supports cloning the lab to a **new Firebase / GCP project** (disaster recovery, org split, or greenfield duplicate). It complements repo-specific code paths that now prefer **environment-derived** Hosting origins and **project-scoped** client URLs (see inventory in *Repo-specific findings*).

**Prerequisites**

- Node.js **22** (see `.nvmrc`) and `npm` 10+.
- `gcloud` and `npx -y firebase-tools@latest` authenticated to the org that will own the target project.
- Adobe IMS credentials and AEP sandbox access re-validated for the new deployment (secrets are not copied by Firebase — see below).
- Read access to **source** project for export; **Editor** (or equivalent) on **target** for import, Hosting deploy, and Functions deploy.

**Naming**

- **`SOURCE_PROJECT_ID`** — current production Firebase project (today: `aep-orchestration-lab`).
- **`TARGET_PROJECT_ID`** — new Firebase/GCP project id.

---

## 1. Create target Firebase project (CLI outline)

```bash
# Example: create project in GCP then attach Firebase (Console is fine too)
gcloud projects create TARGET_PROJECT_ID --name="AEP Orchestration Lab (clone)"
gcloud billing projects link TARGET_PROJECT_ID --billing-account=BILLING_ACCOUNT_ID

firebase projects:addfirebase TARGET_PROJECT_ID
firebase use TARGET_PROJECT_ID
```

Update **`.firebaserc`** (or use `firebase use`) so local deploys target `TARGET_PROJECT_ID`. Do **not** commit real billing IDs or secrets.

---

## 2. Firestore — export / import

Firestore has no one-click “project copy”. Typical path:

1. **Export** from source to a GCS bucket in (or accessible to) the source project:

   ```bash
   gcloud firestore export "gs://SOURCE_BUCKET/firestore-export" --project=SOURCE_PROJECT_ID
   ```

2. **Copy** the export prefix to a bucket the target project can read (same-region GCS **rsync** is common):

   ```bash
   gsutil -m rsync -r "gs://SOURCE_BUCKET/firestore-export" "gs://TARGET_BUCKET/firestore-export"
   ```

3. **Import** into the target project (Firestore API; follow current Google docs for import URI and IAM):

   ```bash
   gcloud firestore import "gs://TARGET_BUCKET/firestore-export" --project=TARGET_PROJECT_ID
   ```

**Caveats:** Import overwrites collection data in the target database for imported paths; plan a maintenance window. Indexes in `firestore.indexes.json` deploy with `firebase deploy` after the project is wired.

---

## 3. Realtime Database

Export/import via [Firebase Realtime Database export](https://firebase.google.com/docs/database/backups) or JSON lift-and-shift for small trees. Re-point **`databaseURL`** in the Web SDK config (`web/profile-viewer/firebase-database-config.js` or injected `window.__FIREBASE_CONFIG__`) to the new default RTDB hostname.

---

## 4. Authentication

Firebase Auth does **not** move with Hosting/Functions. Options:

- **Export users** (Admin SDK or Identity Platform flows where applicable) and **import** into the target; password hashes require compatible providers and careful handling.
- For internal labs: often acceptable to **reset** test users and re-invite; document that cutover loses existing Auth UIDs unless you migrate.

Anonymous auth and custom claims must be re-tested on the target project.

---

## 5. Cloud Storage (Hosting-adjacent assets, brand scrapes, CDN)

- Re-create buckets with the same **logical** layout where code expects fixed names (e.g. brand scraper bucket defaults — see `BRAND_SCRAPER_BUCKET` / `functions/brandScrapeStore.js`).
- Use **`gsutil -m rsync`** between buckets for bulk asset copy; fix **CORS** and **IAM** on the target bucket to match policy.

---

## 6. Cloud Functions — secrets (`defineSecret`)

Secrets are **per project**. Recreate each secret in **`TARGET_PROJECT_ID`** with the same **name** as in `functions/index.js`:

| Secret name |
|---------------|
| `ADOBE_CLIENT_ID` |
| `ADOBE_CLIENT_SECRET` |
| `ADOBE_IMS_ORG` |
| `ADOBE_SCOPES` |
| `EASTER_EGG_MAILGUN_API_KEY` |
| `EASTER_EGG_MAILGUN_DOMAIN` |
| `CONTEXT7_API_KEY` |

```bash
firebase use TARGET_PROJECT_ID
firebase functions:secrets:set ADOBE_CLIENT_ID
# …repeat for each row; paste values only at the interactive prompt
```

Deploy Functions after secrets exist. Non-secret env (e.g. `ADOBE_SANDBOX_NAME`, `LAB_HOSTING_ORIGIN`) can be set in the Firebase Console or your CI deploy environment.

---

## 7. Hosting rewrites and region

All HTTPS rewrites in `firebase.json` use **`us-central1`**. After migration, **region and `functionId` names must still match** exports in `functions/index.js` or Hosting will return 404 from rewrites.

Browser code should call **`/api/...`** for short requests; long-running Vertex / publish / brand-scraper paths intentionally use **direct Gen2 URLs** derived from `window.firebaseDatabaseConfig.projectId` (see `web/profile-viewer/brand-scraper.js` and related scripts) or optional `window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__`.

---

## 8. Server-side Hosting origin (`LAB_HOSTING_ORIGIN`)

Scheduled **schema viewer CDN pre-warm** (`exports.schemaViewerCacheWarm` in `functions/index.js`) `fetch()`es:

- `…/api/schema-viewer/overview-stats|tenant-schemas|datasets|audiences?sandbox=…`

Resolution order at runtime:

1. `LAB_HOSTING_ORIGIN` or `HOSTING_ORIGIN` (explicit absolute URL, no trailing slash).
2. Else `https://${GCLOUD_PROJECT}.web.app` when `GCLOUD_PROJECT` / `GCP_PROJECT` is set (normal in Cloud Functions).
3. Else legacy default `https://aep-orchestration-lab.web.app`.

**Lab approval emails** (`LAB_APPROVAL_BASE_URL` on lab workspace auth functions) use the same default chain at **deploy** time via `labHostingOriginForFunctionConfig()` — set `LAB_HOSTING_ORIGIN` or `LAB_APPROVAL_BASE_URL` in the deploy environment when the public URL is not `{projectId}.web.app` (e.g. custom domain).

---

## 9. VPC connector (Snowflake egress)

Snowflake-related functions use **`vpcConnector: 'snowflake-egress'`** and **`vpcConnectorEgressSettings: 'ALL_TRAFFIC'`** in `functions/index.js` (`SNOWFLAKE_FN_OPTS`). In **`TARGET_PROJECT_ID`** you must create a **Serverless VPC Access connector** with the same **connector name** (or change the code + redeploy to the new name) and the same Cloud NAT / static IP story documented in `docs/SNOWFLAKE_INTEGRATION.md`.

---

## 10. Hosting preview channel (validation)

Before switching DNS or users:

```bash
firebase hosting:channel:deploy preview-migration --expires 7d --project TARGET_PROJECT_ID
```

Smoke-test: Profile Viewer home, one `/api/` call, long-running flows that use direct `cloudfunctions.net` URLs, and **scheduled** warm if you temporarily enable the schedule on target.

---

## 11. Cutover (high level)

1. Freeze writes on source (optional but reduces drift).
2. Export Firestore / RTDB / GCS; import into target.
3. Recreate secrets; set `LAB_HOSTING_ORIGIN` if not using default `*.web.app`.
4. Deploy Hosting + Functions to target; run `npm run verify:profile-viewer-routes` from CI locally before merging.
5. Update **Web app** config in Console; align `firebase-database-config.js` or inject `window.__FIREBASE_CONFIG__`.
6. Point users (or reverse proxy) to the new Hosting URL.

---

## 12. Rollback

- Keep **source** project Hosting + Functions deployed until the target is verified.
- If using custom domain: revert DNS to source.
- Firestore rollback generally means **restore from an export** taken before cutover — plan exports accordingly.

---

## Repo-specific findings (inventory)

Hardcoded **`aep-orchestration-lab`** / **`aep-orchestration-lab.web.app`** still appear in **demo fixtures**, **email HTML absolute image URLs**, **JSON style packs**, **docs**, **CONTRIBUTING**, and **scripts** (`scripts/deploy-status.mjs`, etc.). Those are mostly **content or documentation** references; update when the canonical public URL changes.

**Updated for migration-safe runtime behaviour**

- `functions/index.js` — `LAB_APPROVAL_BASE_URL` defaults; `schemaViewerCacheWarm` origin.
- `functions/labWorkspaceAuthService.js` — approval link fallback origin.
- `functions/brandScraperService.js` — `User-Agent` public URL fragment.
- `web/profile-viewer/{brand-scraper,client-journey-asset,client-journey-asset-v2,demo-use-case-asset,content-decision-live-edge-ui,image-hosting}.js` — Cloud Functions base URL resolution.
- `web/profile-viewer/firebase-database-config.js` — optional `window.__FIREBASE_CONFIG__` overlay (see file header).

After editing under `web/profile-viewer/`, run **`npm run sync-profile-viewer-ui`** so the Express mirror stays aligned.

---

## Remaining hardcoded URLs (grep sweep)

Use these searches when validating a **new** public hostname or project id. Treat hits as **content or docs** unless they are in the runtime-resolution files listed under *Repo-specific findings* above.

**Project id and default Hosting host**

```bash
rg -n 'aep-orchestration-lab' --glob '!**/node_modules/**' --glob '!**/.git/**'
```

**Explicit `*.web.app` / `*.firebaseapp.com` lab URLs**

```bash
rg -n 'aep-orchestration-lab\.(web\.app|firebaseapp\.com)' --glob '!**/node_modules/**'
rg -n 'https://[a-z0-9-]+\.(web\.app|firebaseapp\.com)' web/profile-viewer functions scripts docs
```

**Long Gen2 / `cloudfunctions.net` URLs** (should mostly be constructed from config; residual string hits are worth reviewing)

```bash
rg -n 'cloudfunctions\.net' web/profile-viewer functions
```

**High-churn fixture areas** (often intentional demo absolutes): `web/profile-viewer/**/*.html`, email templates under `web/profile-viewer/**/`, JSON style packs, `scripts/deploy-status.mjs`, and root `CONTRIBUTING.md` / `docs/`.
