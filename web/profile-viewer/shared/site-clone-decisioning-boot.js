/**
 * Site-clone decisioning boot — auto-detect iframe + init DecisioningProfileRuntime + panel.
 * Loaded by shared/env-bar.js when features.decisioning is enabled (shell / journey modes).
 */
(function attachSiteCloneDecisioningBoot(global) {
  'use strict';

  var bootResult = null;
  var syncFn = null;

  /** Prefix → site iframe id when it does not match {prefix}SiteFrame. */
  var IFRAME_ID_BY_PREFIX = {
    sky: 'skyDemoSiteFrame',
    jlr: 'jlrDemoSiteFrame',
    mod: 'siteCloneDemoSiteFrame',
    navigator: 'navigatorDemoSiteFrame',
    premierInn: 'premierInnSiteFrame',
    avivaTarget: 'avivaTargetFrame',
    ksia: 'ksiaSiteFrame',
    etihad: 'etihadSiteFrame',
    admiral: 'admiralSiteFrame',
    saga: 'sagaSiteFrame',
  };

  function isDecisioningEnabled() {
    var toggle = document.getElementById('siteCloneDecisioningEnabledToggle');
    return !!(toggle && toggle.checked);
  }

  function stripUrlQueryHash(raw) {
    return String(raw || '')
      .trim()
      .split('#')[0]
      .split('?')[0];
  }

  /**
   * Resolve same-origin iframe journey URL for AJO surfaces (shell pathname ≠ iframe path).
   * @param {string} iframeId
   * @returns {function(): string}
   */
  function buildIframeTargetPageUrlResolver(iframeId) {
    return function resolveIframeTargetPageUrl() {
      var frame = document.getElementById(iframeId);
      if (!frame) return '';
      try {
        var win = frame.contentWindow;
        if (win && win.location && win.location.href) {
          return stripUrlQueryHash(win.location.href);
        }
      } catch (_e) {}
      var src = frame.getAttribute('src');
      if (!src) return '';
      try {
        return stripUrlQueryHash(new URL(src, global.location && global.location.href ? global.location.href : undefined).href);
      } catch (_e2) {
        return '';
      }
    };
  }

  function stripTitleForPrefix(prefix) {
    var mount =
      document.querySelector('[data-demo-env-strip-prefix="' + prefix + '"]') ||
      document.querySelector('[data-demo-env-strip-mount]');
    if (!mount) return '';
    return String(mount.getAttribute('data-demo-env-strip-title') || '').trim();
  }

  /**
   * Resolve iframe id from explicit config, SiteCloneBcPage, iframeIds, or naming conventions.
   * @param {object} cfg envBarConfig
   * @param {object} [explicit]
   * @returns {string}
   */
  function detectIframeId(cfg, explicit) {
    explicit = explicit || {};
    if (explicit.iframeId) return String(explicit.iframeId).trim();
    if (global.SiteCloneBcPage && global.SiteCloneBcPage.iframeId) {
      return String(global.SiteCloneBcPage.iframeId).trim();
    }
    if (Array.isArray(cfg.iframeIds) && cfg.iframeIds[0]) {
      return String(cfg.iframeIds[0]).trim();
    }
    var marked = document.querySelector('iframe[data-site-clone-frame]');
    if (marked && marked.id) return String(marked.id).trim();
    var labFrame = document.querySelector(
      'iframe.mod-demo-site-frame, iframe.aviva-target-demo-site-frame, iframe[class*="demo-site-frame"]',
    );
    if (labFrame && labFrame.id) return String(labFrame.id).trim();

    var prefix = String(cfg.prefix || '').trim();
    if (!prefix) return '';

    var candidates = [];
    if (IFRAME_ID_BY_PREFIX[prefix]) candidates.push(IFRAME_ID_BY_PREFIX[prefix]);
    candidates.push(prefix + 'SiteFrame');
    candidates.push(prefix + 'DemoSiteFrame');

    var i;
    for (i = 0; i < candidates.length; i++) {
      if (document.getElementById(candidates[i])) return candidates[i];
    }
    return '';
  }

  /**
   * @param {object} cfg
   * @param {object} explicit
   * @returns {string}
   */
  function detectMountLayoutPreset(cfg, explicit) {
    explicit = explicit || {};
    if (explicit.mountLayoutPreset) return String(explicit.mountLayoutPreset).trim();
    if (global.SiteCloneBcPage && global.SiteCloneBcPage.snapshotLayout === 'sky-home') return 'sky-home';
    if (String(cfg.prefix || '').trim() === 'sky') return 'sky-home';
    return 'generic';
  }

  /**
   * Merge auto-detected wiring with optional envBarConfig.decisioning overrides.
   * @param {object} cfg
   * @returns {object}
   */
  function resolveDecisioningWiring(cfg) {
    cfg = cfg || {};
    var explicit = cfg.decisioning && typeof cfg.decisioning === 'object' ? cfg.decisioning : {};
    var prefix = String(cfg.prefix || 'siteClone').trim();
    var iframeId = detectIframeId(cfg, explicit);
    var useParentDocument =
      explicit.useParentDocument === true || (!iframeId && explicit.useParentDocument !== false);

    return Object.assign(
      {
        iframeId: iframeId,
        useParentDocument: useParentDocument,
        mountLayoutPreset: detectMountLayoutPreset(cfg, explicit),
        viewName: explicit.viewName || stripTitleForPrefix(prefix) || prefix || 'Site clone demo',
        emailInputId: explicit.emailInputId || 'customerEmail',
        namespaceSelectId: explicit.namespaceSelectId || (prefix ? prefix + 'Ns' : 'siteCloneNs'),
      },
      explicit,
      {
        iframeId: iframeId,
        useParentDocument: useParentDocument,
        mountLayoutPreset: detectMountLayoutPreset(cfg, explicit),
      },
    );
  }

  async function syncFromProfileLookup() {
    if (typeof syncFn === 'function') {
      await syncFn();
    }
  }

  /**
   * After Tags stitch, refresh decisioning module from profile lookup.
   */
  function installStitchSyncHook() {
    if (!global.DemoTagsInjection || global.DemoTagsInjection.__siteCloneDecisioningSyncHooked) return;
    var origInit = global.DemoTagsInjection.init;
    if (typeof origInit !== 'function') return;

    global.DemoTagsInjection.init = function patchedDemoTagsInjectionInit(opts) {
      var instance = origInit.call(this, opts);
      if (instance && typeof instance.stitchAfterProfileLookup === 'function') {
        var origStitch = instance.stitchAfterProfileLookup.bind(instance);
        instance.stitchAfterProfileLookup = async function stitchWithDecisioningSync(profile, fallbackIdentifier) {
          var prefetch = null;
          try {
            var toggle = document.getElementById('siteCloneDecisioningEnabledToggle');
            if (
              toggle &&
              toggle.checked &&
              global.SiteCloneDecisioningBoot &&
              typeof global.SiteCloneDecisioningBoot.syncFromProfileLookup === 'function'
            ) {
              prefetch = global.SiteCloneDecisioningBoot.syncFromProfileLookup();
            }
          } catch (_prefetchErr) {
            /* noop */
          }
          var result = await origStitch(profile, fallbackIdentifier);
          if (prefetch) await prefetch;
          return result;
        };
      }
      return instance;
    };
    global.DemoTagsInjection.__siteCloneDecisioningSyncHooked = true;
  }

  function wireIframeLoadRetry(cfg) {
    var wiring = resolveDecisioningWiring(cfg);
    if (!wiring.iframeId || wiring.useParentDocument) return;
    var frame = document.getElementById(wiring.iframeId);
    if (!frame || frame.getAttribute('data-decisioning-boot-wired') === '1') return;
    frame.setAttribute('data-decisioning-boot-wired', '1');
    frame.addEventListener('load', function () {
      boot(cfg, { force: true });
    });
  }

  /**
   * @param {import('./env-bar.js').EnvBarConfig} cfg
   * @param {{ force?: boolean }} [opts]
   * @returns {{ runtimeApi: object|null, panelHandle: object|null, syncKey: string, wiring: object }|null}
   */
  function boot(cfg, opts) {
    opts = opts || {};
    cfg = cfg || {};
    installStitchSyncHook();

    var wiring = resolveDecisioningWiring(cfg);
    if (!wiring.iframeId && !wiring.useParentDocument) {
      wireIframeLoadRetry(cfg);
      return null;
    }

    if (bootResult && !opts.force) return bootResult;
    if (
      !global.DecisioningProfileRuntime ||
      typeof global.DecisioningProfileRuntime.init !== 'function' ||
      !global.DecisioningProfilePanel ||
      typeof global.DecisioningProfilePanel.init !== 'function'
    ) {
      return null;
    }

    var prefix = String(cfg.prefix || 'siteClone').trim();
    var emailInputId = wiring.emailInputId || 'customerEmail';
    var nsSelectId = wiring.namespaceSelectId || prefix + 'Ns';

    function getIdentifierValue() {
      var el = document.getElementById(emailInputId);
      return el ? String(el.value || '').trim() : '';
    }

    function getNamespace() {
      if (typeof global.AepIdentityPicker !== 'undefined' && typeof global.AepIdentityPicker.getNamespace === 'function') {
        return global.AepIdentityPicker.getNamespace(nsSelectId);
      }
      var sel = document.getElementById(nsSelectId);
      return sel && sel.value ? String(sel.value).trim().toLowerCase() : 'email';
    }

    function getSandboxName() {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        var sn = global.AepGlobalSandbox.getSandboxName();
        if (sn) return String(sn).trim();
      }
      var sel = document.getElementById('sandboxSelect');
      return sel && sel.value ? String(sel.value).trim() : '';
    }

    function getViewName() {
      return String(wiring.viewName || prefix || 'Site clone demo').trim();
    }

    var runtimeApi = global.DecisioningProfileRuntime.init({
      iframeId: wiring.iframeId || '',
      useParentDocument: !!wiring.useParentDocument,
      tagsStoragePrefix: prefix,
      mountLayoutPreset: wiring.mountLayoutPreset || 'generic',
      targetPageUrl: wiring.targetPageUrl || '',
      getTargetPageUrl:
        typeof wiring.getTargetPageUrl === 'function'
          ? wiring.getTargetPageUrl
          : wiring.iframeId && !wiring.useParentDocument
            ? buildIframeTargetPageUrlResolver(wiring.iframeId)
            : undefined,
      getViewName: getViewName,
      getIdentifierValue: getIdentifierValue,
      getNamespace: getNamespace,
      getSandboxName: getSandboxName,
      enabled: isDecisioningEnabled,
    });

    var panelHandle = null;
    if (!document.getElementById('dpmPanelAnchor')) {
      panelHandle = global.DecisioningProfilePanel.init({
        isEnabled: isDecisioningEnabled,
        enabledToggleId: 'siteCloneDecisioningEnabledToggle',
        moduleOptions: {
          getIdentifierValue: getIdentifierValue,
          getNamespace: getNamespace,
          getSandboxName: getSandboxName,
          emailInputId: emailInputId,
          namespaceSelectId: nsSelectId,
          tagsStoragePrefix: prefix,
          profileApi: runtimeApi || {},
        },
      });
    } else if (global.DecisioningProfilePanel && document.getElementById('dpmPanelMount')) {
      var mountEl = document.getElementById('dpmPanelMount');
      if (
        mountEl &&
        global.DecisioningProfileModule &&
        typeof global.DecisioningProfileModule.mount === 'function' &&
        (opts.force || !mountEl.querySelector('#cdMicroProfileRunBtn'))
      ) {
        global.DecisioningProfileModule.mount(mountEl, {
          getIdentifierValue: getIdentifierValue,
          getNamespace: getNamespace,
          getSandboxName: getSandboxName,
          emailInputId: emailInputId,
          namespaceSelectId: nsSelectId,
          tagsStoragePrefix: prefix,
          profileApi: runtimeApi || {},
        });
      }
    }

    syncFn = async function syncDecisioningProfileFromLookup() {
      if (!isDecisioningEnabled()) {
        if (panelHandle && panelHandle.moduleHandle && typeof panelHandle.moduleHandle.hydrate === 'function') {
          panelHandle.moduleHandle.hydrate();
        }
        return;
      }
      if (runtimeApi && typeof runtimeApi.maybeAutoLookup === 'function') {
        await runtimeApi.maybeAutoLookup('profile-lookup-sync');
        return;
      }
      if (runtimeApi && typeof runtimeApi.runProfileLookup === 'function') {
        await runtimeApi.runProfileLookup({ silent: true });
        return;
      }
      if (panelHandle && panelHandle.moduleHandle && typeof panelHandle.moduleHandle.hydrate === 'function') {
        panelHandle.moduleHandle.hydrate();
      }
    };

    var syncKey = '__' + prefix + 'DemoSyncDecisioningProfile';
    global[syncKey] = syncFn;
    global.__siteCloneSyncDecisioningProfile = syncFn;

    if (
      global.DecisioningProfileRuntime &&
      typeof global.DecisioningProfileRuntime.refreshEnabledState === 'function'
    ) {
      global.DecisioningProfileRuntime.refreshEnabledState();
    }
    if (isDecisioningEnabled() && runtimeApi && typeof runtimeApi.maybeAutoLookup === 'function') {
      void runtimeApi.maybeAutoLookup('decisioning-boot');
    }

    bootResult = { runtimeApi: runtimeApi, panelHandle: panelHandle, syncKey: syncKey, wiring: wiring };
    wireIframeLoadRetry(cfg);
    return bootResult;
  }

  global.SiteCloneDecisioningBoot = {
    boot: boot,
    resolveWiring: resolveDecisioningWiring,
    syncFromProfileLookup: syncFromProfileLookup,
  };

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    if (global.envBarConfig && global.SiteCloneDecisioningBoot) {
      boot(global.envBarConfig, { force: true });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
