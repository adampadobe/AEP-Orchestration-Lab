/**
 * LLM Demo — shared Sky → customer URL mapping (Top Movers, Opportunities, tables, links).
 */
(function (global) {
  'use strict';

  var SKY_DEMO_PATHS = [
    '/content/status',
    '/help/server-status',
    '/tv/sky-glass',
    '/tv/sky-glass/packages',
    '/tv/sky-stream',
    '/broadband/deals',
    '/broadband/full-fibre',
    '/tv/sports',
    '/tv/cinema',
    '/shop/tv',
    '/help/home',
    '/help/broadband',
    '/magazine/entertainment',
    '/magazine/sport',
    '/tv/ultimate-tv',
    '/tv/netflix',
    '/robots.txt',
  ];

  function getCfg() {
    var brands = global.LlmDemoBrands || global.SkyLlmLlmDemoBrands;
    if (brands && brands.isActive()) {
      return brands.loadConfig();
    }
    try {
      var raw = localStorage.getItem('llmDemoPersonalization_v1');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.brand && parsed.siteHost) return parsed;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function replaceHostInUrl(url, cfg) {
    var s = String(url || '').trim();
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
      var path = u.pathname || '/';
      var j;
      for (j = 0; j < SKY_DEMO_PATHS.length; j++) {
        if (path === SKY_DEMO_PATHS[j] || path.indexOf(SKY_DEMO_PATHS[j] + '/') === 0) {
          return targetUrlForSkyPath(SKY_DEMO_PATHS[j], cfg);
        }
      }
      u.hostname = cfg.siteHost;
      if (cfg.siteUrl && cfg.siteUrl.indexOf('http:') === 0) u.protocol = 'http:';
      else u.protocol = 'https:';
      return u.href;
    } catch (e) {
      return s.replace(/https?:\/\/(?:www\.)?sky\.com/gi, cfg.siteUrl || 'https://' + cfg.siteHost);
    }
  }

  function targetUrlForSkyPath(skyPath, cfg) {
    var reps = cfg.urlReplacements || [];
    var i;
    for (i = 0; i < reps.length; i++) {
      if (reps[i].from && reps[i].from.indexOf(skyPath) >= 0) return reps[i].to;
    }
    var idx = SKY_DEMO_PATHS.indexOf(skyPath);
    var urls = cfg.sampleUrls || [];
    if (idx >= 0 && urls[idx % urls.length]) return urls[idx % urls.length];
    if (urls.length) return urls[idx >= 0 ? idx % urls.length : 0];
    return (cfg.siteUrl || 'https://' + cfg.siteHost) + skyPath;
  }

  function formatLinkDisplay(fullUrl) {
    try {
      var u = new URL(fullUrl);
      var host = u.hostname.replace(/^www\./i, '');
      return host + u.pathname + (u.search || '');
    } catch (e) {
      return String(fullUrl || '').replace(/^https?:\/\/(?:www\.)?/i, '');
    }
  }

  function mapTextUrls(text, cfg) {
    var out = String(text || '');
    if (!/sky\.com/i.test(out)) return out;
    out = out.replace(/https?:\/\/(?:www\.)?sky\.com[^\s<"]*/gi, function (match) {
      return formatLinkDisplay(replaceHostInUrl(match, cfg));
    });
    out = out.replace(/(?:www\.)?sky\.com\/[^\s<"]+/gi, function (match) {
      return formatLinkDisplay(replaceHostInUrl('https://' + match.replace(/^www\./i, ''), cfg));
    });
    return out;
  }

  function patchAnchor(a, cfg) {
    var href = a.getAttribute('href') || '';
    var text = a.textContent || '';
    if (!/sky\.com/i.test(href) && !/sky\.com/i.test(text)) return;
    var base = href || (text.indexOf('http') === 0 ? text.trim() : 'https://' + text.trim());
    var mapped = replaceHostInUrl(base, cfg);
    if (mapped) {
      a.setAttribute('href', mapped);
      if (!a.querySelector('svg, img')) a.textContent = formatLinkDisplay(mapped);
    }
  }

  function patchRoot(root, cfg) {
    if (!root || !cfg) return;
    root.querySelectorAll('a').forEach(function (a) {
      patchAnchor(a, cfg);
    });
    root.querySelectorAll('td, th, span[data-rsp-slot="text"], .sky-llm-op-table a').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var txt = el.textContent || '';
      if (!/sky\.com/i.test(txt)) return;
      var next = mapTextUrls(txt, cfg);
      if (next !== txt) el.textContent = next;
    });
  }

  function findTopMoversRoot() {
    var heads = Array.from(document.querySelectorAll('span[data-rsp-slot="text"], h2, h3')).filter(function (n) {
      return (n.textContent || '').trim() === 'Top Movers' && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 10 && root; i++) {
      if (root.querySelector('a[href*="sky.com"]')) return root;
      root = root.parentElement;
    }
    return null;
  }

  function patchTopMovers(cfg) {
    var root = findTopMoversRoot();
    if (root) patchRoot(root, cfg);
  }

  function patchOpportunitiesDetail() {
    var detail = document.getElementById('skyLlmOpDetail');
    if (detail && !detail.hidden) patchRoot(detail, getCfg());
  }

  function patchPage() {
    var cfg = getCfg();
    if (!cfg) return;
    patchTopMovers(cfg);
    if (/opportunities\.html/i.test(global.location.pathname || '')) {
      patchOpportunitiesDetail();
    }
    var main = document.getElementById('root');
    if (main) {
      main.querySelectorAll('a[href*="sky.com"]').forEach(function (a) {
        patchAnchor(a, cfg);
      });
    }
  }

  var urlsApi = {
    getCfg: getCfg,
    replaceHostInUrl: replaceHostInUrl,
    formatLinkDisplay: formatLinkDisplay,
    mapTextUrls: mapTextUrls,
    patchRoot: patchRoot,
    patchPage: patchPage,
    patchOpportunitiesDetail: patchOpportunitiesDetail,
  };
  global.LlmDemoUrls = urlsApi;
  global.SkyLlmDemoUrls = urlsApi;
})(typeof window !== 'undefined' ? window : globalThis);
