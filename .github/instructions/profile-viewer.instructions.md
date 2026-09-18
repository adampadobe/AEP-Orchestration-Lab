---
applyTo: "web/profile-viewer/**,aep-prototypes/AEP Profile/03 Profile Viewer/public/**"
description: Profile Viewer canonical source, mirror, themes, and protected routes
---

# Profile Viewer

- Treat `web/profile-viewer/` as canonical. Never copy changes from the Express
  prototype back into Hosting. After canonical UI changes, use
  `npm run sync-profile-viewer-ui` when the mirror must stay aligned.
- Preserve `journey-arbitration.html` and `journey-arbitration-v2.html` as
  redirect stubs to `journey-arbitration-v3.html`. Preserve the v3 HTML, CSS,
  JavaScript, iframe bridge and embed assets, industry helpers, and nav wiring.
- Do not restore `decisioning-overview-v2.html` or
  `ajo-decisioning-pipeline-v8-demo.html`; those routes were deliberately
  retired and are forbidden by the route verifier.
- Run `npm run verify:profile-viewer-routes` after relevant changes. Run
  `npm run sync-profile-viewer-ui` only canonical-to-mirror, noting that its
  `rsync --delete` makes direction especially important.
- Support explicit light and dark themes. Use existing `--dash-*` tokens, keep
  `aep-theme.css` last, retain the early-paint script, and keep the
  `home-dashboard-concierge` body class and dashboard shell.
- Bump every referencing `?v=` query when changing linked Profile Viewer CSS or
  JavaScript so deployed browsers revalidate the new asset.
