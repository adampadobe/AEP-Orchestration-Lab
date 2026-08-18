/**
 * Shared TUI lab wiring (Tags inject, profile drawer, env bar).
 * Used by tui-demo.html (web) and tui-mobile-demo.html (parent env bar + iframe shell).
 */
(function (global) {
  'use strict';

  /** @type {ReturnType<typeof buildTuiLab>|null} */
  var tuiLabSingleton = null;

  function initTuiLab(options) {
    if (tuiLabSingleton) return tuiLabSingleton;
    tuiLabSingleton = buildTuiLab(options);
    return tuiLabSingleton;
  }

  function buildTuiLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : [];
    var siteFrameId = options.siteFrameId || 'tuiSiteFrame';
    var siteFrame = document.getElementById(siteFrameId);

    var customerEmail = document.getElementById('customerEmail');
    var tuiNs = document.getElementById('tuiNs');

    function rememberTuiSessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      var ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (tuiNs && tuiNs.value) {
          ns = String(tuiNs.value).trim().toLowerCase();
        }
      } catch (_e) {
        /* noop */
      }
      setSessionIdentifier(value, ns);
    }

    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'tuiNs');
    if (typeof attachEmailDatalist === 'function') {
      attachEmailDatalist('customerEmail', 'recentEmails', 'tuiNs');
    }
    if (typeof hydrateIdentifierFromSession === 'function') {
      hydrateIdentifierFromSession('customerEmail', 'tuiNs');
    }
    if (tuiNs) {
      tuiNs.addEventListener('change', function () {
        global.requestAnimationFrame(function () {
          if (typeof hydrateIdentifierFromSession === 'function') {
            hydrateIdentifierFromSession('customerEmail', 'tuiNs');
          }
        });
      });
    }

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var tuiMessage = document.getElementById('tuiMessage');
    function getGeneratorTargetSelect() {
      return document.getElementById('generatorTarget');
    }

    var tuiBcOnInjectToggle = document.getElementById('tuiBcOnInjectToggle');
    var tuiBcStyleSelect = document.getElementById('tuiBcStyleSelect');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    var generatorTargets = [];
    var TUI_XDM_TENANT_KEY = '_demoemea';

    function tuiWebPushOnInjectDesired() {
      if (typeof global.SiteCloneBcEnv !== 'undefined' && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      var el = document.getElementById('tuiWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function setTuiMessage(text, type) {
      if (!tuiMessage) return;
      tuiMessage.textContent = text || '';
      tuiMessage.className =
        'tui-demo-message' + (type ? ' tui-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      tuiMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      var selectEl = getGeneratorTargetSelect();
      var id = (selectEl && selectEl.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    global.__siteCloneSuppressBcEnable = true;
    var tuiInjectSdkBtn = document.getElementById('tuiInjectSdkBtn');
    if (tuiInjectSdkBtn) {
      tuiInjectSdkBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    /** @type {ReturnType<typeof global.DemoTagsInjection.init>|null} */
    var tuiTagsInjection = null;

    function startTagsInjection() {
      if (tuiTagsInjection) return tuiTagsInjection;
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
      tuiTagsInjection = global.DemoTagsInjection.init({
        storagePrefix: 'tuiDemo',
        identityEventType: 'tuiTravel.identity.stitch',
        messageSetter: setTuiMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'tuiTagsCompany',
        tagsPropertyInputId: 'tuiTagsProperty',
        tagsPropertyListId: 'tuiTagsPropertyList',
        tagsEnvironmentId: 'tuiTagsEnvironment',
        injectButtonId: 'tuiInjectSdkBtn',
        selectedScriptId: 'tuiSelectedScript',
        configFieldsId: 'tuiSdkConfigFields',
        configSummaryId: 'tuiSdkConfigSummary',
        configSummaryTextId: 'tuiSdkConfigSummaryText',
        changeConfigButtonId: 'tuiChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: getEmail,
        iframeIds: iframeIds,
        hideTagsCompanyUi: true,
        webPush: {
          enabled: true,
          subscribeAfterInject: tuiWebPushOnInjectDesired,
          requestPermissionOnInject: tuiWebPushOnInjectDesired,
        },
        brandConcierge: {
          enabled: function () {
            return !!(tuiBcOnInjectToggle && tuiBcOnInjectToggle.checked);
          },
          styleKey: function () {
            return tuiBcStyleSelect ? tuiBcStyleSelect.value : 'miral';
          },
          suppressEnable: function () {
            return !!global.__siteCloneSuppressBcEnable;
          },
        },
      });
      if (tuiTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
        global.envBar.registerTagsInjection(tuiTagsInjection);
      }
      return tuiTagsInjection;
    }

    startTagsInjection();

    var tuiWebPushRetryBtn = document.getElementById('tuiWebPushRetryBtn');
    if (tuiWebPushRetryBtn && typeof global.AepDemoWebPush !== 'undefined') {
      tuiWebPushRetryBtn.addEventListener('click', function () {
        void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'tuiDemo' }).then(function (ok) {
          setTuiMessage(
            ok
              ? 'Web push subscription sent (requires Tags Web SDK pushNotifications, permission, and AJO push surface).'
              : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
            ok ? 'success' : 'error',
          );
        });
      });
    }

    async function sendTuiTravelExperienceEvent(payload) {
      var p = payload && typeof payload === 'object' ? payload : {};
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      var ecid =
        ecidText && ecidText !== '-' && ecidText !== '—' && /^\d+$/.test(ecidText) && ecidText.length >= 10
          ? ecidText
          : null;
      var emailForEvent = getEmail().trim();
      var target = getSelectedGeneratorTarget();
      var channel = options.mobileChannel ? 'Mobile' : 'Web';
      var body = {
        targetId: target ? target.id : undefined,
        eventType: String(p.eventType || 'travel.holiday.search').trim(),
        viewName: String(p.viewName || 'TUI lab').trim(),
        viewUrl: String(p.viewUrl || '').trim() || (typeof global.location !== 'undefined' ? global.location.href.split('?')[0] : ''),
        channel: String(p.channel || channel).trim(),
        public: p.public && typeof p.public === 'object' ? p.public : {},
        xdmTenantKey: TUI_XDM_TENANT_KEY,
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
          if (data.streamingResponse) extra = ' — ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
          else if (data.edgeBody) extra = ' — ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
          setTuiMessage(errMsg + extra, 'error');
          return false;
        }
        var idPart = '';
        if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
        else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
        setTuiMessage((data.message || 'Travel journey event sent to AEP.') + idPart, 'success');
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
        setTuiMessage(err.message || 'Network error', 'error');
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

    async function handleTravelLabMessage(data) {
      if (!data || data.source !== 'tui-lab') return;

      if (data.type === 'login-request') {
        var email = String(data.email || '').trim();
        if (!email) return;

        if (customerEmail) customerEmail.value = email;
        rememberTuiSessionIdentifier(email);

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
          source: 'tui-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        });
        if (ok && profileMsg) {
          postToSiteFrame({ source: 'tui-demo-shell', type: 'profile-loaded', profile: profileMsg });
        }

        if (ok && tuiTagsInjection && typeof tuiTagsInjection.stitchAfterProfileLookup === 'function') {
          void tuiTagsInjection.stitchAfterProfileLookup(profile, email);
        }
        return;
      }

      if (data.type === 'travel-experience-event') {
        void sendTuiTravelExperienceEvent(data.payload);
      }
    }

    if (siteFrame) {
      global.addEventListener('message', function (ev) {
        if (!siteFrame.contentWindow || ev.source !== siteFrame.contentWindow) return;
        void handleTravelLabMessage(ev.data);
      });
    }

    async function loadGeneratorTargets() {
      var selectEl = getGeneratorTargetSelect();
      if (!selectEl) return;
      if (
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(selectEl, {});
        return;
      }
      try {
        var res = await fetch('/api/events/generator-targets');
        var data = await res.json().catch(function () {
          return {};
        });
        generatorTargets = Array.isArray(data.targets) ? data.targets : [];
        selectEl.innerHTML = '';
        generatorTargets.forEach(function (t) {
          var opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.label || t.id;
          selectEl.appendChild(opt);
        });
      } catch (_e) {
        selectEl.innerHTML = '';
        var failOpt = document.createElement('option');
        failOpt.value = '';
        failOpt.textContent = 'Failed to load targets';
        selectEl.appendChild(failOpt);
      }
    }

    if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle) {
      global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(function () {
        return loadGeneratorTargets();
      });
    } else {
      void loadGeneratorTargets();
      if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
        global.AepDemoGeneratorTargets.onSandboxChange(function () {
          void loadGeneratorTargets();
        });
      }
    }

    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var email = getEmail().trim();
        if (!email) {
          setTuiMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setTuiMessage('Looking up profile...', '');
        rememberTuiSessionIdentifier(email);
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        if (!ok || !tuiTagsInjection || typeof tuiTagsInjection.stitchAfterProfileLookup !== 'function') return;
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await tuiTagsInjection.stitchAfterProfileLookup(profile, email);
        if (stitched) setTuiMessage('Profile loaded and email linked to ECID for stitching.', 'success');

        postToSiteFrame({
          source: 'tui-demo-shell',
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
        profileOpenClass: options.profileOpenClass || 'tui-demo-page--profile-open',
        viewName: options.viewName || 'TUI demo',
        emailGetter: getEmail,
        messageSetter: setTuiMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    if (customerEmail) {
      customerEmail.addEventListener('input', function () {
        if (!customerEmail.value.trim()) {
          postToSiteFrame({ source: 'tui-demo-shell', type: 'profile-cleared' });
        }
      });
    }

    return {
      tagsInjection: tuiTagsInjection,
      setMessage: setTuiMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      handleAirlineLabMessage: handleTravelLabMessage,
      postToSiteFrame: postToSiteFrame,
    };
  }

  global.initTuiLab = initTuiLab;
})(typeof window !== 'undefined' ? window : globalThis);
