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
    var s = String(url || '');
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
    var pairs = [
      ['www.sky.com', host],
      ['sky.com', host],
      ['Sky UK', brand],
      ['Virgin Media', comps[0] || 'Virgin Media'],
      ['TalkTalk', comps[2] || 'TalkTalk'],
      ['Disney+', comps[5] || 'Disney+'],
      ['Netflix', comps[4] || 'Netflix'],
      ['BT', comps[1] || 'BT'],
      ['Sky', brand],
      ['frescopa TV and broadband', brand],
      ['frescopa', brand],
    ];
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

  function init() {
    if (!getConfig()) return;
    apply();
    window.setTimeout(apply, 400);
    window.setTimeout(apply, 1200);
    window.setTimeout(apply, 2800);
    window.addEventListener('storage', function (e) {
      if (e.key === 'llmDemoPersonalization_v1') schedule();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
