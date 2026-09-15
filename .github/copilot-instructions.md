# AEP-Orchestration-Lab Copilot Instructions

## Repository scope

- This repository is a Node.js, Python, and Firebase project.
- GitHub (`origin`) is the source of truth.
- The default Firebase project is `aep-orchestration-lab`.
- Use the repository's existing scripts and configuration instead of introducing parallel deployment workflows.

## Before making changes

- Read the relevant repository guidance in `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and `.cursor/rules/` when the task touches their areas.
- Sync with GitHub before substantive work: run `git fetch origin`, inspect `git status`, and integrate `origin/main` when the local branch is behind.
- Work on a feature branch. Do not make direct production changes from a feature branch or detached HEAD.
- Keep changes focused and do not include unrelated files.
- Never commit tokens, service-account keys, client secrets, or other credentials.
- Treat untracked files as suspect until their purpose is confirmed; do not add them automatically.

## Development and validation

- Prefer the existing `npm` scripts in `package.json` and existing validation scripts under `scripts/`.
- Install dependencies using the repository's lockfiles and configured Node version from `.nvmrc`.
- Run the narrowest relevant validation first, then the broader checks required by the change.
- For changes under `web/` or `functions/`, check for the repository's deployment and route-validation requirements before proposing a deploy.
- Do not weaken, bypass, or remove validation checks to make a change pass.

## GitHub workflow

- Commit only focused, reviewed changes using the repository's required commit-message convention.
- Before pushing, fetch `origin` again and confirm the branch is not behind or diverged.
- Push the feature branch and use a pull request for integration into protected `main`.
- Treat the `Validate` GitHub Actions workflow as a required gate before merge.
- Do not force-push `main` or bypass branch protection.

## Firebase workflow

- Use Firebase preview channels for feature-branch hosting changes: `npm run deploy:preview -- <channel-name>`
- Production deployment is allowed only from clean, validated `main` that exactly matches `origin/main`.
- Before production deployment, use the repository predeploy checks and follow the documented ship order: commit, push, validate, merge, then deploy.
- Do not deploy untracked files from `web/` or `functions/`.
- Do not expose, request, or store production credentials in source files, prompts, logs, or commits.
- Local Firebase CLI or MCP operations must use the developer's already-authorized environment. Copilot must not invent credentials or bypass IAM, GitHub environments, or approval gates.

## Copilot behavior

- Explain the intended files and validation before making broad changes.
- When a request could affect production data, hosting, Cloud Functions, IAM, secrets, or protected branches, stop and identify the safety boundary before suggesting commands.
- Prefer small patches and preserve existing conventions.
- When unsure about a project-specific rule, inspect the repository documentation and scripts rather than guessing.
