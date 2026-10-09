# Demo asset render origin

Uploaded customer HTML is rendered from the Firebase Hosting site
`aep-orchestration-lab-demo-render` (`https://aep-orchestration-lab-demo-render.web.app`),
not from the lab application's origin. The separate origin prevents demo scripts
from directly reading the lab page or its origin-scoped browser storage.

The lab API continues to require a signed-in Adobe user to mint a one-hour
render token. A token is bound to its owner, asset and exact version, and can
be revoked by that owner. The renderer accepts only a live token, sends the stored HTML with
a restrictive CSP `sandbox` policy, and does not enable CORS. The primary
Hosting site redirects the legacy `/api/demo-assets/render/:token` route to the
dedicated render origin so old links do not execute uploaded HTML on the lab
origin. The renderer Hosting target rewrites only `/render/**` to
`demoAssetsApi`; it does not publish library APIs.

`firebase.json` and `.firebaserc` define two Hosting targets:

- `app` → `aep-orchestration-lab` (`web/`)
- `demo-render` → `aep-orchestration-lab-demo-render` (`web/demo-render/`)

For a production release, deploy both Hosting targets from a clean `main` that
matches `origin/main`, after the change has passed PR validation and been
merged:

```sh
npx -y firebase-tools@latest deploy --only hosting:app,hosting:demo-render --project aep-orchestration-lab
```

Feature-branch previews must publish both sites to the same preview channel:

```sh
npm run deploy:preview -- <channel-name>
```

The library and Studio use the API's returned render URL without constructing
a same-origin fallback. Legacy URLs are redirected by Hosting. This lets
Hosting roll out before the separately released Cloud Function without
temporarily rendering uploaded HTML on the app origin.

If the lab later adopts a custom domain for the renderer, update the renderer
origin in `functions/demoAssetsService.js` and the redirect in `firebase.json`
together.

## Trashing and restoring uploaded assets

`DELETE /api/demo-assets/:id` moves an asset to the recoverable trash; it does
not remove the Firestore record, HTML versions or shared media. The active
library omits trashed entries. `GET /api/demo-assets?deleted=true` lists trash,
and `POST /api/demo-assets/:id/undelete` restores the asset and its stored
versions.

Render tokens cannot load an asset while it is in trash. Restoring an asset
does not clear any token's explicit revoked state. Owners can enumerate their
own links with `GET /api/demo-assets/:id/render-tokens` and revoke one with
`DELETE /api/demo-assets/:id/render-tokens/:tokenId`. The creation endpoint is
`POST /api/demo-assets/:id/render-token` with `{ "versionId": "..." }`; its
response includes the token id, URL and expiry. A token remains pinned to the
version it was created for.

Demo flows are retained when an asset is trashed. Their presenter shows the
missing-asset state, and the flow rehearsal check reports the blocked step.

## Uploading new versions

Uploading a file with the same or a similar filename offers a confirmation
before any new asset or version is saved. Matching ignores case, spaces,
hyphens, underscores and common suffixes such as `v2`, `_3` and `(1)`. Similar
wording can also suggest a match. Names are suggestions, never automatic merges:
choose the matching asset, **Save as a new version**, **Keep as a separate
asset**, or **Cancel upload**. Exact duplicate content still shows **Already in
library** instead of creating an unnecessary revision.

A confirmed new version keeps the existing library entry, classification and
flow references. The previous HTML and embedded media remain available in
**History** on the asset card. Each history entry shows its filename, date,
author and current/archived state, with **Preview**, **Present** and **Export**.
**Restore as current** copies an archived version forward into a new history
entry; neither the old version nor the replaced current version is deleted.
Flows pinned to a particular version keep using that version. Flows without a
version pin follow the current version. Newly minted preview links are pinned
to the selected version for their one-hour lifetime.

Version uploads use `POST /api/demo-assets/:id/versions` with `html`, `filename`,
optional `folderPath` and the confirmed `expectedVersionId`. Concurrent changes
return 409 rather than replacing a version the user has not seen. History
includes Studio edits and restores as well as uploads, and legacy original
uploads need no migration. Names on legacy history entries may be unavailable;
their HTML can still be previewed and restored.

This feature requires both Hosting and a named `functions:demoAssetsApi`
release after PR validation and merge. Do not overlap the named Functions
release with the automated production Hosting deployment.

## Library, Studio and flow API additions

Asset search uses `GET /api/demo-assets?limit=100&cursor=<opaque>&q=<text>`.
The response is `{ ok, assets, nextCursor, conversationTypes, user }`;
without query parameters the legacy active-only `{ ok, assets, ... }` response
is preserved. `GET /api/demo-assets/:id/versions?limit=50&cursor=<opaque>`
returns `{ ok, versions, nextCursor }`; without pagination parameters it keeps
the legacy version array.

Studio conversation lists and titles are scoped to the signed-in owner and
asset. List with `GET /api/demo-assets/:id/studio/conversations`, resume with
the existing `GET /api/demo-assets/:id/studio/conversations/:conversationId`,
and rename with `PATCH` to that conversation path and `{ "title": "..." }`.
Customer adaptation starts from a separate derived asset. It stores an
`adaptationBrief` containing customer, audience, objective and approved brand
notes, plus a deterministic source-name scan. Studio's rebrand checklist is
computed from the proposed HTML itself.

Flow step `versionId` is an optional pin. Every flow save also captures
`currentVersionAtSave` as the asset's current version id at that save, so
`GET /api/demo-assets/flows/:id/check` can distinguish a valid old pin from a
newer source version. The check reports missing assets/versions as errors and
changed-current-version snapshots as warnings. Flow presentation resolves an
unpinned step to a concrete version and returns that version id with the render
URL so the client can renew a long-running presentation without changing its
snapshot. Flow lists accept `limit` and `cursor`; legacy unpaged lists remain
available.

## Using the workspace

The Library groups assets by customer or conversation type. Preview and Adapt
are the primary card actions; More contains metadata, history, sharing and
activity. Select several assets to build a flow, add them to an existing flow,
or review their combined story using **Suggest with Gemini** in Demo Flows.
The suggestion uses bounded visible copy from the selected versions, not just
their filenames. Review the suggested order, omissions, transitions and notes
before accepting; Undo restores the previous editor state.

Adapt creates a separate customer copy with an audience, objective and approved
brand notes. The original is unchanged. Studio previews all AI edits before
applying them as a new immutable version. Automated adaptation checks are
heuristics, not approval of logos, brand requirements or factual claims. Saved
conversations are private to their owner.

Before presenting a saved flow, use **Rehearse / check**. Each step can follow
the current asset or pin an archived version. The presenter window keeps the
talk track, transition, timer and navigation separate from the demo content.

Run `node --test functions/test/demo*.test.cjs` for API and UI regression tests.
Run `npm run test:demo-workspace-e2e` for the Chromium workflow fixture (requires
the existing Playwright dependency and `npx playwright install chromium`).
It intercepts authentication and APIs locally; it never writes production
customer assets. These checks also run in the required Validate workflow.
