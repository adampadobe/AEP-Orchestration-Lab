---
applyTo: "functions/**,firebase.json,.firebaserc"
description: Firebase Functions, routes, secrets, and fixed production target
---

# Firebase and Cloud Functions

- Production targets only Firebase project `aep-orchestration-lab`; `.firebaserc`
  and explicit deploy arguments must agree. Never silently select another
  project or authenticated identity.
- Every new `/api/*` Hosting rewrite must have a corresponding exported
  `onRequest` function, and both declarations must use `us-central1`.
- Use Node.js 22. Reuse shared authentication, CORS, Adobe Platform host, and
  Firestore serialization helpers instead of duplicating boundaries.
- Bind production credentials with Firebase `defineSecret`; never hardcode,
  log, or commit secret values or populated environment files.
- Do not relax Firestore rules for browser access. Server-side Firestore access
  uses the Admin SDK.
- Keep production deploys behind `scripts/predeploy-check.mjs`. The gate must
  fail closed unless source state, GitHub repository ownership, Firebase target,
  and authenticated project access are all verified.
