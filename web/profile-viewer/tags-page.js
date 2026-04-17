/**
 * Data Collection — Tags (Reactor): list companies and Tag properties via /api/tags/reactor.
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

  function tagsApiUrl(resource, companyId) {
    var p = new URLSearchParams();
    if (window.AepGlobalSandbox && AepGlobalSandbox.getSandboxName) {
      var sb = String(AepGlobalSandbox.getSandboxName() || '').trim();
      if (sb) p.set('sandbox', sb);
    }
    p.set('resource', resource);
    if (companyId) p.set('companyId', companyId);
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
    var total = tagsPropertyCache.length;
    var rows = tagsPropertyCache.filter(function (r) {
      return rowMatchesFilter(r, q);
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
    return tr;
  }

  function resetPropertyFilterUi() {
    var f = el('tagsPropertiesFilter');
    if (f) f.value = '';
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
  }

  async function loadCompanies() {
    setMsg('Loading companies…', '');
    clearTables();
    el('tagsLoadCompaniesBtn').disabled = true;
    try {
      var res = await fetch(tagsApiUrl('companies'));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        return;
      }
      var items = data.items || [];
      var sel = el('tagsCompanySelect');
      if (sel) {
        sel.innerHTML = '<option value="">— Select a company —</option>';
        items.forEach(function (c) {
          var id = c.id || '';
          var name = (c.attributes && (c.attributes.name || c.attributes.title)) || id;
          var opt = document.createElement('option');
          opt.value = id;
          opt.textContent = name + ' (' + id + ')';
          sel.appendChild(opt);
        });
      }
      var tbody = el('tagsCompaniesBody');
      if (tbody) {
        items.forEach(function (c) {
          var tr = document.createElement('tr');
          var id = c.id || '';
          var name = (c.attributes && (c.attributes.name || c.attributes.title)) || '—';
          tr.innerHTML =
            '<td><code>' +
            escapeHtml(id) +
            '</code></td><td>' +
            escapeHtml(String(name)) +
            '</td>';
          tbody.appendChild(tr);
        });
      }
      setMsg('Loaded ' + items.length + ' compan' + (items.length === 1 ? 'y' : 'ies') + (data.pagesFetched ? ' · pages: ' + data.pagesFetched : '') + '.', 'ok');
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
    } finally {
      el('tagsLoadCompaniesBtn').disabled = false;
    }
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
      renderPropertiesFromCache();
      setMsg('Loaded ' + items.length + ' propert' + (items.length === 1 ? 'y' : 'ies') + ' for company ' + cid + '.', 'ok');
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
    } finally {
      el('tagsLoadPropertiesBtn').disabled = false;
    }
  }

  async function loadAllProperties() {
    if (!window.confirm('This may take a while: it loads every Tag property for each company in your org. Continue?')) return;
    setPropertiesHeadMode('all');
    setMsg('Loading all properties (all companies)…', '');
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
