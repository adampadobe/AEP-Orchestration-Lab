/**
 * Sky mobile demo — env bar outside simulator, iframes the responsive web
 * journey (sky-demo.html?aepSimMobile=1) inside the phone bezel. Sky has no
 * dedicated lab-core module (unlike Etihad/KSIA), so Tags injection runs
 * through the generic env-bar site-clone-shell path already used on
 * sky-demo.html — no per-brand boot-lab wiring needed here.
 */
(function initSkyMobileShell() {
  if (typeof MobileDemoConfigs === 'undefined' || typeof MobileDemoShell === 'undefined') return;
  var config = window.mobileDemoConfig || MobileDemoConfigs.getPageConfig('sky');
  MobileDemoShell.init({ config: config, storageKeyPrefix: 'skyMobile' });
})();

(function initSkyMobileFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('sky-mobile-demo-page')) return;
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
