/**
 * Brand-scraper generated site-clone demos — Tags injection + profile drawer (MOD / Rocco Forte pattern).
 * Prefix comes from window.envBarConfig.prefix (e.g. skynews for sky-news-demo).
 */
(function brandScraperSiteCloneLabCore(global) {
  'use strict';

  function resolvePrefix() {
    const cfg = global.envBarConfig || {};
    return String(cfg.prefix || '').trim();
  }

  function resolveStoragePrefix(prefix) {
    const env = global.SiteCloneDemoEnv || {};
    return String(env.storagePrefix || (prefix ? prefix + 'Demo' : 'brandScraperDemo')).trim();
  }

  function run() {
    if (global.__brandScraperLabCoreRan) return;
    global.__brandScraperLabCoreRan = true;

    const prefix = resolvePrefix();
    if (!prefix) return;

    const storagePrefix = resolveStoragePrefix(prefix);
    const messageId = prefix + 'Message';
    const customerEmail = document.getElementById('customerEmail');
    const nsSelect = document.getElementById(prefix + 'Ns') || document.getElementById('customerNs');
    const messageEl = document.getElementById(messageId);
    const queryProfileBtn = document.getElementById('queryProfileBtn');
    function getGeneratorTargetSelect() {
      return document.getElementById('generatorTarget');
    }
    const bcOnInjectToggle = document.getElementById(prefix + 'BcOnInjectToggle');
    const bcStyleSelect = document.getElementById(prefix + 'BcStyleSelect');
    const injectBtn = document.getElementById(prefix + 'InjectSdkBtn');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    let generatorTargets = [];

    function setMessage(text, type) {
      if (!messageEl) return;
      messageEl.textContent = text || '';
      messageEl.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      messageEl.hidden = !text;
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function webPushOnInjectDesired() {
      if (global.SiteCloneBcEnv && typeof global.SiteCloneBcEnv.webPushOnInjectDesired === 'function') {
        return global.SiteCloneBcEnv.webPushOnInjectDesired();
      }
      const el = document.getElementById(prefix + 'WebPushOnInjectToggle');
      return !!(el && el.checked);
    }

    global.__siteCloneSuppressBcEnable = true;
    if (injectBtn) {
      injectBtn.addEventListener(
        'click',
        function () {
          global.__siteCloneSuppressBcEnable = false;
        },
        true,
      );
    }

    if (typeof attachEmailDatalist === 'function') {
      attachEmailDatalist('customerEmail', 'recentEmails', nsSelect ? nsSelect.id : prefix + 'Ns');
    }
    if (typeof global.AepIdentityPicker !== 'undefined' && nsSelect) {
      global.AepIdentityPicker.init('customerEmail', nsSelect.id);
    }
    if (typeof hydrateIdentifierFromSession === 'function') {
      hydrateIdentifierFromSession('customerEmail', nsSelect ? nsSelect.id : null);
    }

    function getSelectedGeneratorTarget() {
      const selectEl = getGeneratorTargetSelect();
      const id = (selectEl && selectEl.value) || '';
      return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
    }

    const tagsInjection =
      typeof global.DemoTagsInjection !== 'undefined'
        ? global.DemoTagsInjection.init({
            storagePrefix: storagePrefix,
            identityEventType: prefix + '.identity.stitch',
            messageSetter: setMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: prefix + 'TagsCompany',
            tagsPropertyInputId: prefix + 'TagsProperty',
            tagsPropertyListId: prefix + 'TagsPropertyList',
            tagsEnvironmentId: prefix + 'TagsEnvironment',
            injectButtonId: prefix + 'InjectSdkBtn',
            selectedScriptId: prefix + 'SelectedScript',
            configFieldsId: prefix + 'SdkConfigFields',
            configSummaryId: prefix + 'SdkConfigSummary',
            configSummaryTextId: prefix + 'SdkConfigSummaryText',
            changeConfigButtonId: prefix + 'ChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: getEmail,
            iframeIds: [],
            hideTagsCompanyUi: true,
            webPush: {
              enabled: true,
              subscribeAfterInject: webPushOnInjectDesired,
              requestPermissionOnInject: webPushOnInjectDesired,
            },
            brandConcierge: {
              enabled: function () {
                return !!(bcOnInjectToggle && bcOnInjectToggle.checked);
              },
              styleKey: function () {
                return bcStyleSelect ? bcStyleSelect.value : 'miral';
              },
              suppressEnable: function () {
                return !!global.__siteCloneSuppressBcEnable;
              },
            },
          })
        : null;

    async function loadGeneratorTargets() {
      const selectEl = getGeneratorTargetSelect();
      if (!selectEl) return;
      if (
        global.AepDemoGeneratorTargets &&
        typeof global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect === 'function'
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(selectEl, {});
        return;
      }
      try {
        const res = await fetch('/api/events/generator-targets');
        const data = await res.json().catch(() => ({}));
        generatorTargets = Array.isArray(data.targets) ? data.targets : [];
        selectEl.innerHTML = '';
        if (!generatorTargets.length) {
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

    queryProfileBtn &&
      queryProfileBtn.addEventListener('click', async function () {
        const email = getEmail().trim();
        if (!email) {
          setMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setMessage('Looking up profile...', '');
        const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
        if (!ok || !tagsInjection || typeof tagsInjection.stitchAfterProfileLookup !== 'function') return;
        const profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        const stitched = await tagsInjection.stitchAfterProfileLookup(profile, email);
        if (stitched) setMessage('Profile loaded and email linked to ECID for stitching.', 'success');
      });

    if (global.AepDemoGeneratorTargets && typeof global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle === 'function') {
      global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(function () {
        return loadGeneratorTargets();
      });
    } else {
      void loadGeneratorTargets();
      if (global.AepDemoGeneratorTargets && typeof global.AepDemoGeneratorTargets.onSandboxChange === 'function') {
        global.AepDemoGeneratorTargets.onSandboxChange(function () {
          void loadGeneratorTargets();
        });
      }
    }

    if (tagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
      global.envBar.registerTagsInjection(tagsInjection);
    }

    if (typeof global.DemoProfileDrawer !== 'undefined' && typeof global.DemoProfileDrawer.init === 'function') {
      global.DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'mod-demo-page--profile-open',
        viewName: prefix,
        emailGetter: getEmail,
        messageSetter: setMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    if (typeof global.SiteCloneLoginShell !== 'undefined' && typeof global.SiteCloneLoginShell.init === 'function') {
      global.SiteCloneLoginShell.init({
        fileSlug: (global.SiteCloneDemoEnv && global.SiteCloneDemoEnv.fileSlug) || prefix,
        getEmail: getEmail,
        setMessage: setMessage,
        customerEmailEl: customerEmail,
        tagsInjection: tagsInjection,
      });
    }
  }

  if (global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(run);
  } else {
    run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
