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

  function init() {
    initTabs();
    initExpFilters();
    initFlyoutSidebar();
    initExperimentInsightDialog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
