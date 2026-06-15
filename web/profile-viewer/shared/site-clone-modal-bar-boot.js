/**
 * Initialise right-side Brand Concierge modal bar for site-clone demos with BC enabled.
 */
(function (global) {
  'use strict';

  function cfg(page, key, fallback) {
    if (page && page[key] != null && String(page[key]).trim()) return String(page[key]).trim();
    return fallback;
  }

  function readPanelTitle() {
    var page = global.SiteCloneBcPage || {};
    var fromPage = cfg(page, 'modalBarPanelTitle', '');
    if (fromPage) return fromPage;
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    var title = mount ? mount.getAttribute('data-demo-env-strip-title') : '';
    if (title) return 'Ask';
    return 'Ask';
  }

  function readDisclaimer() {
    var page = global.SiteCloneBcPage || {};
    if (page.modalBarDisclaimer) return String(page.modalBarDisclaimer).trim();
    return (
      'Use of this beta AI chatbot is subject to Adobe\'s Privacy Policy. Don\'t share sensitive data. ' +
      'AI responses are not your Content, may be inaccurate, and any offers provided are non-binding.'
    );
  }

  function wireBodyClass() {
    var toggle = document.getElementById('siteCloneBcModalBarToggle');
    if (!toggle || toggle.dataset.modalBarBodyBound === '1') return;
    toggle.dataset.modalBarBodyBound = '1';
    var page = global.SiteCloneBcPage || {};
    var bodyClass = cfg(page, 'modalBarBodyClass', 'site-clone-bc-modal-bar-armed');
    var sync = function () {
      if (bodyClass) document.body.classList.toggle(bodyClass, !!toggle.checked);
    };
    toggle.addEventListener('change', sync);
    sync();
  }

  function boot() {
    if (typeof global.BrandConciergeModalBar === 'undefined' || typeof global.BrandConciergeModalBar.init !== 'function') {
      return { booted: false, reason: 'modal-bar-module-missing' };
    }
    if (document.getElementById('bcModalBarRoot')) {
      wireBodyClass();
      return { booted: true, alreadyPresent: true };
    }

    var page = global.SiteCloneBcPage || {};
    global.BrandConciergeModalBar.init({
      panelTitle: readPanelTitle(),
      pillLabel: cfg(page, 'modalBarPillLabel', 'Ask a question'),
      disclaimer: readDisclaimer(),
      betaLabel: cfg(page, 'modalBarBetaLabel', 'BETA'),
      mountSelector: cfg(page, 'modalBarMountSelector', '#bcModalBarMount'),
      onExpand: function () {
        if (global.SiteCloneBc && typeof global.SiteCloneBc.sync === 'function') {
          void global.SiteCloneBc.sync();
        }
      },
    });
    wireBodyClass();
    return { booted: true };
  }

  global.SiteCloneModalBarBoot = { boot: boot };

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
