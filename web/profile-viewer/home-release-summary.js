/**
 * Experience Cloud release summary panel for home-new.html.
 * Reads GET /api/release-notes/summary when deployed; falls back to bundled catalog.
 */
(function attachHomeReleaseSummary(global) {
  'use strict';

  var API_PATH = '/api/release-notes/summary';
  var COMPACT_LIMIT = 8;

  function getCatalog() {
    return global.HomeReleaseCatalog || null;
  }

  function getProductOrder() {
    var cat = getCatalog();
    return (cat && cat.productOrder) || [];
  }

  function getPeriodEntry(periodId) {
    var cat = getCatalog();
    if (!cat || !cat.periods) return null;
    return cat.periods[periodId] || null;
  }

  function buildSampleFromCatalog(periodId) {
    var entry = getPeriodEntry(periodId);
    if (!entry) return null;
    return {
      period: entry.period,
      fetchedAt: entry.fetchedAt,
      sourceUrl: entry.sourceUrl,
      periodId: entry.id,
      products: entry.products,
    };
  }

  var state = {
    activeProduct: 'cdp',
    activePeriodId: 'june-2026',
    data: null,
    loading: false,
    error: '',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeClass(badge) {
    var map = {
      GA: 'positive',
      Beta: 'notice',
      LA: 'info',
      New: 'info',
      Soon: 'notice',
      Fix: 'neutral',
      Infra: 'neutral',
    };
    return 'home-release-status-badge--' + (map[badge] || 'info');
  }

  function formatFetched(iso) {
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_e) {
      return '—';
    }
  }

  function totalItems(product) {
    return (product.sections || []).reduce(function (n, sec) {
      return n + (sec.items ? sec.items.length : 0);
    }, 0);
  }

  function getProduct(id) {
    return state.data && state.data.products && state.data.products[id];
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderPeriodSelect() {
    var selectEl = document.getElementById('homeReleasePeriodSelect');
    var cat = getCatalog();
    if (!selectEl || !cat || !cat.periodOrder) return;

    if (!selectEl.getAttribute('data-bound')) {
      selectEl.setAttribute('data-bound', '1');
      selectEl.addEventListener('change', function () {
        state.activePeriodId = selectEl.value;
        var bundled = buildSampleFromCatalog(state.activePeriodId);
        if (bundled) applyData(bundled);
      });
    }

    selectEl.innerHTML = cat.periodOrder
      .map(function (id) {
        var entry = cat.periods[id];
        if (!entry) return '';
        var selected = id === state.activePeriodId;
        return (
          '<option value="' +
          esc(id) +
          '"' +
          (selected ? ' selected' : '') +
          '>' +
          esc(entry.label || entry.period) +
          '</option>'
        );
      })
      .join('');
  }

  function renderTabs() {
    var tabsEl = document.getElementById('homeReleaseTabs');
    if (!tabsEl || !state.data) return;
    var order = getProductOrder();
    tabsEl.innerHTML = order
      .map(function (id) {
        var p = state.data.products[id];
        if (!p) return '';
        var count = totalItems(p);
        var selected = id === state.activeProduct;
        return (
          '<button type="button" class="home-release-sp-tab" role="tab" aria-selected="' +
          (selected ? 'true' : 'false') +
          '" data-product="' +
          esc(id) +
          '">' +
          esc(p.shortName) +
          '<span class="home-release-sp-tab-count">' +
          count +
          '</span></button>'
        );
      })
      .join('');

    tabsEl.querySelectorAll('.home-release-sp-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeProduct = btn.getAttribute('data-product');
        renderTabs();
        renderCompact();
      });
    });
  }

  function renderCompact() {
    var gridEl = document.getElementById('homeReleaseGrid');
    var footEl = document.getElementById('homeReleaseFootNote');
    if (!gridEl || !state.data) return;
    var p = getProduct(state.activeProduct);
    if (!p) return;

    var items = (p.highlights || []).slice(0, COMPACT_LIMIT);
    gridEl.innerHTML = items
      .map(function (item) {
        return (
          '<article class="home-release-sp-card">' +
          '<div class="home-release-sp-card__head">' +
          '<h4 class="home-release-sp-card__title">' +
          esc(item.title) +
          '</h4>' +
          (item.badge
            ? '<span class="home-release-status-badge ' +
              badgeClass(item.badge) +
              '">' +
              esc(item.badge) +
              '</span>'
            : '') +
          '</div>' +
          '<p class="home-release-sp-card__body">' +
          esc(item.body) +
          '</p>' +
          '</article>'
        );
      })
      .join('');

    var total = totalItems(p);
    if (footEl) {
      footEl.textContent =
        'Showing ' +
        Math.min(COMPACT_LIMIT, (p.highlights || []).length) +
        ' of ' +
        total +
        ' items · ' +
        p.name;
    }
  }

  function renderDrawer() {
    var p = getProduct(state.activeProduct);
    if (!p) return;
    var drawerTitle = document.getElementById('homeReleaseDrawerTitle');
    var sectionsEl = document.getElementById('homeReleaseDrawerSections');
    if (drawerTitle) {
      drawerTitle.innerHTML =
        esc(p.name) +
        ' — <span class="home-release-drawer__title-accent">' +
        esc(state.data.period || '') +
        '</span>';
    }
    setText('homeReleaseDrawerDesc', 'Sourced from Experience League');
    if (!sectionsEl) return;
    sectionsEl.innerHTML = (p.sections || [])
      .map(function (sec) {
        return (
          '<section class="home-release-section">' +
          '<h3 class="home-release-section__title">' +
          esc(sec.title) +
          '</h3>' +
          '<div class="home-release-card-grid">' +
          sec.items
            .map(function (item) {
              return (
                '<article class="home-release-sp-card">' +
                '<div class="home-release-sp-card__head">' +
                '<h4 class="home-release-sp-card__title">' +
                esc(item.title) +
                '</h4>' +
                (item.badge
                  ? '<span class="home-release-status-badge ' +
                    badgeClass(item.badge) +
                    '">' +
                    esc(item.badge) +
                    '</span>'
                  : '') +
                '</div>' +
                '<p class="home-release-sp-card__body">' +
                esc(item.body) +
                '</p>' +
                '</article>'
              );
            })
            .join('') +
          '</div></section>'
        );
      })
      .join('');
  }

  function openDrawer() {
    renderDrawer();
    var drawer = document.getElementById('homeReleaseDrawer');
    var backdrop = document.getElementById('homeReleaseBackdrop');
    if (drawer) {
      drawer.classList.add('home-release-drawer--open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    var drawer = document.getElementById('homeReleaseDrawer');
    var backdrop = document.getElementById('homeReleaseBackdrop');
    if (drawer) {
      drawer.classList.remove('home-release-drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function showLoading() {
    var body = document.getElementById('homeReleasePanelBody');
    if (body) {
      body.innerHTML =
        '<div class="home-release-state" role="status">' +
        '<div class="home-release-state__ring" aria-hidden="true"></div>' +
        'Fetching latest from Experience League…</div>';
    }
  }

  function showError(msg) {
    var alertEl = document.getElementById('homeReleaseAlert');
    if (alertEl) {
      alertEl.hidden = false;
      alertEl.innerHTML = '<strong>Could not refresh release notes</strong>' + esc(msg);
    }
  }

  function hideError() {
    var alertEl = document.getElementById('homeReleaseAlert');
    if (alertEl) {
      alertEl.hidden = true;
      alertEl.innerHTML = '';
    }
  }

  function restoreBodyShell() {
    var body = document.getElementById('homeReleasePanelBody');
    if (!body) return;
    body.innerHTML =
      '<div class="home-release-card-grid" id="homeReleaseGrid" aria-live="polite"></div>';
  }

  function renderMeta() {
    if (!state.data) return;
    var periodEl = document.getElementById('homeReleasePeriod');
    if (periodEl) periodEl.textContent = state.data.period || '—';
    var tsEl = document.getElementById('homeReleaseTimestamp');
    if (tsEl) {
      tsEl.textContent = state.data.fetchedAt
        ? 'Updated ' + formatFetched(state.data.fetchedAt)
        : '';
    }
    renderPeriodSelect();
  }

  function renderAll() {
    hideError();
    restoreBodyShell();
    renderMeta();
    renderTabs();
    renderCompact();
  }

  function applyData(data) {
    state.data = data;
    if (data.periodId) state.activePeriodId = data.periodId;
    var order = getProductOrder();
    if (order.indexOf(state.activeProduct) === -1) state.activeProduct = order[0] || 'cdp';
    renderAll();
  }

  function defaultBundledData() {
    var cat = getCatalog();
    var periodId = (cat && cat.defaultPeriodId) || state.activePeriodId;
    return buildSampleFromCatalog(periodId);
  }

  function fetchSummary(forceRefresh) {
    if (state.loading) return;
    state.loading = true;
    hideError();
    var btn = document.getElementById('homeReleaseRefresh');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
    }
    showLoading();

    var url = API_PATH + (forceRefresh ? '?refresh=1' : '');
    fetch(url, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !payload.products) throw new Error('Invalid response');
        applyData(payload);
      })
      .catch(function () {
        var bundled = defaultBundledData();
        if (bundled) applyData(bundled);
        if (forceRefresh) {
          showError('API not available yet — showing bundled release catalog.');
        }
      })
      .finally(function () {
        state.loading = false;
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('is-loading');
        }
      });
  }

  function init() {
    var root = document.getElementById('homeReleasePanel');
    if (!root || root.getAttribute('data-home-release-init') === '1') return;
    root.setAttribute('data-home-release-init', '1');

    var cat = getCatalog();
    if (cat && cat.defaultPeriodId) state.activePeriodId = cat.defaultPeriodId;
    var bundled = defaultBundledData();
    if (bundled) applyData(bundled);

    var refreshBtn = document.getElementById('homeReleaseRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        fetchSummary(true);
      });
    }

    ['homeReleaseExpand', 'homeReleaseExpandFoot'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', openDrawer);
    });

    var closeBtn = document.getElementById('homeReleaseDrawerClose');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    var backdrop = document.getElementById('homeReleaseBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    initReleaseCollapse();
  }

  function initReleaseCollapse() {
    var panel = document.getElementById('homeReleasePanel');
    var btn = document.getElementById('homeReleaseCollapseBtn');
    if (!panel || !btn || btn.getAttribute('data-bound') === '1') return;
    btn.setAttribute('data-bound', '1');

    var storageKey = 'aepHomeReleaseCollapsed';
    var collapsed = false;
    try {
      collapsed = localStorage.getItem(storageKey) === '1';
    } catch (_e) {}

    function apply(collapsedState) {
      panel.classList.toggle('home-release-panel--collapsed', collapsedState);
      btn.setAttribute('aria-expanded', collapsedState ? 'false' : 'true');
      btn.title = collapsedState ? 'Expand release highlights' : 'Collapse release highlights';
    }

    apply(collapsed);

    btn.addEventListener('click', function () {
      collapsed = !collapsed;
      apply(collapsed);
      try {
        localStorage.setItem(storageKey, collapsed ? '1' : '0');
      } catch (_e) {}
    });
  }

  function boot() {
    if (document.getElementById('homeReleasePanel')) {
      init();
      return;
    }
    global.addEventListener('aep-deferred-dashboard-mounted', init, { once: true });
  }

  global.HomeReleaseSummary = { init: init, fetchSummary: fetchSummary, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
