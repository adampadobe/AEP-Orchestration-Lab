/**
 * Brand scraper catalog for Command Centre — logos, scrape picker, competitor hints.
 */
(function attachHomeCommandScrapes(global) {
  'use strict';

  var catalog = [];
  var detailCache = {};
  var loadPromise = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveSandbox() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      return global.AepLabSandboxSync.getSandbox() || '';
    }
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function imageUrlFromEntry(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return entry.signedUrl || entry.url || entry.src || '';
  }

  function scoreLogoCandidate(entry) {
    var url = imageUrlFromEntry(entry);
    if (!url) return -99;
    var hay = (
      String(entry.alt || '') +
      ' ' +
      String(entry.className || entry.class || '') +
      ' ' +
      url
    ).toLowerCase();
    var score = 0;
    if (/logo/.test(hay)) score += 10;
    if (entry.classification && entry.classification.category === 'logo') score += 20;
    if (/brandmark|site-logo|header-logo|nav-logo/.test(hay)) score += 6;
    if (/\.svg($|\?)/i.test(url)) score += 2;
    if (/favicon|icon-/.test(hay)) score -= 2;
    if (/banner|hero|product|lifestyle|tracking|pixel|1x1/.test(hay)) score -= 4;
    return score;
  }

  function pickLogoFromAssets(assets) {
    if (!assets || typeof assets !== 'object') return '';
    var ranked = [];
    (assets.imagesV2 || []).forEach(function (img) {
      if (!img || img.error) return;
      var url = imageUrlFromEntry(img);
      if (!url) return;
      ranked.push({ url: url, score: scoreLogoCandidate(img) });
    });
    (assets.images || []).forEach(function (img) {
      var url = imageUrlFromEntry(img);
      if (!url) return;
      ranked.push({ url: url, score: scoreLogoCandidate(img) });
    });
    ranked.sort(function (a, b) {
      return b.score - a.score;
    });
    if (ranked.length && ranked[0].score >= 4) return ranked[0].url;
    if (assets.favicons && assets.favicons.length) {
      var favUrl = imageUrlFromEntry(assets.favicons[0]);
      if (favUrl) return favUrl;
    }
    if (assets.ogImages && assets.ogImages.length) {
      var og = imageUrlFromEntry(assets.ogImages[0]);
      if (og) return og;
    }
    return ranked.length ? ranked[0].url : '';
  }

  function pickLogoFromRecord(record) {
    if (!record || typeof record !== 'object') return '';
    if (record.customerLogo) {
      var wiki = record.customerLogo.url || record.customerLogo.thumbnailUrl;
      if (wiki) return wiki;
    }
    var crawlAssets = record.crawlSummary && record.crawlSummary.assets;
    if (crawlAssets && crawlAssets.customerLogo) {
      var fromCrawl = crawlAssets.customerLogo.url || crawlAssets.customerLogo.thumbnailUrl;
      if (fromCrawl) return fromCrawl;
    }
    if (record.customerLogoUrl) return record.customerLogoUrl;
    if (record.scrapeLogoUrl) return record.scrapeLogoUrl;
    var fromAssets = pickLogoFromAssets(record.assets || crawlAssets);
    if (fromAssets) return fromAssets;
    var demo = record.llmDemoConfig || {};
    if (demo.customerLogo) return String(demo.customerLogo);
    if (record.analysis && record.analysis.brand_logo) return String(record.analysis.brand_logo);
    return '';
  }

  function getCompetitorsFromRecord(record) {
    if (!record) return [];
    var cfg = record.llmDemoConfig || {};
    if (Array.isArray(cfg.competitors)) {
      return cfg.competitors.filter(Boolean).map(String);
    }
    return [];
  }

  function loadCatalog(force) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = fetch(
      '/api/brand-scraper/scrapes' +
        (resolveSandbox() ? '?sandbox=' + encodeURIComponent(resolveSandbox()) : ''),
      { credentials: 'same-origin' }
    )
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        catalog = Array.isArray(data.items) ? data.items : [];
        catalog.sort(function (a, b) {
          return (
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
          );
        });
        try {
          global.dispatchEvent(new CustomEvent('aep-command-scrapes-loaded', { detail: { count: catalog.length } }));
        } catch (_e) {}
        return catalog;
      })
      .catch(function () {
        catalog = [];
        return catalog;
      });
    return loadPromise;
  }

  function getCatalog() {
    return catalog.slice();
  }

  function getById(scrapeId) {
    return catalog.find(function (s) {
      return s.scrapeId === scrapeId;
    });
  }

  function loadDetail(scrapeId) {
    if (!scrapeId) return Promise.resolve(null);
    if (detailCache[scrapeId]) return Promise.resolve(detailCache[scrapeId]);
    var sb = resolveSandbox();
    var qs = sb ? '?sandbox=' + encodeURIComponent(sb) : '';
    return fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId) + qs, {
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (record) {
        if (record) detailCache[scrapeId] = record;
        return record;
      })
      .catch(function () {
        return null;
      });
  }

  function scrapeLabel(item) {
    if (!item) return '';
    return item.customerName || item.brandName || item.baseUrl || item.url || item.scrapeId || 'Scrape';
  }

  function renderSelectOptions(selectedId) {
    if (!catalog.length) {
      return '<option value="">No scrapes for this sandbox</option>';
    }
    var opts =
      '<option value="">— None —</option>' +
      catalog
        .map(function (s) {
          var label = scrapeLabel(s);
          var meta = s.baseUrl ? ' · ' + s.baseUrl : '';
          return (
            '<option value="' +
            esc(s.scrapeId) +
            '"' +
            (selectedId === s.scrapeId ? ' selected' : '') +
            '>' +
            esc(label + meta) +
            '</option>'
          );
        })
        .join('');
    return opts;
  }

  function scrapePageUrl(scrapeId) {
    return scrapeId ? 'brand-scraper.html?scrapeId=' + encodeURIComponent(scrapeId) : 'brand-scraper.html';
  }

  function enrichCustomerLogo(customer) {
    if (!customer || !customer.scrapeId) return Promise.resolve(customer);
    if (customer.scrapeLogoUrl) return Promise.resolve(customer);
    return loadDetail(customer.scrapeId).then(function (record) {
      if (!record) return customer;
      return Object.assign({}, customer, {
        scrapeLogoUrl: pickLogoFromRecord(record),
        scrapeBrand: customer.scrapeBrand || record.customerName || record.brandName || scrapeLabel(getById(customer.scrapeId)),
      });
    });
  }

  function init() {
    loadCatalog();
    global.addEventListener('aep-global-sandbox-change', function () {
      detailCache = {};
      loadCatalog(true);
    });
  }

  global.HomeCommandScrapes = {
    init: init,
    loadCatalog: loadCatalog,
    getCatalog: getCatalog,
    getById: getById,
    loadDetail: loadDetail,
    pickLogoFromRecord: pickLogoFromRecord,
    getCompetitorsFromRecord: getCompetitorsFromRecord,
    renderSelectOptions: renderSelectOptions,
    scrapeLabel: scrapeLabel,
    scrapePageUrl: scrapePageUrl,
    enrichCustomerLogo: enrichCustomerLogo,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
