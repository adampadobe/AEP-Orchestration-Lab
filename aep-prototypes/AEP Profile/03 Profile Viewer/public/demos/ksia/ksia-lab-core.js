/**
 * Shared KSIA lab wiring (Tags inject, profile drawer, env bar).
 * Used by ksia-demo.html and journey pages with ksia-journey-chrome.js.
 */
(function (global) {
  'use strict';

  /** @type {ReturnType<typeof buildKsiaLab>|null} */
  var ksiaLabSingleton = null;

  function initKsiaLab(options) {
    if (ksiaLabSingleton) return ksiaLabSingleton;
    ksiaLabSingleton = buildKsiaLab(options);
    return ksiaLabSingleton;
  }

  function buildKsiaLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : ['ksiaSiteFrame'];

    var customerEmail = document.getElementById('customerEmail');
    var ksiaNs = document.getElementById('ksiaNs');
    var siteFrameId = options.siteFrameId || 'ksiaSiteFrame';
    var siteFrame = document.getElementById(siteFrameId);

    function rememberKsiaSessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      var ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (ksiaNs && ksiaNs.value) {
          ns = String(ksiaNs.value).trim().toLowerCase();
        }
      } catch (_e) {
        /* noop */
      }
      setSessionIdentifier(value, ns);
    }

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

    /** @type {ReturnType<typeof global.DemoTagsInjection.init>|null} */
    var ksiaTagsInjection = null;

    function startTagsInjection() {
      if (ksiaTagsInjection) return ksiaTagsInjection;
      if (typeof global.DemoTagsInjection === 'undefined') {
        if (global.envBar && typeof global.envBar.onChange === 'function') {
          var unsubTags = global.envBar.onChange(function (detail) {
            if (detail && detail.type === 'init' && typeof global.DemoTagsInjection !== 'undefined') {
              unsubTags();
              startTagsInjection();
            }
          });
        }
        return null;
      }
      ksiaTagsInjection = global.DemoTagsInjection.init({
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
      });
      if (ksiaTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
        global.envBar.registerTagsInjection(ksiaTagsInjection);
      }
      return ksiaTagsInjection;
    }

    startTagsInjection();

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

    function postToSiteFrame(msg) {
      if (siteFrame && siteFrame.contentWindow) {
        siteFrame.contentWindow.postMessage(msg, '*');
      }
    }

    async function handleKsiaLabMessage(data) {
      if (!data || data.source !== 'ksia-airport-lab') return;

      if (data.type === 'login-request') {
        var email = String(data.email || '').trim();
        if (!email) return;

        if (customerEmail) customerEmail.value = email;
        rememberKsiaSessionIdentifier(email);

        setKsiaMessage('Looking up profile...', '');
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var profileMsg = profile
          ? {
              firstName: profile.firstName || null,
              loyaltyStatus: profile.loyaltyStatus || null,
              churnPrediction: profile.churnPrediction != null ? profile.churnPrediction : null,
              propensityScore: profile.propensityScore != null ? profile.propensityScore : null,
            }
          : null;

        postToSiteFrame({
          source: 'ksia-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        });
        if (ok && profileMsg) {
          postToSiteFrame({ source: 'ksia-demo-shell', type: 'profile-loaded', profile: profileMsg });
        }

        if (ok && ksiaTagsInjection && typeof ksiaTagsInjection.stitchAfterProfileLookup === 'function') {
          var stitched = await ksiaTagsInjection.stitchAfterProfileLookup(profile, email);
          if (stitched) setKsiaMessage('Profile loaded and identity linked to ECID.', 'success');
        }
      }
    }

    global.addEventListener('message', function (ev) {
      var fromIframe = siteFrame && siteFrame.contentWindow && ev.source === siteFrame.contentWindow;
      var fromSameDoc = !siteFrame && ev.source === global;
      if (!fromIframe && !fromSameDoc) return;
      void handleKsiaLabMessage(ev.data);
    });

    return { tagsInjection: ksiaTagsInjection, setMessage: setKsiaMessage, getSelectedGeneratorTarget: getSelectedGeneratorTarget };
  }

  global.initKsiaLab = initKsiaLab;
})(typeof window !== 'undefined' ? window : globalThis);
