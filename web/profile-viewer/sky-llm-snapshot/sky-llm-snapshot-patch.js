/**
 * Sky bespoke patches on the frozen LLM Optimizer overview snapshot (same-origin DOM).
 */
(function () {
  'use strict';

  var SITE = 'sky.com';
  var AXIS = {
    Adobe: 'Sky',
    WKND: 'Virgin Media',
    Automattic: 'BT',
    Contentful: 'TalkTalk',
    Global: 'Netflix',
    AEM: 'Disney+',
    Wix: 'TalkTalk',
    Webflow: 'Netflix',
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

  function run() {
    try {
      patchSiteField();
      patchAxisLabels();
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
