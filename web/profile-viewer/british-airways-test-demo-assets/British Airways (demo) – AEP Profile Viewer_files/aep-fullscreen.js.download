/**
 * Global full-screen toggle button.
 *
 * Injects an icon-only button into `.lab-env-toolbar__actions` on site-clone demos
 * (left of the hide-environment-bar control). Falls back to dashboard topbar or
 * mid-rail only when the spectrum toolbar is not present yet.
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
    if (body && body.classList && (
      body.classList.contains('arm-journey-presenter-page') ||
      body.classList.contains('mobile-demo-shell-page') ||
      body.classList.contains('mobile-demo-page')
    )) return true;
    if (doc && doc.getElementById('mobileDemoFsRoot')) return true;
    var p = (global.location && global.location.pathname) || '';
    if (/\/home\.html?$/i.test(p)) return true;
    if (/\/global-settings\.html?$/i.test(p)) return true;
    if (/-mobile-demo\.html?$/i.test(p)) return true;
    if (/\/mobile-demo(?:-apalmer)?\.html?$/i.test(p)) return true;
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

  function findToolbarInsertPoint(doc) {
    var dockBtn = doc.getElementById('aepLabEnvDockToolbarBtn');
    if (dockBtn && dockBtn.parentNode) return { parent: dockBtn.parentNode, before: dockBtn };
    var toolbarActions = doc.querySelector('.lab-env-toolbar__actions');
    if (toolbarActions) return { parent: toolbarActions, before: toolbarActions.firstChild };
    return null;
  }

  function mountIntoToolbar(btn, doc) {
    var point = findToolbarInsertPoint(doc);
    if (!point) return false;
    btn.className = 'spectrum-env-icon-btn lab-env-fullscreen-btn aep-fullscreen-btn';
    point.parent.insertBefore(btn, point.before || null);
    return true;
  }

  function relocateMidrailButton(doc) {
    var btn = doc.querySelector('[data-aep-fullscreen-btn].aep-fullscreen-btn--midrail');
    if (!btn) return false;
    btn.classList.remove('aep-fullscreen-btn--midrail', 'aep-fullscreen-btn--floating');
    return mountIntoToolbar(btn, doc);
  }

  function injectButton() {
    var doc = global.document;
    if (shouldSkip(doc)) return;
    if (relocateMidrailButton(doc)) return;
    if (doc.querySelector('[data-aep-fullscreen-btn]')) return;

    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-aep-fullscreen-btn', '1');

    if (mountIntoToolbar(btn, doc)) {
      /* mounted in spectrum env toolbar */
    } else {
      var right = doc.querySelector('.dashboard-topbar .dashboard-topbar-right');
      if (right) {
        btn.className = 'dashboard-topbar-icon aep-fullscreen-btn';
        right.insertBefore(btn, right.firstChild);
      } else {
        var topbar = doc.querySelector('.dashboard-topbar');
        if (topbar) {
          btn.className = 'dashboard-topbar-icon aep-fullscreen-btn';
          topbar.appendChild(btn);
        } else if (doc.body && doc.body.classList.contains('home-dashboard-concierge')) {
          btn.className = 'aep-fullscreen-btn aep-fullscreen-btn--midrail';
          (doc.body || doc.documentElement).appendChild(btn);
        } else {
          btn.className = 'aep-fullscreen-btn aep-fullscreen-btn--floating';
          (doc.body || doc.documentElement).appendChild(btn);
        }
      }
    }
    syncBtn(btn);
    btn.addEventListener('click', function () { toggle(btn); });
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function (evt) {
      doc.addEventListener(evt, function () { syncBtn(btn); });
    });
  }

  function init() {
    injectButton();
  }

  function scheduleRetries() {
    window.setTimeout(injectButton, 0);
    window.setTimeout(injectButton, 400);
    window.setTimeout(injectButton, 1500);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.addEventListener('env-bar-change', scheduleRetries);
  global.addEventListener('aep-demo-env-strip-mounted', scheduleRetries);
})(typeof window !== 'undefined' ? window : this);
