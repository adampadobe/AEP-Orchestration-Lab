/**
 * Constrained AJO authoring target for the saved Sky homepage.
 *
 * The main lab page keeps the snapshot in its iframe for CSS/layout isolation. AJO authors the
 * snapshot URL directly, where this script makes only the first post-hero product image pointer-
 * selectable. The lab shell injects the selected Tags/Web SDK script into the iframe for delivery.
 */
(function skyAjoImageTarget(global) {
  'use strict';

  var TARGET_ID = 'skyAjoPostHeroImage';
  var CARD_SELECTOR = '[data-test-id="product-card-portrait-0"]';
  var BACKGROUND_SELECTOR = '[data-test-id="background-image"]';
  var STYLE_ID = 'skyAjoPostHeroAuthoringStyles';
  var LAUNCH_ID = 'skyAjoAuthoringLaunchScript';
  var RETRY_DELAYS = [0, 100, 300, 750, 1500, 3000, 6000];

  function isCrossOriginEditorFrame() {
    if (global.top === global) return true;
    try {
      return global.top.location.origin !== global.location.origin;
    } catch (_e) {
      return true;
    }
  }

  function firstBackgroundUrl(value) {
    var raw = String(value || '');
    var match = raw.match(/url\(["']?([^"')]+)["']?\)/i);
    return match ? match[1] : '';
  }

  function ensureStyles(authoring) {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = [
      '#' + TARGET_ID + '{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center bottom;opacity:.001;z-index:1;}',
      authoring ? 'html.sky-ajo-image-authoring body *{pointer-events:none!important;}' : '',
      authoring
        ? 'html.sky-ajo-image-authoring #' + TARGET_ID + '{pointer-events:auto!important;opacity:1;cursor:crosshair;outline:4px solid #1473e6;outline-offset:-4px;}'
        : '#' + TARGET_ID + '{pointer-events:none;}',
    ].join('');
  }

  function ensureTarget() {
    var card = document.querySelector(CARD_SELECTOR);
    var background = card && card.querySelector(BACKGROUND_SELECTOR);
    if (!background) return false;

    var authoring = isCrossOriginEditorFrame();
    document.documentElement.classList.toggle('sky-ajo-image-authoring', authoring);
    ensureStyles(authoring);

    var image = document.getElementById(TARGET_ID);
    if (!image) {
      image = document.createElement('img');
      image.id = TARGET_ID;
      image.alt = 'Full Fibre 900 and Ultimate TV product image - AJO authoring target';
      image.setAttribute('data-aep-authoring-target', 'post-hero-product-image');
      image.setAttribute('data-aep-insert-position', 'after');
      background.appendChild(image);
    }

    var source = firstBackgroundUrl(global.getComputedStyle(background).backgroundImage);
    if (source && image.src !== source) image.src = source;
    image.toggleAttribute('aria-hidden', !authoring);
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
    if (!isCrossOriginEditorFrame() || document.getElementById(LAUNCH_ID)) return;
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
