/**
 * Live status sync for the Spectrum env bar (Sky pilot).
 */
(function attachDemoEnvBarSpectrumSync(global) {
  'use strict';

  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function formatNow() {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date());
    } catch (_e) {
      return new Date().toLocaleString();
    }
  }

  function setDotState(dotEl, statusEl, ok, okText, badText) {
    if (dotEl) {
      dotEl.classList.toggle('spectrum-env-dot--green', !!ok);
    }
    if (statusEl) statusEl.textContent = ok ? okText : badText;
  }

  function init(cfg) {
    var c = cfg || {};
    var prefix = String(c.prefix || '').trim();
    if (!prefix) return;

    var tagsEnv = byId(prefix + 'TagsEnvironment');
    var tagsProperty = byId(prefix + 'TagsProperty');
    var fields = byId(prefix + 'SdkConfigFields');
    var summary = byId(prefix + 'SdkConfigSummary');
    var scriptCode = byId(c.selectedScriptId || prefix + 'SelectedScript');
    var generatorTarget = byId('generatorTarget');
    var infoEcid = byId('infoEcid');
    var styleResolved = byId('siteCloneBcStyleConfigResolved');

    var envPill = byId('aepSpectrumEnvPill');
    var sandboxPill = byId('aepSpectrumSandboxPill');
    var sandboxSelect = byId('sandboxSelect');
    var propertyStatus = byId('aepSpectrumPropertyStatus');
    var sdkStatus = byId('aepSpectrumSdkStatus');
    var sdkDot = byId('aepSpectrumSdkDot');
    var scriptsBtn = byId('aepSpectrumScriptsCount');
    var lastUpdated = byId('aepSpectrumLastUpdated');
    var targetBadge = byId('aepSpectrumTargetSdkBadge');
    var targetMeta = byId('aepSpectrumTargetSdkMeta');
    var bcPillModal = byId('aepSpectrumBcPillModal');
    var bcPillInjected = byId('aepSpectrumBcPillInjected');
    var bcPillEnv = byId('aepSpectrumBcPillEnv');
    var bcPillScripts = byId('aepSpectrumBcPillScripts');
    var ecidCopy = byId('aepSpectrumEcidCopy');

    function sandboxLabel() {
      var v = '';
      try {
        if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
          v = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
        }
      } catch (_e) {
        /* noop */
      }
      if (!v && sandboxSelect && sandboxSelect.selectedIndex >= 0) {
        var opt = sandboxSelect.options[sandboxSelect.selectedIndex];
        v = opt ? String(opt.textContent || opt.value || '').trim() : '';
      }
      if (!v && sandboxSelect) v = String(sandboxSelect.value || '').trim();
      return v || 'Default';
    }

    function tagsEnvLabel() {
      if (!tagsEnv || tagsEnv.selectedIndex < 0) return 'Development';
      var opt = tagsEnv.options[tagsEnv.selectedIndex];
      var text = opt ? String(opt.textContent || '').trim() : '';
      if (!text) return 'Development';
      var bracket = text.match(/\[([^\]]+)\]/);
      return bracket ? bracket[1] : text.split(/\s+/)[0] || text;
    }

    function scriptText() {
      return scriptCode ? String(scriptCode.textContent || '').trim() : '';
    }

    function refresh() {
      if (lastUpdated) lastUpdated.textContent = formatNow();

      if (sandboxPill) sandboxPill.textContent = sandboxLabel();
      if (envPill) envPill.textContent = tagsEnvLabel();
      if (bcPillEnv) bcPillEnv.textContent = tagsEnvLabel();

      var propVal = tagsProperty ? String(tagsProperty.value || '').trim() : '';
      if (propertyStatus) propertyStatus.textContent = propVal ? 'Active' : 'Unset';
      setDotState(byId('aepSpectrumPropertyDot'), null, !!propVal, '', '');

      var sdkConnected = !!(fields && fields.hidden && summary && !summary.hidden);
      setDotState(sdkDot, sdkStatus, sdkConnected, 'Connected', 'Configure SDK');
      if (targetBadge) {
        targetBadge.textContent = sdkConnected ? 'SDK Connected' : 'SDK Not configured';
        targetBadge.classList.toggle('spectrum-env-badge--green', sdkConnected);
        targetBadge.classList.toggle('spectrum-env-badge--orange', !sdkConnected);
      }

      var script = scriptText();
      var hasScript = script && script !== 'None';
      if (scriptsBtn) scriptsBtn.textContent = hasScript ? script : 'None';
      if (bcPillScripts) {
        bcPillScripts.textContent = hasScript ? 'Script active' : 'No script';
        bcPillScripts.classList.toggle('is-active', hasScript);
      }

      var destLabel = 'Edge';
      if (generatorTarget && generatorTarget.selectedIndex >= 0) {
        var dopt = generatorTarget.options[generatorTarget.selectedIndex];
        destLabel = dopt ? String(dopt.textContent || 'Edge').split('·')[0].trim() : 'Edge';
        if (destLabel.length > 28) destLabel = destLabel.slice(0, 25) + '…';
      }
      if (targetMeta) {
        targetMeta.textContent = 'Destination: ' + destLabel + ' · Environment: ' + tagsEnvLabel();
      }

      ['siteCloneBcModalToggle', 'siteCloneBcInjectedToggle', 'siteCloneBcFullScreenToggle', 'siteCloneBcBottomDockToggle'].forEach(
        function (id, idx) {
          var el = byId(id);
          var pill = [bcPillModal, bcPillInjected, null, null][idx];
          if (!pill || !el) return;
          pill.classList.toggle('is-active', !!el.checked);
        },
      );
      if (bcPillModal && byId('siteCloneBcFullScreenToggle') && byId('siteCloneBcFullScreenToggle').checked) {
        bcPillModal.classList.add('is-active');
      }
      if (bcPillEnv) bcPillEnv.classList.add('is-active');
    }

    if (ecidCopy) {
      ecidCopy.addEventListener('click', function () {
        var val = infoEcid ? String(infoEcid.textContent || '').trim() : '';
        if (!val || val === '—') return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          void navigator.clipboard.writeText(val);
        }
      });
    }

    if (scriptsBtn) {
      scriptsBtn.addEventListener('click', function () {
        var expand = byId('aepDemoEnvExpandBtn');
        if (expand) expand.click();
      });
    }

    ['change', 'input'].forEach(function (evt) {
      if (tagsEnv) tagsEnv.addEventListener(evt, refresh);
      if (tagsProperty) tagsProperty.addEventListener(evt, refresh);
      if (generatorTarget) generatorTarget.addEventListener(evt, refresh);
      if (sandboxSelect) sandboxSelect.addEventListener(evt, refresh);
    });

    global.addEventListener('aep-global-sandbox-change', refresh);

    ['siteCloneBcModalToggle', 'siteCloneBcInjectedToggle', 'siteCloneBcFullScreenToggle', 'siteCloneBcBottomDockToggle', 'siteCloneDecisioningEnabledToggle'].forEach(
      function (id) {
        var el = byId(id);
        if (el) el.addEventListener('change', refresh);
      },
    );

    if (typeof MutationObserver !== 'undefined') {
      [fields, summary, scriptCode, styleResolved, infoEcid].forEach(function (node) {
        if (!node) return;
        var mo = new MutationObserver(refresh);
        mo.observe(node, {
          attributes: true,
          attributeFilter: ['hidden'],
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
    }

    global.addEventListener('aep-demo-tags-ui-state', refresh);
    refresh();
  }

  global.DemoEnvBarSpectrumSync = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
