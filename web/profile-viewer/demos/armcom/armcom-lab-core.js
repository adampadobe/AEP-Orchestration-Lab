/**
 * Shared Arm lab wiring (Tags inject, profile drawer, env bar).
 */
(function (global) {
  'use strict';

  var armcomLabSingleton = null;

  function initArmcomLab(options) {
    if (armcomLabSingleton && !(options && options.force)) return armcomLabSingleton;
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

    function getGeneratorTargetSelect() {
      return document.getElementById('generatorTarget');
    }

    function getSelectedGeneratorTarget() {
      var selectEl = getGeneratorTargetSelect();
      var id = (selectEl && selectEl.value) || '';
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

    function bindGeneratorTargetReload() {
      function reload() {
        void loadGeneratorTargets();
      }
      if (global.envBar && typeof global.envBar.onChange === 'function') {
        global.envBar.onChange(function (detail) {
          if (detail && detail.type === 'init') reload();
        });
      }
      global.addEventListener('env-bar-change', function (ev) {
        if (ev && ev.detail && ev.detail.type === 'init') reload();
      });
    }

    bindGeneratorTargetReload();
    void loadGeneratorTargets();
    if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
      global.AepDemoGeneratorTargets.onSandboxChange(function () {
        void loadGeneratorTargets();
      });
    }

    function resolveProfileAfterLookup() {
      return global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? global.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    }

    async function stitchArmcomIdentity(profile, email) {
      if (!armcomTagsInjection || typeof armcomTagsInjection.stitchAfterProfileLookup !== 'function') {
        return false;
      }
      return armcomTagsInjection.stitchAfterProfileLookup(profile, email);
    }

    /**
     * Same path as env bar "Look up profile": email namespace lookup, drawer update, ECID stitch.
     * @param {string} email
     * @param {{ lookupMessage?: string, successMessage?: string, notifyFrame?: boolean, company?: string, mode?: string, firstName?: string }} [opts]
     */
    async function performArmcomProfileLookup(email, opts) {
      opts = opts || {};
      var idVal = String(email || '').trim();
      if (!idVal) return { ok: false, profile: null, stitched: false };

      if (customerEmail) customerEmail.value = idVal;
      rememberArmcomSessionIdentifier(idVal);

      setArmcomMessage(opts.lookupMessage || 'Looking up profile...', '');
      var ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
      var profile = resolveProfileAfterLookup();
      var stitched = await stitchArmcomIdentity(profile, idVal);

      if (stitched && opts.successMessage) {
        setArmcomMessage(opts.successMessage, 'success');
      } else if (stitched) {
        setArmcomMessage('Profile loaded and identity linked to ECID.', 'success');
      }

      if (opts.notifyFrame) {
        var firstName =
          (profile && profile.firstName) || String(opts.firstName || '').trim() || null;
        postToSiteFrame({
          source: 'armcom-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: idVal,
          firstName: firstName,
          company: String(opts.company || '').trim(),
          mode: String(opts.mode || 'signin'),
        });
        var lookupMode = String(opts.mode || 'signin');
        if (lookupMode === 'agi-brief' && ok) {
          window.setTimeout(function () {
            if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.onSegmentQualified === 'function') {
              global.ArmcomFakeAudiences.onSegmentQualified();
            }
            postToSiteFrame({ source: 'armcom-demo-shell', type: 'armcom-segment-qualified' });
            window.setTimeout(function () {
              if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.onLinkedInActivation === 'function') {
                global.ArmcomFakeAudiences.onLinkedInActivation();
              }
              postToSiteFrame({ source: 'armcom-demo-shell', type: 'armcom-audience-activation' });
            }, 900);
          }, 800);
        }
      }

      if (typeof options.onProfileLookupComplete === 'function') {
        options.onProfileLookupComplete({
          ok: ok,
          profile: profile,
          stitched: stitched,
          email: idVal,
          company: String(opts.company || '').trim(),
          firstName:
            (profile && profile.firstName) || String(opts.firstName || '').trim() || null,
          mode: String(opts.mode || 'signin'),
        });
      }

      if (global.ArmcomFakeAudiences) {
        var lookupMode = String(opts.mode || 'signin');
        if (lookupMode === 'agi-brief' || lookupMode === 'lead-capture') {
          if (typeof global.ArmcomFakeAudiences.onLeadCapture === 'function') {
            global.ArmcomFakeAudiences.onLeadCapture(lookupMode);
          }
        } else if (lookupMode === 'signin' || lookupMode === 'register') {
          global.ArmcomFakeAudiences.advanceToAtLeast(4);
        }
        if (typeof global.ArmcomFakeAudiences.patchDrawer === 'function') {
          global.ArmcomFakeAudiences.patchDrawer();
        }
      }

      return { ok: ok, profile: profile, stitched: stitched };
    }

    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var idVal = getEmail().trim();
        if (!idVal) {
          setArmcomMessage('Enter a customer identifier first.', 'error');
          return;
        }
        await performArmcomProfileLookup(idVal, { lookupMessage: 'Looking up profile...' });
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

    if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.init === 'function') {
      global.ArmcomFakeAudiences.init({
        linkedinAdReturn: (function () {
          try {
            return new URLSearchParams(global.location.search).get('from') === 'linkedin-ad';
          } catch (_e) {
            return false;
          }
        })(),
      });
    }

    function postToSiteFrame(msg) {
      if (siteFrame && siteFrame.contentWindow) {
        siteFrame.contentWindow.postMessage(msg, '*');
      }
    }

    async function handleArmcomLabMessage(data) {
      if (!data || data.source !== 'armcom-lab') return;

      if (data.type === 'armcom-lead-capture') {
        var leadPayload = data.payload && typeof data.payload === 'object' ? data.payload : {};
        var leadEmail = String(leadPayload.email || '').trim();
        if (!leadEmail) return;
        var leadSource = String(leadPayload.source || '').trim();
        var lookupMessage =
          leadSource === 'agi-cpu-brief'
            ? 'AGI CPU brief download — looking up profile and stitching identity...'
            : 'Newsletter signup — looking up profile and stitching identity...';
        var successMessage =
          leadSource === 'agi-cpu-brief'
            ? 'Identity unified — segment qualification and LinkedIn activation follow in the demo site.'
            : 'Identity unified across arm.com and developer.arm.com. Audience synced to LinkedIn Matched Audiences.';
        await performArmcomProfileLookup(leadEmail, {
          lookupMessage: lookupMessage,
          successMessage: successMessage,
          notifyFrame: true,
          company: leadPayload.company,
          firstName: leadPayload.firstName,
          lastName: leadPayload.lastName,
          mode: leadSource === 'agi-cpu-brief' ? 'agi-brief' : 'lead-capture',
        });
        return;
      }

      if (data.type === 'login-request') {
        var email = String(data.email || '').trim();
        if (!email) return;
        var company = String(data.company || '').trim();
        var mode = String(data.mode || 'signin');
        var lookupLabel =
          mode === 'register'
            ? 'Registering Arm ID and looking up profile...'
            : 'Looking up profile and stitching identity...';
        await performArmcomProfileLookup(email, {
          lookupMessage: lookupLabel,
          successMessage:
            'Identity unified across arm.com and developer.arm.com. Audience synced to LinkedIn Matched Audiences.',
          notifyFrame: true,
          company: company,
          mode: mode,
          firstName: data.firstName,
        });
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
      performProfileLookup: performArmcomProfileLookup,
    };
  }

  global.initArmcomLab = initArmcomLab;
})(typeof window !== 'undefined' ? window : globalThis);
