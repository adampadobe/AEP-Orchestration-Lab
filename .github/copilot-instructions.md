# AEP Orchestration Lab

`CONTRIBUTING.md` is the model-neutral source of truth. Preserve `CLAUDE.md`,
`AGENTS.md`, `.cursor/rules/`, and committed `.agents/skills/`; keep shared
rules aligned rather than replacing another tool's entry point.

## Repository and tooling

- The canonical upstream is `https://github.com/adampadobe/AEP-Orchestration-Lab`.
  Treat `adampadobe` as the expected GitHub owner; do not infer or silently
  switch to a similarly named organization, fork, remote, or account.
- Use Node.js 22, pinned by `.nvmrc`, and npm 10 or newer. Cloud Functions also
  target Node.js 22.
- Firebase production belongs only to project `aep-orchestration-lab`. Keep the
  project explicit in deployment commands and never substitute another target.
- Never commit or print secrets. Use Firebase `defineSecret`, environment
  variables, or documented gitignored credential files.

## Git and release workflow

- Before substantive edits, run `git fetch origin` and inspect `git status`.
  Integrate `origin/main` safely if the current branch is behind. Preserve
  unrelated tracked and untracked work.
- Work on a feature branch. Do not push directly to `main`, force-push shared
  history, or bypass required pull-request validation.
- Immediately before a requested push, fetch and inspect status again,
  integrate newer `origin/main`, and rerun affected validation.
- Ship in this order: feature branch, focused commit, push, pull request,
  required validation and review, merge to `main`, then production deploy from
  the exact merged `origin/main` SHA.
- Production Firebase deployment is allowed only from clean `main` after a
  fresh fetch, with `HEAD` exactly equal to `origin/main`. Feature branches use
  `npm run deploy:preview -- <channel-name>`.
- Do not deploy unless the user explicitly asks. Before any Firebase deploy,
  use the repository preflight; it must confirm the `adampadobe` repository,
  target project `aep-orchestration-lab`, and authenticated access. Fail closed
  on ambiguity or missing access instead of changing identities.
- Commit subjects use the contributor's GitHub handle in brackets, for example
  `[apalmer] Summary`.

## Architecture and implementation

- Firebase Hosting serves `web/`; Cloud Functions live in `functions/` and are
  connected through `firebase.json`.
- `web/profile-viewer/` is canonical. The Express prototype under
  `aep-prototypes/AEP Profile/03 Profile Viewer/public/` is a generated mirror;
  sync only from canonical to mirror with `npm run sync-profile-viewer-ui`.
- Pair every new `/api/*` rewrite with its exported function and keep both
  regions at `us-central1`.
- Use existing helpers and repository patterns. Make focused changes, preserve
  type safety, and surface failures explicitly.
- Validate with the smallest relevant existing command. After Profile Viewer
  edits, run `npm run verify:profile-viewer-routes`; rebuild vendored sub-apps
  when their sources change.
