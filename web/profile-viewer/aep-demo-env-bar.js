/**
 * Lab standard demo chrome (see AepDemoEnvStrip below):
 * - Section **Environment**: Sandbox, Tags (company / property / environment + inject),
 *   **Event destination** (`#generatorTarget` as sibling of Tags fields, not inside them,
 *   so it stays visible after inject), optional SDK summary + “Change SDK config”.
 * - Section **Profile lookup**: namespace, identifier, look up.
 * - Collapse: after Tags SDK is configured **and** a Launch script is selected, `AepDemoEnvBar`
 *   hides the full grid and shows a compact “Sandbox · Tags” line with “Change environment”.
 * - When Launch script is unset (`None` / empty), the editor stays expanded so Tags injection
 *   is visible without clicking “Change environment”.
 *
 * **Reference pages:** `mod-demo.html`, `navigator-global-demo.html`, `admiral-demo.html`,
 * `premier-inn-demo.html`, `race-for-life-demo.html`, `donate-demo.html`.
 *
 * **Site-clone demos** (FNB, Old Mutual, Call center, thank-you pages) keep their own
 * chrome but should still load `aep-demo-generator-targets.js` and expose
 * `#generatorTarget` where `/api/events/generator` is used.
 */
(function (global) {
  'use strict';

  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function init(cfg) {
    var c = cfg || {};
    var sec = byId(c.envSectionId);
    var editor = byId(c.envEditorId);
    var collapseEl = byId(c.envCollapsibleGridId) || editor;
    var compact = byId(c.envCompactId);
    var compactText = byId(c.envCompactTextId);
    var expandBtn = byId(c.envExpandBtnId);
    var summaryEl = byId(c.summaryId);
    var fieldsEl = byId(c.fieldsId);
    var sandboxSelect = byId(c.sandboxSelectId);
    var scriptCodeEl = byId(c.selectedScriptCodeId);
    if (!sec || !editor || !collapseEl || !compact) return;

    var PINNED = 'aep-demo-env-section--pinned-open';

    function labEnvConfiguredStorageKey() {
      var prefix = String(c.prefix || '').trim();
      if (!prefix) {
        try {
          if (global.envBarConfig && global.envBarConfig.prefix) {
            prefix = String(global.envBarConfig.prefix).trim();
          }
        } catch (_e) {
          /* noop */
        }
      }
      return prefix ? 'aepLabEnvConfigured:' + prefix : 'aepLabEnvConfigured';
    }

    function configuredThisSession() {
      try {
        return global.sessionStorage.getItem(labEnvConfiguredStorageKey()) === '1';
      } catch (_e) {
        return false;
      }
    }

    function hasCompactToolbarOverlay() {
      var anchor =
        sec.closest('.lab-env-top-anchor') ||
        sec.closest('.mobile-demo-shell-env-anchor') ||
        sec.closest('[class*="-demo-top-anchor"]') ||
        (function () {
          var mount = document.querySelector('[data-demo-env-strip-mount]');
          return mount
            ? mount.closest('.lab-env-top-anchor') ||
                mount.closest('.mobile-demo-shell-env-anchor') ||
                mount.closest('[class*="-demo-top-anchor"]')
            : null;
        })();
      return !!(anchor && anchor.querySelector('.lab-env-overlay-panel'));
    }

    function requestOverlayOpen() {
      if (global.EnvBarCompact && typeof global.EnvBarCompact.openOverlay === 'function') {
        global.EnvBarCompact.openOverlay();
        return;
      }
      try {
        global.dispatchEvent(new CustomEvent('aep-demo-env-overlay-open'));
      } catch (e0) {
        /* noop */
      }
    }

    function sandboxLabel() {
      var v = '';
      try {
        if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
          v = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
        }
      } catch (e1) {
        /* noop */
      }
      if (!v && sandboxSelect && sandboxSelect.selectedIndex >= 0) {
        var opt = sandboxSelect.options[sandboxSelect.selectedIndex];
        v = opt ? String(opt.textContent || '').trim() : '';
      }
      return v || 'Default (server .env)';
    }

    function selectedScriptText() {
      return scriptCodeEl ? String(scriptCodeEl.textContent || '').trim() : '';
    }

    function launchScriptNotSet() {
      var t = selectedScriptText();
      return !t || t === 'None';
    }

    function scriptShort() {
      var t = selectedScriptText();
      if (!t || t === 'None') return 'Launch script not set';
      if (t.length > 56) return t.slice(0, 53) + '\u2026';
      return t;
    }

    function tagFieldsExpanded() {
      return !!(fieldsEl && !fieldsEl.hidden);
    }

    /** Keep Tags fields visible when no Launch URL is selected (matches compact-row label). */
    function ensureTagsUiExpandedWhenScriptUnset() {
      if (!launchScriptNotSet() || !fieldsEl || !fieldsEl.hidden) return;
      fieldsEl.hidden = false;
      if (summaryEl) summaryEl.hidden = true;
      try {
        global.dispatchEvent(
          new CustomEvent('aep-demo-tags-ui-state', { detail: { tagFieldsExpanded: true } })
        );
      } catch (e3) {
        /* noop */
      }
    }

    function refresh() {
      ensureTagsUiExpandedWhenScriptUnset();
      var configuring = tagFieldsExpanded();
      var pinned = sec.classList.contains(PINNED);
      var overlayOpen =
        global.EnvBarCompact &&
        typeof global.EnvBarCompact.isOpen === 'function' &&
        global.EnvBarCompact.isOpen();
      var datastreamPasteVisible = !!document.getElementById('siteCloneBcDatastreamUuidManual');
      var showFullEditor =
        configuring || pinned || launchScriptNotSet() || overlayOpen || datastreamPasteVisible;
      if (!showFullEditor) {
        sec.classList.add('aep-demo-env-section--collapsed');
        collapseEl.setAttribute('hidden', '');
        if (hasCompactToolbarOverlay()) {
          compact.setAttribute('hidden', '');
        } else {
          compact.removeAttribute('hidden');
        }
        if (compactText) {
          compactText.textContent = 'Sandbox: ' + sandboxLabel() + ' \u00b7 Tags: ' + scriptShort();
        }
      } else {
        sec.classList.remove('aep-demo-env-section--collapsed');
        collapseEl.removeAttribute('hidden');
        compact.setAttribute('hidden', '');
      }
    }

    function scheduleRefresh() {
      global.requestAnimationFrame(refresh);
    }

    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        if (fieldsEl) fieldsEl.hidden = false;
        if (summaryEl) summaryEl.hidden = true;
        sec.classList.add(PINNED);
        requestOverlayOpen();
        try {
          global.dispatchEvent(
            new CustomEvent('aep-demo-tags-ui-state', { detail: { tagFieldsExpanded: true } })
          );
        } catch (e4) {
          /* noop */
        }
        scheduleRefresh();
        try {
          if (sandboxSelect && typeof sandboxSelect.focus === 'function') sandboxSelect.focus();
        } catch (e2) {
          /* noop */
        }
      });
    }

    global.addEventListener('aep-demo-tags-ui-state', function (ev) {
      var d = ev && ev.detail;
      if (d && d.tagFieldsExpanded) {
        sec.classList.remove(PINNED);
      } else if (launchScriptNotSet()) {
        ensureTagsUiExpandedWhenScriptUnset();
      }
      scheduleRefresh();
    });

    global.addEventListener('aep-global-sandbox-change', scheduleRefresh);

    if (summaryEl && typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(scheduleRefresh);
      mo.observe(summaryEl, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (fieldsEl && typeof MutationObserver !== 'undefined') {
      var mo2 = new MutationObserver(scheduleRefresh);
      mo2.observe(fieldsEl, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (scriptCodeEl && typeof MutationObserver !== 'undefined') {
      var moScript = new MutationObserver(scheduleRefresh);
      moScript.observe(scriptCodeEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    scheduleRefresh();
    if (hasCompactToolbarOverlay() && launchScriptNotSet() && !configuredThisSession()) {
      global.requestAnimationFrame(function () {
        requestOverlayOpen();
      });
    }
  }

  global.AepDemoEnvBar = {
    init: init,
  };
})(typeof window !== 'undefined' ? window : this);

(function (global) {
  'use strict';

  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function initSandboxSelect(selectEl) {
    if (!selectEl || typeof global.AepGlobalSandbox === 'undefined') return;
    if (typeof global.AepGlobalSandbox.applyStoredSandboxToSelect === 'function') {
      global.AepGlobalSandbox.applyStoredSandboxToSelect(selectEl);
    }
    if (typeof global.AepGlobalSandbox.onSandboxSelectChange === 'function') {
      global.AepGlobalSandbox.onSandboxSelectChange(selectEl);
    }
    if (typeof global.AepGlobalSandbox.attachStorageSync === 'function') {
      global.AepGlobalSandbox.attachStorageSync(selectEl);
    }
    if (typeof global.AepGlobalSandbox.loadSandboxesIntoSelect === 'function') {
      void global.AepGlobalSandbox.loadSandboxesIntoSelect(selectEl);
    }
  }

  function initEnvBar(cfg) {
    if (!global.AepDemoEnvBar || typeof global.AepDemoEnvBar.init !== 'function') return;
    global.AepDemoEnvBar.init(cfg || {});
  }

  /**
   * One call for iframe-style and in-dashboard demos that share the canonical DOM ids
   * (`aepDemoEnvSection`, `sandboxSelect`, compact row, etc.) and demo-specific summary/fields/script ids.
   * @param {{ summaryId: string, fieldsId: string, selectedScriptCodeId: string, sandboxSelectId?: string, envSectionId?: string, envEditorId?: string, envCollapsibleGridId?: string, envCompactId?: string, envCompactTextId?: string, envExpandBtnId?: string }} c
   */
  function initStandardEnvBar(c) {
    var cfg = c || {};
    var sandboxId = cfg.sandboxSelectId || 'sandboxSelect';
    initSandboxSelect(byId(sandboxId));
    initEnvBar({
      envSectionId: cfg.envSectionId || 'aepDemoEnvSection',
      envEditorId: cfg.envEditorId || 'aepDemoEnvEditor',
      envCollapsibleGridId: cfg.envCollapsibleGridId || 'aepDemoEnvConfigGrid',
      envCompactId: cfg.envCompactId || 'aepDemoEnvCompact',
      envCompactTextId: cfg.envCompactTextId || 'aepDemoEnvCompactText',
      envExpandBtnId: cfg.envExpandBtnId || 'aepDemoEnvExpandBtn',
      summaryId: cfg.summaryId,
      fieldsId: cfg.fieldsId,
      sandboxSelectId: sandboxId,
      selectedScriptCodeId: cfg.selectedScriptCodeId,
      prefix: cfg.prefix,
    });
  }

  global.AepDemoEnvStrip = {
    initSandboxSelect: initSandboxSelect,
    initEnvBar: initEnvBar,
    initStandardEnvBar: initStandardEnvBar,
  };
})(typeof window !== 'undefined' ? window : this);
