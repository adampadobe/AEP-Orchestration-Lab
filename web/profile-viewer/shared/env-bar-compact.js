/**
 * Compact dropdown interaction for lab env bar (pin + mobile tap).
 * CSS in shared/env-bar-compact.css handles hover-reveal from top edge.
 */
(function attachEnvBarCompact(global) {
  'use strict';

  var PIN_STORAGE_KEY = 'aepLabEnvBarPinned';
  var PIN_BTN_ID = 'aepLabEnvPinBtn';

  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function findTopAnchor(mount) {
    if (!mount) return null;
    return mount.closest('.mod-demo-top-anchor') || mount.closest('[class$="-demo-top-anchor"]');
  }

  function isCoarsePointer() {
    try {
      return global.matchMedia('(hover: none), (max-width: 768px)').matches;
    } catch (_e) {
      return false;
    }
  }

  function setExpanded(anchor, expanded, pinned) {
    if (!anchor) return;
    anchor.classList.toggle('lab-env-top-anchor--expanded', !!expanded);
    anchor.classList.toggle('lab-env-top-anchor--pinned', !!pinned);
    anchor.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    var pinBtn = byId(PIN_BTN_ID);
    if (pinBtn) pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  }

  function readPinnedFromStorage() {
    try {
      return global.sessionStorage.getItem(PIN_STORAGE_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function writePinnedToStorage(pinned) {
    try {
      global.sessionStorage.setItem(PIN_STORAGE_KEY, pinned ? '1' : '0');
    } catch (_e) {}
  }

  function init() {
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    var anchor = findTopAnchor(mount);
    if (!anchor || anchor.getAttribute('data-lab-env-compact-init') === '1') return;
    anchor.setAttribute('data-lab-env-compact-init', '1');
    anchor.setAttribute('aria-expanded', 'false');

    if (readPinnedFromStorage()) {
      setExpanded(anchor, true, true);
    }

    var pinBtn = byId(PIN_BTN_ID);
    if (pinBtn) {
      pinBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var pinned = !anchor.classList.contains('lab-env-top-anchor--pinned');
        setExpanded(anchor, pinned, pinned);
        writePinnedToStorage(pinned);
      });
    }

    if (isCoarsePointer()) {
      anchor.addEventListener('click', function (ev) {
        if (ev.target.closest('#' + PIN_BTN_ID)) return;
        if (anchor.classList.contains('lab-env-top-anchor--pinned')) return;
        if (!anchor.classList.contains('lab-env-top-anchor--expanded')) {
          setExpanded(anchor, true, false);
        }
      });

      document.addEventListener(
        'click',
        function (ev) {
          if (anchor.classList.contains('lab-env-top-anchor--pinned')) return;
          if (anchor.contains(ev.target)) return;
          setExpanded(anchor, false, false);
        },
        true,
      );
    }
  }

  global.EnvBarCompact = { init: init };

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    init();
  });
})(typeof window !== 'undefined' ? window : globalThis);
