/**
 * Profile Viewer site-clone demos — paired web/mobile shells + shared {slug}-demo-assets/.
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
  'navigator', 'aviva', 'premier-inn', 'premierinn', 'tui',
]);

/** Matches Global values → Demos sidebar lab owner presets. */
const LAB_OWNER_PRESETS = new Set(['apalmer', 'sburch', 'kirkham', 'prisacar']);

function normalizeLabOwnerHandle(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 64);
}

/**
 * Resolve sidebar owner for brand-scraper demos (Global values → Mine filter).
 * Prefers explicit labOwnerHandle from the client; else sandbox when it is a known preset.
 */
function resolveDemoNavOwnerHandle(opts = {}) {
  const explicit = normalizeLabOwnerHandle(opts.labOwnerHandle || opts.demoNavOwnerHandle);
  if (explicit) return explicit;
  const sb = normalizeLabOwnerHandle(opts.sandbox);
  if (sb && LAB_OWNER_PRESETS.has(sb)) return sb;
  return 'apalmer';
}

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

function mobileDemoHtmlName(fileSlug) {
  return `${fileSlug}-mobile-demo.html`;
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

function profileViewerMobileDemoUrl(fileSlug) {
  return `/profile-viewer/${mobileDemoHtmlName(fileSlug)}`;
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
    mobileHtml: path.join(root, 'web', 'profile-viewer', mobileDemoHtmlName(fileSlug)),
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
        data-demo-env-strip-web-url="${demoHtmlName(fileSlug)}"
        data-demo-env-strip-mobile-url="${mobileDemoHtmlName(fileSlug)}"
        data-demo-env-strip-channel="web"
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
    window.envBarConfig = { prefix: '${prefix}', variant: 'spectrum', features: { webPush: true, bc: true, decisioning: true }, labCoreScript: 'brand-scraper-site-clone-lab-core.js?v=20260701-site-clone-login' };
    window.SiteCloneDemoEnv = {
      fileSlug: '${escapeJsString(fileSlug)}',
      storagePrefix: '${prefix}Demo',
      webPushBySandboxKey: '${prefix}DemoWebPushOnInjectBySandbox',
      webPushLegacyKey: '${prefix}DemoWebPushOnInjectToggle',
      webPushToggleId: '${prefix}WebPushOnInjectToggle',
      bcOnInjectToggleId: '${prefix}BcOnInjectToggle',
      bcStyleSelectId: '${prefix}BcStyleSelect',
    };
  </script>
  <script src="aep-demo-generator-targets.js?v=20260508"></script>
  <script src="site-clone-login-shell.js?v=20260701-site-clone-login"></script>
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

function buildMobileShellHtml({ fileSlug, record, snapshotRelPath }) {
  const brand = displayBrandName(record, fileSlug);
  const prefix = envPrefix(fileSlug);
  const frameId = `${prefix}MobileFrame`;
  const messageId = `${prefix}Message`;
  const assetsDir = demoAssetsDirName(fileSlug);
  const frameSrc = snapshotRelPath || `${assetsDir}/index.html`;
  const webHref = demoHtmlName(fileSlug);
  const mobileHref = mobileDemoHtmlName(fileSlug);
  const siteUrl = (record && (record.baseUrl || record.url)) || '';
  const siteLink = siteUrl
    ? ` The responsive view uses the captured content from <a href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener">${escapeHtml(siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>.`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');else d.removeAttribute('data-aep-theme');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');else d.removeAttribute('data-sidebar-collapsed');var mp=localStorage.getItem('aepMenuPalette');if(mp&&mp!=='default')d.setAttribute('data-aep-menu-palette',mp);else d.removeAttribute('data-aep-menu-palette');var bp=localStorage.getItem('aepBgPreset');if(bp&&bp!=='default')d.setAttribute('data-aep-bg-preset',bp);else d.removeAttribute('data-aep-bg-preset');var st=localStorage.getItem('aepHomeDashboardSidebarTheme');if(st==='light')d.setAttribute('data-ajo-sidebar','light');else d.setAttribute('data-ajo-sidebar','dark');}catch(e){}})();</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brand)} mobile (demo) – AEP Profile Viewer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="home.css?v=20260514-customer-demos-nav">
  <link rel="stylesheet" href="mod-demo.css?v=20260526-bc-env-grid">
  <link rel="stylesheet" href="mobile-demo.css?v=20260614-no-browser-fs">
  <link rel="stylesheet" href="shared/mobile-demo-shell.css?v=20260622-mobile-env-fs">
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
      snapshotLayout: '${escapeJsString(fileSlug)}-mobile',
      statusMessageId: '${messageId}',
      channel: 'mobile',
    };
    window.mobileDemoConfig = {
      demoId: '${escapeJsString(fileSlug)}',
      brandName: '${escapeJsString(brand)}',
      appEntryUrl: '${escapeJsString(frameSrc)}',
      defaultDevice: 'iphone17pro',
      deviceToggleDevices: ['iphone17pro', 's24u'],
      envBar: true,
      envBarPrefix: '${prefix}',
      iframeId: '${frameId}',
      webDemoUrl: '${webHref}',
      mobileDemoUrl: '${mobileHref}',
      pageClass: '${escapeJsString(fileSlug)}-mobile-demo-page',
      channelLabel: 'Mobile',
    };
  </script>
  <script src="embed-bc/embed-bc-edge-path.js?v=20260519-bc-poll-fix"></script>
</head>
<body class="${fileSlug}-mobile-demo-page mobile-demo-shell-page mobile-demo-page home-dashboard-concierge">
  <div class="mobile-demo-shell-env-anchor" id="${prefix}MobileDemoEnvAnchor">
    <section class="mod-demo-id-banner mobile-demo-shell-id-banner" aria-label="${escapeHtml(brand)} mobile demo controls">
      <div class="mod-demo-id-inner aep-demo-id-inner"
        data-demo-env-strip-mount="site-clone-shell"
        data-demo-env-strip-variant="spectrum"
        data-demo-env-strip-title="${escapeHtml(brand)} (mobile)"
        data-demo-env-strip-web-url="${webHref}"
        data-demo-env-strip-mobile-url="${mobileHref}"
        data-demo-env-strip-channel="mobile"
        data-demo-env-strip-subtitle="Active Configuration"
        data-demo-env-strip-prefix="${prefix}"
        data-demo-env-strip-selected-script-id="${prefix}SelectedScript"
        data-demo-env-strip-script-preview-class="mod-demo-script-preview"
        data-demo-env-strip-message-id="${messageId}"
        data-demo-env-strip-profile-btn-label="Look up profile"
        data-demo-env-strip-bc-bottom="1"
        data-demo-env-strip-disclaimer="Brand scrape mobile demo — the captured site rendered at phone viewport dimensions.${siteLink} Not affiliated with ${escapeHtml(brand)}."></div>
    </section>
  </div>

  <div id="siteCloneBcFrameHost" class="site-clone-bc-frame-host" hidden>
    <div id="siteCloneBcFrameMount" class="site-clone-bc-frame-mount"></div>
  </div>

  <div class="mobile-demo-fs-root" id="mobileDemoFsRoot">
    <div class="mobile-demo-shell-controls">
      <div class="mobile-demo-shell-device-toggle" id="mobileDemoDeviceToggle" role="group" aria-label="Device frame"></div>
      <button type="button" class="mobile-demo-fullscreen-btn" id="mobileDemoFullscreenBtn" aria-pressed="false" title="Expand simulator (presentation mode)" aria-label="Expand simulator">Expand simulator</button>
    </div>
    <div class="mobile-demo-shell-stage-wrap">
      <p class="mobile-demo-shell-device-label mobile-demo-device-label" id="mobileDemoDeviceLabel">iPhone 17 Pro · simulator</p>
      <div class="mobile-demo-stage">
        <div class="mobile-demo-frame-outer">
          <div class="mobile-demo-bezel mobile-demo-bezel--apple" id="mobileDemoBezel">
            <div class="mobile-demo-notch mobile-demo-notch--dynamic-island" id="mobileDemoNotch" aria-hidden="true"></div>
            <div class="mobile-demo-viewport mobile-demo-viewport--with-status" id="mobileDemoViewport">
              <div class="mobile-demo-status-bar mobile-demo-status-bar--ios" id="mobileDemoStatusBar" aria-hidden="true"></div>
              <div class="mobile-demo-viewport-clip">
                <iframe id="${frameId}" title="${escapeHtml(brand)} mobile website preview" src="${escapeHtml(frameSrc)}" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <button type="button" class="mobile-demo-fs-exit-float" id="mobileDemoFsExitFloat" hidden aria-label="Exit presentation">Exit presentation</button>
  </div>

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

  <div class="dashboard-shell">
    <aside class="dashboard-sidebar" aria-label="Primary"></aside>
    <div class="dashboard-main-wrap"><main class="dashboard-main app-page mod-demo-empty-main" aria-hidden="true"></main></div>
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
    window.envBarConfig = {
      prefix: '${prefix}', variant: 'spectrum', features: { webPush: true, bc: true, decisioning: true },
      storagePrefix: '${prefix}Demo', iframeIds: ['${frameId}'],
      decisioning: { mountLayoutPreset: 'generic', viewName: '${escapeJsString(brand)} (mobile)', iframeId: '${frameId}' },
      labCoreScript: 'brand-scraper-site-clone-lab-core.js?v=20260701-site-clone-login'
    };
    window.SiteCloneDemoEnv = {
      fileSlug: '${escapeJsString(fileSlug)}', storagePrefix: '${prefix}Demo',
      webPushBySandboxKey: '${prefix}DemoWebPushOnInjectBySandbox', webPushLegacyKey: '${prefix}DemoWebPushOnInjectToggle',
      webPushToggleId: '${prefix}WebPushOnInjectToggle', bcOnInjectToggleId: '${prefix}BcOnInjectToggle', bcStyleSelectId: '${prefix}BcStyleSelect'
    };
  </script>
  <script src="aep-demo-generator-targets.js?v=20260508"></script>
  <script src="site-clone-login-shell.js?v=20260701-site-clone-login"></script>
  <script src="brand-concierge-styles-bundle.js?v=20260520-bc-bundle"></script>
  <script src="brand-concierge-toggle.js?v=20260625-bc-aep-events-ecid"></script>
  <script src="shared/mobile-demo-configs.js?v=20260613"></script>
  <script src="shared/mobile-demo-shell.js?v=20260622-mobile-env-fs"></script>
  <script src="site-clone-bc.js?v=20260614-modal-dock-parity"></script>
  <script>
    (function(){
      if (window.MobileDemoShell) window.MobileDemoShell.init({ config: window.mobileDemoConfig, storageKeyPrefix: '${prefix}Mobile' });
    })();
  </script>
  <div id="brand-concierge-mount-host" aria-live="polite" hidden><button type="button" id="aepBcDismissBtn" class="aep-bc-dismiss-btn" aria-label="Close Brand Concierge">×</button></div>
  <script src="brand-concierge-controls.js?v=20260520-bc-controls"></script>
  <script defer src="aep-theme.js?v=20260614-no-browser-fs"></script>
  <script defer src="aep-theme-prefs.js?v=20260416d"></script>
  <script defer src="aep-lab-nav.js?v=20260806-pdf-nav-global"></script>
</body>
</html>`;
}

function buildNavEntry({ fileSlug, record, sandbox, scrapeId, labOwnerHandle }) {
  const brand = displayBrandName(record, fileSlug);
  const navId = `demoScrape${fileSlug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase()).replace(/-/g, '')}`;
  const owner = resolveDemoNavOwnerHandle({ labOwnerHandle, sandbox });
  const sb = String(sandbox || '').trim() || null;
  const demoMeta = {
    owners: [owner],
    source: 'brand_scraper',
  };
  if (sb) demoMeta.sandboxes = [sb];
  return {
    id: navId,
    label: brand,
    fileSlug,
    href: profileViewerDemoHref(fileSlug),
    customerName: brand,
    scrapeId: scrapeId || (record && record.scrapeId) || null,
    sandbox: sb,
    inDevelopment: false,
    demoMeta,
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
    const [webExists, mobileExists] = await Promise.all([
      getBucket().file(gcsObjectKey(fileSlug, demoHtmlName(fileSlug))).exists(),
      getBucket().file(gcsObjectKey(fileSlug, mobileDemoHtmlName(fileSlug))).exists(),
    ]);
    return webExists[0] && mobileExists[0];
  } catch (_e) {
    return false;
  }
}

async function localDemoExists(fileSlug) {
  const local = localProfileViewerPaths(fileSlug);
  if (!local) return false;
  try {
    return fs.existsSync(local.html) && fs.existsSync(local.mobileHtml);
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
  let gcsDeleteFailed = false;
  try {
    const [files] = await bucket.getFiles({ prefix });
    gcsObjects = files.length;
    if (gcsObjects) {
      await bucket.deleteFiles({ prefix, force: true });
      const [remaining] = await bucket.getFiles({ prefix });
      if (remaining.length) {
        gcsDeleteFailed = true;
        gcsObjects = remaining.length;
      } else {
        gcsObjects = files.length;
      }
    }
  } catch (e) {
    gcsDeleteFailed = true;
    console.error('[deleteProfileViewerDemo] GCS delete failed', slug, String((e && e.message) || e));
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
  } catch (e) {
    navRemoved = false;
    console.error('[deleteProfileViewerDemo] nav manifest update failed', slug, String((e && e.message) || e));
  }

  let localRemoved = false;
  const local = localProfileViewerPaths(slug);
  if (local) {
    try {
      if (fs.existsSync(local.html)) {
        fs.unlinkSync(local.html);
        localRemoved = true;
      }
      if (fs.existsSync(local.mobileHtml)) {
        fs.unlinkSync(local.mobileHtml);
        localRemoved = true;
      }
      if (fs.existsSync(local.assetsDir)) {
        fs.rmSync(local.assetsDir, { recursive: true, force: true });
        localRemoved = true;
      }
    } catch (e) {
      localRemoved = false;
      console.error('[deleteProfileViewerDemo] local remove failed', slug, String((e && e.message) || e));
    }
  }

  const stillExists = await gcsDemoExists(slug);
  return {
    deleted: !stillExists && !gcsDeleteFailed,
    fileSlug: slug,
    gcsObjects,
    navRemoved,
    localRemoved,
    stillExists,
    gcsDeleteFailed,
  };
}

function isRetryableGcsUploadError(err) {
  const msg = String((err && err.message) || err);
  return /EPIPE|ECONNRESET|ETIMEDOUT|socket hang up|\b429\b|\b503\b|network/i.test(msg);
}

async function saveGcsObjectWithRetry(file, content, options, maxAttempts = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await file.save(content, options);
      return;
    } catch (e) {
      lastErr = e;
      if (!isRetryableGcsUploadError(e) || attempt >= maxAttempts) throw e;
      await new Promise((resolve) => { setTimeout(resolve, 300 * attempt * attempt); });
    }
  }
  throw lastErr;
}

async function uploadProfileViewerDemoFiles(fileSlug, files, opts = {}) {
  const bucket = getBucket();
  const list = files || [];
  const CONCURRENCY = 12;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const done = Math.min(i + CONCURRENCY, list.length);
    if (typeof opts.onProgress === 'function') {
      opts.onProgress(`Uploading demo files (${done}/${list.length})…`);
    }
    const batch = list.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (f) => {
      const size = f.content && f.content.length ? f.content.length : 0;
      const resumable = size > 256 * 1024;
      await saveGcsObjectWithRetry(bucket.file(gcsObjectKey(fileSlug, f.name)), f.content, {
        contentType: f.contentType || 'application/octet-stream',
        resumable,
        metadata: { cacheControl: 'public, max-age=300' },
      });
    }));
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
  LAB_OWNER_PRESETS,
  NAV_MANIFEST_PATH,
  normalizeLabOwnerHandle,
  resolveDemoNavOwnerHandle,
  normalizeFileSlug,
  demoHtmlName,
  mobileDemoHtmlName,
  demoAssetsDirName,
  profileViewerDemoHref,
  profileViewerDemoUrl,
  profileViewerMobileDemoUrl,
  buildShellHtml,
  buildMobileShellHtml,
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
