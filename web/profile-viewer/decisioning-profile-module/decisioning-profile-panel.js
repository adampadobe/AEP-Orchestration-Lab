/**
 * Discreet top-right trigger + slide-in panel hosting decisioning-profile-module.
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260613';

  function init(options) {
    var opt = options || {};
    if (document.getElementById('dpmPanelShell')) return;

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'dpmPanelTrigger';
    trigger.className = 'dpm-panel-trigger';
    trigger.setAttribute('aria-label', 'Open decisioning profile panel');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'dpmPanelShell');
    trigger.innerHTML = '<span class="dpm-panel-trigger-dot" aria-hidden="true"></span>';

    var backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'dpm-panel-backdrop';
    backdrop.id = 'dpmPanelBackdrop';
    backdrop.setAttribute('aria-label', 'Close decisioning panel');

    var shell = document.createElement('div');
    shell.id = 'dpmPanelShell';
    shell.className = 'dpm-panel-shell';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-labelledby', 'dpmPanelTitle');

    shell.innerHTML =
      '<div class="dpm-panel-inner">' +
      '<header class="dpm-panel-header">' +
      '<h2 class="dpm-panel-title" id="dpmPanelTitle">Decisioning</h2>' +
      '<button type="button" class="dpm-panel-close" id="dpmPanelClose" aria-label="Close panel">&times;</button>' +
      '</header>' +
      '<div class="dpm-panel-body" id="dpmPanelMount"></div>' +
      '</div>';

    document.body.appendChild(trigger);
    document.body.appendChild(backdrop);
    document.body.appendChild(shell);

    var mountEl = document.getElementById('dpmPanelMount');
    var moduleHandle = null;
    if (global.DecisioningProfileModule && typeof global.DecisioningProfileModule.mount === 'function') {
      moduleHandle = global.DecisioningProfileModule.mount(mountEl, opt.moduleOptions || {});
    }

    function setOpen(open) {
      shell.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setVisible(visible) {
      trigger.classList.toggle('is-visible', !!visible);
      if (!visible) setOpen(false);
    }

    trigger.addEventListener('click', function () {
      setOpen(!shell.classList.contains('is-open'));
    });
    backdrop.addEventListener('click', function () {
      setOpen(false);
    });
    document.getElementById('dpmPanelClose').addEventListener('click', function () {
      setOpen(false);
    });

    if (typeof opt.isEnabled === 'function') {
      var applyEnabled = function () {
        setVisible(!!opt.isEnabled());
        if (global.DecisioningProfileRuntime && typeof global.DecisioningProfileRuntime.refreshEnabledState === 'function') {
          global.DecisioningProfileRuntime.refreshEnabledState();
        }
      };
      applyEnabled();
      if (opt.enabledToggleId) {
        var toggleEl = document.getElementById(opt.enabledToggleId);
        if (toggleEl) toggleEl.addEventListener('change', applyEnabled);
      }
    } else {
      trigger.classList.add('is-visible');
    }

    return { setOpen: setOpen, setVisible: setVisible, moduleHandle: moduleHandle };
  }

  global.DecisioningProfilePanel = { CACHE_BUST: CACHE_BUST, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
