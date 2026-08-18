/**
 * Env bar: waits for shared/env-bar.js before Tags injection.
 * When loaded inside the mobile phone-simulator (?aepSimMobile=1), just bridges
 * postMessage traffic between the parent shell and the nested tui/tui-site.html frame.
 */
(function (global) {
  'use strict';
  var isSimMobile = /\baepSimMobile=1\b/.test(String(global.location && global.location.search || ''));

  function runSimMobileBridge() {
    var tuiSiteFrame = document.getElementById('tuiSiteFrame');
    if (!tuiSiteFrame) return;

    global.addEventListener('message', function (ev) {
      if (ev.source === global.parent && ev.data && ev.data.source === 'tui-demo-shell') {
        if (tuiSiteFrame.contentWindow) {
          tuiSiteFrame.contentWindow.postMessage(ev.data, '*');
        }
        return;
      }
      if (!tuiSiteFrame.contentWindow || ev.source !== tuiSiteFrame.contentWindow) return;
      if (!ev.data || ev.data.source !== 'tui-lab') return;
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(ev.data, '*');
      }
    });
  }

  function bootTuiLab() {
    if (typeof global.initTuiLab !== 'function') return;
    if (typeof global.DemoTagsInjection === 'undefined') {
      if (global.envBar && typeof global.envBar.onChange === 'function') {
        global.envBar.onChange(function (detail) {
          if (detail && detail.type === 'init' && typeof global.DemoTagsInjection !== 'undefined') {
            bootTuiLab();
          }
        });
      }
      return;
    }
    global.initTuiLab({
      iframeIds: ['tuiSiteFrame'],
      siteFrameId: 'tuiSiteFrame',
      profileOpenClass: 'tui-demo-page--profile-open',
      viewName: 'TUI demo',
    });
  }

  function run() {
    if (isSimMobile) {
      runSimMobileBridge();
      return;
    }
    bootTuiLab();

    (function initTuiDemoFlyoutSidebar() {
      var body = document.body;
      if (!body.classList.contains('tui-demo-page')) return;
      var sidebar = document.querySelector('.dashboard-sidebar');
      if (!sidebar) return;

      var mq = global.matchMedia('(max-width: 768px)');
      var hideTimer = null;

      function clearHideTimer() {
        if (hideTimer) {
          global.clearTimeout(hideTimer);
          hideTimer = null;
        }
      }

      function setFlyoutOpen(open) {
        body.classList.toggle('tui-demo-page--nav-open', open);
      }

      function scheduleClose() {
        clearHideTimer();
        hideTimer = global.setTimeout(function () {
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
        if (body.classList.contains('tui-demo-page--nav-open')) {
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
        if (mq.matches) body.classList.remove('tui-demo-page--nav-open');
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
