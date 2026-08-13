/**
 * Constrained AJO authoring target for the saved Sky homepage.
 *
 * The main lab page keeps the snapshot in its iframe for CSS/layout isolation and supplies its own
 * authoring bridge. When this snapshot is authored directly, this script makes only the large hero
 * banner pointer-selectable. The lab shell injects the selected Tags/Web SDK script for delivery.
 */
(function skyAjoImageTarget(global) {
  'use strict';

  var TARGET_ID = 'skyAjoHeroBanner';
  var HERO_SELECTOR = '[data-test-id="hero"]';
  var PRODUCT_SECTION_SELECTOR = '[data-test-id="product-cards-section"]';
  var SPACER_ID = 'skyAjoHeroInsertSpacer';
  var STYLE_ID = 'skyAjoHeroAuthoringStyles';
  var LAUNCH_ID = 'skyAjoAuthoringLaunchScript';
  var RETRY_DELAYS = [0, 100, 300, 750, 1500, 3000, 6000];

  function isDirectAuthoringSurface() {
    if (global.top === global) return true;
    try {
      if (global.parent !== global && global.parent.location.origin === global.location.origin) {
        return false;
      }
    } catch (_e) {
      return true;
    }
    try {
      return global.top.location.origin !== global.location.origin;
    } catch (_e) {
      return true;
    }
  }

  function ensureStyles(authoring) {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      authoring ? 'html.sky-ajo-hero-authoring body *{pointer-events:none!important;}' : '',
      authoring
        ? 'html.sky-ajo-hero-authoring #' + TARGET_ID + '{pointer-events:auto!important;}'
        : '',
    ].join('');
  }

  function findHeroBoundary() {
    var productSection = document.querySelector(PRODUCT_SECTION_SELECTOR);
    if (productSection) {
      var productRoot = productSection;
      while (productRoot.parentElement && productRoot.parentElement.tagName !== 'MAIN') {
        productRoot = productRoot.parentElement;
      }
      var hero = productRoot.previousElementSibling;
      if (hero && hero.id === SPACER_ID) hero = hero.previousElementSibling;
      if (hero) return hero;
    }
    return document.querySelector(HERO_SELECTOR);
  }

  function ensureTarget() {
    var hero = findHeroBoundary();
    if (!hero) return false;

    var authoring = isDirectAuthoringSurface();
    document.documentElement.classList.toggle('sky-ajo-hero-authoring', authoring);
    ensureStyles(authoring);

    hero.id = TARGET_ID;
    hero.setAttribute('data-aep-authoring-target', 'hero-banner');
    hero.setAttribute('data-aep-insert-position', 'after');
    return true;
  }

  function normaliseSandboxKey() {
    try {
      var raw = String(global.localStorage.getItem('aepGlobalSandboxName') || '').trim().toLowerCase();
      return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
    } catch (_e) {
      return '__default__';
    }
  }

  function selectedLabLaunchUrl() {
    try {
      var raw = global.localStorage.getItem('skyDemoSelectedLaunchScriptBySandbox');
      var map = raw ? JSON.parse(raw) : {};
      var url = String(map[normaliseSandboxKey()] || map.__default__ || '').trim();
      if (!url) {
        var values = Object.values(map).filter(function (value) {
          return typeof value === 'string' && value.trim();
        });
        url = values.length === 1 ? String(values[0]).trim() : '';
      }
      return /^https:\/\/assets\.adobedtm\.com\//i.test(url) ? url : '';
    } catch (_e) {
      return '';
    }
  }

  function injectAuthoringLaunch() {
    if (!isDirectAuthoringSurface() || document.getElementById(LAUNCH_ID)) return;
    var url = selectedLabLaunchUrl();
    if (!url) return;
    var script = document.createElement('script');
    script.id = LAUNCH_ID;
    script.async = true;
    script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'aepcb=' + Date.now();
    script.setAttribute('data-sky-ajo-lab-launch', '1');
    document.head.appendChild(script);
  }

  RETRY_DELAYS.forEach(function (delay) {
    global.setTimeout(function () {
      ensureTarget();
      injectAuthoringLaunch();
    }, delay);
  });
})(typeof window !== 'undefined' ? window : globalThis);
