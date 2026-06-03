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
      var val = input.value || '';
      if (/wknd|frescopa|adobedemo|enablementadobe/i.test(val)) input.value = SITE;
      if (/www\.sky\.com/i.test(val)) input.value = SITE;
    });
    document.querySelectorAll('span, button').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (
        (/wknd-site|wknd\.enablement|adobedemo|frescopa/i.test(txt) || /^www\.sky\.com$/i.test(txt)) &&
        txt.length < 64
      ) {
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

  function llmDemoActive() {
    try {
      return !!localStorage.getItem('llmDemoPersonalization_v1');
    } catch (e) {
      return false;
    }
  }

  function run() {
    if (llmDemoActive()) return;
    try {
      patchSiteField();
      patchAxisLabels();
      patchBrandInputs();
    } catch (e) {
      /* frozen snapshot */
    }
  }

  function snapshotBuild() {
    return (typeof window !== 'undefined' && window.SKY_LLM_SNAPSHOT_BUILD) || '20260617';
  }

  function bust(path) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return path + sep + 'v=' + snapshotBuild();
  }

  function suppressWalnutOverlay() {
    var walnut = document.getElementById('walnut-root-popin-element');
    if (walnut && walnut.parentNode) walnut.parentNode.removeChild(walnut);
  }

  function loadScript(src, next) {
    var s = document.createElement('script');
    s.src = bust(src);
    s.onload = function () {
      if (next) next();
    };
    s.onerror = function () {
      if (next) next();
    };
    document.body.appendChild(s);
  }

  function runLlmDemoPatches() {
    function scheduleApply() {
      if (window.SkyLlmLlmDemoBrands && window.SkyLlmLlmDemoBrands.scheduleApplyAll) {
        window.SkyLlmLlmDemoBrands.scheduleApplyAll();
      }
    }

    function loadPersonalizeThenApply() {
      if (window.skyLlmLlmDemoPersonalize) {
        scheduleApply();
        return;
      }
      loadScript('../demos/llm-demo/llm-demo-snapshot-personalize.js', scheduleApply);
    }

    function loadPageModules(chain) {
      var path = location.pathname || '';
      if (/url-inspector\.html/i.test(path) && !window.SkyLlmUrlInspector) {
        loadScript('./sky-llm-snapshot-url-inspector.js', chain);
        return;
      }
      if (/brand-claims\.html/i.test(path) && !window.SkyLlmBrandClaims) {
        loadScript('./sky-llm-snapshot-brand-claims.js', chain);
        return;
      }
      if (/prompts-management\.html/i.test(path) && !window.SkyLlmPromptsManagement) {
        loadScript('./sky-llm-snapshot-prompts-management.js', chain);
        return;
      }
      chain();
    }

    function boot() {
      function afterUrls() {
        loadPageModules(loadPersonalizeThenApply);
      }
      if (window.SkyLlmDemoUrls) {
        afterUrls();
        return;
      }
      loadScript('./sky-llm-snapshot-llm-demo-urls.js', afterUrls);
    }

    if (window.SkyLlmLlmDemoBrands) {
      boot();
      return;
    }
    loadScript('./sky-llm-snapshot-llm-demo-brands.js', boot);
  }

  function loadLlmDemoPersonalize() {
    var hasParam = /(?:\?|&)llmDemo=1(?:&|$)/.test(location.search || '');
    var hasStored = false;
    try {
      hasStored = !!localStorage.getItem('llmDemoPersonalization_v1');
    } catch (e) {
      /* ignore */
    }
    if (!hasParam && !hasStored) return;
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(runLlmDemoPatches, { timeout: 500 });
    } else {
      window.setTimeout(runLlmDemoPatches, 0);
    }
  }

  suppressWalnutOverlay();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      suppressWalnutOverlay();
      run();
    });
  } else {
    run();
  }
  window.setTimeout(run, 400);
  window.setTimeout(suppressWalnutOverlay, 50);
  loadLlmDemoPersonalize();
})();
