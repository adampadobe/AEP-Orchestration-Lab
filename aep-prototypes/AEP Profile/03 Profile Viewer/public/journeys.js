(function () {
  const statusEl = document.getElementById('journeysStatus');
  const tbody = document.getElementById('journeysTbody');
  const searchInput = document.getElementById('journeysSearch');
  const countEl = document.getElementById('journeysCount');
  const errorEl = document.getElementById('journeysError');
  const statusFilterEl = document.getElementById('journeysStatusFilter');
  const sandboxSelect = document.getElementById('sandboxSelect');
  const refreshBtn = document.getElementById('jrnRefresh');
  const cjaDataViewSelect = document.getElementById('cjaDataViewSelect');
  const cjaAnalyticsToggle = document.getElementById('journeysCjaAnalyticsToggle');
  const cjaAnalyticsPanel = document.getElementById('journeysCjaPanel');
  const CJA_DV_STORAGE_KEY = 'aepJourneysCjaDataViewId';
  const CJA_ANALYTICS_ENABLED_KEY = 'aepJourneysCjaAnalyticsEnabled';
  const CJA_DATE_RANGE_STORAGE_KEY = 'aepJourneysCjaDateRangeId';
  const CJA_DATE_RANGE_IDS = [
    'today',
    'yesterday',
    'last7Days',
    'last30Days',
    'last90Days',
    'last180Days',
  ];
  const COLUMN_VISIBILITY_STORAGE_KEY = 'aepJourneysColumnVisibility';
  const TOGGLE_COLUMN_KEYS = [
    'version',
    'status',
    'tags',
    'enters',
    'exits',
    'delivered',
    'displays',
    'clicks',
    'createdAt',
    'createdBy',
    'updatedAt',
    'updatedBy',
    'publishedAt',
    'publishedBy',
  ];
  const COLUMN_LABELS = {
    version: 'Version',
    status: 'Status',
    tags: 'Tags',
    enters: 'Enters',
    exits: 'Exits',
    delivered: 'Delivered',
    displays: 'Displays',
    clicks: 'Clicks',
    createdAt: 'Creation date',
    createdBy: 'Created by',
    updatedAt: 'Last update',
    updatedBy: 'Last update by',
    publishedAt: 'Published',
    publishedBy: 'Published by',
  };

  function loadColumnVisibility() {
    const defaults = {};
    for (let i = 0; i < TOGGLE_COLUMN_KEYS.length; i++) {
      defaults[TOGGLE_COLUMN_KEYS[i]] = true;
    }
    try {
      const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      const out = { ...defaults };
      for (let j = 0; j < TOGGLE_COLUMN_KEYS.length; j++) {
        const k = TOGGLE_COLUMN_KEYS[j];
        if (Object.prototype.hasOwnProperty.call(parsed, k)) out[k] = Boolean(parsed[k]);
      }
      return out;
    } catch (e) {
      return defaults;
    }
  }

  function saveColumnVisibility() {
    try {
      const o = {};
      for (let i = 0; i < TOGGLE_COLUMN_KEYS.length; i++) {
        const k = TOGGLE_COLUMN_KEYS[i];
        o[k] = columnVisibility[k] !== false;
      }
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(o));
    } catch (e) {
      /* ignore */
    }
  }

  let columnVisibility = loadColumnVisibility();

  function visibleJourneyColCount() {
    let n = 2;
    for (let i = 0; i < TOGGLE_COLUMN_KEYS.length; i++) {
      const k = TOGGLE_COLUMN_KEYS[i];
      if (columnVisibility[k] !== false) n += 1;
    }
    return n;
  }

  function applyJourneyColumnVisibility() {
    const table = document.getElementById('journeysTable');
    if (!table) return;
    for (let i = 0; i < TOGGLE_COLUMN_KEYS.length; i++) {
      const k = TOGGLE_COLUMN_KEYS[i];
      table.classList.toggle(`journeys-col--hide-${k}`, columnVisibility[k] === false);
    }
  }

  let allRows = [];
  let sortKey = 'name';
  let sortDir = 'asc';
  let loadGen = 0;
  /** Mirrors server CJA_DATE_RANGE_ID for header date labels (updated from API when CJA applies). */
  let lastCjaDateRangeId = 'last30Days';

  function getSandbox() {
    if (window.AepGlobalSandbox) return window.AepGlobalSandbox.getSandboxName() || '';
    return (sandboxSelect && sandboxSelect.value) || '';
  }

  function loadCjaAnalyticsEnabled() {
    try {
      const v = localStorage.getItem(CJA_ANALYTICS_ENABLED_KEY);
      if (v === '1' || v === 'true') return true;
      if (v === '0' || v === 'false') return false;
    } catch (e) {
      /* ignore */
    }
    try {
      const dv = localStorage.getItem(CJA_DV_STORAGE_KEY);
      if (dv && String(dv).trim()) return true;
    } catch (e2) {
      /* ignore */
    }
    return false;
  }

  function saveCjaAnalyticsEnabled(on) {
    try {
      localStorage.setItem(CJA_ANALYTICS_ENABLED_KEY, on ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  function loadCjaDateRangeId() {
    try {
      const v = localStorage.getItem(CJA_DATE_RANGE_STORAGE_KEY);
      if (v && CJA_DATE_RANGE_IDS.indexOf(v) !== -1) return v;
    } catch (e) {
      /* ignore */
    }
    return 'last30Days';
  }

  function saveCjaDateRangeId(id) {
    const s = id && CJA_DATE_RANGE_IDS.indexOf(id) !== -1 ? id : 'last30Days';
    try {
      localStorage.setItem(CJA_DATE_RANGE_STORAGE_KEY, s);
    } catch (e) {
      /* ignore */
    }
    return s;
  }

  /** Selected CJA reporting window (always a valid id — sent on browse requests for server-side CJA enrichment). */
  function getSelectedCjaDateRangeId() {
    return loadCjaDateRangeId();
  }

  const cjaDateRangeBtns = document.getElementById('journeysCjaDateRangeBtns');

  function syncCjaDateRangeButtons() {
    if (!cjaDateRangeBtns) return;
    const current = getSelectedCjaDateRangeId();
    const buttons = cjaDateRangeBtns.querySelectorAll('.journeys-cja-range-btn[data-cja-range]');
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const id = b.getAttribute('data-cja-range');
      const active = id === current;
      b.classList.toggle('journeys-cja-range-btn--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function applyCjaAnalyticsUi() {
    const on = !!(cjaAnalyticsToggle && cjaAnalyticsToggle.checked);
    if (cjaAnalyticsPanel) {
      cjaAnalyticsPanel.hidden = !on;
    }
    if (cjaAnalyticsToggle) {
      cjaAnalyticsToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (cjaDataViewSelect) {
      cjaDataViewSelect.disabled = !on;
    }
    if (cjaDateRangeBtns) {
      const buttons = cjaDateRangeBtns.querySelectorAll('.journeys-cja-range-btn');
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].disabled = !on;
      }
    }
  }

  function getSelectedCjaDataViewId() {
    if (!cjaAnalyticsToggle || !cjaAnalyticsToggle.checked) return '';
    if (!cjaDataViewSelect) return '';
    return String(cjaDataViewSelect.value || '').trim();
  }

  /** Populate CJA data views from the API (all views; AJO-related names listed first). */
  async function populateCjaDataViewDropdown() {
    const sel = document.getElementById('cjaDataViewSelect');
    if (!sel) return;
    sel.disabled = true;
    sel.innerHTML = '<option value="">Loading…</option>';
    try {
      const res = await fetch('/api/journeys/cja-dataviews');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || data.detail || res.statusText || 'Request failed');
      }
      const list = Array.isArray(data.dataViews) ? data.dataViews : [];
      let stored = '';
      try {
        stored = localStorage.getItem(CJA_DV_STORAGE_KEY) || '';
      } catch (e) {
        stored = '';
      }
      sel.innerHTML = '';
      const optDef = document.createElement('option');
      optDef.value = '';
      optDef.textContent = 'Server default (CJA_DATAVIEW_ID / env lookup)';
      sel.appendChild(optDef);
      for (let i = 0; i < list.length; i++) {
        const dv = list[i];
        const o = document.createElement('option');
        o.value = dv.id;
        o.textContent = dv.name ? `${dv.name} (${dv.id})` : dv.id;
        sel.appendChild(o);
      }
      let pick = '';
      if (stored && list.some(function (d) { return d.id === stored; })) {
        pick = stored;
      } else {
        var sb = getSandbox().toLowerCase();
        if (sb) {
          var m = list.find(function (d) {
            return d.name && d.name.toLowerCase().indexOf('(' + sb + ')') !== -1;
          });
          if (m) pick = m.id;
        }
      }
      sel.value = pick || '';
    } catch (err) {
      sel.innerHTML = '';
      var oErr = document.createElement('option');
      oErr.value = '';
      oErr.textContent = err.message ? String(err.message) : 'Failed to load data views';
      sel.appendChild(oErr);
    } finally {
      applyCjaAnalyticsUi();
    }
  }

  function formatUsDateTime(iso) {
    if (iso == null || iso === '') return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function formatEntryTotal(n) {
    if (n == null || n === '') return '—';
    const num = Number(n);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('en-US');
  }

  function formatUsDateOnly(iso) {
    if (iso == null || iso === '') return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function statusClassAndLabel(raw) {
    const compact = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    if (compact === 'deployed') {
      return { cls: 'journeys-status--live', label: 'Live' };
    }
    if (compact === 'created' || compact === 'updated') {
      return { cls: 'journeys-status--draft', label: 'Draft' };
    }
    if (compact === 'finishedempty' || compact === 'finished_empty') {
      return { cls: 'journeys-status--finished', label: 'Finished' };
    }
    if (compact === 'finished') {
      return { cls: 'journeys-status--finished', label: 'Finished' };
    }
    const s = (raw || '').toLowerCase();
    if (s.includes('live') || compact === 'published' || compact === 'active') {
      return { cls: 'journeys-status--live', label: 'Live' };
    }
    if (s.includes('stop')) {
      return { cls: 'journeys-status--stopped', label: raw || 'Stopped' };
    }
    if (s.includes('draft')) {
      return { cls: 'journeys-status--draft', label: 'Draft' };
    }
    if (s.includes('close')) {
      return { cls: 'journeys-status--closed', label: 'Closed' };
    }
    return { cls: 'journeys-status--other', label: raw || '—' };
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function escapeHtmlAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Semantic version when present; otherwise journey version UUID for display. */
  function journeyVersionDisplay(row) {
    if (row.journeyVersion != null && String(row.journeyVersion).trim()) {
      return String(row.journeyVersion).trim();
    }
    if (row.journeyVersionID != null && String(row.journeyVersionID).trim()) {
      return String(row.journeyVersionID).trim();
    }
    return '—';
  }

  function journeyVersionTitle(row) {
    const id = row.journeyVersionID != null ? String(row.journeyVersionID).trim() : '';
    const sem = row.journeyVersion != null ? String(row.journeyVersion).trim() : '';
    if (sem && id && sem !== id) return `${sem} (id: ${id})`;
    if (id) return id;
    return '';
  }

  /** Numeric enters for sort and exit % denominator (CJA enters, else authoring count). */
  function entersSortValue(row) {
    if (row.cjaJourneyEnters != null && Number.isFinite(Number(row.cjaJourneyEnters))) {
      return Number(row.cjaJourneyEnters);
    }
    if (row.entryTotal != null && Number.isFinite(Number(row.entryTotal))) {
      return Number(row.entryTotal);
    }
    return null;
  }

  function exitsSortValue(row) {
    if (row.cjaMessagesSent != null && Number.isFinite(Number(row.cjaMessagesSent))) {
      return Number(row.cjaMessagesSent);
    }
    return null;
  }

  function cjaFieldSortValue(row, key) {
    const v = row[key];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
    return null;
  }

  function formatCjaShareMetricHtml(row, fieldKey, sum, barClass, emptyTip, valueTip) {
    const n = cjaFieldSortValue(row, fieldKey);
    if (n == null) {
      return `<div class="journeys-bar-cell journeys-bar-cell--empty" title="${escapeHtmlAttr(emptyTip)}"><span class="journeys-bar-cell__dash">—</span></div>`;
    }
    const share = sum > 0 ? (100 * n) / sum : 0;
    const w = Math.min(100, Math.max(0, share));
    const pctStr = `${share.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    let tip = valueTip;
    if (!tip) tip = '% is share of listed journeys.';
    return `<div class="journeys-bar-cell ${barClass}" title="${escapeHtmlAttr(tip)}">
      <div class="journeys-bar-cell__track" aria-hidden="true"><div class="journeys-bar-cell__fill" style="width:${w}%"></div></div>
      <div class="journeys-bar-cell__text"><span class="journeys-bar-cell__num">${escapeHtml(formatEntryTotal(n))}</span><span class="journeys-bar-cell__pct">${escapeHtml(pctStr)}</span></div>
    </div>`;
  }

  function formatEntersMetricHtml(row, sumEnters) {
    const n = entersSortValue(row);
    if (n == null) {
      return '<div class="journeys-bar-cell journeys-bar-cell--empty" title="CJA Journey Enters when available; else authoring entry count"><span class="journeys-bar-cell__dash">—</span></div>';
    }
    const share = sumEnters > 0 ? (100 * n) / sumEnters : 0;
    const w = Math.min(100, Math.max(0, share));
    const pctStr = `${share.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    const title = 'CJA Journey Enters when available; else authoring entry count. % is share of listed journeys.';
    return `<div class="journeys-bar-cell journeys-bar-cell--enters" title="${escapeHtmlAttr(title)}">
      <div class="journeys-bar-cell__track" aria-hidden="true"><div class="journeys-bar-cell__fill" style="width:${w}%"></div></div>
      <div class="journeys-bar-cell__text"><span class="journeys-bar-cell__num">${escapeHtml(formatEntryTotal(n))}</span><span class="journeys-bar-cell__pct">${escapeHtml(pctStr)}</span></div>
    </div>`;
  }

  function formatExitsMetricHtml(row, sumExits) {
    const exits = exitsSortValue(row);
    if (exits == null) {
      return '<div class="journeys-bar-cell journeys-bar-cell--empty" title="Second CJA metric (exits-related when configured)"><span class="journeys-bar-cell__dash">—</span></div>';
    }
    const enters = entersSortValue(row);
    const share = sumExits > 0 ? (100 * exits) / sumExits : 0;
    const w = Math.min(100, Math.max(0, share));
    const pctStr = `${share.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    let tip = 'Second CJA metric; % is share of listed journeys.';
    if (enters != null && enters > 0) {
      tip += ` Exits ÷ enters for this row: ${((100 * exits) / enters).toFixed(1)}%.`;
    }
    return `<div class="journeys-bar-cell journeys-bar-cell--exits" title="${escapeHtmlAttr(tip)}">
      <div class="journeys-bar-cell__track" aria-hidden="true"><div class="journeys-bar-cell__fill" style="width:${w}%"></div></div>
      <div class="journeys-bar-cell__text"><span class="journeys-bar-cell__num">${escapeHtml(formatEntryTotal(exits))}</span><span class="journeys-bar-cell__pct">${escapeHtml(pctStr)}</span></div>
    </div>`;
  }

  function dateSortValue(iso) {
    if (iso == null || iso === '') return null;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : t;
  }

  function compareNumbersAsc(va, vb) {
    const aMiss = va == null || !Number.isFinite(va);
    const bMiss = vb == null || !Number.isFinite(vb);
    if (aMiss && bMiss) return 0;
    if (aMiss) return 1;
    if (bMiss) return -1;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  }

  function compareDatesAsc(ta, tb) {
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  }

  function compareRowsAsc(a, b, key) {
    let cmp = 0;
    switch (key) {
      case 'name': {
        const sa = (a.name || a.journeyVersionID || a.journeyID || '').toLowerCase();
        const sb = (b.name || b.journeyVersionID || b.journeyID || '').toLowerCase();
        cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
        break;
      }
      case 'journeyVersion': {
        const sa = (a.journeyVersion || a.journeyVersionID || '').toLowerCase();
        const sb = (b.journeyVersion || b.journeyVersionID || '').toLowerCase();
        cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
        break;
      }
      case 'status': {
        const sa = (a.status || '').toLowerCase();
        const sb = (b.status || '').toLowerCase();
        cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
        break;
      }
      case 'tags': {
        const sa = (a.tags || []).join(' ').toLowerCase();
        const sb = (b.tags || []).join(' ').toLowerCase();
        cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
        break;
      }
      case 'enters':
        cmp = compareNumbersAsc(entersSortValue(a), entersSortValue(b));
        break;
      case 'exits':
        cmp = compareNumbersAsc(exitsSortValue(a), exitsSortValue(b));
        break;
      case 'delivered':
        cmp = compareNumbersAsc(cjaFieldSortValue(a, 'cjaDelivered'), cjaFieldSortValue(b, 'cjaDelivered'));
        break;
      case 'displays':
        cmp = compareNumbersAsc(cjaFieldSortValue(a, 'cjaDisplays'), cjaFieldSortValue(b, 'cjaDisplays'));
        break;
      case 'clicks':
        cmp = compareNumbersAsc(cjaFieldSortValue(a, 'cjaClicks'), cjaFieldSortValue(b, 'cjaClicks'));
        break;
      case 'createdAt':
      case 'updatedAt':
      case 'publishedAt':
        cmp = compareDatesAsc(dateSortValue(a[key]), dateSortValue(b[key]));
        break;
      case 'createdBy':
      case 'updatedBy':
      case 'publishedBy': {
        const sa = (a[key] || '').toLowerCase();
        const sb = (b[key] || '').toLowerCase();
        cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
        break;
      }
      default:
        return 0;
    }
    if (cmp !== 0) return cmp;
    const ida = String(a.journeyVersionID || a.journeyID || '');
    const idb = String(b.journeyVersionID || b.journeyID || '');
    return ida.localeCompare(idb, undefined, { numeric: true, sensitivity: 'base' });
  }

  function sortRows(rows, key, dir) {
    const mult = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const c = compareRowsAsc(a, b, key);
      if (c !== 0) return c * mult;
      return 0;
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll('.journeys-th-sort[data-sort-key]').forEach((btn) => {
      const key = btn.dataset.sortKey;
      const ind = btn.querySelector('.journeys-sort-indicator');
      const active = key === sortKey;
      const label = (btn.querySelector('.journeys-th-sort-label')?.textContent || key || '').trim();
      btn.classList.toggle('journeys-th-sort--active', active);
      if (ind) {
        ind.textContent = active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅';
      }
      if (active) {
        btn.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
        btn.setAttribute(
          'aria-label',
          `${label}, sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}, click to reverse`,
        );
      } else {
        btn.removeAttribute('aria-sort');
        btn.setAttribute('aria-label', `Sort by ${label}`);
      }
    });
  }

  /**
   * Sets the small date range under every column header to match the CJA report window
   * (same logic family as functions/cjaJourneyMetrics cjaDateRangeGlobalFilter).
   */
  function updateJourneyTableHeaderDateRange(dateRangeId) {
    const id = dateRangeId || 'last30Days';
    let end = new Date();
    let start = new Date(end.getTime());
    if (id === 'today') {
      start.setUTCHours(0, 0, 0, 0);
    } else if (id === 'yesterday') {
      const yStart = new Date(end.getTime());
      yStart.setUTCDate(yStart.getUTCDate() - 1);
      yStart.setUTCHours(0, 0, 0, 0);
      const yEnd = new Date(yStart.getTime());
      yEnd.setUTCHours(23, 59, 59, 999);
      start = yStart;
      end = yEnd;
    } else if (id === 'last7Days') start.setDate(start.getDate() - 7);
    else if (id === 'last30Days' || id === 'lastMonth') start.setDate(start.getDate() - 30);
    else if (id === 'last90Days') start.setDate(start.getDate() - 90);
    else if (id === 'last180Days') start.setDate(start.getDate() - 180);
    else if (id === 'thisMonth') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else start.setDate(start.getDate() - 30);
    const fmt = (d) =>
      d
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        .replace(/\s/g, ' ')
        .trim();
    const a = fmt(start);
    const b = fmt(end);
    const thead = document.getElementById('journeysThead');
    if (!thead) return;
    thead.querySelectorAll('.journeys-th-range-a').forEach((el) => {
      el.textContent = a;
    });
    thead.querySelectorAll('.journeys-th-range-b').forEach((el) => {
      el.textContent = b;
    });
  }

  /** Highlight rows that account for a large share of any visible metric column total. */
  function rowIsMetricHot(row, sumEnters, sumExits, sumDelivered, sumDisplays, sumClicks) {
    const threshold = 0.17;
    const parts = [];
    const e = entersSortValue(row);
    if (e != null && sumEnters > 0) parts.push(e / sumEnters);
    const x = exitsSortValue(row);
    if (x != null && sumExits > 0) parts.push(x / sumExits);
    const d = cjaFieldSortValue(row, 'cjaDelivered');
    if (d != null && sumDelivered > 0) parts.push(d / sumDelivered);
    const p = cjaFieldSortValue(row, 'cjaDisplays');
    if (p != null && sumDisplays > 0) parts.push(p / sumDisplays);
    const k = cjaFieldSortValue(row, 'cjaClicks');
    if (k != null && sumClicks > 0) parts.push(k / sumClicks);
    if (parts.length === 0) return false;
    return Math.max.apply(null, parts) >= threshold;
  }

  function updateJourneysMetricHeaders(
    sumEnters,
    sumExits,
    sumDelivered,
    sumDisplays,
    sumClicks,
    hasVisibleRows,
  ) {
    const elE = document.getElementById('journeysThTotalEnters');
    const elX = document.getElementById('journeysThTotalExits');
    const elD = document.getElementById('journeysThTotalDelivered');
    const elP = document.getElementById('journeysThTotalDisplays');
    const elK = document.getElementById('journeysThTotalClicks');
    if (!elE || !elX || !elD || !elP || !elK) return;
    if (!hasVisibleRows) {
      elE.textContent = '—';
      elX.textContent = '—';
      elD.textContent = '—';
      elP.textContent = '—';
      elK.textContent = '—';
      return;
    }
    elE.textContent = formatEntryTotal(sumEnters);
    elX.textContent = formatEntryTotal(sumExits);
    elD.textContent = formatEntryTotal(sumDelivered);
    elP.textContent = formatEntryTotal(sumDisplays);
    elK.textContent = formatEntryTotal(sumClicks);
  }

  function statusDisplayLabel(row) {
    return statusClassAndLabel(row.status).label;
  }

  function rowMatchesStatusFilter(row) {
    const sel = statusFilterEl && statusFilterEl.value != null ? String(statusFilterEl.value).trim() : '';
    if (!sel) return true;
    return statusDisplayLabel(row) === sel;
  }

  /** Rebuild Status dropdown from loaded rows; keeps selection when still valid. */
  function populateStatusFilterOptions(rows) {
    if (!statusFilterEl) return;
    const previous = statusFilterEl.value;
    const labels = new Set();
    for (const r of rows || []) {
      const lb = statusDisplayLabel(r);
      if (lb && lb !== '—') labels.add(lb);
    }
    const preferred = ['Live', 'Draft', 'Stopped', 'Finished', 'Closed'];
    const rest = [...labels]
      .filter((x) => !preferred.includes(x))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const ordered = [...preferred.filter((x) => labels.has(x)), ...rest];
    statusFilterEl.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'All statuses';
    statusFilterEl.appendChild(optAll);
    for (const lb of ordered) {
      const o = document.createElement('option');
      o.value = lb;
      o.textContent = lb;
      statusFilterEl.appendChild(o);
    }
    const ok = previous && [...statusFilterEl.options].some((o) => o.value === previous);
    statusFilterEl.value = ok ? previous : '';
  }

  function rowMatchesSearch(row, q) {
    if (!q) return true;
    const hay = [
      row.name,
      row.journeyID,
      row.journeyUid,
      row.journeyVersion,
      row.journeyVersionID,
      row.status,
      ...(row.tags || []),
      row.createdBy,
      row.updatedBy,
      row.publishedBy,
      row.entryTotal != null ? String(row.entryTotal) : '',
      row.cjaJourneyEnters != null ? String(row.cjaJourneyEnters) : '',
      row.cjaMessagesSent != null ? String(row.cjaMessagesSent) : '',
      row.cjaDelivered != null ? String(row.cjaDelivered) : '',
      row.cjaDisplays != null ? String(row.cjaDisplays) : '',
      row.cjaClicks != null ? String(row.cjaClicks) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  function render(rows) {
    if (!tbody) return;
    tbody.innerHTML = '';
    const q = (searchInput?.value || '').trim().toLowerCase();
    let filtered = q ? rows.filter((r) => rowMatchesSearch(r, q)) : rows.slice();
    filtered = filtered.filter((r) => rowMatchesStatusFilter(r));
    const sorted = sortKey ? sortRows(filtered, sortKey, sortDir) : filtered;
    if (countEl) {
      countEl.textContent = `${filtered.length} of ${rows.length}`;
    }
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${visibleJourneyColCount()}" class="journeys-empty">No journeys match your search or status filter, or the list is empty.</td></tr>`;
      updateJourneysMetricHeaders(0, 0, 0, 0, 0, false);
      updateSortIndicators();
      applyJourneyColumnVisibility();
      return;
    }
    let sumEnters = 0;
    let sumExits = 0;
    let sumDelivered = 0;
    let sumDisplays = 0;
    let sumClicks = 0;
    for (const r of sorted) {
      const ev = entersSortValue(r);
      if (ev != null) sumEnters += ev;
      const xv = exitsSortValue(r);
      if (xv != null) sumExits += xv;
      const dv = cjaFieldSortValue(r, 'cjaDelivered');
      if (dv != null) sumDelivered += dv;
      const pv = cjaFieldSortValue(r, 'cjaDisplays');
      if (pv != null) sumDisplays += pv;
      const kv = cjaFieldSortValue(r, 'cjaClicks');
      if (kv != null) sumClicks += kv;
    }
    updateJourneysMetricHeaders(sumEnters, sumExits, sumDelivered, sumDisplays, sumClicks, true);
    for (const row of sorted) {
      const hot = rowIsMetricHot(row, sumEnters, sumExits, sumDelivered, sumDisplays, sumClicks);
      const st = statusClassAndLabel(row.status);
      const name = row.name || row.journeyVersionID || row.journeyID || '—';
      const tags = (row.tags || [])
        .slice(0, 6)
        .map((t) => `<span class="journeys-tag-pill">${escapeHtml(t)}</span>`)
        .join('');
      const tr = document.createElement('tr');
      if (row.journeyID) tr.dataset.journeyId = row.journeyID;
      if (row.journeyVersionID) tr.dataset.journeyVersionId = row.journeyVersionID;
      const verDisp = journeyVersionDisplay(row);
      const verTitle = journeyVersionTitle(row);
      tr.innerHTML = `
        <td data-jcol="check"><input type="checkbox" disabled aria-label="Select row" /></td>
        <td data-jcol="name" class="journeys-col-name">
          <div class="journeys-name-cell">
            <a href="#" class="journeys-name-link" title="${escapeHtmlAttr(name)}">${escapeHtml(name)}</a>
            <span class="journeys-row-actions" title="More actions">⋯</span>
          </div>
        </td>
        <td data-jcol="version" class="journeys-col-version" title="${escapeHtmlAttr(verTitle || verDisp)}">${escapeHtml(verDisp)}</td>
        <td data-jcol="status">
          <span class="journeys-status ${st.cls}">
            <span class="journeys-status-dot" aria-hidden="true"></span>
            <span class="journeys-status-label">${escapeHtml(st.label)}</span>
          </span>
        </td>
        <td data-jcol="tags">${tags || '<span class="journeys-empty" style="padding:0">—</span>'}</td>
        <td data-jcol="enters" class="journeys-col-metric">${formatEntersMetricHtml(row, sumEnters)}</td>
        <td data-jcol="exits" class="journeys-col-metric">${formatExitsMetricHtml(row, sumExits)}</td>
        <td data-jcol="delivered" class="journeys-col-metric">${formatCjaShareMetricHtml(
          row,
          'cjaDelivered',
          sumDelivered,
          'journeys-bar-cell--delivered',
          'CJA Delivered metric when available',
          'CJA Delivered; % is share of listed journeys.',
        )}</td>
        <td data-jcol="displays" class="journeys-col-metric">${formatCjaShareMetricHtml(
          row,
          'cjaDisplays',
          sumDisplays,
          'journeys-bar-cell--displays',
          'CJA adobe_reserved_label.ajo_displays when available',
          'CJA Displays; % is share of listed journeys.',
        )}</td>
        <td data-jcol="clicks" class="journeys-col-metric">${formatCjaShareMetricHtml(
          row,
          'cjaClicks',
          sumClicks,
          'journeys-bar-cell--clicks',
          'CJA adobe_reserved_label.ajo_clicks when available',
          'CJA Clicks; % is share of listed journeys.',
        )}</td>
        <td data-jcol="createdAt">${escapeHtml(formatUsDateTime(row.createdAt))}</td>
        <td data-jcol="createdBy">${escapeHtml(row.createdBy || '—')}</td>
        <td data-jcol="updatedAt">${escapeHtml(formatUsDateTime(row.updatedAt))}</td>
        <td data-jcol="updatedBy">${escapeHtml(row.updatedBy || '—')}</td>
        <td data-jcol="publishedAt">${escapeHtml(formatUsDateOnly(row.publishedAt))}</td>
        <td data-jcol="publishedBy">${escapeHtml(row.publishedBy || '—')}</td>
      `;
      if (hot) tr.classList.add('journeys-tr--metric-hot');
      const link = tr.querySelector('.journeys-name-link');
      if (link) {
        link.addEventListener('click', (e) => e.preventDefault());
      }
      tbody.appendChild(tr);
    }
    updateSortIndicators();
    applyJourneyColumnVisibility();
  }

  async function load(forceRefresh) {
    const sandbox = getSandbox();
    const gen = ++loadGen;
    if (errorEl) errorEl.hidden = true;
    if (!sandbox) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = 'Select a sandbox to load journeys.';
      }
      allRows = [];
      populateStatusFilterOptions([]);
      render([]);
      return;
    }
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = forceRefresh ? 'Refreshing from Adobe…' : 'Loading journeys…';
    }
    try {
      let url = `/api/journeys/browse?sandbox=${encodeURIComponent(sandbox)}&start=0&limit=500`;
      var cjaDv = getSelectedCjaDataViewId();
      if (cjaDv) url += '&cjaDataViewId=' + encodeURIComponent(cjaDv);
      url += '&cjaDateRangeId=' + encodeURIComponent(getSelectedCjaDateRangeId());
      if (forceRefresh) url += '&refresh=1';
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (gen !== loadGen) return;
      if (data.ok === false && data.error) {
        throw new Error(data.error);
      }
      if (!res.ok && !data.journeys) {
        throw new Error(data.error || res.statusText || 'Request failed');
      }
      allRows = Array.isArray(data.journeys) ? data.journeys : [];
      if (statusEl) {
        let line =
          allRows.length === 0
            ? 'No journeys returned. Check API permissions and sandbox.'
            : `Loaded ${allRows.length} journey(s) (${data.source || 'api'})`;
        if (data.fromCache) {
          line += ` · cached ${formatCacheAge(data.cacheAgeMs)}`;
          if (data.cacheTtlMs) {
            line += ` (refreshes every ~${Math.round(data.cacheTtlMs / 3600000)} h)`;
          }
        } else if (forceRefresh) {
          line += ' · live refresh';
        }
        const cja = data.cja;
        const requestedRange = getSelectedCjaDateRangeId();
        const serverRange = cja && cja.dateRangeId ? String(cja.dateRangeId) : '';
        lastCjaDateRangeId = serverRange || requestedRange;
        /** Header strip matches server-reported window (source of truth for numbers). */
        updateJourneyTableHeaderDateRange(lastCjaDateRangeId || requestedRange);
        if (cja && cja.applied) {
          if (serverRange && serverRange !== requestedRange) {
            line += ` · CJA (${serverRange} from API). You chose ${requestedRange} — redeploy Cloud Functions from this repo for custom date windows.`;
          } else {
            line += ` · CJA metrics (${serverRange || requestedRange || 'range'}).`;
          }
          if (cja.messagesSentSkipped) {
            line += ' Second metric and Delivered/Displays/Clicks omitted (CJA returned Journey Enters only).';
          } else if (cja.ajoChannelMetricsSkipped) {
            line += ' Delivered, Displays, and Clicks omitted (CJA limited report to Enters and second metric).';
          }
        } else if (cja && cja.message) {
          line += ` · CJA: ${cja.message}`;
        }
        statusEl.textContent = line;
      }
      populateStatusFilterOptions(allRows);
      render(allRows);
    } catch (e) {
      if (gen !== loadGen) return;
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = e.message || String(e);
      }
      if (statusEl) statusEl.textContent = '';
      allRows = [];
      populateStatusFilterOptions([]);
      render([]);
    }
  }

  function formatCacheAge(ms) {
    if (ms == null || !Number.isFinite(ms)) return '';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    return `${h} h ago`;
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => render(allRows));
  }

  if (statusFilterEl) {
    statusFilterEl.addEventListener('change', () => render(allRows));
  }

  const journeysThead = document.getElementById('journeysThead');
  if (journeysThead) {
    journeysThead.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.journeys-th-sort[data-sort-key]');
      if (!btn || !journeysThead.contains(btn)) return;
      const key = btn.dataset.sortKey;
      if (!key) return;
      if (key === sortKey) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = 'asc';
      }
      render(allRows);
    });
  }

  const JOURNEYS_NAME_WIDTH_KEY = 'journeysNameColWidthPx';
  function applyJourneysNameColumnWidth() {
    const root = document.body?.classList?.contains('journeys-page') ? document.body : document.querySelector('.journeys-page');
    if (!root || !root.style) return;
    const saved = localStorage.getItem(JOURNEYS_NAME_WIDTH_KEY);
    if (saved != null && !Number.isNaN(Number(saved))) {
      const n = Math.max(160, Math.min(960, Number(saved)));
      root.style.setProperty('--journeys-name-col-width', `${n}px`);
    }
  }
  applyJourneysNameColumnWidth();

  function buildJourneysColumnsMenu() {
    const list = document.getElementById('journeysColumnsList');
    if (!list) return;
    list.innerHTML = '';
    for (let i = 0; i < TOGGLE_COLUMN_KEYS.length; i++) {
      const key = TOGGLE_COLUMN_KEYS[i];
      const id = `journeysColCb_${key}`;
      const label = document.createElement('label');
      label.className = 'journeys-columns-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = columnVisibility[key] !== false;
      const span = document.createElement('span');
      span.textContent = COLUMN_LABELS[key] || key;
      label.appendChild(cb);
      label.appendChild(span);
      cb.addEventListener('change', function () {
        columnVisibility[key] = cb.checked;
        saveColumnVisibility();
        applyJourneyColumnVisibility();
        render(allRows);
      });
      list.appendChild(label);
    }
  }

  const journeysColsToggle = document.getElementById('journeysColumnsToggle');
  const journeysColsMenu = document.getElementById('journeysColumnsMenu');
  function setJourneysColumnsMenuOpen(open) {
    if (!journeysColsMenu || !journeysColsToggle) return;
    journeysColsMenu.hidden = !open;
    journeysColsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (journeysColsToggle && journeysColsMenu) {
    journeysColsToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setJourneysColumnsMenuOpen(journeysColsMenu.hidden);
    });
    journeysColsMenu.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    document.addEventListener('click', function () {
      setJourneysColumnsMenuOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && journeysColsMenu && !journeysColsMenu.hidden) setJourneysColumnsMenuOpen(false);
    });
  }
  const journeysColsShowAll = document.getElementById('journeysColumnsShowAll');
  if (journeysColsShowAll) {
    journeysColsShowAll.addEventListener('click', function () {
      for (let j = 0; j < TOGGLE_COLUMN_KEYS.length; j++) {
        columnVisibility[TOGGLE_COLUMN_KEYS[j]] = true;
      }
      saveColumnVisibility();
      buildJourneysColumnsMenu();
      applyJourneyColumnVisibility();
      render(allRows);
      setJourneysColumnsMenuOpen(false);
    });
  }
  buildJourneysColumnsMenu();
  applyJourneyColumnVisibility();

  const nameResizeEl = document.getElementById('journeysNameResize');
  if (nameResizeEl) {
    nameResizeEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const root = document.body?.classList?.contains('journeys-page') ? document.body : document.querySelector('.journeys-page');
      if (!root) return;
      const col = document.querySelector('col.journeys-col-name');
      const startX = e.clientX;
      const startW = col ? col.getBoundingClientRect().width : 280;
      let lastW = Math.round(startW);
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        lastW = Math.round(Math.max(160, Math.min(960, startW + dx)));
        root.style.setProperty('--journeys-name-col-width', `${lastW}px`);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        localStorage.setItem(JOURNEYS_NAME_WIDTH_KEY, String(lastW));
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => load(true));
  }

  if (cjaAnalyticsToggle) {
    cjaAnalyticsToggle.checked = loadCjaAnalyticsEnabled();
    applyCjaAnalyticsUi();
    cjaAnalyticsToggle.addEventListener('change', function () {
      saveCjaAnalyticsEnabled(!!cjaAnalyticsToggle.checked);
      applyCjaAnalyticsUi();
      load();
    });
  }

  if (cjaDataViewSelect) {
    cjaDataViewSelect.addEventListener('change', function () {
      try {
        localStorage.setItem(CJA_DV_STORAGE_KEY, cjaDataViewSelect.value || '');
      } catch (e) {
        /* ignore */
      }
      load();
    });
  }

  if (cjaDateRangeBtns) {
    cjaDateRangeBtns.addEventListener('click', function (e) {
      /** Text nodes inside <button> have no .closest — use parent element (see HTML click target rules). */
      var raw = e.target;
      if (!raw) return;
      var el = raw.nodeType === 1 ? raw : raw.parentElement;
      var btn = el && el.closest && el.closest('.journeys-cja-range-btn[data-cja-range]');
      if (!btn || !cjaDateRangeBtns.contains(btn)) return;
      const rid = btn.getAttribute('data-cja-range');
      if (!rid || CJA_DATE_RANGE_IDS.indexOf(rid) === -1) return;
      saveCjaDateRangeId(rid);
      syncCjaRangeButtons();
      updateJourneyTableHeaderDateRange(rid);
      /** Bypass Firestore journey cache so browse hits live path with the new cjaDateRangeId. */
      load(true);
    });
  }

  window.addEventListener('aep-global-sandbox-change', () => load());

  async function initSandboxAndLoad() {
    /** Load CJA data views in parallel with sandboxes — do not block the picker on sandbox API latency. */
    const cjaDataViewsPromise = populateCjaDataViewDropdown();
    if (window.AepGlobalSandbox && sandboxSelect) {
      await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
    }
    syncCjaRangeButtons();
    await cjaDataViewsPromise;
    updateJourneyTableHeaderDateRange(getSelectedCjaDateRangeId());
    load();
  }

  initSandboxAndLoad();
})();
