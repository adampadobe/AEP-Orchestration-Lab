# Deploy: WB World & SeaWorld Abu Dhabi Demo Sites

> **Cursor instructions:** Execute every step below in order. This prompt merges a feature branch into `main`, then deploys to Firebase Hosting. The working directory is the repo root: the folder containing `firebase.json`, `package.json`, and `web/`. All shell commands must run from that directory. Do not skip steps or reorder them. If any step fails, stop and report the exact error.

---

## Context

| Item | Value |
|---|---|
| Repo | `https://github.com/adampadobe/AEP-Orchestration-Lab.git` |
| Main branch | `main` |
| Feature branch | `claude/quirky-vaughan-f3e3fc` |
| Firebase project | `aep-orchestration-lab` |
| Node version required | `22` (check `.nvmrc`) |
| Commit prefix | `[apalmer]` |

Two new static demo pages were built on the feature branch:
- `web/profile-viewer/wb-world-abu-dhabi/index.html` — Warner Bros. World™ Abu Dhabi replica
- `web/profile-viewer/seaworld-abu-dhabi/index.html` — SeaWorld® Yas Island Abu Dhabi replica

These files are already committed on `claude/quirky-vaughan-f3e3fc`. No Cloud Functions or firebase.json changes are needed — static files under `web/` are served automatically by Firebase Hosting.

---

## Step 1 — Environment check

Run these in parallel to confirm the environment is ready:

```bash
node --version        # must be v22.x
nvm use               # switches to v22 per .nvmrc if not already active
git status            # confirm clean working tree on main (or stash any WIP)
git remote -v         # confirm origin points to adampadobe/AEP-Orchestration-Lab
```

If `node --version` is not v22, run `nvm use 22` before continuing.

---

## Step 2 — Sync main with origin

```bash
git checkout main
git fetch origin
git pull --ff-only origin main
```

If `--ff-only` fails (diverged history), resolve it before continuing — do **not** force-push main.

---

## Step 3 — Fetch the feature branch

```bash
git fetch origin claude/quirky-vaughan-f3e3fc
```

Verify the two new files exist on the branch:

```bash
git show origin/claude/quirky-vaughan-f3e3fc:web/profile-viewer/wb-world-abu-dhabi/index.html > /dev/null && echo "WB OK"
git show origin/claude/quirky-vaughan-f3e3fc:web/profile-viewer/seaworld-abu-dhabi/index.html > /dev/null && echo "SW OK"
```

Both must print `OK`. If either fails, go to **Fallback** at the bottom of this file.

---

## Step 4 — Merge feature branch into main (no fast-forward, preserve history)

```bash
git merge --no-ff origin/claude/quirky-vaughan-f3e3fc \
  -m "[apalmer] feat(profile-viewer): add WB World & SeaWorld Abu Dhabi demo sites

Two self-contained HTML demo pages using real static.myconnect.ae CDN assets:
- web/profile-viewer/wb-world-abu-dhabi/index.html
- web/profile-viewer/seaworld-abu-dhabi/index.html

Both pages include full nav, hero, lands/realms carousel, offers, support,
newsletter, footer, partner logos, and a floating AEP personalisation bar.
JS onerror fallbacks handle any CDN hotlink blocking gracefully.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

After the merge, confirm the files are present:

```bash
ls web/profile-viewer/wb-world-abu-dhabi/index.html
ls web/profile-viewer/seaworld-abu-dhabi/index.html
```

---

## Step 5 — Run predeploy verification

```bash
npm run verify:profile-viewer-routes
```

This guard checks that no protected routes have been accidentally deleted or renamed. It must pass before deploying. If it fails, read the error output carefully — do not skip it.

---

## Step 6 — Push main to origin

```bash
git push origin main
```

Do **not** use `--force` or `--force-with-lease` on main under any circumstances.

---

## Step 7 — Deploy to Firebase Hosting (hosting only)

```bash
npx -y firebase-tools@latest deploy --only hosting
```

Wait for the deploy to complete. The CLI will print the hosting URL when done. Expected output contains:

```
✔  Deploy complete!
Hosting URL: https://aep-orchestration-lab.web.app
```

---

## Step 8 — Verify the live URLs

Open these two URLs and confirm each page loads with images, navigation, and carousel:

| Page | URL |
|---|---|
| Warner Bros. World | `https://aep-orchestration-lab.web.app/profile-viewer/wb-world-abu-dhabi/` |
| SeaWorld Abu Dhabi | `https://aep-orchestration-lab.web.app/profile-viewer/seaworld-abu-dhabi/` |

Checks to confirm on each page:
- [ ] Logo loads (real CDN image or text fallback)
- [ ] Hero background image loads (real CDN or Unsplash fallback)
- [ ] Land / Realm carousel scrolls with Prev/Next buttons
- [ ] Offer/event cards visible
- [ ] AEP personalisation bar appears after ~4 seconds
- [ ] Footer social icons and links present
- [ ] Page is responsive at mobile width (375px)

---

## Step 9 — (Optional) Add clean URL rewrites to firebase.json

The pages already work at their full paths. If you also want short vanity URLs (`/wb-world` and `/seaworld`), add these two entries to the `"rewrites"` array in `firebase.json` **before** the catch-all `"/"` entry:

```json
{
  "source": "/wb-world",
  "destination": "/profile-viewer/wb-world-abu-dhabi/index.html"
},
{
  "source": "/seaworld",
  "destination": "/profile-viewer/seaworld-abu-dhabi/index.html"
}
```

Then commit and redeploy:

```bash
git add firebase.json
git commit -m "[apalmer] feat(hosting): add /wb-world and /seaworld vanity rewrites

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
npx -y firebase-tools@latest deploy --only hosting
```

---

## Fallback — if the feature branch files are missing

If Step 3 fails (branch not found or files not on it), create the files from scratch. Make sure you are on `main` with a clean tree, then run:

```bash
mkdir -p web/profile-viewer/wb-world-abu-dhabi
mkdir -p web/profile-viewer/seaworld-abu-dhabi
```

Then create each file as follows. The content for both files is embedded in the two companion spec files in the repo root:

- `wb-world-abudhabi-demo.md` — contains the full `wb-world-abu-dhabi.html` source in a fenced code block
- `seaworld-abudhabi-demo.md` — contains the full `seaworld-abu-dhabi.html` source in a fenced code block

**Extract and save each:**

1. Open `wb-world-abudhabi-demo.md`, copy the entire content of the HTML code block (everything between the opening ` ```html ` and closing ` ``` ` fence under "Full HTML Implementation"), and save it to `web/profile-viewer/wb-world-abu-dhabi/index.html`.

2. Open `seaworld-abudhabi-demo.md`, do the same, save to `web/profile-viewer/seaworld-abu-dhabi/index.html`.

Then stage, commit, and continue from Step 5:

```bash
git add web/profile-viewer/wb-world-abu-dhabi/index.html \
        web/profile-viewer/seaworld-abu-dhabi/index.html
git commit -m "[apalmer] feat(profile-viewer): add WB World & SeaWorld Abu Dhabi demo sites

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Then run Steps 5 → 8.

---

## Summary of what was built

### Warner Bros. World™ Abu Dhabi (`/profile-viewer/wb-world-abu-dhabi/`)
- Dark cinematic theme (`#0a0a0f` bg, `#f5a623` gold, `#e31837` red)
- Fonts: Oswald + Open Sans
- Sections: announcement bar · sticky nav · full-viewport hero · offers grid (3 cards) · six-land carousel (Warner Bros. Plaza, Bedrock, Dynamite Gulch, Cartoon Junction, Gotham City, Metropolis) · park map + stats · partner logos · support cards · newsletter · footer
- Real assets from `static.myconnect.ae`: logo, hero (`plaza-2019.jpg`), offer thumbnails, partner logos
- JS `onerror` fallbacks to Unsplash / CSS gradients for any blocked CDN images

### SeaWorld® Yas Island Abu Dhabi (`/profile-viewer/seaworld-abu-dhabi/`)
- Bright ocean theme (`#ffffff` bg, `#003a6b` deep navy, `#00b4d8` teal)
- Fonts: Nunito + Inter
- Sections: announcement bar · sticky white nav · full-viewport hero · pledge stats (100+ experiences, 1 Ocean, 8 Realms) · flexibility strip · what's on (3 event cards) · eight-realm carousel (One Ocean, Tropical Ocean, Abu Dhabi Ocean, Endless Ocean, Antarctica, Arctic, Rocky Point, Micro Ocean) · Research & Rescue with rescue hotline `056 503 0060` · partner logos · newsletter · footer
- Real assets from `static.myconnect.ae`: logo (colour + white), hero, **all 8 realm KV hero images** confirmed live, dolphin/manta/aviary event images, rescue center image, partner logos (Coca-Cola PNG, Emirates NBD SVG, Etihad PNG)

### AEP Personalisation Bar (both pages)
Both pages include a floating `div#aepBar` that appears after 4 seconds and is wired to display AJO offer content. To activate with real AEP data, add the Alloy Web SDK snippet from the spec files before `</head>` and replace `YOUR_DATASTREAM_ID` / `YOUR_ORG_ID`.
