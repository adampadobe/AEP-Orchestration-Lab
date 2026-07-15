/**
 * Shared Arm lab wiring (Tags inject, profile drawer, env bar).
 */
(function (global) {
  'use strict';

  var armcomLabSingleton = null;

  function initArmcomLab(options) {
    if (armcomLabSingleton) return armcomLabSingleton;
    armcomLabSingleton = buildArmcomLab(options);
    return armcomLabSingleton;
  }

  function buildArmcomLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : ['armcomSiteFrame'];

    var customerEmail = document.getElementById('customerEmail');
    var armcomNs = document.getElementById('armcomNs');
    var siteFrameId = options.siteFrameId || 'armcomSiteFrame';
    var siteFrame = document.getElementById(siteFrameId);

    function rememberArmcomSessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      var ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (armcomNs && armcomNs.value) {
          ns = String(armcomNs.value).trim().toLowerCase();
        }
      } catch (_e) {
        /* noop */
      }
      setSessionIdentifier(value, ns);
    }

    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail', 'recentEmails', 'armcomNs');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'armcomNs');
    if (typeof hydrateIdentifierFromSession === 'function') hydrateIdentifierFromSession('customerEmail', 'armcomNs');

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var armcomMessage = document.getElementById('armcomMessage');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var armcomBcOnInjectToggle = document.getElementById('armcomBcOnInjectToggle');
    var armcomBcStyleSelect = document.getElementById('armcomBcStyleSelect');

    var generatorTargets = [];

    function armcomWebPushOnInjectDesired() {
      if (typeof global.SiteCloneBcEnv !== 'undefined' && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      var el = document.getElementById('armcomWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    function setArmcomMessage(text, type) {
      if (!armcomMessage) return;
      armcomMessage.textContent = text || '';
      armcomMessage.className =
        'armcom-demo-message' + (type ? ' armcom-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      armcomMessage.hidden = !text;
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
    var armcomInjectSdkBtn = document.getElementById('armcomInjectSdkBtn');
    if (armcomInjectSdkBtn) {
      armcomInjectSdkBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    var armcomTagsInjection = null;

    function startTagsInjection() {
      if (armcomTagsInjection) return armcomTagsInjection;
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
      armcomTagsInjection = global.DemoTagsInjection.init({
        storagePrefix: 'armcom',
        identityEventType: 'armcom.identity.stitch',
        messageSetter: setArmcomMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'armcomTagsCompany',
        tagsPropertyInputId: 'armcomTagsProperty',
        tagsPropertyListId: 'armcomTagsPropertyList',
        tagsEnvironmentId: 'armcomTagsEnvironment',
        injectButtonId: 'armcomInjectSdkBtn',
        selectedScriptId: 'armcomSelectedScript',
        configFieldsId: 'armcomSdkConfigFields',
        configSummaryId: 'armcomSdkConfigSummary',
        configSummaryTextId: 'armcomSdkConfigSummaryText',
        changeConfigButtonId: 'armcomChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: getEmail,
        iframeIds: iframeIds,
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: armcomWebPushOnInjectDesired,
          requestPermissionOnInject: armcomWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(armcomBcOnInjectToggle && armcomBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return armcomBcStyleSelect ? armcomBcStyleSelect.value : 'generic';
          },
          suppressEnable: function () {
            return !!global.__siteCloneSuppressBcEnable;
          },
        },
      });
      if (armcomTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
        global.envBar.registerTagsInjection(armcomTagsInjection);
      }
      return armcomTagsInjection;
    }

    startTagsInjection();

    var armcomWebPushRetryBtn = document.getElementById('armcomWebPushRetryBtn');
    if (armcomWebPushRetryBtn && typeof global.AepDemoWebPush !== 'undefined') {
      armcomWebPushRetryBtn.addEventListener('click', function () {
        void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'armcom' }).then(function (ok) {
          setArmcomMessage(
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
          setArmcomMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setArmcomMessage('Looking up profile...', '');
        if (typeof setSessionIdentifier === 'function') {
          var ns = armcomNs && armcomNs.value ? armcomNs.value : 'email';
          setSessionIdentifier(idVal, ns);
        }
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
        if (!ok || !armcomTagsInjection || typeof armcomTagsInjection.stitchAfterProfileLookup !== 'function') return;
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await armcomTagsInjection.stitchAfterProfileLookup(profile, idVal);
        if (stitched) setArmcomMessage('Profile loaded and identity linked to ECID.', 'success');
      });
    }

    if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'armcom-demo-page--profile-open',
        viewName: 'Arm demo',
        emailGetter: getEmail,
        messageSetter: setArmcomMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    function postToSiteFrame(msg) {
      if (siteFrame && siteFrame.contentWindow) {
        siteFrame.contentWindow.postMessage(msg, '*');
      }
    }

    async function handleArmcomLabMessage(data) {
      if (!data || data.source !== 'armcom-lab') return;

      if (data.type === 'login-request') {
        var email = String(data.email || '').trim();
        if (!email) return;
        var company = String(data.company || '').trim();

        if (customerEmail) customerEmail.value = email;
        rememberArmcomSessionIdentifier(email);

        var mode = String(data.mode || 'signin');
        var lookupLabel =
          mode === 'register'
            ? 'Registering Arm ID and looking up profile...'
            : 'Looking up profile and stitching identity...';
        setArmcomMessage(lookupLabel, '');
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var firstName =
          (profile && profile.firstName) ||
          String(data.firstName || '').trim() ||
          null;

        postToSiteFrame({
          source: 'armcom-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: firstName,
          company: company,
          mode: mode,
        });

        if (ok && armcomTagsInjection && typeof armcomTagsInjection.stitchAfterProfileLookup === 'function') {
          var stitched = await armcomTagsInjection.stitchAfterProfileLookup(profile, email);
          if (stitched) {
            setArmcomMessage('Identity unified across arm.com and developer.arm.com. Audience synced to LinkedIn + Meta.', 'success');
          }
        }
      }
    }

    global.addEventListener('message', function (ev) {
      var fromIframe = siteFrame && siteFrame.contentWindow && ev.source === siteFrame.contentWindow;
      var fromSameDoc = !siteFrame && ev.source === global;
      if (!fromIframe && !fromSameDoc) return;
      void handleArmcomLabMessage(ev.data);
    });

    return {
      tagsInjection: armcomTagsInjection,
      setMessage: setArmcomMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
    };
  }

  global.initArmcomLab = initArmcomLab;
})(typeof window !== 'undefined' ? window : globalThis);
