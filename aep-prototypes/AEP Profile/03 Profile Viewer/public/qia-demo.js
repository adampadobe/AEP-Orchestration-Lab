(function (global) {
  'use strict';

  function run() {
    const customerEmail = document.getElementById('customerEmail');
    const namespaceSelect = document.getElementById('qiaNs');
    const generatorTargetSelect = document.getElementById('generatorTarget');
    const queryProfileBtn = document.getElementById('queryProfileBtn');
    const message = document.getElementById('qiaMessage');
    const frame = document.getElementById('qiaSiteFrame');
    let generatorTargets = [];

    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail', 'recentEmails', 'qiaNs');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'qiaNs');

    function getIdentifier() {
      return customerEmail ? customerEmail.value.trim() : '';
    }

    function setMessage(text, type) {
      if (!message) return;
      message.textContent = text || '';
      message.className = 'qia-demo-message' + (type ? ' qia-demo-message--' + type : '');
      message.hidden = !text;
    }

    function selectedTarget() {
      const id = generatorTargetSelect ? generatorTargetSelect.value : '';
      return generatorTargets.find(function (target) { return target.id === id; }) || generatorTargets[0] || null;
    }

    async function loadTargets() {
      if (!generatorTargetSelect) return;
      if (global.AepDemoGeneratorTargets && global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
      }
    }

    const bcToggle = document.getElementById('qiaBcOnInjectToggle');
    const bcStyle = document.getElementById('qiaBcStyleSelect');
    global.__siteCloneSuppressBcEnable = true;
    const injectButton = document.getElementById('qiaInjectSdkBtn');
    if (injectButton) injectButton.addEventListener('click', function () { global.__siteCloneSuppressBcEnable = false; }, true);

    const tagsInjection = global.DemoTagsInjection
      ? global.DemoTagsInjection.init({
          storagePrefix: 'qiaDemo',
          identityEventType: 'qia.demo.identity.stitch',
          messageSetter: setMessage,
          infoEcidId: 'infoEcid',
          tagsCompanyId: 'qiaTagsCompany',
          tagsPropertyInputId: 'qiaTagsProperty',
          tagsPropertyListId: 'qiaTagsPropertyList',
          tagsEnvironmentId: 'qiaTagsEnvironment',
          injectButtonId: 'qiaInjectSdkBtn',
          selectedScriptId: 'qiaSelectedScript',
          configFieldsId: 'qiaSdkConfigFields',
          configSummaryId: 'qiaSdkConfigSummary',
          configSummaryTextId: 'qiaSdkConfigSummaryText',
          changeConfigButtonId: 'qiaChangeSdkConfigBtn',
          getSelectedGeneratorTarget: selectedTarget,
          getEmail: getIdentifier,
          iframeIds: [],
          hideTagsCompanyUi: true,
          webPush: {
            enabled: true,
            subscribeAfterInject: function () {
              const toggle = document.getElementById('qiaWebPushOnInjectToggle');
              return !!(toggle && toggle.checked);
            },
            requestPermissionOnInject: function () {
              const toggle = document.getElementById('qiaWebPushOnInjectToggle');
              return !!(toggle && toggle.checked);
            },
          },
          brandConcierge: {
            enabled: function () { return !!(bcToggle && bcToggle.checked); },
            styleKey: function () { return bcStyle ? bcStyle.value : 'generic'; },
            suppressEnable: function () { return !!global.__siteCloneSuppressBcEnable; },
          },
        })
      : null;

    async function lookUpProfile(identifier) {
      if (!identifier) {
        setMessage('Enter a profile identifier first.', 'error');
        return false;
      }
      if (customerEmail) customerEmail.value = identifier;
      setMessage('Looking up profile…', '');
      const ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(identifier, { updateMessage: true });
      const profile = global.DemoProfileDrawer.getLastLookedUpProfile
        ? global.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
      if (ok && tagsInjection && tagsInjection.stitchAfterProfileLookup) {
        await tagsInjection.stitchAfterProfileLookup(profile, identifier);
      }
      return ok;
    }

    if (queryProfileBtn) queryProfileBtn.addEventListener('click', function () { void lookUpProfile(getIdentifier()); });

    async function sendExperience(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      const target = selectedTarget();
      const ecidNode = document.getElementById('infoEcid');
      const ecid = ecidNode && /^\d{10,}$/.test(ecidNode.textContent.trim()) ? ecidNode.textContent.trim() : '';
      const body = {
        targetId: target ? target.id : undefined,
        eventType: String(p.eventType || 'qia.demo.plan.explore'),
        viewName: String(p.viewName || 'QIA orchestration plan'),
        viewUrl: location.href.split('?')[0],
        channel: 'Web',
        public: p.public && typeof p.public === 'object' ? p.public : {},
        xdmTenantKey: '_demoemea',
        identityMapEcidKey: 'ECID',
      };
      if (getIdentifier()) body.email = getIdentifier();
      if (ecid) body.ecid = ecid;
      const postBody = global.AepDemoGeneratorTargets && global.AepDemoGeneratorTargets.augmentGeneratorPostBody
        ? global.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
        : body;
      try {
        const response = await fetch('/api/events/generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(data.error || data.message || 'Event request failed.');
        setMessage((data.message || 'Demo planning event sent to AEP.') + (data.requestId ? ' Request ID: ' + data.requestId : ''), 'success');
      } catch (error) {
        setMessage(error.message || 'Network error.', 'error');
      }
    }

    function openBrandConcierge() {
      const fab = document.getElementById('siteCloneBcFab');
      if (fab && !fab.hidden) {
        fab.click();
        setMessage('External Brand Concierge opened for the customer-initiated handoff.', 'success');
        return true;
      }
      setMessage('Brand Concierge handoff is ready. Inject or enable the externally trained Concierge from the Lab bar, then retry.', 'error');
      return false;
    }

    global.addEventListener('message', function (event) {
      if (!frame || event.source !== frame.contentWindow || !event.data || event.data.source !== 'qia-demo-site') return;
      if (event.data.type === 'experience') void sendExperience(event.data.payload);
      if (event.data.type === 'profile-request') void lookUpProfile(String(event.data.identifier || '').trim());
      if (event.data.type === 'set-identifier' && customerEmail) customerEmail.value = String(event.data.identifier || '').trim();
      if (event.data.type === 'open-brand-concierge') {
        const opened = openBrandConcierge();
        frame.contentWindow.postMessage({ source: 'qia-demo-shell', type: 'brand-concierge-status', opened: opened }, '*');
      }
    });

    if (global.AepDemoGeneratorTargets && global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle) {
      global.AepDemoGeneratorTargets.bindGeneratorTargetLifecycle(loadTargets);
    } else {
      void loadTargets();
    }

    if (tagsInjection && global.envBar && global.envBar.registerTagsInjection) global.envBar.registerTagsInjection(tagsInjection);

    global.DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      namespaceSelectId: namespaceSelect ? 'qiaNs' : undefined,
      profileOpenClass: 'qia-demo-page--profile-open',
      viewName: 'QIA orchestration plan demo',
      emailGetter: getIdentifier,
      messageSetter: setMessage,
      getSelectedGeneratorTarget: selectedTarget,
      fetchBrowserEcidOnInit: true,
    });
  }

  if (global.envBar && typeof global.envBar.ready === 'function') global.envBar.ready().then(run);
  else run();
})(typeof window !== 'undefined' ? window : globalThis);
