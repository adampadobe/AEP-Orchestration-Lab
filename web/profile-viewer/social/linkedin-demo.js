/**
 * LinkedIn (Arm) demo — env bar, Tags inject, profile drawer, sponsored ad click.
 */
(function (global) {
  'use strict';

  var ARMCOM_AD_TARGET = '../armcom-demo.html?frame=cloud-ai/data-center-ai.html&from=linkedin-ad';
  var ARMCOM_XDM_TENANT_KEY = '_demoemea';

  function run() {
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
      if (!generatorTargetSelect) return;
      if (
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {
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

    DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      profileOpenClass: 'social-linkedin-page--profile-open',
      viewName: 'LinkedIn (Arm) demo',
      emailGetter: getEmail,
      messageSetter: setLinkedinArmMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      fetchBrowserEcidOnInit: true,
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
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      var ecid =
        ecidText && ecidText !== '—' && ecidText !== '-' && /^\d{10,}$/.test(ecidText) ? ecidText : null;
      var email = getEmail().trim();
      var target = getSelectedGeneratorTarget();
      var body = {
        targetId: target ? target.id : undefined,
        eventType: 'armcom.paidSocial.clicked',
        viewName: 'LinkedIn sponsored ad',
        viewUrl: global.location.href.split('?')[0],
        channel: 'Paid Social',
        public: {
          platform: 'linkedin',
          adName: 'AGI CPU Technical Brief',
          topic: 'cloud-ai',
          siteId: 'arm.com',
          cloudAiContent: true,
          intentLevel: 'high',
        },
        tenant: {
          b2bContent: {
            topic: 'cloud-ai',
            siteId: 'arm.com',
            intentLevel: 'high',
            contentType: 'technical-brief',
            contentId: 'agi-cpu-technical-brief',
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
        }
      } catch (_e) {
        /* noop — navigation still proceeds */
      }
    }

    function wireArmSponsoredAd() {
      var ad = document.getElementById('linkedinArmAd');
      if (!ad) return;
      ad.addEventListener('click', function (e) {
        if (e.target.closest('.li-post__action')) return;
        void sendPaidSocialClickEvent();
        global.location.href = ARMCOM_AD_TARGET;
      });
      ad.querySelectorAll('[data-li-ad-cta]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          void sendPaidSocialClickEvent();
          global.location.href = ARMCOM_AD_TARGET;
        });
      });
    }

    wireArmSponsoredAd();

    var params;
    try {
      params = new URLSearchParams(global.location.search);
    } catch (_e) {
      params = null;
    }
    if (params && params.get('from') === 'activation') {
      setLinkedinArmMessage('Audience activated — this feed shows the Arm AGI CPU sponsored ad.', 'success');
    }
  }

  if (global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(run);
  } else {
    run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
