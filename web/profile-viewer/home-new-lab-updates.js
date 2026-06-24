/**
 * Lab updates panel for home-new.html — recent demo pages and brand scrapes.
 */
(function attachHomeNewLabUpdates(global) {
  'use strict';

  var DEMO_PAGES = [
    {
      title: 'Brand Scraper',
      desc: 'Crawl brand sites, extract design tokens, personas, and campaign ideas.',
      href: 'brand-scraper.html',
    },
    {
      title: 'Journey arbitration v3',
      desc: 'Decisioning pipeline lab with industry labels and anatomy embed.',
      href: 'journey-arbitration-v3.html',
    },
    {
      title: 'Content decision live edge',
      desc: 'Edge Network decisioning demo with brand scrape integration.',
      href: 'content-decision-live-edge.html',
    },
    {
      title: 'Experimentation accelerator',
      desc: 'Target-style experimentation playground with industry presets.',
      href: 'experimentation-accelerator.html',
    },
    {
      title: 'Image hosting',
      desc: 'Curated image library and scrape-sourced assets per sandbox.',
      href: 'image-hosting.html',
    },
    {
      title: 'Profile generation',
      desc: 'Generate sandbox-friendly test profiles aligned to your schema.',
      href: 'profile-generation.html',
    },
  ];

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

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_e) {
      return '—';
    }
  }

  function renderDemos(container) {
    if (!container) return;
    container.innerHTML = DEMO_PAGES.slice(0, 3).map(function (page) {
      return (
        '<div class="home-lab-compact-item">' +
        '<div class="home-lab-compact-item__title"><a href="' +
        esc(page.href) +
        '">' +
        esc(page.title) +
        '</a></div>' +
        '<div class="home-lab-compact-item__desc">' +
        esc(page.desc) +
        '</div></div>'
      );
    }).join('');
  }

  function renderScrapes(container, items, err) {
    if (!container) return;
    if (err) {
      container.innerHTML =
        '<p class="home-lab-updates-empty">Could not load scrapes — ' + esc(err) + '</p>';
      return;
    }
    if (!items || !items.length) {
      container.innerHTML =
        '<p class="home-lab-updates-empty">No scrapes for this sandbox. <a href="brand-scraper.html">Open scraper</a></p>';
      return;
    }
    var recent = items.slice(0, 3);
    container.innerHTML = recent
      .map(function (it) {
        var label = it.brandName || it.baseUrl || it.url || it.scrapeId || 'Scrape';
        var sub = it.baseUrl || it.url || '';
        var meta =
          fmtDate(it.updatedAt || it.createdAt) +
          (typeof it.pagesScraped === 'number' ? ' · ' + it.pagesScraped + ' pages' : '') +
          (it.analysisPresent ? ' · analysed' : '');
        return (
          '<div class="home-lab-compact-item home-lab-compact-item--scrape">' +
          '<div class="home-lab-compact-item__title">' +
          esc(label) +
          '</div>' +
          (sub ? '<div class="home-lab-compact-item__url">' + esc(sub) + '</div>' : '') +
          '<div class="home-lab-compact-item__meta">' +
          esc(meta) +
          ' · <a href="brand-scraper.html">Open scraper</a></div></div>'
        );
      })
      .join('');
  }

  function loadScrapes() {
    var el = document.getElementById('homeLabScrapesList');
    if (!el) return;
    el.innerHTML = '<p class="home-lab-updates-loading" role="status">Loading recent scrapes…</p>';
    var sb = resolveSandbox();
    var qs = sb ? '?sandbox=' + encodeURIComponent(sb) : '';
    fetch('/api/brand-scraper/scrapes' + qs, { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
          return Array.isArray(data.items) ? data.items : [];
        });
      })
      .then(function (items) {
        items.sort(function (a, b) {
          var ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
          var tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return tb - ta;
        });
        renderScrapes(el, items, '');
      })
      .catch(function (e) {
        renderScrapes(el, [], String(e.message || e));
      });
  }

  function init() {
    var root = document.getElementById('homeLabUpdates');
    if (!root || root.getAttribute('data-home-lab-updates-init') === '1') return;
    root.setAttribute('data-home-lab-updates-init', '1');
    renderDemos(document.getElementById('homeLabDemosList'));
    loadScrapes();
    global.addEventListener('aep-global-sandbox-change', loadScrapes);
  }

  function boot() {
    if (document.getElementById('homeLabUpdates')) {
      init();
      return;
    }
    global.addEventListener('aep-deferred-dashboard-mounted', init, { once: true });
  }

  global.HomeNewLabUpdates = { init: init, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
