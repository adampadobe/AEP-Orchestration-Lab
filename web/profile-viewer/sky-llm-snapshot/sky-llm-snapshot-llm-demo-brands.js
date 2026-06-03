/**
 * LLM Demo — map frozen Sky chart/internal brand keys to customer labels (localStorage + postMessage).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'llmDemoPersonalization_v1';
  var SKY_CHART_KEYS = ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+', 'Sky'];
  var SKY_DEFAULT_SELECTED = ['Sky', 'BT', 'TalkTalk', 'Virgin Media'];

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (e) {
      /* ignore */
    }
    cached = cfg;
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

  function reapplyMarket() {
    if (global.skyLlmSnapshotMarket && global.skyLlmSnapshotMarket.initMarketTracking) {
      global.skyLlmSnapshotMarket.initMarketTracking();
    }
    applyLegendLabels();
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
    if (global.skyLlmLlmDemoPersonalize && global.skyLlmLlmDemoPersonalize.apply) {
      global.skyLlmLlmDemoPersonalize.apply();
    }
  });

  global.SkyLlmLlmDemoBrands = {
    STORAGE_KEY: STORAGE_KEY,
    SKY_CHART_KEYS: SKY_CHART_KEYS,
    loadConfig: loadConfig,
    isActive: isActive,
    clearCache: clearCache,
    skyToDisplay: skyToDisplay,
    displayToSky: displayToSky,
    getDefaultSelected: getDefaultSelected,
    getAllBrands: getAllBrands,
    getKnownBrandsMap: getKnownBrandsMap,
    persistConfig: persistConfig,
    applyLegendLabels: applyLegendLabels,
    reapplyMarket: reapplyMarket,
  };
})(typeof window !== 'undefined' ? window : globalThis);
