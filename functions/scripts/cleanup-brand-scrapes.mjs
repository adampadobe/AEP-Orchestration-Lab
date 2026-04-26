#!/usr/bin/env node
/**
 * Remove failed brand-scraper index rows (and optional known test URLs) via the
 * public Hosting API. Does not require service-account keys.
 *
 * Usage:
 *   node scripts/cleanup-brand-scrapes.mjs --sandbox apalmer
 *   node scripts/cleanup-brand-scrapes.mjs --sandbox apalmer --execute
 *
 * Default is dry-run (lists IDs that would be deleted).
 */
'use strict';

const DEFAULT_BASE = 'https://aep-orchestration-lab.web.app';

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function testHost(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./i, '');
    return (
      h === 'example.com'
      || h === 'example.org'
      || h === 'iana.org'
      || h === 'localhost'
      || h === '127.0.0.1'
      || h.endsWith('.example.com')
    );
  } catch {
    return false;
  }
}

async function main() {
  const base = (arg('--base', DEFAULT_BASE) || DEFAULT_BASE).replace(/\/$/, '');
  const sandbox = (arg('--sandbox', 'apalmer') || 'apalmer').trim();
  const execute = hasFlag('--execute');

  const listUrl = `${base}/api/brand-scraper/scrapes?sandbox=${encodeURIComponent(sandbox)}`;
  const listRes = await fetch(listUrl, { method: 'GET' });
  if (!listRes.ok) {
    console.error('List failed', listRes.status, await listRes.text());
    process.exit(1);
  }
  const body = await listRes.json();
  const items = body.items || [];

  const toDelete = [];
  for (const it of items) {
    const st = it.scrapeStatus || '';
    const u = it.url || '';
    if (st === 'failed' || testHost(u)) {
      toDelete.push({ scrapeId: it.scrapeId, scrapeStatus: st, url: u });
    }
  }

  console.log(JSON.stringify({ sandbox, total: items.length, wouldDelete: toDelete.length, execute }, null, 0));
  for (const row of toDelete) {
    console.log(`${row.scrapeId}\t${row.scrapeStatus || '-'}\t${row.url}`);
  }

  if (!execute) {
    console.error('\nDry run. Pass --execute to call DELETE for each row.');
    return;
  }

  let ok = 0;
  let bad = 0;
  for (const row of toDelete) {
    const delUrl = `${base}/api/brand-scraper/scrapes/${encodeURIComponent(row.scrapeId)}?sandbox=${encodeURIComponent(sandbox)}`;
    const r = await fetch(delUrl, { method: 'DELETE' });
    if (r.ok) {
      ok += 1;
    } else {
      bad += 1;
      console.error('DELETE failed', row.scrapeId, r.status, await r.text());
    }
  }
  console.error(JSON.stringify({ deletedOk: ok, deleteFailed: bad }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
