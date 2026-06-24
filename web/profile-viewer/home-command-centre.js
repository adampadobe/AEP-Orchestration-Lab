/**
 * Solutions Consultant Command Centre UI for home-new.html.
 */
(function attachHomeCommandCentre(global) {
  'use strict';

  var data = global.HomeCommandData;
  if (!data) return;

  var STATUS_STRIP_MAP = {
    'On track': 'green',
    UAT: 'green',
    'At risk': 'red',
    Stalled: 'red',
    Delayed: 'amber',
    Discovery: 'blue',
    Onboarding: 'purple',
    New: 'purple',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    var d = data.parseDateOnly(iso);
    if (!d) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    var time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return 'TODAY · ' + time;
    return (
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase() +
      ' · ' +
      time
    );
  }

  function fmtFeedTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var diff = now - d;
    if (diff < 86400000 && d.toDateString() === now.toDateString()) {
      return 'today · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 172800000) return 'yesterday · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return (
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' · ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  }

  function statusPillClass(status) {
    var strip = STATUS_STRIP_MAP[status] || 'blue';
    return 'cc-status-pill cc-sp-' + strip;
  }

  function stripClass(strip) {
    return 'cc-status-strip cc-strip-' + (strip || 'blue');
  }

  function etaClass(eta) {
    if (data.isOverdue(eta)) return 'cc-date-overdue';
    if (data.isDueSoon(eta, 14)) return 'cc-date-soon';
    return '';
  }

  function truncate(s, n) {
    var t = String(s || '');
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  function renderMetrics() {
    var m = data.computeMetrics();
    var root = document.getElementById('ccMetricsRow');
    if (!root) return;
    var overduePulse = m.overdueActions > 0 ? ' cc-metric-value--pulse' : '';
    var healthColor = m.avgEtaHealth >= 80 ? 'var(--cc-green)' : m.avgEtaHealth >= 60 ? 'var(--cc-amber)' : 'var(--cc-red)';
    root.innerHTML =
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Active Customers</div>' +
      '<div class="cc-metric-value">' +
      m.activeCustomers +
      '</div>' +
      '<div class="cc-metric-sub cc-metric-sub--up">Open engagements</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-green" style="width:' +
      Math.min(100, m.activeCustomers * 10) +
      '%"></div></div></article>' +
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Overdue Actions</div>' +
      '<div class="cc-metric-value cc-metric-value--red' +
      overduePulse +
      '">' +
      m.overdueActions +
      '</div>' +
      '<div class="cc-metric-sub cc-metric-sub--down">Needs attention</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-red" style="width:' +
      Math.min(100, m.overdueActions * 20) +
      '%"></div></div></article>' +
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Meetings This Week</div>' +
      '<div class="cc-metric-value">' +
      m.meetingsThisWeek +
      '</div>' +
      '<div class="cc-metric-sub cc-metric-sub--warn">' +
      m.meetingsToday +
      ' today · ' +
      Math.max(0, m.meetingsThisWeek - m.meetingsToday) +
      ' upcoming</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-amber" style="width:' +
      Math.min(100, m.meetingsThisWeek * 25) +
      '%"></div></div></article>' +
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Avg. ETA Health</div>' +
      '<div class="cc-metric-value" style="color:' +
      healthColor +
      '">' +
      m.avgEtaHealth +
      '%</div>' +
      '<div class="cc-metric-sub cc-metric-sub--warn">' +
      m.atRiskCount +
      ' at risk of slipping</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-amber" style="width:' +
      m.avgEtaHealth +
      '%"></div></div></article>';

    var engEl = document.getElementById('homeGreetingEngagements');
    if (engEl) {
      engEl.textContent = String(m.openEngagements);
      engEl.classList.toggle('home-greeting-stat__value--accent', m.openEngagements > 0);
    }
  }

  function renderCustomerRow(c) {
    var tags = (c.tags || [])
      .map(function (t) {
        return '<span class="cc-tag-pill">' + esc(t) + '</span>';
      })
      .join('');
    var drHref = c.drUrl || '#';
    var drInner = c.drLink
      ? '<a href="' + esc(drHref) + '" target="_blank" rel="noopener">' + esc(c.drLink) + ' ↗</a>'
      : '—';
    var etaSuffix = data.isOverdue(c.eta) ? ' ⚠' : '';
    return (
      '<tr class="cc-customer-row" data-customer-id="' +
      esc(c.id) +
      '" tabindex="0" role="button">' +
      '<td class="cc-customer-cell-name">' +
      '<div class="cc-cust-name-cell">' +
      '<div class="' +
      stripClass(c.statusStrip) +
      '"></div>' +
      '<div class="cc-cust-name-inner">' +
      '<div class="cc-cust-name">' +
      esc(c.name) +
      '</div>' +
      '<div class="cc-cust-product">' +
      esc(c.products || '') +
      '</div>' +
      (tags ? '<div class="cc-meeting-tags">' + tags + '</div>' : '') +
      '</div></div></td>' +
      '<td><div class="cc-cust-row-inner"><div class="cc-cust-notes">' +
      esc(truncate(c.notes, 90)) +
      '</div></div></td>' +
      '<td><div class="cc-cust-row-inner"><div class="cc-mono-sm">' +
      drInner +
      '</div></div></td>' +
      '<td><div class="cc-cust-row-inner"><span class="' +
      statusPillClass(c.status) +
      '">' +
      esc(c.status || '') +
      '</span></div></td>' +
      '<td><div class="cc-cust-row-inner"><div class="cc-date-cell ' +
      etaClass(c.eta) +
      '">' +
      esc(data.isOverdue(c.eta) ? 'Overdue' : fmtDate(c.eta)) +
      etaSuffix +
      '</div></div></td>' +
      '<td><div class="cc-cust-row-inner"><div class="cc-date-cell">' +
      fmtDate(c.lastMeeting) +
      '</div></div></td>' +
      '<td><div class="cc-cust-row-inner"><div class="cc-action-text">' +
      esc(truncate(c.nextAction, 80)) +
      '</div></div></td></tr>'
    );
  }

  function renderCustomers() {
    var tbody = document.getElementById('ccCustomerTableBody');
    var foot = document.getElementById('ccCustomerTableFoot');
    if (!tbody) return;
    var customers = data.useCustomers().getAll();
    tbody.innerHTML = customers.map(renderCustomerRow).join('');
    if (foot) {
      foot.textContent = 'Showing ' + customers.length + ' of ' + customers.length + ' active engagements';
    }
    tbody.querySelectorAll('.cc-customer-row').forEach(function (row) {
      row.addEventListener('click', function () {
        openCustomerDetail(row.getAttribute('data-customer-id'));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCustomerDetail(row.getAttribute('data-customer-id'));
        }
      });
    });
  }

  function renderMeetings() {
    var el = document.getElementById('ccMeetingsList');
    if (!el) return;
    var meetings = data.useCalendar().getUpcoming(4);
    if (!meetings.length) {
      el.innerHTML = '<p class="cc-empty">No upcoming meetings.</p>';
      return;
    }
    el.innerHTML = meetings
      .map(function (m) {
        var tags = (m.tags || [])
          .map(function (t) {
            return '<span class="cc-tag-pill">' + esc(t) + '</span>';
          })
          .join('');
        return (
          '<div class="cc-meeting-item">' +
          '<div class="cc-meeting-time">' +
          esc(fmtDateTime(m.at)) +
          '</div>' +
          '<div class="cc-meeting-name">' +
          esc(m.title) +
          '</div>' +
          '<div class="cc-meeting-org">' +
          esc(m.context || '') +
          '</div>' +
          (tags ? '<div class="cc-meeting-tags">' + tags + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  function renderTasks() {
    var el = document.getElementById('ccTasksList');
    var overdueEl = document.getElementById('ccTasksOverdueLabel');
    if (!el) return;
    var tasks = data
      .useTasks()
      .getOpen()
      .sort(function (a, b) {
        var ao = data.isOverdue(a.due) ? 0 : 1;
        var bo = data.isOverdue(b.due) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return String(a.due || '').localeCompare(String(b.due || ''));
      })
      .slice(0, 6);
    var overdue = tasks.filter(function (t) {
      return data.isOverdue(t.due);
    }).length;
    if (overdueEl) overdueEl.textContent = overdue ? overdue + ' overdue' : 'All clear';

    if (!tasks.length) {
      el.innerHTML = '<p class="cc-empty">No open actions.</p>';
      return;
    }
    el.innerHTML = tasks
      .map(function (t) {
        var dueCls = data.isOverdue(t.due)
          ? 'cc-action-due cc-action-due--overdue'
          : data.isDueSoon(t.due, 1)
            ? 'cc-action-due cc-action-due--soon'
            : 'cc-action-due';
        var dueLabel = data.isOverdue(t.due)
          ? 'Overdue · was ' + fmtDate(t.due)
          : data.isDueSoon(t.due, 1)
            ? 'Due today'
            : 'Due ' + fmtDate(t.due);
        return (
          '<div class="cc-action-item" data-task-id="' +
          esc(t.id) +
          '">' +
          '<button type="button" class="cc-action-check" aria-label="Mark complete"></button>' +
          '<div class="cc-action-body">' +
          '<div class="cc-action-title">' +
          esc(t.title) +
          '</div>' +
          '<div class="cc-action-meta"><span class="' +
          dueCls +
          '">' +
          esc(dueLabel) +
          '</span>' +
          (t.customerName ? ' · ' + esc(t.customerName) : '') +
          '</div></div></div>'
        );
      })
      .join('');

    el.querySelectorAll('.cc-action-check').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.closest('.cc-action-item').getAttribute('data-task-id');
        data.useTasks().toggle(id, true);
        renderAll();
      });
    });
  }

  function renderActivity() {
    var el = document.getElementById('ccActivityFeed');
    if (!el) return;
    var items = data.useActivity().getRecent(6);
    if (!items.length) {
      el.innerHTML = '<p class="cc-empty">Activity will appear as you update engagements.</p>';
      return;
    }
    el.innerHTML = items
      .map(function (a) {
        return (
          '<div class="cc-feed-item">' +
          '<div class="cc-feed-icon">' +
          esc(a.icon || '📋') +
          '</div>' +
          '<div class="cc-feed-body">' +
          '<div class="cc-feed-text">' +
          a.text +
          '</div>' +
          '<div class="cc-feed-time">' +
          esc(fmtFeedTime(a.at)) +
          '</div></div></div>'
        );
      })
      .join('');
  }

  function renderAll() {
    renderMetrics();
    renderCustomers();
    renderMeetings();
    renderTasks();
    renderActivity();
  }

  function getFormValues(form) {
    var tagsRaw = (form.tags && form.tags.value) || '';
    var status = (form.status && form.status.value) || 'Discovery';
    return {
      name: (form.name && form.name.value.trim()) || 'New customer',
      products: (form.products && form.products.value.trim()) || '',
      tags: tagsRaw
        .split(',')
        .map(function (t) {
          return t.trim();
        })
        .filter(Boolean),
      notes: (form.notes && form.notes.value.trim()) || '',
      drLink: (form.drLink && form.drLink.value.trim()) || '',
      drUrl: (form.drUrl && form.drUrl.value.trim()) || '',
      status: status,
      statusStrip: STATUS_STRIP_MAP[status] || (form.statusStrip && form.statusStrip.value) || 'blue',
      eta: (form.eta && form.eta.value) || '',
      lastMeeting: (form.lastMeeting && form.lastMeeting.value) || '',
      nextAction: (form.nextAction && form.nextAction.value.trim()) || '',
      demoLink: (form.demoLink && form.demoLink.value.trim()) || '',
    };
  }

  function openCustomerForm(customerId) {
    var modal = document.getElementById('ccCustomerModal');
    var form = document.getElementById('ccCustomerForm');
    if (!modal || !form) return;
    form.reset();
    form.customerId.value = customerId || '';
    var title = document.getElementById('ccCustomerModalTitle');
    if (customerId) {
      var c = data.useCustomers().getById(customerId);
      if (!c) return;
      if (title) title.textContent = 'Edit customer';
      form.name.value = c.name || '';
      form.products.value = c.products || '';
      form.tags.value = (c.tags || []).join(', ');
      form.notes.value = c.notes || '';
      form.drLink.value = c.drLink || '';
      form.drUrl.value = c.drUrl || '';
      form.status.value = c.status || 'Discovery';
      form.eta.value = c.eta || '';
      form.lastMeeting.value = c.lastMeeting || '';
      form.nextAction.value = c.nextAction || '';
      form.demoLink.value = c.demoLink || '';
    } else if (title) {
      title.textContent = 'Add customer engagement';
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeCustomerForm() {
    var modal = document.getElementById('ccCustomerModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  function openCustomerDetail(customerId) {
    var drawer = document.getElementById('ccCustomerDrawer');
    var body = document.getElementById('ccCustomerDrawerBody');
    if (!drawer || !body) return;
    var c = data.useCustomers().getById(customerId);
    if (!c) return;
    var tasks = data.useTasks().getOpen().filter(function (t) {
      return t.customerId === customerId;
    });
    var tags = (c.tags || [])
      .map(function (t) {
        return '<span class="cc-tag-pill">' + esc(t) + '</span>';
      })
      .join(' ');
    body.innerHTML =
      '<div class="cc-detail-head">' +
      '<div class="' +
      stripClass(c.statusStrip) +
      ' cc-detail-strip"></div>' +
      '<div><h3 class="cc-detail-title">' +
      esc(c.name) +
      '</h3>' +
      '<p class="cc-detail-products">' +
      esc(c.products || '') +
      '</p>' +
      (tags ? '<div class="cc-meeting-tags">' + tags + '</div>' : '') +
      '<span class="' +
      statusPillClass(c.status) +
      '">' +
      esc(c.status) +
      '</span></div></div>' +
      '<div class="cc-detail-section"><h4>Notes</h4><p>' +
      esc(c.notes || '—') +
      '</p></div>' +
      '<div class="cc-detail-section"><h4>DR Link</h4><p class="cc-mono-sm">' +
      (c.drLink
        ? '<a href="' + esc(c.drUrl || '#') + '" target="_blank" rel="noopener">' + esc(c.drLink) + '</a>'
        : '—') +
      '</p></div>' +
      '<div class="cc-detail-grid">' +
      '<div><span class="cc-detail-label">ETA</span><div class="' +
      etaClass(c.eta) +
      '">' +
      fmtDate(c.eta) +
      '</div></div>' +
      '<div><span class="cc-detail-label">Last meeting</span><div>' +
      fmtDate(c.lastMeeting) +
      '</div></div></div>' +
      '<div class="cc-detail-section"><h4>Next action</h4><p>' +
      esc(c.nextAction || '—') +
      '</p></div>' +
      (c.demoLink
        ? '<div class="cc-detail-section"><h4>Demo</h4><p><a href="' +
          esc(c.demoLink) +
          '">Open demo</a></p></div>'
        : '') +
      '<div class="cc-detail-section"><h4>Linked tasks</h4>' +
      (tasks.length
        ? '<ul class="cc-detail-tasks">' +
          tasks
            .map(function (t) {
              return '<li>' + esc(t.title) + ' <span class="cc-detail-due">(' + fmtDate(t.due) + ')</span></li>';
            })
            .join('') +
          '</ul>'
        : '<p class="cc-empty">No open tasks.</p>') +
      '</div>' +
      '<div class="cc-detail-actions">' +
      '<button type="button" class="cc-btn cc-btn-ghost" id="ccDetailEditBtn">Edit customer</button>' +
      '</div>';

    var editBtn = body.querySelector('#ccDetailEditBtn');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        closeCustomerDetail();
        openCustomerForm(customerId);
      });
    }

    drawer.classList.add('cc-customer-drawer--open');
    drawer.setAttribute('aria-hidden', 'false');
    document.getElementById('ccCustomerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeCustomerDetail() {
    var drawer = document.getElementById('ccCustomerDrawer');
    var backdrop = document.getElementById('ccCustomerBackdrop');
    if (drawer) {
      drawer.classList.remove('cc-customer-drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
  }

  function bindEvents() {
    var addBtn = document.getElementById('ccAddCustomerBtn');
    if (addBtn) addBtn.addEventListener('click', function () { openCustomerForm(null); });

    var addRow = document.getElementById('ccAddCustomerRow');
    if (addRow) addRow.addEventListener('click', function () { openCustomerForm(null); });

    var form = document.getElementById('ccCustomerForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var values = getFormValues(form);
        var id = form.customerId.value;
        var customers = data.useCustomers();
        if (id) {
          customers.update(id, values);
        } else {
          var row = customers.add(values);
          if (values.nextAction) {
            data.useTasks().add({
              title: values.nextAction,
              customerId: row.id,
              customerName: row.name,
              due: values.eta || '',
            });
          }
        }
        closeCustomerForm();
        renderAll();
      });
    }

    ['ccCustomerModalClose', 'ccCustomerModalCancel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', closeCustomerForm);
    });

    var modal = document.getElementById('ccCustomerModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeCustomerForm();
      });
    }

    var drawerClose = document.getElementById('ccCustomerDrawerClose');
    if (drawerClose) drawerClose.addEventListener('click', closeCustomerDetail);
    var backdrop = document.getElementById('ccCustomerBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeCustomerDetail);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeCustomerForm();
        closeCustomerDetail();
      }
    });
  }

  function init() {
    var root = document.getElementById('ccCommandCentre');
    if (!root || root.getAttribute('data-cc-init') === '1') return;
    root.setAttribute('data-cc-init', '1');
    data.init();
    bindEvents();
    data.subscribe(function () {
      renderAll();
    });
    renderAll();
  }

  function boot() {
    if (document.getElementById('ccCommandCentre')) {
      init();
      return;
    }
    global.addEventListener('aep-deferred-dashboard-mounted', init, { once: true });
  }

  global.HomeCommandCentre = { init: init, renderAll: renderAll, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
