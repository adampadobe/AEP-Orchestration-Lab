/**
 * Shared Starbucks lab wiring (Tags inject, profile drawer, env bar).
 * Used by starbucks-demo.html and journey pages with starbucks-journey-chrome.js.
 */
(function (global) {
  'use strict';

  /** @type {ReturnType<typeof buildStarbucksLab>|null} */
  var starbucksLabSingleton = null;

  function initStarbucksLab(options) {
    if (starbucksLabSingleton) return starbucksLabSingleton;
    starbucksLabSingleton = buildStarbucksLab(options);
    return starbucksLabSingleton;
  }

  function buildStarbucksLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : ['starbucksSiteFrame'];

    var customerEmail = document.getElementById('customerEmail');
    var starbucksNs = document.getElementById('starbucksNs');
    var siteFrameId = options.siteFrameId || 'starbucksSiteFrame';
    var siteFrame = document.getElementById(siteFrameId);

    function rememberStarbucksSessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      var ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (starbucksNs && starbucksNs.value) {
          ns = String(starbucksNs.value).trim().toLowerCase();
        }
      } catch (_e) {
        /* noop */
      }
      setSessionIdentifier(value, ns);
    }

    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail', 'recentEmails', 'starbucksNs');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'starbucksNs');
    if (typeof hydrateIdentifierFromSession === 'function') hydrateIdentifierFromSession('customerEmail', 'starbucksNs');

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var starbucksMessage = document.getElementById('starbucksMessage');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var starbucksBcOnInjectToggle = document.getElementById('starbucksBcOnInjectToggle');
    var starbucksBcStyleSelect = document.getElementById('starbucksBcStyleSelect');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    var generatorTargets = [];

    function starbucksWebPushOnInjectDesired() {
      if (typeof global.SiteCloneBcEnv !== 'undefined' && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      var el = document.getElementById('starbucksWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    function setStarbucksMessage(text, type) {
      if (!starbucksMessage) return;
      starbucksMessage.textContent = text || '';
      starbucksMessage.className =
        'starbucks-demo-message' + (type ? ' starbucks-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      starbucksMessage.hidden = !text;
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
    var starbucksInjectSdkBtn = document.getElementById('starbucksInjectSdkBtn');
    if (starbucksInjectSdkBtn) {
      starbucksInjectSdkBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    /** @type {ReturnType<typeof global.DemoTagsInjection.init>|null} */
    var starbucksTagsInjection = null;

    function startTagsInjection() {
      if (starbucksTagsInjection) return starbucksTagsInjection;
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
      starbucksTagsInjection = global.DemoTagsInjection.init({
        storagePrefix: 'starbucks',
        identityEventType: 'starbucks.identity.stitch',
        messageSetter: setStarbucksMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'starbucksTagsCompany',
        tagsPropertyInputId: 'starbucksTagsProperty',
        tagsPropertyListId: 'starbucksTagsPropertyList',
        tagsEnvironmentId: 'starbucksTagsEnvironment',
        injectButtonId: 'starbucksInjectSdkBtn',
        selectedScriptId: 'starbucksSelectedScript',
        configFieldsId: 'starbucksSdkConfigFields',
        configSummaryId: 'starbucksSdkConfigSummary',
        configSummaryTextId: 'starbucksSdkConfigSummaryText',
        changeConfigButtonId: 'starbucksChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: getEmail,
        iframeIds: iframeIds,
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: starbucksWebPushOnInjectDesired,
          requestPermissionOnInject: starbucksWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(starbucksBcOnInjectToggle && starbucksBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return starbucksBcStyleSelect ? starbucksBcStyleSelect.value : 'miral';
          },
          suppressEnable: function () {
            return !!global.__siteCloneSuppressBcEnable;
          },
        },
      });
      if (starbucksTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
        global.envBar.registerTagsInjection(starbucksTagsInjection);
      }
      return starbucksTagsInjection;
    }

    startTagsInjection();

    var starbucksWebPushRetryBtn = document.getElementById('starbucksWebPushRetryBtn');
    if (starbucksWebPushRetryBtn && typeof global.AepDemoWebPush !== 'undefined') {
      starbucksWebPushRetryBtn.addEventListener('click', function () {
        void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'starbucks' }).then(function (ok) {
          setStarbucksMessage(
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
          setStarbucksMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setStarbucksMessage('Looking up profile...', '');
        if (typeof setSessionIdentifier === 'function') {
          var ns = starbucksNs && starbucksNs.value ? starbucksNs.value : 'email';
          setSessionIdentifier(idVal, ns);
        }
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
        if (!ok || !starbucksTagsInjection || typeof starbucksTagsInjection.stitchAfterProfileLookup !== 'function') return;
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await starbucksTagsInjection.stitchAfterProfileLookup(profile, idVal);
        if (stitched) setStarbucksMessage('Profile loaded and identity linked to ECID.', 'success');
      });
    }

    if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'starbucks-demo-page--profile-open',
        viewName: 'Starbucks demo',
        emailGetter: getEmail,
        messageSetter: setStarbucksMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    function postToSiteFrame(msg) {
      if (siteFrame && siteFrame.contentWindow) {
        siteFrame.contentWindow.postMessage(msg, '*');
      }
    }

    async function handleStarbucksLabMessage(data) {
      if (!data || data.source !== 'starbucks-lab') return;

      if (data.type === 'login-request') {
        var email = String(data.email || '').trim();
        if (!email) return;

        if (customerEmail) customerEmail.value = email;
        rememberStarbucksSessionIdentifier(email);

        setStarbucksMessage('Looking up profile...', '');
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
          source: 'starbucks-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        });
        if (ok && profileMsg) {
          postToSiteFrame({ source: 'starbucks-demo-shell', type: 'profile-loaded', profile: profileMsg });
        }

        if (ok && starbucksTagsInjection && typeof starbucksTagsInjection.stitchAfterProfileLookup === 'function') {
          var stitched = await starbucksTagsInjection.stitchAfterProfileLookup(profile, email);
          if (stitched) setStarbucksMessage('Profile loaded and identity linked to ECID.', 'success');
        }
      }
    }

    global.addEventListener('message', function (ev) {
      var fromIframe = siteFrame && siteFrame.contentWindow && ev.source === siteFrame.contentWindow;
      var fromSameDoc = !siteFrame && ev.source === global;
      if (!fromIframe && !fromSameDoc) return;
      void handleStarbucksLabMessage(ev.data);
    });

    return { tagsInjection: starbucksTagsInjection, setMessage: setStarbucksMessage, getSelectedGeneratorTarget: getSelectedGeneratorTarget };
  }

  global.initStarbucksLab = initStarbucksLab;
})(typeof window !== 'undefined' ? window : globalThis);
