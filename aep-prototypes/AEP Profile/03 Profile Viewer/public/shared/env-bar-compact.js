/**
 * Compact toolbar + overlay dropdown for lab env bar (pin, toggle, click-outside).
 * CSS in shared/env-bar-compact.css — overlay does not push page content.
 */
(function attachEnvBarCompact(global) {
  'use strict';

  var PIN_STORAGE_KEY = 'aepLabEnvBarPinned';
  var DOCK_STORAGE_KEY = 'aepLabEnvBarDocked';
  var PIN_BTN_ID = 'aepLabEnvPinBtn';
  var TOGGLE_BTN_ID = 'aepLabEnvToggleBtn';
  var DOCK_TOOLBAR_BTN_ID = 'aepLabEnvDockToolbarBtn';
  var FLOATING_DOCK_BTN_ID = 'aepLabEnvFloatingDockBtn';
  var OVERLAY_PANEL_ID = 'aepLabEnvOverlayPanel';
  var EXPAND_BTN_ID = 'aepDemoEnvExpandBtn';
  var COG_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm9 3.75a8.2 8.2 0 0 1-.15 1.55l2.02 1.58-1.9 3.29-2.38-.98a8.27 8.27 0 0 1-1.34.78l-.36 2.53H9.71l-.36-2.53a8.27 8.27 0 0 1-1.34-.78l-2.38.98-1.9-3.29 2.02-1.58A8.2 8.2 0 0 1 3 12c0-.53.05-1.05.15-1.55L1.13 8.87l1.9-3.29 2.38.98c.4-.3.86-.56 1.34-.78l.36-2.53h4.58l.36 2.53c.48.22.94.48 1.34.78l2.38-.98 1.9 3.29-2.02 1.58c.1.5.15 1.02.15 1.55Z"/></svg>';

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

  function isOverlayInteractionTarget(node, anchor) {
    if (!node || !anchor) return false;
    if (anchor.contains(node)) return true;
    var panel = byId(OVERLAY_PANEL_ID) || anchor.querySelector('.lab-env-overlay-panel');
    if (panel && panel.contains(node)) return true;
    var active = document.activeElement;
    if (!active) return false;
    if (anchor.contains(active)) return true;
    return !!(panel && panel.contains(active));
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

  function readDockedFromStorage() {
    try {
      return global.sessionStorage.getItem(DOCK_STORAGE_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function writeDockedToStorage(docked) {
    try {
      global.sessionStorage.setItem(DOCK_STORAGE_KEY, docked ? '1' : '0');
    } catch (_e) {}
  }

  /** @type {HTMLButtonElement|null} */
  var floatingDockBtn = null;

  function getOrCreateFloatingDockBtn() {
    if (floatingDockBtn && document.contains(floatingDockBtn)) return floatingDockBtn;
    var existing = byId(FLOATING_DOCK_BTN_ID);
    if (existing) {
      floatingDockBtn = existing;
      return floatingDockBtn;
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = FLOATING_DOCK_BTN_ID;
    btn.className = 'env-bar-dock-btn';
    btn.innerHTML = COG_ICON_SVG;
    btn.setAttribute('aria-label', 'Hide environment bar');
    btn.setAttribute('title', 'Hide environment bar');
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleDockPublic();
    });
    document.body.appendChild(btn);
    floatingDockBtn = btn;
    return floatingDockBtn;
  }

  function updateFloatingDockBtn(docked) {
    var btn = getOrCreateFloatingDockBtn();
    var hasToolbarDock = !!byId(DOCK_TOOLBAR_BTN_ID);
    btn.classList.toggle('env-bar-dock-btn--docked', !!docked);
    btn.classList.toggle('env-bar-dock-btn--standalone', !hasToolbarDock);
    btn.setAttribute('aria-label', docked ? 'Show environment bar' : 'Hide environment bar');
    btn.setAttribute('title', docked ? 'Show environment bar' : 'Hide environment bar');
    btn.setAttribute('aria-pressed', docked ? 'true' : 'false');
  }

  function applyDockState(anchor, docked) {
    if (!anchor) return;
    anchor.classList.toggle('lab-env-top-anchor--docked-hidden', !!docked);
    updateFloatingDockBtn(!!docked);
    if (docked) {
      closeOverlay(anchor, { force: true });
    }
  }

  function isDockedPublic() {
    var anchor = resolveAnchor();
    return !!(anchor && anchor.classList.contains('lab-env-top-anchor--docked-hidden'));
  }

  function dockPublic() {
    var anchor = resolveAnchor();
    if (!anchor) return false;
    applyDockState(anchor, true);
    writeDockedToStorage(true);
    return true;
  }

  function undockPublic() {
    var anchor = resolveAnchor();
    if (!anchor) return false;
    applyDockState(anchor, false);
    writeDockedToStorage(false);
    return true;
  }

  function toggleDockPublic() {
    return isDockedPublic() ? undockPublic() : dockPublic();
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

    getOrCreateFloatingDockBtn();
    if (readDockedFromStorage()) applyDockState(anchor, true);
    else updateFloatingDockBtn(false);

    var dockToolbarBtn = byId(DOCK_TOOLBAR_BTN_ID);
    if (dockToolbarBtn) {
      dockToolbarBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        dockPublic();
      });
    }

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
        if (isOverlayInteractionTarget(ev.target, anchor)) return;
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
    dock: dockPublic,
    undock: undockPublic,
    toggleDock: toggleDockPublic,
    isDocked: isDockedPublic,
  };

  global.addEventListener('aep-demo-env-strip-mounted', function () {
    init();
  });
})(typeof window !== 'undefined' ? window : globalThis);
