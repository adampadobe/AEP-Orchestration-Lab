#!/usr/bin/env node
/**
 * Scaffold a greenfield site-clone lab demo page (Spectrum env bar + iframe or parent-doc shell).
 *
 * Usage (repo root):
 *   # Iframe site clone (default) — Sky / MOD pattern
 *   node scripts/scaffold-site-clone-demo.mjs \
 *     --prefix mybrand \
 *     --title "My Brand (web)" \
 *     --output web/profile-viewer/demos/mybrand/index.html \
 *     --iframe-src demos/mybrand/snapshot.html \
 *     --lab-core demos/mybrand/mybrand-lab-core.js
 *
 *   # Parent-document demo — Race for Life pattern (mount zones on shell page, no iframe)
 *   node scripts/scaffold-site-clone-demo.mjs \
 *     --mode parent-doc \
 *     --prefix mybrand \
 *     --title "My Brand (web)" \
 *     --output web/profile-viewer/mybrand-demo.html \
 *     --lab-core mybrand-demo.js \
 *     --decisioning-view-name "My Brand"
 *
 * Options:
 *   --mode            iframe (default) | parent-doc
 *   --prefix          Required. Tags / env strip id prefix (e.g. sky, ksia).
 *   --title           Demo toolbar title (default: "{Prefix} (web)").
 *   --output          Required. Path to write HTML (relative to repo root).
 *   --iframe-src      Required for iframe mode. iframe src URL (relative to profile-viewer/).
 *   --iframe-id       iframe element id (default: "{prefix}SiteFrame" or "{prefix}DemoSiteFrame").
 *   --lab-core        Path to demo lab-core JS (relative to profile-viewer/).
 *   --storage-prefix  SiteCloneDemoEnv storage prefix (default: "{prefix}Demo").
 *   --no-decisioning  Omit decisioning feature flag.
 *   --decisioning-view-name  viewName for parent-doc decisioning config (default: --title).
 *   --no-bc-bottom    Omit BC bottom dock mount flag.
 *   --dry-run         Print HTML to stdout instead of writing.
 *
 * @see CONTRIBUTING.md § Greenfield scaffold
 * @see .cursor/skills/profile-viewer-lab-demo-strip/SKILL.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENV_BAR_MANIFEST = '20260612-env-bar';

function parseArgs(argv) {
  const out = { mode: 'iframe', decisioning: true, bcBottom: true, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-decisioning') out.decisioning = false;
    else if (arg === '--no-bc-bottom') out.bcBottom = false;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = argv[++i];
    }
  }
  if (out.mode !== 'iframe' && out.mode !== 'parent-doc') {
    throw new Error('--mode must be iframe or parent-doc');
  }
  return out;
}

function cap(s) {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function relDepth(outputPath) {
  const rel = path.relative(path.join(ROOT, 'web/profile-viewer'), outputPath);
  const depth = rel.split(path.sep).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

function buildIframeHtml(opts) {
  const prefix = String(opts.prefix || '').trim();
  if (!prefix) throw new Error('--prefix is required');
  const title = opts.title || `${cap(prefix)} (web)`;
  const iframeId = opts.iframeId || `${prefix}SiteFrame`;
  const storagePrefix = opts.storagePrefix || `${prefix}Demo`;
  const labCore = opts.labCore || `demos/${prefix}/${prefix}-lab-core.js`;
  const iframeSrc = opts.iframeSrc;
  if (!iframeSrc) throw new Error('--iframe-src is required for iframe mode');

  const base = relDepth(path.resolve(ROOT, opts.output || ''));
  const brand = prefix.replace(/[^a-z0-9]/gi, '') || 'demo';
  const messageId = `${prefix}Message`;
  const selectedScriptId = `${prefix}SelectedScript`;
  const bcBottomAttr = opts.bcBottom ? '\n        data-demo-env-strip-bc-bottom="1"' : '';
  const decisioningFeatures = opts.decisioning ? 'decisioning: true, ' : '';
  const decisioningBlock = opts.decisioning
    ? `,
      decisioning: {
        iframeId: '${iframeId}',
        mountLayoutPreset: 'generic',
        viewName: '${title.replace(/'/g, "\\'")}',
      }`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');else d.removeAttribute('data-aep-theme');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');else d.removeAttribute('data-sidebar-collapsed');}catch(e){}})();</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – AEP Profile Viewer</title>
  <link rel="stylesheet" href="${base}style.css">
  <link rel="stylesheet" href="${base}home.css?v=20260514-customer-demos-nav">
  <link rel="stylesheet" href="${base}mod-demo.css">
  <link rel="stylesheet" href="${base}site-clone-bc.css?v=20260527-site-clone-bc">
  <link rel="stylesheet" href="${base}brand-concierge-controls.css?v=20260520-bc-controls">
  <link rel="stylesheet" href="${base}aep-profile-drawer.css?v=20260521-refresh-btn-lightfix">
  <link rel="stylesheet" href="${base}shared/profile-viewer-modal.css?v=20260601-modal-central">
  <link rel="stylesheet" href="${base}aep-theme.css?v=20260423b-fs-helper">
  <script>
    window.SiteCloneBcPage = {
      iframeId: '${iframeId}',
      defaultFrameSrc: '${iframeSrc}',
      statusMessageId: '${messageId}',
    };
  </script>
</head>
<body class="mod-demo-page ${brand}-demo-page home-dashboard-concierge">
  <div class="mod-demo-top-anchor lab-env-top-anchor" id="${prefix}DemoTopAnchor">
    <div class="mod-demo-id-banner" role="region" aria-label="Customer identity">
      <div class="mod-demo-id-inner aep-demo-id-inner"
        data-demo-env-strip-mount="site-clone-shell"
        data-demo-env-strip-variant="spectrum"
        data-demo-env-strip-title="${title}"
        data-demo-env-strip-subtitle="Active Configuration"
        data-demo-env-strip-prefix="${prefix}"
        data-demo-env-strip-selected-script-id="${selectedScriptId}"
        data-demo-env-strip-message-id="${messageId}"
        data-demo-env-strip-profile-btn-label="Look up profile"${bcBottomAttr}></div>
    </div>
  </div>

  <iframe
    id="${iframeId}"
    class="mod-demo-site-frame"
    title="${title} — site snapshot (embedded)"
    src="${iframeSrc}"
    referrerpolicy="no-referrer-when-downgrade"
    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    loading="eager"
  ></iframe>

  <!-- decisioning-mounts: paste shared/decisioning-mount-zones.fragment.html into iframe snapshot HTML -->
  <!-- #TopRibbon, #hero-banner (or data-hero-mount), #ContentCardContainer -->

  <div id="profileViewerModalMount" data-aep-profile-viewer-modal-mount="1"></div>

  <script src="${base}firebase-database-config.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script src="${base}aep-global-sandbox.js"></script>
  <script src="${base}aep-lab-sandbox-sync.js?v=20260514-id-token-health"></script>
  <script src="${base}email-cache.js"></script>
  <script src="${base}identity-picker.js"></script>
  <script src="${base}shared/profile-viewer-modal.js?v=20260601-modal-central"></script>
  <script src="${base}aep-profile-drawer.js?v=20260521-ns-autodetect"></script>
  <script src="${base}aep-demo-web-push.js?v=20260512-lab-push"></script>
  <script src="${base}shared/env-bar.js?v=${ENV_BAR_MANIFEST}"></script>
  <script>
    window.envBarConfig = {
      prefix: '${prefix}',
      variant: 'spectrum',
      features: { webPush: true, bc: true, ${decisioningFeatures}}${decisioningBlock}
    };
  </script>
  <script src="${base}aep-demo-generator-targets.js?v=20260508"></script>
  <script src="${base}brand-concierge-styles-bundle.js?v=20260520-bc-bundle"></script>
  <script src="${base}brand-concierge-toggle.js?v=20260526-bc-prefs-flush"></script>
  <script>
    window.SiteCloneDemoEnv = {
      storagePrefix: '${storagePrefix}',
      webPushBySandboxKey: '${storagePrefix}WebPushOnInjectBySandbox',
      webPushLegacyKey: '${storagePrefix}WebPushOnInjectToggle',
      webPushToggleId: '${prefix}WebPushOnInjectToggle',
      bcOnInjectToggleId: '${prefix}BcOnInjectToggle',
      bcStyleSelectId: '${prefix}BcStyleSelect',
    };
  </script>
  <script src="${base}${labCore}?v=scaffold"></script>
  <script src="${base}site-clone-bc.js?v=scaffold"></script>
  <script src="${base}brand-concierge-controls.js?v=20260520-bc-controls"></script>
  <script defer src="${base}aep-theme.js?v=20260421-fs-helper"></script>
  <script defer src="${base}aep-lab-nav.js?v=scaffold"></script>
</body>
</html>
`;
}

function buildParentDocHtml(opts) {
  const prefix = String(opts.prefix || '').trim();
  if (!prefix) throw new Error('--prefix is required');
  const title = opts.title || `${cap(prefix)} (web)`;
  const viewName = opts.decisioningViewName || title;
  const storagePrefix = opts.storagePrefix || `${prefix}Demo`;
  const labCore = opts.labCore || `${prefix}-demo.js`;
  const base = relDepth(path.resolve(ROOT, opts.output || ''));
  const brand = prefix.replace(/[^a-z0-9]/gi, '') || 'demo';
  const messageId = `${prefix}Message`;
  const selectedScriptId = `${prefix}SelectedScript`;
  const bcBottomAttr = opts.bcBottom ? '\n              data-demo-env-strip-bc-bottom="1"' : '';
  const decisioningFeatures = opts.decisioning ? 'decisioning: true, ' : '';
  const decisioningBlock = opts.decisioning
    ? `,
      decisioning: {
        useParentDocument: true,
        viewName: '${viewName.replace(/'/g, "\\'")}',
        mountLayoutPreset: 'generic',
      }`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');else d.removeAttribute('data-aep-theme');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');else d.removeAttribute('data-sidebar-collapsed');}catch(e){}})();</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – AEP Profile Viewer</title>
  <link rel="stylesheet" href="${base}style.css">
  <link rel="stylesheet" href="${base}home.css?v=20260514-customer-demos-nav">
  <link rel="stylesheet" href="${base}site-clone-bc.css?v=20260527-site-clone-bc">
  <link rel="stylesheet" href="${base}${brand}-demo.css?v=scaffold">
  <link rel="stylesheet" href="${base}brand-concierge-controls.css?v=20260520-bc-controls">
  <link rel="stylesheet" href="${base}aep-profile-drawer.css?v=20260521-refresh-btn-lightfix">
  <link rel="stylesheet" href="${base}shared/profile-viewer-modal.css?v=20260601-modal-central">
  <link rel="stylesheet" href="${base}aep-theme.css?v=20260423b-fs-helper">
</head>
<body class="${brand}-page home-dashboard-concierge">
  <div class="${brand}-demo-top-anchor" id="${prefix}DemoTopAnchor">
    <section class="${brand}-demo-id-banner" aria-label="AEP lab environment and customer identity">
      <div class="${brand}-demo-id-inner aep-demo-id-inner"
        data-demo-env-strip-mount="site-clone-shell"
        data-demo-env-strip-variant="spectrum"
        data-demo-env-strip-title="${title}"
        data-demo-env-strip-subtitle="Active Configuration"
        data-demo-env-strip-prefix="${prefix}"
        data-demo-env-strip-selected-script-id="${selectedScriptId}"
        data-demo-env-strip-message-id="${messageId}"
        data-demo-env-strip-profile-btn-label="Look up profile"${bcBottomAttr}></div>
    </section>
  </div>

  <main class="${brand}-main" aria-label="${title} demo content">
    <!-- Site-clone markup goes here. Decisioning mounts on parent document (Race for Life pattern): -->
    <!-- Copy shared/decisioning-mount-zones.fragment.html below hero content -->
    <section id="TopRibbon" aria-label="Personalized top ribbon" role="region"></section>
    <section id="hero-banner" role="region" aria-label="Personalized hero"></section>
    <section id="ContentCardContainer" class="ContentCardContainer" role="region" aria-label="Content cards"></section>
  </main>

  <div id="profileViewerModalMount" data-aep-profile-viewer-modal-mount="1"></div>

  <script src="${base}firebase-database-config.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script src="${base}aep-global-sandbox.js"></script>
  <script src="${base}aep-lab-sandbox-sync.js?v=20260514-id-token-health"></script>
  <script src="${base}email-cache.js"></script>
  <script src="${base}identity-picker.js"></script>
  <script src="${base}shared/profile-viewer-modal.js?v=20260601-modal-central"></script>
  <script src="${base}aep-profile-drawer.js?v=20260521-ns-autodetect"></script>
  <script src="${base}aep-demo-web-push.js?v=20260512-lab-push"></script>
  <script src="${base}shared/env-bar.js?v=${ENV_BAR_MANIFEST}"></script>
  <script>
    window.envBarConfig = {
      prefix: '${prefix}',
      variant: 'spectrum',
      features: { webPush: true, bc: true, ${decisioningFeatures}}${decisioningBlock}
    };
  </script>
  <script src="${base}aep-demo-generator-targets.js?v=20260508"></script>
  <script src="${base}brand-concierge-styles-bundle.js?v=20260520-bc-bundle"></script>
  <script src="${base}brand-concierge-toggle.js?v=20260526-bc-prefs-flush"></script>
  <script>
    window.SiteCloneDemoEnv = {
      storagePrefix: '${storagePrefix}',
      webPushBySandboxKey: '${storagePrefix}WebPushOnInjectBySandbox',
      webPushLegacyKey: '${storagePrefix}WebPushOnInjectToggle',
      webPushToggleId: '${prefix}WebPushOnInjectToggle',
      bcOnInjectToggleId: '${prefix}BcOnInjectToggle',
      bcStyleSelectId: '${prefix}BcStyleSelect',
    };
  </script>
  <script src="${base}${labCore}?v=scaffold"></script>
  <script src="${base}site-clone-bc.js?v=scaffold"></script>
  <script defer src="${base}aep-theme.js?v=20260421-fs-helper"></script>
  <script defer src="${base}aep-lab-nav.js?v=scaffold"></script>
</body>
</html>
`;
}

function buildHtml(opts) {
  return opts.mode === 'parent-doc' ? buildParentDocHtml(opts) : buildIframeHtml(opts);
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.output) {
    console.error('scaffold-site-clone-demo: --output is required');
    process.exit(1);
  }
  if (opts.mode === 'iframe' && !opts.iframeSrc) {
    console.error('scaffold-site-clone-demo: --iframe-src is required for iframe mode');
    process.exit(1);
  }

  const html = buildHtml(opts);
  if (opts.dryRun) {
    process.stdout.write(html);
    return;
  }

  const outPath = path.resolve(ROOT, opts.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) {
    console.error(`scaffold-site-clone-demo: refusing to overwrite ${opts.output} (delete first or pick another path)`);
    process.exit(1);
  }
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`scaffold-site-clone-demo: wrote ${opts.output} (mode=${opts.mode})`);
  if (opts.mode === 'iframe') {
    console.log('Next: add decisioning mount zones to iframe snapshot HTML, implement lab-core.js, run npm run verify:demo-env-strip');
  } else {
    console.log('Next: style parent-doc markup, implement lab-core JS, add Firestore seed via export-env-bar-config-seeds.mjs, run npm run verify:demo-env-strip');
  }
}

main();
