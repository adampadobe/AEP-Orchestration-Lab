/**
 * Env bar: waits for shared/env-bar.js before Tags injection.
 */
(function (global) {
  'use strict';
  function run() {
    const customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'ferrariworldNs');

    const queryProfileBtn = document.getElementById('queryProfileBtn');
    const ferrariworldMessage = document.getElementById('ferrariworldMessage');
    const generatorTargetSelect = document.getElementById('generatorTarget');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    let generatorTargets = [];

    const ferrariworldBcOnInjectToggle = document.getElementById('ferrariworldBcOnInjectToggle');
    const ferrariworldBcStyleSelect = document.getElementById('ferrariworldBcStyleSelect');

    function ferrariworldWebPushOnInjectDesired() {
      if (typeof window.SiteCloneBcEnv !== 'undefined' && typeof window.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return window.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      const el = document.getElementById('ferrariworldWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    window.__siteCloneSuppressBcEnable = true;
    const ferrariworldInjectSdkBtn = document.getElementById('ferrariworldInjectSdkBtn');
    if (ferrariworldInjectSdkBtn) {
      ferrariworldInjectSdkBtn.addEventListener(
        'click',
        function () {
          window.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    const ferrariworldTagsInjection =
      typeof window.DemoTagsInjection !== 'undefined'
        ? window.DemoTagsInjection.init({
            storagePrefix: 'ferrariworld',
            identityEventType: 'ferrariworld.identity.stitch',
            messageSetter: setFerrariworldMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: 'ferrariworldTagsCompany',
            tagsPropertyInputId: 'ferrariworldTagsProperty',
            tagsPropertyListId: 'ferrariworldTagsPropertyList',
            tagsEnvironmentId: 'ferrariworldTagsEnvironment',
            injectButtonId: 'ferrariworldInjectSdkBtn',
            selectedScriptId: 'ferrariworldSelectedScript',
            configFieldsId: 'ferrariworldSdkConfigFields',
            configSummaryId: 'ferrariworldSdkConfigSummary',
            configSummaryTextId: 'ferrariworldSdkConfigSummaryText',
            changeConfigButtonId: 'ferrariworldChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: () => (customerEmail && customerEmail.value) || '',
            iframeIds: [],
            hideTagsCompanyUi: true,
            webPush: {
              enabled: true,
              subscribeAfterInject: ferrariworldWebPushOnInjectDesired,
              requestPermissionOnInject: ferrariworldWebPushOnInjectDesired,
            },
            brandConcierge: {
              enabled: function () { return !!(ferrariworldBcOnInjectToggle && ferrariworldBcOnInjectToggle.checked); },
              styleKey: function () { return ferrariworldBcStyleSelect ? ferrariworldBcStyleSelect.value : 'miral'; },
              suppressEnable: function () {
                return !!window.__siteCloneSuppressBcEnable;
              },
            },
            onEcidResolved: function () {
              if (typeof window.MiralCrossSite !== 'undefined') window.MiralCrossSite.retryPageView();
              var _ft2 = getSelectedGeneratorTarget();
              if (_ft2 && (_ft2.dataStreamId || _ft2.datastreamId) && typeof window.MiralCrossSite !== 'undefined') {
                window.MiralCrossSite.setDatastreamId(_ft2.dataStreamId || _ft2.datastreamId);
              }
              if (typeof AepBcToggle !== 'undefined') AepBcToggle.enableIfPrefsSet('ferrariworld');
              var ecidEl = document.getElementById('infoEcid');
              var ecid = ecidEl ? String(ecidEl.textContent || '').trim() : '';
              if (ecid && ecid !== '—' && /^\d+$/.test(ecid) && ecid.length >= 10) {
                if (typeof DemoProfileDrawer !== 'undefined' && typeof DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
                  DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
                }
              }
            },
          })
        : null;

    const ferrariworldWebPushRetryBtn = document.getElementById('ferrariworldWebPushRetryBtn');
    if (ferrariworldWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
      ferrariworldWebPushRetryBtn.addEventListener('click', function () {
        void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'ferrariworld' }).then(function (ok) {
          setFerrariworldMessage(
            ok
              ? 'Web push subscription sent.'
              : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
            ok ? 'success' : 'error',
          );
        });
      });
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function setFerrariworldMessage(text, type) {
      if (!ferrariworldMessage) return;
      ferrariworldMessage.textContent = text || '';
      ferrariworldMessage.className =
        'ferrari-world-abu-dhabi-demo-message' + (type ? ' ferrari-world-abu-dhabi-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      ferrariworldMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      const id = (generatorTargetSelect && selectEl.value) || '';
      return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
    }

    async function loadGeneratorTargets() {
      var selectEl = document.getElementById('generatorTarget');
      if (!selectEl) return;
      if (
        typeof window.AepDemoGeneratorTargets !== 'undefined' &&
        window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(selectEl, { preferredId: 'lab-event-tool-edge' });
        const _ft = getSelectedGeneratorTarget();
        if (_ft && (_ft.dataStreamId || _ft.datastreamId) && typeof window.MiralCrossSite !== 'undefined') {
          window.MiralCrossSite.setDatastreamId(_ft.dataStreamId || _ft.datastreamId);
        }
        return;
      }
      try {
        const res = await fetch('/api/events/generator-targets');
        const data = await res.json().catch(() => ({}));
        generatorTargets = Array.isArray(data.targets) ? data.targets : [];
        selectEl.innerHTML = '';
        if (generatorTargets.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No targets (check event-generator-targets.json)';
          selectEl.appendChild(opt);
          return;
        }
        generatorTargets.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.label || t.id;
          selectEl.appendChild(opt);
        });
      } catch {
        selectEl.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Failed to load targets';
        selectEl.appendChild(opt);
      }
    }

    if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle) {
      window.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(function () {
        return loadGeneratorTargets();
      });
    } else {
      void loadGeneratorTargets();
      if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
        window.AepDemoGeneratorTargets.onSandboxChange(function () {
          void loadGeneratorTargets();
        });
      }
    }

    queryProfileBtn &&
      queryProfileBtn.addEventListener('click', async () => {
        const email = getEmail().trim();
        if (!email) {
          setFerrariworldMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setFerrariworldMessage('Looking up profile...', '');
        const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        if (!ok || !ferrariworldTagsInjection || typeof ferrariworldTagsInjection.stitchAfterProfileLookup !== 'function') return;
        const profile =
          window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? window.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        const stitched = await ferrariworldTagsInjection.stitchAfterProfileLookup(profile, email);
        if (stitched) setFerrariworldMessage('Profile loaded and email linked to ECID for stitching.', 'success');
      });

    if (ferrariworldTagsInjection && window.envBar && typeof window.envBar.registerTagsInjection === 'function') {
      window.envBar.registerTagsInjection(ferrariworldTagsInjection);
    }

    (function initFerrariworldDemoFlyoutSidebar() {
      const body = document.body;
      if (!body.classList.contains('ferrari-world-abu-dhabi-demo-page')) return;
      const sidebar = document.querySelector('.dashboard-sidebar');
      if (!sidebar) return;

      const mq = window.matchMedia('(max-width: 768px)');
      let hideTimer = null;

      function clearHideTimer() {
        if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
      }

      function setFlyoutOpen(open) {
        body.classList.toggle('ferrari-world-abu-dhabi-demo-page--nav-open', open);
      }

      function scheduleClose() {
        clearHideTimer();
        hideTimer = window.setTimeout(function () { setFlyoutOpen(false); hideTimer = null; }, 450);
      }

      function onPointerMove(e) {
        if (mq.matches) return;
        if (e.clientX <= 24) { clearHideTimer(); setFlyoutOpen(true); return; }
        const r = sidebar.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (over) { clearHideTimer(); setFlyoutOpen(true); return; }
        if (body.classList.contains('ferrari-world-abu-dhabi-demo-page--nav-open')) scheduleClose();
      }

      sidebar.addEventListener('mouseenter', function () { if (!mq.matches) { clearHideTimer(); setFlyoutOpen(true); } });
      sidebar.addEventListener('mouseleave', function () { if (!mq.matches) scheduleClose(); });
      document.addEventListener('mousemove', onPointerMove, { passive: true });
      mq.addEventListener('change', function () {
        clearHideTimer();
        if (mq.matches) body.classList.remove('ferrari-world-abu-dhabi-demo-page--nav-open');
      });
      setFlyoutOpen(false);
    })();

    DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      profileOpenClass: 'ferrari-world-abu-dhabi-demo-page--profile-open',
      viewName: 'Ferrari World Abu Dhabi demo',
      emailGetter: getEmail,
      messageSetter: setFerrariworldMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      fetchBrowserEcidOnInit: true,
    });

    window.AepDemoParkStitch = window.AepDemoParkStitch || {};
    window.AepDemoParkStitch.stitch = function (email, ecid) {
      if (ferrariworldTagsInjection && typeof ferrariworldTagsInjection.stitchAfterProfileLookup === 'function') {
        var fakeProfile = ecid ? { ecid: ecid } : null;
        void ferrariworldTagsInjection.stitchAfterProfileLookup(fakeProfile, email);
      }
    };

  }

if (global.envBar && typeof global.envBar.ready === 'function') {
  global.envBar.ready().then(function () {
    run();
  });
} else {
  run();
}
})(typeof window !== 'undefined' ? window : globalThis);
