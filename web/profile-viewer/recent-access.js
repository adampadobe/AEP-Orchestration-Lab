/**
 * Track last accessed app pages in localStorage and render the home "Recently accessed" table.
 * @see STORAGE_KEY
 */
(function (global) {
  var STORAGE_KEY = 'aepProfileViewerRecentAccess_v1';
  var MAX_STORED = 12;
  var DISPLAY_LIMIT = 5;

  /** basename -> { name } — home.html omitted (not recorded). Type column uses left nav label + icon. */
  var PAGE_REGISTRY = {
    'index.html': { name: 'Profile Viewer' },
    'schema-viewer.html': { name: 'Data viewer' },
    'audience-membership.html': { name: 'Audience' },
    'journeys.html': { name: 'Journeys' },
    'profile-generation.html': { name: 'Profile generation' },
    'consent.html': { name: 'Consent' },
    'reporting.html': { name: 'Reporting overview' },
    'agentic-ai.html': { name: 'Agentic AI architecture' },
    'agentic-ai-v2.html': { name: 'Agentic AI v2' },
    'event-generator.html': { name: 'Event generator' },
    'donate-demo.html': { name: 'Donate (demo)' },
    'call-center-demo.html': { name: 'Contact center (demo)' },
    'race-for-life-demo.html': { name: 'Race for Life (demo)' },
    'oldmutual-demo.html': { name: 'Old Mutual (demo)' },
    'oldmutual-wealth.html': { name: 'Old Mutual Wealth (demo)' },
    'events-trigger.html': { name: 'Events trigger' },
    'firebase-hosting.html': { name: 'Firebase images' },
    'ajo-journey-events.html': { name: 'AJO journey events' },
    'search.html': { name: 'Search profiles' },
    'search-by-attribute.html': { name: 'Search by attribute' },
    'profile.html': { name: 'Profile attributes' },
  };

  /**
   * Same SVG paths + labels as dashboard-sidebar-nav (home.html / index.html) for 16px Type column.
   * Pages not in the nav use a sensible icon + registry name.
   */
  var MENU_TYPE_BY_PAGE = {
    'index.html': {
      label: 'Profile Viewer',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    },
    'schema-viewer.html': {
      label: 'Data viewer',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    },
    'audience-membership.html': {
      label: 'Audience',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    'journeys.html': {
      label: 'Journeys',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    },
    'event-generator.html': {
      label: 'Event generator',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    },
    'profile-generation.html': {
      label: 'Profile generation',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    },
    'consent.html': {
      label: 'Consent',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    },
    'reporting.html': {
      label: 'Overview',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    },
    'agentic-ai.html': {
      label: 'Agentic AI',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
    },
    'agentic-ai-v2.html': {
      label: 'Agentic AI v2',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    },
    'donate-demo.html': {
      label: 'Donate (demo)',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    },
    'call-center-demo.html': {
      label: 'Contact center (demo)',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    },
    'race-for-life-demo.html': {
      label: 'Race for Life (demo)',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    },
    'oldmutual-demo.html': {
      label: 'Old Mutual (demo)',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    },
    'oldmutual-wealth.html': {
      label: 'Old Mutual Wealth (demo)',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    },
    'events-trigger.html': {
      label: 'Events trigger',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    },
    'firebase-hosting.html': {
      label: 'Firebase images',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    },
    'ajo-journey-events.html': {
      label: 'AJO journey events',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    },
    'search.html': {
      label: 'Search profiles',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    },
    'search-by-attribute.html': {
      label: 'Search by attribute',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    },
    'profile.html': {
      label: 'Profile attributes',
      svg:
        '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    },
  };

  var FALLBACK_TYPE_ICO =
    '<svg class="home-ajo-type-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

  function getPageFileName() {
    var path = String(window.location.pathname || '').replace(/\/$/, '');
    var seg = path.split('/').pop() || '';
    if (!seg || seg === '') return 'index.html';
    if (seg.indexOf('.') === -1) return 'index.html';
    return seg.toLowerCase();
  }

  function lookupPageMeta(fileName) {
    var k = String(fileName || '').toLowerCase();
    if (PAGE_REGISTRY[k]) return { id: k, meta: PAGE_REGISTRY[k] };
    return null;
  }

  function menuTypeForPageId(pageId) {
    var k = String(pageId || '').toLowerCase();
    if (MENU_TYPE_BY_PAGE[k]) return MENU_TYPE_BY_PAGE[k];
    var meta = lookupPageMeta(k);
    return {
      label: meta && meta.meta && meta.meta.name ? meta.meta.name : 'Application',
      svg: FALLBACK_TYPE_ICO,
    };
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      return [];
    }
  }

  function save(items) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items }));
    } catch (e) {
      /* quota / private mode */
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = global.document;
    if (d && d.createElement) {
      var el = d.createElement('div');
      el.textContent = String(s);
      return el.innerHTML;
    }
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatModified(iso) {
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) {
      return '—';
    }
  }

  /**
   * Call on each registered tool page load (not home).
   */
  function recordCurrentPage() {
    var raw = getPageFileName();
    if (raw === 'home.html') return;
    var found = lookupPageMeta(raw);
    if (!found) return;
    var key = found.id;
    var meta = found.meta;
    var items = load();
    var now = new Date().toISOString();
    items = items.filter(function (x) {
      return x && x.id !== key;
    });
    items.unshift({
      id: key,
      name: meta.name,
      href: key,
      lastAccess: now,
    });
    if (items.length > MAX_STORED) items = items.slice(0, MAX_STORED);
    save(items);
  }

  function getRecentForDisplay() {
    var items = load();
    return items.slice(0, DISPLAY_LIMIT);
  }

  /**
   * Fill #homeRecentAccessBody on home.html
   */
  function renderHomeRecentTable(tbodyId) {
    var tbody = global.document.getElementById(tbodyId || 'homeRecentAccessBody');
    if (!tbody) return;
    var rows = getRecentForDisplay();
    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr class="home-ajo-table-empty-row"><td colspan="4">' +
        '<div class="home-ajo-empty" role="status">' +
        '<div class="home-ajo-empty-icon" aria-hidden="true">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25">' +
        '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />' +
        '<polyline points="3.27 6.96 12 12.01 20.73 6.96" />' +
        '<line x1="12" y1="22.08" x2="12" y2="12" />' +
        '</svg></div>' +
        '<p class="home-ajo-empty-title">Your recently accessed work will appear here</p>' +
        '<p class="home-ajo-empty-hint">Open Profile Viewer, Journeys, or other tools from the left menu to get started.</p>' +
        '</div></td></tr>';
      return;
    }
    var html = rows
      .map(function (r) {
        var href = escapeHtml(r.href || r.id);
        var name = escapeHtml(r.name);
        var mt = menuTypeForPageId(r.id);
        var typeLabel = escapeHtml(mt.label);
        var when = formatModified(r.lastAccess);
        return (
          '<tr class="home-ajo-table-data-row">' +
          '<td class="home-ajo-td-name"><a class="home-ajo-recent-link" href="' +
          href +
          '">' +
          name +
          '</a></td>' +
          '<td class="home-ajo-td-type">' +
          '<span class="home-ajo-type-cell">' +
          mt.svg +
          '<span class="home-ajo-type-text">' +
          typeLabel +
          '</span></span></td>' +
          '<td class="home-ajo-td-muted">—</td>' +
          '<td class="home-ajo-td-muted">' +
          escapeHtml(when) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    tbody.innerHTML = html;
  }

  global.AEPRecentAccess = {
    recordCurrentPage: recordCurrentPage,
    renderHomeRecentTable: renderHomeRecentTable,
    getRecentForDisplay: getRecentForDisplay,
    _storageKey: STORAGE_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
