#!/usr/bin/env node
/**
 * Guardrails: site-clone demos with decisioning enabled must expose mount zones
 * in iframe HTML, parent doc, journey chrome, or sky-home dynamic-only waiver.
 * @see CONTRIBUTING.md § Decisioning mount zones (site-clone demos)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pv = path.join(root, 'web/profile-viewer');

/** Align with scripts/verify-demo-env-strip.mjs */
const SITE_CLONE_DEMO_HTML = [
  'sky-demo.html',
  'jlr-demo.html',
  'mod-demo.html',
  'premier-inn-demo.html',
  'etihad-demo.html',
  'qia-demo.html',
  'ksia-demo.html',
  'starbucks-demo.html',
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

const JOURNEY_CHROME_JS = [
  'demos/ksia/ksia-journey-chrome.js',
  'demos/aviva-target/aviva-target-journey-chrome.js',
];

/**
 * Demos not yet migrated to static mount zones in iframe HTML (Phase 3+).
 * Remove entries as snippets land; see CONTRIBUTING.md § Decisioning mount zones.
 */
const MOUNT_ZONES_MIGRATION_PENDING = new Set([
]);

/** Lowercase-only spellings — do not match canonical #TopRibbon / #ContentCardContainer */
const FORBIDDEN_ID_RE = /id=["']topribbon["']|id=["']contentcardarea["']/;

let failed = false;

function fail(msg) {
  console.error(msg);
  failed = true;
}

function read(rel) {
  return fs.readFileSync(path.join(pv, rel), 'utf8');
}

function readIfExists(rel) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function isDecisioningDisabled(shellHtml) {
  if (shellHtml.includes('data-demo-env-strip-decisioning="0"')) return true;
  if (/features:\s*\{[^}]*decisioning:\s*false/i.test(shellHtml)) return true;
  if (/decisioning:\s*false/i.test(shellHtml) && shellHtml.includes('envBarConfig')) return true;
  return false;
}

function usesParentDocument(shellHtml) {
  if (/useParentDocument:\s*true/i.test(shellHtml)) return true;
  if (/decisioning:\s*\{[^}]*useParentDocument:\s*true/i.test(shellHtml)) return true;
  return false;
}

function allowsDynamicOnly(shellHtml, rel) {
  if (/decisioning-mounts:\s*dynamic-only/i.test(shellHtml)) return true;
  if (/mountLayoutPreset:\s*['"]sky-home['"]/i.test(shellHtml)) return true;
  if (/snapshotLayout:\s*['"]sky-home['"]/i.test(shellHtml)) return true;
  const prefixMatch = shellHtml.match(/prefix:\s*['"](\w+)['"]/);
  if (prefixMatch && prefixMatch[1] === 'sky') return true;
  if (rel === 'sky-demo.html') return true;
  return false;
}

function hasMountZones(html) {
  if (!html) return false;
  if (FORBIDDEN_ID_RE.test(html)) return false;
  if (/decisioning-mounts:\s*dynamic-only/i.test(html)) return true;
  const hasRibbon = /id=["']TopRibbon["']/i.test(html);
  const hasHero = /id=["']hero-banner["']/i.test(html) || /data-hero-mount/i.test(html);
  const hasCards = /id=["']ContentCardContainer["']/i.test(html);
  return hasRibbon && hasHero && hasCards;
}

function extractIframeSrc(shellHtml) {
  const m = shellHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return m ? m[1].split('?')[0] : '';
}

function resolveIframePath(shellRel, src) {
  if (!src) return '';
  const shellDir = path.dirname(shellRel);
  const joined = path.normalize(path.join(shellDir, src)).replace(/\\/g, '/');
  return joined;
}

function usesJourneyChrome(shellHtml) {
  return /mode:\s*['"]journey['"]/i.test(shellHtml);
}

for (const rel of SITE_CLONE_DEMO_HTML) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing site-clone demo HTML: ${rel}`);
    continue;
  }

  const shellHtml = read(rel);

  if (FORBIDDEN_ID_RE.test(shellHtml)) {
    fail(`${rel}: forbidden mount id spelling (#topribbon / #contentcardarea) — use #TopRibbon / #ContentCardContainer`);
  }

  if (isDecisioningDisabled(shellHtml)) continue;

  if (MOUNT_ZONES_MIGRATION_PENDING.has(rel)) {
    console.warn(`verify-decisioning-mount-zones: pending migration (skipped): ${rel}`);
    continue;
  }

  const parentDocMode = usesParentDocument(shellHtml);
  const iframeSrc = extractIframeSrc(shellHtml);
  const iframeRel = iframeSrc ? resolveIframePath(rel, iframeSrc) : '';
  const iframeHtml = iframeRel ? readIfExists(iframeRel) : null;

  if (parentDocMode || !iframeSrc) {
    if (!hasMountZones(shellHtml) && !allowsDynamicOnly(shellHtml, rel)) {
      fail(
        `${rel}: decisioning enabled + parent-document mode — add mount zones to shell HTML or decisioning-mounts: dynamic-only (sky-home only)`,
      );
    }
    continue;
  }

  if (!iframeHtml) {
    fail(`${rel}: decisioning enabled but iframe src missing or unreadable: ${iframeRel || iframeSrc}`);
    continue;
  }

  if (FORBIDDEN_ID_RE.test(iframeHtml)) {
    fail(`${iframeRel}: forbidden mount id spelling — use #TopRibbon / #ContentCardContainer`);
  }

  const iframeOk = hasMountZones(iframeHtml) || allowsDynamicOnly(shellHtml, rel);
  const journeyOk =
    usesJourneyChrome(shellHtml) &&
    JOURNEY_CHROME_JS.some((chromeRel) => {
      const chrome = readIfExists(chromeRel);
      return chrome && /decisioning-mount-zones-inject|DecisioningMountZones/.test(chrome);
    });

  if (!iframeOk && !journeyOk) {
    fail(
      `${rel}: decisioning enabled — iframe ${iframeRel} needs #TopRibbon + (#hero-banner or data-hero-mount) + #ContentCardContainer, sky-home dynamic-only waiver, or journey chrome injector`,
    );
  }
}

for (const chromeRel of JOURNEY_CHROME_JS) {
  const chrome = readIfExists(chromeRel);
  if (!chrome) continue;
  if (/decisioning:\s*true/i.test(chrome) || /decisioning:\s*true/.test(chrome)) {
    if (!/decisioning-mount-zones-inject|DecisioningMountZones/.test(chrome)) {
      fail(`${chromeRel}: decisioning journey chrome must call shared/decisioning-mount-zones-inject.js`);
    }
  }
}

const fragmentPath = path.join(pv, 'shared/decisioning-mount-zones.fragment.html');
if (!fs.existsSync(fragmentPath)) {
  fail('Missing canonical fragment: shared/decisioning-mount-zones.fragment.html');
} else {
  const fragment = fs.readFileSync(fragmentPath, 'utf8');
  if (!fragment.includes('id="TopRibbon"') || !fragment.includes('id="hero-banner"') || !fragment.includes('id="ContentCardContainer"')) {
    fail('shared/decisioning-mount-zones.fragment.html: missing canonical zone ids');
  }
}

if (failed) {
  console.error('\nverify-decisioning-mount-zones: FAILED');
  process.exit(1);
}

console.log('verify-decisioning-mount-zones: OK');
