(function () {
  'use strict';

  var AEP_AUDIT_PATH = '/data/foundation/audit/events';
  var PROXY_URL = '/api/aep';

  var CHART_PALETTE = [
    '#1473e6', '#e68619', '#12805c', '#c9252d', '#7c4dff',
    '#0d66d0', '#d7373f', '#2d9d78', '#e8a735', '#5c6bc0',
    '#00838f', '#ad1457', '#558b2f', '#ef6c00', '#6a1b9a',
  ];

  var allEvents = [];
  var perPage = 50;
  var page = 1;
  var resourceChartInst = null;
  var actionChartInst = null;

  var dom = {};

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    dom.fetchBtn       = $('fetchBtn');
    dom.actionFilter   = $('actionFilter');
    dom.startTime      = $('startTime');
    dom.endTime        = $('endTime');
    dom.limitSlider    = $('limitSlider');
    dom.limitValue     = $('limitValue');
    dom.eventsPerPage  = $('eventsPerPage');
    dom.apiStatus      = $('apiStatus');
    dom.lastFetch      = $('lastFetch');
    dom.eventCount     = $('eventCount');
    dom.loading        = $('loadingIndicator');
    dom.errorBox       = $('errorBox');
    dom.noEvents       = $('noEventsBox');
    dom.table          = $('eventsTable');
    dom.tbody          = $('eventsTableBody');
    dom.pagination     = $('pagination');
    dom.prevBtn        = $('prevBtn');
    dom.nextBtn        = $('nextBtn');
    dom.pageInfo       = $('pageInfo');
    dom.analytics      = $('analyticsPanel');
    dom.statTotal      = $('statTotal');
    dom.statUsers      = $('statUsers');
    dom.statTopResource = $('statTopResource');
    dom.statTopAction  = $('statTopAction');
    dom.resourceLegend = $('resourceLegend');
    dom.actionLegend   = $('actionLegend');
    dom.breakdownTable = $('breakdownTable');
  }

  function setDefaultDates() {
    var now = new Date();
    var yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    dom.endTime.value = toLocalISO(now);
    dom.startTime.value = toLocalISO(yesterday);
  }

  function toLocalISO(d) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function getSandbox() {
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return AepGlobalSandbox.getSandboxName() || '';
    }
    return '';
  }

  function buildPropertyFilters() {
    var props = [];
    var action = dom.actionFilter.value;
    if (action) props.push('action==' + action);

    var startISO = dom.startTime.value ? new Date(dom.startTime.value).toISOString() : '';
    var endISO   = dom.endTime.value   ? new Date(dom.endTime.value).toISOString()   : '';
    if (startISO) props.push('timestamp>=' + startISO);
    if (endISO)   props.push('timestamp<=' + endISO);
    return props;
  }

  function showLoading(on) {
    dom.loading.hidden = !on;
    dom.errorBox.hidden = true;
    if (on) {
      dom.table.hidden = true;
      dom.noEvents.hidden = true;
      dom.apiStatus.className = 'audit-status-dot loading';
    }
  }

  function showError(msg) {
    dom.errorBox.textContent = msg;
    dom.errorBox.hidden = false;
    dom.apiStatus.className = 'audit-status-dot';
  }

  async function fetchAuditEvents() {
    showLoading(true);
    dom.fetchBtn.disabled = true;

    var limit = parseInt(dom.limitSlider.value, 10) || 50;
    var sandbox = getSandbox();

    var params = { limit: limit };

    var props = buildPropertyFilters();
    if (props.length) params.property = props;

    var body = {
      method: 'GET',
      path: AEP_AUDIT_PATH,
      params: params,
    };
    if (sandbox) {
      body.platform_headers = { 'x-sandbox-name': sandbox };
    }

    try {
      var resp = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error('Proxy error: HTTP ' + resp.status);

      var json = await resp.json();
      if (json.status && json.status >= 400) {
        throw new Error('AEP error ' + json.status + ': ' +
          (json.platform_response && json.platform_response.detail
            ? json.platform_response.detail
            : JSON.stringify(json.platform_response).slice(0, 200)));
      }

      var pr = json.platform_response || {};
      var embedded = pr._embedded || pr;
      var rawEvents = embedded.events || embedded.children || pr.children || [];

      allEvents = normaliseEvents(rawEvents);
      page = 1;
      perPage = parseInt(dom.eventsPerPage.value, 10) || 50;

      renderPage();
      renderAnalytics();
      updateStatus();
      dom.apiStatus.className = 'audit-status-dot connected';
    } catch (e) {
      showError(e.message || 'Unknown error');
      dom.analytics.hidden = true;
    } finally {
      showLoading(false);
      dom.fetchBtn.disabled = false;
    }
  }

  function normaliseEvents(raw) {
    return raw.map(function (ev) {
      var resourceType = ev.assetType || ev.permissionResource || 'Unknown';
      var resourceName = ev.assetName || '';
      var displayResource = resourceName || resourceType;
      if (ev.assetType && ev.assetName && ev.assetType !== ev.assetName) {
        displayResource = ev.assetType + ': ' + ev.assetName;
      }
      return {
        action:       ev.action || ev.type || '—',
        timestamp:    ev.timestamp || ev.created || '',
        user:         ev.userEmail || ev.user || ev.userId || '—',
        resource:     displayResource,
        resourceType: resourceType,
        status:       ev.status || '—',
        metadata:     ev,
      };
    });
  }

  /* ── Analytics ── */

  function countBy(arr, key) {
    var map = {};
    arr.forEach(function (ev) {
      var v = ev[key] || 'Unknown';
      map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map)
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (e) { return { label: e[0], count: e[1] }; });
  }

  function topEntry(sorted) {
    return sorted.length ? sorted[0].label : '—';
  }

  function renderAnalytics() {
    if (!allEvents.length) {
      dom.analytics.hidden = true;
      return;
    }
    dom.analytics.hidden = false;

    var resourceCounts = countBy(allEvents, 'resourceType');
    var actionCounts = countBy(allEvents, 'action');
    var users = {};
    allEvents.forEach(function (ev) { users[ev.user] = true; });

    dom.statTotal.textContent = allEvents.length;
    dom.statUsers.textContent = Object.keys(users).length;
    dom.statTopResource.textContent = topEntry(resourceCounts);
    dom.statTopAction.textContent = topEntry(actionCounts);

    renderDonut('resourceChart', resourceCounts, resourceChartInst, function (c) { resourceChartInst = c; });
    renderDonut('actionChart', actionCounts, actionChartInst, function (c) { actionChartInst = c; });
    renderLegend(dom.resourceLegend, resourceCounts);
    renderLegend(dom.actionLegend, actionCounts);
    renderBreakdown(resourceCounts, actionCounts);
  }

  function isDark() {
    return document.documentElement.getAttribute('data-aep-theme') === 'dark';
  }

  function renderDonut(canvasId, data, existing, save) {
    if (existing) existing.destroy();

    var canvas = $(canvasId);
    if (!canvas) return;
    var labels = data.map(function (d) { return d.label; });
    var values = data.map(function (d) { return d.count; });
    var colors = data.map(function (_, i) { return CHART_PALETTE[i % CHART_PALETTE.length]; });
    var textColor = isDark() ? '#ccc' : '#555';

    var chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark() ? '#333' : '#fff',
            titleColor: isDark() ? '#eee' : '#333',
            bodyColor: isDark() ? '#ccc' : '#555',
            borderColor: isDark() ? '#555' : '#ddd',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (ctx) {
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = total ? Math.round(ctx.parsed / total * 100) : 0;
                return ' ' + ctx.label + ': ' + ctx.parsed + ' (' + pct + '%)';
              },
            },
          },
        },
        animation: { animateRotate: true, duration: 600 },
      },
    });
    save(chart);
  }

  function renderLegend(container, data) {
    container.innerHTML = '';
    data.forEach(function (d, i) {
      var item = document.createElement('span');
      item.className = 'audit-legend-item';
      item.innerHTML =
        '<span class="audit-legend-swatch" style="background:' + CHART_PALETTE[i % CHART_PALETTE.length] + '"></span>' +
        esc(d.label) +
        ' <span class="audit-legend-count">(' + d.count + ')</span>';
      container.appendChild(item);
    });
  }

  function renderBreakdown(resourceCounts) {
    var crossTab = {};
    allEvents.forEach(function (ev) {
      var r = ev.resourceType || 'Unknown';
      var a = ev.action || 'Unknown';
      if (!crossTab[r]) crossTab[r] = {};
      crossTab[r][a] = (crossTab[r][a] || 0) + 1;
    });

    var allActions = [];
    var seen = {};
    allEvents.forEach(function (ev) {
      var a = ev.action || 'Unknown';
      if (!seen[a]) { seen[a] = true; allActions.push(a); }
    });

    var maxCount = 0;
    Object.values(crossTab).forEach(function (acts) {
      Object.values(acts).forEach(function (c) { if (c > maxCount) maxCount = c; });
    });

    var html = '<table><thead><tr><th>Resource</th><th>Action</th><th>Count</th><th></th></tr></thead><tbody>';
    resourceCounts.forEach(function (rc) {
      var rKey = rc.label;
      var acts = crossTab[rKey] || {};
      var entries = Object.entries(acts).sort(function (a, b) { return b[1] - a[1]; });
      entries.forEach(function (entry, j) {
        var pct = maxCount ? Math.round(entry[1] / maxCount * 100) : 0;
        html += '<tr>' +
          '<td>' + (j === 0 ? '<strong>' + esc(rKey) + '</strong>' : '') + '</td>' +
          '<td>' + esc(entry[0]) + '</td>' +
          '<td>' + entry[1] + '</td>' +
          '<td><span class="audit-breakdown-bar" style="width:' + Math.max(pct, 4) + '%"></span></td>' +
          '</tr>';
      });
    });
    html += '</tbody></table>';
    dom.breakdownTable.innerHTML = html;
  }

  /* ── Table rendering ── */

  function renderPage() {
    dom.tbody.innerHTML = '';
    if (!allEvents.length) {
      dom.noEvents.hidden = false;
      dom.table.hidden = true;
      dom.pagination.hidden = true;
      return;
    }

    var totalPages = Math.ceil(allEvents.length / perPage);
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * perPage;
    var slice = allEvents.slice(start, start + perPage);

    slice.forEach(function (ev, i) {
      var idx = start + i;
      var tr = document.createElement('tr');
      tr.className = 'audit-event-row';
      tr.setAttribute('data-idx', idx);
      tr.innerHTML =
        '<td><span class="audit-badge audit-badge--' + badgeClass(ev.action) + '">' + esc(ev.action) + '</span></td>' +
        '<td><span class="audit-timestamp">' + fmtTime(ev.timestamp) + '</span></td>' +
        '<td><span class="audit-user">' + esc(ev.user) + '</span></td>' +
        '<td class="audit-resource" title="' + esc(ev.resource) + '">' + esc(ev.resource) + '</td>' +
        '<td>' + esc(ev.status) + '</td>' +
        '<td><span class="audit-detail-toggle">View <span class="audit-chevron">&#9660;</span></span></td>';

      var detailTr = document.createElement('tr');
      detailTr.className = 'audit-detail-row';
      detailTr.innerHTML =
        '<td colspan="6"><div class="audit-detail-content"><h4>Event metadata</h4>' +
        '<pre class="audit-detail-json">' + esc(JSON.stringify(ev.metadata, null, 2)) + '</pre></div></td>';

      tr.addEventListener('click', function () {
        var open = detailTr.classList.toggle('audit-detail-row--open');
        tr.classList.toggle('audit-row--expanded', open);
      });

      dom.tbody.appendChild(tr);
      dom.tbody.appendChild(detailTr);
    });

    dom.table.hidden = false;
    dom.noEvents.hidden = true;

    dom.prevBtn.disabled = page <= 1;
    dom.nextBtn.disabled = page >= totalPages;
    dom.pageInfo.textContent = 'Page ' + page + ' of ' + totalPages;
    dom.pagination.hidden = totalPages <= 1;
  }

  function updateStatus() {
    dom.eventCount.textContent = allEvents.length + ' event' + (allEvents.length !== 1 ? 's' : '');
    dom.lastFetch.textContent = 'Fetched ' + new Date().toLocaleTimeString();
  }

  function badgeClass(action) {
    if (!action) return 'unknown';
    var a = action.toLowerCase();
    if (a === 'create') return 'create';
    if (a === 'update') return 'update';
    if (a === 'delete') return 'delete';
    if (a === 'read' || a === 'view') return 'read';
    if (a === 'allow') return 'allow';
    if (a === 'deny') return 'deny';
    return 'unknown';
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); }
    catch (e) { return String(ts); }
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheDom();
    setDefaultDates();

    dom.limitSlider.addEventListener('input', function () {
      dom.limitValue.textContent = this.value;
    });

    dom.fetchBtn.addEventListener('click', fetchAuditEvents);

    dom.prevBtn.addEventListener('click', function () {
      if (page > 1) { page--; renderPage(); }
    });
    dom.nextBtn.addEventListener('click', function () {
      var totalPages = Math.ceil(allEvents.length / perPage);
      if (page < totalPages) { page++; renderPage(); }
    });

    dom.eventsPerPage.addEventListener('change', function () {
      perPage = parseInt(this.value, 10) || 50;
      page = 1;
      renderPage();
    });

    var sandboxSelect = $('sandboxSelect');
    if (sandboxSelect && typeof AepGlobalSandbox !== 'undefined') {
      AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      AepGlobalSandbox.attachStorageSync(sandboxSelect);
    }
  });
})();
