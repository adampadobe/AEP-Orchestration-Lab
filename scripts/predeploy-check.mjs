#!/usr/bin/env node
/**
 * Pre-deploy safety check, wired into firebase.json's predeploy hook so it
 * runs automatically before every `firebase deploy` (hosting + functions).
 *
 * Enforces the parallel-agent-overwrite guard from CONTRIBUTING.md
 * "Phase C — immediately before firebase deploy":
 *
 *   - REFUSES the deploy if the local branch is BEHIND origin/main, since
 *     `firebase deploy` ships local-disk content and would silently
 *     overwrite the teammate's work that's already on origin.
 *   - WARNS (does not block) if the working tree is dirty — sometimes you
 *     intentionally deploy uncommitted hotfixes, but it's a sharp edge.
 *   - WARNS (does not block) if you have unpushed commits — your deploy
 *     will hit the live site before anyone can read the source on GitHub.
 *
 * Then invokes scripts/build-version.mjs so /version.json on Hosting and
 * the X-Build-Sha header on every function carry the actual deployed SHA.
 *
 * Escape hatches (use sparingly, document in commit message when used):
 *
 *   SKIP_PREDEPLOY_CHECKS=1 firebase deploy ...
 *     Bypasses the behind-origin block. Use only for genuine emergency
 *     hotfixes where you accept overwriting whatever is upstream.
 *
 *   AEP_PREDEPLOY_TARGET=hosting npm run deploy:check
 *     Runs the same checks without deploying — useful for CI dry-runs.
 *
 * Exit codes:
 *   0 — safe to deploy (warnings may have been printed)
 *   1 — refused: behind origin/main and SKIP_PREDEPLOY_CHECKS not set
 *   2 — refused: failed to read git state (corrupt checkout, no .git, etc.)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function fail(msg, code = 1) {
  // eslint-disable-next-line no-console
  console.error(`${RED}✖ predeploy-check: ${msg}${RESET}`);
  process.exit(code);
}

function warn(msg) {
  // eslint-disable-next-line no-console
  console.warn(`${YELLOW}⚠ predeploy-check: ${msg}${RESET}`);
}

function info(msg) {
  // eslint-disable-next-line no-console
  console.log(`${CYAN}ℹ predeploy-check: ${msg}${RESET}`);
}

function ok(msg) {
  // eslint-disable-next-line no-console
  console.log(`${GREEN}✓ predeploy-check: ${msg}${RESET}`);
}

if (!existsSync(join(repoRoot, '.git'))) {
  fail('not a git checkout — refusing to deploy without git state', 2);
}

// Refresh remote refs. Non-fatal if offline; we'll just compare against
// whatever origin/main pointer we already have locally.
try {
  execSync('git fetch origin --quiet', { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'], timeout: 10000 });
} catch (e) {
  warn(`could not fetch origin (${(e && e.message) || 'unknown'}). Proceeding against last-known origin/main pointer — your deploy may still be stale.`);
}

const ahead    = parseInt(git('rev-list --count origin/main..HEAD', '0'), 10) || 0;
const behind   = parseInt(git('rev-list --count HEAD..origin/main', '0'), 10) || 0;
// --untracked-files=no so untracked artifact directories (e.g. .claude/,
// .venv/, IDE scratch dirs) don't trigger a false dirty warning. We only
// care about modifications/deletions to tracked files — that's what would
// actually ship.
const dirty    = git('status --porcelain --untracked-files=no', '').length > 0;
const branch   = git('rev-parse --abbrev-ref HEAD', '');
const shortSha = git('rev-parse --short HEAD', '');

info(`branch: ${branch}, HEAD: ${shortSha}, ahead/behind origin/main: +${ahead} / -${behind}, dirty: ${dirty}`);

const skip = process.env.SKIP_PREDEPLOY_CHECKS === '1';

if (behind > 0) {
  if (skip) {
    warn(`local branch is BEHIND origin/main by ${behind} commit(s) — SKIP_PREDEPLOY_CHECKS=1 honoured, proceeding anyway. Your deploy will overwrite ${behind} upstream commit(s) on Hosting.`);
  } else {
    // eslint-disable-next-line no-console
    console.error('');
    fail([
      `local branch is BEHIND origin/main by ${behind} commit(s).`,
      '',
      `${DIM}Why this is blocked:${RESET}`,
      `  ${DIM}firebase deploy --only hosting ships what is on YOUR local disk under web/,${RESET}`,
      `  ${DIM}NOT what is on origin/main. Deploying now would silently revert ${behind} upstream${RESET}`,
      `  ${DIM}commit(s) on the live site even though git history would still look linear.${RESET}`,
      '',
      `${DIM}Fix:${RESET}`,
      `  ${CYAN}git pull --ff-only origin main${RESET}      ${DIM}# advance local main to match origin${RESET}`,
      `  ${CYAN}git status${RESET}                            ${DIM}# must report "up to date with 'origin/main'"${RESET}`,
      `  ${CYAN}npm run verify:profile-viewer-routes${RESET}  ${DIM}# re-verify after the pull${RESET}`,
      '',
      `${DIM}Emergency override (will overwrite upstream — document in commit message):${RESET}`,
      `  ${CYAN}SKIP_PREDEPLOY_CHECKS=1 firebase deploy --only hosting${RESET}`,
    ].join('\n'));
  }
}

if (dirty) {
  warn(`working tree has uncommitted changes — these WILL ship in the deploy. Run \`git status\` to review.`);
}

if (ahead > 0) {
  warn(`you have ${ahead} unpushed commit(s) — the deploy will go live before anyone can see the source on GitHub. Push first if you can: \`git push origin ${branch}\``);
}

ok(`safe to deploy. Stamping build…`);

// Now write web/version.json + functions/version.json so the deploy carries
// a record of which SHA went out. Run as a separate process so any failure
// in the stamp script surfaces a clean exit code.
const stamp = spawnSync(process.execPath, [join(__dirname, 'build-version.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit',
});
if (stamp.status !== 0) {
  fail(`build-version.mjs exited with code ${stamp.status} — refusing to deploy with a missing version stamp`, stamp.status || 1);
}
