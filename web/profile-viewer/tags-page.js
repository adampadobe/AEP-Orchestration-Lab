/**
 * Data Collection — Tags (Reactor): list companies and Tag properties via /api/tags/reactor.
 */
(function () {
  'use strict';

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
    n.textContent = text || '';
    n.className = 'tags-msg dashboard-hero-subtitle' + (kind === 'err' ? ' tags-msg--err' : kind === 'ok' ? ' tags-msg--ok' : '');
  }

  function setPropertiesHeadMode(mode) {
    var thead = el('tagsPropertiesHeadRow');
    if (!thead) return;
    if (mode === 'all') {
      thead.innerHTML =
        '<th scope="col">Company ID</th><th scope="col">Company</th><th scope="col">Property ID</th><th scope="col">Name</th>';
    } else {
      thead.innerHTML = '<th scope="col">Property ID</th><th scope="col">Name</th>';
    }
  }

  function clearTables() {
    var tb = el('tagsCompaniesBody');
    var tb2 = el('tagsPropertiesBody');
    if (tb) tb.innerHTML = '';
    if (tb2) tb2.innerHTML = '';
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
    setPropertiesHeadMode('one');
    setMsg('Loading properties…', '');
    el('tagsPropertiesBody').innerHTML = '';
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
      var tbody = el('tagsPropertiesBody');
      items.forEach(function (p) {
        var tr = document.createElement('tr');
        var id = p.id || '';
        var name = (p.attributes && p.attributes.name) || '—';
        tr.innerHTML =
          '<td><code>' +
          escapeHtml(id) +
          '</code></td><td>' +
          escapeHtml(String(name)) +
          '</td>';
        tbody.appendChild(tr);
      });
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
      var tbody = el('tagsPropertiesBody');
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><code>' +
          escapeHtml(r.companyId || '') +
          '</code></td><td>' +
          escapeHtml(String(r.companyName || '')) +
          '</td><td><code>' +
          escapeHtml(r.propertyId || '') +
          '</code></td><td>' +
          escapeHtml(String(r.propertyName || '')) +
          '</td>';
        tbody.appendChild(tr);
      });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
