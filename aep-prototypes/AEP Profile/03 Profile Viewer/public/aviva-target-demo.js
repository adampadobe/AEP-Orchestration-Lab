/**
 * Aviva Target lab shell — waits for shared/env-bar.js before lab init.
 */
(function (global) {
  'use strict';
  function run() {
    /**
     * Aviva Target lab — saved Aviva journey in iframe + Tags / Web SDK injection for Target A/B.
     */
    const avivaTargetFrame = document.getElementById('avivaTargetFrame');

    const AVIVA_JOURNEY_MARKER = '/demos/aviva-target/';

    function avivaJourneyRelativeFromPathname(pathname) {
      const path = String(pathname || '');
      const idx = path.toLowerCase().indexOf(AVIVA_JOURNEY_MARKER);
      if (idx === -1) return '';
      return path.slice(idx + AVIVA_JOURNEY_MARKER.length);
    }

    function syncIframeToJourneyUrl() {
      if (!avivaTargetFrame) return;
      const rel = avivaJourneyRelativeFromPathname(window.location.pathname);
      if (rel) {
        avivaTargetFrame.src = 'demos/aviva-target/' + rel.replace(/^\//, '');
        return;
      }
      if (/aviva-target-demo\.html$/i.test(window.location.pathname)) {
        avivaTargetFrame.src = 'demos/aviva-target/index.html';
      }
    }

    if (typeof window.initAvivaTargetLab === 'function') {
      window.initAvivaTargetLab({ iframeIds: ['avivaTargetFrame'] });
    }

    window.addEventListener('popstate', syncIframeToJourneyUrl);

    (function initAvivaTargetDemoFlyoutSidebar() {
      const body = document.body;
      if (!body.classList.contains('aviva-target-demo-page')) return;
      const sidebar = document.querySelector('.dashboard-sidebar');
      if (!sidebar) return;

      const mq = window.matchMedia('(max-width: 768px)');
      let hideTimer = null;

      function clearHideTimer() {
        if (hideTimer) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
      }

      function setFlyoutOpen(open) {
        body.classList.toggle('aviva-target-demo-page--nav-open', open);
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
        const r = sidebar.getBoundingClientRect();
        const over =
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (over) {
          clearHideTimer();
          setFlyoutOpen(true);
          return;
        }
        if (body.classList.contains('aviva-target-demo-page--nav-open')) {
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
        if (mq.matches) body.classList.remove('aviva-target-demo-page--nav-open');
      });

      setFlyoutOpen(false);
    })();

  }

if (global.envBar && typeof global.envBar.ready === 'function') {
  global.envBar.ready().then(function () {
    run();
  });
} else {
  run();
}
})(typeof window !== 'undefined' ? window : globalThis);
