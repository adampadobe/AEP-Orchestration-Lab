/**
 * Sky demo — saved sky.com homepage in iframe + lab env strip (British Army / MOD pattern).
 * Waits for shared/env-bar.js before Tags injection (env bar loads demo-tags-injection.js).
 */
(function skyDemoBoot(global) {
  function run() {
    const customerEmail = document.getElementById('customerEmail');
    const skyNs = document.getElementById('skyNs');

    function rememberSkySessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      let ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (skyNs && skyNs.value) {
          ns = String(skyNs.value).trim().toLowerCase();
        }
      } catch {
        /* noop */
      }
      setSessionIdentifier(value, ns);
    }

    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail', 'recentEmails', 'skyNs');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'skyNs');
    if (typeof hydrateIdentifierFromSession === 'function') hydrateIdentifierFromSession('customerEmail', 'skyNs');
    if (skyNs) {
      skyNs.addEventListener('change', function () {
        global.requestAnimationFrame(function () {
          if (typeof hydrateIdentifierFromSession === 'function') {
            hydrateIdentifierFromSession('customerEmail', 'skyNs');
          }
        });
      });
    }

    const queryProfileBtn = document.getElementById('queryProfileBtn');
    const generatorTargetSelect = document.getElementById('generatorTarget');
    const skyMessage = document.getElementById('skyMessage');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    let generatorTargets = [];

    const skyBcOnInjectToggle = document.getElementById('skyBcOnInjectToggle');
    const skyBcStyleSelect = document.getElementById('skyBcStyleSelect');

    function skyWebPushOnInjectDesired() {
      if (typeof window.SiteCloneBcEnv !== 'undefined' && typeof window.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return window.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      const el = document.getElementById('skyWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    window.__siteCloneSuppressBcEnable = true;
    const skyInjectSdkBtn = document.getElementById('skyInjectSdkBtn');
    if (skyInjectSdkBtn) {
      skyInjectSdkBtn.addEventListener(
        'click',
        function () {
          window.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function setSkyMessage(text, type) {
      if (!skyMessage) return;
      skyMessage.textContent = text || '';
      skyMessage.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      skyMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
    }

    function normaliseEcidDigits(raw) {
      const v = String(raw || '').trim();
      if (!v || v === '—' || v === '-') return '';
      return /^\d+$/.test(v) && v.length >= 10 ? v : '';
    }

    function refreshSkyDrawerEvents() {
      if (typeof DemoProfileDrawer === 'undefined') return;
      if (typeof DemoProfileDrawer.refreshDrawerEventsForLoadedProfile === 'function') {
        void DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        global.setTimeout(function () {
          void DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        }, 2500);
        global.setTimeout(function () {
          void DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        }, 8000);
        return;
      }
      const ecidEl = document.getElementById('infoEcid');
      const ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      const id = normaliseEcidDigits(ecidText);
      if (!id || typeof DemoProfileDrawer.refreshDrawerEventsForIdentity !== 'function') {
        return;
      }
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(id, 'ecid');
      global.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(id, 'ecid');
      }, 2500);
      global.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(id, 'ecid');
      }, 8000);
    }

    async function stitchSkyProfileIfReady(ecid) {
      const email = getEmail().trim();
      if (!email || !skyTagsInjection || typeof skyTagsInjection.stitchAfterProfileLookup !== 'function') {
        return false;
      }
      const profile =
        global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
          ? global.DemoProfileDrawer.getLastLookedUpProfile()
          : null;
      const ecidDigits = normaliseEcidDigits(ecid);
      const profileForStitch = profile || (ecidDigits ? { ecid: ecidDigits } : null);
      return skyTagsInjection.stitchAfterProfileLookup(profileForStitch, email);
    }

    async function performProfileLookup(options) {
      const opts = options || {};
      const idVal = getEmail().trim();
      if (!idVal) return false;
      if (opts.remember !== false) rememberSkySessionIdentifier(idVal);
      if (opts.showMessage) setSkyMessage('Looking up profile...', '');
      const ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: !!opts.showMessage });
      if (!ok) return false;
      const stitched = await stitchSkyProfileIfReady();
      if (stitched && opts.showMessage) {
        setSkyMessage('Profile loaded and email linked to ECID for stitching.', 'success');
      }
      const profile =
        global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
          ? global.DemoProfileDrawer.getLastLookedUpProfile()
          : null;
      const ecid =
        profile && profile.ecid != null && String(profile.ecid).length >= 10
          ? String(profile.ecid)
          : normaliseEcidDigits(document.getElementById('infoEcid') && document.getElementById('infoEcid').textContent);
      if (ecid) refreshSkyDrawerEvents();
      return true;
    }

    function onSkyEcidResolved(ecid) {
      if (typeof global.AepBcToggle !== 'undefined' && typeof global.AepBcToggle.enableIfPrefsSet === 'function') {
        global.AepBcToggle.enableIfPrefsSet('skyDemo');
      }
      const ecidDigits = normaliseEcidDigits(ecid);
      if (ecidDigits) refreshSkyDrawerEvents();
      void stitchSkyProfileIfReady(ecidDigits);
    }

    const skyTagsInjection =
      typeof window.DemoTagsInjection !== 'undefined'
        ? window.DemoTagsInjection.init({
            storagePrefix: 'skyDemo',
            identityEventType: 'sky.identity.stitch',
            messageSetter: setSkyMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: 'skyTagsCompany',
            tagsPropertyInputId: 'skyTagsProperty',
            tagsPropertyListId: 'skyTagsPropertyList',
            tagsEnvironmentId: 'skyTagsEnvironment',
            injectButtonId: 'skyInjectSdkBtn',
            selectedScriptId: 'skySelectedScript',
            configFieldsId: 'skySdkConfigFields',
            configSummaryId: 'skySdkConfigSummary',
            configSummaryTextId: 'skySdkConfigSummaryText',
            changeConfigButtonId: 'skyChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: () => getEmail(),
            iframeIds: [],
            hideTagsCompanyUi: true,
            webPush: {
              enabled: true,
              subscribeAfterInject: skyWebPushOnInjectDesired,
              requestPermissionOnInject: skyWebPushOnInjectDesired,
            },
            brandConcierge: {
              enabled: function () {
                return !!(skyBcOnInjectToggle && skyBcOnInjectToggle.checked);
              },
              styleKey: function () {
                return skyBcStyleSelect ? skyBcStyleSelect.value : 'miral';
              },
              suppressEnable: function () {
                return !!window.__siteCloneSuppressBcEnable;
              },
            },
            onEcidResolved: onSkyEcidResolved,
          })
        : null;

    const skyWebPushRetryBtn = document.getElementById('skyWebPushRetryBtn');
    if (skyWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
      skyWebPushRetryBtn.addEventListener('click', function () {
        void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'skyDemo' }).then(function (ok) {
          setSkyMessage(
            ok
              ? 'Web push subscription sent.'
              : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
            ok ? 'success' : 'error',
          );
        });
      });
    }

    async function loadGeneratorTargets() {
      if (!generatorTargetSelect) return;
      if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
        generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
        return;
      }
      try {
        const res = await fetch('/api/events/generator-targets');
        const data = await res.json().catch(() => ({}));
        generatorTargets = Array.isArray(data.targets) ? data.targets : [];
        generatorTargetSelect.innerHTML = '';
        if (generatorTargets.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No targets (check event-generator-targets.json)';
          generatorTargetSelect.appendChild(opt);
          return;
        }
        generatorTargets.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.label || t.id;
          generatorTargetSelect.appendChild(opt);
        });
      } catch {
        generatorTargetSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Failed to load targets';
        generatorTargetSelect.appendChild(opt);
      }
    }

    queryProfileBtn &&
      queryProfileBtn.addEventListener('click', async function () {
        const email = getEmail().trim();
        if (!email) {
          setSkyMessage('Enter a customer identifier first.', 'error');
          return;
        }
        await performProfileLookup({ showMessage: true });
      });

    void loadGeneratorTargets();
    if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
      window.AepDemoGeneratorTargets.onSandboxChange(function () {
        void loadGeneratorTargets();
      });
    }

    if (skyTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
      global.envBar.registerTagsInjection(skyTagsInjection);
    }

    (function initSkyDemoFlyoutSidebar() {
      const body = document.body;
      if (!body.classList.contains('sky-demo-page')) return;
      const sidebar = document.querySelector('.dashboard-sidebar');
      if (!sidebar) return;

      const mq = window.matchMedia('(max-width: 768px)');
      let hideTimer = null;

      function clearHideTimer() {
        if (hideTimer) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
      }

      function setFlyoutOpen(open) {
        body.classList.toggle('mod-demo-page--nav-open', open);
      }

      function scheduleClose() {
        clearHideTimer();
        hideTimer = window.setTimeout(function () {
          setFlyoutOpen(false);
          hideTimer = null;
        }, 450);
      }

      function onPointerMove(e) {
        if (mq.matches) return;
        if (e.clientX <= 24) {
          clearHideTimer();
          setFlyoutOpen(true);
          return;
        }
        const r = sidebar.getBoundingClientRect();
        const over =
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (over) {
          clearHideTimer();
          setFlyoutOpen(true);
          return;
        }
        if (body.classList.contains('mod-demo-page--nav-open')) {
          scheduleClose();
        }
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

      document.addEventListener('mousemove', onPointerMove, { passive: true });

      mq.addEventListener('change', function () {
        clearHideTimer();
        if (mq.matches) body.classList.remove('mod-demo-page--nav-open');
      });

      setFlyoutOpen(false);
    })();

    DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      profileOpenClass: 'mod-demo-page--profile-open',
      viewName: 'Sky',
      emailGetter: getEmail,
      messageSetter: setSkyMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      fetchBrowserEcidOnInit: true,
      afterBrowserEcidApplied: function (ecid) {
        refreshSkyDrawerEvents();
        void stitchSkyProfileIfReady(ecid);
      },
    });

    void performProfileLookup({ showMessage: false, remember: false });
  }

  if (global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(run);
  } else {
    run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
