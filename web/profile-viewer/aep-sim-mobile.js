/**
 * Loaded on pages that include this script — exposes mobile-simulator flags for generator payloads.
 * When ?aepSimMobile=1, also rewrites same-origin links so navigation stays in simulator mode.
 */
(function (global) {
  function isAepSimMobileMode() {
    try {
      if (global.location && /\baepSimMobile=1\b/.test(String(global.location.search || ''))) return true;
      var root = global.document && global.document.documentElement;
      if (root && root.classList && root.classList.contains('aep-sim-mobile')) return true;
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  /** @type {{ isActive: () => boolean, experienceChannel: () => string, applicationLoginEventType: () => string }} */
  global.AepSimMobile = {
    isActive: isAepSimMobileMode,
    experienceChannel: function () {
      return isAepSimMobileMode() ? 'Mobile' : 'Web';
    },
    applicationLoginEventType: function () {
      return isAepSimMobileMode() ? 'mobile.logon' : 'application.login';
    },
  };

  if (!isAepSimMobileMode()) return;

  function shouldRewriteHref(url, pathname) {
    if (!pathname || pathname === '/') return false;
    const lower = pathname.toLowerCase();
    if (lower.endsWith('.html')) return true;
    if (lower.endsWith('/') && pathname !== '/') return true;
    return false;
  }

  function rewriteLinks() {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
      if (a.getAttribute('download') != null) return;
      try {
        var abs = new URL(href, location.href);
        if (abs.origin !== location.origin) return;
        if (!shouldRewriteHref(abs, abs.pathname)) return;
        abs.searchParams.set('aepSimMobile', '1');
        var next = abs.pathname + abs.search + abs.hash;
        if (a.getAttribute('href') !== next) a.setAttribute('href', next);
      } catch (_) {
        /* ignore */
      }
    });

    document.querySelectorAll('form[action]').forEach(function (form) {
      var act = form.getAttribute('action');
      if (!act || act.charAt(0) === '#') return;
      try {
        var abs = new URL(act, location.href);
        if (abs.origin !== location.origin) return;
        abs.searchParams.set('aepSimMobile', '1');
        form.setAttribute('action', abs.pathname + abs.search + abs.hash);
      } catch (_) {
        /* ignore */
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewriteLinks);
  } else {
    rewriteLinks();
  }
})(typeof window !== 'undefined' ? window : globalThis);
