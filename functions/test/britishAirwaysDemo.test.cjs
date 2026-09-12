'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const canonicalRoot = path.join(repoRoot, 'web', 'profile-viewer');
const mirrorRoot = path.join(repoRoot, 'aep-prototypes', 'AEP Profile', '03 Profile Viewer', 'public');

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(relativePath, entry.name);
    return entry.isDirectory() ? listFiles(root, childPath) : [childPath];
  });
}

test('British Airways web and mobile shells keep the standard lab controls', () => {
  const web = read(canonicalRoot, 'british-airways-demo.html');
  const mobile = read(canonicalRoot, 'british-airways-mobile-demo.html');

  for (const html of [web, mobile]) {
    assert.match(html, /data-demo-env-strip-web-url="british-airways-demo\.html"/);
    assert.match(html, /data-demo-env-strip-mobile-url="british-airways-mobile-demo\.html"/);
    assert.match(html, /id="profileViewerModalMount"/);
    assert.match(html, /window\.envBarConfig\s*=/);
    assert.match(html, /brand-scraper-site-clone-lab-core\.js/);
    assert.match(html, /british-airways-demo-assets\/index\.html/);
  }
});

test('British Airways snapshot is static, locally imaged, and AJO-addressable', () => {
  const relativePath = path.join('british-airways-demo-assets', 'index.html');
  const html = read(canonicalRoot, relativePath);
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
  const imageSources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
    .map((match) => match[1]);
  assert.ok(imageSources.length > 5);
  assert.ok(imageSources.every((source) => source.startsWith('assets/')));
  assert.equal((html.match(/id="TopRibbon"/g) || []).length, 1);
  assert.equal((html.match(/data-hero-mount/g) || []).length, 1);
  assert.match(html, /id="hero-banner" data-hero-mount/);
  assert.match(html, /id="[^"]*ContentCardContainer"/);
  assert.ok((html.match(/data-ajo-insert-section=/g) || []).length > 5);

  const headerAt = html.indexOf('id="header"');
  const ribbonAt = html.indexOf('id="TopRibbon"');
  const heroAt = html.indexOf('id="hero-banner"');
  assert.ok(headerAt >= 0 && headerAt < ribbonAt && ribbonAt < heroAt);

  const localRefs = [...html.matchAll(/<(?:img|link|script)\b[^>]*(?:src|href)="(assets\/[^"]+)"[^>]*>/gi)]
    .map((match) => match[1]);
  assert.ok(localRefs.length > 5);
  for (const ref of localRefs) {
    assert.equal(fs.existsSync(path.join(canonicalRoot, 'british-airways-demo-assets', ref)), true, ref);
  }
});

test('British Airways demo stays aligned with the Profile Viewer mirror', () => {
  const files = [
    'british-airways-demo.html',
    'british-airways-mobile-demo.html',
    ...listFiles(canonicalRoot, 'british-airways-demo-assets'),
  ];
  for (const file of files) {
    assert.deepEqual(
      fs.readFileSync(path.join(canonicalRoot, file)),
      fs.readFileSync(path.join(mirrorRoot, file)),
      file,
    );
  }
});
