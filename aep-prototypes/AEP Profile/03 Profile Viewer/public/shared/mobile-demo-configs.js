/**
 * Config registry for scalable mobile demo shell.
 *
 * Preferred pattern (presentation-grade):
 *   1. One dedicated URL per customer: `{customer}-mobile-demo.html`
 *   2. Env bar OUTSIDE the device simulator (see ksia-mobile-demo.html, etihad-mobile-demo.html)
 *   3. Web | Mobile channel toggle on both web and mobile demo pages
 *   4. Add PAGE_CONFIGS.{demoId} here + thin page JS calling MobileDemoShell.init
 *   5. Wire lab-core with envBarConfig.iframeIds targeting the shell iframe
 *
 * Legacy hub stubs (mobile-demo-apalmer.html, mobile-demo.html) only redirect bookmarks;
 * do not add new customers there — use dedicated mobile pages instead.
 *
 * @see shared/mobile-demo-shell.js
 */
(function (global) {
  'use strict';

  /** @typedef {'iphone17pro'|'s24u'} MobileDeviceToggleId */

  /**
   * @typedef {object} MobileDemoConfig
   * @property {string} demoId
   * @property {string} brandName
   * @property {string} appEntryUrl — iframe src (relative to profile-viewer/)
   * @property {string} [defaultDevice]
   * @property {MobileDeviceToggleId[]} [deviceToggleDevices] — top toggle (defaults to iphone17pro + s24u)
   * @property {boolean} [envBar] — mount lab env strip outside device frame
   * @property {string} [envBarPrefix] — Tags / profile prefix (e.g. ksia)
   * @property {string} [iframeId] — for Tags injection when envBar is true
   * @property {string} [labCoreScript] — demo lab-core after env bar ready
   * @property {string} [webDemoUrl] — sibling web demo for channel toggle
   * @property {string} [mobileDemoUrl] — this mobile entry URL
   * @property {string} [pageClass] — body class for demo-specific CSS
   * @property {string} [channelLabel] — env bar title suffix
   */

  /** Device presets shared by all mobile demos. */
  var DEVICES = {
    iphone17pro: {
      id: 'iphone17pro',
      label: 'iPhone 17 Pro',
      w: 402,
      h: 874,
      bezel: 'apple',
      notch: 'dynamic-island',
      statusBar: 'ios',
    },
    s24u: {
      id: 's24u',
      label: 'Samsung Galaxy S24 Ultra',
      w: 412,
      h: 915,
      bezel: 'samsung',
      notch: 'samsung',
      statusBar: 'android',
    },
    s23: {
      id: 's23',
      label: 'Samsung Galaxy S23',
      w: 360,
      h: 780,
      bezel: 'samsung',
      notch: 'samsung',
      statusBar: 'android',
    },
    iphone15p: {
      id: 'iphone15p',
      label: 'Apple iPhone 15 Pro',
      w: 393,
      h: 852,
      bezel: 'apple',
      notch: 'dynamic-island',
      statusBar: 'ios',
    },
    ipad11: {
      id: 'ipad11',
      label: 'Apple iPad Pro 11″',
      w: 834,
      h: 1194,
      bezel: 'ipad',
      notch: 'none',
      statusBar: 'ios',
    },
  };

  /**
   * Bookmark hash → redirect URL for retired hub stubs only.
   * Keep aligned with inline maps in mobile-demo-apalmer.html and mobile-demo.html.
   */
  var LEGACY_HASH_REDIRECTS = {
    apalmer: {
      'etihad-phone': 'etihad-mobile-demo.html',
      'ksia-phone': 'ksia-mobile-demo.html',
      'starbucks-phone': 'starbucks-mobile-demo.html',
      'etihad-ipad': 'ipad-demo.html',
    },
    fnb: {
      'fnb-phone': 'fnb-demo.html?aepSimMobile=1',
      'fnb-ipad': 'fnb-demo.html?aepSimMobile=1',
    },
  };

  /** Full configs for env-bar mobile demo pages. */
  var PAGE_CONFIGS = {
    ksia: {
      demoId: 'ksia',
      brandName: 'KSIA AIVC',
      appEntryUrl: 'demos/ksia/mobile/index.html',
      defaultDevice: 'iphone17pro',
      deviceToggleDevices: ['iphone17pro', 's24u'],
      envBar: true,
      envBarPrefix: 'ksia',
      iframeId: 'ksiaMobileFrame',
      labCoreScript: 'demos/ksia/ksia-lab-core.js',
      webDemoUrl: 'ksia-demo.html',
      mobileDemoUrl: 'ksia-mobile-demo.html',
      pageClass: 'ksia-mobile-demo-page',
      channelLabel: 'Mobile',
    },
    etihad: {
      demoId: 'etihad',
      brandName: 'Etihad',
      appEntryUrl: 'etihad-demo.html',
      defaultDevice: 'iphone17pro',
      deviceToggleDevices: ['iphone17pro', 's24u'],
      envBar: true,
      envBarPrefix: 'etihad',
      iframeId: 'etihadMobileFrame',
      labCoreScript: 'etihad-lab-core.js',
      webDemoUrl: 'etihad-demo.html',
      mobileDemoUrl: 'etihad-mobile-demo.html',
      pageClass: 'etihad-mobile-demo-page',
      channelLabel: 'Mobile',
    },
    starbucks: {
      demoId: 'starbucks',
      brandName: 'Starbucks UAE',
      appEntryUrl: 'demos/alshaya/starbucks/mobile/index.html',
      defaultDevice: 'iphone17pro',
      deviceToggleDevices: ['iphone17pro', 's24u'],
      envBar: true,
      envBarPrefix: 'starbucks',
      iframeId: 'starbucksMobileFrame',
      labCoreScript: 'demos/alshaya/starbucks/starbucks-lab-core.js',
      webDemoUrl: 'starbucks-demo.html',
      mobileDemoUrl: 'starbucks-mobile-demo.html',
      pageClass: 'starbucks-mobile-demo-page',
      channelLabel: 'Mobile',
    },
  };

  global.MobileDemoConfigs = {
    DEVICES: DEVICES,
    LEGACY_HASH_REDIRECTS: LEGACY_HASH_REDIRECTS,
    PAGE_CONFIGS: PAGE_CONFIGS,
    getDevice: function (id) {
      return DEVICES[id] || DEVICES.s24u;
    },
    resolveLegacyHashRedirect: function (hub, hashKey) {
      var key = String(hashKey || '').replace(/^#/, '').trim();
      var map = LEGACY_HASH_REDIRECTS[hub];
      return map && map[key] ? map[key] : null;
    },
    getPageConfig: function (demoId) {
      return PAGE_CONFIGS[demoId] || null;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
