/**
 * Solutions Consultant Command Centre UI for home-new.html.
 */
(function attachHomeCommandCentre(global) {
  'use strict';

  var data = global.HomeCommandData;
  var productCatalog = global.HomeCommandProducts;
  var scrapes = global.HomeCommandScrapes;
  if (!data) return;

  function customerById(id) {
    return data.useCustomers().getById(id);
  }

  function findCustomerByName(name) {
    var key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    var all = data.useCustomers().getAll();
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      var cn = String(c.name || '').trim().toLowerCase();
      if (!cn) continue;
      if (cn === key || key.indexOf(cn) !== -1 || cn.indexOf(key) !== -1) return c;
    }
    return null;
  }

  var runtimeLogos = {};

  function resolveCustomerLogoUrl(c) {
    if (!c) return '';
    if (runtimeLogos[c.id]) return runtimeLogos[c.id];
    if (c.scrapeLogoUrl) return c.scrapeLogoUrl;
    if (c.scrapeId && scrapes) {
      var item = scrapes.getById(c.scrapeId);
      if (item && item.customerLogoUrl) return item.customerLogoUrl;
    }
    return '';
  }

  function customerLogoHtml(c) {
    if (!c) return '';
    var url = resolveCustomerLogoUrl(c);
    if (!url) return '';
    return (
      '<img class="cc-cust-scrape-logo" src="' +
      esc(url) +
      '" alt="' +
      esc(c.scrapeBrand || c.name) +
      ' logo" loading="lazy" referrerpolicy="no-referrer" data-cc-customer-id="' +
      esc(c.id) +
      '" onerror="this.hidden=true">'
    );
  }

  function customerMentionRowHtml(name, customerOrId, rowClass) {
    var c =
      customerOrId && typeof customerOrId === 'object'
        ? customerOrId
        : customerOrId
          ? customerById(customerOrId)
          : findCustomerByName(name);
    var displayName = name || (c && c.name) || '';
    return (
      '<div class="' +
      esc(rowClass || 'cc-cust-mention-row') +
      '"><span class="cc-cust-mention-name">' +
      esc(displayName) +
      '</span>' +
      customerLogoHtml(c) +
      '</div>'
    );
  }

  function customerMentionInlineHtml(name, customerOrId) {
    var c =
      customerOrId && typeof customerOrId === 'object'
        ? customerOrId
        : customerOrId
          ? customerById(customerOrId)
          : findCustomerByName(name);
    return (
      '<span class="cc-cust-mention-inline">' +
      esc(name || (c && c.name) || '') +
      customerLogoHtml(c) +
      '</span>'
    );
  }

  function seedLogoFromCatalog(c) {
    if (!c || !c.scrapeId || !scrapes) return false;
    var item = scrapes.getById(c.scrapeId);
    if (!item || !item.customerLogoUrl) return false;
    runtimeLogos[c.id] = item.customerLogoUrl;
    return true;
  }

  function enrichCustomerLogos(customers, done) {
    if (!scrapes || !customers.length) {
      if (done) done();
      return;
    }
    var pending = 0;
    var needsRender = false;
    customers.forEach(function (c) {
      if (!c.scrapeId) return;
      if (seedLogoFromCatalog(c)) needsRender = true;
      pending += 1;
      scrapes.loadDetail(c.scrapeId).then(function (record) {
        if (!record) return;
        var logo = scrapes.pickLogoFromRecord(record);
        if (!logo) return;
        runtimeLogos[c.id] = logo;
        needsRender = true;
        if (logo !== c.scrapeLogoUrl) {
          data.useCustomers().update(c.id, {
            scrapeLogoUrl: logo,
            scrapeBrand: c.scrapeBrand || record.brandName || scrapes.scrapeLabel(scrapes.getById(c.scrapeId)),
          });
        }
      }).finally(function () {
        pending -= 1;
        if (pending <= 0 && done) done(needsRender);
      });
    });
    if (pending === 0 && done) done(false);
  }

  function updateScrapePreview(form, scrapeId) {
    var preview = document.getElementById('ccCustomerScrapePreview');
    var img = document.getElementById('ccCustomerScrapePreviewImg');
    var label = document.getElementById('ccCustomerScrapePreviewLabel');
    if (!form || !preview) return;
    if (!scrapeId || !scrapes) {
      preview.hidden = true;
      form.scrapeBrand.value = '';
      form.scrapeLogoUrl.value = '';
      return;
    }
    var item = scrapes.getById(scrapeId);
    form.scrapeBrand.value = item ? scrapes.scrapeLabel(item) : '';
    scrapes.loadDetail(scrapeId).then(function (record) {
      var logo = scrapes.pickLogoFromRecord(record);
      form.scrapeLogoUrl.value = logo || '';
      if (logo && img) {
        img.src = logo;
        if (label) label.textContent = form.scrapeBrand.value || 'Linked scrape';
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    });
  }

  function bindScrapeSelect(form) {
    if (!form || !scrapes) return;
    var select = form.querySelector('[name="scrapeId"]');
    if (!select || select.getAttribute('data-cc-bound') === '1') return;
    select.setAttribute('data-cc-bound', '1');
    select.addEventListener('change', function () {
      updateScrapePreview(form, select.value);
    });
  }

  function populateScrapeSelect(select, selectedId) {
    if (!select || !scrapes) return;
    select.innerHTML = scrapes.renderSelectOptions(selectedId || '');
  }

  var activeCustomerId = null;
  var activePocId = null;

  var STATUS_STRIP_MAP = {
    'On track': 'green',
    UAT: 'green',
    'At risk': 'red',
    Stalled: 'red',
    Delayed: 'amber',
    Discovery: 'blue',
    Onboarding: 'purple',
    New: 'purple',
    'In build': 'amber',
    Scoping: 'blue',
    Blocked: 'red',
    Complete: 'green',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function productLabel(c) {
    if (!productCatalog) return c.products || c.org || '';
    return productCatalog.formatProductIds(c.productIds) || c.products || c.org || '';
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
    var healthColor =
      m.avgEtaHealth >= 80 ? 'var(--cc-green)' : m.avgEtaHealth >= 60 ? 'var(--cc-amber)' : 'var(--cc-red)';
    root.innerHTML =
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Active Engagements</div>' +
      '<div class="cc-metric-value">' +
      m.activeCustomers +
      '</div>' +
      '<div class="cc-metric-sub cc-metric-sub--up">Open in pipeline</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-green" style="width:' +
      Math.min(100, m.activeCustomers * 12) +
      '%"></div></div></article>' +
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Overdue Actions</div>' +
      '<div class="cc-metric-value cc-metric-value--red' +
      overduePulse +
      '">' +
      m.overdueActions +
      '</div>' +
      '<div class="cc-metric-sub cc-metric-sub--down">Needs attention now</div>' +
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
      '<div class="cc-metric-label">PoCs In Flight</div>' +
      '<div class="cc-metric-value" style="color:var(--cc-blue)">' +
      m.pocsInFlight +
      '</div>' +
      '<div class="cc-metric-sub">Active demos &amp; PoCs</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-blue" style="width:' +
      Math.min(100, m.pocsInFlight * 30) +
      '%"></div></div></article>' +
      '<article class="cc-metric-card">' +
      '<div class="cc-metric-label">Pipeline ARR at Risk</div>' +
      '<div class="cc-metric-value" style="color:var(--cc-amber)">' +
      esc(data.formatArr(m.arrAtRisk)) +
      '</div>' +
      '<div class="cc-metric-sub cc-metric-sub--warn">' +
      esc(m.arrAtRiskLabel) +
      '</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-amber" style="width:' +
      (m.totalPipeline ? Math.round((m.arrAtRisk / m.totalPipeline) * 100) : 0) +
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
      ' engagements at risk</div>' +
      '<div class="cc-health-bar-wrap"><div class="cc-health-bar cc-hb-amber" style="width:' +
      m.avgEtaHealth +
      '%"></div></div></article>';

    var engEl = document.getElementById('homeGreetingEngagements');
    if (engEl) {
      engEl.textContent = String(m.openEngagements);
      engEl.classList.toggle('home-greeting-stat__value--accent', m.openEngagements > 0);
    }
    var overdueEl = document.getElementById('homeGreetingOverdue');
    if (overdueEl) {
      overdueEl.textContent = String(m.overdueActions);
      overdueEl.classList.toggle('home-greeting-stat__value--alert', m.overdueActions > 0);
      overdueEl.classList.toggle('home-greeting-stat__value--pulse', m.overdueActions > 0);
    }
  }

  function renderNextStepsList(steps) {
    if (!steps || !steps.length) return '<span class="cc-text-dim">—</span>';
    return (
      '<ul class="cc-ns-list">' +
      steps
        .map(function (s) {
          return '<li class="' + (s.done ? 'cc-ns-done' : '') + '">' + esc(s.text) + '</li>';
        })
        .join('') +
      '</ul>'
    );
  }

  function buildCustomerDetailBody(c) {
    var tags = (c.tags || [])
      .map(function (t) {
        return '<span class="cc-tag-pill">' + esc(t) + '</span>';
      })
      .join(' ');
    var tasks = data.useTasks().getOpen().filter(function (t) {
      return t.customerId === c.id;
    });

    var stakeholders = (c.stakeholders || [])
      .map(function (sh) {
        return (
          '<div class="cc-sh-item">' +
          '<div class="cc-sh-ava" style="background:' +
          esc(sh.color || 'var(--cc-blue)') +
          '">' +
          esc(sh.initials || '?') +
          '</div>' +
          '<div><div class="cc-sh-name">' +
          esc(sh.name) +
          '</div><div class="cc-sh-role">' +
          esc(sh.role) +
          '</div></div>' +
          '<div class="cc-sh-sentiment">' +
          esc(sh.sentiment || '') +
          '</div></div>'
        );
      })
      .join('');

    var milestones = (c.milestones || [])
      .map(function (ms) {
        var dotCls = 'cc-ms-dot';
        if (ms.status === 'done') dotCls += ' cc-ms-dot--done';
        else if (ms.status === 'active') dotCls += ' cc-ms-dot--active';
        else dotCls += ' cc-ms-dot--pending';
        return (
          '<div class="cc-ms-item">' +
          '<div class="' +
          dotCls +
          '"></div>' +
          '<div><div class="cc-ms-label">' +
          esc(ms.label) +
          '</div><div class="cc-ms-date">' +
          esc(ms.date || '') +
          '</div></div></div>'
        );
      })
      .join('');

    var history = (c.meetingHistory || [])
      .map(function (h) {
        return (
          '<div class="cc-hist-item">' +
          '<div class="cc-hist-date">' +
          esc(h.date) +
          '</div>' +
          '<div class="cc-hist-text">' +
          h.text +
          '</div></div>'
        );
      })
      .join('');

    var competitive = '';
    if (c.competitiveThreat) {
      var ct = c.competitiveThreat;
      competitive =
        '<div class="cc-drawer-section"><h4 class="cc-drawer-section-title">Competitive threat</h4>' +
        '<p class="cc-drawer-notes"><strong>' +
        esc(ct.vendor) +
        '</strong> (' +
        esc(ct.level) +
        ') — ' +
        esc(ct.detail) +
        '</p><p class="cc-comp-action">→ Counter: ' +
        esc(ct.counter) +
        '</p></div>';
    }

    var scrapeLink = '';
    if (c.scrapeId && scrapes) {
      scrapeLink =
        '<p class="cc-drawer-scrape">🔗 Brand scrape: <a href="' +
        esc(scrapes.scrapePageUrl(c.scrapeId)) +
        '">' +
        esc(c.scrapeBrand || scrapes.scrapeLabel(scrapes.getById(c.scrapeId))) +
        '</a></p>';
    } else if (c.scrapeBrand) {
      scrapeLink =
        '<p class="cc-drawer-scrape">🔗 Linked brand: ' + esc(c.scrapeBrand) + '</p>';
    }

    return (
      '<div class="cc-detail-head">' +
      '<div class="' +
      stripClass(c.statusStrip) +
      ' cc-detail-strip"></div>' +
      '<div><div class="cc-cust-name-row cc-detail-title-row">' +
      '<div class="cc-cust-name-block"><h3 class="cc-detail-title">' +
      esc(c.name) +
      '</h3></div>' +
      customerLogoHtml(c) +
      '</div>' +
      '<p class="cc-detail-products">' +
      esc(productLabel(c)) +
      '</p>' +
      (tags ? '<div class="cc-meeting-tags">' + tags + '</div>' : '') +
      '<span class="' +
      statusPillClass(c.status) +
      '">' +
      esc(c.status) +
      '</span>' +
      (c.arr
        ? '<p class="cc-drawer-arr cc-drawer-arr--head">ARR ' +
          esc(data.formatArr(c.arr)) +
          ' · ' +
          esc(c.pipelineStage || '') +
          '</p>'
        : '') +
      '</div></div>' +
      '<div class="cc-drawer-content cc-drawer-content--panel">' +
      '<div class="cc-drawer-notes-stack">' +
      '<div class="cc-drawer-section cc-drawer-section--full">' +
      '<h4 class="cc-drawer-section-title">Full notes</h4>' +
      '<p class="cc-drawer-notes">' +
      esc(c.notes || '—') +
      '</p>' +
      scrapeLink +
      (history
        ? '<div class="cc-drawer-subsection"><h4 class="cc-drawer-section-title">Meeting history</h4><div class="cc-history-list">' +
          history +
          '</div></div>'
        : '') +
      '</div>' +
      '<div class="cc-drawer-section cc-drawer-section--full">' +
      '<h4 class="cc-drawer-section-title">SC notes &amp; risks</h4>' +
      '<p class="cc-drawer-notes">' +
      (c.scNotes ? c.scNotes.replace(/\n/g, '<br>') : '—') +
      '</p>' +
      competitive +
      '</div>' +
      (stakeholders || milestones
        ? '<div class="cc-drawer-grid cc-drawer-grid--aux">' +
          (stakeholders
            ? '<div class="cc-drawer-section"><h4 class="cc-drawer-section-title">Stakeholders</h4><div class="cc-stakeholder-list">' +
              stakeholders +
              '</div></div>'
            : '') +
          (milestones
            ? '<div class="cc-drawer-section"><h4 class="cc-drawer-section-title">Milestones</h4><div class="cc-milestone-list">' +
              milestones +
              '</div></div>'
            : '') +
          '</div>'
        : '') +
      '</div></div>' +
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
      '</div>'
    );
  }

  function openCustomerDetail(customerId) {
    var drawer = document.getElementById('ccCustomerDrawer');
    var body = document.getElementById('ccCustomerDrawerBody');
    var backdrop = document.getElementById('ccCustomerBackdrop');
    if (!drawer || !body) return;
    var c = data.useCustomers().getById(customerId);
    if (!c) return;
    activeCustomerId = customerId;
    body.innerHTML = buildCustomerDetailBody(c);
    var editBtn = body.querySelector('#ccDetailEditBtn');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        closeCustomerDetail();
        openCustomerForm(customerId);
      });
    }
    drawer.classList.add('cc-customer-drawer--open');
    drawer.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    renderCustomers();
  }

  function closeCustomerDetail() {
    var drawer = document.getElementById('ccCustomerDrawer');
    var backdrop = document.getElementById('ccCustomerBackdrop');
    activeCustomerId = null;
    if (drawer) {
      drawer.classList.remove('cc-customer-drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = '';
    renderCustomers();
  }

  function renderCustomerRow(c) {
    var tags = (c.tags || [])
      .map(function (t) {
        var cls = 'cc-tag-pill';
        if (t.toLowerCase().indexOf('risk') !== -1 || t.toLowerCase() === 'stalled') {
          cls += ' cc-tag-pill--risk';
        }
        return '<span class="' + cls + '">' + esc(t) + '</span>';
      })
      .join('');
    var drHref = c.drUrl || '#';
    var drInner = c.drLink
      ? '<a href="' + esc(drHref) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
        esc(c.drLink) +
        ' ↗</a>'
      : '—';
    var etaSuffix = data.isOverdue(c.eta) ? ' ⚠' : '';
    var actionDue = '';
    if (data.isOverdue(c.eta)) {
      actionDue = '<div class="cc-action-due-hint cc-date-overdue">Overdue</div>';
    } else if (data.isDueSoon(c.eta, 1)) {
      actionDue = '<div class="cc-action-due-hint cc-date-soon">Due today</div>';
    }
    var chevronOpen = activeCustomerId === c.id ? ' cc-chevron--open' : '';
    return renderCustomerRowOnly(c, tags, drInner, etaSuffix, actionDue, chevronOpen);
  }

  function renderCustomerRowOnly(c, tags, drInner, etaSuffix, actionDue, chevronOpen) {
    return (
      '<tr class="cc-customer-row' +
      (activeCustomerId === c.id ? ' cc-customer-row--active' : '') +
      '" data-customer-id="' +
      esc(c.id) +
      '" tabindex="0" role="button">' +
      '<td class="cc-customer-cell-name">' +
      '<div class="cc-cust-name-cell">' +
      '<div class="' +
      stripClass(c.statusStrip) +
      '"></div>' +
      '<div class="cc-cust-name-inner">' +
      '<div class="cc-cust-name-row">' +
      '<div class="cc-cust-name-block">' +
      '<div class="cc-cust-name">' +
      esc(c.name) +
      '</div>' +
      '<div class="cc-cust-product">' +
      esc(productLabel(c)) +
      '</div>' +
      '</div>' +
      customerLogoHtml(c) +
      '</div>' +
      (tags ? '<div class="cc-meeting-tags">' + tags + '</div>' : '') +
      '</div></div></td>' +
      '<td><div class="cc-cust-row-inner"><div class="cc-cust-notes">' +
      esc(truncate(c.notes, 70)) +
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
      '<td class="cc-next-steps-cell"><div class="cc-cust-row-inner">' +
      renderNextStepsList(c.nextSteps) +
      '</div></td>' +
      '<td class="cc-next-action-cell"><div class="cc-cust-row-inner"><div class="cc-action-text">' +
      esc(truncate(c.nextAction, 70)) +
      '</div>' +
      actionDue +
      '</div></td>' +
      '<td><div class="cc-cust-row-inner"><span class="cc-chevron' +
      chevronOpen +
      '" aria-hidden="true">›</span></div></td></tr>'
    );
  }

  function renderCustomers() {
    var tbody = document.getElementById('ccCustomerTableBody');
    var foot = document.getElementById('ccCustomerTableFoot');
    if (!tbody) return;
    var customers = data.useCustomers().getAll();
    tbody.innerHTML = customers.map(renderCustomerRow).join('');
    if (foot) {
      foot.textContent =
        'Showing ' +
        customers.length +
        ' of ' +
        customers.length +
        ' active engagements · Click any row for full details';
    }
    tbody.querySelectorAll('.cc-customer-row').forEach(function (row) {
      var id = row.getAttribute('data-customer-id');
      row.addEventListener('click', function () {
        openCustomerDetail(id);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCustomerDetail(id);
        }
      });
    });
  }

  function renderMeetings() {
    var el = document.getElementById('ccMeetingsList');
    if (!el) return;
    var meetings = data.useCalendar().getUpcoming(4);
    if (!meetings.length) {
      el.innerHTML =
        '<p class="cc-empty">No upcoming meetings. Add an ETA on a customer engagement to schedule one here.</p>';
      return;
    }
    el.innerHTML = meetings
      .map(function (m) {
        var tags = (m.tags || [])
          .map(function (t) {
            var cls = 'cc-tag-pill';
            if (t.toLowerCase().indexOf('risk') !== -1) cls += ' cc-tag-pill--risk';
            return '<span class="' + cls + '">' + esc(t) + '</span>';
          })
          .join('');
        var cust = m.customerId ? customerById(m.customerId) : findCustomerByName(m.customerName);
        var etaDay = String(m.at || '').slice(0, 10);
        var timeCls = data.isOverdue(etaDay) ? ' cc-meeting-time--overdue' : '';
        var linked =
          m.customerId
            ? ' cc-meeting-item--linked" data-customer-id="' +
              esc(m.customerId) +
              '" tabindex="0" role="button"'
            : '"';
        return (
          '<div class="cc-meeting-item' +
          linked +
          '>' +
          '<div class="cc-meeting-time' +
          timeCls +
          '">' +
          esc(data.isOverdue(etaDay) ? 'Overdue · ' + fmtDate(etaDay) : fmtDateTime(m.at)) +
          '</div>' +
          '<div class="cc-meeting-name cc-cust-mention-row cc-cust-mention-row--meeting">' +
          '<span class="cc-cust-mention-name">' +
          esc(m.title) +
          '</span>' +
          customerLogoHtml(cust) +
          '</div>' +
          '<div class="cc-meeting-org">' +
          esc(m.context || '') +
          '</div>' +
          (m.prep ? '<div class="cc-meeting-prep">📋 ' + esc(m.prep) + '</div>' : '') +
          (tags ? '<div class="cc-meeting-tags">' + tags + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
    el.querySelectorAll('.cc-meeting-item--linked').forEach(function (item) {
      var id = item.getAttribute('data-customer-id');
      item.addEventListener('click', function () {
        openCustomerDetail(id);
      });
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCustomerDetail(id);
        }
      });
    });
  }

  function renderTasks() {
    var el = document.getElementById('ccTasksList');
    var overdueEl = document.getElementById('ccTasksOverdueLabel');
    if (!el) return;
    var priorityOrder = { high: 0, med: 1, low: 2 };
    var tasks = data
      .useTasks()
      .getOpen()
      .sort(function (a, b) {
        var ao = data.isOverdue(a.due) ? 0 : 1;
        var bo = data.isOverdue(b.due) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        var ap = priorityOrder[a.priority] != null ? priorityOrder[a.priority] : 2;
        var bp = priorityOrder[b.priority] != null ? priorityOrder[b.priority] : 2;
        if (ap !== bp) return ap - bp;
        return String(a.due || '').localeCompare(String(b.due || ''));
      })
      .slice(0, 6);
    var overdue = tasks.filter(function (t) {
      return data.isOverdue(t.due);
    }).length;
    if (overdueEl) {
      overdueEl.textContent = overdue ? overdue + ' overdue' : 'All clear';
      overdueEl.classList.toggle('cc-section-meta--alert', overdue > 0);
      overdueEl.classList.toggle('cc-metric-value--pulse', overdue > 0);
    }

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
        var priCls = t.priority ? ' cc-action-priority cc-action-priority--' + t.priority : '';
        return (
          '<div class="cc-action-item" data-task-id="' +
          esc(t.id) +
          '">' +
          (t.priority ? '<div class="cc-action-priority-bar' + priCls + '"></div>' : '') +
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
          (t.customerName ? ' · ' + customerMentionInlineHtml(t.customerName, t.customerId) : '') +
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
    var items = data.useActivity().getRecent(7);
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

  function pocBarColor(strip) {
    if (strip === 'green') return 'var(--cc-green)';
    if (strip === 'red') return 'var(--cc-red)';
    if (strip === 'amber') return 'var(--cc-amber)';
    return 'var(--cc-blue)';
  }

  function renderPocTracker() {
    var el = document.getElementById('ccPocTracker');
    if (!el) return;
    var pocs = data.usePocs().getAll();
    if (!pocs.length) {
      el.innerHTML = '<p class="cc-empty cc-empty--pad">No PoCs tracked yet.</p>';
      return;
    }
    el.innerHTML =
      '<div class="cc-table-scroll">' +
      '<table class="cc-poc-table cc-customer-table">' +
      '<thead><tr>' +
      '<th class="cc-th-customer">PoC / Demo</th>' +
      '<th>Customer</th>' +
      '<th>Status</th>' +
      '<th>Progress</th>' +
      '<th>Target</th>' +
      '<th class="cc-th-chevron" aria-label="Edit"></th>' +
      '</tr></thead><tbody>' +
      pocs
        .map(function (p) {
          var cust = p.customerId ? customerById(p.customerId) : null;
          var custName = cust ? cust.name : '—';
          var logo = cust ? customerLogoHtml(cust) : '';
          return (
            '<tr class="cc-poc-row' +
            (activePocId === p.id ? ' cc-customer-row--active' : '') +
            '" data-poc-id="' +
            esc(p.id) +
            '" tabindex="0" role="button">' +
            '<td class="cc-customer-cell-name"><div class="cc-cust-name-cell">' +
            '<div class="' +
            stripClass(p.statusStrip) +
            '"></div>' +
            '<div class="cc-cust-name-inner"><div class="cc-cust-name-row">' +
            '<div class="cc-cust-name-block"><div class="cc-cust-name">' +
            esc(p.name) +
            '</div><div class="cc-cust-product">' +
            esc(productLabel(p)) +
            '</div></div></div></div></td>' +
            '<td><div class="cc-cust-row-inner"><div class="cc-cust-name-row cc-cust-name-row--compact">' +
            '<span>' +
            esc(custName) +
            '</span>' +
            logo +
            '</div></div></td>' +
            '<td><div class="cc-cust-row-inner"><span class="' +
            statusPillClass(p.status) +
            '">' +
            esc(p.status) +
            '</span></div></td>' +
            '<td><div class="cc-cust-row-inner"><div class="cc-poc-bar-wrap cc-poc-bar-wrap--inline">' +
            '<div class="cc-poc-bar" style="width:' +
            (p.progress || 0) +
            '%;background:' +
            pocBarColor(p.statusStrip) +
            '"></div></div>' +
            '<div class="cc-poc-meta-inline">' +
            (p.progress || 0) +
            '%</div></div></td>' +
            '<td><div class="cc-cust-row-inner"><div class="cc-date-cell">' +
            esc(p.target || '—') +
            '</div></div></td>' +
            '<td><div class="cc-cust-row-inner"><span class="cc-chevron" aria-hidden="true">›</span></div></td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
    el.querySelectorAll('.cc-poc-row').forEach(function (row) {
      var id = row.getAttribute('data-poc-id');
      row.addEventListener('click', function () {
        openPocForm(id);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPocForm(id);
        }
      });
    });
  }

  function riskColor(risk) {
    if (risk === 'High') return 'var(--cc-red)';
    if (risk === 'Med') return 'var(--cc-amber)';
    return 'var(--cc-green)';
  }

  function renderPipeline() {
    var el = document.getElementById('ccPipelineHealth');
    if (!el) return;
    var customers = data.useCustomers().getAll();
    var m = data.computeMetrics();
    var rows = customers
      .map(function (c, i) {
        var last = i === customers.length - 1;
        return (
          '<div class="cc-ph-row' +
          (last ? ' cc-ph-row--last' : '') +
          '">' +
          '<div class="cc-ph-name cc-cust-mention-row">' +
          '<span class="cc-cust-mention-name">' +
          esc(c.name) +
          '</span>' +
          customerLogoHtml(c) +
          '</div>' +
          '<div class="cc-ph-stage">' +
          esc(c.pipelineStage || '—') +
          '</div>' +
          '<div class="cc-ph-arr">' +
          esc(data.formatArr(c.arr)) +
          '</div>' +
          '<div class="cc-ph-risk" style="color:' +
          riskColor(c.pipelineRisk) +
          '">' +
          esc(c.pipelineRisk === 'High' ? '🔴 High' : c.pipelineRisk || 'Low') +
          '</div></div>'
        );
      })
      .join('');
    el.innerHTML =
      '<div class="cc-ph-head"><span>Account</span><span>Stage</span><span>ARR</span><span>Risk</span></div>' +
      rows +
      '<div class="cc-ph-total"><span>Total pipeline</span><span class="cc-ph-total-val">' +
      esc(data.formatArr(m.totalPipeline)) +
      '</span></div>' +
      '<div class="cc-ph-at-risk"><span>At risk</span><span class="cc-ph-at-risk-val">' +
      esc(data.formatArr(m.arrAtRisk)) +
      '</span></div>';
  }

  function renderCompetitive() {
    var el = document.getElementById('ccCompetitiveIntel');
    if (!el) return;
    var customers = data.useCustomers().getAll().filter(function (c) {
      return c.competitiveThreat || c.scrapeId;
    });
    if (!customers.length) {
      el.innerHTML =
        '<p class="cc-empty">No competitive intel yet. Link a <a href="brand-scraper.html">brand scrape</a> on a customer or log a threat in SC notes.</p>';
      return;
    }
    el.innerHTML = '<p class="cc-comp-loading">Loading scrape intel…</p>';
    var rows = customers.map(function (c) {
      return scrapes && c.scrapeId
        ? scrapes.loadDetail(c.scrapeId).then(function (record) {
            return { customer: c, record: record, competitors: scrapes.getCompetitorsFromRecord(record) };
          })
        : Promise.resolve({ customer: c, record: null, competitors: [] });
    });
    Promise.all(rows).then(function (items) {
      if (!el.isConnected) return;
      el.innerHTML = items
        .map(function (item, i) {
          var c = item.customer;
          if (item.record && scrapes) {
            var recordLogo = scrapes.pickLogoFromRecord(item.record);
            if (recordLogo) runtimeLogos[c.id] = recordLogo;
          }
          var ct = c.competitiveThreat;
          var threatCls = ct
            ? ct.level === 'High'
              ? 'cc-sp-red'
              : ct.level === 'Watch'
                ? 'cc-sp-amber'
                : 'cc-sp-green'
            : 'cc-sp-amber';
          var threatLabel = ct
            ? ct.level === 'High'
              ? 'High threat'
              : ct.level + ' threat'
            : item.competitors.length
              ? 'From scrape'
              : 'Linked scrape';
          var last = i === items.length - 1;
          var scrapeLink = '';
          if (c.scrapeId && scrapes) {
            scrapeLink =
              '<div class="cc-comp-scrape-link"><a href="' +
              esc(scrapes.scrapePageUrl(c.scrapeId)) +
              '">Open brand scrape · ' +
              esc(c.scrapeBrand || scrapes.scrapeLabel(scrapes.getById(c.scrapeId))) +
              '</a></div>';
          }
          var detail = '';
          if (ct) {
            detail =
              '<div class="cc-comp-detail"><strong>' +
              esc(ct.vendor) +
              '</strong> — ' +
              esc(ct.detail) +
              '</div>' +
              '<div class="cc-comp-action">→ Counter: ' +
              esc(ct.counter) +
              '</div>';
          } else if (item.competitors.length) {
            detail =
              '<div class="cc-comp-detail">Competitors from scrape: <strong>' +
              esc(item.competitors.slice(0, 5).join(', ')) +
              '</strong></div>';
          } else {
            detail = '<div class="cc-comp-detail">Scrape linked — open for competitor analysis.</div>';
          }
          return (
            '<div class="cc-comp-item' +
            (last ? ' cc-comp-item--last' : '') +
            '">' +
            '<div class="cc-comp-header">' +
            '<div class="cc-comp-account-row">' +
            customerMentionRowHtml(c.name, c, 'cc-cust-mention-row cc-cust-mention-row--compact') +
            '</div>' +
            '<span class="cc-status-pill ' +
            threatCls +
            '">' +
            esc(threatLabel) +
            '</span></div>' +
            detail +
            scrapeLink +
            '</div>'
          );
        })
        .join('');
    });
  }

  function capBarColor(color) {
    var map = {
      red: 'var(--cc-red)',
      blue: 'var(--cc-blue)',
      green: 'var(--cc-green)',
      amber: 'var(--cc-amber)',
      purple: 'var(--cc-purple)',
      dim: 'var(--cc-border-lit)',
    };
    return map[color] || 'var(--cc-blue)';
  }

  function renderCapacity() {
    var el = document.getElementById('ccCapacityPlanner');
    if (!el) return;
    var rows = data.getCapacity();
    if (!rows.length) {
      el.innerHTML = '<p class="cc-empty">No capacity data.</p>';
      return;
    }
    var total = rows.reduce(function (s, r) {
      return s + (r.pct || 0);
    }, 0);
    el.innerHTML =
      '<p class="cc-cap-intro">Estimated allocation across active engagements</p>' +
      rows
        .map(function (r, i) {
          var last = i === rows.length - 1;
          return (
            '<div class="cc-cap-row' +
            (last ? ' cc-cap-row--last' : '') +
            '">' +
            '<div class="cc-cap-label' +
            (r.color === 'dim' ? ' cc-cap-label--dim' : '') +
            '">' +
            esc(r.label) +
            '</div>' +
            '<div class="cc-cap-bar-wrap"><div class="cc-cap-bar" style="width:' +
            r.pct +
            '%;background:' +
            capBarColor(r.color) +
            '"></div></div>' +
            '<div class="cc-cap-pct' +
            (r.color === 'dim' ? ' cc-cap-label--dim' : '') +
            '">' +
            r.pct +
            '%</div></div>'
          );
        })
        .join('') +
      '<div class="cc-cap-footer">' +
      '<div class="cc-cap-total"><span>Total load</span><span class="cc-cap-total-val">' +
      total +
      '% — full</span></div>' +
      '<p class="cc-cap-hint">⚠ Consider flagging capacity to your manager before taking new engagements</p></div>';
  }

  function kbBgClass(bg) {
    return 'cc-kb-icon--' + (bg || 'blue');
  }

  function renderKnowledgeBase() {
    var el = document.getElementById('ccKnowledgeBase');
    if (!el) return;
    var items = data.useKnowledgeBase().getAll();
    if (!items.length) {
      el.innerHTML = '<p class="cc-empty">No knowledge base assets yet.</p>';
      return;
    }
    el.innerHTML =
      '<div class="cc-kb-eyebrow">Reusable assets</div>' +
      items
        .map(function (kb, i) {
          var last = i === items.length - 1;
          return (
            '<div class="cc-kb-item' +
            (last ? ' cc-kb-item--last' : '') +
            '">' +
            '<div class="cc-kb-icon ' +
            kbBgClass(kb.bg) +
            '">' +
            esc(kb.icon) +
            '</div>' +
            '<div class="cc-kb-body"><div class="cc-kb-title">' +
            esc(kb.title) +
            '</div><div class="cc-kb-meta">' +
            esc(kb.meta) +
            '</div></div>' +
            '<div class="cc-kb-usage">' +
            esc(kb.usage) +
            '</div></div>'
          );
        })
        .join('');
  }

  function renderSyncStatus() {
    var el = document.getElementById('ccSyncStatus');
    if (!el || !data) return;
    var status = data.getSyncStatus ? data.getSyncStatus() : 'local-only';
    var labels = {
      idle: 'Local cache',
      loading: 'Syncing…',
      ready: 'Saved to RTDB',
      saving: 'Saving…',
      error: 'Sync error',
      offline: 'Sign in to sync',
      'local-only': 'Local only',
    };
    el.textContent = labels[status] || status;
    el.classList.toggle('cc-section-meta--alert', status === 'error' || status === 'offline');
  }

  function renderAll() {
    renderSyncStatus();
    renderMetrics();
    renderCustomers();
    renderMeetings();
    renderTasks();
    renderPocTracker();
    renderPipeline();
    renderCompetitive();
    renderCapacity();
    renderActivity();
    renderKnowledgeBase();
  }

  function getFormValues(form) {
    var tagsRaw = (form.tags && form.tags.value) || '';
    var status = (form.status && form.status.value) || 'Discovery';
    var productIds = productCatalog ? productCatalog.readPickerValues(form) : [];
    return {
      name: (form.name && form.name.value.trim()) || 'New customer',
      productIds: productIds,
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
      statusStrip: STATUS_STRIP_MAP[status] || 'blue',
      eta: (form.eta && form.eta.value) || '',
      lastMeeting: (form.lastMeeting && form.lastMeeting.value) || '',
      nextAction: (form.nextAction && form.nextAction.value.trim()) || '',
      demoLink: (form.demoLink && form.demoLink.value.trim()) || '',
      scrapeId: (form.scrapeId && form.scrapeId.value) || '',
      scrapeBrand: (form.scrapeBrand && form.scrapeBrand.value) || '',
      scrapeLogoUrl: (form.scrapeLogoUrl && form.scrapeLogoUrl.value) || '',
    };
  }

  function populatePocCustomerSelect(select, selectedId) {
    if (!select) return;
    var customers = data.useCustomers().getAll();
    select.innerHTML =
      '<option value="">— None —</option>' +
      customers
        .map(function (c) {
          return (
            '<option value="' +
            esc(c.id) +
            '"' +
            (selectedId === c.id ? ' selected' : '') +
            '>' +
            esc(c.name) +
            '</option>'
          );
        })
        .join('');
  }

  function getPocFormValues(form) {
    var status = (form.status && form.status.value) || 'Scoping';
    var progress = parseInt(form.progress && form.progress.value, 10);
    if (isNaN(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, progress));
    var productIds = productCatalog ? productCatalog.readPickerValues(form) : [];
    return {
      name: (form.name && form.name.value.trim()) || 'New PoC',
      customerId: (form.customerId && form.customerId.value) || '',
      productIds: productIds,
      target: (form.target && form.target.value.trim()) || '',
      status: status,
      statusStrip: STATUS_STRIP_MAP[status] || 'blue',
      progress: progress,
    };
  }

  function bindPocCustomerSelect(form) {
    if (!form || !productCatalog) return;
    var select = form.customerId || document.getElementById('ccPocCustomerSelect');
    var picker = document.getElementById('ccPocProductPickerGrid');
    if (!select || !picker || select.getAttribute('data-cc-poc-bound') === '1') return;
    select.setAttribute('data-cc-poc-bound', '1');
    select.addEventListener('change', function () {
      var checked = form.querySelectorAll('input[name="productIds"]:checked');
      if (checked.length) return;
      var cust = customerById(select.value);
      if (cust) productCatalog.renderPickerGrid(picker, cust.productIds || []);
    });
  }

  function openPocForm(pocId) {
    var modal = document.getElementById('ccPocModal');
    var form = document.getElementById('ccPocForm');
    if (!modal || !form) return;
    form.reset();
    form.pocId.value = pocId || '';
    activePocId = pocId || null;
    var title = document.getElementById('ccPocModalTitle');
    var customerSelect = document.getElementById('ccPocCustomerSelect');
    var picker = document.getElementById('ccPocProductPickerGrid');
    if (pocId) {
      var p = data.usePocs().getById(pocId);
      if (!p) return;
      if (title) title.textContent = 'Edit PoC / demo';
      form.name.value = p.name || '';
      form.target.value = p.target || '';
      form.status.value = p.status || 'Scoping';
      form.progress.value = p.progress != null ? p.progress : 0;
      populatePocCustomerSelect(customerSelect, p.customerId || '');
      if (productCatalog && picker) {
        productCatalog.renderPickerGrid(picker, p.productIds || []);
      }
      bindPocCustomerSelect(form);
    } else {
      if (title) title.textContent = 'Add PoC / demo';
      populatePocCustomerSelect(customerSelect, '');
      if (productCatalog && picker) {
        productCatalog.renderPickerGrid(picker, []);
      }
      bindPocCustomerSelect(form);
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('cc-modal-backdrop--open');
    renderPocTracker();
  }

  function closePocForm() {
    var modal = document.getElementById('ccPocModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('cc-modal-backdrop--open');
    activePocId = null;
    renderPocTracker();
  }

  function openCustomerForm(customerId) {
    var modal = document.getElementById('ccCustomerModal');
    var form = document.getElementById('ccCustomerForm');
    if (!modal || !form) return;
    form.reset();
    form.customerId.value = customerId || '';
    var title = document.getElementById('ccCustomerModalTitle');
    var picker = document.getElementById('ccProductPickerGrid');
    var scrapeSelect = document.getElementById('ccCustomerScrapeSelect');
    var preview = document.getElementById('ccCustomerScrapePreview');
    if (customerId) {
      var c = data.useCustomers().getById(customerId);
      if (!c) return;
      if (title) title.textContent = 'Edit customer';
      form.name.value = c.name || '';
      if (productCatalog && picker) {
        productCatalog.renderPickerGrid(picker, c.productIds);
      }
      form.tags.value = (c.tags || []).join(', ');
      form.notes.value = c.notes || '';
      form.drLink.value = c.drLink || '';
      form.drUrl.value = c.drUrl || '';
      form.status.value = c.status || 'Discovery';
      form.eta.value = c.eta || '';
      form.lastMeeting.value = c.lastMeeting || '';
      form.nextAction.value = c.nextAction || '';
      form.demoLink.value = c.demoLink || '';
      form.scrapeBrand.value = c.scrapeBrand || '';
      form.scrapeLogoUrl.value = c.scrapeLogoUrl || '';
      populateScrapeSelect(scrapeSelect, c.scrapeId || '');
      bindScrapeSelect(form);
      if (c.scrapeId) {
        updateScrapePreview(form, c.scrapeId);
      } else if (preview) {
        preview.hidden = true;
      }
    } else {
      if (title) title.textContent = 'Add customer engagement';
      if (productCatalog && picker) {
        productCatalog.renderPickerGrid(picker, []);
      }
      populateScrapeSelect(scrapeSelect, '');
      bindScrapeSelect(form);
      if (preview) preview.hidden = true;
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('cc-modal-backdrop--open');
  }

  function closeCustomerForm() {
    var modal = document.getElementById('ccCustomerModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('cc-modal-backdrop--open');
  }

  function bindModalEvents() {
    if (bindModalEvents.done) return;
    bindModalEvents.done = true;

    var modal = document.getElementById('ccCustomerModal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('cc-modal-backdrop--open');
    }

    var form = document.getElementById('ccCustomerForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!data) return;
        var values = getFormValues(form);
        var id = form.customerId && form.customerId.value;
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

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeCustomerForm();
      });
    }

    var pocModal = document.getElementById('ccPocModal');
    if (pocModal) {
      pocModal.hidden = true;
      pocModal.setAttribute('aria-hidden', 'true');
      pocModal.classList.remove('cc-modal-backdrop--open');
    }

    var pocForm = document.getElementById('ccPocForm');
    if (pocForm) {
      pocForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!data) return;
        var values = getPocFormValues(pocForm);
        var id = pocForm.pocId && pocForm.pocId.value;
        var pocs = data.usePocs();
        if (id) {
          pocs.update(id, values);
        } else {
          pocs.add(values);
        }
        closePocForm();
        renderAll();
      });
    }

    ['ccPocModalClose', 'ccPocModalCancel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', closePocForm);
    });

    if (pocModal) {
      pocModal.addEventListener('click', function (e) {
        if (e.target === pocModal) closePocForm();
      });
    }
  }

  function bindEvents() {
    bindModalEvents();

    var addBtn = document.getElementById('ccAddCustomerBtn');
    if (addBtn) addBtn.addEventListener('click', function () {
      openCustomerForm(null);
    });

    var addRow = document.getElementById('ccAddCustomerRow');
    if (addRow) addRow.addEventListener('click', function () {
      openCustomerForm(null);
    });

    var addPocBtn = document.getElementById('ccAddPocBtn');
    if (addPocBtn) addPocBtn.addEventListener('click', function () {
      openPocForm(null);
    });

    var drawerClose = document.getElementById('ccCustomerDrawerClose');
    if (drawerClose) drawerClose.addEventListener('click', closeCustomerDetail);
    var backdrop = document.getElementById('ccCustomerBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeCustomerDetail);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeCustomerForm();
        closePocForm();
        closeCustomerDetail();
      }
    });
  }

  function init() {
    var root = document.getElementById('ccCommandCentre');
    if (!root || root.getAttribute('data-cc-init') === '1') return;
    root.setAttribute('data-cc-init', '1');
    bindEvents();
    data.init().then(function () {
      var afterLogoEnrich = function () {
        renderAll();
      };
      if (scrapes) {
        scrapes.loadCatalog().then(function () {
          enrichCustomerLogos(data.useCustomers().getAll(), afterLogoEnrich);
        });
      } else {
        afterLogoEnrich();
      }
      data.subscribe(function () {
        renderAll();
        if (activeCustomerId) {
          var c = data.useCustomers().getById(activeCustomerId);
          var body = document.getElementById('ccCustomerDrawerBody');
          if (c && body && document.getElementById('ccCustomerDrawer').classList.contains('cc-customer-drawer--open')) {
            body.innerHTML = buildCustomerDetailBody(c);
            var editBtn = body.querySelector('#ccDetailEditBtn');
            if (editBtn) {
              editBtn.addEventListener('click', function () {
                closeCustomerDetail();
                openCustomerForm(activeCustomerId);
              });
            }
          }
        }
      });
    });
    global.addEventListener('aep-command-scrapes-loaded', function () {
      var scrapeSelect = document.getElementById('ccCustomerScrapeSelect');
      var form = document.getElementById('ccCustomerForm');
      if (scrapeSelect && form && form.customerId) {
        var cid = form.customerId.value;
        var selected = cid ? (data.useCustomers().getById(cid) || {}).scrapeId : '';
        populateScrapeSelect(scrapeSelect, selected || '');
      }
      enrichCustomerLogos(data.useCustomers().getAll(), function () {
        renderAll();
      });
    });
    global.addEventListener('aep-command-centre-sync', function () {
      renderSyncStatus();
    });
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
    document.addEventListener('DOMContentLoaded', function () {
      bindModalEvents();
      boot();
    });
  } else {
    bindModalEvents();
    boot();
  }
})(window);
