#!/usr/bin/env node
/**
 * Build web/whats-new.json — the home page "What's new" feed — from merged
 * pull requests in git history.
 *
 * Squash-merge subjects look like `[handle] Subject (#123)`. Files changed
 * under web/profile-viewer/ are mapped to lab pages from the nav catalogue
 * (scripts/lab-nav-catalogue.mjs). A PR that adds a page's .html is `new`;
 * everything else is `updated`. Add `[skip-whats-new]` to a commit subject or
 * body to leave it out.
 *
 * Runs at predeploy after build-version.mjs. The output is gitignored and is
 * regenerated on every deploy. Outside a git checkout it writes an empty feed
 * rather than failing.
 *
 * Usage: node scripts/build-whats-new.mjs [--days 90] [--limit 50] [--stdout]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue, ROUTE_PREFIX } from './lab-nav-catalogue.mjs';

const WEB_PREFIX = 'web' + ROUTE_PREFIX;
const SUBJECT = /^\[([A-Za-z0-9][A-Za-z0-9-]{0,38})\]\s+(.+?)\s+\(#(\d+)\)$/;
const SKIP = '[skip-whats-new]';
const MAX_PAGES = 8;
const RECORD = '\x1e';
const FIELD = '\x1f';

export const GIT_FORMAT = `${RECORD}%H${FIELD}%cI${FIELD}%s${FIELD}%b${FIELD}`;

/** Parse `git log --name-status --pretty=format:GIT_FORMAT` output. */
export function parseGitLog(raw) {
  return raw.split(RECORD).filter((chunk) => chunk.trim()).map((chunk) => {
    const [sha, committedAt, subject, body, files = ''] = chunk.split(FIELD);
    const changes = files.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [status, ...paths] = line.split('\t');
      return { status: status[0], path: paths[paths.length - 1] };
    }).filter((change) => change.path);
    return { sha, committedAt, subject: subject.trim(), body: body || '', changes };
  });
}

export function parseSubject(subject) {
  const match = SUBJECT.exec(subject);
  if (!match) return null;
  return { author: match[1], title: match[2], prNumber: Number(match[3]) };
}

function pageIndex(catalogue) {
  return catalogue.pages.map((page) => {
    const rel = page.route.slice(ROUTE_PREFIX.length);
    const slash = rel.lastIndexOf('/');
    return {
      route: page.route,
      label: page.label,
      rel,
      dir: slash === -1 ? '' : rel.slice(0, slash),
      stem: rel.slice(slash + 1).replace(/\.html$/, ''),
    };
  });
}

/** Map one repository path to catalogue pages (may be empty). */
export function pagesForFile(path, pages) {
  if (!path.startsWith(WEB_PREFIX)) return [];
  const rel = path.slice(WEB_PREFIX.length);
  const exact = pages.filter((page) => page.rel === rel);
  if (exact.length) return exact;
  const slash = rel.indexOf('/');
  if (slash !== -1) {
    const top = rel.slice(0, slash);
    const inside = pages.filter((page) => page.dir === top || page.dir.startsWith(top + '/'));
    if (inside.length) return inside;
    return pages.filter((page) => page.dir === '' && page.stem === top);
  }
  const fileStem = rel.replace(/\.[^.]+$/, '').replace(/\.min$/, '');
  const matches = pages.filter((page) => page.dir === '' && (fileStem === page.stem || fileStem.startsWith(page.stem + '-')));
  if (!matches.length) return [];
  const longest = Math.max(...matches.map((page) => page.stem.length));
  return matches.filter((page) => page.stem.length === longest);
}

/** Turn parsed commits into feed items, newest first. */
export function buildItems(commits, catalogue, { limit = 50 } = {}) {
  const pages = pageIndex(catalogue);
  const items = [];
  const seen = new Set();
  for (const commit of commits) {
    if (commit.subject.includes(SKIP) || commit.body.includes(SKIP)) continue;
    const parsed = parseSubject(commit.subject);
    if (!parsed || seen.has(parsed.prNumber)) continue;
    seen.add(parsed.prNumber);
    const touched = new Map();
    let isNew = false;
    for (const change of commit.changes) {
      for (const page of pagesForFile(change.path, pages)) {
        touched.set(page.route, { route: page.route, label: page.label });
        if (change.status === 'A' && change.path === WEB_PREFIX + page.rel) isNew = true;
      }
    }
    items.push({
      title: parsed.title,
      prNumber: parsed.prNumber,
      mergedAt: commit.committedAt,
      author: parsed.author,
      pages: [...touched.values()].slice(0, MAX_PAGES),
      kind: isNew ? 'new' : 'updated',
    });
    if (items.length >= limit) break;
  }
  return items;
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? NaN : Number(process.argv[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const days = argValue('--days', 90);
  const limit = argValue('--limit', 50);
  let raw = '';
  let gitSha = null;
  try {
    gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    raw = execFileSync('git', ['log', 'HEAD', `--since=${days}.days`, '--no-merges', '--name-status', `--pretty=format:${GIT_FORMAT}`, '--', '.'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    console.warn('[whats-new] git history unavailable; writing an empty feed');
  }
  const items = buildItems(parseGitLog(raw), buildCatalogue(repoRoot), { limit });
  const output = JSON.stringify({ generatedAt: new Date().toISOString(), gitSha, windowDays: days, items }, null, 2) + '\n';
  if (process.argv.includes('--stdout')) {
    process.stdout.write(output);
    return;
  }
  writeFileSync(join(repoRoot, 'web/whats-new.json'), output, 'utf8');
  console.log(`[whats-new] wrote web/whats-new.json (${items.length} items, ${items.filter((i) => i.kind === 'new').length} new)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
