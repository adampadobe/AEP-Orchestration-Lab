/**
 * Experimentation Accelerator: Donate-style AEP sidebar flyout + Overview/Experiments tabs.
 */
(function () {
  function initTabs() {
    var tabOv = document.getElementById('ajoTabOverview');
    var tabEx = document.getElementById('ajoTabExperiments');
    var panOv = document.getElementById('ajoPanelOverview');
    var panEx = document.getElementById('ajoPanelExperiments');
    if (!tabOv || !tabEx || !panOv || !panEx) return;

    function show(which) {
      var isOv = which === 'overview';
      tabOv.setAttribute('aria-selected', isOv ? 'true' : 'false');
      tabEx.setAttribute('aria-selected', isOv ? 'false' : 'true');
      panOv.hidden = !isOv;
      panEx.hidden = isOv;
      try {
        document.body.setAttribute('data-ajo-tab', isOv ? 'overview' : 'experiments');
      } catch (eAttr) {}
      try {
        var pathOnly = location.pathname || 'experimentation-accelerator.html';
        if (isOv) history.replaceState(null, '', pathOnly);
        else history.replaceState(null, '', pathOnly + '#experiments');
      } catch (e) {}
    }

    tabOv.addEventListener('click', function () {
      show('overview');
    });
    tabEx.addEventListener('click', function () {
      show('experiments');
    });

    try {
      if (location.hash === '#experiments') {
        show('experiments');
      } else {
        show('overview');
      }
    } catch (e2) {
      show('overview');
    }
  }

  function initExpFilters() {
    var layout = document.getElementById('ajoExpLayout');
    var aside = document.getElementById('ajoExpFilters');
    var toggle = document.getElementById('ajoExpFilterToggle');
    var hideBtn = document.getElementById('ajoExpFiltersHide');
    if (!layout || !aside || !toggle) return;

    function setOpen(open) {
      layout.classList.toggle('ajo-exp-layout--filters-visible', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      aside.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) aside.removeAttribute('hidden');
      else aside.setAttribute('hidden', '');
    }

    setOpen(false);

    toggle.addEventListener('click', function () {
      setOpen(!layout.classList.contains('ajo-exp-layout--filters-visible'));
    });
    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        setOpen(false);
      });
    }
  }

  function initExperimentFiltering() {
    var expPanel = document.getElementById('ajoPanelExperiments');
    if (!expPanel) return;

    var table = expPanel.querySelector('.ajo-data-table');
    if (!table) return;

    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    if (!rows.length) return;

    var topFilterInputs = Array.prototype.slice.call(
      expPanel.querySelectorAll('.ajo-exp-toolbar .ajo-checkbox-fake input[type="checkbox"]')
    );
    var sidebarFilterInputs = Array.prototype.slice.call(
      expPanel.querySelectorAll('.ajo-exp-filters input[type="checkbox"]')
    );
    var searchInput = expPanel.querySelector('.ajo-exp-search');

    function norm(v) {
      return String(v || '')
        .trim()
        .toLowerCase();
    }

    function inputLabelText(input) {
      if (!input || !input.parentElement) return '';
      return norm(input.parentElement.textContent).replace(/\s+/g, ' ');
    }

    function statusIsActive(status) {
      return status === 'active' || status === 'live';
    }

    function seedRowFlags(row, idx, meta) {
      // Provide deterministic demo flags for filters not shown in table columns.
      if (!row.dataset.createdByMe) row.dataset.createdByMe = idx % 5 === 0 ? 'true' : 'false';
      if (!row.dataset.hasInsights) row.dataset.hasInsights = idx % 3 === 0 ? 'true' : 'false';
      if (!row.dataset.hasOpportunities) row.dataset.hasOpportunities = idx % 4 === 0 ? 'true' : 'false';
      if (!row.dataset.needsSetupConfirmation) {
        row.dataset.needsSetupConfirmation =
          meta.status === 'label' || meta.status === 'draft' || meta.status === 'scheduled' || meta.status === 'in review'
            ? 'true'
            : 'false';
      }
    }

    function rowMeta(row, idx) {
      var tds = row.querySelectorAll('td');
      var star = row.querySelector('.ajo-star');
      var statusEl = row.querySelector('.ajo-status');
      var nameEl = row.querySelector('.ajo-table-link');
      var type = tds[6] ? norm(tds[6].textContent) : '';
      var source = tds[7] ? norm(tds[7].textContent) : '';
      var meta = {
        starred: !!(star && star.classList.contains('ajo-star--on')),
        status: norm(statusEl ? statusEl.textContent : ''),
        type: type,
        source: source,
        name: norm(nameEl ? nameEl.textContent : row.textContent),
      };
      seedRowFlags(row, idx, meta);
      return meta;
    }

    rows.forEach(function (row, idx) {
      var meta = rowMeta(row, idx);
      row.dataset.starred = meta.starred ? 'true' : 'false';
      row.dataset.status = meta.status;
      row.dataset.type = meta.type;
      row.dataset.source = meta.source;
      row.dataset.isActive = statusIsActive(meta.status) ? 'true' : 'false';
      row.dataset.nameText = meta.name;
    });

    function collectTopFilters() {
      var filters = {
        starred: false,
        createdByMe: false,
        hasInsights: false,
        hasOpportunities: false,
        active: false,
        needsSetupConfirmation: false,
      };

      topFilterInputs.forEach(function (input) {
        var label = inputLabelText(input);
        if (label === 'starred') filters.starred = input.checked;
        else if (label === 'created by me') filters.createdByMe = input.checked;
        else if (label === 'has insights') filters.hasInsights = input.checked;
        else if (label === 'has opportunities') filters.hasOpportunities = input.checked;
        else if (label === 'active') filters.active = input.checked;
        else if (label === 'needs setup confirmation') filters.needsSetupConfirmation = input.checked;
      });

      return filters;
    }

    function collectSidebarFilters() {
      var filters = {
        type: new Set(),
        starred: new Set(),
        status: new Set(),
        source: new Set(),
      };

      sidebarFilterInputs.forEach(function (input) {
        if (!input.checked) return;
        var label = inputLabelText(input);
        if (label === 'a/b' || label === 'mab') filters.type.add(label);
        else if (label === 'starred' || label === 'not starred') filters.starred.add(label);
        else if (
          label === 'draft' ||
          label === 'scheduled' ||
          label === 'live' ||
          label === 'completed' ||
          label === 'stopped' ||
          label === 'in review' ||
          label === 'failed' ||
          label === 'archived' ||
          label === 'active'
        ) {
          filters.status.add(label);
        } else if (label === 'adobe target') {
          filters.source.add('target');
        } else if (label === 'adobe journey optimizer') {
          filters.source.add('journey optimizer');
        }
      });

      return filters;
    }

    function applyFilters() {
      var top = collectTopFilters();
      var side = collectSidebarFilters();
      var q = norm(searchInput && !searchInput.disabled ? searchInput.value : '');

      rows.forEach(function (row) {
        var show = true;

        if (top.starred && row.dataset.starred !== 'true') show = false;
        if (show && top.createdByMe && row.dataset.createdByMe !== 'true') show = false;
        if (show && top.hasInsights && row.dataset.hasInsights !== 'true') show = false;
        if (show && top.hasOpportunities && row.dataset.hasOpportunities !== 'true') show = false;
        if (show && top.active && row.dataset.isActive !== 'true') show = false;
        if (show && top.needsSetupConfirmation && row.dataset.needsSetupConfirmation !== 'true') show = false;

        if (show && side.type.size && !side.type.has(row.dataset.type)) show = false;
        if (show && side.status.size && !side.status.has(row.dataset.status)) show = false;
        if (show && side.source.size && !side.source.has(row.dataset.source)) show = false;

        if (show && side.starred.size === 1) {
          if (side.starred.has('starred') && row.dataset.starred !== 'true') show = false;
          if (side.starred.has('not starred') && row.dataset.starred === 'true') show = false;
        }

        if (show && q && row.dataset.nameText.indexOf(q) === -1) show = false;

        row.style.display = show ? '' : 'none';
      });
    }

    topFilterInputs.forEach(function (input) {
      input.removeAttribute('disabled');
      input.addEventListener('change', applyFilters);
    });

    sidebarFilterInputs.forEach(function (input) {
      input.removeAttribute('disabled');
      input.addEventListener('change', applyFilters);
    });

    if (searchInput) {
      searchInput.removeAttribute('disabled');
      searchInput.setAttribute('placeholder', 'Search');
      searchInput.addEventListener('input', applyFilters);
    }

    applyFilters();
  }

  function initFlyoutSidebar() {
    var body = document.body;
    if (!body.classList.contains('experimentation-accelerator-page--immersive')) return;
    var sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return;

    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function setFlyoutOpen(open) {
      body.classList.toggle('experimentation-accelerator-page--nav-open', open);
    }

    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setFlyoutOpen(false);
        hideTimer = null;
      }, 450);
    }

    function onPointerMove(e) {
      if (mq.matches) return;
      if (e.clientX <= 24) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      var r = sidebar.getBoundingClientRect();
      var over =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      if (body.classList.contains('experimentation-accelerator-page--nav-open')) {
        scheduleClose();
      }
    }

    sidebar.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setFlyoutOpen(true);
      }
    });

    sidebar.addEventListener('mouseleave', function () {
      if (!mq.matches) scheduleClose();
    });

    document.addEventListener('mousemove', onPointerMove, { passive: true });

    mq.addEventListener('change', function () {
      clearHideTimer();
      if (mq.matches) body.classList.remove('experimentation-accelerator-page--nav-open');
    });

    setFlyoutOpen(false);
  }

  function initExperimentInsightDialog() {
    var dlg = document.getElementById('ajoInsightDetailDialog');
    var openBtn = document.getElementById('ajoInsightCardUrgency');
    var closeBtn = document.getElementById('ajoInsightDialogClose');
    if (!dlg || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', function () {
      try {
        if (typeof dlg.showModal === 'function') dlg.showModal();
        else alert('Insight details (demo)');
      } catch (e) {
        return;
      }
      try {
        closeBtn.focus();
      } catch (e2) {}
    });

    closeBtn.addEventListener('click', function () {
      try {
        dlg.close();
      } catch (e) {}
    });

    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) {
        try {
          dlg.close();
        } catch (e) {}
      }
    });

    dlg.addEventListener('cancel', function (ev) {
      ev.preventDefault();
      try {
        dlg.close();
      } catch (e) {}
    });
  }

  function initOpportunityDetailDialog() {
    var dlg = document.getElementById('ajoOppDetailDialog');
    var openBtn = document.getElementById('ajoOppDetailOpen');
    var closeBtn = document.getElementById('ajoOppDetailCancel');
    var openExperimentBtn = document.getElementById('ajoOppDialogOpenExperiment');
    if (!dlg || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', function () {
      try {
        if (typeof dlg.showModal === 'function') dlg.showModal();
      } catch (e) {
        return;
      }
      try {
        closeBtn.focus();
      } catch (e2) {}
    });

    if (openExperimentBtn) {
      openExperimentBtn.addEventListener('click', function () {
        try {
          dlg.close();
        } catch (e) {}
        window.location.href = 'experimentation-accelerator-email-template.html';
      });
    }

    closeBtn.addEventListener('click', function () {
      try {
        dlg.close();
      } catch (e) {}
    });

    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) {
        try {
          dlg.close();
        } catch (e) {}
      }
    });

    dlg.addEventListener('cancel', function (ev) {
      ev.preventDefault();
      try {
        dlg.close();
      } catch (e) {}
    });
  }

  function init() {
    initTabs();
    initExpFilters();
    initExperimentFiltering();
    initFlyoutSidebar();
    initExperimentInsightDialog();
    initOpportunityDetailDialog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
