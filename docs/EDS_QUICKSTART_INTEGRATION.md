# EDS Quickstart integration

This document describes how the [`adampadobe/eds-quickstart`](https://github.com/adampadobe/eds-quickstart)
React SPA is vendored into AEP-Orchestration-Lab as a git submodule, how it
is built into static assets served by Firebase Hosting, and how upstream
changes from the colleague's repo (`vaneeghemk/eds-quickstart`) are validated
before being promoted into production.

## What it is

The colleague Kasper Van Eeghem maintains a private React + Adobe React
Spectrum SPA that lets a user spin up a new AEM Edge Delivery Services
(EDS / aem.live) site from a boilerplate template in seconds — picking a
GitHub repo name, content source (SharePoint / Google Drive / AEM Author),
template flavour (Boilerplate / Vanilla / Reference Demos 2.0), and brand
colours. The SPA does all of its work directly from the browser via the
GitHub Contents API and the aem.live admin API (`https://admin.hlx.page/...`).

Upstream is **`vaneeghemk/eds-quickstart`**, which is an Adobe I/O App Builder
project (extension type `dx/excshell/1`) deployed to Adobe I/O Runtime and
rendered inside the Experience Cloud Shell.

This lab vendors a **fork** at **`adampadobe/eds-quickstart`** so we can:

- add an extra wizard step that injects Adobe Launch (Tags) and/or Adobe Web
  SDK wiring into every newly-created EDS site's `head.html`, using the
  lab's existing `tagsReactorProxy` and `eventDatastreamsProxy` Cloud
  Functions ([functions/index.js](../functions/index.js));
- mirror the lab's light/dark theme on the React Spectrum chrome via a
  `MutationObserver` on the parent's `data-aep-theme` attribute;
- build the SPA with a plain `webpack` config (no `aio` CLI required) so
  any contributor can build it from a fresh clone;
- host it under `/profile-viewer/eds-quickstart/` on Firebase Hosting,
  inside an iframe embedded in `web/profile-viewer/eds-quickstart.html`.

## Architecture

```
vaneeghemk/eds-quickstart           (upstream, colleague — never push to it)
        |
        |  git fetch upstream → validate-upstream-YYYYMMDD branch
        v
adampadobe/eds-quickstart  (our fork, our `main` carries our customisations)
        |
        |  git submodule (pinned SHA, advanced manually)
        v
AEP-Orchestration-Lab/tools/eds-quickstart/   (source, NOT served by Firebase)
        |
        |  npm run build:eds-quickstart  →  webpack  →  rsync dist/
        v
AEP-Orchestration-Lab/web/profile-viewer/eds-quickstart/   (built static assets, committed)
        |
        |  served under /profile-viewer/eds-quickstart/index.html
        v
iframe in web/profile-viewer/eds-quickstart.html  (lab dashboard shell + sidebar)
```

The submodule lives **outside `web/`** at `tools/eds-quickstart/` so Firebase
Hosting deploys never carry the source files. Firebase only serves the
built static output we commit at `web/profile-viewer/eds-quickstart/`.

## First-time setup (already done — for reference)

These steps were performed once; you do **not** need to repeat them on a
fresh clone — `git clone --recurse-submodules` does the right thing.

```bash
# Fork the upstream repo into the adampadobe account
gh repo fork vaneeghemk/eds-quickstart --clone=false

# Add the submodule pointing at the fork
git submodule add -b main https://github.com/adampadobe/eds-quickstart.git tools/eds-quickstart

# Inside the submodule, add the upstream remote (read-only)
cd tools/eds-quickstart
git remote add upstream https://github.com/vaneeghemk/eds-quickstart.git
git remote set-url --push upstream "DISABLED-DO-NOT-PUSH-TO-UPSTREAM"
```

## Day-to-day: building locally

```bash
# From the repo root
npm run build:eds-quickstart
```

This script will:

1. Initialise the submodule if `tools/eds-quickstart/package.json` is
   missing (first time only).
2. `cd` into `tools/eds-quickstart/`.
3. `npm install` (idempotent — fast after the first run).
4. `npm run build:standalone` — runs the fork's webpack config
   ([tools/eds-quickstart/webpack.config.js](../tools/eds-quickstart/webpack.config.js))
   producing `tools/eds-quickstart/dist/`.
5. `rsync -a --delete --exclude='*.map' --exclude='*.LICENSE.txt' dist/`
   into `web/profile-viewer/eds-quickstart/`.

Output is two files: `index.html` (~1.2 KB) and
`static/js/main.<hash>.js` (~2.1 MB, mostly React Spectrum). Source maps
and LICENSE.txt are excluded from the lab repo to keep it slim.

## Day-to-day: running locally (smoke test before deploying)

```bash
# Ensure built assets exist
npm run build:eds-quickstart

# Serve the lab on localhost
npx -y firebase-tools@latest serve --only hosting --port 5050

# Open
# http://localhost:5050/profile-viewer/eds-quickstart.html
```

Smoke checklist:

- [ ] Page loads; iframe shows the EDS Quickstart UI inside the lab's
      dashboard shell with the Demos sidebar entry highlighted.
- [ ] Toggling the lab's light/dark theme flips the React Spectrum chrome
      inside the iframe in real time.
- [ ] Settings tab accepts a GitHub Personal Access Token with `repo`
      scope and a GitHub username; both persist in `localStorage`.
- [ ] Home tab shows the new **AEP data collection** section below the
      colour pickers, with `Inject Adobe Launch (Tags) script tag` and
      `Inject Adobe Web SDK (alloy.js)` switches.
- [ ] Toggling the Launch switch loads property names from
      `/api/tags/reactor?op=allProperties` (look for the network call in
      DevTools).
- [ ] Toggling the Web SDK switch loads datastream names from
      `/api/events/datastreams` and auto-fills IMS Org ID from the lab's
      Global values.

## Validating + promoting upstream changes (the important workflow)

When Kasper pushes new work to `vaneeghemk/eds-quickstart`, **do not**
auto-pull it into our `main`. Instead:

```bash
cd tools/eds-quickstart

# 1. Pull the latest upstream into a side branch
git fetch upstream
git checkout -b validate-upstream-$(date +%Y%m%d) upstream/main

# 2. Bring our customisations back in (resolve conflicts here)
git merge main

# 3. Push the side branch to our fork so others can review
git push origin "validate-upstream-$(date +%Y%m%d)"

# 4. Build + smoke test locally
cd ../..
npm run build:eds-quickstart
npx -y firebase-tools@latest serve --only hosting --port 5050
# Walk through the Smoke checklist above.

# 5a. If GREEN → promote to our fork's main
cd tools/eds-quickstart
git checkout main
git merge "validate-upstream-$(date +%Y%m%d)"
git push origin main

# 5b. Bump the lab repo's submodule pointer
cd ../..
git add tools/eds-quickstart
git commit -m "bump eds-quickstart submodule (upstream YYYY-MM-DD validated)"
git push origin main

# 5c. Deploy
npm run verify:profile-viewer-routes
npx -y firebase-tools@latest deploy --only hosting

# 6. If RED → leave main alone
# Production stays pinned at the previous SHA. Open an issue, fix on the
# validate-upstream branch, repeat steps 4–5.
```

**The lab repo's submodule pointer in `.gitmodules` and the parent commit's
tree object pin a specific submodule SHA — production never moves forward
until you explicitly bump it.** Even if upstream pushes a breaking change
or our fork's `main` advances, `firebase deploy` only ships what is
committed under `web/profile-viewer/eds-quickstart/` (which the build
script regenerates from the *currently checked-out* submodule SHA).

## What our fork's `main` adds vs. upstream

These customisations live ONLY on `adampadobe/eds-quickstart` `main`. They
are intentionally NOT pushed back to `vaneeghemk/eds-quickstart`; the
`upstream` push URL in the submodule is set to `DISABLED-DO-NOT-PUSH-TO-UPSTREAM`
to make accidental pushes impossible.

| Path                                                                          | Purpose                                                                                                                                |
|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `webpack.config.js` + `webpack/template.html`                                 | Standalone webpack 5 build that doesn't require the Adobe `aio` CLI; coexists with upstream's `aio app build`.                         |
| `package.json` (devDeps + `build:standalone` script)                          | webpack, babel-loader, html-webpack-plugin, css/style loaders, preset-react, transform-runtime.                                        |
| `src/dx-excshell-1/web-src/src/aep-bridge.js`                                 | Reads IMS Org / Datastream / Launch property defaults from `window.parent.localStorage` when iframe-embedded under `/profile-viewer/`. |
| `src/dx-excshell-1/web-src/src/components/App.js`                             | Wraps `<Provider>` with `colorScheme` driven by a `MutationObserver` on the parent's `data-aep-theme`.                                 |
| `src/dx-excshell-1/web-src/src/components/Home.js`                            | New wizard step ("Wire AEP (Launch + Web SDK)") between branding and done that PUTs `head.html` of the new EDS repo.                   |
| `src/dx-excshell-1/web-src/src/snippets/launch-tag.tpl`, `web-sdk.tpl`        | The exact `<script>` blocks injected into the new site's `head.html`.                                                                  |

## What the lab repo adds for hosting

| Path                                                                | Purpose                                                                                                                                       |
|---------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| [.gitmodules](../.gitmodules)                                       | Submodule entry pointing at `adampadobe/eds-quickstart` `main`.                                                                               |
| [tools/eds-quickstart/](../tools/eds-quickstart/)                   | The submodule itself (source only).                                                                                                           |
| [package.json](../package.json) (`build:eds-quickstart` script)     | One-shot build: webpack → rsync into `web/profile-viewer/eds-quickstart/`.                                                                    |
| [web/profile-viewer/eds-quickstart.html](../web/profile-viewer/eds-quickstart.html) | Lab dashboard shell wrapper that iframes the SPA at `eds-quickstart/index.html` and forwards theme via the standard early-paint IIFE.        |
| `web/profile-viewer/eds-quickstart/`                                | Built static assets (`index.html` + `static/js/main.<hash>.js`). Committed so Firebase deploy never depends on the submodule being initialised. |
| [web/profile-viewer/aep-lab-nav.js](../web/profile-viewer/aep-lab-nav.js) | New entry under the **Demos** group: `EDS Demo Creator (in development)` → `eds-quickstart.html`.                                        |
| [scripts/verify-profile-viewer-routes.mjs](../scripts/verify-profile-viewer-routes.mjs) | Asserts both `eds-quickstart.html` and `eds-quickstart/index.html` exist before deploy and that the nav entry is wired.            |

## Required runtime IMS / sandbox configuration

The wizard's AEP wiring step calls existing lab Cloud Functions:

- `/api/tags/reactor?op=allProperties` — lists Launch (Tags) properties.
- `/api/tags/reactor?op=propertyEnvironments&propertyId=...` — resolves the
  prod embed URL for the chosen property.
- `/api/events/datastreams` — lists datastreams for the chosen IMS Org /
  sandbox.

These resolve their IMS token via the shared `aepHeaders()` helper in
`functions/aepHeaders.js`. No new secrets or environment variables are
needed; whatever credentials the lab already uses for the Profile Viewer
will also power the AEP wiring step.

The wizard auto-fills the **IMS Org** field from the lab's Global values
(`localStorage.aepImsOrg`) when the SPA detects it is iframed under
`/profile-viewer/eds-quickstart.html`. The user can override before
submitting.

## SharePoint and Google Drive base documents

This section is for **document-based** authoring (SharePoint or Google Drive)
after you run **Create project** in the EDS Demo Creator.

### What the wizard actually provisions

The SPA runs entirely in the browser. For a new site it:

1. **Creates a private GitHub repository** from a template via GitHub's
   template API (`POST .../generate`):
   - **AEM Boilerplate (Enhanced)** and **(Vanilla)** →
     [`vaneeghemk/aem-boilerplate-xwalk`](https://github.com/vaneeghemk/aem-boilerplate-xwalk)
     (same family as Adobe's public
     [`adobe-rnd/aem-boilerplate-xwalk`](https://github.com/adobe-rnd/aem-boilerplate-xwalk)).
   - **Reference Demos 2.0** → `AEMXSC/RefDemoEDS` (AEM-based flow; different
     checklist in the UI).
2. **Commits Git-side changes** through the GitHub Contents API, for example
   `fstab.yaml` (mounts your SharePoint folder URL or Google Drive folder URL),
   `README.md`, `styles/styles.css` (branding), and optionally `head.html`
   (AEP Launch / Web SDK when enabled in the lab iframe).

It does **not** call Microsoft Graph, Google Drive file APIs, or any other
backend to **create, copy, or upload Word/Google documents** into your
content folder. **Auto-upload of starter `.docx` / Google Docs into SharePoint
is out of scope** for this lab tool today.

### Official guidance (document repositories)

Adobe documents how to point a project at SharePoint or Drive and how
authors work with documents:

- [Set up a content repository for Edge Delivery Services](https://experienceleague.adobe.com/en/docs/experience-manager-learn/sites/edge-delivery-services/developing/content-repository)
  (Experience League — SharePoint and Google Drive tabs, including the
  recommendation to start from **index**, **nav**, and **footer** style pages
  when copying sample patterns into your own folder).
- [Where to author your site](https://www.aem.live/docs/authoring-guide) and
  linked setup guides (for example SharePoint customer setup under
  [aem.live docs](https://www.aem.live/docs/authoring)).

Adobe does **not** publish a single stable “official starter Word zip” for every
tenant; authors follow the tutorials above and build documents in their own
SharePoint or Drive folder. The lab therefore ships a **small stub ZIP** (not an
Adobe template) you can copy quickly, described below.

Boilerplate **GitHub** templates ship **site code** (blocks, styles, scripts,
`fstab.yaml`). They are **not** a zip of production Word files for your tenant.
Your **SharePoint** or **Drive** folder — the URL you paste into the wizard —
starts empty unless your org already placed files there.

### Practical workflow (manual)

1. Complete the wizard through **Create project** and **Step 2** (install
   **AEM Code Sync** on the new repo) so `*.aem.page` / `*.aem.live` can read
   Git + your mount.
2. In **SharePoint** (or **Drive**), open the **same folder URL** you put in
   **Document Source URL** and add baseline documents authors will preview and
   publish with **Sidekick** (for example pages named **`index`**, **`nav`**,
   and **`footer`** — exact naming follows your project's content conventions
   and Adobe's document-authoring guides).
3. Use Adobe's tutorials as the source of truth for structure (sections,
   blocks in tables, etc.). If you are mirroring the Experience League pattern
   for Google Drive (copy sample **index** / **nav** / **footer** into your own
   folder), do the equivalent in SharePoint: create Word documents with the
   same roles in **your** library, grant the Edge Delivery technical user
   access per your IT policy (see the SharePoint tab in the content-repository
   tutorial above), then **Preview** and **Publish** from Sidekick.

### Download starter documents (ZIP) in the UI

After a successful run, **Step N — Author and publish content** includes a
primary button **Download starter documents (ZIP)**. It downloads (same origin
as the Profile Viewer):

`/profile-viewer/assets/eds-doc-starter.zip`

The archive contains **minimal lab-authored stubs** (not Adobe copyrighted
templates):

- `README.md` — links to Experience League / aem.live and explains replacement
  with real patterns
- `index.docx`, `nav.docx`, `footer.docx` — tiny valid OOXML files with stub body
  text so you can upload or copy into SharePoint / Drive under the usual EDS
  document names, then **replace** structure and content using Adobe’s guides.

To regenerate the ZIP from source in this repo:

`python3 scripts/build_eds_doc_starter_zip.py`

### "Starter content pack (template repo)" in the UI

The same step includes a secondary button **Starter content pack (template repo)**.
It opens
[`https://github.com/vaneeghemk/aem-boilerplate-xwalk`](https://github.com/vaneeghemk/aem-boilerplate-xwalk),
i.e. the **same GitHub template** the tool uses for **code** generation — so
you can browse **blocks**, **styles**, **scripts**, `fstab.yaml` defaults, etc.
There is **no** `index.docx` (or similar) in that repo to drag into SharePoint;
use it as a **code** reference and rely on Adobe's document-authoring docs for
**page** documents in your folder (or start from the lab stub ZIP above, then
replace with Adobe-guided content).

## Known gotchas

- **GitHub PAT scope.** The wizard requires a Classic Personal Access Token
  with the `repo` scope (matches the upstream Settings tab UX). Fine-grained
  tokens are rejected by the Adobe Code Sync app workflow that EDS sites
  rely on, so this is intentional.
- **Build size.** The bundled SPA is ~2.1 MB unminified-equivalent (most of
  it is `@adobe/react-spectrum`). Source maps add ~6 MB so the rsync step
  excludes `*.map` to keep the lab repo slim.
- **`exc-runtime.js` IIFE.** Upstream's `index.js` first attempts to bootstrap
  inside the Adobe Experience Cloud Shell (`exc-runtime.js` throws if not
  iframed by a real `_mr` URL parameter), then falls back to `bootstrapRaw()`
  for standalone use. When the SPA is iframe-embedded under our lab, the
  excshell bootstrap throws (no `_mr` param), the catch fires, and
  `bootstrapRaw()` runs — which is the desired path.
- **Submodule reset risk.** Plain `git submodule update` will reset the
  submodule to whatever SHA is pinned by the parent commit. If you're
  actively iterating on the fork, run `git pull origin main` from inside
  `tools/eds-quickstart/` instead. The build script
  (`build:eds-quickstart`) only runs `git submodule update --init` if
  `tools/eds-quickstart/package.json` is missing, so it does **not** clobber
  in-progress work.

## Related docs

- [CONTRIBUTING.md](../CONTRIBUTING.md) — section **EDS Quickstart submodule**.
- [CLAUDE.md](../CLAUDE.md) — Commands block lists `npm run build:eds-quickstart`.
- [docs/FIREBASE_STANDALONE_DEPLOY.md](FIREBASE_STANDALONE_DEPLOY.md) — full deploy walkthrough.
