/**
 * Arm journey pages — redirect standalone loads to the lab shell (env bar + profile drawer).
 * Skipped inside armcom-demo.html / armcom-mobile-demo.html iframes.
 */
(function (global) {
  'use strict';

  var LOG = '[armcom-lab]';

  if (global.__armcomJourneyChromeRan) return;
  global.__armcomJourneyChromeRan = true;

  function logInfo(msg, detail) {
    if (typeof global.console === 'undefined' || !global.console.info) return;
    if (detail !== undefined) global.console.info(LOG, msg, detail);
    else global.console.info(LOG, msg);
  }

  function logWarn(msg, detail) {
    if (typeof global.console === 'undefined' || !global.console.warn) return;
    if (detail !== undefined) global.console.warn(LOG, msg, detail);
    else global.console.warn(LOG, msg);
  }

  function detectProfileViewerBase() {
    var path = String(global.location.pathname || '');
    if (path.indexOf('/profile-viewer/') >= 0) return '/profile-viewer/';
    return '/';
  }

  function journeyRelativeFromPathname() {
    var path = String(global.location.pathname || '');
    var marker = '/demos/armcom/';
    var idx = path.indexOf(marker);
    if (idx === -1) return '';
    return path.slice(idx + marker.length);
  }

  function inLabShellIframe() {
    try {
      if (global.top === global.self) return false;
      var topPath = String(global.top.location.pathname || '');
      return /armcom-demo\.html$/i.test(topPath) || /armcom-mobile-demo\.html$/i.test(topPath);
    } catch (_e) {
      return true;
    }
  }

  function buildShellRedirectUrl(rel) {
    var base = detectProfileViewerBase();
    if (rel.indexOf('mobile/') === 0) {
      return base + 'armcom-mobile-demo.html';
    }
    return base + 'armcom-demo.html?frame=' + encodeURIComponent(rel);
  }

  var rel = journeyRelativeFromPathname();
  if (!rel) {
    logWarn('journey chrome skipped — path is not under /demos/armcom/');
    return;
  }

  if (inLabShellIframe()) {
    logInfo('journey page running inside lab shell iframe', { page: rel });
    return;
  }

  try {
    if (new URLSearchParams(global.location.search).get('aepNoShellRedirect') === '1') {
      logWarn('aepNoShellRedirect=1 — direct URL without env bar or profile drawer', { page: rel });
      return;
    }
  } catch (_e) {
    /* noop */
  }

  var target = buildShellRedirectUrl(rel);
  logWarn('direct journey URL — redirecting to lab shell for env bar and profile drawer', {
    from: global.location.href,
    to: target,
    page: rel,
  });
  global.location.replace(target);
})(typeof window !== 'undefined' ? window : globalThis);
