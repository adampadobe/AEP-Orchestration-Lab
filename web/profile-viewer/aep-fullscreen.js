/**
 * Global full-screen toggle button.
 *
 * Injects an icon-only button into `.dashboard-topbar-right` on every dashboard
 * page EXCEPT the home page (body.home-page) and the global-settings page
 * (pathname /global-settings.html). Uses Spectrum S2 full-screen / exit icons.
 *
 * Target: document.documentElement — the whole viewport goes full-screen.
 */
(function (global) {
  'use strict';

  var LOGO_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM17.75,2.5h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  var LOGO_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM3.25,17h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  function shouldSkip(doc) {
    var body = doc && doc.body;
    if (body && body.classList && body.classList.contains('home-page')) return true;
    var p = (global.location && global.location.pathname) || '';
    if (/\/home\.html?$/i.test(p)) return true;
    if (/\/global-settings\.html?$/i.test(p)) return true;
    return false;
  }

  function getFsEl() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function requestFs(el) {
    if (!el) return Promise.reject(new Error('No element.'));
    if (typeof el.requestFullscreen === 'function') return el.requestFullscreen();
    if (typeof el.webkitRequestFullscreen === 'function') return el.webkitRequestFullscreen();
    if (typeof el.msRequestFullscreen === 'function') return el.msRequestFullscreen();
    return Promise.reject(new Error('Full screen is not supported in this browser.'));
  }

  function exitFs() {
    if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
    if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
    if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
    return Promise.reject(new Error('Unable to exit full screen.'));
  }

  function syncBtn(btn) {
    if (!btn) return;
    var active = !!getFsEl();
    btn.innerHTML = active ? LOGO_EXIT : LOGO_ENTER;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    var label = active ? 'Exit full screen' : 'Enter full screen';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  function toggle(btn) {
    var target = document.documentElement;
    var p = getFsEl() ? exitFs() : requestFs(target);
    Promise.resolve(p).catch(function () { /* browser may reject if no user gesture */ })
      .finally(function () { syncBtn(btn); });
  }

  function injectButton() {
    var doc = global.document;
    if (shouldSkip(doc)) return;
    var right = doc.querySelector('.dashboard-topbar .dashboard-topbar-right');
    if (!right) return;
    if (right.querySelector('[data-aep-fullscreen-btn]')) return;
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-topbar-icon aep-fullscreen-btn';
    btn.setAttribute('data-aep-fullscreen-btn', '1');
    right.insertBefore(btn, right.firstChild);
    syncBtn(btn);
    btn.addEventListener('click', function () { toggle(btn); });
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function (evt) {
      doc.addEventListener(evt, function () { syncBtn(btn); });
    });
  }

  function init() {
    injectButton();
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
