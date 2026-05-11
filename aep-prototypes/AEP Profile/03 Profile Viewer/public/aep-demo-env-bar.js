/**
 * Shared demo top-banner: collapses Sandbox + Tags block once Tags SDK is configured
 * (summary row hidden / fields closed), with a compact strip above profile lookup.
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

    function scriptShort() {
      var t = scriptCodeEl ? String(scriptCodeEl.textContent || '').trim() : '';
      if (!t || t === 'None') return 'Launch script not set';
      if (t.length > 56) return t.slice(0, 53) + '\u2026';
      return t;
    }

    function tagFieldsExpanded() {
      return !!(fieldsEl && !fieldsEl.hidden);
    }

    function refresh() {
      var configuring = tagFieldsExpanded();
      var pinned = sec.classList.contains(PINNED);
      var showFullEditor = configuring || pinned;
      if (!showFullEditor) {
        sec.classList.add('aep-demo-env-section--collapsed');
        collapseEl.setAttribute('hidden', '');
        compact.removeAttribute('hidden');
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
        sec.classList.add(PINNED);
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

    scheduleRefresh();
  }

  global.AepDemoEnvBar = {
    init: init,
  };
})(typeof window !== 'undefined' ? window : this);
