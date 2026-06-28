/**
 * Profile Viewer site-clone demos — {slug}-demo.html + {slug}-demo-assets/ (Sky / MOD pattern).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const PV_DEMO_GCS_PREFIX = 'profile-viewer-demos';
const NAV_MANIFEST_PATH = `${PV_DEMO_GCS_PREFIX}/brand-scraper-demo-nav.json`;

/** Committed lab demos — do not overwrite via scraper. */
const RESERVED_DEMO_SLUGS = new Set([
  'sky', 'mod', 'fnb', 'oldmutual', 'old-mutual', 'etihad', 'ksia', 'starbucks',
  'alshaya', 'race-for-life', 'raceforlife', 'rocco-forte', 'roccoforte', 'jlr',
  'navigator', 'aviva', 'premier-inn', 'premierinn',
]);

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function repoRoot() {
  return String(process.env.LAB_REPO_ROOT || process.env.BRAND_SCRAPER_REPO_ROOT || '').trim();
}

function normalizeFileSlug(raw) {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base.slice(0, 80) || 'brand';
}

function demoHtmlName(fileSlug) {
  return `${fileSlug}-demo.html`;
}

function demoAssetsDirName(fileSlug) {
  return `${fileSlug}-demo-assets`;
}

function profileViewerDemoHref(fileSlug) {
  return demoHtmlName(fileSlug);
}

function profileViewerDemoUrl(fileSlug) {
  return `/profile-viewer/${demoHtmlName(fileSlug)}`;
}

function envPrefix(fileSlug) {
  return fileSlug.replace(/-/g, '').slice(0, 12) || 'brand';
}

function displayBrandName(record, fileSlug) {
  return String(
    (record && record.customerName)
    || (record && record.brandName)
    || fileSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  ).trim();
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsString(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function gcsObjectKey(fileSlug, relFile) {
  return `${PV_DEMO_GCS_PREFIX}/${fileSlug}/${relFile}`;
}

function localProfileViewerPaths(fileSlug) {
  const root = repoRoot();
  if (!root) return null;
  return {
    html: path.join(root, 'web', 'profile-viewer', demoHtmlName(fileSlug)),
    assetsDir: path.join(root, 'web', 'profile-viewer', demoAssetsDirName(fileSlug)),
  };
}

function buildShellHtml({ fileSlug, record, snapshotRelPath }) {
  const brand = displayBrandName(record, fileSlug);
  const prefix = envPrefix(fileSlug);
  const frameId = `${prefix}DemoSiteFrame`;
  const messageId = `${prefix}Message`;
  const assetsDir = demoAssetsDirName(fileSlug);
  const frameSrc = snapshotRelPath || `${assetsDir}/index.html`;
  const siteUrl = (record && (record.baseUrl || record.url)) || '';
  const siteLink = siteUrl
    ? ` Hero imagery and fonts may still load from <a href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener">${escapeHtml(siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a> CDNs where the save did not include local copies.`
    : '';
  const bodyClass = `${fileSlug}-demo-page mod-demo-page home-dashboard-concierge`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');else d.removeAttribute('data-aep-theme');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');else d.removeAttribute('data-sidebar-collapsed');var mp=localStorage.getItem('aepMenuPalette');if(mp&&mp!=='default')d.setAttribute('data-aep-menu-palette',mp);else d.removeAttribute('data-aep-menu-palette');var bp=localStorage.getItem('aepBgPreset');if(bp&&bp!=='default')d.setAttribute('data-aep-bg-preset',bp);else d.removeAttribute('data-aep-bg-preset');var st=localStorage.getItem('aepHomeDashboardSidebarTheme');if(st==='light')d.setAttribute('data-ajo-sidebar','light');else d.setAttribute('data-ajo-sidebar','dark');}catch(e){}})();</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brand)} (demo) – AEP Profile Viewer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="home.css?v=20260514-customer-demos-nav">
  <link rel="stylesheet" href="mod-demo.css?v=20260526-bc-env-grid">
  <link rel="stylesheet" href="site-clone-bc.css?v=20260614-modal-dock-parity">
  <link rel="stylesheet" href="brand-concierge-controls.css?v=20260520-bc-controls">
  <link rel="stylesheet" href="aep-profile-drawer.css?v=20260521-refresh-btn-lightfix">
  <link rel="stylesheet" href="shared/profile-viewer-modal.css?v=20260601-modal-central">
  <link rel="stylesheet" href="aep-theme.css?v=20260423b-fs-helper">
  <link rel="stylesheet" href="aep-theme-palettes.css?v=20260416c">
  <script>
    window.SiteCloneBcPage = {
      iframeId: '${frameId}',
      defaultFrameSrc: '${escapeJsString(frameSrc)}',
      snapshotLayout: '${escapeJsString(fileSlug)}-home',
      statusMessageId: '${messageId}',
    };
  </script>
  <script src="embed-bc/embed-bc-edge-path.js?v=20260519-bc-poll-fix"></script>
</head>
<body class="${bodyClass}">
  <div class="mod-demo-top-anchor" id="${prefix}DemoTopAnchor">
    <div class="mod-demo-id-banner" role="region" aria-label="Customer identity">
      <div class="mod-demo-id-inner aep-demo-id-inner"
        data-demo-env-strip-mount="site-clone-shell"
        data-demo-env-strip-variant="spectrum"
        data-demo-env-strip-title="${escapeHtml(brand)} (web)"
        data-demo-env-strip-subtitle="Active Configuration"
        data-demo-env-strip-prefix="${prefix}"
        data-demo-env-strip-selected-script-id="${prefix}SelectedScript"
        data-demo-env-strip-script-preview-class="mod-demo-script-preview"
        data-demo-env-strip-message-id="${messageId}"
        data-demo-env-strip-profile-btn-label="Look up profile"
        data-demo-env-strip-bc-bottom="1"
        data-demo-env-strip-disclaimer="Brand scrape demo — embedded snapshot from uploaded or scraped brand content.${siteLink} Not affiliated with ${escapeHtml(brand)}."></div>
    </div>
  </div>

  <div id="siteCloneBcFrameHost" class="site-clone-bc-frame-host" hidden>
    <div id="siteCloneBcFrameMount" class="site-clone-bc-frame-mount"></div>
  </div>

  <iframe
    id="${frameId}"
    class="mod-demo-site-frame"
    title="${escapeHtml(brand)} — brand snapshot (embedded)"
    src="${escapeHtml(frameSrc)}"
    referrerpolicy="no-referrer-when-downgrade"
    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    loading="eager"
  ></iframe>

  <button type="button" id="siteCloneBcFab" class="aep-bc-reopen-btn site-clone-bc-fab" hidden aria-label="Open Brand Concierge" aria-expanded="false" aria-controls="aepBcModal">
    <img src="https://contenthosting.web.app/logos/adobe_icon_146235.webp" alt="" width="48" height="48" decoding="async" />
  </button>

  <div id="aepBcModal" class="aep-bc-modal" role="dialog" aria-modal="true" aria-labelledby="aepBcModalTitle" hidden>
    <button type="button" class="aep-bc-modal__backdrop" data-aep-bc-close aria-label="Close dialog"></button>
    <div class="aep-bc-modal__dialog">
      <button type="button" class="aep-bc-modal__close" data-aep-bc-close aria-label="Close Brand Concierge">&times;</button>
      <h2 id="aepBcModalTitle" class="visually-hidden">Brand Concierge</h2>
      <div id="brand-concierge-mount" class="aep-bc-modal__mount"></div>
    </div>
  </div>

  <div class="mod-demo-sidebar-hover-zone" id="${prefix}DemoSidebarHoverZone" aria-hidden="true"></div>
  <div class="dashboard-shell">
    <aside class="dashboard-sidebar" aria-label="Primary"></aside>
    <div class="dashboard-main-wrap">
      <main class="dashboard-main app-page mod-demo-empty-main" aria-hidden="true"></main>
    </div>
  </div>

  <div id="profileViewerModalMount" data-aep-profile-viewer-modal-mount="1"></div>

  <script src="firebase-database-config.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script src="aep-global-sandbox.js"></script>
  <script src="aep-lab-sandbox-sync.js?v=20260514-id-token-health"></script>
  <script src="email-cache.js"></script>
  <script src="identity-picker.js"></script>
  <script src="email-engagement-metrics.js"></script>
  <script src="shared/profile-viewer-modal.js?v=20260601-modal-central"></script>
  <script src="aep-profile-drawer.js?v=20260521-ns-autodetect"></script>
  <script src="aep-demo-web-push.js?v=20260512-lab-push"></script>
  <script src="shared/env-bar.js?v=20260625-datastream-paste-row-ensure"></script>
  <script>
    window.envBarConfig = { prefix: '${prefix}', variant: 'spectrum', features: { webPush: true, bc: true, decisioning: true } };
    window.SiteCloneDemoEnv = {
      storagePrefix: '${prefix}Demo',
      webPushBySandboxKey: '${prefix}DemoWebPushOnInjectBySandbox',
      webPushLegacyKey: '${prefix}DemoWebPushOnInjectToggle',
      webPushToggleId: '${prefix}WebPushOnInjectToggle',
      bcOnInjectToggleId: '${prefix}BcOnInjectToggle',
      bcStyleSelectId: '${prefix}BcStyleSelect',
    };
  </script>
  <script src="aep-demo-generator-targets.js?v=20260508"></script>
  <script src="brand-concierge-styles-bundle.js?v=20260520-bc-bundle"></script>
  <script src="brand-concierge-toggle.js?v=20260625-bc-aep-events-ecid"></script>
  <script src="site-clone-bc.js?v=20260614-modal-dock-parity"></script>
  <div id="brand-concierge-mount-host" aria-live="polite" hidden>
    <button type="button" id="aepBcDismissBtn" class="aep-bc-dismiss-btn" aria-label="Close Brand Concierge">×</button>
  </div>
  <script src="brand-concierge-controls.js?v=20260520-bc-controls"></script>
  <script defer src="aep-theme.js?v=20260421-fs-helper"></script>
  <script defer src="aep-theme-prefs.js?v=20260416d"></script>
  <script defer src="aep-lab-nav.js?v=20260527-sky-demo"></script>
</body>
</html>`;
}

function buildNavEntry({ fileSlug, record, sandbox, scrapeId }) {
  const brand = displayBrandName(record, fileSlug);
  const navId = `demoScrape${fileSlug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase()).replace(/-/g, '')}`;
  return {
    id: navId,
    label: brand,
    fileSlug,
    href: profileViewerDemoHref(fileSlug),
    customerName: brand,
    scrapeId: scrapeId || (record && record.scrapeId) || null,
    sandbox: sandbox || null,
    inDevelopment: true,
    demoMeta: { owners: ['kirkham'], source: 'brand_scraper' },
    updatedAt: new Date().toISOString(),
  };
}

async function readNavManifest() {
  try {
    const file = getBucket().file(NAV_MANIFEST_PATH);
    const [exists] = await file.exists();
    if (!exists) return { updatedAt: null, entries: [] };
    const [buf] = await file.download();
    const data = JSON.parse(buf.toString('utf8'));
    return { updatedAt: data.updatedAt || null, entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch (_e) {
    return { updatedAt: null, entries: [] };
  }
}

async function upsertNavManifestEntry(entry) {
  const manifest = await readNavManifest();
  const entries = manifest.entries.filter((e) => e.fileSlug !== entry.fileSlug && e.href !== entry.href);
  entries.unshift(entry);
  const payload = {
    updatedAt: new Date().toISOString(),
    entries: entries.slice(0, 120),
  };
  await getBucket().file(NAV_MANIFEST_PATH).save(JSON.stringify(payload, null, 2), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=60' },
  });
  return payload;
}

async function gcsDemoExists(fileSlug) {
  try {
    const [exists] = await getBucket().file(gcsObjectKey(fileSlug, demoHtmlName(fileSlug))).exists();
    return exists;
  } catch (_e) {
    return false;
  }
}

async function localDemoExists(fileSlug) {
  const local = localProfileViewerPaths(fileSlug);
  if (!local) return false;
  try {
    return fs.existsSync(local.html);
  } catch (_e) {
    return false;
  }
}

async function detectExistingProfileViewerDemo(fileSlug) {
  if (await gcsDemoExists(fileSlug)) {
    return { kind: 'gcs', fileSlug, href: profileViewerDemoHref(fileSlug) };
  }
  const local = localProfileViewerPaths(fileSlug);
  if (local && fs.existsSync(local.html)) {
    return { kind: 'local', fileSlug, href: profileViewerDemoHref(fileSlug) };
  }
  return null;
}

/**
 * Remove a scraper-generated Profile Viewer demo from GCS, nav manifest, and local repo paths.
 * @param {string} fileSlug
 * @returns {Promise<{ deleted: boolean, fileSlug: string, gcsObjects: number, navRemoved: boolean, localRemoved: boolean }>}
 */
async function deleteProfileViewerDemo(fileSlug) {
  const slug = normalizeFileSlug(fileSlug);
  if (!slug || RESERVED_DEMO_SLUGS.has(slug)) {
    return { deleted: false, fileSlug: slug, gcsObjects: 0, navRemoved: false, localRemoved: false };
  }

  const bucket = getBucket();
  const prefix = `${PV_DEMO_GCS_PREFIX}/${slug}/`;
  let gcsObjects = 0;
  try {
    const [files] = await bucket.getFiles({ prefix });
    gcsObjects = files.length;
    await Promise.all(files.map((f) => f.delete().catch(() => {})));
  } catch (_e) {
    gcsObjects = 0;
  }

  let navRemoved = false;
  try {
    const manifest = await readNavManifest();
    const before = manifest.entries.length;
    const entries = manifest.entries.filter((e) => e.fileSlug !== slug && e.href !== profileViewerDemoHref(slug));
    if (entries.length !== before) {
      navRemoved = true;
      await getBucket().file(NAV_MANIFEST_PATH).save(JSON.stringify({
        updatedAt: new Date().toISOString(),
        entries: entries.slice(0, 120),
      }, null, 2), {
        contentType: 'application/json; charset=utf-8',
        resumable: false,
        metadata: { cacheControl: 'public, max-age=60' },
      });
    }
  } catch (_e) {
    navRemoved = false;
  }

  let localRemoved = false;
  const local = localProfileViewerPaths(slug);
  if (local) {
    try {
      if (fs.existsSync(local.html)) {
        fs.unlinkSync(local.html);
        localRemoved = true;
      }
      if (fs.existsSync(local.assetsDir)) {
        fs.rmSync(local.assetsDir, { recursive: true, force: true });
        localRemoved = true;
      }
    } catch (_e) {
      localRemoved = false;
    }
  }

  return {
    deleted: gcsObjects > 0 || localRemoved,
    fileSlug: slug,
    gcsObjects,
    navRemoved,
    localRemoved,
  };
}

async function uploadProfileViewerDemoFiles(fileSlug, files) {
  const bucket = getBucket();
  for (const f of files) {
    await bucket.file(gcsObjectKey(fileSlug, f.name)).save(f.content, {
      contentType: f.contentType || 'application/octet-stream',
      resumable: false,
      metadata: { cacheControl: 'public, max-age=300' },
    });
  }
}

function writeLocalProfileViewerDemoFiles(fileSlug, files) {
  const local = localProfileViewerPaths(fileSlug);
  if (!local) return false;
  fs.mkdirSync(local.assetsDir, { recursive: true });
  for (const f of files) {
    const dest = f.name === demoHtmlName(fileSlug)
      ? local.html
      : path.join(path.dirname(local.html), f.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.content);
  }
  return true;
}

/**
 * Map inner demo files to profile-viewer asset paths ({slug}-demo-assets/…).
 * @param {Array<{ name: string, content: Buffer, contentType?: string }>} innerFiles
 */
function mapInnerFilesToAssetPaths(fileSlug, innerFiles) {
  const assetsPrefix = `${demoAssetsDirName(fileSlug)}/`;
  return (innerFiles || []).map((f) => {
    if (!f || !f.name) return f;
    if (f.name === 'index.html') return { ...f, name: `${assetsPrefix}index.html` };
    if (f.name === 'demo-lab.js') return null;
    if (f.name.startsWith(assetsPrefix)) return f;
    return { ...f, name: `${assetsPrefix}${f.name.replace(/^\/+/, '')}` };
  }).filter(Boolean);
}

module.exports = {
  RESERVED_DEMO_SLUGS,
  NAV_MANIFEST_PATH,
  normalizeFileSlug,
  demoHtmlName,
  demoAssetsDirName,
  profileViewerDemoHref,
  profileViewerDemoUrl,
  buildShellHtml,
  buildNavEntry,
  readNavManifest,
  upsertNavManifestEntry,
  detectExistingProfileViewerDemo,
  deleteProfileViewerDemo,
  uploadProfileViewerDemoFiles,
  writeLocalProfileViewerDemoFiles,
  mapInnerFilesToAssetPaths,
  gcsObjectKey,
  displayBrandName,
};
