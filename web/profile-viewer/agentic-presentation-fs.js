/**
 * Fullscreen presentation for Agentic architecture pages — same pattern as AEP & Apps:
 * <main class="dashboard-main app-page"> is the fullscreen element; sidebar and topbar stay outside.
 */
(function () {
  'use strict';

  /** Spectrum S2 enter/exit — same paths as `aep-fullscreen.js` LOGO_ENTER / LOGO_EXIT. */
  var FS_ICON_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM17.75,2.5h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  var FS_ICON_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM3.25,17h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

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
      btn.innerHTML = on ? FS_ICON_EXIT : FS_ICON_ENTER;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
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
