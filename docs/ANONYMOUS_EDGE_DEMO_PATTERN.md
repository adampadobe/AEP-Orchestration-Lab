# Anonymous Edge identity pattern (Web SDK + Demo Website `_demoemea`)

Use this when a **Profile Viewer lab demo** injects **Adobe Tags / Web SDK (Alloy)** and streams experience events to a **Demo Website–style** dataset (tenant key **`_demoemea`**) backed by an Edge datastream.

## What “anonymous” means here

- The browser has an **ECID** (Experience Cloud ID) from the Web SDK / Identity Service.
- There is **no** logged-in email (or you have not yet sent an identity-stitch event).
- **Unified Profile** still creates or updates a profile keyed by **ECID** when profile-enabled datasets ingest valid events.

## Schema and ingestion constraints

For many Demo Website global schemas, streaming validation requires **both**:

1. **`identityMap.ECID`** — Alloy attaches this automatically on `sendEvent` when an ECID exists.
2. **`_demoemea.identification.core.ecid`** — the **same** ECID string must appear under the tenant object. If `core` is present but **empty**, ingestion fails with **DCVS-1106-400** (`required key [ecid] not found` under `#/_demoemea/identification/core`). This showed up clearly in **failed batch export** NDJSON from `GET /data/foundation/export/batches/{id}/failed`.

Do **not** rely on an empty `_demoemea.identification.core: {}` shell alone for those datasets.

## Reference implementation (this repo)

Canonical logic lives in **`web/profile-viewer/demo-tags-injection.js`** (shared **`DemoTagsInjection`**):

1. Load Launch → wait for **`window.alloy`**.
2. **`getIdentity`** until a digit ECID is returned (retries with short backoff).
3. Send **one** experience event, e.g. **`web.webPageDetails.pageViews`**, whose XDM includes:
   - standard **`web.webPageDetails`** (name + URL),
   - **`_demoemea.identification.core.ecid`** set to the **same** normalized ECID string returned by `getIdentity`.

4. **Profile drawer “Last 5 events”:** after a successful sync, `DemoTagsInjection` also schedules **`DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid')`** at **2.5s** and **8s** so UPS lag does not leave the drawer empty.

Optional: use a distinct **`webPageDetails.name`** suffix (e.g. `· AEP lab (anonymous ECID)`) so Data Explorer / queries can spot lab traffic.

## Demos with an iframe “site” + parent shell

If the parent page **POSTs** journey events (e.g. via **`/api/events/generator`**) using **`#infoEcid`** from the **parent** document, **do not** inject the same Launch property into a **cross-origin or third-party–cookie** iframe unless you intentionally want a **second** ECID. Prefer **`iframeIds: []`** in **`DemoTagsInjection.init`** so Alloy runs only on the parent and matches the generator’s ECID. (Premier Inn demo uses this pattern.)

## Identity stitching (known profile)

After an email (or other) profile lookup, a **separate** `sendEvent` with **`identityMap`** (e.g. ECID primary + email secondary) may be used for stitching — keep that event type and payload distinct from the anonymous page-view pattern above.

## UPINGT-030075 (multiple identities at highest namespace priority)

If ingestion fails with **UPINGT-030075**, treat it as an **identity graph / namespace priority** issue: duplicate or conflicting primaries, org **Identity settings**, or Launch rules adding extra identities. Fixing **DCVS** (core `ecid`) is orthogonal; resolve UPINGT with Identity configuration or payload review, not by omitting `core.ecid` when the schema requires it.

## How to validate an anonymous profile (lab hosting)

After deploying, confirm the ECID exists in UPS using the same proxy the Profile Viewer uses:

```text
GET https://aep-orchestration-lab.web.app/api/profile/table?namespace=ecid&identifier={ECID}&sandbox={technicalSandboxName}
```

Omit `sandbox` to use the function default (`ADOBE_SANDBOX_NAME` at deploy, often `apalmer`).

**Example (validated in lab):** ECID **`03976612467829823963241934423837679452`** returned **`found: true`**, with `entityId` and `lastModified` populated — anonymous profile materialized from Edge + `_demoemea` traffic.

## Event Tool (`event-tool.html`) automated schema

The Profile Viewer **Event Tool** “Create schema” action (Cloud Function `eventInfraService`) creates an **ExperienceEvent** schema, attaches **Profile Core v2** when that field group exists in the sandbox, and adds **non-primary** identity descriptors for **ECID** and **Email** on **`_{tenant}.identification.core.*`**. You still enable **Profile** in the AEP UI with **alternate primary identity** and send **`identityMap`** on each Edge payload (this doc).

## Related

- **Event generator** demos (Navigator CTAs) use a **different** tenant key (e.g. **`_demosystem5`**) via **`POST /api/events/generator`** — same “anonymous if only ECID” idea, different transport than Web SDK `sendEvent`.
- **Failed batch NDJSON:** use **`POST /api/aep`** with **`platform_base_url`** for regional hosts (e.g. `https://platform-nld2.adobe.io`) — see `functions/index.js` **`aepProxy`**.
