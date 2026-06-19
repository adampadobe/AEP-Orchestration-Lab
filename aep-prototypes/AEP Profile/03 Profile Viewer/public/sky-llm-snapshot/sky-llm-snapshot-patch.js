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

  var AGENTIC_MOVER_URLS = [
    [/sky\.com\/TV and broadband\/expres/gi, 'sky.com/tv/sky-glass'],
    [/sky\.com\/TV and broadband\/latte/gi, 'sky.com/broadband/full-fibre'],
    [/sky\.com\/TV and broadband\/lat\b/gi, 'sky.com/broadband/full-fibre'],
    [/sky\.com\/TV and broadband\/live sport/gi, 'sky.com/tv/sky-sports'],
    [/sky\.com\/fr\/products\/hbdr1/gi, 'sky.com/shop/tv-packs'],
    [/sky\.com\/uk\/products\/hbdr1/gi, 'sky.com/shop/tv-packs'],
    [/sky\.com\/products\/l034-mystic-serenade[^\s<]*/gi, 'sky.com/tv/sky-glass'],
    [/sky\.com\/fr\/products\/tea103[^\s<]*/gi, 'sky.com/broadband/deals'],
    [/sky\.com\/uk\/products\/tea103[^\s<]*/gi, 'sky.com/broadband/deals'],
    [/sky\.com\/uk\/products\/csm5148[^\s<]*/gi, 'sky.com/mobile/plans'],
    [/sky\.com\/TV and broadband\//gi, 'sky.com/tv/'],
  ];

  function patchAgenticMoverText(txt) {
    var out = (txt || '').replace(/ÔåÆ/g, '→');
    AGENTIC_MOVER_URLS.forEach(function (pair) {
      out = out.replace(pair[0], pair[1]);
    });
    return out;
  }

  function patchAgenticTrafficPage() {
    if (!/agentic-traffic\.html/i.test(location.pathname || '')) return;
    document.querySelectorAll('span, a, div, p').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = el.textContent || '';
      if (!/ÔåÆ|TV and broadband|tea103|hbdr1|mystic-serenade|csm5148/i.test(txt)) return;
      var next = patchAgenticMoverText(txt);
      if (next !== txt) el.textContent = next;
    });
    var top = document.getElementById('agentic-traffic-top-movers-table');
    var bot = document.getElementById('agentic-traffic-bottom-movers-table');
    if (!top || !bot) return;
    var grid = top.closest('[class*="macro-static-IHcRc"]');
    while (grid && !grid.contains(bot)) {
      grid = grid.parentElement && grid.parentElement.closest('[class*="macro-static-IHcRc"]');
    }
    if (grid) grid.classList.add('sky-llm-agentic-movers-row');
  }

  /** True only inside LLM Demo iframe (?llmDemo=1). Sky LLM Optimizer must stay on frozen Sky labels. */
  function llmDemoMode() {
    return /(?:\?|&)llmDemo=1(?:&|$)/.test(location.search || '');
  }

  function llmDemoActive() {
    return llmDemoMode();
  }

  function run() {
    if (llmDemoActive()) return;
    try {
      patchSiteField();
      patchAxisLabels();
      patchBrandInputs();
      patchAgenticTrafficPage();
    } catch (e) {
      /* frozen snapshot */
    }
  }

  function snapshotBuild() {
    return (typeof window !== 'undefined' && window.SKY_LLM_SNAPSHOT_BUILD) || '20260619';
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
      var brands = window.LlmDemoBrands || window.SkyLlmLlmDemoBrands;
      if (brands && brands.scheduleApplyAll) {
        brands.scheduleApplyAll();
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
      if (window.LlmDemoUrls || window.SkyLlmDemoUrls) {
        afterUrls();
        return;
      }
      loadScript('./sky-llm-snapshot-llm-demo-urls.js', afterUrls);
    }

    if (window.LlmDemoBrands || window.SkyLlmLlmDemoBrands) {
      boot();
      return;
    }
    loadScript('./sky-llm-snapshot-llm-demo-brands.js', boot);
  }

  function loadLlmDemoPersonalize() {
    if (!llmDemoMode()) return;
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
