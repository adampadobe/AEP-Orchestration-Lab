/**
 * Shared Profile Viewer page catalogue derived from the sidebar NAV array in
 * web/profile-viewer/aep-lab-nav.js (the single source of truth for nav pages).
 *
 * Used by scripts/build-lab-nav-catalogue.mjs (writes functions/labNavCatalogue.json
 * for the usage route allowlist and heat map labels) and scripts/build-whats-new.mjs.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

export const NAV_SOURCE = 'web/profile-viewer/aep-lab-nav.js';
export const ROUTE_PREFIX = '/profile-viewer/';

/** Pages tracked before the catalogue existed that are not in the sidebar. */
export const EXTRA_PAGES = Object.freeze([
  { href: 'home.html', label: 'Home (classic)' },
  { href: 'profile.html', label: 'Profile' },
]);

/** Return the source text of the `var NAV = [...]` array literal. */
export function navArrayLiteral(source) {
  const marker = /var NAV\s*=\s*\[/.exec(source);
  if (!marker) throw new Error(`Unable to find "var NAV = [" in ${NAV_SOURCE}`);
  const start = marker.index + marker[0].length - 1;
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && next === '*') { i = source.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[') depth += 1;
    else if (c === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated NAV array in ${NAV_SOURCE}`);
}

/** Evaluate the NAV literal in an empty sandbox (data only, no globals). */
export function parseNav(source) {
  const nav = vm.runInNewContext('(' + navArrayLiteral(source) + ')', Object.create(null), { timeout: 1000 });
  if (!Array.isArray(nav)) throw new Error('NAV is not an array');
  return nav;
}

function normaliseHref(href) {
  const path = String(href || '').split(/[?#]/)[0];
  return /^[a-z0-9][a-z0-9/_.-]*\.html$/i.test(path) && !path.includes('..') ? path : null;
}

/** Flatten NAV into [{href,label,navGroup,navGroupId,subgroup}] in sidebar order. */
export function flattenNav(nav) {
  const pages = [];
  const seen = new Set();
  const add = (item, group, subgroup) => {
    const href = normaliseHref(item.href);
    if (!href || seen.has(href)) return;
    seen.add(href);
    let label = String(item.label || href).replace(/\s*\(in development\)\s*$/i, '').trim();
    const sub = subgroup && subgroup.label ? String(subgroup.label).trim() : '';
    if (sub && !label.toLowerCase().includes(sub.toLowerCase())) label = `${sub} \u2013 ${label}`;
    pages.push({
      href,
      label,
      navGroup: group ? group.group || null : null,
      navGroupId: group ? group.id || null : null,
      subgroup: subgroup ? subgroup.label || null : null,
    });
  };
  const walk = (items, group, subgroup) => (items || []).forEach((item) => {
    if (item && item.href) add(item, group, subgroup);
    if (item && Array.isArray(item.items)) walk(item.items, group, subgroup || item);
  });
  for (const entry of nav) {
    if (entry.href) add(entry, null, null);
    walk(entry.items, entry, null);
    (entry.subgroups || []).forEach((sub) => walk(sub.items, entry, sub));
  }
  return pages;
}

/**
 * Usage can only be attributed on pages that load the shared nav (which injects
 * the collector) and Firebase Auth, and that are not redirect stubs.
 */
export function isTrackable(repoRoot, href) {
  const file = join(repoRoot, 'web/profile-viewer', href);
  if (!existsSync(file)) return false;
  const html = readFileSync(file, 'utf8');
  return /aep-lab-nav\.js/.test(html) && /firebase-auth-compat\.js/.test(html)
    && !/http-equiv=["']refresh["']/i.test(html);
}

export function buildCatalogue(repoRoot) {
  const navPages = flattenNav(parseNav(readFileSync(join(repoRoot, NAV_SOURCE), 'utf8')));
  const inNav = new Set(navPages.map((page) => page.href));
  const extras = EXTRA_PAGES.filter((page) => !inNav.has(page.href))
    .map((page) => ({ ...page, navGroup: null, navGroupId: null, subgroup: null }));
  return {
    source: NAV_SOURCE,
    generator: 'scripts/build-lab-nav-catalogue.mjs',
    pages: [...navPages, ...extras].map((page) => ({
      route: ROUTE_PREFIX + page.href,
      label: page.label,
      navGroup: page.navGroup,
      navGroupId: page.navGroupId,
      subgroup: page.subgroup,
      inNav: inNav.has(page.href),
      tracked: isTrackable(repoRoot, page.href),
    })),
  };
}
