/**
 * Etihad mobile demo — env bar outside simulator, postMessage bridge to nested site frame.
 */
var etihadMobileFrame = document.getElementById('etihadMobileFrame');

var etihadLab = null;
var etihadLabBootStarted = false;

function bootEtihadMobileLab() {
  if (etihadLabBootStarted && etihadLab) return;
  if (typeof window.initEtihadLab !== 'function') return;
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootEtihadMobileLab();
        }
      });
    }
    return;
  }
  etihadLabBootStarted = true;
  etihadLab = window.initEtihadLab({
    iframeIds: ['etihadMobileFrame'],
    siteFrameId: null,
    shellFrameId: 'etihadMobileFrame',
    mobileChannel: true,
    profileOpenClass: 'etihad-mobile-demo-page--profile-open',
    viewName: 'Etihad mobile demo',
  });
}

function whenEnvBarReady(run) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(run).catch(function (err) {
      console.warn('[etihad-mobile-demo] envBar.ready failed', err);
      run();
    });
  } else {
    run();
  }
}

whenEnvBarReady(bootEtihadMobileLab);

window.addEventListener('message', function (ev) {
  if (!etihadMobileFrame || !etihadMobileFrame.contentWindow || ev.source !== etihadMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'etihad-airline-lab') return;
  if (etihadLab && typeof etihadLab.handleAirlineLabMessage === 'function') {
    void etihadLab.handleAirlineLabMessage(ev.data);
  }
});

window.addEventListener('message', function (ev) {
  if (!etihadMobileFrame || !etihadMobileFrame.contentWindow) return;
  if (ev.source !== etihadMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'etihad-demo-shell') return;
  /* Shell responses are handled inside the iframe; no parent action needed. */
});

(function initEtihadMobileShell() {
  if (typeof MobileDemoConfigs === 'undefined' || typeof MobileDemoShell === 'undefined') return;
  var config = window.mobileDemoConfig || MobileDemoConfigs.getPageConfig('etihad');
  MobileDemoShell.init({ config: config, storageKeyPrefix: 'etihadMobile' });
})();

(function initEtihadMobileFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('etihad-mobile-demo-page')) return;
  var sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;
  var mq = window.matchMedia('(max-width: 768px)');
  var hideTimer = null;
  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
  function setFlyoutOpen(open) {
    body.classList.toggle('mobile-demo-shell-page--nav-open', open);
  }
  function scheduleClose() {
    clearHideTimer();
    hideTimer = setTimeout(function () {
      setFlyoutOpen(false);
    }, 450);
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
  document.addEventListener(
    'mousemove',
    function (e) {
      if (mq.matches) return;
      if (e.clientX <= 24) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      var r = sidebar.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      if (body.classList.contains('mobile-demo-shell-page--nav-open')) scheduleClose();
    },
    { passive: true },
  );
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('mobile-demo-shell-page--nav-open');
  });
  setFlyoutOpen(false);
})();
