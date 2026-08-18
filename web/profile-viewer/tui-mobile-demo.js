/**
 * TUI mobile demo — env bar outside simulator, postMessage bridge to nested site frame.
 */
var tuiMobileFrame = document.getElementById('tuiMobileFrame');

var tuiLab = null;
var tuiLabBootStarted = false;

function bootTuiMobileLab() {
  if (tuiLabBootStarted && tuiLab) return;
  if (typeof window.initTuiLab !== 'function') return;
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootTuiMobileLab();
        }
      });
    }
    return;
  }
  tuiLabBootStarted = true;
  tuiLab = window.initTuiLab({
    iframeIds: ['tuiMobileFrame'],
    siteFrameId: null,
    shellFrameId: 'tuiMobileFrame',
    mobileChannel: true,
    profileOpenClass: 'tui-mobile-demo-page--profile-open',
    viewName: 'TUI mobile demo',
  });
}

function whenEnvBarReady(run) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(run).catch(function (err) {
      console.warn('[tui-mobile-demo] envBar.ready failed', err);
      run();
    });
  } else {
    run();
  }
}

whenEnvBarReady(bootTuiMobileLab);

window.addEventListener('message', function (ev) {
  if (!tuiMobileFrame || !tuiMobileFrame.contentWindow || ev.source !== tuiMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'tui-lab') return;
  if (tuiLab && typeof tuiLab.handleAirlineLabMessage === 'function') {
    void tuiLab.handleAirlineLabMessage(ev.data);
  }
});

window.addEventListener('message', function (ev) {
  if (!tuiMobileFrame || !tuiMobileFrame.contentWindow) return;
  if (ev.source !== tuiMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'tui-demo-shell') return;
  /* Shell responses are handled inside the iframe; no parent action needed. */
});

(function initTuiMobileShell() {
  if (typeof MobileDemoConfigs === 'undefined' || typeof MobileDemoShell === 'undefined') return;
  var config = window.mobileDemoConfig || MobileDemoConfigs.getPageConfig('tui');
  MobileDemoShell.init({ config: config, storageKeyPrefix: 'tuiMobile' });
})();

(function initTuiMobileFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('tui-mobile-demo-page')) return;
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
