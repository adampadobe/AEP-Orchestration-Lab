/**
 * Sky bespoke patches on the frozen LLM Optimizer snapshot (same-origin DOM).
 * Only touch leaf text nodes — never set textContent on parents (destroys React markup).
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
    Frescopa: 'Sky',
    'Sweet Maria\u2019s': 'BT',
    Cropster: 'TalkTalk',
    Agtron: 'Virgin Media',
  };

  function isLeafTextEl(el) {
    return el && el.childElementCount === 0;
  }

  function patchSiteField() {
    document.querySelectorAll('input').forEach(function (input) {
      if (/wknd/i.test(input.value || '')) input.value = SITE;
    });
    document.querySelectorAll('span, button').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (/wknd-site|wknd\.enablement/i.test(txt) && txt.length < 64) {
        el.textContent = SITE;
      }
    });
  }

  function patchAxisLabels() {
    document.querySelectorAll('text, tspan').forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (AXIS[txt]) el.textContent = AXIS[txt];
    });
    document.querySelectorAll('span, button').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (AXIS[txt]) el.textContent = AXIS[txt];
      else if (/frescopa/i.test(txt)) {
        el.textContent = txt.replace(/frescopa(\s+TV and broadband)?/gi, BRAND_LABEL);
      }
    });
  }

  function patchBrandInputs() {
    document.querySelectorAll('input').forEach(function (input) {
      if (/frescopa/i.test(input.value || '')) input.value = BRAND_LABEL;
    });
  }

  function run() {
    try {
      patchSiteField();
      patchAxisLabels();
      patchBrandInputs();
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
})();
