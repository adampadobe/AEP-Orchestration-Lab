/**
 * Rocco Forte Hotels demo — lab env strip + Tags injection (Sky / MOD pattern).
 */
(function roccoForteDemoBoot(global) {
  function run() {
    const cfg = global.roccoForteDemoConfig || {};
    const viewName = cfg.viewName || 'Rocco Forte Hotels';
    const customerEmail = document.getElementById('customerEmail');
    const roccoForteNs = document.getElementById('roccoForteNs');

    function getIdentityNamespace() {
      let ns = 'email';
      try {
        if (typeof AepIdentityPicker !== 'undefined' && typeof AepIdentityPicker.getNamespace === 'function') {
          ns = AepIdentityPicker.getNamespace('customerEmail') || 'email';
        } else if (roccoForteNs && roccoForteNs.value) {
          ns = String(roccoForteNs.value).trim().toLowerCase();
        }
      } catch {
        /* noop */
      }
      return ns;
    }

    function rememberRoccoForteSessionIdentifier(value) {
      if (typeof setSessionIdentifier !== 'function') return;
      setSessionIdentifier(value, getIdentityNamespace());
    }

    function hydrateNamespaceFromSession() {
      try {
        const raw = global.sessionStorage.getItem('aep-demo-session-identifier-v1');
        if (!raw || !roccoForteNs) return;
        const o = JSON.parse(raw);
        if (!o || typeof o.ns !== 'string' || !o.ns.trim()) return;
        roccoForteNs.value = o.ns.trim().toLowerCase();
      } catch {
        /* noop */
      }
    }

    if (typeof attachEmailDatalist === 'function') {
      attachEmailDatalist('customerEmail', 'recentEmails', 'roccoForteNs');
    }
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'roccoForteNs');
    hydrateNamespaceFromSession();
    if (typeof hydrateIdentifierFromSession === 'function') {
      hydrateIdentifierFromSession('customerEmail', 'roccoForteNs');
    }
    if (roccoForteNs) {
      roccoForteNs.addEventListener('change', function () {
        global.requestAnimationFrame(function () {
          if (typeof hydrateIdentifierFromSession === 'function') {
            hydrateIdentifierFromSession('customerEmail', 'roccoForteNs');
          }
        });
      });
    }

    const queryProfileBtn = document.getElementById('queryProfileBtn');
    const generatorTargetSelect = document.getElementById('generatorTarget');
    const roccoForteMessage = document.getElementById('roccoForteMessage');
    const roccoForteBcOnInjectToggle = document.getElementById('roccoForteBcOnInjectToggle');
    const roccoForteBcStyleSelect = document.getElementById('roccoForteBcStyleSelect');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    let generatorTargets = [];

    function roccoForteWebPushOnInjectDesired() {
      if (typeof global.SiteCloneBcEnv !== 'undefined' && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      const el = document.getElementById('roccoForteWebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    global.__siteCloneSuppressBcEnable = true;
    const roccoForteInjectSdkBtn = document.getElementById('roccoForteInjectSdkBtn');
    if (roccoForteInjectSdkBtn) {
      roccoForteInjectSdkBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    const roccoForteTagsInjection =
      typeof global.DemoTagsInjection !== 'undefined'
        ? global.DemoTagsInjection.init({
            storagePrefix: 'roccoForteDemo',
            identityEventType: 'roccoforte.identity.stitch',
            messageSetter: setRoccoForteMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: 'roccoForteTagsCompany',
            tagsPropertyInputId: 'roccoForteTagsProperty',
            tagsPropertyListId: 'roccoForteTagsPropertyList',
            tagsEnvironmentId: 'roccoForteTagsEnvironment',
            injectButtonId: 'roccoForteInjectSdkBtn',
            selectedScriptId: 'roccoForteSelectedScript',
            configFieldsId: 'roccoForteSdkConfigFields',
            configSummaryId: 'roccoForteSdkConfigSummary',
            configSummaryTextId: 'roccoForteSdkConfigSummaryText',
            changeConfigButtonId: 'roccoForteChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: () => (customerEmail && customerEmail.value) || '',
            iframeIds: [],
            hideTagsCompanyUi: true,
            webPush: {
              enabled: true,
              subscribeAfterInject: roccoForteWebPushOnInjectDesired,
              requestPermissionOnInject: roccoForteWebPushOnInjectDesired,
            },
            brandConcierge: {
              enabled: function () {
                return !!(roccoForteBcOnInjectToggle && roccoForteBcOnInjectToggle.checked);
              },
              styleKey: function () {
                return roccoForteBcStyleSelect ? roccoForteBcStyleSelect.value : 'miral';
              },
              suppressEnable: function () {
                return !!global.__siteCloneSuppressBcEnable;
              },
            },
          })
        : null;

    const roccoForteWebPushRetryBtn = document.getElementById('roccoForteWebPushRetryBtn');
    if (roccoForteWebPushRetryBtn && typeof global.AepDemoWebPush !== 'undefined') {
      roccoForteWebPushRetryBtn.addEventListener('click', function () {
        void global.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'roccoForteDemo' }).then(function (ok) {
          setRoccoForteMessage(
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

    function setRoccoForteMessage(text, type) {
      if (!roccoForteMessage) return;
      roccoForteMessage.textContent = text || '';
      roccoForteMessage.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      roccoForteMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
    }

    async function loadGeneratorTargets() {
      if (!generatorTargetSelect) return;
      if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
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

    async function performProfileLookup(options) {
      const opts = options || {};
      const idVal = getEmail().trim();
      if (!idVal) return false;
      if (opts.remember !== false) rememberRoccoForteSessionIdentifier(idVal);
      if (opts.showMessage) setRoccoForteMessage('Looking up profile...', '');
      const ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: !!opts.showMessage });
      if (!ok) return false;
      if (roccoForteTagsInjection && typeof roccoForteTagsInjection.stitchAfterProfileLookup === 'function') {
        const profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        const stitched = await roccoForteTagsInjection.stitchAfterProfileLookup(profile, idVal);
        if (stitched && opts.showMessage) {
          setRoccoForteMessage('Profile loaded and email linked to ECID for stitching.', 'success');
        }
      }
      return true;
    }

    queryProfileBtn &&
      queryProfileBtn.addEventListener('click', async () => {
        const idVal = getEmail().trim();
        if (!idVal) {
          setRoccoForteMessage('Enter a customer identifier first.', 'error');
          return;
        }
        await performProfileLookup({ showMessage: true });
      });

    void loadGeneratorTargets();
    if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
      global.AepDemoGeneratorTargets.onSandboxChange(function () {
        void loadGeneratorTargets();
      });
    }

    if (roccoForteTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
      global.envBar.registerTagsInjection(roccoForteTagsInjection);
    }

    (function initRoccoForteFlyoutSidebar() {
      const body = document.body;
      if (!body.classList.contains('rocco-forte-demo-page')) return;
      const sidebar = document.querySelector('.dashboard-sidebar');
      if (!sidebar) return;

      const mq = global.matchMedia('(max-width: 768px)');
      let hideTimer = null;

      function clearHideTimer() {
        if (hideTimer) {
          global.clearTimeout(hideTimer);
          hideTimer = null;
        }
      }

      function setFlyoutOpen(open) {
        body.classList.toggle('mod-demo-page--nav-open', open);
      }

      function scheduleClose() {
        clearHideTimer();
        hideTimer = global.setTimeout(function () {
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
      viewName: viewName,
      emailGetter: getEmail,
      messageSetter: setRoccoForteMessage,
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      fetchBrowserEcidOnInit: true,
    });

    void performProfileLookup({ showMessage: false, remember: false });

    const LAB_SOURCE = 'rocco-forte-lab';
    const SHELL_SOURCE = 'rocco-forte-demo-shell';

    async function handleRoccoForteLabMessage(data) {
      if (!data || data.source !== LAB_SOURCE) return;
      if (data.type !== 'login-request') return;
      const email = String(data.email || '').trim();
      if (!email) return;
      if (customerEmail) customerEmail.value = email;
      setRoccoForteMessage('Looking up profile...', '');
      const ok = await performProfileLookup({ showMessage: true, remember: true });
      const profile =
        global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
          ? global.DemoProfileDrawer.getLastLookedUpProfile()
          : null;
      global.postMessage(
        {
          source: SHELL_SOURCE,
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile && profile.firstName ? profile.firstName : null,
        },
        '*',
      );
    }

    global.addEventListener('message', function (ev) {
      void handleRoccoForteLabMessage(ev.data);
    });

    if (typeof cfg.onReady === 'function') {
      cfg.onReady({ setMessage: setRoccoForteMessage });
    }
  }

  if (global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(run);
  } else {
    run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
