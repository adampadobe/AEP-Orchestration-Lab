---
name: sync-with-origin-main
description: >-
  Keeps local AEP-Orchestration-Lab work aligned with GitHub before editing and
  before pushing. Runs git fetch, checks behind/ahead status, and git pull
  --ff-only on main (or rebase/merge for feature branches). Use at the start of
  any substantive work session, again immediately before git push, when the
  user mentions syncing with origin, staying current with main, avoiding stale
  clones, or collaborating without overwriting teammates’ commits.
---

# Sync with `origin/main` (AEP-Orchestration-Lab)

GitHub (`origin`) is the source of truth. A stale local `main` causes merge pain and makes it easy to think you are deploying or reviewing code that is not what others have merged.

## When to apply this workflow

1. **Start of a work session** — before opening files for a non-trivial change, running long agent tasks, or merging branches.
2. **Immediately before `git push`** — if anyone else might have pushed since you last pulled, update again so you do not force unnecessary rebases or surprise conflicts.

## Default branch

Assume **`main`** unless the user is on a feature branch (then integrate **`origin/main`** into that branch).

## Steps (on `main`)

1. **`git fetch origin`** — updates remote-tracking refs; does not change your working tree.
2. **`git status`** — if it shows **behind `origin/main`**, you must integrate before piling on new commits.
3. **`git pull --ff-only origin main`** — fast-forward only; avoids merge commits on `main` when possible.

If `--ff-only` fails (diverged history), stop and use the team’s agreed approach: **`git pull --rebase origin main`** or merge, then resolve conflicts. Do not **`git push --force`** to **`main`** without explicit team approval.

## Uncommitted changes blocking pull

If `git pull` refuses because of local modifications:

- **`git stash push -m "wip"`** → **`git pull --ff-only origin main`** → **`git stash pop`**
- Or commit WIP to a branch, then pull.

## Feature branches

After **`git fetch origin`**:

- **`git merge origin/main`** or **`git rebase origin/main`** so the branch includes the latest shared work **before** adding more commits and **before** opening/updating a PR.

## After updating

Confirm with **`git status`**: tracking branch should not be **behind** `origin/main` (for `main`) before continuing.

## Repo-specific references

- **`CONTRIBUTING.md`** — start with *Collaboration, Git, and environment* (Phase A / B), Node.js, CI, and Profile Viewer canonical path.
- **`.cursor/rules/sync-origin-main.mdc`** — always-on reminder to start from latest `main`.
- Ship order for Firebase: commit → push → deploy per **`github-git-workflow`** skill and **`.cursor/rules/ship-git-and-firebase.mdc`**.
