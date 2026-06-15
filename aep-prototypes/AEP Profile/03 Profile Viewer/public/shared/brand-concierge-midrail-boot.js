/**
 * Boot Brand Concierge mid-rail display-mode panel for site-clone env bar demos.
 */
(function attachBrandConciergeMidrailBoot(global) {
  'use strict';

  var booted = false;

  function isBcFeatureEnabled(cfg) {
    return !(cfg && cfg.features && cfg.features.bc === false);
  }

  function boot(cfg) {
    cfg = cfg || global.envBarConfig || {};
    if (!isBcFeatureEnabled(cfg)) return null;
    if (
      !global.BrandConciergeMidrailPanel ||
      typeof global.BrandConciergeMidrailPanel.init !== 'function'
    ) {
      return null;
    }

    var handle = global.BrandConciergeMidrailPanel.init({
      isEnabled: function () {
        var modes = [
          'siteCloneBcFullScreenToggle',
          'siteCloneBcModalToggle',
          'siteCloneBcInjectedToggle',
          'siteCloneBcBottomDockToggle',
          'siteCloneBcModalBarToggle',
        ];
        var i;
        for (i = 0; i < modes.length; i++) {
          var el = document.getElementById(modes[i]);
          if (el && el.checked) return true;
        }
        return false;
      },
    });
    booted = true;
    return handle;
  }

  global.BrandConciergeMidrailBoot = { boot: boot };

  function scheduleBoot() {
    boot(global.envBarConfig || {});
  }

  global.addEventListener('aep-demo-env-strip-mounted', scheduleBoot);
  global.addEventListener('aep-demo-tags-injected', scheduleBoot);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleBoot);
  } else if (!booted) {
    scheduleBoot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
