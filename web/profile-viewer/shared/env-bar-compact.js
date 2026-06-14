/**
 * Compact toolbar + overlay dropdown for lab env bar (pin, toggle, click-outside).
 * CSS in shared/env-bar-compact.css — overlay does not push page content.
 */
(function attachEnvBarCompact(global) {
  'use strict';

  var PIN_STORAGE_KEY = 'aepLabEnvBarPinned';
  var PIN_BTN_ID = 'aepLabEnvPinBtn';
  var TOGGLE_BTN_ID = 'aepLabEnvToggleBtn';
  var OVERLAY_PANEL_ID = 'aepLabEnvOverlayPanel';
  var EXPAND_BTN_ID = 'aepDemoEnvExpandBtn';

  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function findTopAnchor(mount) {
    if (!mount) return null;
    return (
      mount.closest('.lab-env-top-anchor') ||
      mount.closest('.mobile-demo-shell-env-anchor') ||
      mount.closest('.mod-demo-top-anchor') ||
      mount.closest('[class*="-demo-top-anchor"]')
    );
  }

  function isInteractiveToolbarTarget(node) {
    return !!(node && node.closest && node.closest('button, a, select, input, textarea, label, [role="button"]'));
  }

  function setExpanded(anchor, expanded, pinned) {
    if (!anchor) return;
    var isOpen = !!(expanded || pinned);
    anchor.classList.toggle('lab-env-top-anchor--expanded', !!expanded);
    anchor.classList.toggle('lab-env-top-anchor--pinned', !!pinned);
    anchor.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    var panel = byId(OVERLAY_PANEL_ID) || anchor.querySelector('.lab-env-overlay-panel');
    if (panel) {
      if (isOpen) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    }

    var toggleBtn = byId(TOGGLE_BTN_ID);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', isOpen ? 'Hide environment controls' : 'Show environment controls');
      toggleBtn.setAttribute('title', isOpen ? 'Collapse environment panel' : 'Expand environment panel');
    }

    var pinBtn = byId(PIN_BTN_ID);
    if (pinBtn) {
      pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      pinBtn.setAttribute('aria-label', pinned ? 'Unpin environment panel' : 'Pin environment panel open');
      pinBtn.setAttribute('title', pinned ? 'Unpin environment panel' : 'Pin environment panel open');
    }
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

  function isOverlayOpen(anchor) {
    return (
      anchor.classList.contains('lab-env-top-anchor--expanded') ||
      anchor.classList.contains('lab-env-top-anchor--pinned')
    );
  }

  function openOverlay(anchor, pin) {
    setExpanded(anchor, true, !!pin);
    if (pin) writePinnedToStorage(true);
  }

  function closeOverlay(anchor, opts) {
    anchor = anchor || resolveAnchor();
    if (!anchor) return false;
    var options = opts || {};
    if (!options.force && isOverlayPinned(anchor)) return false;
    setExpanded(anchor, false, false);
    if (options.force || !readPinnedFromStorage()) writePinnedToStorage(false);
    return true;
  }

  /** @type {HTMLElement|null} */
  var activeAnchor = null;

  function resolveAnchor() {
    if (activeAnchor && document.contains(activeAnchor)) return activeAnchor;
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    activeAnchor = findTopAnchor(mount);
    return activeAnchor;
  }

  function isOverlayPinned(anchor) {
    anchor = anchor || resolveAnchor();
    return !!(anchor && anchor.classList.contains('lab-env-top-anchor--pinned')) || readPinnedFromStorage();
  }

  function openOverlayPublic(opts) {
    var anchor = resolveAnchor();
    if (!anchor) return false;
    var options = opts || {};
    var pin = options.pinned != null ? !!options.pinned : isOverlayPinned(anchor);
    openOverlay(anchor, pin);
    return true;
  }

  function closeOverlayPublic(opts) {
    return closeOverlay(resolveAnchor(), opts);
  }

  function isOverlayOpenPublic() {
    var anchor = resolveAnchor();
    return anchor ? isOverlayOpen(anchor) : false;
  }

  function toggleOverlay(anchor) {
    if (anchor.classList.contains('lab-env-top-anchor--pinned')) {
      closeOverlay(anchor, { force: true });
      writePinnedToStorage(false);
      return;
    }
    if (isOverlayOpen(anchor)) closeOverlay(anchor);
    else openOverlay(anchor, false);
  }

  function init() {
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    var anchor = findTopAnchor(mount);
    if (!anchor || anchor.getAttribute('data-lab-env-compact-init') === '1') return;
    activeAnchor = anchor;
    anchor.classList.add('lab-env-top-anchor');
    anchor.setAttribute('data-lab-env-compact-init', '1');
    anchor.setAttribute('aria-expanded', 'false');

    var banner = anchor.querySelector('[class*="-demo-id-banner"]') || anchor.querySelector('.mod-demo-id-banner');
    if (banner) banner.classList.add('lab-env-id-banner');

    if (readPinnedFromStorage()) openOverlay(anchor, true);

    var toggleBtn = byId(TOGGLE_BTN_ID);
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleOverlay(anchor);
      });
    }

    var pinBtn = byId(PIN_BTN_ID);
    if (pinBtn) {
      pinBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var pinned = !anchor.classList.contains('lab-env-top-anchor--pinned');
        if (pinned) openOverlay(anchor, true);
        else closeOverlay(anchor, { force: true });
        writePinnedToStorage(pinned);
      });
    }

    var expandBtn = byId(EXPAND_BTN_ID);
    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        openOverlay(anchor, anchor.classList.contains('lab-env-top-anchor--pinned'));
      });
    }

    var toolbar = anchor.querySelector('.lab-env-toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', function (ev) {
        if (isInteractiveToolbarTarget(ev.target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (isOverlayOpen(anchor)) closeOverlay(anchor);
        else openOverlay(anchor, anchor.classList.contains('lab-env-top-anchor--pinned'));
      });
    }

    document.addEventListener(
      'click',
      function (ev) {
        if (!anchor.querySelector('.lab-env-overlay-panel')) return;
        if (anchor.classList.contains('lab-env-top-anchor--pinned')) return;
        if (!isOverlayOpen(anchor)) return;
        if (anchor.contains(ev.target)) return;
        closeOverlay(anchor);
      },
      true,
    );

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (anchor.classList.contains('lab-env-top-anchor--pinned')) return;
      if (!isOverlayOpen(anchor)) return;
      closeOverlay(anchor);
    });
  }

  global.addEventListener('aep-demo-env-configured', function () {
    if (global.AepLabTagsInjectGuard && global.AepLabTagsInjectGuard.isInProgress()) return;
    closeOverlayPublic();
  });

  global.addEventListener('aep-demo-env-overlay-open', function (ev) {
    var detail = ev && ev.detail;
    openOverlayPublic(detail && typeof detail === 'object' ? detail : {});
  });

  global.EnvBarCompact = {
    init: init,
    openOverlay: openOverlayPublic,
    closeOverlay: closeOverlayPublic,
    isOpen: isOverlayOpenPublic,
    isPinned: isOverlayPinned,
  };

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    init();
  });
})(typeof window !== 'undefined' ? window : globalThis);
