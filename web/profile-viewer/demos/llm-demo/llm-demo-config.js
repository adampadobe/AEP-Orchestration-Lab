/**
 * Build LLM Demo personalization from a customer site URL (localStorage payload).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'llmDemoPersonalization_v1';

  var SKY_DEFAULT = {
    siteUrl: 'https://www.sky.com',
    siteHost: 'sky.com',
    brand: 'Sky',
    competitors: ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+'],
    axisMap: {
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
    },
  };

  function hostToBrand(host) {
    var h = String(host || '')
      .replace(/^www\./i, '')
      .trim();
    var base = h.split('.')[0] || 'Customer';
    base = base.replace(/[-_]+/g, ' ');
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function suggestCompetitors(brand) {
    var b = String(brand || 'Brand').trim() || 'Brand';
    return [
      b + ' Media',
      'Helix Broadband',
      'Prime Stream',
      'Vertex Mobile',
      'Lumen TV',
      'Apex Digital',
    ];
  }

  function normalizeUrlInput(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
      return new URL(s);
    } catch (e) {
      return null;
    }
  }

  function buildFromUrl(rawUrl) {
    var parsed = normalizeUrlInput(rawUrl);
    if (!parsed) return null;
    var host = parsed.hostname.replace(/^www\./i, '');
    var brand = hostToBrand(host);
    var competitors = suggestCompetitors(brand);
    return {
      siteUrl: parsed.origin,
      siteHost: host,
      brand: brand,
      competitors: competitors,
      axisMap: {
        Adobe: brand,
        WKND: competitors[0],
        Automattic: competitors[1],
        Contentful: competitors[2],
        Global: competitors[0],
        AEM: competitors[5],
        Wix: competitors[2],
        Webflow: competitors[0],
        Frescopa: brand,
        'Sweet Maria\u2019s': competitors[1],
        Cropster: competitors[2],
        Agtron: competitors[0],
      },
      sourceUrl: parsed.href,
      updatedAt: Date.now(),
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.siteHost || !data.brand) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function save(config) {
    if (!config) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
      return null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      /* ignore */
    }
    return config;
  }

  function reset() {
    save(null);
    return SKY_DEFAULT;
  }

  function activeOrDefault() {
    return load() || SKY_DEFAULT;
  }

  function isCustomized() {
    return !!load();
  }

  global.LlmDemoConfig = {
    STORAGE_KEY: STORAGE_KEY,
    SKY_DEFAULT: SKY_DEFAULT,
    buildFromUrl: buildFromUrl,
    load: load,
    save: save,
    reset: reset,
    activeOrDefault: activeOrDefault,
    isCustomized: isCustomized,
    hostToBrand: hostToBrand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
