/**
 * Journeys browse — client logic for the AJO Journeys table.
 */
(function () {
  'use strict';

  var allJourneys = [];
  var sortCol = 'updatedAt';
  var sortDir = 'desc';

  /* ── DOM refs ── */
  var sandboxSelect = document.getElementById('sandboxSelect');
  var searchInput   = document.getElementById('jrnSearch');
  var statusFilter  = document.getElementById('jrnStatusFilter');
  var refreshBtn    = document.getElementById('jrnRefresh');
  var statusDiv     = document.getElementById('jrnStatus');
  var tableBody     = document.getElementById('jrnBody');
  var footerDiv     = document.getElementById('jrnFooter');
  var tableEl       = document.getElementById('jrnTable');

  /* ── Helpers ── */

  function getSandbox() {
    if (window.AepGlobalSandbox) return window.AepGlobalSandbox.getSandboxName() || '';
    return (sandboxSelect && sandboxSelect.value) || '';
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(iso); }
  }

  function fmtNumber(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString();
  }

  function normalizeStatus(s) {
    if (!s) return 'unknown';
    var low = String(s).toLowerCase().trim();
    if (low === 'live' || low === 'running' || low === 'active' || low === 'deployed' || low === 'redeployed') return 'live';
    if (low === 'draft' || low === 'authoring' || low === 'created') return 'draft';
    if (low === 'stopped' || low === 'paused') return 'stopped';
    if (low === 'closed' || low === 'archived') return 'closed';
    if (low === 'finished' || low === 'completed') return 'finished';
    if (low === 'updated') return 'live';
    return low;
  }

  function statusLabel(raw) {
    var n = normalizeStatus(raw);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  function statusClass(raw) {
    return 'jrn-status-' + normalizeStatus(raw);
  }

  function showStatus(msg, cls) {
    statusDiv.className = 'jrn-status' + (cls ? ' jrn-status--' + cls : '');
    statusDiv.textContent = msg;
  }

  /* ── Fetch ── */

  function fetchJourneys() {
    var sandbox = getSandbox();
    if (!sandbox) {
      showStatus('Select a sandbox to load journeys.', 'info');
      return;
    }
    showStatus('Loading journeys…', 'loading');
    tableBody.innerHTML = '';
    footerDiv.textContent = '';

    var url = '/api/journeys/browse?sandbox=' + encodeURIComponent(sandbox) + '&limit=500';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok && data.error) {
          showStatus('Error: ' + data.error, 'error');
          allJourneys = [];
          render();
          return;
        }
        allJourneys = Array.isArray(data.journeys) ? data.journeys : [];
        showStatus(allJourneys.length + ' journey' + (allJourneys.length !== 1 ? 's' : '') + ' loaded (' + (data.source || 'api') + ')', 'ok');
        render();
      })
      .catch(function (err) {
        showStatus('Fetch failed: ' + err.message, 'error');
        allJourneys = [];
        render();
      });
  }

  /* ── Render ── */

  function getFiltered() {
    var q = (searchInput.value || '').trim().toLowerCase();
    var sf = (statusFilter.value || '').toLowerCase();
    return allJourneys.filter(function (j) {
      if (sf && normalizeStatus(j.status) !== sf) return false;
      if (q) {
        var hay = [j.name, j.status, j.createdBy, j.updatedBy, j.publishedBy]
          .concat(j.tags || [])
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function compareRows(a, b) {
    var va = a[sortCol];
    var vb = b[sortCol];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (sortCol === 'entryTotal' || sortCol === 'version') {
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    if (sortCol === 'createdAt' || sortCol === 'updatedAt' || sortCol === 'publishedAt') {
      var da = new Date(va).getTime() || 0;
      var db = new Date(vb).getTime() || 0;
      return sortDir === 'asc' ? da - db : db - da;
    }
    var sa = String(va).toLowerCase();
    var sb = String(vb).toLowerCase();
    var cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  }

  function render() {
    var rows = getFiltered();
    rows.sort(compareRows);
    footerDiv.textContent = 'Showing ' + rows.length + ' of ' + allJourneys.length;

    if (rows.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="11" class="jrn-empty">No journeys found.</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var j = rows[i];
      var ns = normalizeStatus(j.status);
      var tagHtml = '';
      if (j.tags && j.tags.length) {
        for (var t = 0; t < j.tags.length; t++) {
          tagHtml += '<span class="jrn-tag">' + esc(j.tags[t]) + '</span>';
        }
      }
      html += '<tr>' +
        '<td class="jrn-name-cell">' + esc(j.name || '(untitled)') + '</td>' +
        '<td class="jrn-num">' + (j.version != null ? j.version.toFixed(1) : '—') + '</td>' +
        '<td><span class="jrn-status-dot ' + statusClass(j.status) + '"></span> ' + esc(statusLabel(j.status)) + '</td>' +
        '<td class="jrn-tags-cell">' + tagHtml + '</td>' +
        '<td class="jrn-num">' + fmtNumber(j.entryTotal) + '</td>' +
        '<td>' + fmtDate(j.createdAt) + '</td>' +
        '<td>' + esc(j.createdBy || '—') + '</td>' +
        '<td>' + fmtDate(j.updatedAt) + '</td>' +
        '<td>' + esc(j.updatedBy || '—') + '</td>' +
        '<td>' + fmtDate(j.publishedAt) + '</td>' +
        '<td>' + esc(j.publishedBy || '—') + '</td>' +
        '</tr>';
    }
    tableBody.innerHTML = html;
  }

  /* ── Sort ── */

  function onHeaderClick(e) {
    var th = e.target.closest('th[data-col]');
    if (!th || !th.classList.contains('jrn-sortable')) return;
    var col = th.getAttribute('data-col');
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = col === 'name' || col === 'status' || col === 'createdBy' || col === 'updatedBy' || col === 'publishedBy' ? 'asc' : 'desc';
    }
    updateSortIndicators();
    render();
  }

  function updateSortIndicators() {
    var ths = tableEl.querySelectorAll('th[data-col]');
    for (var i = 0; i < ths.length; i++) {
      ths[i].classList.remove('jrn-sort-asc', 'jrn-sort-desc');
      if (ths[i].getAttribute('data-col') === sortCol) {
        ths[i].classList.add(sortDir === 'asc' ? 'jrn-sort-asc' : 'jrn-sort-desc');
      }
    }
  }

  /* ── Events ── */

  tableEl.querySelector('thead').addEventListener('click', onHeaderClick);

  searchInput.addEventListener('input', function () { render(); });
  statusFilter.addEventListener('change', function () { render(); });
  refreshBtn.addEventListener('click', function () { fetchJourneys(); });

  window.addEventListener('aep-global-sandbox-change', function () {
    fetchJourneys();
  });

  /* ── Init ── */

  async function initSandboxAndLoad() {
    if (window.AepGlobalSandbox && sandboxSelect) {
      await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
    }
    fetchJourneys();
  }

  initSandboxAndLoad();
})();
