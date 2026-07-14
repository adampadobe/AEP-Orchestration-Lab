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

  var STATUS_LIGHT_VARIANTS = ['positive', 'neutral', 'notice'];

  function readStorageMap(key) {
    if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
      return global.AepLabEnvBarPrefs.readMap(key);
    }
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function resolveStoragePrefix(prefix) {
    try {
      if (global.envBarConfig && global.envBarConfig.storagePrefix) {
        return String(global.envBarConfig.storagePrefix).trim();
      }
    } catch (_e) {
      /* noop */
    }
    return String(prefix || '').trim();
  }

  function sandboxKeyForStorage(sandboxSelect) {
    var name = '';
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        name = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      }
    } catch (_e) {
      /* noop */
    }
    if (!name && sandboxSelect) {
      name = String(sandboxSelect.value || '').trim();
    }
    var raw = name.toLowerCase();
    return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
  }

  /** Matches demo-tags-injection.js per-sandbox SDK configured map (fields may stay expanded after inject). */
  function isPersistedSdkConfigured(storagePrefix, sandboxSelect) {
    if (!storagePrefix) return false;
    var sbKey = sandboxKeyForStorage(sandboxSelect);
    var configuredMap = readStorageMap(storagePrefix + 'SdkConfiguredBySandbox');
    if (configuredMap[sbKey] !== 1) return false;
    var scriptMap = readStorageMap(storagePrefix + 'SelectedLaunchScriptBySandbox');
    var script = scriptMap[sbKey];
    return !!(script && String(script).trim());
  }

  function setStatusLight(chipEl, dotEl, statusEl, variant, text) {
    var v = STATUS_LIGHT_VARIANTS.indexOf(variant) >= 0 ? variant : 'neutral';
    if (chipEl) {
      chipEl.classList.add('lab-env-status-light');
      STATUS_LIGHT_VARIANTS.forEach(function (name) {
        chipEl.classList.toggle('lab-env-status-light--' + name, name === v);
      });
    }
    if (dotEl) {
      dotEl.classList.add('spectrum-env-status-light');
      dotEl.classList.remove('spectrum-env-dot--green');
      STATUS_LIGHT_VARIANTS.forEach(function (name) {
        dotEl.classList.toggle('spectrum-env-status-light--' + name, name === v);
      });
    }
    if (statusEl) statusEl.textContent = text;
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
    var propertyChip = byId('aepSpectrumPropertyChip');
    var sdkChip = byId('aepSpectrumSdkChip');
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

    function syncTruncatedTitle(el, value) {
      if (!el) return;
      var text = value != null ? String(value) : String(el.value || el.textContent || '').trim();
      el.title = text || '';
      el.classList.toggle('lab-env-url-truncate', text.length > 42);
    }

    function refresh() {
      if (lastUpdated) lastUpdated.textContent = formatNow();

      var sandbox = sandboxLabel();
      if (sandboxPill) {
        sandboxPill.textContent = sandbox;
        syncTruncatedTitle(sandboxPill, sandbox);
      }
      var envLabel = tagsEnvLabel();
      if (envPill) {
        envPill.textContent = envLabel;
        syncTruncatedTitle(envPill, envLabel);
      }
      if (bcPillEnv) bcPillEnv.textContent = envLabel;

      var propVal = tagsProperty ? String(tagsProperty.value || '').trim() : '';
      setStatusLight(
        propertyChip,
        byId('aepSpectrumPropertyDot'),
        propertyStatus,
        propVal ? 'positive' : 'notice',
        propVal ? 'Active' : 'Unset',
      );
      if (propertyChip) syncTruncatedTitle(propertyChip, propVal || 'Tags property not set');
      if (tagsProperty) syncTruncatedTitle(tagsProperty, propVal);

      var storagePrefix = resolveStoragePrefix(prefix);
      var sdkConnectedFromUi = !!(fields && fields.hidden && summary && !summary.hidden);
      var sdkConfiguredPersist = isPersistedSdkConfigured(storagePrefix, sandboxSelect);
      var summaryConfiguredVisible =
        !!(summary && !summary.hidden && summary.textContent && /SDK configured/i.test(String(summary.textContent)) && !/no script selected/i.test(String(summary.textContent)));
      var alloyLive = typeof global.alloy === 'function';
      var injectInProgress = !!(
        storagePrefix &&
        global.AepLabTagsInjectGuard &&
        typeof global.AepLabTagsInjectGuard.isInProgress === 'function' &&
        global.AepLabTagsInjectGuard.isInProgress(storagePrefix)
      );
      var sdkStatusVariant = 'notice';
      var sdkStatusText = 'Configure SDK';
      var targetBadgeText = 'SDK Not configured';
      if (alloyLive) {
        sdkStatusVariant = 'positive';
        sdkStatusText = 'Connected';
        targetBadgeText = 'SDK Connected';
      } else if (summaryConfiguredVisible) {
        sdkStatusVariant = 'positive';
        sdkStatusText = 'Configured';
        targetBadgeText = 'SDK configured';
      } else if (injectInProgress) {
        sdkStatusVariant = 'notice';
        sdkStatusText = 'Connecting…';
        targetBadgeText = 'SDK connecting…';
      } else if (sdkConfiguredPersist && !summaryConfiguredVisible) {
        sdkStatusVariant = 'notice';
        sdkStatusText = 'Re-configure';
        targetBadgeText = 'SDK re-configure';
      } else if (sdkConnectedFromUi) {
        sdkStatusVariant = 'notice';
        sdkStatusText = 'Restoring…';
        targetBadgeText = 'SDK restoring…';
      }
      setStatusLight(sdkChip, sdkDot, sdkStatus, sdkStatusVariant, sdkStatusText);
      if (targetBadge) {
        targetBadge.textContent = targetBadgeText;
        var badgeGreen = alloyLive || summaryConfiguredVisible;
        targetBadge.classList.toggle('spectrum-env-badge--green', badgeGreen);
        targetBadge.classList.toggle('spectrum-env-badge--orange', !badgeGreen);
      }

      var script = scriptText();
      var hasScript = script && script !== 'None';
      if (scriptsBtn) {
        scriptsBtn.textContent = hasScript ? (script.length > 36 ? script.slice(0, 33) + '…' : script) : 'None';
        syncTruncatedTitle(scriptsBtn, hasScript ? script : 'No Launch script selected');
      }
      if (scriptCode) syncTruncatedTitle(scriptCode, script);
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

    function openEnvOverlayFromToolbar() {
      if (global.EnvBarCompact && typeof global.EnvBarCompact.openOverlay === 'function') {
        global.EnvBarCompact.openOverlay();
        return;
      }
      var expand = byId('aepDemoEnvExpandBtn');
      if (expand) expand.click();
      else {
        try {
          global.dispatchEvent(new CustomEvent('aep-demo-env-overlay-open'));
        } catch (_e) {
          /* noop */
        }
      }
    }

    if (scriptsBtn) {
      scriptsBtn.addEventListener('click', openEnvOverlayFromToolbar);
    }

    if (sdkStatus) {
      sdkStatus.addEventListener('click', openEnvOverlayFromToolbar);
      sdkStatus.setAttribute('role', 'button');
      sdkStatus.setAttribute('tabindex', '0');
      sdkStatus.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openEnvOverlayFromToolbar();
        }
      });
    }

    if (propertyChip) {
      propertyChip.addEventListener('click', openEnvOverlayFromToolbar);
      propertyChip.setAttribute('role', 'button');
      propertyChip.setAttribute('tabindex', '0');
    }

    var styleSelect = byId('siteCloneBcStyleConfigUrl');
    if (styleSelect) {
      styleSelect.addEventListener('change', function () {
        syncTruncatedTitle(styleSelect);
      });
    }

    ['change', 'input'].forEach(function (evt) {
      if (tagsEnv) tagsEnv.addEventListener(evt, refresh);
      if (tagsProperty) tagsProperty.addEventListener(evt, refresh);
      if (generatorTarget) generatorTarget.addEventListener(evt, refresh);
      if (sandboxSelect) sandboxSelect.addEventListener(evt, refresh);
    });

    global.addEventListener('aep-global-sandbox-change', refresh);

    ['siteCloneBcEnabledToggle', 'siteCloneBcModalToggle', 'siteCloneBcInjectedToggle', 'siteCloneBcFullScreenToggle', 'siteCloneBcBottomDockToggle', 'siteCloneBcModalBarToggle', 'siteCloneDecisioningEnabledToggle'].forEach(
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
    global.addEventListener('aep-demo-env-configured', refresh);
    global.addEventListener('aep-demo-tags-injected', refresh);
    global.addEventListener('env-bar-change', function (ev) {
      var detail = ev && ev.detail;
      if (!detail || detail.type === 'sandbox' || detail.type === 'init') refresh();
    });
    refresh();
    loadVersionPill();
  }

  function resolveVersionJsonPath() {
    var path = '/version.json';
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].getAttribute('src') || '';
        if (src.indexOf('shared/env-bar.js') === -1) continue;
        var idx = src.indexOf('shared/env-bar.js');
        var base = idx > 0 ? src.slice(0, idx) : '';
        if (base.charAt(0) === '/') {
          var root = base.replace(/\/profile-viewer\/?$/, '/');
          path = root + 'version.json';
        } else if (base) {
          path = base + 'version.json';
        }
        break;
      }
    } catch (_e) {
      /* noop */
    }
    return path;
  }

  function loadVersionPill() {
    var pill = byId('aepLabEnvVersionPill');
    if (!pill) return;
    var versionPath = resolveVersionJsonPath();
    pill.setAttribute('href', versionPath);
    if (typeof fetch !== 'function') return;
    fetch(versionPath, { cache: 'no-store' })
      .then(function (res) {
        return res && res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || !pill) return;
        var sha = String(data.gitShortSha || '').trim();
        if (!sha && data.gitSha) sha = String(data.gitSha).trim().slice(0, 8);
        if (sha) pill.textContent = sha;
        var tip = [];
        if (data.deployedAt) tip.push('Deployed ' + data.deployedAt);
        if (data.gitCommitSubject) tip.push(data.gitCommitSubject);
        if (tip.length) pill.title = tip.join(' · ');
      })
      .catch(function () {
        /* noop */
      });
  }

  global.DemoEnvBarSpectrumSync = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
