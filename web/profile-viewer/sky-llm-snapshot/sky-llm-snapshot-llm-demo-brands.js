/**
 * LLM Demo — map frozen Sky chart/internal brand keys to customer labels (localStorage + postMessage).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'llmDemoPersonalization_v1';
  var SKY_CHART_KEYS = ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+', 'Sky'];
  var SKY_DEFAULT_SELECTED = ['Sky', 'BT', 'TalkTalk', 'Virgin Media'];
  var SKY_LABEL_STRINGS = [
    'Sky TV and broadband',
    'Sky UK',
    'Virgin Media',
    'TalkTalk',
    'Disney+',
    'Netflix',
    'BT',
    'Sky',
    'frescopa TV and broadband',
    'frescopa',
  ];

  var SKY_TO_COMP_INDEX = {
    'Virgin Media': 0,
    BT: 1,
    TalkTalk: 2,
    Netflix: 4,
    'Disney+': 5,
  };

  var cached = null;

  function readRaw() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function loadConfig() {
    if (cached) return cached;
    cached = readRaw();
    return cached;
  }

  function isActive() {
    var c = loadConfig();
    return !!(c && c.brand && c.siteHost);
  }

  function clearCache() {
    cached = null;
  }

  function skyToDisplay(internalName) {
    var name = String(internalName || '').trim();
    if (!isActive()) return name;
    var cfg = loadConfig();
    var comps = cfg.competitors || [];
    if (name === 'Sky') return cfg.brand;
    var ci = SKY_TO_COMP_INDEX[name];
    if (ci != null && comps[ci]) return comps[ci];
    if (cfg.axisMap && cfg.axisMap[name]) return cfg.axisMap[name];
    return name;
  }

  function displayToSky(label) {
    var text = String(label || '').trim();
    if (!isActive()) return text;
    var cfg = loadConfig();
    if (text === cfg.brand) return 'Sky';
    var comps = cfg.competitors || [];
    var keys = Object.keys(SKY_TO_COMP_INDEX);
    for (var i = 0; i < keys.length; i++) {
      var skyKey = keys[i];
      var ci = SKY_TO_COMP_INDEX[skyKey];
      if (comps[ci] && text === comps[ci]) return skyKey;
    }
    return text;
  }

  function brandPickerLabel() {
    var cfg = loadConfig();
    if (!cfg) return '';
    return cfg.brandPickerLabel || cfg.brand || '';
  }

  function replaceSkyUrl(text, cfg) {
    var s = String(text || '');
    if (!s || !cfg) return s;
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
      return u.href;
    } catch (e) {
      return s.replace(/https?:\/\/(?:www\.)?sky\.com/gi, cfg.siteUrl || 'https://' + cfg.siteHost);
    }
  }

  function applyTextPairs(text) {
    if (!isActive()) return text;
    var cfg = loadConfig();
    var out = String(text || '');
    SKY_LABEL_STRINGS.forEach(function (skyLabel) {
      var display = skyToDisplay(skyLabel);
      if (skyLabel === 'Sky TV and broadband' || skyLabel === 'frescopa TV and broadband') {
        display = brandPickerLabel();
      }
      if (skyLabel.indexOf('sky.com') >= 0 || skyLabel === 'Sky UK') {
        return;
      }
      if (display && out.indexOf(skyLabel) !== -1) out = out.split(skyLabel).join(display);
    });
    out = out.split('www.sky.com').join(cfg.siteHost);
    out = out.split('sky.com').join(cfg.siteHost);
    return out;
  }

  function isLeafTextEl(el) {
    return el && el.childElementCount === 0;
  }

  function patchBrandPicker() {
    if (!isActive()) return;
    var cfg = loadConfig();
    var label = brandPickerLabel();
    var host = cfg.siteHost;

    document.querySelectorAll('[role="combobox"]').forEach(function (box) {
      box.querySelectorAll('span, div').forEach(function (el) {
        if (!isLeafTextEl(el)) return;
        var txt = (el.textContent || '').trim();
        if (
          /sky|frescopa|broadband|virgin media|talktalk/i.test(txt) &&
          txt.length < 80
        ) {
          if (txt === 'Sky' || /sky tv|frescopa/i.test(txt)) el.textContent = label;
          else if (SKY_TO_COMP_INDEX[txt] != null || txt === 'Virgin Media' || txt === 'BT') {
            el.textContent = skyToDisplay(txt);
          }
        }
      });
    });

    document.querySelectorAll('input, textarea').forEach(function (input) {
      var val = input.value || '';
      if (/sky\.com|wknd|frescopa/i.test(val)) {
        if (/^https?:\/\//i.test(val)) input.value = replaceSkyUrl(val, cfg);
        else input.value = host;
      }
      if (/frescopa|sky tv/i.test(val)) input.value = label;
    });
  }

  function findSectionRoot(title) {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3')).filter(function (n) {
      return n.textContent.trim() === title && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 10 && root; i++) {
      if (root.querySelector('svg.recharts-surface')) return root;
      root = root.parentElement;
    }
    return null;
  }

  function patchMarketComparisonLabels() {
    if (!isActive()) return;
    var root = findSectionRoot('Market Comparison');
    if (!root) return;
    root.querySelectorAll('text, tspan').forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (!txt || txt.length > 40 || /^\d+$/.test(txt)) return;
      var mapped = skyToDisplay(txt);
      if (txt === 'Sky' || txt === 'Sky TV and broadband') mapped = brandPickerLabel();
      if (mapped !== txt) el.textContent = mapped;
    });
    root.querySelectorAll('span, strong').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (txt.length > 40) return;
      var next = applyTextPairs(txt);
      if (next !== txt) el.textContent = next;
    });
  }

  function patchUrlInspector() {
    if (!isActive()) return;
    var cfg = loadConfig();
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (/sky\.com/i.test(href)) a.setAttribute('href', replaceSkyUrl(href, cfg));
      if (isLeafTextEl(a) && /sky\.com/i.test(a.textContent || '')) {
        a.textContent = replaceSkyUrl(a.textContent, cfg);
      }
    });
    document.querySelectorAll('td, th, span, code, div, p, li').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = el.textContent || '';
      if (!txt || txt.length > 600) return;
      if (!/sky\.com|Sky|Virgin Media|TalkTalk|frescopa/i.test(txt)) return;
      var next = applyTextPairs(txt);
      if (/sky\.com/i.test(next)) next = replaceSkyUrl(next, cfg);
      if (next !== txt) el.textContent = next;
    });
    document.querySelectorAll('input, textarea').forEach(function (input) {
      var val = input.value || '';
      if (/sky\.com/i.test(val)) input.value = replaceSkyUrl(val, cfg);
    });
  }

  function applyLegendLabels(root) {
    if (!isActive()) return;
    var scope = root || document;
    scope.querySelectorAll('.recharts-legend-item-text').forEach(function (textEl) {
      var internal = displayToSky(textEl.textContent.trim());
      var display = skyToDisplay(internal);
      if (display && textEl.textContent !== display) textEl.textContent = display;
    });
  }

  function applyAll() {
    if (!isActive()) return;
    patchBrandPicker();
    patchMarketComparisonLabels();
    patchUrlInspector();
    applyLegendLabels();
    if (global.skyLlmSnapshotPlatform && global.skyLlmSnapshotPlatform.refresh) {
      global.skyLlmSnapshotPlatform.refresh();
    }
    if (global.skyLlmSnapshotMarket && global.skyLlmSnapshotMarket.initMarketTracking) {
      global.skyLlmSnapshotMarket.initMarketTracking();
    }
    if (global.skyLlmLlmDemoPersonalize && global.skyLlmLlmDemoPersonalize.apply) {
      global.skyLlmLlmDemoPersonalize.apply();
    }
  }

  function reapplyMarket() {
    applyAll();
  }

  global.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) {
      clearCache();
      reapplyMarket();
    }
  });

  global.addEventListener('message', function (e) {
    var data = e && e.data;
    if (!data || data.type !== 'llm-demo-config') return;
    if (data.config) persistConfig(data.config);
    else persistConfig(null);
    reapplyMarket();
  });

  function persistConfig(cfg) {
    if (!cfg) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
      clearCache();
      return;
    }
    if (!cfg.brandPickerLabel && cfg.brand) cfg.brandPickerLabel = cfg.brand;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (e) {
      /* ignore */
    }
    cached = cfg;
  }

  function getDefaultSelected() {
    return SKY_DEFAULT_SELECTED.slice();
  }

  function getAllBrands() {
    if (!isActive()) return null;
    var cfg = loadConfig();
    var comps = cfg.competitors || [];
    return [cfg.brand]
      .concat(comps.slice(0, 5))
      .filter(function (b, i, arr) {
        return b && arr.indexOf(b) === i;
      });
  }

  function getKnownBrandsMap() {
    var map = { Sky: 1, 'Virgin Media': 1, BT: 1, TalkTalk: 1, Netflix: 1, 'Disney+': 1 };
    if (!isActive()) return map;
    getAllBrands().forEach(function (b) {
      map[b] = 1;
      map[displayToSky(b)] = 1;
    });
    return map;
  }

  global.SkyLlmLlmDemoBrands = {
    STORAGE_KEY: STORAGE_KEY,
    SKY_CHART_KEYS: SKY_CHART_KEYS,
    loadConfig: loadConfig,
    isActive: isActive,
    clearCache: clearCache,
    skyToDisplay: skyToDisplay,
    displayToSky: displayToSky,
    brandPickerLabel: brandPickerLabel,
    getDefaultSelected: getDefaultSelected,
    getAllBrands: getAllBrands,
    getKnownBrandsMap: getKnownBrandsMap,
    persistConfig: persistConfig,
    applyLegendLabels: applyLegendLabels,
    applyAll: applyAll,
    reapplyMarket: reapplyMarket,
  };
})(typeof window !== 'undefined' ? window : globalThis);
