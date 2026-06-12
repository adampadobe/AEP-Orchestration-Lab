#!/usr/bin/env node
/**
 * Align all site-clone demo env bars with Sky spectrum pilot.
 * Run: node scripts/migrate-spectrum-env-bar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PV = path.join(__dirname, '..', 'web/profile-viewer');

const SPECTRUM_CSS = 'demo-env-bar-spectrum.css?v=20260623-spectrum';
const SPECTRUM_JS = '20260623-spectrum';

/** @type {Record<string, { title: string, rel?: boolean, decisioning?: boolean }>} */
const DEMO_META = {
  'sky-demo.html': { title: 'Sky (web)', decisioning: true },
  'jlr-demo.html': { title: 'JLR (web)' },
  'mod-demo.html': { title: 'MOD (web)' },
  'premier-inn-demo.html': { title: 'Premier Inn (web)' },
  'etihad-demo.html': { title: 'Etihad (web)' },
  'ksia-demo.html': { title: 'KSIA (web)' },
  'admiral-demo.html': { title: 'Admiral (web)' },
  'navigator-global-demo.html': { title: 'Navigator Global (web)' },
  'race-for-life-demo.html': { title: 'Race for Life (web)' },
  'donate-demo.html': { title: 'Donate (web)' },
  'oldmutual-demo.html': { title: 'Old Mutual (web)' },
  'oldmutual-wealth.html': { title: 'Old Mutual (web)' },
  'oldmutual-insurance-for-business.html': { title: 'Old Mutual (web)' },
  'oldmutual-business-quote-thank-you.html': { title: 'Old Mutual (web)' },
  'saga-demo.html': { title: 'Saga (web)' },
  'aviva-target-demo.html': { title: 'Aviva Target (web)' },
  'social/facebook.html': { title: 'Facebook (web)', rel: true },
  'social/tiktok.html': { title: 'TikTok (web)', rel: true },
  'ferrari-world-abu-dhabi/index.html': { title: 'Ferrari World (web)', rel: true },
  'ferrari-world-abu-dhabi/booking.html': { title: 'Ferrari World (web)', rel: true },
  'seaworld-abu-dhabi/index.html': { title: 'SeaWorld (web)', rel: true },
  'wb-world-abu-dhabi/index.html': { title: 'WB World (web)', rel: true },
};

function sharedBase(rel) {
  return rel ? '../shared/' : 'shared/';
}

function patchHtml(rel) {
  const meta = DEMO_META[rel];
  if (!meta) return false;
  const filePath = path.join(PV, rel);
  let html = fs.readFileSync(filePath, 'utf8');
  const before = html;
  const base = sharedBase(meta.rel);
  const bundleCss = `${base}demo-env-bar.bundle.css`;
  const spectrumCssLink = `<link rel="stylesheet" href="${base}${SPECTRUM_CSS}">`;

  if (!html.includes('demo-env-bar-spectrum.css')) {
    html = html.replace(
      new RegExp(`(<link rel="stylesheet" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}demo-env-bar\\.bundle\\.css[^"]*">)`),
      `$1\n  ${spectrumCssLink}`,
    );
  }

  const spectrumScripts =
    `<script src="${base}demo-env-strip-spectrum.js?v=${SPECTRUM_JS}"></script>\n  ` +
    `<script src="${base}demo-env-strip.js?v=${SPECTRUM_JS}"></script>\n  ` +
    `<script src="${base}demo-env-bar-spectrum-sync.js?v=${SPECTRUM_JS}"></script>\n  `;

  html = html.replace(
    new RegExp(`<script src="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}demo-env-strip-spectrum\\.js[^"]*"><\\/script>\\s*`, 'g'),
    '',
  );
  html = html.replace(
    new RegExp(`<script src="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}demo-env-bar-spectrum-sync\\.js[^"]*"><\\/script>\\s*`, 'g'),
    '',
  );
  html = html.replace(
    new RegExp(`<script src="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}demo-env-strip\\.js[^"]*"><\\/script>`),
    spectrumScripts.trimEnd(),
  );

  if (!html.includes('data-demo-env-strip-variant="spectrum"')) {
    html = html.replace(
      /data-demo-env-strip-mount="site-clone-shell"/,
      'data-demo-env-strip-mount="site-clone-shell"\n        data-demo-env-strip-variant="spectrum"',
    );
  }

  if (!html.includes('data-demo-env-strip-title=')) {
    html = html.replace(
      /data-demo-env-strip-variant="spectrum"/,
      `data-demo-env-strip-variant="spectrum"\n        data-demo-env-strip-title="${meta.title}"\n        data-demo-env-strip-subtitle="Active Configuration"`,
    );
  }

  if (!html.includes('data-demo-env-strip-bc-bottom=')) {
    html = html.replace(
      /data-demo-env-strip-subtitle="Active Configuration"/,
      'data-demo-env-strip-subtitle="Active Configuration"\n        data-demo-env-strip-bc-bottom="1"',
    );
  }

  if (meta.decisioning !== true && !html.includes('data-demo-env-strip-decisioning=')) {
    // UI parity: show Decisioning toggle on all demos (Sky default). Omit decisioning="0".
  }

  if (html !== before) {
    fs.writeFileSync(filePath, html);
    return true;
  }
  return false;
}

function patchJourneyChrome(filePath, mountInner) {
  let js = fs.readFileSync(filePath, 'utf8');
  const before = js;
  const BUILD = '20260623-spectrum';

  js = js.replace(/var BUILD = '[^']*';/, `var BUILD = '${BUILD}';`);

  if (filePath.includes('ksia-journey-chrome')) {
    js = js.replace(
      /mountStripMarkup\(\)[\s\S]*?anchor\.innerHTML =[\s\S]*?';/,
      `mountStripMarkup() {
    if (document.getElementById('ksiaDemoTopAnchor')) return;

    document.body.classList.add('ksia-demo-page', 'home-dashboard-concierge', 'ksia-journey-chrome-page');

    var anchor = document.createElement('div');
    anchor.className = 'ksia-demo-top-anchor';
    anchor.id = 'ksiaDemoTopAnchor';
    anchor.innerHTML =
      '<section class="ksia-demo-id-banner" aria-label="KSIA demo controls">' +
      '<div class="ksia-demo-id-inner aep-demo-id-inner"' +
      ' data-demo-env-strip-mount="site-clone-shell"' +
      ' data-demo-env-strip-variant="spectrum"' +
      ' data-demo-env-strip-title="KSIA (web)"' +
      ' data-demo-env-strip-subtitle="Active Configuration"' +
      ' data-demo-env-strip-prefix="ksia"' +
      ' data-demo-env-strip-selected-script-id="ksiaSelectedScript"' +
      ' data-demo-env-strip-script-preview-class="ksia-demo-script-preview"' +
      ' data-demo-env-strip-message-id="ksiaMessage"' +
      ' data-demo-env-strip-message-class="ksia-demo-message"' +
      ' data-demo-env-strip-profile-btn-label="Look up profile"' +
      ' data-demo-env-strip-bc-bottom="1"' +
      ' data-demo-env-strip-disclaimer="King Salman International Airport journey mockup for the AEP lab. Inject your Tags property, then walk the airport journey under &lt;code&gt;demos/ksia/&lt;/code&gt;. Not affiliated with KSIA."></div>' +
      '</section>';`,
    );

    if (!js.includes('demo-env-bar-spectrum.css')) {
      js = js.replace(
        /linkCss\(PV \+ 'shared\/demo-env-bar\.bundle\.css[^']*'\);/,
        `linkCss(PV + 'shared/demo-env-bar.bundle.css?v=20260623-env-inline');
    linkCss(PV + 'shared/${SPECTRUM_CSS}');`,
      );
    }

    js = js.replace(
      /PV \+ 'shared\/demo-env-strip-spectrum\.js[^']*',\s*/g,
      '',
    );
    js = js.replace(
      /PV \+ 'shared\/demo-env-bar-spectrum-sync\.js[^']*',\s*/g,
      '',
    );
    js = js.replace(
      /PV \+ 'shared\/demo-env-strip\.js[^']*',/,
      `PV + 'shared/demo-env-strip-spectrum.js?v=${SPECTRUM_JS}',\n      PV + 'shared/demo-env-strip.js?v=${SPECTRUM_JS}',\n      PV + 'shared/demo-env-bar-spectrum-sync.js?v=${SPECTRUM_JS}',`,
    );

    if (!js.includes('aep-demo-web-push.js')) {
      js = js.replace(
        /PV \+ 'aep-profile-drawer\.js[^']*',/,
        `PV + 'aep-profile-drawer.js?v=20260521-ns-autodetect',\n      PV + 'aep-demo-web-push.js?v=20260512-lab-push',`,
      );
    }
  }

  if (filePath.includes('aviva-target-journey-chrome')) {
    js = js.replace(
      /function mountStripMarkup\(\) \{[\s\S]*?document\.body\.insertBefore\(anchor, document\.body\.firstChild\);/,
      `function mountStripMarkup() {
    if (document.getElementById('avivaTargetDemoTopAnchor')) return;

    document.body.classList.add('aviva-target-demo-page', 'home-dashboard-concierge', 'aviva-target-journey-chrome-page');

    var anchor = document.createElement('div');
    anchor.className = 'aviva-target-demo-top-anchor';
    anchor.id = 'avivaTargetDemoTopAnchor';
    anchor.innerHTML =
      '<section class="aviva-target-demo-id-banner" aria-label="Aviva Target demo controls">' +
      '<div class="aviva-target-demo-id-inner aep-demo-id-inner"' +
      ' data-demo-env-strip-mount="site-clone-shell"' +
      ' data-demo-env-strip-variant="spectrum"' +
      ' data-demo-env-strip-title="Aviva Target (web)"' +
      ' data-demo-env-strip-subtitle="Active Configuration"' +
      ' data-demo-env-strip-prefix="avivaTarget"' +
      ' data-demo-env-strip-selected-script-id="avivaTargetSelectedScript"' +
      ' data-demo-env-strip-script-preview-class="aviva-target-demo-script-preview"' +
      ' data-demo-env-strip-message-id="avivaTargetMessage"' +
      ' data-demo-env-strip-profile-btn-label="Look up profile"' +
      ' data-demo-env-strip-bc-bottom="1"' +
      ' data-demo-env-strip-disclaimer="Embedded Aviva car insurance journey for Adobe Target A/B demos. Not affiliated with Aviva."></div>' +
      '</section>';

    document.body.insertBefore(anchor, document.body.firstChild);`,
    );

    if (!js.includes('demo-env-bar-spectrum.css')) {
      js = js.replace(
        /linkCss\(PV \+ 'shared\/demo-env-bar\.bundle\.css[^']*'\);/,
        `linkCss(PV + 'shared/demo-env-bar.bundle.css?v=20260623-env-inline');
    linkCss(PV + 'shared/${SPECTRUM_CSS}');`,
      );
    }

    js = js.replace(
      /PV \+ 'aep-lab-sandbox-sync\.js\?v=20260420-theme-per-sandbox'/,
      "PV + 'aep-lab-sandbox-sync.js?v=20260514-id-token-health'",
    );

    js = js.replace(
      /PV \+ 'shared\/demo-env-strip-spectrum\.js[^']*',\s*/g,
      '',
    );
    js = js.replace(
      /PV \+ 'shared\/demo-env-bar-spectrum-sync\.js[^']*',\s*/g,
      '',
    );
    js = js.replace(
      /PV \+ 'shared\/demo-env-strip\.js[^']*',/,
      `PV + 'shared/demo-env-strip-spectrum.js?v=${SPECTRUM_JS}',\n      PV + 'shared/demo-env-strip.js?v=${SPECTRUM_JS}',\n      PV + 'shared/demo-env-bar-spectrum-sync.js?v=${SPECTRUM_JS}',`,
    );

    if (!js.includes('aep-demo-web-push.js')) {
      js = js.replace(
        /PV \+ 'aep-profile-drawer\.js[^']*',/,
        `PV + 'aep-profile-drawer.js?v=20260521-ns-autodetect',\n      PV + 'aep-demo-web-push.js?v=20260512-lab-push',`,
      );
    }
  }

  if (js !== before) {
    fs.writeFileSync(filePath, js);
    return true;
  }
  return false;
}

let changed = 0;
for (const rel of Object.keys(DEMO_META)) {
  if (patchHtml(rel)) {
    console.log('Patched HTML', rel);
    changed++;
  }
}

for (const rel of ['demos/ksia/ksia-journey-chrome.js', 'demos/aviva-target/aviva-target-journey-chrome.js']) {
  const abs = path.join(PV, rel);
  if (patchJourneyChrome(abs)) {
    console.log('Patched journey chrome', rel);
    changed++;
  }
}

console.log(`Done (${changed} files updated)`);
