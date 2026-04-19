/**
 * Fullscreen presentation for Agentic architecture pages — same pattern as AEP & Apps:
 * <main class="dashboard-main app-page"> is the fullscreen element; sidebar and topbar stay outside.
 */
(function () {
  'use strict';

  function qs(sel) {
    return document.querySelector(sel);
  }

  function isPresentationFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function syncPresentationFs(btn, mainEl) {
    var on = isPresentationFullscreen();
    if (mainEl) mainEl.classList.toggle('arch-main--presentation-fs', on);
    if (btn) {
      btn.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute(
        'title',
        on
          ? 'Leave fullscreen (or press Esc).'
          : 'Fill the screen with the diagram (hides site menu and page title). Press Esc to exit.'
      );
    }
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e) {}
  }

  function enterPresentationFs(mainEl) {
    if (!mainEl) return;
    var req =
      mainEl.requestFullscreen ||
      mainEl.webkitRequestFullscreen ||
      mainEl.mozRequestFullScreen ||
      mainEl.msRequestFullscreen;
    if (!req) return;
    var p = req.call(mainEl);
    if (p && typeof p.catch === 'function') {
      p.catch(function () {});
    }
  }

  function exitPresentationFs() {
    if (!isPresentationFullscreen()) return;
    var ex =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.webkitCancelFullScreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;
    if (!ex) return;
    var p = ex.call(document);
    if (p && typeof p.catch === 'function') {
      p.catch(function () {});
    }
  }

  function init() {
    var btn = qs('#agenticPresentationFullscreenBtn');
    var mainEl = qs('main.dashboard-main.app-page');
    if (!btn || !mainEl) return;
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      if (isPresentationFullscreen()) exitPresentationFs();
      else enterPresentationFs(mainEl);
    });
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        syncPresentationFs(btn, mainEl);
      });
    });
    syncPresentationFs(btn, mainEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
