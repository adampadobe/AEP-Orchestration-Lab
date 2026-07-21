/**
 * LinkedIn demo — env bar, Tags inject, profile drawer, sponsored ad click.
 * Ad copy/CTA/URL vary by armcomFakeAudienceStage (see applyLinkedInAdVariant).
 */
(function (global) {
  'use strict';

  var ARMCOM_AD_FRAME = 'cloud-ai/data-center-ai.html';
  var ARMCOM_XDM_TENANT_KEY = '_demoemea';

  var AD_VARIANTS = {
    awareness: {
      id: 'awareness',
      sub: 'Sponsored · Cloud AI',
      body:
        '<strong>THE FUTURE IS BUILT ON ARM</strong> — Download the AGI CPU Technical Brief for rack-scale agentic AI. Compare efficiency benchmarks vs. incumbent CPUs and plan your cloud AI roadmap.',
      title: 'Download the AGI CPU Technical Brief',
      desc: 'Production silicon for converged data centers — orchestrate accelerators and thousands of agents.',
      cta: 'Apply Now',
      heroSrc: '../demos/armcom/assets/hero-agi-cpu.png',
      heroAlt: 'Arm AGI CPU Technical Brief',
      targetUrl: '../armcom-demo.html?frame=' + encodeURIComponent(ARMCOM_AD_FRAME) + '&from=linkedin-ad',
      labHint:
        'AEP lab — click ad to fire <code>armcom.paidSocial.clicked</code> and return to arm.com',
      event: {
        adName: 'AGI CPU Technical Brief',
        contentType: 'technical-brief',
        contentId: 'agi-cpu-technical-brief',
        returnVisit: false,
      },
    },
    retargeting: {
      id: 'retargeting',
      sub: 'Sponsored · Retargeting',
      body:
        '<strong>Cloud AI for infrastructure leaders</strong> — You downloaded the AGI CPU brief. See rack-scale benchmarks and efficiency comparisons on arm.com.',
      title: 'See AGI CPU benchmarks on arm.com',
      desc: 'Compare Arm AGI CPU efficiency vs. incumbent options — personalized for your Cloud AI research.',
      cta: 'Visit arm.com',
      heroSrc: '../demos/armcom/assets/compute-cloud-datacenter.jpg',
      heroAlt: 'Arm Cloud AI data center benchmarks',
      targetUrl: '../armcom-demo.html?frame=' + encodeURIComponent(ARMCOM_AD_FRAME) + '&from=linkedin-ad',
      labHint:
        'AEP lab — brief already captured; click retargeting ad to fire <code>armcom.paidSocial.clicked</code>',
      event: {
        adName: 'Cloud AI retargeting — data center benchmarks',
        contentType: 'cloud-ai-landing',
        contentId: 'data-center-ai',
        returnVisit: false,
      },
    },
    activation: {
      id: 'activation',
      sub: 'Sponsored · Matched Audiences',
      body:
        '<strong>Your Cloud AI ICP segment is active</strong> — Arm retargets infrastructure leaders in your LinkedIn Matched Audience with Cloud AI content.',
      title: 'Cloud AI for infrastructure leaders',
      desc: 'LinkedIn Matched Audiences sync complete — continue your AGI CPU research on arm.com.',
      cta: 'Visit arm.com',
      heroSrc: '../demos/armcom/assets/tab-cloud-ai.jpg',
      heroAlt: 'Arm Cloud AI infrastructure',
      targetUrl: '../armcom-demo.html?frame=' + encodeURIComponent(ARMCOM_AD_FRAME) + '&from=linkedin-ad',
      labHint:
        'AEP lab — ICP activated; click ad to fire <code>armcom.paidSocial.clicked</code> and return to arm.com',
      event: {
        adName: 'Cloud AI ICP — LinkedIn Matched Audiences',
        contentType: 'cloud-ai-landing',
        contentId: 'data-center-ai',
        returnVisit: false,
      },
    },
    'post-click': {
      id: 'post-click',
      sub: 'Sponsored · Welcome back',
      body:
        '<strong>Welcome back</strong> — Continue your Cloud AI journey on arm.com with personalized hero content and nurture follow-up.',
      title: 'Continue your Cloud AI journey',
      desc: 'Personalized arm.com experience awaits — pick up where your paid social visit left off.',
      cta: 'Return to arm.com',
      heroSrc: '../demos/armcom/assets/highlight-rethinking-ai-cpu.jpg',
      heroAlt: 'Arm Cloud AI personalized experience',
      targetUrl: '../armcom-demo.html?frame=' + encodeURIComponent(ARMCOM_AD_FRAME) + '&from=linkedin-ad',
      labHint:
        'AEP lab — return visit; click ad to fire <code>armcom.paidSocial.clicked</code> with <code>returnVisit</code>',
      event: {
        adName: 'Cloud AI retargeting — return visit',
        contentType: 'cloud-ai-landing',
        contentId: 'data-center-ai',
        returnVisit: true,
      },
    },
  };

  var currentAdVariant = AD_VARIANTS.awareness;

  function readBannerLeadCaptured() {
    try {
      var raw = global.sessionStorage.getItem('armcomBannerState');
      if (!raw) return false;
      var state = JSON.parse(raw);
      return !!(state && (state.leadCaptured || state.registered));
    } catch (_e) {
      return false;
    }
  }

  function getJourneyStage() {
    if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.getStage === 'function') {
      return global.ArmcomFakeAudiences.getStage();
    }
    try {
      var stored = parseInt(global.sessionStorage.getItem('armcomFakeAudienceStage'), 10);
      if (!isNaN(stored) && stored >= 0) return stored;
    } catch (_e) {
      /* noop */
    }
    return readBannerLeadCaptured() ? 4 : 0;
  }

  function resolveAdVariantKey(stage, fromActivation) {
    if (stage >= 7) return 'post-click';
    if (stage === 6 || fromActivation) return 'activation';
    if (stage >= 4 || readBannerLeadCaptured()) return 'retargeting';
    return 'awareness';
  }

  function applyLinkedInAdVariant(variantKey) {
    var variant = AD_VARIANTS[variantKey] || AD_VARIANTS.awareness;
    currentAdVariant = variant;
    var ad = document.getElementById('linkedinArmAd');
    if (!ad) return variant;

    ad.setAttribute('data-li-ad-variant', variant.id);
    ad.classList.toggle('li-post--sponsored-retargeting', variant.id !== 'awareness');
    ad.classList.toggle('li-post--sponsored-post-click', variant.id === 'post-click');

    var subEl = ad.querySelector('[data-li-ad-sub]');
    if (subEl) subEl.textContent = variant.sub;

    var bodyEl = ad.querySelector('[data-li-ad-body]');
    if (bodyEl) bodyEl.innerHTML = variant.body;

    var titleEl = ad.querySelector('[data-li-ad-title]');
    if (titleEl) titleEl.textContent = variant.title;

    var descEl = ad.querySelector('[data-li-ad-desc]');
    if (descEl) descEl.textContent = variant.desc;

    var heroEl = ad.querySelector('[data-li-ad-hero]');
    if (heroEl) {
      heroEl.setAttribute('src', variant.heroSrc);
      heroEl.setAttribute('alt', variant.heroAlt);
    }

    ad.querySelectorAll('[data-li-ad-cta]').forEach(function (ctaEl) {
      ctaEl.textContent = variant.cta;
    });

    var labBadge = ad.querySelector('[data-li-lab-badge]');
    if (labBadge) labBadge.innerHTML = variant.labHint;

    return variant;
  }

  function run() {
    var params;
    try {
      params = new URLSearchParams(global.location.search);
    } catch (_e) {
      params = null;
    }

    var customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function' && customerEmail) attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined' && customerEmail) AepIdentityPicker.init('customerEmail', 'linkedinArmNs');

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var linkedinArmMessage = document.getElementById('linkedinArmMessage');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var generatorTargets = [];

    function setLinkedinArmMessage(text, type) {
      if (!linkedinArmMessage) return;
      linkedinArmMessage.textContent = text || '';
      linkedinArmMessage.className =
        'social-linkedin-demo-message' + (type ? ' social-linkedin-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      linkedinArmMessage.hidden = !text;
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

    async function loadGeneratorTargets() {
      var selectEl = document.getElementById('generatorTarget');
      if (!selectEl) return;
      if (
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(selectEl, {
          preferredId: 'lab-event-tool-edge',
        });
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

    var linkedinArmTagsInjection =
      typeof global.DemoTagsInjection !== 'undefined'
        ? global.DemoTagsInjection.init({
            storagePrefix: 'linkedinArm',
            identityEventType: 'linkedin.arm.identity.stitch',
            messageSetter: setLinkedinArmMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: 'linkedinArmTagsCompany',
            tagsPropertyInputId: 'linkedinArmTagsProperty',
            tagsPropertyListId: 'linkedinArmTagsPropertyList',
            tagsEnvironmentId: 'linkedinArmTagsEnvironment',
            injectButtonId: 'linkedinArmInjectSdkBtn',
            selectedScriptId: 'linkedinArmSelectedScript',
            configFieldsId: 'linkedinArmSdkConfigFields',
            configSummaryId: 'linkedinArmSdkConfigSummary',
            configSummaryTextId: 'linkedinArmSdkConfigSummaryText',
            changeConfigButtonId: 'linkedinArmChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: getEmail,
            iframeIds: [],
            hideTagsCompanyUi: true,
          })
        : null;

    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var email = getEmail().trim();
        if (!email) {
          setLinkedinArmMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setLinkedinArmMessage('Looking up profile...', '');
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        if (!ok || !linkedinArmTagsInjection || typeof linkedinArmTagsInjection.stitchAfterProfileLookup !== 'function') return;
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await linkedinArmTagsInjection.stitchAfterProfileLookup(profile, email);
        if (stitched) setLinkedinArmMessage('Profile loaded and email linked to ECID for stitching.', 'success');
      });
    }

    if (linkedinArmTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
      global.envBar.registerTagsInjection(linkedinArmTagsInjection);
    }

    function readJsonMap(key) {
      try {
        if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
          return global.AepLabEnvBarPrefs.readMap(key) || {};
        }
        var raw = global.localStorage.getItem(key);
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_e) {
        return {};
      }
    }

    function writeJsonMap(key, mapObj, opts) {
      var options = opts || {};
      try {
        if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.writeMap === 'function') {
          if (options.silent && typeof global.AepLabEnvBarPrefs.writeMapSilent === 'function') {
            global.AepLabEnvBarPrefs.writeMapSilent(key, mapObj || {});
            return;
          }
          global.AepLabEnvBarPrefs.writeMap(key, mapObj || {});
          return;
        }
        global.localStorage.setItem(key, JSON.stringify(mapObj || {}));
      } catch (_e) {
        /* noop */
      }
    }

    function mapsJsonEqual(a, b) {
      try {
        return JSON.stringify(a || {}) === JSON.stringify(b || {});
      } catch (_eq) {
        return false;
      }
    }

    function writeJsonMapIfChanged(key, mapObj, opts) {
      var next = mapObj && typeof mapObj === 'object' ? mapObj : {};
      if (mapsJsonEqual(readJsonMap(key), next)) return false;
      writeJsonMap(key, next, opts);
      return true;
    }

    function deferHeavyWork(run) {
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(function () {
          global.setTimeout(run, 0);
        });
        return;
      }
      global.setTimeout(run, 0);
    }

    var linkedInCrossTabMirrorBusy = false;
    var linkedInCrossTabMirrorWarned = false;
    var linkedInCrossTabMirrorSessionKey = 'linkedinArmCrossTabMirrorDone';
    var LINKEDIN_MIRROR_SKIP_MAP_SUFFIXES = [
      'SelectedTagsPropertyBySandbox',
      'SelectedTagsEnvironmentBySandbox',
      'SelectedTagsCompanyBySandbox',
      'LastResolvedEcidBySandbox',
    ];

    function shouldSkipLinkedInMirrorForPrefsChange(ev) {
      if (!ev || !ev.detail || ev.detail.type !== 'map') return false;
      var key = String(ev.detail.key || '');
      for (var i = 0; i < LINKEDIN_MIRROR_SKIP_MAP_SUFFIXES.length; i++) {
        if (key.indexOf(LINKEDIN_MIRROR_SKIP_MAP_SUFFIXES[i]) !== -1) return true;
      }
      return false;
    }

    function resolveLinkedInSandboxKey() {
      var sandboxKey = '__default__';
      try {
        if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.sandboxKey === 'function') {
          var sb = '';
          if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
            sb = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
          }
          if (!sb && typeof global.AepLabEnvBarPrefs.getSelectedSandbox === 'function') {
            sb = String(global.AepLabEnvBarPrefs.getSelectedSandbox() || '').trim();
          }
          if (!sb) sb = String(global.localStorage.getItem('aepGlobalSandboxName') || '').trim();
          sandboxKey = global.AepLabEnvBarPrefs.sandboxKey(sb);
        }
      } catch (_e) {
        /* noop */
      }
      return sandboxKey;
    }

    function flushLiveEnvStripPrefsForCrossTab(sandboxKey) {
      if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.flushForSandboxKey === 'function') {
        global.SiteCloneBcEnv.flushForSandboxKey(sandboxKey);
      }
      try {
        var genSelect = global.document && global.document.getElementById('generatorTarget');
        var sb = '';
        if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
          sb = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
        }
        if (!sb) sb = String(global.localStorage.getItem('aepGlobalSandboxName') || '').trim();
        if (genSelect && sb && String(genSelect.value || '').trim()) {
          if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.writeMap === 'function') {
            var gmap = global.AepLabEnvBarPrefs.readMap('aepDemoGeneratorTargetBySandbox') || {};
            gmap[sb] = String(genSelect.value || '').trim();
            global.AepLabEnvBarPrefs.writeMap('aepDemoGeneratorTargetBySandbox', gmap);
          }
        }
      } catch (_flush) {
        /* noop */
      }
    }

    function persistLinkedInCrossTabPrefsForArm() {
      if (linkedInCrossTabMirrorBusy) return;
      linkedInCrossTabMirrorBusy = true;
      try {
        var sandboxKey = resolveLinkedInSandboxKey();
        flushLiveEnvStripPrefsForCrossTab(sandboxKey);
        var armScriptMap = readJsonMap('armcomSelectedLaunchScriptBySandbox');
        var liScriptMap = readJsonMap('linkedinArmSelectedLaunchScriptBySandbox');
        var script = String(liScriptMap[sandboxKey] || armScriptMap[sandboxKey] || '').trim();
        var mirrored = false;

        if (global.AepLabTagsInjectSession) {
          if (!script && typeof global.AepLabTagsInjectSession.readScript === 'function') {
            script = global.AepLabTagsInjectSession.readScript('linkedinArm', sandboxKey);
          }
          if (!script && typeof global.AepLabTagsInjectSession.readLocalScript === 'function') {
            script = global.AepLabTagsInjectSession.readLocalScript('linkedinArm', sandboxKey);
          }
          if (script) {
            if (typeof global.AepLabTagsInjectSession.writeScript === 'function') {
              global.AepLabTagsInjectSession.writeScript('armcom', sandboxKey, script);
            }
            if (typeof global.AepLabTagsInjectSession.writeLocalScript === 'function') {
              global.AepLabTagsInjectSession.writeLocalScript('linkedinArm', sandboxKey, script);
              global.AepLabTagsInjectSession.writeLocalScript('armcom', sandboxKey, script);
            }
          }
          if (typeof global.AepLabTagsInjectSession.writeLabEnvConfiguredLocal === 'function') {
            if (!global.AepLabTagsInjectSession.readLabEnvConfiguredLocal('linkedinArm')) {
              global.AepLabTagsInjectSession.writeLabEnvConfiguredLocal('linkedinArm', true);
              mirrored = true;
            }
            if (!global.AepLabTagsInjectSession.readLabEnvConfiguredLocal('armcom')) {
              global.AepLabTagsInjectSession.writeLabEnvConfiguredLocal('armcom', true);
              mirrored = true;
            }
          }
        }

        if (script) {
          var nextArmScriptMap = Object.assign({}, armScriptMap);
          var nextLiScriptMap = Object.assign({}, liScriptMap);
          if (nextArmScriptMap[sandboxKey] !== script) nextArmScriptMap[sandboxKey] = script;
          if (nextLiScriptMap[sandboxKey] !== script) nextLiScriptMap[sandboxKey] = script;
          if (
            writeJsonMapIfChanged('armcomSelectedLaunchScriptBySandbox', nextArmScriptMap, { silent: true }) ||
            writeJsonMapIfChanged('linkedinArmSelectedLaunchScriptBySandbox', nextLiScriptMap, { silent: true })
          ) {
            mirrored = true;
          }
          try {
            var localArmKey = 'aepDemoTagsInjectedLocal:armcom:' + sandboxKey;
            var localLiKey = 'aepDemoTagsInjectedLocal:linkedinArm:' + sandboxKey;
            if (global.localStorage.getItem(localArmKey) !== script) {
              global.localStorage.setItem(localArmKey, script);
              mirrored = true;
            }
            if (global.localStorage.getItem(localLiKey) !== script) {
              global.localStorage.setItem(localLiKey, script);
              mirrored = true;
            }
          } catch (_e0) {
            /* noop */
          }
        }

        var armCfgMap = readJsonMap('armcomSdkConfiguredBySandbox');
        var liCfgMap = readJsonMap('linkedinArmSdkConfiguredBySandbox');
        if (script) {
          var nextArmCfgMap = Object.assign({}, armCfgMap);
          var nextLiCfgMap = Object.assign({}, liCfgMap);
          if (nextArmCfgMap[sandboxKey] !== 1) nextArmCfgMap[sandboxKey] = 1;
          if (nextLiCfgMap[sandboxKey] !== 1) nextLiCfgMap[sandboxKey] = 1;
          if (
            writeJsonMapIfChanged('armcomSdkConfiguredBySandbox', nextArmCfgMap, { silent: true }) ||
            writeJsonMapIfChanged('linkedinArmSdkConfiguredBySandbox', nextLiCfgMap, { silent: true })
          ) {
            mirrored = true;
          }
        }

        if (script) {
          try {
            if (global.localStorage.getItem('aepLabEnvConfiguredLocal:armcom') !== '1') {
              global.localStorage.setItem('aepLabEnvConfiguredLocal:armcom', '1');
              mirrored = true;
            }
            if (global.localStorage.getItem('aepLabEnvConfiguredLocal:linkedinArm') !== '1') {
              global.localStorage.setItem('aepLabEnvConfiguredLocal:linkedinArm', '1');
              mirrored = true;
            }
          } catch (_e1) {
            /* noop */
          }
        }

        if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.mirrorLinkedInArmToArmcomPrefs === 'function') {
          var mirrorResult = global.AepLabEnvBarPrefs.mirrorLinkedInArmToArmcomPrefs(sandboxKey, { silent: true });
          if (mirrorResult && mirrorResult.mirrored) mirrored = true;
        }

        if (!mirrored) {
          try {
            if (global.sessionStorage.getItem(linkedInCrossTabMirrorSessionKey) === '1') return;
          } catch (_sess) {
            /* noop */
          }
        }

        try {
          global.sessionStorage.setItem(linkedInCrossTabMirrorSessionKey, '1');
        } catch (_sessSet) {
          /* noop */
        }

        if (mirrored && global.AepLabConsole) {
          global.AepLabConsole.info('tags-inject', 'LinkedIn lab — mirrored SDK config to localStorage for arm.com tab', {
            sandboxKey: sandboxKey,
            hasLaunchScript: !!script,
            hasDatastreamId: !!(
              global.AepLabEnvBarPrefs &&
              global.AepLabEnvBarPrefs.readMap &&
              String(
                (global.AepLabEnvBarPrefs.readMap('siteCloneBcDatastreamIdBySandbox') || {})[sandboxKey] || '',
              ).trim()
            ),
            hasStyleUrl: !!(
              global.AepLabEnvBarPrefs &&
              global.AepLabEnvBarPrefs.readMap &&
              String(
                (global.AepLabEnvBarPrefs.readMap('siteCloneBcStyleConfigUrlBySandbox') || {})[sandboxKey] || '',
              ).trim()
            ),
          });
        }
      } catch (err) {
        if (!linkedInCrossTabMirrorWarned && global.AepLabConsole) {
          linkedInCrossTabMirrorWarned = true;
          global.AepLabConsole.warn('tags-inject', 'LinkedIn cross-tab mirror failed (once per session)', {
            error: err && err.message ? err.message : String(err),
          });
        }
      } finally {
        linkedInCrossTabMirrorBusy = false;
      }
    }

    global.addEventListener('aep-demo-env-configured', function () {
      deferHeavyWork(persistLinkedInCrossTabPrefsForArm);
    });
    global.addEventListener('aep-lab-env-bar-prefs-change', function (ev) {
      if (shouldSkipLinkedInMirrorForPrefsChange(ev)) return;
      deferHeavyWork(persistLinkedInCrossTabPrefsForArm);
    });

    DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      profileOpenClass: 'social-linkedin-page--profile-open',
      viewName: 'LinkedIn demo',
      emailGetter: getEmail,
      messageSetter: setLinkedinArmMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      fetchBrowserEcidOnInit: true,
    });

    if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.init === 'function') {
      var linkedinInitOpts = {};
      if (params && params.get('from') === 'activation') linkedinInitOpts.linkedinActivation = true;
      global.ArmcomFakeAudiences.init(linkedinInitOpts);
    }

    var fromActivation = !!(params && params.get('from') === 'activation');
    applyLinkedInAdVariant(resolveAdVariantKey(getJourneyStage(), fromActivation));

    global.addEventListener('armcom-fake-audiences-updated', function (ev) {
      var stage =
        ev && ev.detail && typeof ev.detail.stage === 'number' ? ev.detail.stage : getJourneyStage();
      applyLinkedInAdVariant(resolveAdVariantKey(stage, fromActivation));
    });

    (function initLinkedinDemoFlyoutSidebar() {
      var body = document.body;
      if (!body.classList.contains('social-linkedin-page')) return;
      var sidebar = document.querySelector('.dashboard-sidebar');
      if (!sidebar) return;
      var mq = global.matchMedia('(max-width: 768px)');
      var hideTimer = null;
      function clearHideTimer() {
        if (hideTimer) {
          global.clearTimeout(hideTimer);
          hideTimer = null;
        }
      }
      function setFlyoutOpen(open) {
        body.classList.toggle('social-linkedin-page--nav-open', open);
      }
      function scheduleClose() {
        clearHideTimer();
        hideTimer = global.setTimeout(function () {
          setFlyoutOpen(false);
        }, 450);
      }
      sidebar.addEventListener('mouseenter', function () {
        if (!mq.matches) {
          clearHideTimer();
          setFlyoutOpen(true);
        }
      });
      sidebar.addEventListener('mouseleave', function () {
        if (!mq.matches) scheduleClose();
      });
      document.addEventListener(
        'mousemove',
        function (e) {
          if (mq.matches) return;
          if (e.clientX <= 24) {
            clearHideTimer();
            setFlyoutOpen(true);
            return;
          }
          var r = sidebar.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            clearHideTimer();
            setFlyoutOpen(true);
            return;
          }
          if (body.classList.contains('social-linkedin-page--nav-open')) scheduleClose();
        },
        { passive: true },
      );
      mq.addEventListener('change', function () {
        clearHideTimer();
        if (mq.matches) body.classList.remove('social-linkedin-page--nav-open');
      });
      setFlyoutOpen(false);
    })();

    async function sendPaidSocialClickEvent() {
      var variant = currentAdVariant || AD_VARIANTS.awareness;
      var eventMeta = variant.event || {};
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      var ecid =
        ecidText && ecidText !== '—' && ecidText !== '-' && /^\d{10,}$/.test(ecidText) ? ecidText : null;
      var email = getEmail().trim();
      var target = getSelectedGeneratorTarget();
      var body = {
        targetId: target ? target.id : undefined,
        eventType: 'armcom.paidSocial.clicked',
        viewName: 'LinkedIn sponsored ad — ' + (eventMeta.adName || variant.title),
        viewUrl: global.location.href.split('?')[0],
        channel: 'Paid Social',
        public: {
          platform: 'linkedin',
          adName: eventMeta.adName || variant.title,
          adVariant: variant.id,
          topic: 'cloud-ai',
          siteId: 'arm.com',
          cloudAiContent: true,
          intentLevel: 'high',
          returnVisit: !!eventMeta.returnVisit,
        },
        tenant: {
          b2bContent: {
            topic: 'cloud-ai',
            siteId: 'arm.com',
            intentLevel: 'high',
            contentType: eventMeta.contentType || 'cloud-ai-landing',
            contentId: eventMeta.contentId || 'data-center-ai',
            productName: 'Arm AGI CPU',
            leadSource: 'linkedin-paid-social',
          },
        },
        xdmTenantKey: ARMCOM_XDM_TENANT_KEY,
        identityMapEcidKey: 'ECID',
      };
      if (email) body.email = email;
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
        if (res.ok) {
          setLinkedinArmMessage(data.message || 'LinkedIn ad click sent to AEP.', 'success');
          if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.onLinkedInAdClick === 'function') {
            global.ArmcomFakeAudiences.onLinkedInAdClick();
          }
        }
      } catch (_e) {
        /* noop — navigation still proceeds */
      }
    }

    async function sendLinkedInOrganicNewsClickEvent(linkEl) {
      var headline = linkEl ? String(linkEl.getAttribute('data-li-news-headline') || '').trim() : '';
      var topic = linkEl ? String(linkEl.getAttribute('data-li-news-topic') || '').trim() : '';
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      var ecid =
        ecidText && ecidText !== '—' && ecidText !== '-' && /^\d{10,}$/.test(ecidText) ? ecidText : null;
      var email = getEmail().trim();
      var target = getSelectedGeneratorTarget();
      var body = {
        targetId: target ? target.id : undefined,
        eventType: 'armcom.linkedin.organic.click',
        viewName: 'LinkedIn News — organic referral',
        viewUrl: global.location.href.split('?')[0],
        channel: 'Organic Social',
        public: {
          platform: 'linkedin',
          placement: 'linkedin-news',
          headline: headline || undefined,
          topic: topic || undefined,
          siteId: 'arm.com',
          intentLevel: 'low',
        },
        tenant: {
          b2bContent: {
            topic: topic || 'cloud-ai',
            siteId: 'arm.com',
            intentLevel: 'low',
            contentType: 'linkedin-news',
            leadSource: 'linkedin-organic',
          },
        },
        xdmTenantKey: ARMCOM_XDM_TENANT_KEY,
        identityMapEcidKey: 'ECID',
      };
      if (email) body.email = email;
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
        if (res.ok) {
          setLinkedinArmMessage(data.message || 'LinkedIn News click sent to AEP.', 'success');
        }
      } catch (_e) {
        /* noop — navigation still proceeds */
      }
    }

    function markPaidAdReturnIfBriefCaptured() {
      if (!readBannerLeadCaptured() && getJourneyStage() < 4) return;
      if (global.ArmcomLinkedInReturn && typeof global.ArmcomLinkedInReturn.markPaidAdClickedAfterBrief === 'function') {
        global.ArmcomLinkedInReturn.markPaidAdClickedAfterBrief();
        return;
      }
      try {
        global.localStorage.setItem('armcomPaidAdClickedAfterBrief', '1');
      } catch (_e) {
        /* noop */
      }
      try {
        global.sessionStorage.removeItem('armcomPaidAdClickedAfterBrief');
      } catch (_e2) {
        /* noop */
      }
    }

    function openArmTargetInNewTab(url) {
      if (!url) return;
      global.open(url, '_blank', 'noopener,noreferrer');
    }

    function navigateToArmAdTarget() {
      var targetUrl = (currentAdVariant && currentAdVariant.targetUrl) || AD_VARIANTS.awareness.targetUrl;
      persistLinkedInCrossTabPrefsForArm();
      markPaidAdReturnIfBriefCaptured();
      openArmTargetInNewTab(targetUrl);
    }

    function wireArmSponsoredAd() {
      var ad = document.getElementById('linkedinArmAd');
      if (!ad) return;
      ad.addEventListener('click', function (e) {
        if (e.target.closest('.li-post__action') && !e.target.closest('[data-li-ad-cta]')) return;
        void sendPaidSocialClickEvent();
        navigateToArmAdTarget();
      });
      ad.querySelectorAll('[data-li-ad-cta]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          void sendPaidSocialClickEvent();
          navigateToArmAdTarget();
        });
      });
    }

    function wireLinkedInNewsOrganic() {
      document.querySelectorAll('[data-li-news-organic]').forEach(function (linkEl) {
        linkEl.addEventListener('click', function (ev) {
          ev.preventDefault();
          var href = linkEl.getAttribute('href') || '';
          if (!href || href === '#') return;
          if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.onLinkedInOrganicClick === 'function') {
            global.ArmcomFakeAudiences.onLinkedInOrganicClick();
          }
          persistLinkedInCrossTabPrefsForArm();
          openArmTargetInNewTab(href);
          void sendLinkedInOrganicNewsClickEvent(linkEl);
        });
      });
    }

    wireArmSponsoredAd();
    wireLinkedInNewsOrganic();

    if (params && params.get('from') === 'activation') {
      setLinkedinArmMessage(
        'Audience activated — this feed shows the Arm Cloud AI retargeting ad for your ICP segment.',
        'success',
      );
      if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.onLinkedInActivation === 'function') {
        global.ArmcomFakeAudiences.onLinkedInActivation();
      }
      applyLinkedInAdVariant(resolveAdVariantKey(getJourneyStage(), true));
    } else if (getJourneyStage() >= 4) {
      var variantLabel = (currentAdVariant && currentAdVariant.title) || 'Cloud AI retargeting';
      setLinkedinArmMessage('Journey stage ' + getJourneyStage() + ' — showing "' + variantLabel + '" ad variant.', 'success');
    }
  }

  if (global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(run);
  } else {
    run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
