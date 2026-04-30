#!/usr/bin/env node
/**
 * Stamp the current build with version info derived from git so we can
 *
 *   1. Tell at-a-glance which commit is live on Hosting / Cloud Functions
 *      (curl https://aep-orchestration-lab.web.app/version.json)
 *   2. Detect parallel-agent overwrites at deploy time (script refuses to
 *      stamp a build that is behind origin/main; see predeploy-check.mjs)
 *   3. Roll back with confidence — the SHA in /version.json maps directly
 *      to a git commit, so `git checkout <sha>` reproduces the live tree
 *
 * Writes two files (both gitignored):
 *
 *   web/version.json
 *   functions/version.json
 *
 * Both contain the same payload. Hosting serves the first at /version.json
 * via firebase.json's existing public:web mapping. The functions copy is
 * read once at cold-start by functions/buildInfo.js so every function
 * response carries an X-Build-Sha header.
 *
 * Safe to run anywhere — when called outside a git checkout (e.g. CI on a
 * shallow clone) it falls back to environment variables (GIT_SHA, etc.)
 * and finally to placeholders so a malformed JSON is never written.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function gitOrEnv(args, envName, fallback = '') {
  const fromGit = git(args, '');
  if (fromGit) return fromGit;
  return process.env[envName] || fallback;
}

function syncStatus() {
  // Refresh remote refs silently — non-fatal if offline (CI air-gap, etc.).
  try {
    execSync('git fetch origin --quiet', { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'], timeout: 5000 });
  } catch { /* offline / no origin — that's fine */ }
  const ahead  = parseInt(git('rev-list --count origin/main..HEAD', '0'), 10) || 0;
  const behind = parseInt(git('rev-list --count HEAD..origin/main', '0'), 10) || 0;
  const dirty  = git('status --porcelain', '').length > 0;
  return { ahead, behind, dirty };
}

function buildPayload() {
  const sha       = gitOrEnv('rev-parse HEAD',                'GIT_SHA',        'unknown');
  const shortSha  = gitOrEnv('rev-parse --short HEAD',        'GIT_SHORT_SHA',  sha.slice(0, 7));
  const branch    = gitOrEnv('rev-parse --abbrev-ref HEAD',   'GIT_BRANCH',     'unknown');
  const subject   = gitOrEnv('log -1 --pretty=format:%s',     'GIT_SUBJECT',    '');
  const author    = gitOrEnv('log -1 --pretty=format:%an',    'GIT_AUTHOR',     '');
  const commitISO = gitOrEnv('log -1 --pretty=format:%aI',    'GIT_COMMIT_ISO', '');
  const deployer  = git('config user.name', '') || process.env.USER || process.env.LOGNAME || 'unknown';
  const sync      = syncStatus();

  return {
    gitSha: sha,
    gitShortSha: shortSha,
    gitBranch: branch,
    gitCommitSubject: subject,
    gitCommitAuthor: author,
    gitCommitDate: commitISO,
    deployedAt: new Date().toISOString(),
    deployedBy: deployer,
    aheadOfOrigin: sync.ahead,
    behindOrigin: sync.behind,
    dirtyWorkingTree: sync.dirty,
    // Convenience link straight to the commit on GitHub. Stable URL so the
    // version pill / deploy:status script can render a clickable line.
    commitUrl: sha !== 'unknown' ? `https://github.com/adampadobe/AEP-Orchestration-Lab/commit/${sha}` : null,
  };
}

function writeStamp(absPath, payload) {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

const payload = buildPayload();
const targets = [
  join(repoRoot, 'web', 'version.json'),
  join(repoRoot, 'functions', 'version.json'),
];
for (const t of targets) writeStamp(t, payload);

if (process.env.AEP_BUILD_VERSION_QUIET !== '1') {
  const warnings = [];
  if (payload.behindOrigin > 0) warnings.push(`behind origin/main by ${payload.behindOrigin} commit(s)`);
  if (payload.dirtyWorkingTree) warnings.push('working tree has uncommitted changes');
  if (payload.aheadOfOrigin > 0) warnings.push(`ahead of origin/main by ${payload.aheadOfOrigin} commit(s) (unpushed)`);
  const warnSuffix = warnings.length ? `   [WARN: ${warnings.join('; ')}]` : '';
  // eslint-disable-next-line no-console
  console.log(`[build-version] stamped ${payload.gitShortSha} (${payload.gitBranch}) by ${payload.deployedBy}${warnSuffix}`);
}
