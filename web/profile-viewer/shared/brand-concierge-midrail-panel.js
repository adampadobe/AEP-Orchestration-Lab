/**
 * Mid-page trigger + compact popout for Brand Concierge display mode switching.
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260618-midrail-dynamic-stack';
  var TRIGGER_SPARKLE_SVG =
    '<svg class="bcp-panel-trigger-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 2.5l1.05 3.65L16.7 7.3l-3.65 1.75L12 12.5l-1.05-3.55L7.3 7.3l3.65-1.15L12 2.5z" stroke="currentColor" stroke-width="1.4" fill="none"/>' +
    '<path d="M6.2 14.2l.55 1.95 1.95.55-1.95.95-.55 1.95-.95-1.95-1.95-.55 1.95-.95.55-1.95.95 1.95 1.95.55z" fill="currentColor"/>' +
    '</svg>';

  var MODE_DEFS = [
    { key: 'fullScreen', toggleId: 'siteCloneBcFullScreenToggle', label: 'Full Screen' },
    { key: 'modal', toggleId: 'siteCloneBcModalToggle', label: 'Modal' },
    { key: 'injected', toggleId: 'siteCloneBcInjectedToggle', label: 'Injected' },
    {
      key: 'bottomDock',
      toggleId: 'siteCloneBcBottomDockToggle',
      label: 'Centre bottom',
      optional: true,
    },
    {
      key: 'modalBar',
      toggleId: 'siteCloneBcModalBarToggle',
      label: 'Modal bar',
    },
  ];

  function activeModeDefs() {
    return MODE_DEFS.filter(function (mode) {
      if (!mode.optional) return true;
      return !!document.getElementById(mode.toggleId);
    });
  }

  function envToggle(mode) {
    return document.getElementById(mode.toggleId);
  }

  function isAnyBcDisplayModeActive() {
    var modes = activeModeDefs();
    var i;
    for (i = 0; i < modes.length; i++) {
      var el = envToggle(modes[i]);
      if (el && el.checked) return true;
    }
    return false;
  }

  function buildModeOptionsMarkup() {
    return activeModeDefs()
      .map(function (mode) {
        return (
          '<label class="site-clone-bc-prefs__option">' +
          '<input type="checkbox" data-bcp-mode="' +
          mode.key +
          '" data-bcp-env-toggle="' +
          mode.toggleId +
          '">' +
          '<span>' +
          mode.label +
          '</span>' +
          '</label>'
        );
      })
      .join('');
  }

  function init(options) {
    var opt = options || {};
    if (document.getElementById('bcpPanelAnchor')) {
      return global.BrandConciergeMidrailPanel && global.BrandConciergeMidrailPanel._handle
        ? global.BrandConciergeMidrailPanel._handle
        : null;
    }

    var anchor = document.createElement('div');
    anchor.id = 'bcpPanelAnchor';
    anchor.className = 'bcp-panel-anchor';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'bcpPanelTrigger';
    trigger.className = 'bcp-panel-trigger';
    trigger.setAttribute('aria-label', 'Open Brand Concierge display modes');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'bcpPanelShell');
    trigger.innerHTML = TRIGGER_SPARKLE_SVG;

    var backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'bcp-panel-backdrop';
    backdrop.id = 'bcpPanelBackdrop';
    backdrop.setAttribute('aria-label', 'Close Brand Concierge panel');

    var shell = document.createElement('div');
    shell.id = 'bcpPanelShell';
    shell.className = 'bcp-panel-shell';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-labelledby', 'bcpPanelTitle');

    shell.innerHTML =
      '<div class="bcp-panel-inner">' +
      '<header class="bcp-panel-header">' +
      '<h2 class="bcp-panel-title" id="bcpPanelTitle">Brand Concierge</h2>' +
      '<button type="button" class="bcp-panel-close" id="bcpPanelClose" aria-label="Close panel">&times;</button>' +
      '</header>' +
      '<div class="bcp-panel-body" id="bcpPanelMount">' +
      '<p class="bcp-panel-hint">Switch how Brand Concierge appears on the demo page.</p>' +
      '<div class="site-clone-bc-prefs__options" id="bcpPanelModeOptions">' +
      buildModeOptionsMarkup() +
      '</div>' +
      '</div>' +
      '</div>';

    anchor.appendChild(trigger);
    anchor.appendChild(shell);
    document.body.appendChild(backdrop);
    document.body.appendChild(anchor);

    var hideTimer = null;
    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function setOpen(open) {
      shell.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) syncPanelFromEnvBar();
      if (!open) clearHideTimer();
    }

    function scheduleClose() {
      if (!shell.classList.contains('is-open')) return;
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setOpen(false);
      }, 280);
    }

    function syncMidrailStackState() {
      var on = anchor.classList.contains('is-visible');
      if (on) {
        document.documentElement.setAttribute('data-lab-midrail-bc-visible', '');
      } else {
        document.documentElement.removeAttribute('data-lab-midrail-bc-visible');
      }
    }

    function setVisible(visible) {
      anchor.classList.toggle('is-visible', !!visible);
      syncMidrailStackState();
      if (!visible) setOpen(false);
    }

    function syncPanelFromEnvBar() {
      var optionsHost = document.getElementById('bcpPanelModeOptions');
      if (!optionsHost) return;
      var inputs = optionsHost.querySelectorAll('[data-bcp-env-toggle]');
      var i;
      for (i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var envEl = document.getElementById(String(input.getAttribute('data-bcp-env-toggle') || ''));
        input.checked = !!(envEl && envEl.checked);
      }
    }

    function refreshVisibility() {
      var enabledFn = typeof opt.isEnabled === 'function' ? opt.isEnabled : isAnyBcDisplayModeActive;
      setVisible(!!enabledFn());
    }

    function applyEnvBcMode(modeKey, enabled) {
      var defs = activeModeDefs();
      var i;
      var primaryEl = null;
      for (i = 0; i < defs.length; i++) {
        var def = defs[i];
        var envEl = envToggle(def);
        if (!envEl) continue;
        if (enabled) {
          envEl.checked = def.key === modeKey;
          if (def.key === modeKey) primaryEl = envEl;
        } else if (def.key === modeKey) {
          envEl.checked = false;
          primaryEl = envEl;
        }
      }
      if (!primaryEl) return;
      primaryEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (global.SiteCloneBc && typeof global.SiteCloneBc.sync === 'function') {
        void global.SiteCloneBc.sync();
      }
    }

    function onPanelModeChange(input) {
      if (!input) return;
      var modeKey = String(input.getAttribute('data-bcp-mode') || '');
      if (!modeKey) return;
      applyEnvBcMode(modeKey, !!input.checked);
      window.setTimeout(syncPanelFromEnvBar, 0);
    }

    trigger.addEventListener('click', function () {
      setOpen(!shell.classList.contains('is-open'));
    });
    backdrop.addEventListener('click', function () {
      setOpen(false);
    });
    document.getElementById('bcpPanelClose').addEventListener('click', function () {
      setOpen(false);
    });
    anchor.addEventListener('mouseenter', clearHideTimer);
    anchor.addEventListener('mouseleave', scheduleClose);
    document.addEventListener(
      'pointerdown',
      function (evt) {
        if (!shell.classList.contains('is-open')) return;
        var t = evt.target;
        if (!t || typeof t.closest !== 'function') return;
        if (t.closest('#bcpPanelAnchor')) return;
        setOpen(false);
      },
      true
    );

    document.addEventListener('change', function onEnvBcToggleChange(evt) {
      if (!evt || !evt.target || !evt.target.id) return;
      var id = evt.target.id;
      var watched = activeModeDefs().some(function (mode) {
        return mode.toggleId === id;
      });
      if (!watched) return;
      refreshVisibility();
      if (shell.classList.contains('is-open')) syncPanelFromEnvBar();
    });

    var optionsHost = document.getElementById('bcpPanelModeOptions');
    if (optionsHost) {
      optionsHost.addEventListener('change', function (evt) {
        var t = evt.target;
        if (!t || t.tagName !== 'INPUT' || !t.hasAttribute('data-bcp-env-toggle')) return;
        onPanelModeChange(t);
      });
    }

    refreshVisibility();

    var handle = {
      setOpen: setOpen,
      setVisible: setVisible,
      refreshVisibility: refreshVisibility,
      syncPanelFromEnvBar: syncPanelFromEnvBar,
    };
    global.BrandConciergeMidrailPanel._handle = handle;
    return handle;
  }

  global.BrandConciergeMidrailPanel = {
    CACHE_BUST: CACHE_BUST,
    init: init,
    refreshVisibility: function () {
      if (global.BrandConciergeMidrailPanel._handle) {
        global.BrandConciergeMidrailPanel._handle.refreshVisibility();
      }
    },
    _handle: null,
  };
})(typeof window !== 'undefined' ? window : globalThis);
