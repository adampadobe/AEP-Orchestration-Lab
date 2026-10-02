/**
 * Initialise centre-bottom Brand Concierge dock for any site-clone shell with
 * data-demo-env-strip-bc-bottom="1". Reads titles from SiteCloneBcPage / env strip.
 */
(function (global) {
  'use strict';

  function cfg(page, key, fallback) {
    if (page && page[key] != null && String(page[key]).trim()) return String(page[key]).trim();
    return fallback;
  }

  function isMobileBcAdapter() {
    return (
      global.MobileBcBoot &&
      typeof global.MobileBcBoot.isMobileAdapter === 'function' &&
      global.MobileBcBoot.isMobileAdapter()
    );
  }

  function hasBottomDockFeature() {
    return !!document.querySelector('[data-demo-env-strip-bc-bottom="1"]');
  }

  function readPanelTitle() {
    var page = global.SiteCloneBcPage || {};
    var fromPage = cfg(page, 'bottomDockPanelTitle', '');
    if (fromPage) return fromPage;
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    var title = mount ? mount.getAttribute('data-demo-env-strip-title') : '';
    if (title) return title.replace(/\s*\(web\)\s*$/i, '').trim() + ' assistant';
    return 'Assistant';
  }

  function wireBottomDockBodyClass() {
    if (isMobileBcAdapter()) return;
    var toggle = document.getElementById('siteCloneBcBottomDockToggle');
    if (!toggle || toggle.dataset.bottomDockBodyBound === '1') return;
    toggle.dataset.bottomDockBodyBound = '1';
    var page = global.SiteCloneBcPage || {};
    var bodyClass = cfg(page, 'bottomDockBodyClass', 'site-clone-bc-bottom-dock-armed');
    var sync = function () {
      if (bodyClass) document.body.classList.toggle(bodyClass, !!toggle.checked);
    };
    toggle.addEventListener('change', sync);
    sync();
  }

  function boot() {
    if (isMobileBcAdapter()) return { booted: false, reason: 'mobile-adapter' };
    if (!hasBottomDockFeature()) return { booted: false, reason: 'no-bc-bottom-flag' };
    if (typeof global.BrandConciergeBottomDock === 'undefined' || typeof global.BrandConciergeBottomDock.init !== 'function') {
      return { booted: false, reason: 'dock-module-missing' };
    }
    if (document.getElementById('bcBottomDockRoot')) {
      wireBottomDockBodyClass();
      return { booted: true, alreadyPresent: true };
    }

    var page = global.SiteCloneBcPage || {};
    global.BrandConciergeBottomDock.init({
      ctaLabel: cfg(page, 'bottomDockCtaLabel', cfg(page, 'bottomDockCta', 'ASK')),
      panelTitle: readPanelTitle(),
      placeholder: cfg(page, 'bottomDockPlaceholder', 'Ask a question…'),
      disclaimer: cfg(page, 'bottomDockDisclaimer', ''),
      betaLabel: cfg(page, 'bottomDockBetaLabel', 'BETA'),
      mountSelector: cfg(page, 'bottomDockMountSelector', '#bcBottomDockMount'),
      onExpand: function () {
        if (isMobileBcAdapter()) {
          if (global.MobileBcBoot && typeof global.MobileBcBoot.sync === 'function') {
            void global.MobileBcBoot.sync();
          }
          return;
        }
        if (global.SiteCloneBc && typeof global.SiteCloneBc.sync === 'function') {
          void global.SiteCloneBc.sync();
        }
      },
    });
    wireBottomDockBodyClass();
    return { booted: true };
  }

  global.SiteCloneBottomDockBoot = { boot: boot };

  function scheduleBoot() {
    boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleBoot);
  } else {
    scheduleBoot();
  }

  global.addEventListener('aep-demo-env-strip-mounted', scheduleBoot);
})(typeof window !== 'undefined' ? window : globalThis);
