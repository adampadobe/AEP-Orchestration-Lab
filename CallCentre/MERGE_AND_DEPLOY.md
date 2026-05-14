# Merge & Deploy — Call Centre Changes

## Important: all commands must run from the worktree directory

The edits exist in a git worktree, NOT in the main repo checkout.

```
WORKTREE: /Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AEP-Orchestration-Lab/.claude/worktrees/nice-lovelace-2c73b0
BRANCH:   claude/nice-lovelace-2c73b0
REMOTE:   https://github.com/adampadobe/AEP-Orchestration-Lab.git
```

Open a terminal, `cd` to the worktree path above, then follow the steps in order.

---

## Step 1 — cd to the worktree

```bash
cd "/Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AEP-Orchestration-Lab/.claude/worktrees/nice-lovelace-2c73b0"
```

Confirm you are on the right branch:

```bash
git branch --show-current
# should print: claude/nice-lovelace-2c73b0
```

---

## Step 2 — Pull origin/main into branch

```bash
git fetch origin
git pull --ff-only origin main
```

If this fails because of the uncommitted changes:

```bash
git stash
git pull --ff-only origin main
git stash pop
```

---

## Step 3 — Stage and commit

```bash
git add web/profile-viewer/call-center-demo-apalmer.html \
        web/profile-viewer/call-center-demo-apalmer.js \
        web/profile-viewer/call-center-demo.css \
        functions/eventGeneratorService.js \
        CallCentre/ \
        Ipad/

git commit -m "[apalmer] feat: call-centre AEP wiring — profile fix, inbound events, journey + engagement chart"
```

---

## Step 4 — Push the branch

```bash
git push origin claude/nice-lovelace-2c73b0
```

---

## Step 5 — Open PR and merge to main

```bash
gh pr create \
  --base main \
  --title "feat: call-centre AEP wiring — profile fix, inbound events, journey + engagement chart" \
  --body "$(cat <<'EOF'
## Summary
- Fix profile lookup: loadProfileDataForDrawer returns boolean not {ok,found}; capture found status via onUserMessage callback
- Replace application.login with contactCentre.inbound.call/email/sms based on selected channel
- Sets _demoemea.interactionDetails.core.channel=cx and _demoemea.message.channel per selected channel
- Add body.message → _demoemea.message support to eventGeneratorService.js
- Replace hardcoded Recent activity bubble list with live Journey activity table (names resolved async)
- Replace hardcoded Engagement signals table with Chart.js event activity doughnut + real profile signals
- Load Chart.js CDN; full dark-theme CSS for all new components

## Files changed
- web/profile-viewer/call-center-demo-apalmer.js
- web/profile-viewer/call-center-demo-apalmer.html
- web/profile-viewer/call-center-demo.css
- functions/eventGeneratorService.js
- CallCentre/ (deploy + merge docs)
- Ipad/ (iPad gate-agent build reference)

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```

Then merge:

```bash
gh pr merge --merge --delete-branch
```

---

## Step 6 — Deploy from main

```bash
git checkout main
git pull --ff-only origin main

# functions/eventGeneratorService.js changed — must deploy functions AND hosting
npx -y firebase-tools@latest deploy --only functions,hosting
```

---

## Step 7 — Smoke test

1. `https://aep-orchestration-lab.web.app/profile-viewer/call-center-demo-apalmer.html`
2. Select **Voice**, enter test email, click **Load profile**
3. Status → `"Profile loaded. Sent contactCentre.inbound.call to AEP"`
4. **Customer details tab** → contact cards, engagement chart, journey activity table all populate
5. **Booking tab** → flight route card
6. **Experience tab** → events table + journey section
7. Switch to **Email**, reload → `contactCentre.inbound.email`

---

## Rules (project pattern)

- Never force-push `main`
- Never deploy uncommitted work
- Always PR → merge → then deploy (even solo)
- `--only functions,hosting` required here (not just hosting)
