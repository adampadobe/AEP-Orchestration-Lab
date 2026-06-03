/**
 * LLM Demo personalization — localStorage + /api/llm-demo/personalize research.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'llmDemoPersonalization_v1';
  var API_PATH = '/api/llm-demo/personalize';

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

  var SKY_REFERENCE_BRANDS = ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+', 'Sky'];

  function hostToBrand(host) {
    var h = String(host || '')
      .replace(/^www\./i, '')
      .trim();
    var base = h.split('.')[0] || 'Customer';
    base = base.replace(/[-_]+/g, ' ');
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function buildAxisMap(brand, competitors) {
    var c = competitors || [];
    return {
      Adobe: brand,
      WKND: c[0] || brand,
      Automattic: c[1] || brand,
      Contentful: c[2] || brand,
      Global: c[0] || brand,
      AEM: c[5] || brand,
      Wix: c[2] || brand,
      Webflow: c[0] || brand,
      Frescopa: brand,
      'Sweet Maria\u2019s': c[1] || brand,
      Cropster: c[2] || brand,
      Agtron: c[0] || brand,
    };
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
    var competitors = [
      brand + ' Media',
      'Helix Broadband',
      'Prime Stream',
      'Vertex Mobile',
      'Lumen TV',
      'Apex Digital',
    ];
    return {
      siteUrl: parsed.origin,
      siteHost: host,
      brand: brand,
      competitors: competitors,
      axisMap: buildAxisMap(brand, competitors),
      sourceUrl: parsed.href,
      updatedAt: Date.now(),
      researchUsed: false,
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

  /**
   * Crawl site + Google Search–grounded competitor research via Cloud Function.
   * @returns {Promise<{config: object, meta: object}>}
   */
  function fetchResearch(rawUrl, options) {
    var opts = options || {};
    var parsed = normalizeUrlInput(rawUrl);
    if (!parsed) return Promise.reject(new Error('Enter a valid URL'));

    var body = { url: parsed.href };
    if (opts.brandOverride) body.brandOverride = String(opts.brandOverride).trim();

    body.llmDemoPersonalize = true;
    body.sync = true;

    return fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.text().then(function (text) {
        var ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        var data = null;
        if (/json/i.test(ct) || (text && text.trim().charAt(0) === '{')) {
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            throw new Error('Research API returned invalid JSON.');
          }
        } else if (text && /^\s*</.test(text)) {
          throw new Error(
            'Research API is not available (got an HTML page instead of JSON). ' +
              'Hosting may need redeploy, or brandScraperAnalyze must be updated on the project.',
          );
        } else {
          throw new Error((text || res.statusText || 'Research failed').slice(0, 240));
        }
        if (!res.ok) throw new Error((data && data.error) || res.statusText || 'Research failed');
        if (!data || !data.config) throw new Error('No personalization config returned');
        var cfg = data.config;
        if (opts.brandOverride) cfg.brand = String(opts.brandOverride).trim();
        if (!cfg.axisMap) cfg.axisMap = buildAxisMap(cfg.brand, cfg.competitors);
        cfg.sourceUrl = parsed.href;
        cfg.updatedAt = Date.now();
        return { config: cfg, meta: data.meta || {} };
      });
    });
  }

  global.LlmDemoConfig = {
    STORAGE_KEY: STORAGE_KEY,
    SKY_DEFAULT: SKY_DEFAULT,
    SKY_REFERENCE_BRANDS: SKY_REFERENCE_BRANDS,
    buildFromUrl: buildFromUrl,
    buildAxisMap: buildAxisMap,
    fetchResearch: fetchResearch,
    load: load,
    save: save,
    reset: reset,
    activeOrDefault: activeOrDefault,
    isCustomized: isCustomized,
    hostToBrand: hostToBrand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
