/**
 * Shared KSIA lab wiring (Tags inject, profile drawer, env bar).
 * Used by ksia-demo.html and journey pages with ksia-journey-chrome.js.
 */
(function (global) {
  'use strict';

  function initKsiaLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : ['ksiaSiteFrame'];

    var customerEmail = document.getElementById('customerEmail');
    var ksiaNs = document.getElementById('ksiaNs');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail', 'recentEmails', 'ksiaNs');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'ksiaNs');
    if (typeof hydrateIdentifierFromSession === 'function') hydrateIdentifierFromSession('customerEmail', 'ksiaNs');

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var ksiaMessage = document.getElementById('ksiaMessage');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var ksiaBcOnInjectToggle = document.getElementById('ksiaBcOnInjectToggle');
    var ksiaBcStyleSelect = document.getElementById('ksiaBcStyleSelect');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    var generatorTargets = [];

    function ksiaWebPushOnInjectDesired() {
      if (typeof global.SiteCloneBcEnv !== 'undefined' && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      var el = document.getElementById('ksiaWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    function setKsiaMessage(text, type) {
      if (!ksiaMessage) return;
      ksiaMessage.textContent = text || '';
      ksiaMessage.className =
        'ksia-demo-message' + (type ? ' ksia-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      ksiaMessage.hidden = !text;
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    global.__siteCloneSuppressBcEnable = true;
    var ksiaInjectSdkBtn = document.getElementById('ksiaInjectSdkBtn');
    if (ksiaInjectSdkBtn) {
      ksiaInjectSdkBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    var ksiaTagsInjection =
      typeof global.DemoTagsInjection !== 'undefined'
        ? global.DemoTagsInjection.init({
            storagePrefix: 'ksia',
            identityEventType: 'ksia.identity.stitch',
            messageSetter: setKsiaMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: 'ksiaTagsCompany',
            tagsPropertyInputId: 'ksiaTagsProperty',
            tagsPropertyListId: 'ksiaTagsPropertyList',
            tagsEnvironmentId: 'ksiaTagsEnvironment',
            injectButtonId: 'ksiaInjectSdkBtn',
            selectedScriptId: 'ksiaSelectedScript',
            configFieldsId: 'ksiaSdkConfigFields',
            configSummaryId: 'ksiaSdkConfigSummary',
            configSummaryTextId: 'ksiaSdkConfigSummaryText',
            changeConfigButtonId: 'ksiaChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: getEmail,
            iframeIds: iframeIds,
            hideTagsCompanyUi: true,
            webPush: {
              enabled: true,
              subscribeAfterInject: ksiaWebPushOnInjectDesired,
              requestPermissionOnInject: ksiaWebPushOnInjectDesired,
            },
            brandConcierge: {
              enabled: function () {
                return !!(ksiaBcOnInjectToggle && ksiaBcOnInjectToggle.checked);
              },
              styleKey: function () {
                return ksiaBcStyleSelect ? ksiaBcStyleSelect.value : 'miral';
              },
              suppressEnable: function () {
                return !!global.__siteCloneSuppressBcEnable;
              },
            },
          })
        : null;

    var ksiaWebPushRetryBtn = document.getElementById('ksiaWebPushRetryBtn');
    if (ksiaWebPushRetryBtn && typeof global.AepDemoWebPush !== 'undefined') {
      ksiaWebPushRetryBtn.addEventListener('click', function () {
        void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'ksia' }).then(function (ok) {
          setKsiaMessage(
            ok
              ? 'Web push subscription sent.'
              : 'Web push did not complete. Allow notifications and ensure Tags is injected.',
            ok ? 'success' : 'error',
          );
        });
      });
    }

    async function loadGeneratorTargets() {
      if (!generatorTargetSelect) return;
      if (
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
        return;
      }
      try {
        var res = await fetch('/api/events/generator-targets');
        var data = await res.json().catch(function () {
          return {};
        });
        generatorTargets = Array.isArray(data.targets) ? data.targets : [];
        generatorTargetSelect.innerHTML = '';
        generatorTargets.forEach(function (t) {
          var opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.label || t.id;
          generatorTargetSelect.appendChild(opt);
        });
      } catch (_e) {
        generatorTargetSelect.innerHTML = '';
        var failOpt = document.createElement('option');
        failOpt.value = '';
        failOpt.textContent = 'Failed to load targets';
        generatorTargetSelect.appendChild(failOpt);
      }
    }

    void loadGeneratorTargets();
    if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
      global.AepDemoGeneratorTargets.onSandboxChange(function () {
        void loadGeneratorTargets();
      });
    }

    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var idVal = getEmail().trim();
        if (!idVal) {
          setKsiaMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setKsiaMessage('Looking up profile...', '');
        if (typeof setSessionIdentifier === 'function') {
          var ns = ksiaNs && ksiaNs.value ? ksiaNs.value : 'email';
          setSessionIdentifier(idVal, ns);
        }
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
        if (!ok || !ksiaTagsInjection || typeof ksiaTagsInjection.stitchAfterProfileLookup !== 'function') return;
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await ksiaTagsInjection.stitchAfterProfileLookup(profile, idVal);
        if (stitched) setKsiaMessage('Profile loaded and identity linked to ECID.', 'success');
      });
    }

    if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'ksia-demo-page--profile-open',
        viewName: 'KSIA demo',
        emailGetter: getEmail,
        messageSetter: setKsiaMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    if (typeof global.initLabDemoEnvBar === 'function') {
      global.initLabDemoEnvBar({ prefix: 'ksia' });
    }

    return { tagsInjection: ksiaTagsInjection, setMessage: setKsiaMessage, getSelectedGeneratorTarget: getSelectedGeneratorTarget };
  }

  global.initKsiaLab = initKsiaLab;
})(typeof window !== 'undefined' ? window : globalThis);
