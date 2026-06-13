/**
 * Shared Etihad lab wiring (Tags inject, profile drawer, env bar).
 * Used by etihad-demo.html (web) and etihad-mobile-demo.html (parent env bar + iframe shell).
 */
(function (global) {
  'use strict';

  /** @type {ReturnType<typeof buildEtihadLab>|null} */
  var etihadLabSingleton = null;

  function initEtihadLab(options) {
    if (etihadLabSingleton) return etihadLabSingleton;
    etihadLabSingleton = buildEtihadLab(options);
    return etihadLabSingleton;
  }

  function buildEtihadLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : [];
    var siteFrameId = options.siteFrameId || 'etihadSiteFrame';
    var siteFrame = document.getElementById(siteFrameId);

    var customerEmail = document.getElementById('customerEmail');
    var etihadNs = document.getElementById('etihadNs');

    function rememberEtihadSessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      var ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (etihadNs && etihadNs.value) {
          ns = String(etihadNs.value).trim().toLowerCase();
        }
      } catch (_e) {
        /* noop */
      }
      setSessionIdentifier(value, ns);
    }

    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'etihadNs');
    if (typeof attachEmailDatalist === 'function') {
      attachEmailDatalist('customerEmail', 'recentEmails', 'etihadNs');
    }
    if (typeof hydrateIdentifierFromSession === 'function') {
      hydrateIdentifierFromSession('customerEmail', 'etihadNs');
    }
    if (etihadNs) {
      etihadNs.addEventListener('change', function () {
        global.requestAnimationFrame(function () {
          if (typeof hydrateIdentifierFromSession === 'function') {
            hydrateIdentifierFromSession('customerEmail', 'etihadNs');
          }
        });
      });
    }

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var etihadMessage = document.getElementById('etihadMessage');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var etihadBcOnInjectToggle = document.getElementById('etihadBcOnInjectToggle');
    var etihadBcStyleSelect = document.getElementById('etihadBcStyleSelect');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    var generatorTargets = [];
    var ETIHAD_XDM_TENANT_KEY = '_demoemea';

    function etihadWebPushOnInjectDesired() {
      if (typeof global.SiteCloneBcEnv !== 'undefined' && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      var el = document.getElementById('etihadWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function setEtihadMessage(text, type) {
      if (!etihadMessage) return;
      etihadMessage.textContent = text || '';
      etihadMessage.className =
        'etihad-demo-message' + (type ? ' etihad-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      etihadMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    global.__siteCloneSuppressBcEnable = true;
    var etihadInjectSdkBtn = document.getElementById('etihadInjectSdkBtn');
    if (etihadInjectSdkBtn) {
      etihadInjectSdkBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    /** @type {ReturnType<typeof global.DemoTagsInjection.init>|null} */
    var etihadTagsInjection = null;

    function startTagsInjection() {
      if (etihadTagsInjection) return etihadTagsInjection;
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
      etihadTagsInjection = global.DemoTagsInjection.init({
        storagePrefix: 'etihadAirline',
        identityEventType: 'etihadAirline.identity.stitch',
        messageSetter: setEtihadMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'etihadTagsCompany',
        tagsPropertyInputId: 'etihadTagsProperty',
        tagsPropertyListId: 'etihadTagsPropertyList',
        tagsEnvironmentId: 'etihadTagsEnvironment',
        injectButtonId: 'etihadInjectSdkBtn',
        selectedScriptId: 'etihadSelectedScript',
        configFieldsId: 'etihadSdkConfigFields',
        configSummaryId: 'etihadSdkConfigSummary',
        configSummaryTextId: 'etihadSdkConfigSummaryText',
        changeConfigButtonId: 'etihadChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: getEmail,
        iframeIds: iframeIds,
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: etihadWebPushOnInjectDesired,
          requestPermissionOnInject: etihadWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(etihadBcOnInjectToggle && etihadBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return etihadBcStyleSelect ? etihadBcStyleSelect.value : 'miral';
          },
          suppressEnable: function () {
            return !!global.__siteCloneSuppressBcEnable;
          },
        },
      });
      if (etihadTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
        global.envBar.registerTagsInjection(etihadTagsInjection);
      }
      return etihadTagsInjection;
    }

    startTagsInjection();

    var etihadWebPushRetryBtn = document.getElementById('etihadWebPushRetryBtn');
    if (etihadWebPushRetryBtn && typeof global.AepDemoWebPush !== 'undefined') {
      etihadWebPushRetryBtn.addEventListener('click', function () {
        void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'etihadAirline' }).then(function (ok) {
          setEtihadMessage(
            ok
              ? 'Web push subscription sent (requires Tags Web SDK pushNotifications, permission, and AJO push surface).'
              : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
            ok ? 'success' : 'error',
          );
        });
      });
    }

    async function sendEtihadAirlineExperienceEvent(payload) {
      var p = payload && typeof payload === 'object' ? payload : {};
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      var ecid =
        ecidText && ecidText !== '-' && ecidText !== '\u2014' && /^\d+$/.test(ecidText) && ecidText.length >= 10
          ? ecidText
          : null;
      var emailForEvent = getEmail().trim();
      var target = getSelectedGeneratorTarget();
      var channel = options.mobileChannel ? 'Mobile' : 'Web';
      var body = {
        targetId: target ? target.id : undefined,
        eventType: String(p.eventType || 'travel.flight.search').trim(),
        viewName: String(p.viewName || 'Etihad lab').trim(),
        viewUrl: String(p.viewUrl || '').trim() || (typeof global.location !== 'undefined' ? global.location.href.split('?')[0] : ''),
        channel: String(p.channel || channel).trim(),
        public: p.public && typeof p.public === 'object' ? p.public : {},
        xdmTenantKey: ETIHAD_XDM_TENANT_KEY,
        identityMapEcidKey: 'ECID',
      };
      if (emailForEvent) body.email = emailForEvent;
      if (ecid) body.ecid = ecid;
      var postBody =
        typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.augmentGeneratorPostBody
          ? global.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
          : body;
      try {
        var res = await fetch('/api/events/generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          var errMsg = data.error || data.message || 'Request failed.';
          var extra = '';
          if (data.streamingResponse) extra = ' \u2014 ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
          else if (data.edgeBody) extra = ' \u2014 ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
          setEtihadMessage(errMsg + extra, 'error');
          return false;
        }
        var idPart = '';
        if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
        else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
        setEtihadMessage((data.message || 'Travel journey event sent to AEP.') + idPart, 'success');
        if (ecid && typeof DemoProfileDrawer !== 'undefined' && typeof DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
          void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
          global.setTimeout(function () {
            void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
          }, 2500);
          global.setTimeout(function () {
            void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
          }, 8000);
        }
        return true;
      } catch (err) {
        setEtihadMessage(err.message || 'Network error', 'error');
        return false;
      }
    }

    var shellFrameId = options.shellFrameId || null;

    function postToSiteFrame(msg) {
      if (siteFrame && siteFrame.contentWindow) {
        siteFrame.contentWindow.postMessage(msg, '*');
        return;
      }
      if (shellFrameId) {
        var shell = document.getElementById(shellFrameId);
        if (shell && shell.contentWindow) {
          shell.contentWindow.postMessage(msg, '*');
        }
      }
    }

    async function handleAirlineLabMessage(data) {
      if (!data || data.source !== 'etihad-airline-lab') return;

      if (data.type === 'login-request') {
        var email = String(data.email || '').trim();
        if (!email) return;

        if (customerEmail) customerEmail.value = email;
        rememberEtihadSessionIdentifier(email);

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
          source: 'etihad-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        });
        if (ok && profileMsg) {
          postToSiteFrame({ source: 'etihad-demo-shell', type: 'profile-loaded', profile: profileMsg });
        }

        if (ok && etihadTagsInjection && typeof etihadTagsInjection.stitchAfterProfileLookup === 'function') {
          void etihadTagsInjection.stitchAfterProfileLookup(profile, email);
        }
        return;
      }

      if (data.type === 'airline-experience-event') {
        void sendEtihadAirlineExperienceEvent(data.payload);
      }
    }

    if (siteFrame) {
      global.addEventListener('message', function (ev) {
        if (!siteFrame.contentWindow || ev.source !== siteFrame.contentWindow) return;
        void handleAirlineLabMessage(ev.data);
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
        var email = getEmail().trim();
        if (!email) {
          setEtihadMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setEtihadMessage('Looking up profile...', '');
        rememberEtihadSessionIdentifier(email);
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        if (!ok || !etihadTagsInjection || typeof etihadTagsInjection.stitchAfterProfileLookup !== 'function') return;
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await etihadTagsInjection.stitchAfterProfileLookup(profile, email);
        if (stitched) setEtihadMessage('Profile loaded and email linked to ECID for stitching.', 'success');

        postToSiteFrame({
          source: 'etihad-demo-shell',
          type: 'profile-loaded',
          profile: profile
            ? {
                firstName: profile.firstName || null,
                loyaltyStatus: profile.loyaltyStatus || null,
                churnPrediction: profile.churnPrediction != null ? profile.churnPrediction : null,
                propensityScore: profile.propensityScore != null ? profile.propensityScore : null,
              }
            : null,
        });
      });
    }

    if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: options.profileOpenClass || 'etihad-demo-page--profile-open',
        viewName: options.viewName || 'Etihad demo',
        emailGetter: getEmail,
        messageSetter: setEtihadMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    if (customerEmail) {
      customerEmail.addEventListener('input', function () {
        if (!customerEmail.value.trim()) {
          postToSiteFrame({ source: 'etihad-demo-shell', type: 'profile-cleared' });
        }
      });
    }

    return {
      tagsInjection: etihadTagsInjection,
      setMessage: setEtihadMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      handleAirlineLabMessage: handleAirlineLabMessage,
      postToSiteFrame: postToSiteFrame,
    };
  }

  global.initEtihadLab = initEtihadLab;
})(typeof window !== 'undefined' ? window : globalThis);
