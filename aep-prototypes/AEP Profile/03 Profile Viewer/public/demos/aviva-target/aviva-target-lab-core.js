/**
 * Shared Aviva Target lab wiring (Tags inject, profile drawer, env bar).
 * Used by aviva-target-demo.html and journey pages with aviva-target-journey-chrome.js.
 */
(function (global) {
  'use strict';

  function initAvivaTargetLab(options) {
    options = options || {};
    var iframeIds = Array.isArray(options.iframeIds) ? options.iframeIds : [];

    var customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'avivaTargetNs');

    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var avivaTargetMessage = document.getElementById('avivaTargetMessage');
    var generatorTargetSelect = document.getElementById('generatorTarget');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    var generatorTargets = [];

    function setAvivaTargetMessage(text, type) {
      if (!avivaTargetMessage) return;
      avivaTargetMessage.textContent = text || '';
      avivaTargetMessage.className =
        'aviva-target-demo-message' +
        (type ? ' aviva-target-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      avivaTargetMessage.hidden = !text;
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

    var avivaTargetTagsInjection =
      typeof global.DemoTagsInjection !== 'undefined'
        ? global.DemoTagsInjection.init({
            storagePrefix: 'avivaTarget',
            identityEventType: 'aviva.target.identity.stitch',
            messageSetter: setAvivaTargetMessage,
            infoEcidId: 'infoEcid',
            tagsCompanyId: 'avivaTargetTagsCompany',
            tagsPropertyInputId: 'avivaTargetTagsProperty',
            tagsPropertyListId: 'avivaTargetTagsPropertyList',
            tagsEnvironmentId: 'avivaTargetTagsEnvironment',
            injectButtonId: 'avivaTargetInjectSdkBtn',
            selectedScriptId: 'avivaTargetSelectedScript',
            configFieldsId: 'avivaTargetSdkConfigFields',
            configSummaryId: 'avivaTargetSdkConfigSummary',
            configSummaryTextId: 'avivaTargetSdkConfigSummaryText',
            changeConfigButtonId: 'avivaTargetChangeSdkConfigBtn',
            getSelectedGeneratorTarget: getSelectedGeneratorTarget,
            getEmail: function () {
              return getEmail();
            },
            iframeIds: iframeIds,
            hideTagsCompanyUi: true,
          })
        : null;

    async function loadGeneratorTargets() {
      if (!generatorTargetSelect) return;
      if (
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(
          generatorTargetSelect,
          {},
        );
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
        var idVal = getEmail().trim();
        if (!idVal) {
          setAvivaTargetMessage('Enter an ECID or email first.', 'error');
          return;
        }
        setAvivaTargetMessage('Looking up profile...', '');
        var ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
        if (
          !ok ||
          !avivaTargetTagsInjection ||
          typeof avivaTargetTagsInjection.stitchAfterProfileLookup !== 'function'
        ) {
          return;
        }
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await avivaTargetTagsInjection.stitchAfterProfileLookup(profile, idVal);
        if (stitched) {
          setAvivaTargetMessage('Profile loaded and identity linked to ECID for Target audiences.', 'success');
        }
      });
    }

    if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'aviva-target-demo-page--profile-open',
        viewName: 'Aviva Target demo',
        emailGetter: getEmail,
        messageSetter: setAvivaTargetMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }
if (avivaTargetTagsInjection && global.envBar && typeof global.envBar.registerTagsInjection === 'function') {
  global.envBar.registerTagsInjection(avivaTargetTagsInjection);
}

    return {
      tagsInjection: avivaTargetTagsInjection,
      setMessage: setAvivaTargetMessage,
    };
  }

  global.initAvivaTargetLab = initAvivaTargetLab;
})(typeof window !== 'undefined' ? window : globalThis);
