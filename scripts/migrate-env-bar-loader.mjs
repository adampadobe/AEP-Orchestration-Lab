#!/usr/bin/env node
/**
 * Migrate site-clone demo HTML from legacy strip/bootstrap tags to shared/env-bar.js.
 * Idempotent: skips pages that already load shared/env-bar.js.
 * @see docs/env-bar-shared-module.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pv = path.join(root, 'web/profile-viewer');
const versionsPath = path.join(pv, 'shared/env-bar-versions.json');

const SITE_CLONE_DEMO_HTML = [
  'sky-demo.html',
  'jlr-demo.html',
  'mod-demo.html',
  'premier-inn-demo.html',
  'etihad-demo.html',
  'ksia-demo.html',
  'admiral-demo.html',
  'navigator-global-demo.html',
  'race-for-life-demo.html',
  'donate-demo.html',
  'oldmutual-demo.html',
  'oldmutual-wealth.html',
  'oldmutual-insurance-for-business.html',
  'oldmutual-business-quote-thank-you.html',
  'saga-demo.html',
  'aviva-target-demo.html',
  'social/facebook.html',
  'social/tiktok.html',
  'ferrari-world-abu-dhabi/index.html',
  'ferrari-world-abu-dhabi/booking.html',
  'seaworld-abu-dhabi/index.html',
  'wb-world-abu-dhabi/index.html',
];

/** Prefix → feature overrides (default: webPush + bc + decisioning). */
const FEATURE_OVERRIDES = {};

let manifestVersion = '20260612-env-bar';
try {
  const v = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  manifestVersion = v.manifestVersion || manifestVersion;
} catch {
  console.warn('Could not read env-bar-versions.json — using fallback manifest version');
}

function extractPrefix(html) {
  const m = html.match(/data-demo-env-strip-prefix="([^"]+)"/);
  return m ? m[1] : null;
}

function envBarHref(rel) {
  const depth = rel.split('/').length - 1;
  return (depth > 0 ? '../'.repeat(depth) : '') + `shared/env-bar.js?v=${manifestVersion}`;
}

function buildEnvBarInsert(rel, prefix) {
  const href = envBarHref(rel);
  const features = FEATURE_OVERRIDES[prefix] || { webPush: true, bc: true, decisioning: true };
  const featLines = Object.entries(features)
    .map(([k, v]) => `      ${k}: ${v},`)
    .join('\n');
  return [
    `  <script src="${href}"></script>`,
    '  <script>',
    '    window.envBarConfig = {',
    `      prefix: '${prefix}',`,
    "      variant: 'spectrum',",
    '      features: {',
    featLines,
    '      },',
    '    };',
    '  </script>',
  ].join('\n');
}

function removeLegacyAssets(html) {
  let out = html;
  const patterns = [
    /<link[^>]*demo-env-bar\.bundle\.css[^>]*>\s*/gi,
    /<link[^>]*demo-env-bar-spectrum\.css[^>]*>\s*/gi,
    /<script[^>]*demo-env-strip-spectrum\.js[^>]*><\/script>\s*/gi,
    /<script[^>]*demo-env-strip\.js[^>]*><\/script>\s*/gi,
    /<script[^>]*demo-env-bar-spectrum-sync\.js[^>]*><\/script>\s*/gi,
    /<script[^>]*demo-env-bar-bootstrap\.js[^>]*><\/script>\s*/gi,
    /<script[^>]*demo-tags-injection\.js[^>]*><\/script>\s*/gi,
    /<script[^>]*aep-demo-env-bar\.js[^>]*><\/script>\s*/gi,
  ];
  for (const re of patterns) {
    out = out.replace(re, '');
  }
  return out;
}

function migrateHtml(rel) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    console.warn('skip missing:', rel);
    return false;
  }
  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes('shared/env-bar.js')) {
    console.log('already migrated:', rel);
    return false;
  }
  const prefix = extractPrefix(html);
  if (!prefix) {
    console.error('no data-demo-env-strip-prefix:', rel);
    return false;
  }

  html = removeLegacyAssets(html);
  const insert = buildEnvBarInsert(rel, prefix);

  const anchorRe = /<script src="([^"]*aep-demo-web-push\.js[^"]*)"><\/script>/;
  if (anchorRe.test(html)) {
    html = html.replace(anchorRe, `$&\n${insert}`);
  } else {
    const drawerRe = /<script src="([^"]*aep-profile-drawer\.js[^"]*)"><\/script>/;
    if (drawerRe.test(html)) {
      html = html.replace(
        drawerRe,
        `$&\n  <script src="aep-demo-web-push.js?v=20260512-lab-push"></script>\n${insert}`,
      );
    } else {
      console.error('no anchor script for env-bar insert:', rel);
      return false;
    }
  }

  fs.writeFileSync(abs, html);
  console.log('migrated HTML:', rel, `(prefix=${prefix})`);
  return true;
}

let count = 0;
for (const rel of SITE_CLONE_DEMO_HTML) {
  if (migrateHtml(rel)) count += 1;
}
console.log(`migrate-env-bar-loader: ${count} HTML file(s) updated`);
