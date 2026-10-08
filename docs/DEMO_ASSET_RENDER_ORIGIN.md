# Demo asset render origin

Uploaded customer HTML is rendered from the Firebase Hosting site
`aep-orchestration-lab-demo-render` (`https://aep-orchestration-lab-demo-render.web.app`),
not from the lab application's origin. The separate origin prevents demo scripts
from directly reading the lab page or its origin-scoped browser storage.

The lab API continues to require a signed-in Adobe user to mint a one-hour
render token. The renderer accepts only that token, sends the stored HTML with
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

## Deleting uploaded assets

Use **Delete** on an asset card, or **Delete asset** in its Edit/Review dialog.
Confirmation names the asset and warns that deletion cannot be undone. While
the request is running, its Delete action is disabled; failures keep the card
and display an error so the action can be retried.

Deletion removes the stored HTML, version history and library entry. Shared,
content-addressed media remains because other assets may use it. Existing
preview links can no longer load the deleted asset. Demo flows are retained;
steps referencing it display a missing-asset message.
