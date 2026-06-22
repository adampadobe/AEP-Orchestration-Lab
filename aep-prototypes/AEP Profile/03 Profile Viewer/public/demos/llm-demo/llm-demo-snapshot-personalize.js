/**
 * LLM Demo — lightweight link/input patches inside frozen snapshot iframes.
 * Brand labels and charts are handled by llm-demo-snapshot-llm-demo-brands.js (scoped, no full-DOM scan).
 */
(function () {
  'use strict';

  var RUNNING = false;

  function getConfig() {
    if (typeof LlmDemoConfig !== 'undefined') return LlmDemoConfig.load();
    try {
      var raw = localStorage.getItem('llmDemoPersonalization_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function replaceHostInUrl(url, cfg) {
    var s = String(url || '').trim();
    if (!s) return s;
    var reps = cfg.urlReplacements || [];
    var i;
    for (i = 0; i < reps.length; i++) {
      var row = reps[i];
      if (row.from && s.indexOf(row.from) !== -1) return s.split(row.from).join(row.to);
      if (row.fromWww && s.indexOf(row.fromWww) !== -1) return s.split(row.fromWww).join(row.to);
    }
    if (!/sky\.com/i.test(s)) return s;
    try {
      var u = new URL(s, 'https://sky.com');
      u.hostname = cfg.siteHost;
      u.protocol = (cfg.siteUrl || 'https://' + cfg.siteHost).indexOf('http:') === 0 ? 'http:' : 'https:';
      return u.href;
    } catch (e) {
      return s.replace(/https?:\/\/(?:www\.)?sky\.com/gi, cfg.siteUrl || 'https://' + cfg.siteHost);
    }
  }

  /** Only touch nodes that still reference Sky hosts or demo placeholders. */
  function patchLinksAndInputs(cfg) {
    if (!cfg || !cfg.siteHost) return;
    var host = cfg.siteHost;
    var brand = cfg.brand;

    document
      .querySelectorAll(
        'a[href*="sky.com"], input[value*="sky.com"], input[value*="frescopa"], textarea[value*="sky.com"], textarea[value*="frescopa"], input[value*="wknd"]',
      )
      .forEach(function (el) {
        if (el.tagName === 'A') {
          var href = el.getAttribute('href') || '';
          if (/sky\.com/i.test(href)) el.setAttribute('href', replaceHostInUrl(href, cfg));
          return;
        }
        var val = el.value || '';
        if (/sky\.com|wknd|frescopa|adobedemo/i.test(val)) {
          if (/^https?:\/\//i.test(val)) el.value = replaceHostInUrl(val, cfg);
          else el.value = host;
        }
        if (/frescopa/i.test(val)) el.value = brand;
      });

    (cfg.urlReplacements || []).forEach(function (row) {
      if (!row.from) return;
      document.querySelectorAll('a[href="' + row.from + '"], a[href="' + (row.fromWww || '') + '"]').forEach(
        function (a) {
          a.setAttribute('href', row.to);
        },
      );
    });

    var map = cfg.axisMap || {};
    var keys = Object.keys(map);
    if (!keys.length) return;
    document.querySelectorAll('svg text, svg tspan').forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (map[txt]) el.textContent = map[txt];
    });
  }

  function patchLinksAndInputsOnce() {
    var cfg = getConfig();
    if (!cfg || !cfg.siteHost || !cfg.brand) return;
    if (RUNNING) return;
    RUNNING = true;
    try {
      patchLinksAndInputs(cfg);
    } catch (e) {
      /* snapshot */
    } finally {
      RUNNING = false;
    }
  }

  function scheduleBrandsApply() {
    if (window.SkyLlmLlmDemoBrands && window.SkyLlmLlmDemoBrands.scheduleApplyAll) {
      window.SkyLlmLlmDemoBrands.scheduleApplyAll();
      return;
    }
    patchLinksAndInputsOnce();
  }

  function init() {
    if (!getConfig()) return;
    scheduleBrandsApply();
    window.addEventListener('storage', function (e) {
      if (e.key === 'llmDemoPersonalization_v1') scheduleBrandsApply();
    });
  }

  window.skyLlmLlmDemoPersonalize = {
    patchLinksAndInputs: patchLinksAndInputsOnce,
    schedule: scheduleBrandsApply,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
