/**
 * Arm journey presenter — flyout lab nav + journey slide sync to armcom-demo.
 */
(function initArmJourneyPresenter() {
  var JOURNEY_SLIDE_KEY = 'armcomJourneySlideIndex';
  var journeyFrame = document.querySelector('.arm-journey-presenter-frame');

  function persistJourneySlide(slideIndex) {
    try {
      sessionStorage.setItem(JOURNEY_SLIDE_KEY, String(slideIndex));
    } catch (_e) {
      /* noop */
    }
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'armcom-journey' || ev.data.type !== 'armcom-journey-slide') return;
    if (journeyFrame && ev.source !== journeyFrame.contentWindow) return;
    persistJourneySlide(ev.data.slideIndex);
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(ev.data, window.location.origin);
      }
    } catch (_e) {
      /* noop */
    }
  });

  var body = document.body;
  if (!body.classList.contains('arm-journey-presenter-page')) return;
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
    body.classList.toggle('arm-journey-presenter-page--nav-open', open);
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
      if (body.classList.contains('arm-journey-presenter-page--nav-open')) scheduleClose();
    },
    { passive: true },
  );
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('arm-journey-presenter-page--nav-open');
  });
})();
