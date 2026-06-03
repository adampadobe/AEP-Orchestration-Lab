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
  var sectionRootCache = {};
  var applyTimer = null;
  var applyPass = 0;
  var MAX_APPLY_PASSES = 2;

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
    sectionRootCache = {};
    applyPass = 0;
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
    if (/https?:\/\/|www\./i.test(out)) {
      out = out.split('www.sky.com').join(cfg.siteHost);
      out = out.split('sky.com').join(cfg.siteHost);
    }
    return out;
  }

  function mapStarMarketLabel(txt) {
    var t = String(txt || '').trim();
    if (!t) return t;
    var starred = /^⭐\s*/.test(t);
    var core = t.replace(/^⭐\s*/, '').trim();
    var mapped = skyToDisplay(core);
    if (core === 'Sky' || core === 'Sky TV and broadband') mapped = brandPickerLabel();
    return starred ? '⭐ ' + mapped : mapped;
  }

  function patchMarketLabelNode(el) {
    if (!el) return;
    var txt = (el.textContent || '').trim();
    if (!txt || txt.length > 48) return;
    var next = mapStarMarketLabel(txt);
    if (next !== txt) el.textContent = next;
  }

  function isLeafTextEl(el) {
    return el && el.childElementCount === 0;
  }

  function patchSiteHeaderBrand() {
    if (!isActive()) return;
    var label = brandPickerLabel();
    document.querySelectorAll('header [data-rsp-slot="text"]').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (!txt || txt.length > 96) return;
      if (txt === 'Sky' || txt === 'Sky TV and broadband' || /frescopa/i.test(txt)) {
        el.textContent = label;
      } else if (txt === 'Virgin Media' || txt === 'BT' || txt === 'TalkTalk') {
        el.textContent = skyToDisplay(txt);
      }
    });
  }

  function patchBrandPicker() {
    if (!isActive()) return;
    var cfg = loadConfig();
    var label = brandPickerLabel();

    document.querySelectorAll('[role="combobox"]').forEach(function (box) {
      box.querySelectorAll('span').forEach(function (el) {
        if (!isLeafTextEl(el)) return;
        var txt = (el.textContent || '').trim();
        if (txt.length > 80) return;
        if (txt === 'Sky' || /sky tv|frescopa/i.test(txt)) el.textContent = label;
        else if (SKY_TO_COMP_INDEX[txt] != null || txt === 'Virgin Media' || txt === 'BT' || txt === 'TalkTalk') {
          el.textContent = skyToDisplay(txt);
        }
      });
    });
  }

  function findSectionRoot(title) {
    if (sectionRootCache[title]) return sectionRootCache[title];
    var heads = Array.from(document.querySelectorAll('h2, h3, span[data-rsp-slot="text"]')).filter(function (n) {
      return (n.textContent || '').trim() === title && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 10 && root; i++) {
      if (root.querySelector('svg.recharts-surface')) {
        sectionRootCache[title] = root;
        return root;
      }
      root = root.parentElement;
    }
    return null;
  }

  function patchMarketComparisonLabels() {
    if (!isActive()) return;
    var root = findSectionRoot('Market Comparison');
    if (!root) return;
    root.querySelectorAll(
      '.recharts-yAxis-tick-label text, .recharts-cartesian-axis-tick-label text, text, tspan',
    ).forEach(patchMarketLabelNode);
    root.querySelectorAll('.recharts-yAxis-tick-label title').forEach(function (titleEl) {
      var txt = (titleEl.textContent || '').trim();
      var next = mapStarMarketLabel(txt);
      if (next !== txt) titleEl.textContent = next;
    });
    root.querySelectorAll('span, strong').forEach(function (el) {
      if (!isLeafTextEl(el)) return;
      var txt = (el.textContent || '').trim();
      if (txt.length > 40) return;
      var next = mapStarMarketLabel(txt);
      if (next === txt) next = applyTextPairs(txt);
      if (next !== txt) el.textContent = next;
    });
  }

  function patchUrlInspector() {
    if (!isActive()) return;
    if (window.SkyLlmUrlInspector && window.SkyLlmUrlInspector.patch) {
      window.SkyLlmUrlInspector.patch();
      return;
    }
    var cfg = loadConfig();
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (/sky\.com/i.test(href)) a.setAttribute('href', replaceSkyUrl(href, cfg));
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

  function platformReady() {
    return (
      global.skyLlmSnapshotPlatform &&
      global.skyLlmSnapshotPlatform.isReady &&
      global.skyLlmSnapshotPlatform.isReady()
    );
  }

  function marketTrackingReady() {
    return (
      global.skyLlmSnapshotMarket &&
      global.skyLlmSnapshotMarket.isMarketTrackingReady &&
      global.skyLlmSnapshotMarket.isMarketTrackingReady()
    );
  }

  function pageNeedsMarketTracking() {
    return /brand-presence\.html/i.test(global.location.pathname || '');
  }

  function patchBrandClaims() {
    if (global.SkyLlmBrandClaims && global.SkyLlmBrandClaims.patch) {
      global.SkyLlmBrandClaims.patch();
    }
  }

  function shouldAutoApply() {
    if (!isActive()) return false;
    if (/(?:\?|&)llmDemo=1(?:&|$)/.test(global.location.search || '')) return true;
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return false;
    }
  }

  function applyAll() {
    if (!isActive()) return;
    applyPass += 1;

    patchSiteHeaderBrand();
    patchBrandPicker();
    patchBrandClaims();
    patchMarketComparisonLabels();
    patchUrlInspector();
    applyLegendLabels();
    if (global.SkyLlmDemoUrls && global.SkyLlmDemoUrls.patchPage) {
      global.SkyLlmDemoUrls.patchPage();
    }

    if (global.skyLlmLlmDemoPersonalize && global.skyLlmLlmDemoPersonalize.patchLinksAndInputs) {
      global.skyLlmLlmDemoPersonalize.patchLinksAndInputs();
    }

    if (platformReady() && global.skyLlmSnapshotPlatform.refresh) {
      global.skyLlmSnapshotPlatform.refresh();
      patchMarketComparisonLabels();
    }

    if (!marketTrackingReady() && global.skyLlmSnapshotMarket && global.skyLlmSnapshotMarket.initMarketTracking) {
      global.skyLlmSnapshotMarket.initMarketTracking();
    }

    patchBrandClaims();
    if (global.SkyLlmDemoUrls && global.SkyLlmDemoUrls.patchPage) {
      global.SkyLlmDemoUrls.patchPage();
    }

    if (
      applyPass < MAX_APPLY_PASSES &&
      (!platformReady() || (pageNeedsMarketTracking() && !marketTrackingReady()))
    ) {
      global.setTimeout(applyAll, 450);
    }
  }

  function scheduleApplyAll() {
    if (applyTimer) global.clearTimeout(applyTimer);
    applyPass = 0;
    sectionRootCache = {};
    applyTimer = global.setTimeout(function () {
      applyTimer = null;
      applyAll();
    }, 32);
  }

  function reapplyMarket() {
    scheduleApplyAll();
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

  try {
    if (shouldAutoApply()) scheduleApplyAll();
  } catch (e) {
    /* ignore */
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
    patchMarketComparisonLabels: patchMarketComparisonLabels,
    applyAll: applyAll,
    scheduleApplyAll: scheduleApplyAll,
    reapplyMarket: reapplyMarket,
  };
})(typeof window !== 'undefined' ? window : globalThis);
