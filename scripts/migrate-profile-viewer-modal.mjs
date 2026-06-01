#!/usr/bin/env node
/**
 * One-shot migrator: replace inline profile drawer HTML with shared modal mount.
 * Idempotent — skips files already migrated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PV = path.join(ROOT, 'web/profile-viewer');
const CACHE_BUST = '20260601-modal-central';
const DRAWER_RE =
  /<div class="aep-profile-drawer-hover-zone"[\s\S]*?<aside class="aep-profile-drawer" id="profileDrawer"[\s\S]*?<\/aside>/;
const MOUNT_HTML =
  '<div id="profileViewerModalMount" data-aep-profile-viewer-modal-mount="1"></div>';
const MODAL_JS = `shared/profile-viewer-modal.js?v=${CACHE_BUST}`;
const MODAL_CSS = `shared/profile-viewer-modal.css?v=${CACHE_BUST}`;

function walkHtml(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function relShared(fromFile) {
  const rel = path.relative(path.dirname(fromFile), path.join(PV, 'shared'));
  return rel.split(path.sep).join('/') + '/';
}

function migrateFile(file) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('profileViewerModalMount') && !DRAWER_RE.test(html)) {
    return { file, status: 'already-migrated' };
  }
  if (!DRAWER_RE.test(html)) {
    return { file, status: 'no-drawer-block' };
  }

  html = html.replace(DRAWER_RE, MOUNT_HTML);

  const prefix = relShared(file);
  const jsHref = prefix + 'profile-viewer-modal.js?v=' + CACHE_BUST;
  const cssHref = prefix + 'profile-viewer-modal.css?v=' + CACHE_BUST;

  if (!html.includes('profile-viewer-modal.js')) {
    html = html.replace(
      /(<script src="[^"]*aep-profile-drawer\.js[^"]*"><\/script>)/,
      `<script src="${jsHref}"></script>\n  $1`
    );
  }

  if (!html.includes('profile-viewer-modal.css')) {
    html = html.replace(
      /(<link rel="stylesheet" href="[^"]*aep-profile-drawer\.css[^"]*">)/,
      `$1\n  <link rel="stylesheet" href="${cssHref}">`
    );
  }

  fs.writeFileSync(file, html, 'utf8');
  return { file, status: 'migrated' };
}

const targets = walkHtml(PV).filter((f) => {
  const c = fs.readFileSync(f, 'utf8');
  return c.includes('aep-profile-drawer.js') || c.includes('id="profileDrawer"');
});

const results = targets.map(migrateFile);
const migrated = results.filter((r) => r.status === 'migrated');
console.log(JSON.stringify({ migrated: migrated.length, results }, null, 2));
