# Image hosting bucket — `aep-orchestration-lab-brand-scrapes`

This bucket holds two kinds of content with different lifecycles:

| Prefix | Contents | Retention |
| --- | --- | --- |
| `scrapes/<sandbox>/<scrapeId>/record.json` and `…/versions/*.json` | Brand-scraper JSON payloads | Live objects use **GCS `customTime`** with lifecycle **14 days since `customTime`** (reset on each **Extend** in Brand scraper). Noncurrent versions deleted after 7 days. |
| `scrape-cache-images/<sandbox>/<scrapeId>/…` | Classified crawl images (Gemini vision step) | Live versions deleted after **3 days** (not extended — publish to Image hosting for long-lived URLs). |
| `scrapes/…/images/…` | **Legacy** classified image path (older uploads) | Purged by scheduled function after ~3 days; new uploads use `scrape-cache-images/`. |
| `<sandbox>/library/**` | Curated per-sandbox assets served at `/cdn/<sandbox>/<path>` | **Never expires.** Only deleted by explicit user actions (Delete button, ZIP restore with replace, or in-place card replacement). |
| `<sandbox>/library_backups/**` | Legacy/reserved public backup prefix; not used for customer packages | Never expires. Not private. |

## Cloud customer packages

Image Hosting's **Cloud customer packages** panel and `/mcp/demo-prep` use the same authenticated `/api/lab/demo-assets` coordinator. They preserve exact `/cdn/<sandbox>/<path>` URLs; no folder rename or local ZIP is required. On first use, inspect and explicitly classify every visible file as customer-specific or shared. A saved package covers all selected paths, not just the five legacy logo/hero/mobile slots. Empty-folder markers and hidden bookkeeping are retained in place, not customer assets.

**Save customer** previews a named snapshot without changing live files or RTDB. **Prepare new customer** previews staged replacements (including new paths) and branding. **Preview restore** restores a saved complete revision and removes customer paths absent from it, never shared paths. Each switch first saves the outgoing files and branding. Confirm the outgoing name when unknown or disputed; review before/after previews, deletions and configuration before applying. Manual replacements retain unreplaced customer files, explicitly shown as **keep** in the preview.

Snapshots are immutable, scoped by principal/workspace/sandbox and stored in the **private** Demo Asset Library bucket `aep-orchestration-lab-demo-assets`, or `LAB_DEMO_ASSET_BACKUP_BUCKET`. Both legacy image revisions and customer packages use this same resolver. The project's advertised default Firebase Storage bucket does not exist and is not used:

| Prefix | Contents | Retention |
| --- | --- | --- |
| `demo-customer-backups/<scope>/<revision>/<exact-path>` | Complete, checksum-verified customer snapshots | Permanent; no automatic deletion |
| `demo-customer-staging/<scope>/…` | Upload and preview bytes | Previews/stage IDs expire after 15 minutes; daily `labDemoCustomerStagingCleanup` deletes blobs older than 24 hours |

**Deployment prerequisite:** verify this backup bucket has no public IAM binding and no client rule granting reads of these prefixes. The coordinator rejects using the public Image Hosting bucket as its backup bucket. Cache-Control is not an access-control mechanism. Signed image previews expire; never put them into email templates or RTDB. Firestore `labDemoCustomerScopes` (revisions/preflights/staging), `labDemoCustomerOperations` and `labDemoCustomerLocks` hold server-only metadata and recovery journals. Expired Firestore preview metadata is retained; blob cleanup does not delete saved revisions.

The nine snapshotted fields are `CoreDemoData.{name,shortName,slogan,url,customerLogo}`, `StaffPortal.Colour`, `CallCentre.industryId`, and `ExpAccelerator.{displayNameOverride,opportunityIndustry}`. Protected workspace ownership, credentials, profile IDs, endpoints and other sections are never included. New-customer preparation requires explicit keep/replace/clear for every existing nonempty branding field, so stale brand text is not silently carried over. A backup label does not rewrite the RTDB name; review both values if they disagree.

Limits: 200 visible library files / 100 MiB total; each staged PNG/JPEG/WebP/GIF/AVIF is at most 8 MiB, 40 million decoded pixels and 200 frames. Animation/original bytes are preserved. The target extension must match the actual format; convert explicitly if necessary. SVG uploads are not supported by the staging tool, but existing SVGs are backed up and restored unchanged. Chat transfer requires a client able to pass attachment bytes as base64; the remote MCP cannot read a local path.

Mutations require a verified lab principal and owned workspace; public image reads remain anonymous. Shared locks cover package operations, legacy Image Hosting mutations, MCP config writes and the Portal config-save route. RTDB compare-and-set and Storage generation preconditions reject stale changes. File publication is **not globally atomic**: downstream readers can briefly see a mixed set while files are replaced. Failures trigger rollback from the durable outgoing snapshot; ambiguous timeouts must be checked with `lab_demo_customer_operation`, not retried automatically. Explicit recovery has a five-minute safety delay and refuses to overwrite unknown external edits. Production applies verify Storage hashes, RTDB and public CDN bytes/deletions. A historical success may no longer be active: check `verified` / `isCurrentlyActive`. Email image proxies can still cache earlier images.

ZIP download/restore remains a separate, image-only compatibility workflow, not a customer package or branding restore. It now fails on partial restore errors, but is not transactionally recoverable; prefer cloud packages.

## Bucket settings

- **Uniform bucket-level access**: enabled (locked).
- **Public read**: `allUsers:objectViewer` IAM binding so
  `https://storage.googleapis.com/<bucket>/<path>` and the
  `/cdn/**` function proxy both resolve without signed URLs.
- **Object versioning**: enabled. Overwriting or deleting an object
  keeps the previous bytes as a noncurrent version, retained per the
  lifecycle rule below. This gives point-in-time rollback for library
  content and protects against accidental replacement via the
  drag-drop UX.

## Lifecycle JSON

See repo file `docs/image-hosting-lifecycle.json` (scrape-cache-images 3d; scrapes JSON `daysSinceCustomTime` 14d; library rules unchanged).

**Rule 3 explained.** `numNewerVersions: 2` deletes any noncurrent
version that has 2+ newer versions of the same object. In practice
that means every object is allowed **one noncurrent version plus the
current one** — i.e. max 2 generations on disk at any time. Replace a
`logo.png` and yesterday's bytes are retained; replace it again
tomorrow and the oldest copy is collected.

## Reproducing the config

```bash
gsutil uniformbucketlevelaccess set on gs://aep-orchestration-lab-brand-scrapes
gsutil iam ch allUsers:objectViewer gs://aep-orchestration-lab-brand-scrapes
gsutil versioning set on gs://aep-orchestration-lab-brand-scrapes
gsutil lifecycle set ./docs/image-hosting-lifecycle.json \
  gs://aep-orchestration-lab-brand-scrapes
```

## Tuning the retained version count

Raise `numNewerVersions` if you want more rollback history (e.g. `3`
keeps two previous versions per object). Trade-off is storage cost —
with logo-sized assets (a few hundred KB each) even `5` is trivial.

## Inspecting versions

```bash
# All generations of a specific object:
gsutil ls -a gs://aep-orchestration-lab-brand-scrapes/apalmer/library/logo/logo.png

# Restore a specific previous generation to current:
gsutil cp "gs://…/logo.png#<generation>" gs://…/logo.png
```
