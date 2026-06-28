#!/usr/bin/env node
/**
 * Delete a scraper-generated Profile Viewer demo from GCS (+ nav manifest, local paths).
 * Uses the lab Cloud Function when local ADC is unavailable (typical on dev machines).
 *
 * Usage:
 *   node scripts/delete-profile-viewer-demo.cjs sky-news
 *   LAB_ORIGIN=https://aep-orchestration-lab.web.app node scripts/delete-profile-viewer-demo.cjs sky-news
 */
'use strict';

const pvDemo = require('../functions/brandScraperProfileViewerDemo');

const LAB_ORIGIN = String(process.env.LAB_ORIGIN || 'https://aep-orchestration-lab.web.app').replace(/\/+$/, '');

async function deleteViaApi(slug) {
  const url = `${LAB_ORIGIN}/api/brand-scraper/scrapes/demo/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

async function main() {
  const slugs = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (!slugs.length) {
    console.error('Usage: node scripts/delete-profile-viewer-demo.cjs <file-slug> [more-slugs…]');
    process.exit(1);
  }

  for (const slug of slugs) {
    let result = await pvDemo.deleteProfileViewerDemo(slug);
    if (!result.deleted || result.stillExists) {
      console.warn(`Local GCS delete incomplete for "${slug}" — calling lab API…`);
      result = await deleteViaApi(slug);
    }
    console.log(JSON.stringify(result));
    if (!result.deleted && !result.ok) {
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
