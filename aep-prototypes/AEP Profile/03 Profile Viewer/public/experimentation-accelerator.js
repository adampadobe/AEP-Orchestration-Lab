/**
 * Experimentation Accelerator: Donate-style AEP sidebar flyout + Overview/Experiments tabs.
 */
(function () {
  function initTabs() {
    var tabOv = document.getElementById('ajoTabOverview');
    var tabEx = document.getElementById('ajoTabExperiments');
    var panOv = document.getElementById('ajoPanelOverview');
    var panEx = document.getElementById('ajoPanelExperiments');

    function show(which) {
      var isOv = which === 'overview';
      if (tabOv) {
        tabOv.setAttribute('aria-selected', isOv ? 'true' : 'false');
      }
      if (tabEx) {
        tabEx.setAttribute('aria-selected', isOv ? 'false' : 'true');
      }
      if (panOv) {
        panOv.hidden = !isOv;
      }
      if (panEx) {
        panEx.hidden = isOv;
      }
    }

    if (tabOv) {
      tabOv.addEventListener('click', function () {
        show('overview');
      });
    }
    if (tabEx) {
      tabEx.addEventListener('click', function () {
        show('experiments');
      });
    }
    show('overview');
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

  function init() {
    initTabs();
    initFlyoutSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
