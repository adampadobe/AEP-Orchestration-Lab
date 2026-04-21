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

  function initWalnutPage4Overlay() {
    var overlay = document.getElementById('ajoWalnutPage4Overlay');
    var closeBtn = document.getElementById('ajoWalnutPage4Close');
    var iframe = document.getElementById('ajoWalnutPage4Iframe');
    if (!overlay || !iframe) return;

    function loadIframeOnce() {
      var ds = iframe.getAttribute('data-src');
      if (!ds || iframe.getAttribute('src')) return;
      iframe.setAttribute('src', ds);
    }

    function openOverlay() {
      loadIframeOnce();
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ajo-walnut-page4-open');
      if (closeBtn) closeBtn.focus();
    }

    function closeOverlay() {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('ajo-walnut-page4-open');
    }

    window.addEventListener('message', function (ev) {
      try {
        if (ev.origin !== window.location.origin) return;
      } catch (e) {}
      var d = ev && ev.data;
      if (!d || d.type !== 'aep-exp-accel-walnut' || d.action !== 'openPage4') return;
      openOverlay();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeOverlay();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) {
        e.preventDefault();
        closeOverlay();
      }
    });
  }

  function init() {
    initTabs();
    initExpFilters();
    initFlyoutSidebar();
    initWalnutPage4Overlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
