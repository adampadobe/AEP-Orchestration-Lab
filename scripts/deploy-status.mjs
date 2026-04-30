#!/usr/bin/env node
/**
 * Print the version that's currently live on Firebase Hosting (and on
 * Cloud Functions, via the X-Build-Sha header) and compare it against
 * the local checkout. Fast post-mortem tool when the user reports
 * "a feature we just shipped is gone again".
 *
 * Reads:
 *   GET https://aep-orchestration-lab.web.app/version.json   (Hosting stamp)
 *   HEAD https://aep-orchestration-lab.web.app/api/event-config/health  (X-Build-Sha)
 *
 * Falls back gracefully if either endpoint is unreachable. Always returns
 * exit 0 (this is a diagnostic tool, not a gate); the called-out drift
 * status is the actionable signal.
 *
 * Usage:
 *   npm run deploy:status                 — pretty terminal output
 *   npm run deploy:status -- --json       — JSON output for tooling
 *   npm run deploy:status -- --url=...    — alternate Hosting base URL
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const urlArg = args.find((a) => a.startsWith('--url='));
const HOSTING_BASE = (urlArg ? urlArg.slice('--url='.length) : '') || 'https://aep-orchestration-lab.web.app';

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

async function fetchHostingVersion() {
  // Cache-buster query string so we never get back a stale Fastly edge
  // copy — same recipe documented in CONTRIBUTING.md "Diagnosing a stale
  // deploy".
  const url = `${HOSTING_BASE}/version.json?cb=${Date.now()}`;
  try {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) return { error: `HTTP ${resp.status} ${resp.statusText}`, url };
    const data = await resp.json();
    return { data, url };
  } catch (e) {
    return { error: String((e && e.message) || e), url };
  }
}

async function fetchFunctionsBuildSha() {
  // Any function with X-Build-Sha will do — they all stamp via setCors().
  // /api/sandboxes is a small, public, fast GET that's existed since the
  // early days of this repo, so it's the most stable target for a probe.
  // We use HEAD so we get headers without paying for the body work.
  const url = `${HOSTING_BASE}/api/sandboxes?cb=${Date.now()}`;
  try {
    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return {
      sha: resp.headers.get('x-build-sha') || null,
      shortSha: resp.headers.get('x-build-short-sha') || null,
      branch: resp.headers.get('x-build-branch') || null,
      deployedAt: resp.headers.get('x-build-deployed-at') || null,
      url,
      status: resp.status,
    };
  } catch (e) {
    return { error: String((e && e.message) || e), url };
  }
}

function pad(s, n) { return String(s || '').padEnd(n, ' '); }
function header(title) {
  // eslint-disable-next-line no-console
  console.log(`\n${BOLD}${title}${RESET}`);
  // eslint-disable-next-line no-console
  console.log(`${DIM}${'─'.repeat(title.length)}${RESET}`);
}

(async () => {
  // Refresh local view of origin without blocking too long.
  try {
    execSync('git fetch origin --quiet', { cwd: repoRoot, stdio: ['ignore', 'ignore', 'ignore'], timeout: 5000 });
  } catch { /* ignore */ }

  const localHead       = git('rev-parse HEAD', '');
  const localShort      = git('rev-parse --short HEAD', '');
  const localBranch     = git('rev-parse --abbrev-ref HEAD', '');
  const originHead      = git('rev-parse origin/main', '');
  const originShort     = git('rev-parse --short origin/main', '');
  const ahead           = parseInt(git('rev-list --count origin/main..HEAD', '0'), 10) || 0;
  const behind          = parseInt(git('rev-list --count HEAD..origin/main', '0'), 10) || 0;
  // Untracked artifact directories (.claude/, .venv/, IDE scratch dirs)
  // shouldn't count as "dirty" for deploy-tracking purposes; only
  // modifications to tracked files would actually ship in a deploy.
  const dirty           = git('status --porcelain --untracked-files=no', '').length > 0;

  const [host, fn] = await Promise.all([fetchHostingVersion(), fetchFunctionsBuildSha()]);

  if (wantJson) {
    process.stdout.write(JSON.stringify({
      hostingBase: HOSTING_BASE,
      local: { head: localHead, shortSha: localShort, branch: localBranch, dirty, aheadOfOrigin: ahead, behindOrigin: behind },
      origin: { head: originHead, shortSha: originShort },
      hosting: host,
      functions: fn,
    }, null, 2) + '\n');
    return;
  }

  header(`Local checkout (${repoRoot})`);
  // eslint-disable-next-line no-console
  console.log(`  HEAD               ${BOLD}${localShort}${RESET}  ${DIM}(${localHead})${RESET}`);
  // eslint-disable-next-line no-console
  console.log(`  Branch             ${localBranch}`);
  // eslint-disable-next-line no-console
  console.log(`  vs origin/main     ${ahead === 0 && behind === 0 ? `${GREEN}up to date${RESET}` : `${YELLOW}ahead +${ahead} / behind -${behind}${RESET}`}  ${DIM}(${originShort})${RESET}`);
  // eslint-disable-next-line no-console
  console.log(`  Working tree       ${dirty ? `${YELLOW}dirty${RESET}` : `${GREEN}clean${RESET}`}`);

  header(`Hosting — ${HOSTING_BASE}/version.json`);
  if (host.error) {
    // eslint-disable-next-line no-console
    console.log(`  ${RED}error: ${host.error}${RESET}`);
    // eslint-disable-next-line no-console
    console.log(`  ${DIM}If 404 — version.json has not been generated yet. Deploy once with the new${RESET}`);
    // eslint-disable-next-line no-console
    console.log(`  ${DIM}predeploy hook in firebase.json (it stamps web/version.json automatically).${RESET}`);
  } else {
    const v = host.data || {};
    // eslint-disable-next-line no-console
    console.log(`  Live SHA           ${BOLD}${v.gitShortSha || '?'}${RESET}  ${DIM}(${v.gitSha || '?'})${RESET}`);
    // eslint-disable-next-line no-console
    console.log(`  Branch             ${v.gitBranch || '?'}`);
    // eslint-disable-next-line no-console
    console.log(`  Commit             ${v.gitCommitSubject || '?'}`);
    // eslint-disable-next-line no-console
    console.log(`  Author             ${v.gitCommitAuthor || '?'}  ${DIM}(${v.gitCommitDate || '?'})${RESET}`);
    // eslint-disable-next-line no-console
    console.log(`  Deployed           ${v.deployedAt || '?'} by ${v.deployedBy || '?'}`);
    if (v.dirtyWorkingTree) {
      // eslint-disable-next-line no-console
      console.log(`  ${YELLOW}Build was stamped from a DIRTY working tree (uncommitted changes shipped)${RESET}`);
    }
    if (v.behindOrigin > 0) {
      // eslint-disable-next-line no-console
      console.log(`  ${RED}Build was stamped while BEHIND origin by ${v.behindOrigin} commit(s) — likely a parallel-agent overwrite${RESET}`);
    }
    if (v.commitUrl) {
      // eslint-disable-next-line no-console
      console.log(`  Commit URL         ${CYAN}${v.commitUrl}${RESET}`);
    }
  }

  header(`Cloud Functions — X-Build-Sha header (sample function)`);
  if (fn.error) {
    // eslint-disable-next-line no-console
    console.log(`  ${RED}error: ${fn.error}${RESET}`);
  } else if (!fn.sha) {
    // eslint-disable-next-line no-console
    console.log(`  ${YELLOW}no X-Build-Sha header returned${RESET}`);
    // eslint-disable-next-line no-console
    console.log(`  ${DIM}Functions have not been redeployed since buildInfo.js was added.${RESET}`);
    // eslint-disable-next-line no-console
    console.log(`  ${DIM}Run: firebase deploy --only functions${RESET}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`  Live SHA           ${BOLD}${fn.shortSha || fn.sha.slice(0, 7)}${RESET}  ${DIM}(${fn.sha})${RESET}`);
    if (fn.branch) {
      // eslint-disable-next-line no-console
      console.log(`  Branch             ${fn.branch}`);
    }
  }

  // Drift summary — the actionable bit.
  header(`Drift`);
  const liveHostSha = host && host.data && host.data.gitSha;
  const liveFnSha   = fn && fn.sha;
  const issues = [];
  if (liveHostSha && liveHostSha !== localHead && liveHostSha !== originHead) {
    issues.push(`Hosting is on ${liveHostSha.slice(0, 7)} which is neither your HEAD nor origin/main — likely an unsynced parallel-agent deploy`);
  }
  if (liveFnSha && liveHostSha && liveFnSha !== liveHostSha) {
    issues.push(`Functions SHA (${liveFnSha.slice(0, 7)}) differs from Hosting SHA (${liveHostSha.slice(0, 7)}) — they were deployed from different working trees`);
  }
  if (liveHostSha && liveHostSha === localHead) {
    // eslint-disable-next-line no-console
    console.log(`  ${GREEN}Hosting is at your local HEAD — no drift.${RESET}`);
  } else if (liveHostSha && liveHostSha === originHead) {
    // eslint-disable-next-line no-console
    console.log(`  ${GREEN}Hosting is at origin/main — no drift (your local HEAD is ${ahead === 0 && behind === 0 ? 'in sync' : 'diverged from origin/main'}).${RESET}`);
  } else if (issues.length === 0 && liveHostSha) {
    // eslint-disable-next-line no-console
    console.log(`  ${YELLOW}Hosting is at ${liveHostSha.slice(0, 7)}, your local HEAD is ${localShort} — investigate.${RESET}`);
  }
  for (const i of issues) {
    // eslint-disable-next-line no-console
    console.log(`  ${RED}• ${i}${RESET}`);
  }

  // eslint-disable-next-line no-console
  console.log('');
})();
