/**
 * LLM Demo — scoped URL Inspector cited-URL + category patches (avoids full-document scans).
 */
(function (global) {
  'use strict';

  /** Same order as functions/llmDemoPersonalizeService.js SKY_DEMO_PATHS */
  var SKY_CITED_PATHS = [
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
  ];

  var SKY_CATEGORY_LABEL = 'TV and broadband';
  var PATCHED_ROW = 'data-llm-demo-url-patched';

  function isUrlInspectorPage() {
    return /url-inspector\.html/i.test(global.location.pathname || '');
  }

  function findCitedUrlsRoot() {
    var heads = Array.from(document.querySelectorAll('div, span, h2, h3, button')).filter(function (n) {
      return (n.textContent || '').trim() === 'Your Cited URLs' && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 14 && root; i++) {
      if (root.querySelector('[role="row"]')) return root;
      root = root.parentElement;
    }
    return null;
  }

  function skyPathFromHint(hint) {
    var s = String(hint || '');
    if (!s) return '';
    var blog = s.match(/blog-([\w/-]+)/i);
    if (blog) {
      var seg = blog[1].replace(/-/g, '/');
      if (seg.charAt(0) !== '/') seg = '/' + seg;
      return seg.replace(/\/+/g, '/');
    }
    var path = s.match(/(\/tv\/[\w-]+|\/broadband\/[\w-]+|\/help\/[\w-]+|\/shop\/[\w-]+|\/content\/[\w-]+)/i);
    return path ? path[1] : '';
  }

  function resolveSkyPath(hint, cfg) {
    var extracted = skyPathFromHint(hint);
    var i;
    for (i = 0; i < SKY_CITED_PATHS.length; i++) {
      if (extracted && extracted.indexOf(SKY_CITED_PATHS[i]) >= 0) return SKY_CITED_PATHS[i];
    }
    for (i = 0; i < SKY_CITED_PATHS.length; i++) {
      if (hint.indexOf(SKY_CITED_PATHS[i].replace(/^\//, '')) >= 0) return SKY_CITED_PATHS[i];
    }
    if (/sky-glass\/packages/i.test(hint)) return '/tv/sky-glass/packages';
    if (/sky-glass/i.test(hint)) return '/tv/sky-glass';
    if (/full-fibre/i.test(hint)) return '/broadband/full-fibre';
    if (/broadband\/deals/i.test(hint)) return '/broadband/deals';
    var urls = cfg.sampleUrls || [];
    if (urls.length) {
      try {
        return new URL(urls[0]).pathname;
      } catch (e) {
        return '/';
      }
    }
    return '/';
  }

  function targetUrlForSkyPath(skyPath, cfg) {
    var reps = cfg.urlReplacements || [];
    var i;
    for (i = 0; i < reps.length; i++) {
      if (reps[i].from && reps[i].from.indexOf(skyPath) >= 0) return reps[i].to;
    }
    var idx = SKY_CITED_PATHS.indexOf(skyPath);
    var urls = cfg.sampleUrls || [];
    if (idx >= 0 && urls[idx % urls.length]) return urls[idx % urls.length];
    if (urls.length) return urls[idx >= 0 ? idx % urls.length : 0];
    return (cfg.siteUrl || 'https://' + cfg.siteHost) + skyPath;
  }

  function formatCitedLinkLabel(fullUrl, cfg) {
    try {
      var u = new URL(fullUrl);
      var host = u.hostname.replace(/^www\./i, '');
      return host + u.pathname + (u.search || '');
    } catch (e) {
      return String(fullUrl || '').replace(/^https?:\/\/(?:www\.)?/i, '');
    }
  }

  function patchCategoryTags(row, cfg) {
    var industry = (cfg.industry || '').trim();
    if (!industry) return;
    row.querySelectorAll('span, div').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var txt = (el.textContent || '').trim();
      if (txt === SKY_CATEGORY_LABEL) el.textContent = industry;
    });
  }

  function patchRow(row, cfg) {
    if (row.getAttribute(PATCHED_ROW) === '1') return;
    var hint =
      row.getAttribute('data-key') ||
      row.getAttribute('aria-labelledby') ||
      row.getAttribute('id') ||
      '';
    var link =
      row.querySelector('a[href]') ||
      row.querySelector('[role="gridcell"] a') ||
      row.querySelector('a');
    if (link) hint += ' ' + (link.getAttribute('href') || '') + ' ' + (link.textContent || '');

    var skyPath = resolveSkyPath(hint, cfg);
    var target = targetUrlForSkyPath(skyPath, cfg);
    var label = formatCitedLinkLabel(target, cfg);

    if (link) {
      link.setAttribute('href', target);
      if (link.childElementCount === 0) link.textContent = label;
      else {
        link.querySelectorAll('span').forEach(function (span) {
          if (span.childElementCount === 0) span.textContent = label;
        });
      }
    }

    row.querySelectorAll('span, a').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var txt = el.textContent || '';
      if (
        !/sky|frescopa|broadband|sky-glass|full-fibre|TV and broadband/i.test(txt) ||
        txt.length > 220
      ) {
        return;
      }
      if (/sky-glass|full-fibre|broadband|\/tv\/|\/help\//i.test(txt) || /TV and broadband/i.test(txt)) {
        el.textContent = label;
      }
    });

    patchCategoryTags(row, cfg);
    row.setAttribute(PATCHED_ROW, '1');
  }

  function patch() {
    if (!isUrlInspectorPage()) return;
    if (!global.SkyLlmLlmDemoBrands || !global.SkyLlmLlmDemoBrands.isActive()) return;
    var cfg = global.SkyLlmLlmDemoBrands.loadConfig();
    if (!cfg) return;

    var root = findCitedUrlsRoot();
    if (!root) return;

    root.querySelectorAll('[role="row"]').forEach(function (row) {
      try {
        patchRow(row, cfg);
      } catch (e) {
        /* frozen row */
      }
    });
  }

  global.SkyLlmUrlInspector = { patch: patch, isUrlInspectorPage: isUrlInspectorPage };
})(typeof window !== 'undefined' ? window : globalThis);
