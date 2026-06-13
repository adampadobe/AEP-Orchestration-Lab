/**
 * Config registry for scalable mobile demo shell.
 * Add a customer: new entry here + mobile app HTML under demos/{brand}/mobile/.
 *
 * @see shared/mobile-demo-shell.js
 * @see docs/mobile-demo-shell.md (inline comments below)
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

  /** Legacy customize drawer list (mobile-demo-apalmer without env bar). */
  var LEGACY_DEMOS = [
    { value: 'etihad-demo.html', label: 'Etihad (demo)' },
    { value: 'fnb-demo.html', label: 'FNB (demo)' },
    { value: 'oldmutual-demo.html', label: 'Old Mutual (demo)' },
    { value: 'oldmutual-wealth.html', label: 'Old Mutual Wealth (demo)' },
    { value: 'donate-demo.html', label: 'Donate (demo)' },
    { value: 'race-for-life-demo.html', label: 'Race for Life (demo)' },
    { value: 'events-trigger.html', label: 'Events trigger' },
    { value: 'firebase-hosting.html', label: 'Firebase images' },
  ];

  /**
   * Hash routes → config. Keys match location.hash without #.
   * Dedicated pages (ksia-mobile-demo.html) set window.mobileDemoConfig directly.
   */
  var HASH_ROUTES = {
    'etihad-phone': {
      demoId: 'etihad',
      brandName: 'Etihad',
      appEntryUrl: 'etihad-demo.html',
      defaultDevice: 's24u',
      deviceToggleDevices: ['iphone17pro', 's24u'],
      envBar: false,
      legacyDemoSelect: true,
    },
    'etihad-ipad': {
      demoId: 'etihad',
      brandName: 'Etihad',
      appEntryUrl: 'etihad-demo.html',
      defaultDevice: 'ipad11',
      deviceToggleDevices: ['iphone17pro', 's24u'],
      envBar: false,
      legacyDemoSelect: true,
    },
    'ksia-phone': {
      redirect: 'ksia-mobile-demo.html',
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
  };

  global.MobileDemoConfigs = {
    DEVICES: DEVICES,
    LEGACY_DEMOS: LEGACY_DEMOS,
    HASH_ROUTES: HASH_ROUTES,
    PAGE_CONFIGS: PAGE_CONFIGS,
    getDevice: function (id) {
      return DEVICES[id] || DEVICES.s24u;
    },
    resolveHashRoute: function (hashKey) {
      var key = String(hashKey || '').replace(/^#/, '').trim();
      return HASH_ROUTES[key] || null;
    },
    getPageConfig: function (demoId) {
      return PAGE_CONFIGS[demoId] || null;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
