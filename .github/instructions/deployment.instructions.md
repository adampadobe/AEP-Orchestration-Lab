---
applyTo: "scripts/**,.github/workflows/**,package.json,firebase.json,.firebaserc"
description: Fail-closed GitHub, Firebase, and release safeguards
---

# Deployment safeguards

- Preserve the three sync checkpoints in `CONTRIBUTING.md`: before substantive
  edits, immediately before push, and immediately before production deploy.
- Production is feature branch -> PR -> validation/review -> merge -> exact
  clean `origin/main` -> deploy. Preview channels are the only Firebase Hosting
  deploys allowed from feature branches.
- The expected GitHub repository is
  `adampadobe/AEP-Orchestration-Lab`; the expected Firebase project is
  `aep-orchestration-lab`. Keep both explicit.
- A deploy preflight must verify the origin repository, runtime GitHub
  repository context/access, Firebase CLI target, and authenticated access to
  the target project. Missing tools, failed lookups, malformed output, or
  mismatches are blocking errors; never log in, switch accounts, or fall back
  to a different target automatically.
- Do not weaken `scripts/predeploy-check.mjs`, remove it from Firebase hooks, or
  use `AEP_PRODUCTION_DEPLOY_OVERRIDE=1` except for a documented emergency
  rollback.
- For code-only Cloud Run releases, inspect current configuration and update
  only the image. Preserve environment variable names, secret bindings,
  service account, ingress, timeout, memory, scaling, and traffic settings.
