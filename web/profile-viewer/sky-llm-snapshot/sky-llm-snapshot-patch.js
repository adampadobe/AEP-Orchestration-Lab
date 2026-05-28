/**
 * Sky bespoke patches on the frozen LLM Optimizer overview snapshot (same-origin DOM).
 */
(function () {
  'use strict';

  var SITE = 'sky.com';
  var BRAND_LABEL = 'Sky';
  var AXIS = {
    Adobe: 'Sky',
    WKND: 'Virgin Media',
    Automattic: 'BT',
    Contentful: 'TalkTalk',
    Global: 'Virgin Media',
    AEM: 'Disney+',
    Wix: 'TalkTalk',
    Webflow: 'Virgin Media',
  };

  function patchSiteField() {
    document.querySelectorAll('input').forEach(function (input) {
      if (/wknd/i.test(input.value || '')) input.value = SITE;
    });
    document.querySelectorAll('span, div, button').forEach(function (el) {
      if (el.childElementCount > 2) return;
      var txt = (el.textContent || '').trim();
      if (/wknd-site|wknd\.enablement/i.test(txt) && txt.length < 64) {
        el.textContent = SITE;
      }
    });
  }

  function patchAxisLabels() {
    document.querySelectorAll('text, tspan, span, button').forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (AXIS[txt]) el.textContent = AXIS[txt];
    });
  }

  function patchBrandSelectors() {
    document.querySelectorAll('[role="combobox"], button, span, div').forEach(function (el) {
      if (el.childElementCount > 4) return;
      var txt = (el.textContent || '').trim();
      if (/frescopa/i.test(txt)) {
        el.textContent = txt.replace(/frescopa(\s+TV and broadband)?/gi, BRAND_LABEL);
      }
    });
    document.querySelectorAll('input').forEach(function (input) {
      if (/frescopa/i.test(input.value || '')) input.value = BRAND_LABEL;
    });
  }

  function run() {
    try {
      patchSiteField();
      patchAxisLabels();
      patchBrandSelectors();
    } catch (e) {
      /* frozen snapshot */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.setTimeout(run, 400);
  window.setTimeout(run, 1500);
})();
