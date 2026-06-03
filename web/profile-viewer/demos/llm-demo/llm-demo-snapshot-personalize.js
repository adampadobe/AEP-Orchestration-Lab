/**
 * Applies LLM Demo customer personalization inside frozen sky-llm-snapshot iframes.
 * Leaf text only for static nodes; also patches href/src and input values.
 */
(function () {
  'use strict';

  var RUNNING = false;
  var DEBOUNCE = null;

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

  function isLeafTextEl(el) {
    return el && el.childElementCount === 0;
  }

  function replaceHostInUrl(url, cfg) {
    var s = String(url || '').trim();
    if (!s) return s;
    var reps = cfg.urlReplacements || [];
    for (var i = 0; i < reps.length; i++) {
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

  function buildTextPairs(cfg) {
    var brand = cfg.brand;
    var host = cfg.siteHost;
    var comps = cfg.competitors || [];
    var ref =
      typeof LlmDemoConfig !== 'undefined' && LlmDemoConfig.SKY_REFERENCE_BRANDS
        ? LlmDemoConfig.SKY_REFERENCE_BRANDS
        : ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+', 'Sky'];
    var pickerLabel =
      window.SkyLlmLlmDemoBrands && window.SkyLlmLlmDemoBrands.brandPickerLabel
        ? window.SkyLlmLlmDemoBrands.brandPickerLabel()
        : brand;
    var pairs = [
      ['www.sky.com', host],
      ['sky.com', host],
      ['Sky UK', brand],
      ['Sky TV and broadband', pickerLabel],
      ['frescopa TV and broadband', pickerLabel],
      ['frescopa', brand],
    ];
    ref.forEach(function (skyName, idx) {
      if (skyName === 'Sky') pairs.push(['Sky', brand]);
      else pairs.push([skyName, comps[idx] || comps[comps.length - 1] || skyName]);
    });
    return pairs;
  }

  function applyTextReplace(text, pairs) {
    var out = text;
    pairs.forEach(function (row) {
      if (!row[0] || row[0] === row[1]) return;
      out = out.split(row[0]).join(row[1]);
    });
    return out;
  }

  function patchAxis(cfg) {
    var map = cfg.axisMap || {};
    document.querySelectorAll('text, tspan').forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (map[txt]) el.textContent = map[txt];
    });
    document.querySelectorAll('span, button').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (map[txt]) el.textContent = map[txt];
    });
  }

  function patchUrlsAndInputs(cfg) {
    var host = cfg.siteHost;
    document.querySelectorAll('input, textarea').forEach(function (input) {
      var val = input.value || '';
      if (/sky\.com|wknd|frescopa|adobedemo/i.test(val)) {
        if (/^https?:\/\//i.test(val)) input.value = replaceHostInUrl(val, cfg);
        else input.value = host;
      }
      if (/frescopa/i.test(val)) input.value = cfg.brand;
    });
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (/sky\.com/i.test(href)) a.setAttribute('href', replaceHostInUrl(href, cfg));
    });
  }

  function patchUrlReplacements(cfg) {
    (cfg.urlReplacements || []).forEach(function (row) {
      if (!row.from || !row.to) return;
      document.querySelectorAll('a[href]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        if (href === row.from || href === row.fromWww) a.setAttribute('href', row.to);
      });
    });
  }

  function patchLeafText(cfg) {
    var pairs = buildTextPairs(cfg);
    document.querySelectorAll('span, button, p, li, td, th, label, h1, h2, h3, h4, small, strong').forEach(
      function (el) {
        if (!isLeafTextEl(el)) return;
        var txt = el.textContent || '';
        if (!txt || txt.length > 512) return;
        var next = applyTextReplace(txt, pairs);
        if (next !== txt) el.textContent = next;
      },
    );
  }

  function patchAnchorsInner(cfg) {
    document.querySelectorAll('a').forEach(function (a) {
      if (!isLeafTextEl(a)) return;
      var txt = a.textContent || '';
      if (/sky\.com/i.test(txt)) {
        a.textContent = applyTextReplace(txt, buildTextPairs(cfg));
      }
    });
  }

  function apply() {
    var cfg = getConfig();
    if (!cfg || !cfg.siteHost || !cfg.brand) return;
    if (RUNNING) return;
    RUNNING = true;
    try {
      patchUrlReplacements(cfg);
      patchUrlsAndInputs(cfg);
      patchAxis(cfg);
      patchLeafText(cfg);
      patchAnchorsInner(cfg);
    } catch (e) {
      /* snapshot */
    } finally {
      RUNNING = false;
    }
  }

  function schedule() {
    if (DEBOUNCE) window.clearTimeout(DEBOUNCE);
    DEBOUNCE = window.setTimeout(apply, 120);
  }

  function runAll() {
    apply();
    if (window.SkyLlmLlmDemoBrands && window.SkyLlmLlmDemoBrands.applyAll) {
      window.SkyLlmLlmDemoBrands.applyAll();
    }
  }

  function init() {
    if (!getConfig()) return;
    runAll();
    window.setTimeout(runAll, 400);
    window.setTimeout(runAll, 1200);
    window.setTimeout(runAll, 2800);
    window.setTimeout(runAll, 4500);
    window.setTimeout(runAll, 7000);
    window.addEventListener('storage', function (e) {
      if (e.key === 'llmDemoPersonalization_v1') schedule();
    });
  }

  window.skyLlmLlmDemoPersonalize = { apply: runAll, schedule: schedule };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
