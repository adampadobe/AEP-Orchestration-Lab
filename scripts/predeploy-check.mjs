#!/usr/bin/env node
/**
 * Pre-deploy safety check, wired into firebase.json's predeploy hook so it
 * runs automatically before every `firebase deploy` (hosting + functions).
 *
 * Enforces the parallel-agent-overwrite guard from CONTRIBUTING.md
 * "Phase C — immediately before firebase deploy":
 *
 *   - REFUSES production deploys unless they run from a clean `main` whose
 *     HEAD exactly matches origin/main.
 *   - FAILS CLOSED when origin cannot be refreshed for a production deploy.
 *   - Allows feature branches only when explicitly deploying a Firebase
 *     Hosting preview channel with AEP_DEPLOY_MODE=preview.
 *
 * Then invokes scripts/build-version.mjs so /version.json on Hosting and
 * the X-Build-Sha header on every function carry the actual deployed SHA.
 *
 * Escape hatches (use sparingly, document in commit message when used):
 *
 *   AEP_PRODUCTION_DEPLOY_OVERRIDE=1 firebase deploy ...
 *     Bypasses the production source-of-truth checks. Use only for a
 *     documented emergency rollback.
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
import { evaluateDeployPolicy } from './predeploy-policy.mjs';

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

const previewDeploy = process.env.AEP_DEPLOY_MODE === 'preview';
const override = process.env.AEP_PRODUCTION_DEPLOY_OVERRIDE === '1';

// Production deploys fail closed if the source-of-truth cannot be refreshed.
// Preview channels may continue against the last-known ref because they cannot
// replace the production Hosting release.
let fetchedOrigin = true;
try {
  execSync('git fetch origin --quiet', { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'], timeout: 10000 });
} catch (e) {
  fetchedOrigin = false;
  if (previewDeploy) {
    warn(`could not fetch origin (${(e && e.message) || 'unknown'}). Preview deploy will use the last-known origin/main pointer.`);
  } else if (!override) {
    fail('could not refresh origin/main — refusing a production deploy without current GitHub state.');
  }
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

info(`mode: ${previewDeploy ? 'preview' : 'production'}, branch: ${branch}, HEAD: ${shortSha}, ahead/behind origin/main: +${ahead} / -${behind}, dirty: ${dirty}`);

const policy = evaluateDeployPolicy({ previewDeploy, override, fetchedOrigin, branch, ahead, behind, dirty });

if (policy.mode === 'preview') {
  ok('feature-branch deploy is isolated to a Firebase Hosting preview channel.');
} else if (policy.mode === 'emergency-override') {
  warn('AEP_PRODUCTION_DEPLOY_OVERRIDE=1 honoured — production source-of-truth checks are bypassed for this emergency deploy.');
} else if (!policy.allowed) {
    fail([
      'production deploy source is not the GitHub source of truth:',
      ...policy.reasons.map((reason) => `  - ${reason}`),
      '',
      `${DIM}Production fix:${RESET}`,
      `  ${CYAN}git switch main && git pull --ff-only origin main${RESET}`,
      `  ${CYAN}git status --short --branch${RESET}`,
      '',
      `${DIM}Feature branch preview:${RESET}`,
      `  ${CYAN}npm run deploy:preview -- <channel-name>${RESET}`,
      '',
      `${DIM}Documented emergency rollback only:${RESET}`,
      `  ${CYAN}AEP_PRODUCTION_DEPLOY_OVERRIDE=1 firebase deploy ...${RESET}`,
    ].join('\n'));
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
