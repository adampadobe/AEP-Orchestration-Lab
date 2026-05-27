import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'web', 'profile-viewer');
const srcDir = path.join(root, 'army-bc');
const dstDir = path.join(root, 'embed-bc');

const fileMap = {
  'army-bc-edge-path.js': 'embed-bc-edge-path.js',
  'army-bc-inline.css': 'embed-bc-inline.css',
  'army-bc-disclaimer-layout.css': 'embed-bc-disclaimer-layout.css',
  'army-bc-disclaimer-layout.js': 'embed-bc-disclaimer-layout.js',
  'army-bc-local-fallback.js': 'embed-bc-local-fallback.js',
  'army-bc-local-fallback.css': 'embed-bc-local-fallback.css',
  'army-bc-local-engine.js': 'embed-bc-local-engine.js',
  'army-bc-popup.css': 'embed-bc-popup.css',
  'army-bc-popup.js': 'embed-bc-popup.js',
  'army-bc-scroll-fix.js': 'embed-bc-scroll-fix.js',
  'army-bc-scroll-fix.css': 'embed-bc-scroll-fix.css',
  'mod-demo-injected-bootstrap.js': 'site-clone-injected-bootstrap.js',
  'mod-bc-fullscreen-shell.html': 'embed-bc-fullscreen-shell.html',
  'styleConfigurations-6a0992.js': 'styleConfigurations-6a0992.js',
};

function xform(s) {
  return (
    s
      .replace(/army-bc\//g, 'embed-bc/')
      .replace(/army-bc-/g, 'embed-bc-')
      .replace(/armyBc/g, 'embedBc')
      .replace(/army_bc/g, 'embed_bc')
      .replace(/Army BC/g, 'Embed BC')
      .replace(/army-bc-inline/g, 'embed-bc-inline')
      .replace(/army-bc-disclaimer/g, 'embed-bc-disclaimer')
      .replace(/mod-demo-army-bc-inline/g, 'site-clone-bc-inline')
      .replace(/mod-demo-injected/g, 'site-clone-injected')
      .replace(/modDemoArmyBcInline/g, 'siteCloneBcInline')
      .replace(/modDemoBcFrameHost/g, 'siteCloneBcFrameHost')
      .replace(/modDemoBcFrameMount/g, 'siteCloneBcFrameMount')
      .replace(/modDemoBcFab/g, 'siteCloneBcFab')
      .replace(/modDemoSiteFrame/g, 'siteCloneDemoSiteFrame')
      .replace(/mod-demo-bc-fs-active/g, 'site-clone-bc-fs-active')
      .replace(/mod-demo-bc-injected-active/g, 'site-clone-bc-injected-active')
      .replace(/mod-demo-bc-frame-host/g, 'site-clone-bc-frame-host')
      .replace(/prepareArmyBcRuntime/g, 'prepareEmbedBcRuntime')
      .replace(/ModDemoBcConfig/g, 'SiteCloneBcConfig')
      .replace(/ModDemoBc/g, 'SiteCloneBc')
      .replace(/mod-demo-bc/g, 'site-clone-bc')
      .replace(/\[mod-demo-bc\]/g, '[site-clone-bc]')
      .replace(/restoreModDemoSnapshotFrame/g, 'restoreSiteCloneSnapshotFrame')
      .replace(/getModDemoFrame/g, 'getSiteCloneFrame')
      .replace(/mod-demo-embed-bc-inline/g, 'site-clone-bc-inline')
      .replace(/__modDemoBc/g, '__siteCloneBc')
      .replace(/modDemoBc/g, 'siteCloneBc')
      .replace(/ModDemo/g, 'SiteClone')
      .replace(/resetModDemoInjectedBc/g, 'resetSiteCloneInjectedBc')
      .replace(/applyModDemoStyleConfigDefaults/g, 'applySiteCloneStyleConfigDefaults')
      .replace(/modDemoBcCardImageFix/g, 'siteCloneBcCardImageFix')
  );
}

if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });

for (const [srcName, dstName] of Object.entries(fileMap)) {
  const src = path.join(srcDir, srcName);
  if (!fs.existsSync(src)) {
    console.warn('skip', srcName);
    continue;
  }
  fs.writeFileSync(path.join(dstDir, dstName), xform(fs.readFileSync(src, 'utf8')));
  console.log('wrote', dstName);
}

let bc = xform(fs.readFileSync(path.join(root, 'mod-demo-bc.js'), 'utf8'));
bc = bc.replace(
  /^\/\*\*[\s\S]*?\*\//,
  '/**\n * Site-clone Brand Concierge: modal + injected inline in saved site iframe.\n */',
);

const cfgHelper = `
  function pageCfg() {
    return global.SiteCloneBcPage || {};
  }
  function cfg(key, fallback) {
    var p = pageCfg();
    return p[key] !== undefined && p[key] !== null && p[key] !== '' ? p[key] : fallback;
  }
`;

bc = bc.replace(
  "(function (global) {\n  'use strict';\n\n  var BASE",
  `(function (global) {\n  'use strict';${cfgHelper}\n  var BASE`,
);

bc = bc.replace("var BASE = 'embed-bc/';", "var BASE = cfg('embedBase', 'embed-bc/');");
bc = bc.replace(
  "var IFRAME_ID = 'siteCloneDemoSiteFrame';",
  "var IFRAME_ID = cfg('iframeId', 'siteCloneDemoSiteFrame');",
);
bc = bc.replace(
  "var IFRAME_INLINE_SECTION_ID = 'siteCloneBcInline';",
  "var IFRAME_INLINE_SECTION_ID = cfg('inlineSectionId', 'siteCloneBcInline');",
);
bc = bc.replace(
  "var IFRAME_INJECTED_MOUNT_SELECTOR = '#siteCloneBcInline #brand-concierge-mount';",
  "var IFRAME_INJECTED_MOUNT_SELECTOR = cfg('injectedMountSelector', '#siteCloneBcInline #brand-concierge-mount');",
);
bc = bc.replace(
  "var MODAL_MOUNT_SELECTOR = '#aepBcModal #brand-concierge-mount';",
  "var MODAL_MOUNT_SELECTOR = cfg('modalMountSelector', '#aepBcModal #brand-concierge-mount');",
);
bc = bc.replace(
  "var FRAME_OVERLAY_HOST_ID = 'siteCloneBcFrameHost';",
  "var FRAME_OVERLAY_HOST_ID = cfg('frameOverlayHostId', 'siteCloneBcFrameHost');",
);
bc = bc.replace(
  "var FRAME_OVERLAY_MOUNT_SELECTOR = '#siteCloneBcFrameMount';",
  "var FRAME_OVERLAY_MOUNT_SELECTOR = cfg('frameOverlayMountSelector', '#siteCloneBcFrameMount');",
);
bc = bc.replace(
  "var DEFAULT_FRAME_SRC = 'mod-demo-assets/army-home-snapshot.html';",
  "var DEFAULT_FRAME_SRC = cfg('defaultFrameSrc', '');",
);

bc = bc.replace(
  "var injectedToggle = document.getElementById('modBcInjectedToggle');",
  "var injectedToggle = document.getElementById(cfg('injectedToggleId', 'siteCloneBcInjectedToggle'));",
);
bc = bc.replace(
  "var modalToggle = document.getElementById('modBcModalToggle');",
  "var modalToggle = document.getElementById(cfg('modalToggleId', 'siteCloneBcModalToggle'));",
);
bc = bc.replace(
  "var fullScreenToggle = document.getElementById('modBcFullScreenToggle');",
  "var fullScreenToggle = document.getElementById(cfg('fullScreenToggleId', 'siteCloneBcFullScreenToggle'));",
);
bc = bc.replace(
  "var bcFab = document.getElementById('siteCloneBcFab');",
  "var bcFab = document.getElementById(cfg('fabId', 'siteCloneBcFab'));",
);

fs.writeFileSync(path.join(root, 'site-clone-bc.js'), bc);
fs.writeFileSync(path.join(root, 'site-clone-bc.css'), xform(fs.readFileSync(path.join(root, 'mod-demo-bc.css'), 'utf8')));
console.log('site-clone-bc.js bytes', bc.length);
