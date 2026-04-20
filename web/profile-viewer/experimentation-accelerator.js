/**
 * Experimentation Accelerator fake AJO: Donate-style AEP sidebar flyout + Overview/Experiments tabs.
 */
(function () {
  var app = document.getElementById('expAccelApp');

  function resolveToUrl(pathOrUrl) {
    if (!pathOrUrl || !String(pathOrUrl).trim()) return '';
    var s = String(pathOrUrl).trim();
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
    try {
      return new URL(s, window.location.href).href;
    } catch (e) {
      return s;
    }
  }

  function bust(u) {
    if (!u) return u;
    try {
      var x = new URL(u, window.location.href);
      x.searchParams.set('_ea', String(Date.now()));
      return x.href;
    } catch (e) {
      return u + (u.indexOf('?') >= 0 ? '&' : '?') + '_ea=' + Date.now();
    }
  }

  function setChromeBackground(url) {
    if (!app) return;
    var resolved = resolveToUrl(url);
    if (!resolved) {
      app.style.setProperty('--ajo-bg-overview1', 'none');
      return;
    }
    app.style.setProperty('--ajo-bg-overview1', 'url("' + resolved.replace(/"/g, '\\"') + '")');
  }

  function setCssVar(name, value) {
    if (!app) return;
    if (value === undefined || value === null || value === '') return;
    app.style.setProperty(name, String(value));
  }

  window.__expAccelApplyAssets = function (data) {
    if (!data || typeof data !== 'object') return;
    var o1 = data.overview1 || data.step1;
    var o2 = data.overview2 || data.step2;
    var ex = data.experiments;

    var img1 = document.querySelector('[data-ajo-part="ov1"]');
    var img2 = document.querySelector('[data-ajo-part="ov2"]');
    var imgE = document.querySelector('[data-ajo-part="exp"]');

    if (img1 && o1) img1.src = bust(resolveToUrl(o1));
    if (img2 && o2) img2.src = bust(resolveToUrl(o2));
    if (imgE && ex) imgE.src = bust(resolveToUrl(ex));

    setChromeBackground(o1);

    if (data.stitchOverlapPx != null && data.stitchOverlapPx !== '') {
      setCssVar('--ajo-stitch-overlap', data.stitchOverlapPx + (String(data.stitchOverlapPx).indexOf('px') >= 0 ? '' : 'px'));
    }
    if (data.clipTop != null && data.clipTop !== '') {
      var ct = String(data.clipTop).trim();
      setCssVar('--ajo-clip-top', ct.indexOf('%') >= 0 || ct.indexOf('px') >= 0 ? ct : ct + '%');
    }
    if (data.clipLeft != null && data.clipLeft !== '') {
      var cl = String(data.clipLeft).trim();
      setCssVar('--ajo-clip-left', cl.indexOf('%') >= 0 || cl.indexOf('px') >= 0 ? cl : cl + '%');
    }
  };

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
