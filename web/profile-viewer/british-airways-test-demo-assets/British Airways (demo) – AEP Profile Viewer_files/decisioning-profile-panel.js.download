/**
 * Mid-page trigger + compact popout hosting decisioning-profile-module.
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260617-panel-editing-guard';
  /** Spectrum 2 workflow icon: Channel (S2_Icon_Channel_20_N.svg) from vendor/spectrum-workflow-icons/. */
  var CHANNEL_ICON_SVG =
    '<svg class="dpm-panel-trigger-icon" width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
    '<path d="M18.18066,8.6637c-.71301-.36316-1.57538-.09729-1.97235.5863h-2.53412c-.16498-.8092-.60059-1.51355-1.19611-2.04248l1.27319-2.20532c.28003.00012.56329-.07581.81567-.23975.69458-.45117.89185-1.38013.44067-2.07458-.45117-.69458-1.38-.89197-2.07458-.4408-.67102.43604-.87195,1.31592-.47839,2.00146l-1.27576,2.20972c-.37292-.12451-.76459-.20825-1.17889-.20825-.41425,0-.80597.08362-1.17883.20825l-1.27362-2.20605c.13995-.24243.21588-.52563.20007-.82617-.04346-.82703-.74921-1.46228-1.57629-1.41882s-1.4624.74915-1.41895,1.57629c.04199.79907.70361,1.41309,1.4942,1.41504l1.27527,2.20898c-.59546.52893-1.03107,1.23328-1.19604,2.04248h-2.52966c-.14001-.24243-.34741-.44971-.61548-.5863-.73804-.37598-1.64105-.0824-2.01697.65564s-.0824,1.64111.65564,2.01697c.71301.36316,1.57538.09729,1.97235-.5863h2.53412c.16498.8092.60059,1.51355,1.19611,2.04248l-1.27313,2.2052c-.28003,0-.56335.07593-.81573.23987-.69458.45117-.89185,1.38-.44067,2.07458s1.38.89185,2.07458.44067c.67102-.43591.87189-1.31567.47839-2.00134l1.27576-2.20972c.37292.12451.76459.20825,1.17889.20825.41425,0,.80597-.08362,1.17883-.20825l1.27362,2.20605c-.13995.24243-.21588.52563-.20007.82605.04346.82703.74921,1.4624,1.57629,1.41895s1.4624-.74915,1.41895-1.57629c-.04199-.79907-.70361-1.41309-1.4942-1.41504l-1.27527-2.20898c.59546-.52893,1.03107-1.23328,1.19604-2.04248h2.52966c.14001.24243.34741.44971.61548.5863.73804.37585,1.64105.0824,2.01697-.65564s.0824-1.64111-.65564-2.01697ZM11.70422,11.45203c-.32843.38489-.77783.66089-1.29504.75659-.13312.02466-.26904.04138-.40918.04138s-.27612-.01685-.40924-.0415c-.51721-.0957-.96649-.37158-1.29498-.75647-.17596-.2063-.3147-.44177-.40753-.70203-.08411-.23584-.13824-.48584-.13824-.75s.05414-.51416.13824-.75c.09277-.26025.23151-.49585.40753-.70203.32843-.38489.77783-.66089,1.29504-.75659.13312-.02466.26904-.04138.40918-.04138s.27612.01685.40924.0415c.51721.0957.96649.37158,1.29498.75635.17603.2063.3147.44189.40753.70215.08411.23584.13824.48584.13824.75s-.05414.51416-.13824.75c-.09277.26025-.23151.49585-.40753.70203Z"/>' +
    '</svg>';

  function init(options) {
    var opt = options || {};
    if (document.getElementById('dpmPanelAnchor')) return;

    var anchor = document.createElement('div');
    anchor.id = 'dpmPanelAnchor';
    anchor.className = 'dpm-panel-anchor';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'dpmPanelTrigger';
    trigger.className = 'dpm-panel-trigger';
    trigger.setAttribute('aria-label', 'Open decisioning profile panel');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'dpmPanelShell');
    trigger.innerHTML = CHANNEL_ICON_SVG;

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

    anchor.appendChild(trigger);
    anchor.appendChild(shell);
    document.body.appendChild(backdrop);
    document.body.appendChild(anchor);

    var mountEl = document.getElementById('dpmPanelMount');
    var moduleHandle = null;
    if (global.DecisioningProfileModule && typeof global.DecisioningProfileModule.mount === 'function') {
      moduleHandle = global.DecisioningProfileModule.mount(mountEl, opt.moduleOptions || {});
    }

    var nativePickerEngagedUntil = 0;
    var panelInteractionEngagedUntil = 0;
    var NATIVE_PICKER_GRACE_MS = 12000;
    var PANEL_INTERACTION_GRACE_MS = 12000;

    function isFormControl(el) {
      if (!el || el.nodeType !== 1) return false;
      var tag = el.tagName;
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON';
    }

    function markNativePickerEngaged() {
      nativePickerEngagedUntil = Date.now() + NATIVE_PICKER_GRACE_MS;
      markPanelInteractionEngaged();
    }

    function markPanelInteractionEngaged() {
      panelInteractionEngagedUntil = Date.now() + PANEL_INTERACTION_GRACE_MS;
      clearHideTimer();
    }

    function isNativePickerEngaged() {
      if (Date.now() < nativePickerEngagedUntil) return true;
      var active = document.activeElement;
      if (active && active.type === 'color' && shell.contains(active)) return true;
      return false;
    }

    function isPanelInteractionEngaged() {
      if (Date.now() < panelInteractionEngagedUntil) return true;
      if (isNativePickerEngaged()) return true;
      if (shell.classList.contains('is-surface-open')) return true;
      var active = document.activeElement;
      if (active && shell.contains(active) && isFormControl(active)) return true;
      return false;
    }

    function wirePanelInteractionGuards(root) {
      if (!root || root.getAttribute('data-dpm-interaction-guard') === '1') return;
      root.setAttribute('data-dpm-interaction-guard', '1');
      root.addEventListener(
        'pointerdown',
        function (ev) {
          markPanelInteractionEngaged();
          var t = ev && ev.target;
          if (t && t.type === 'color') markNativePickerEngaged();
        },
        true
      );
      root.addEventListener(
        'focusin',
        function (ev) {
          markPanelInteractionEngaged();
          var t = ev && ev.target;
          if (t && t.type === 'color') markNativePickerEngaged();
        },
        true
      );
      root.addEventListener(
        'focusout',
        function () {
          markPanelInteractionEngaged();
          window.setTimeout(function () {
            if (shell.contains(document.activeElement)) markPanelInteractionEngaged();
          }, 0);
        },
        true
      );
    }

    wirePanelInteractionGuards(shell);

    document.addEventListener('decisioning-panel-editing', markPanelInteractionEngaged);

    function setOpen(open) {
      shell.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) clearHideTimer();
      if (open) {
        try {
          global.dispatchEvent(new CustomEvent('decisioning-panel-opened'));
        } catch (_e) {}
        void (async function refreshPanelProfile() {
          if (
            global.DecisioningProfileRuntime &&
            typeof global.DecisioningProfileRuntime.maybeAutoLookup === 'function'
          ) {
            await global.DecisioningProfileRuntime.maybeAutoLookup('panel-open');
          }
          if (moduleHandle && typeof moduleHandle.hydrate === 'function') {
            moduleHandle.hydrate();
          }
        })();
      }
    }

    var hideTimer = null;
    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
    function scheduleClose() {
      if (!shell.classList.contains('is-open')) return;
      if (isPanelInteractionEngaged()) return;
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        if (!isPanelInteractionEngaged()) setOpen(false);
      }, 280);
    }

    function setVisible(visible) {
      anchor.classList.toggle('is-visible', !!visible);
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
    anchor.addEventListener('mouseenter', clearHideTimer);
    anchor.addEventListener('mouseleave', function () {
      if (isPanelInteractionEngaged()) return;
      scheduleClose();
    });
    document.addEventListener(
      'pointerdown',
      function (evt) {
        if (!shell.classList.contains('is-open')) return;
        if (isPanelInteractionEngaged()) return;
        var t = evt.target;
        if (!t || typeof t.closest !== 'function') return;
        if (t.closest('#dpmPanelAnchor')) return;
        setOpen(false);
      },
      true
    );

    if (typeof opt.isEnabled === 'function') {
      var applyEnabled = function () {
        setVisible(!!opt.isEnabled());
        if (global.DecisioningProfileRuntime && typeof global.DecisioningProfileRuntime.refreshEnabledState === 'function') {
          global.DecisioningProfileRuntime.refreshEnabledState();
        }
      };
      applyEnabled();
      if (opt.enabledToggleId) {
        document.addEventListener('change', function onDecisioningToggleChange(evt) {
          if (!evt || !evt.target || evt.target.id !== opt.enabledToggleId) return;
          applyEnabled();
        });
      }
    } else {
      setVisible(true);
    }

    return { setOpen: setOpen, setVisible: setVisible, moduleHandle: moduleHandle };
  }

  global.DecisioningProfilePanel = { CACHE_BUST: CACHE_BUST, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
