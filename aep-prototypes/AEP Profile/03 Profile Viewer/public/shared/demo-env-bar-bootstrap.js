/**
 * Unified env bar bootstrap for site-clone lab demos.
 * Call once from demo JS after demo-tags-injection.js + aep-demo-env-bar.js load.
 *
 * DemoTagsInjection.init still runs in demo JS and must pass hideTagsCompanyUi: true
 * (Tags company row stays hidden via shared CSS + auto-pick in demo-tags-injection.js).
 *
 * @see docs/demo-env-strip-standard.md
 */
(function attachLabDemoEnvBarBootstrap(global) {
  'use strict';

  var CACHE_BUST = '20260602-env-bar-bootstrap';

  /**
   * @param {object} [options]
   * @param {string} [options.prefix] — e.g. sky, premierInn, om, ferrariworld; derives standard element ids
   * @param {string} [options.storagePrefix] — SiteCloneDemoEnv storage prefix (default from DemoEnvStrip.siteCloneDemoEnvObject)
   * @param {string} [options.summaryId] — SDK config summary host (default `{prefix}SdkConfigSummary`)
   * @param {string} [options.fieldsId] — Tags fields host (default `{prefix}SdkConfigFields`)
   * @param {string} [options.selectedScriptCodeId] — hidden selected script (default `{prefix}SelectedScript`)
   * @param {string} [options.generatorTargetId='generatorTarget']
   * @param {string} [options.defaultBcStyle] — passed to DemoEnvStrip.mountSiteCloneTagsFields when remount needed
   * @param {object} [options.siteCloneDemoEnv] — merged into window.SiteCloneDemoEnv when prefix set
   * @param {boolean} [options.refreshSiteCloneBcEnv=true] — re-apply SiteCloneBcEnv after env bar init
   * @param {object} [options.envBar] — extra passthrough to AepDemoEnvStrip.initStandardEnvBar
   * @returns {{ stripMounted: boolean, envBarInited: boolean, siteCloneBcRefreshed: boolean }}
   */
  function initLabDemoEnvBar(options) {
    var opt = options || {};
    var prefix = String(opt.prefix || '').trim();
    var out = { stripMounted: false, envBarInited: false, siteCloneBcRefreshed: false };

    if (global.DemoEnvStrip) {
      if (typeof global.DemoEnvStrip.autoMount === 'function') {
        global.DemoEnvStrip.autoMount();
        out.stripMounted = true;
      }
      if (prefix && opt.defaultBcStyle && typeof global.DemoEnvStrip.mountSiteCloneTagsFields === 'function') {
        global.DemoEnvStrip.mountSiteCloneTagsFields({
          prefix: prefix,
          defaultBcStyle: opt.defaultBcStyle,
        });
        out.stripMounted = true;
      }
    }

    if (prefix) {
      var baseEnv =
        global.DemoEnvStrip && typeof global.DemoEnvStrip.siteCloneDemoEnvObject === 'function'
          ? global.DemoEnvStrip.siteCloneDemoEnvObject(prefix, opt.storagePrefix)
          : null;
      if (baseEnv) {
        global.SiteCloneDemoEnv = Object.assign({}, baseEnv, global.SiteCloneDemoEnv || {}, opt.siteCloneDemoEnv || {});
      } else if (opt.siteCloneDemoEnv) {
        global.SiteCloneDemoEnv = Object.assign({}, global.SiteCloneDemoEnv || {}, opt.siteCloneDemoEnv);
      }
    } else if (opt.siteCloneDemoEnv) {
      global.SiteCloneDemoEnv = Object.assign({}, global.SiteCloneDemoEnv || {}, opt.siteCloneDemoEnv);
    }

    if (global.AepDemoEnvStrip && typeof global.AepDemoEnvStrip.initStandardEnvBar === 'function') {
      initCompactDropdown();

      var envBarExtra = opt.envBar && typeof opt.envBar === 'object' ? opt.envBar : {};
      var envBarCfg = Object.assign(
        {
          summaryId: opt.summaryId || (prefix ? prefix + 'SdkConfigSummary' : undefined),
          fieldsId: opt.fieldsId || (prefix ? prefix + 'SdkConfigFields' : undefined),
          selectedScriptCodeId:
            opt.selectedScriptCodeId || (prefix ? prefix + 'SelectedScript' : undefined),
          sandboxSelectId: opt.sandboxSelectId || 'sandboxSelect',
          prefix: prefix || undefined,
          envSectionId: opt.envSectionId,
          envEditorId: opt.envEditorId,
          envCollapsibleGridId: opt.envCollapsibleGridId,
          envCompactId: opt.envCompactId,
          envCompactTextId: opt.envCompactTextId,
          envExpandBtnId: opt.envExpandBtnId,
        },
        envBarExtra,
      );
      global.AepDemoEnvStrip.initStandardEnvBar(envBarCfg);
      out.envBarInited = true;
    }

    var refreshBc = opt.refreshSiteCloneBcEnv !== false;
    if (
      refreshBc &&
      global.SiteCloneBcEnv &&
      typeof global.SiteCloneBcEnv.applyForCurrentSandbox === 'function'
    ) {
      global.SiteCloneBcEnv.applyForCurrentSandbox();
      out.siteCloneBcRefreshed = true;
    }

    return out;
  }

  function detectBootstrapBasePath() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('shared/demo-env-bar-bootstrap.js') !== -1) {
        return src.slice(0, src.indexOf('shared/demo-env-bar-bootstrap.js'));
      }
    }
    return '';
  }

  function initCompactDropdown() {
    if (global.EnvBarCompact && typeof global.EnvBarCompact.init === 'function') {
      global.EnvBarCompact.init();
      return;
    }
    var base = detectBootstrapBasePath();
    var src = base + 'shared/env-bar-compact.js?v=20260612-env-overlay';
    if (document.querySelector('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.onload = function () {
      if (global.EnvBarCompact && typeof global.EnvBarCompact.init === 'function') {
        global.EnvBarCompact.init();
      }
    };
    (document.body || document.head).appendChild(script);
  }

  initLabDemoEnvBar.CACHE_BUST = CACHE_BUST;
  global.initLabDemoEnvBar = initLabDemoEnvBar;
})(typeof window !== 'undefined' ? window : globalThis);
