'use strict';

/**
 * Structural checks for the "british-airways-test" brand-scraper site-clone demo.
 * This demo was built as a manual/local test of the real upload-ingestion pipeline
 * (functions/brandScraperDemoFromUpload.js + brandScraperProfileViewerDemo.js +
 * brandScraperDemoWebsite.js) from a browser "Save Page As -> Webpage, Complete"
 * snapshot, WITHOUT any live crawl, LLM analysis, or GCS bucket access.
 *
 * The snapshot happened to be a self-capture of the already-deployed
 * british-airways-demo.html (chrome + iframe), so the browser also saved the
 * iframe's own document as "<title>_files/index.html" — that nested document
 * (the real airline marketing content) was used as the page to clone, not the
 * outer site-clone-bc app chrome. See britishAirwaysDemo.test.cjs for the
 * canonical committed "british-airways" lab demo (unrelated/untouched slug).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const canonicalRoot = path.join(repoRoot, 'web', 'profile-viewer');
const slug = 'british-airways-test';
const assetsDirName = `${slug}-demo-assets`;

function read(relativePath) {
  return fs.readFileSync(path.join(canonicalRoot, relativePath), 'utf8');
}

test('British Airways TEST web and mobile shells keep the standard lab controls', () => {
  const web = read(`${slug}-demo.html`);
  const mobile = read(`${slug}-mobile-demo.html`);

  for (const html of [web, mobile]) {
    assert.match(html, new RegExp(`data-demo-env-strip-web-url="${slug}-demo\\.html"`));
    assert.match(html, new RegExp(`data-demo-env-strip-mobile-url="${slug}-mobile-demo\\.html"`));
    assert.match(html, /id="profileViewerModalMount"/);
    assert.match(html, /window\.envBarConfig\s*=/);
    assert.match(html, /brand-scraper-site-clone-lab-core\.js/);
    assert.match(html, new RegExp(`${assetsDirName}/index\\.html`));
  }
});

test('British Airways TEST snapshot is static and AJO-addressable', () => {
  const html = read(path.join(assetsDirName, 'index.html'));
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
    .map((match) => match[1])
    .filter(Boolean);

  assert.deepEqual(scripts, [
    'generic-site-glue.js',
    '/profile-viewer/site-clone-login.js?v=20260702-site-clone-login',
  ]);
  assert.doesNotMatch(html, /<noscript\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /<source\b|\ssrcset\s*=/i);

  assert.equal((html.match(/id="TopRibbon"/g) || []).length, 1);
  assert.equal((html.match(/id="hero-banner"/g) || []).length, 1);
  assert.match(html, /id="hero-banner"[^>]*\bdata-decisioning-edge-mount="1"/);
  assert.match(html, /id="[^"]*ContentCardContainer"/);
  assert.ok((html.match(/data-ajo-insert-section=/g) || []).length > 5);

  const imageSources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map((m) => m[1]);
  assert.ok(imageSources.length > 5);

  // Locally-rewritten refs (not absolute http(s) URLs) must resolve to real
  // files under the demo assets dir. A handful of <picture>/srcset-promoted
  // images in THIS particular snapshot still point at the live, already-
  // deployed british-airways-demo-assets URL (the source page itself embeds
  // absolute production preload/srcset URLs back to its own hosting) rather
  // than a locally captured asset — expected only for this self-referential
  // test snapshot, not a general pipeline defect.
  const localImageSources = imageSources.filter((src) => !/^https?:\/\//i.test(src));
  assert.ok(localImageSources.length > 0);
  for (const src of localImageSources) {
    assert.equal(
      fs.existsSync(path.join(canonicalRoot, assetsDirName, decodeURIComponent(src))),
      true,
      src,
    );
  }
});
