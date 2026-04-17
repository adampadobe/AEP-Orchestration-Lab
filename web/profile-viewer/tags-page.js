/**
 * Data Collection — Tags (Reactor): companies, properties, and property data elements via /api/tags/reactor.
 */
(function () {
  'use strict';

  /** @type {Array<Record<string, unknown>>} */
  var tagsPropertyCache = [];
  /** @type {'one'|'all'} */
  var tagsPropertyViewMode = 'one';

  function el(id) {
    return document.getElementById(id);
  }

  function tagsApiUrl(resource, companyId, propertyId) {
    var p = new URLSearchParams();
    if (window.AepGlobalSandbox && AepGlobalSandbox.getSandboxName) {
      var sb = String(AepGlobalSandbox.getSandboxName() || '').trim();
      if (sb) p.set('sandbox', sb);
    }
    p.set('resource', resource);
    if (companyId) p.set('companyId', companyId);
    if (propertyId) p.set('propertyId', propertyId);
    return '/api/tags/reactor?' + p.toString();
  }

  function setMsg(text, kind) {
    var n = el('tagsMsg');
    if (!n) return;
    var t = text || '';
    n.textContent = t;
    n.hidden = !t;
    var extra = '';
    if (kind === 'err' || kind === 'error') extra = ' error';
    else if (kind === 'ok' || kind === 'success') extra = ' success';
    n.className = 'consent-message consent-message--below-btn' + extra;
  }

  var UPDATED_BY_KEYS = [
    'updated_by_email',
    'updated_by_name',
    'updated_by_username',
    'last_updated_by_email',
    'last_updated_by_name',
    'revised_by_user_email',
    'revised_by_email',
  ];

  function pickUpdatedByFromAttrs(a) {
    if (!a || typeof a !== 'object') return '';
    for (var i = 0; i < UPDATED_BY_KEYS.length; i++) {
      var v = a[UPDATED_BY_KEYS[i]];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  /**
   * @param {object} p - JSON:API property resource
   * @param {{ companyId?: string, companyName?: string }} ctx
   */
  function normalizePropertyResource(p, ctx) {
    ctx = ctx || {};
    var a = (p && p.attributes && typeof p.attributes === 'object') ? p.attributes : {};
    var domains = Array.isArray(a.domains) ? a.domains : [];
    return {
      companyId: ctx.companyId != null ? String(ctx.companyId) : '',
      companyName: ctx.companyName != null ? String(ctx.companyName) : '',
      propertyId: (p && p.id) ? String(p.id) : '',
      propertyName: a.name != null ? String(a.name) : ((p && p.id) ? String(p.id) : ''),
      platform: a.platform != null ? String(a.platform) : '',
      development: a.development === true,
      domains: domains,
      domainsDisplay: domains.join(', '),
      createdAt: a.created_at != null ? String(a.created_at) : '',
      updatedAt: a.updated_at != null ? String(a.updated_at) : '',
      updatedBy: pickUpdatedByFromAttrs(a),
    };
  }

  function formatDateTime(iso) {
    if (!iso || typeof iso !== 'string') return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return escapeHtml(iso);
    return escapeHtml(d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }));
  }

  function setPropertiesHeadMode(mode) {
    tagsPropertyViewMode = mode === 'all' ? 'all' : 'one';
    var thead = el('tagsPropertiesHeadRow');
    if (!thead) return;
    if (mode === 'all') {
      thead.innerHTML =
        '<th scope="col">Company ID</th>' +
        '<th scope="col">Company</th>' +
        '<th scope="col">Property ID</th>' +
        '<th scope="col">Name</th>' +
        '<th scope="col">Platform</th>' +
        '<th scope="col">Dev</th>' +
        '<th scope="col">Domains</th>' +
        '<th scope="col">Created</th>' +
        '<th scope="col">Updated</th>' +
        '<th scope="col">Last updated by</th>';
    } else {
      thead.innerHTML =
        '<th scope="col">Property ID</th>' +
        '<th scope="col">Name</th>' +
        '<th scope="col">Platform</th>' +
        '<th scope="col">Dev</th>' +
        '<th scope="col">Domains</th>' +
        '<th scope="col">Created</th>' +
        '<th scope="col">Updated</th>' +
        '<th scope="col">Last updated by</th>';
    }
  }

  function rowMatchesPlatform(row, platformSel) {
    if (!platformSel) return true;
    var p = row.platform != null ? String(row.platform).trim() : '';
    if (platformSel === '__none__') return !p;
    return p === platformSel;
  }

  function rowMatchesFilter(row, q) {
    if (!q) return true;
    var dev = row.development ? 'yes development' : 'no production';
    var hay = [
      row.companyId,
      row.companyName,
      row.propertyId,
      row.propertyName,
      row.platform,
      dev,
      row.domainsDisplay,
      row.createdAt,
      row.updatedAt,
      row.updatedBy,
    ]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function rebuildPlatformDropdown() {
    var sel = el('tagsPropertiesPlatformFilter');
    if (!sel) return;
    var prev = sel.value;
    var hasEmpty = false;
    var distinct = {};
    tagsPropertyCache.forEach(function (r) {
      var p = r.platform != null ? String(r.platform).trim() : '';
      if (!p) hasEmpty = true;
      else distinct[p] = true;
    });
    var keys = Object.keys(distinct).sort(function (a, b) {
      return a.localeCompare(b);
    });
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = 'All platforms';
    sel.appendChild(o0);
    if (hasEmpty) {
      var on = document.createElement('option');
      on.value = '__none__';
      on.textContent = '(not set)';
      sel.appendChild(on);
    }
    keys.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
    if (prev === '__none__' && hasEmpty) sel.value = prev;
    else if (prev && distinct[prev]) sel.value = prev;
    else sel.value = '';
  }

  function updateFilterCount(shown, total) {
    var n = el('tagsPropertiesFilterCount');
    if (!n) return;
    if (!total) {
      n.textContent = '';
      return;
    }
    n.textContent = shown === total ? String(total) + ' shown' : String(shown) + ' of ' + String(total) + ' shown';
  }

  function renderPropertiesFromCache() {
    var tbody = el('tagsPropertiesBody');
    if (!tbody) return;
    var q = (el('tagsPropertiesFilter') && el('tagsPropertiesFilter').value || '').trim().toLowerCase();
    var platformSel = (el('tagsPropertiesPlatformFilter') && el('tagsPropertiesPlatformFilter').value) || '';
    var total = tagsPropertyCache.length;
    var rows = tagsPropertyCache.filter(function (r) {
      return rowMatchesPlatform(r, platformSel) && rowMatchesFilter(r, q);
    });
    tbody.innerHTML = '';
    rows.forEach(function (row) {
      tbody.appendChild(buildPropertyRowTr(row));
    });
    updateFilterCount(rows.length, total);
  }

  function buildPropertyRowTr(row) {
    var tr = document.createElement('tr');
    var domText = row.domainsDisplay || '';
    var domCell =
      '<td class="tags-cell-domains" title="' +
      escapeHtml(domText) +
      '">' +
      escapeHtml(domText.length > 80 ? domText.slice(0, 77) + '…' : domText || '—') +
      '</td>';
    var devCell = '<td>' + escapeHtml(row.development ? 'Yes' : 'No') + '</td>';
    var platCell = '<td>' + escapeHtml(row.platform || '—') + '</td>';
    var ub = row.updatedBy ? escapeHtml(row.updatedBy) : '—';

    if (tagsPropertyViewMode === 'all') {
      tr.innerHTML =
        '<td><code>' +
        escapeHtml(row.companyId || '') +
        '</code></td><td>' +
        escapeHtml(row.companyName || '') +
        '</td><td><code>' +
        escapeHtml(row.propertyId || '') +
        '</code></td><td>' +
        escapeHtml(row.propertyName || '') +
        '</td>' +
        platCell +
        devCell +
        domCell +
        '<td>' +
        formatDateTime(row.createdAt) +
        '</td><td>' +
        formatDateTime(row.updatedAt) +
        '</td><td>' +
        ub +
        '</td>';
    } else {
      tr.innerHTML =
        '<td><code>' +
        escapeHtml(row.propertyId || '') +
        '</code></td><td>' +
        escapeHtml(row.propertyName || '') +
        '</td>' +
        platCell +
        devCell +
        domCell +
        '<td>' +
        formatDateTime(row.createdAt) +
        '</td><td>' +
        formatDateTime(row.updatedAt) +
        '</td><td>' +
        ub +
        '</td>';
    }
    tr.classList.add('tags-property-row');
    tr.title = 'Double-click to view data elements';
    tr.dataset.propertyId = row.propertyId || '';
    tr.dataset.propertyName = row.propertyName || '';
    tr.dataset.companyId = row.companyId || '';
    tr.dataset.companyName = row.companyName || '';
    return tr;
  }

  function hideDataElementsPanel() {
    var panel = el('tagsDataElementsPanel');
    var msg = el('tagsDataElementsMsg');
    var tbody = el('tagsDataElementsBody');
    var ctx = el('tagsDataElementsContext');
    if (panel) panel.hidden = true;
    if (msg) {
      msg.textContent = '';
      msg.hidden = true;
    }
    if (tbody) tbody.innerHTML = '';
    if (ctx) ctx.textContent = '';
  }

  function truncateText(s, max) {
    var t = s == null ? '' : String(s);
    var n = max > 0 ? max : 80;
    if (t.length <= n) return t;
    return t.slice(0, n - 1) + '…';
  }

  async function loadDataElementsForProperty(ctx) {
    ctx = ctx || {};
    var propertyId = ctx.propertyId ? String(ctx.propertyId).trim() : '';
    var panel = el('tagsDataElementsPanel');
    var tbody = el('tagsDataElementsBody');
    var ctxEl = el('tagsDataElementsContext');
    var msg = el('tagsDataElementsMsg');
    if (!propertyId || !panel || !tbody) return;

    panel.hidden = false;
    if (ctxEl) {
      var parts = [];
      if (ctx.companyName) parts.push(String(ctx.companyName));
      parts.push(ctx.propertyName ? String(ctx.propertyName) : propertyId);
      parts.push('(' + propertyId + ')');
      ctxEl.textContent = parts.join(' · ');
    }
    tbody.innerHTML = '';
    if (msg) {
      msg.textContent = 'Loading data elements…';
      msg.hidden = false;
      msg.className = 'consent-message consent-message--below-btn';
    }

    try {
      var res = await fetch(tagsApiUrl('dataElements', '', propertyId));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        if (msg) {
          msg.textContent = data.error || data.detail || 'Request failed.';
          msg.hidden = false;
          msg.className = 'consent-message consent-message--below-btn error';
        }
        return;
      }
      var items = data.items || [];
      if (msg) {
        msg.textContent =
          String(items.length) +
          ' data element' +
          (items.length === 1 ? '' : 's') +
          (data.pagesFetched ? ' · pages fetched: ' + String(data.pagesFetched) : '') +
          '.';
        msg.hidden = false;
        msg.className = 'consent-message consent-message--below-btn success';
      }
      items.forEach(function (row) {
        var tr = document.createElement('tr');
        var settingsPrev = row.settingsPreview || '';
        var settingsShow = truncateText(settingsPrev, 72);
        var extCell = row.extensionId
          ? '<code>' + escapeHtml(row.extensionId) + '</code>'
          : '—';
        tr.innerHTML =
          '<td>' +
          escapeHtml(row.name || '—') +
          '</td><td><code>' +
          escapeHtml(row.elementId || '') +
          '</code></td><td>' +
          extCell +
          '</td><td class="tags-cell-settings" title="' +
          escapeHtml(settingsPrev) +
          '">' +
          escapeHtml(settingsShow || '—') +
          '</td><td class="tags-cell-delegate">' +
          escapeHtml(truncateText(row.delegateDescriptorId || '', 48)) +
          '</td><td>' +
          escapeHtml(row.enabled ? 'Yes' : 'No') +
          '</td><td>' +
          escapeHtml(row.dirty ? 'Yes' : 'No') +
          '</td><td>' +
          formatDateTime(row.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      });
      try {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (eScroll) {
        panel.scrollIntoView();
      }
    } catch (e) {
      if (msg) {
        msg.textContent = e.message || 'Network error';
        msg.hidden = false;
        msg.className = 'consent-message consent-message--below-btn error';
      }
    }
  }

  function resetPropertyFilterUi() {
    var f = el('tagsPropertiesFilter');
    if (f) f.value = '';
    var plat = el('tagsPropertiesPlatformFilter');
    if (plat) {
      plat.innerHTML = '';
      var o = document.createElement('option');
      o.value = '';
      o.textContent = 'All platforms';
      plat.appendChild(o);
      plat.value = '';
    }
    updateFilterCount(0, 0);
  }

  function clearTables() {
    var tb = el('tagsCompaniesBody');
    var tb2 = el('tagsPropertiesBody');
    if (tb) tb.innerHTML = '';
    if (tb2) tb.innerHTML = '';
    tagsPropertyCache = [];
    resetPropertyFilterUi();
    setPropertiesHeadMode('one');
    hideDataElementsPanel();
  }

  function companyDisplayName(c) {
    if (!c) return '';
    var id = c.id || '';
    return (c.attributes && (c.attributes.name || c.attributes.title)) || id;
  }

  /**
   * @returns {Array<object>} items
   */
  function ingestCompaniesResponse(data) {
    var items = data && Array.isArray(data.items) ? data.items : [];
    var sel = el('tagsCompanySelect');
    if (sel) {
      sel.innerHTML = '<option value="">— Select a company —</option>';
      items.forEach(function (c) {
        var id = c.id || '';
        var name = companyDisplayName(c);
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name + ' (' + id + ')';
        sel.appendChild(opt);
      });
      if (items.length === 1 && items[0] && items[0].id) {
        sel.value = String(items[0].id);
      }
    }
    var tbody = el('tagsCompaniesBody');
    if (tbody) {
      tbody.innerHTML = '';
      items.forEach(function (c) {
        var tr = document.createElement('tr');
        var id = c.id || '';
        var name = companyDisplayName(c) || '—';
        tr.innerHTML =
          '<td><code>' +
          escapeHtml(id) +
          '</code></td><td>' +
          escapeHtml(String(name)) +
          '</td>';
        tbody.appendChild(tr);
      });
    }
    return items;
  }

  /**
   * @param {number} n - company count
   * @param {Array<object>} items - raw JSON:API company resources
   */
  function setTagsCompanyUiMode(n, items) {
    items = items || [];
    var multi = el('tagsMultiCompanyControls');
    var singleNote = el('tagsSingleCompanyNote');
    var companiesPanel = el('tagsCompaniesPanel');
    var loadPropsBtn = el('tagsLoadPropertiesBtn');
    var loadAllBtn = el('tagsLoadAllBtn');
    if (n === 1) {
      if (multi) multi.hidden = true;
      if (companiesPanel) companiesPanel.hidden = true;
      if (loadPropsBtn) loadPropsBtn.hidden = true;
      if (singleNote) {
        var c0 = items[0];
        var nid = c0 && c0.id ? String(c0.id) : '';
        var nname = companyDisplayName(c0);
        singleNote.innerHTML =
          'Using company <strong>' +
          escapeHtml(nname) +
          '</strong> — <code>' +
          escapeHtml(nid) +
          '</code>. Use <strong>Load all properties</strong> below.';
        singleNote.hidden = false;
      }
      if (loadAllBtn) {
        loadAllBtn.classList.remove('btn-secondary');
        loadAllBtn.classList.add('btn-primary');
      }
    } else {
      if (multi) multi.hidden = false;
      if (companiesPanel) companiesPanel.hidden = false;
      if (loadPropsBtn) loadPropsBtn.hidden = false;
      if (singleNote) {
        singleNote.hidden = true;
        singleNote.textContent = '';
      }
      if (loadAllBtn) {
        loadAllBtn.classList.add('btn-secondary');
        loadAllBtn.classList.remove('btn-primary');
      }
    }
  }

  var tagsCompaniesFetchInFlight = false;

  async function fetchAndApplyTagsCompanies(opts) {
    opts = opts || {};
    if (tagsCompaniesFetchInFlight) return;
    tagsCompaniesFetchInFlight = true;
    setMsg(opts.loadingMsg || 'Loading companies…', '');
    clearTables();
    var refreshBtn = el('tagsLoadCompaniesBtn');
    var loadAllBtn = el('tagsLoadAllBtn');
    if (refreshBtn) refreshBtn.disabled = true;
    if (loadAllBtn) loadAllBtn.disabled = true;
    try {
      var res = await fetch(tagsApiUrl('companies'));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        ingestCompaniesResponse({ items: [] });
        setTagsCompanyUiMode(0, []);
        return;
      }
      var items = ingestCompaniesResponse(data);
      setTagsCompanyUiMode(items.length, items);
      var suffix = data.pagesFetched ? ' · pages: ' + data.pagesFetched : '';
      setMsg(
        (opts.doneVerb || 'Loaded') +
          ' ' +
          items.length +
          ' compan' +
          (items.length === 1 ? 'y' : 'ies') +
          suffix +
          '.',
        'ok'
      );
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
      ingestCompaniesResponse({ items: [] });
      setTagsCompanyUiMode(0, []);
    } finally {
      tagsCompaniesFetchInFlight = false;
      if (refreshBtn) refreshBtn.disabled = false;
      if (loadAllBtn) loadAllBtn.disabled = false;
    }
  }

  function loadCompaniesManualRefresh() {
    fetchAndApplyTagsCompanies({ loadingMsg: 'Refreshing companies…', doneVerb: 'Refreshed' });
  }

  function bootstrapTagsCompanies() {
    fetchAndApplyTagsCompanies({ loadingMsg: 'Loading companies…', doneVerb: 'Loaded' });
  }

  async function loadCompanies() {
    loadCompaniesManualRefresh();
  }

  async function loadPropertiesForSelected() {
    var sel = el('tagsCompanySelect');
    var cid = sel && sel.value ? String(sel.value).trim() : '';
    if (!cid) {
      setMsg('Select a company first (load companies, then pick from the list).', 'err');
      return;
    }
    var opt = sel && sel.options[sel.selectedIndex];
    var cname = '';
    if (opt && opt.textContent) {
      var raw = String(opt.textContent);
      var idx = raw.lastIndexOf(' (');
      cname = idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
    }
    setPropertiesHeadMode('one');
    setMsg('Loading properties…', '');
    hideDataElementsPanel();
    el('tagsPropertiesBody').innerHTML = '';
    tagsPropertyCache = [];
    resetPropertyFilterUi();
    el('tagsLoadPropertiesBtn').disabled = true;
    try {
      var res = await fetch(tagsApiUrl('properties', cid));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        return;
      }
      var items = data.items || [];
      items.forEach(function (p) {
        tagsPropertyCache.push(
          normalizePropertyResource(p, { companyId: cid, companyName: cname })
        );
      });
      rebuildPlatformDropdown();
      renderPropertiesFromCache();
      setMsg('Loaded ' + items.length + ' propert' + (items.length === 1 ? 'y' : 'ies') + ' for company ' + cid + '.', 'ok');
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
    } finally {
      el('tagsLoadPropertiesBtn').disabled = false;
    }
  }

  async function loadAllProperties() {
    var singleCompanyUi = el('tagsMultiCompanyControls') && el('tagsMultiCompanyControls').hidden;
    var confirmMsg = singleCompanyUi
      ? 'Load all Tag properties for this company? This may take a little while.'
      : 'This may take a while: it loads every Tag property for each company in your org. Continue?';
    if (!window.confirm(confirmMsg)) return;
    setPropertiesHeadMode('all');
    setMsg(singleCompanyUi ? 'Loading all properties…' : 'Loading all properties (all companies)…', '');
    hideDataElementsPanel();
    el('tagsCompaniesBody').innerHTML = '';
    el('tagsPropertiesBody').innerHTML = '';
    tagsPropertyCache = [];
    resetPropertyFilterUi();
    el('tagsLoadAllBtn').disabled = true;
    try {
      var res = await fetch(tagsApiUrl('allProperties'));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        return;
      }
      var rows = data.rows || [];
      rows.forEach(function (r) {
        var domains = Array.isArray(r.domains) ? r.domains : [];
        tagsPropertyCache.push({
          companyId: r.companyId != null ? String(r.companyId) : '',
          companyName: r.companyName != null ? String(r.companyName) : '',
          propertyId: r.propertyId != null ? String(r.propertyId) : '',
          propertyName: r.propertyName != null ? String(r.propertyName) : '',
          platform: r.platform != null ? String(r.platform) : '',
          development: r.development === true,
          domains: domains,
          domainsDisplay: domains.join(', '),
          createdAt: r.createdAt != null ? String(r.createdAt) : '',
          updatedAt: r.updatedAt != null ? String(r.updatedAt) : '',
          updatedBy: r.updatedBy != null ? String(r.updatedBy) : '',
        });
      });
      rebuildPlatformDropdown();
      renderPropertiesFromCache();
      var failNote = '';
      if (data.failures && data.failures.length) {
        failNote = ' · ' + data.failures.length + ' company fetch(es) failed (see server response).';
      }
      setMsg(
        'Loaded ' + rows.length + ' properties across ' + (data.companiesCount || 0) + ' companies.' + failNote,
        'ok'
      );
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
    } finally {
      el('tagsLoadAllBtn').disabled = false;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init() {
    var sb = el('sandboxSelect');
    if (sb && window.AepGlobalSandbox && AepGlobalSandbox.loadSandboxesIntoSelect) {
      window.AepGlobalSandbox.loadSandboxesIntoSelect(sb).then(function () {
        if (window.AepGlobalSandbox.onSandboxSelectChange) window.AepGlobalSandbox.onSandboxSelectChange(sb);
        bootstrapTagsCompanies();
      });
    } else {
      bootstrapTagsCompanies();
    }

    if (sb) {
      sb.addEventListener('change', function () {
        bootstrapTagsCompanies();
      });
    }

    if (el('tagsLoadCompaniesBtn')) el('tagsLoadCompaniesBtn').addEventListener('click', loadCompanies);
    if (el('tagsLoadPropertiesBtn')) el('tagsLoadPropertiesBtn').addEventListener('click', loadPropertiesForSelected);
    if (el('tagsLoadAllBtn')) el('tagsLoadAllBtn').addEventListener('click', loadAllProperties);

    var filt = el('tagsPropertiesFilter');
    if (filt) {
      filt.addEventListener('input', function () {
        renderPropertiesFromCache();
      });
    }
    var platF = el('tagsPropertiesPlatformFilter');
    if (platF) {
      platF.addEventListener('change', function () {
        renderPropertiesFromCache();
      });
    }

    var propBody = el('tagsPropertiesBody');
    if (propBody) {
      propBody.addEventListener('dblclick', function (e) {
        var tr = e.target && e.target.closest ? e.target.closest('tr.tags-property-row') : null;
        if (!tr || !propBody.contains(tr)) return;
        var pid = tr.dataset.propertyId;
        if (!pid) return;
        loadDataElementsForProperty({
          propertyId: pid,
          propertyName: tr.dataset.propertyName || '',
          companyId: tr.dataset.companyId || '',
          companyName: tr.dataset.companyName || '',
        });
      });
    }

    if (el('tagsDataElementsClose')) {
      el('tagsDataElementsClose').addEventListener('click', hideDataElementsPanel);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
