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
  var FULL_OPEN_BTN_ID = 'aepLabEnvFullOpenBtn';
  var PROFILE_ONLY_CLASS = 'lab-env-top-anchor--profile-only';
  var CONFIGURING_CLASS = 'lab-env-top-anchor--configuring';
  var selectDismissGraceUntil = 0;
  var datastreamManualEntryOpen = false;
  var toolbarResizeObserver = null;
  /** Spectrum 2 workflow icon: Settings (S2_Icon_Settings_20_N.svg) from vendor/spectrum-workflow-icons/. */
  var DOCK_ICON_SVG =
    '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
    '<path d="M10.00391,12.58887c-.88818,0-1.75293-.45996-2.22803-1.2832h0c-.70801-1.22754-.28613-2.80078.93994-3.50879.59326-.34375,1.28516-.43359,1.94922-.25684.6626.17773,1.21631.60352,1.55908,1.19727.34326.59375.43408,1.28613.25684,1.94824-.17773.66309-.60254,1.2168-1.19678,1.55957-.40332.2334-.84473.34375-1.28027.34375ZM9.07471,10.55566c.29443.50879.94824.68359,1.45947.39062.24707-.14258.42383-.37305.49756-.64844s.03613-.56348-.10645-.81055c-.14307-.24707-.37305-.42383-.64893-.49805-.2749-.07324-.56299-.03516-.81055.10645-.51025.29492-.68555.94922-.39111,1.45996h0Z"/>' +
    '<path d="M6.90674,18.31836c-.33936,0-.68213-.08496-.99219-.26465l-.81982-.47266c-.89307-.51367-1.25-1.64941-.81104-2.58301l.58008-1.2334c-.26514-.36328-.48975-.75098-.67188-1.16113l-1.35693-.1123c-1.02881-.08496-1.83447-.95996-1.83447-1.99121l-.00098-.94629c0-1.0332.80518-1.90918,1.8335-1.99414l1.35449-.11426c.0918-.20898.19238-.40918.30176-.59961.10986-.19141.2334-.37891.36914-.56445l-.58057-1.22949c-.44092-.93262-.08643-2.06836.80713-2.58496l.82031-.47363c.89258-.5166,2.05371-.25879,2.64258.58984l.77734,1.11816c.44385-.0498.89209-.04785,1.34082,0l.77539-1.11914c.58887-.84961,1.75098-1.10938,2.64355-.59375l.81982.47266c.89404.51562,1.24951,1.65137.81055,2.58398l-.58008,1.23242c.26562.36426.49023.75195.67188,1.16113l1.35693.1123c1.02832.08496,1.83398.95996,1.83496,1.99121l.00049.94727c.00098,1.03125-.80371,1.90723-1.83203,1.99414l-1.35547.11426c-.09131.20898-.19189.4082-.30273.59961h0c-.10938.18945-.23242.37793-.36816.56348l.58057,1.22949c.44043.93164.08643,2.06738-.80664,2.58496l-.8208.47461c-.89355.51855-2.05371.25781-2.64258-.59082l-.77734-1.11816c-.4458.04883-.89404.04785-1.34082.00098l-.77637,1.12012c-.38379.55371-1.01172.85645-1.65039.85645ZM6.9043,3.22461c-.08496,0-.17041.02148-.24805.06641l-.8208.47461c-.22266.12891-.31152.41211-.20117.64551l.77881,1.65039c.12598.2666.08398.58203-.10742.80664-.2041.23926-.37305.47656-.5166.72559-.14111.24609-.26514.51855-.36816.80957-.09814.27832-.3501.47266-.64404.49707l-1.81885.15332c-.26172.02246-.4585.23633-.4585.49902l.00098.94629c0,.25781.20117.47656.4585.49805l1.81934.15039c.29395.02441.54639.21875.64502.49707.19873.56055.49707,1.07617.88672,1.53223.19189.22363.23438.54004.10889.80664l-.77783,1.65234c-.10938.2334-.021.51758.20264.64551l.82031.47363c.22412.12988.51416.06348.66016-.14746l1.04102-1.50195c.16748-.24219.45898-.36914.75244-.30957.58838.10742,1.18457.1084,1.77002-.00098.28955-.05469.58496.06641.75342.30957l1.04199,1.49902c.14648.20996.43848.27637.66064.14746l.82031-.47363c.22607-.13086.31348-.40918.20117-.64648l-.77881-1.65039c-.12598-.2666-.08398-.58203.10742-.80664.2041-.24023.37305-.47656.51562-.72461l.00049-.00098c.14258-.24707.26318-.51172.36865-.80957.09863-.27832.35059-.47266.64453-.49707l1.81885-.15234c.25635-.02246.45752-.24121.45752-.49902l-.00049-.94727c0-.26172-.19727-.47559-.45898-.49805l-1.81885-.15039c-.29395-.02441-.54639-.21875-.64502-.49707-.19775-.55957-.49658-1.0752-.88721-1.53223-.19141-.22461-.23389-.54004-.1084-.80664l.77734-1.65234c.10986-.2334.021-.51758-.20264-.64648l-.81982-.47266c-.22461-.12695-.51416-.06152-.66113.14941l-1.03955,1.5c-.16797.24316-.45898.36816-.75293.31055-.59131-.10938-1.1875-.10938-1.77002,0-.29199.05176-.58545-.06738-.75342-.30957l-1.04199-1.49902c-.09619-.1377-.25293-.21387-.41211-.21387Z"/>' +
    '</svg>';

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
    return !!(
      node &&
      node.closest &&
      node.closest(
        'button, a, select, input, textarea, label, [role="button"], .lab-env-toolbar__actions, .lab-env-version-pill',
      )
    );
  }

  function isOverlayFormControl(node) {
    return !!(
      node &&
      node.closest &&
      node.closest('select, input, textarea, button, [role="button"], label, datalist, option')
    );
  }

  function isNativeSelectEngaged() {
    if (Date.now() < selectDismissGraceUntil) return true;
    var active = document.activeElement;
    if (!active || String(active.tagName || '').toUpperCase() !== 'SELECT') return false;
    var anchor = resolveAnchor();
    var panel = byId(OVERLAY_PANEL_ID) || (anchor && anchor.querySelector('.lab-env-overlay-panel'));
    return !!(panel && panel.contains(active));
  }

  function isConfiguring(anchor) {
    anchor = anchor || resolveAnchor();
    return !!(anchor && anchor.classList.contains(CONFIGURING_CLASS));
  }

  function setConfiguring(anchor, configuring) {
    if (!anchor) return;
    anchor.classList.toggle(CONFIGURING_CLASS, !!configuring);
  }

  function shouldBlockOverlayDismiss(anchor) {
    anchor = anchor || resolveAnchor();
    if (datastreamManualEntryOpen) return true;
    if (isOverlayPinned(anchor)) return true;
    if (isConfiguring(anchor)) return true;
    if (isNativeSelectEngaged()) return true;
    return false;
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

  function markNativeSelectInteraction() {
    selectDismissGraceUntil = Date.now() + 800;
  }

  function bindOverlayInteractionGuards(anchor) {
    var panel = byId(OVERLAY_PANEL_ID) || (anchor && anchor.querySelector('.lab-env-overlay-panel'));
    if (!panel || panel.getAttribute('data-lab-env-guards') === '1') return;
    panel.setAttribute('data-lab-env-guards', '1');

    panel.addEventListener(
      'focusin',
      function (ev) {
        if (!isOverlayFormControl(ev.target)) return;
        setConfiguring(anchor, true);
        if (!isOverlayOpen(anchor)) {
          openOverlay(anchor, isOverlayPinned(anchor));
        }
      },
      true,
    );

    panel.addEventListener(
      'mousedown',
      function (ev) {
        if (!ev.target || String(ev.target.tagName || '').toUpperCase() !== 'SELECT') return;
        markNativeSelectInteraction();
        setConfiguring(anchor, true);
      },
      true,
    );

    panel.addEventListener(
      'change',
      function (ev) {
        if (!ev.target || String(ev.target.tagName || '').toUpperCase() !== 'SELECT') return;
        markNativeSelectInteraction();
      },
      true,
    );

    panel.addEventListener(
      'focusout',
      function (ev) {
        if (datastreamManualEntryOpen) return;
        if (!isConfiguring(anchor)) return;
        global.setTimeout(function () {
          if (datastreamManualEntryOpen) return;
          if (isNativeSelectEngaged()) return;
          if (isOverlayPinned(anchor)) return;
          var active = document.activeElement;
          if (active && panel.contains(active) && isOverlayFormControl(active)) return;
          setConfiguring(anchor, false);
        }, 0);
      },
      true,
    );
  }

  function minToolbarInsetPx(anchor) {
    var fromVar = parseFloat(getComputedStyle(anchor).getPropertyValue('--env-bar-height'));
    if (!isNaN(fromVar) && fromVar > 0) return Math.ceil(fromVar);
    return 48;
  }

  /** Spectrum shells mount a fixed overlay panel — never leave legacy peek transform on the banner. */
  function ensureSpectrumBannerPeekCleared(anchor) {
    if (!anchor) return;
    var panel = byId(OVERLAY_PANEL_ID) || anchor.querySelector('.lab-env-overlay-panel');
    if (!panel) return;
    var banner = anchor.querySelector('[class*="-demo-id-banner"]') || anchor.querySelector('.mod-demo-id-banner');
    if (!banner) return;
    banner.style.setProperty('transform', 'none', 'important');
    if (
      anchor.classList.contains('lab-env-top-anchor--expanded') ||
      anchor.classList.contains('lab-env-top-anchor--pinned') ||
      anchor.classList.contains(PROFILE_ONLY_CLASS) ||
      anchor.classList.contains(CONFIGURING_CLASS)
    ) {
      banner.style.setProperty('max-height', 'none', 'important');
      banner.style.setProperty('overflow', 'visible', 'important');
    } else {
      banner.style.removeProperty('max-height');
      banner.style.removeProperty('overflow');
    }
  }

  function syncToolbarOverlayInset(anchor, isOpen) {
    if (!anchor) return;
    if (toolbarResizeObserver) {
      toolbarResizeObserver.disconnect();
      toolbarResizeObserver = null;
    }
    if (!isOpen) {
      anchor.style.removeProperty('--lab-env-overlay-top');
      return;
    }
    ensureSpectrumBannerPeekCleared(anchor);
    var toolbar = anchor.querySelector('.lab-env-toolbar');
    var panel = byId(OVERLAY_PANEL_ID) || anchor.querySelector('.lab-env-overlay-panel');
    if (!toolbar) return;

    var insetRetries = 0;
    var minTopPx = minToolbarInsetPx(anchor);

    function applyInset() {
      ensureSpectrumBannerPeekCleared(anchor);
      var rect = toolbar.getBoundingClientRect();
      var topPx = Math.max(0, Math.ceil(rect.bottom));
      var measuredHeight = Math.ceil(rect.height || 0);
      if (topPx < minTopPx) {
        if (measuredHeight > 0) topPx = Math.max(topPx, measuredHeight);
        else topPx = minTopPx;
      }
      if (topPx < minTopPx && insetRetries < 8) {
        insetRetries += 1;
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(applyInset);
        } else {
          global.setTimeout(applyInset, 16);
        }
        return;
      }
      anchor.style.setProperty('--lab-env-overlay-top', Math.max(topPx, minTopPx) + 'px');
      if (panel) {
        panel.scrollTop = 0;
        var section = panel.querySelector('.aep-demo-env-section');
        if (section) section.scrollTop = 0;
      }
    }

    function scheduleInset() {
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(function () {
          global.requestAnimationFrame(applyInset);
        });
      } else {
        applyInset();
      }
    }

    scheduleInset();

    if (typeof global.ResizeObserver === 'function') {
      toolbarResizeObserver = new global.ResizeObserver(function () {
        applyInset();
      });
      toolbarResizeObserver.observe(toolbar);
    }

    if (!anchor.getAttribute('data-lab-env-inset-resync')) {
      anchor.setAttribute('data-lab-env-inset-resync', '1');
      global.addEventListener('load', function () {
        if (isOverlayOpen(anchor)) applyInset();
      });
      if (global.document && global.document.fonts && typeof global.document.fonts.ready === 'object') {
        void global.document.fonts.ready.then(function () {
          if (isOverlayOpen(anchor)) applyInset();
        });
      }
    }
  }

  function syncProfilePeekChrome(anchor, isProfileOnly) {
    var panel = byId(OVERLAY_PANEL_ID) || (anchor && anchor.querySelector('.lab-env-overlay-panel'));
    if (!panel) return;
    panel.classList.toggle('lab-env-overlay-panel--profile-only', !!isProfileOnly);
    panel.querySelectorAll('[data-env-overlay-footer-item]').forEach(function (node) {
      if (isProfileOnly) {
        if (!node.hasAttribute('data-env-footer-was-hidden')) {
          node.setAttribute('data-env-footer-was-hidden', node.hasAttribute('hidden') ? '1' : '0');
        }
        node.setAttribute('hidden', '');
        return;
      }
      var wasHidden = node.getAttribute('data-env-footer-was-hidden');
      if (wasHidden === '0') node.removeAttribute('hidden');
      else if (wasHidden === '1') node.setAttribute('hidden', '');
      node.removeAttribute('data-env-footer-was-hidden');
    });
  }

  function setExpanded(anchor, expanded, pinned, profileOnly) {
    if (!anchor) return;
    ensureSpectrumBannerPeekCleared(anchor);
    var isProfileOnly = !!profileOnly && !expanded;
    var isOpen = !!(expanded || pinned || isProfileOnly);
    anchor.classList.toggle(PROFILE_ONLY_CLASS, isProfileOnly);
    anchor.classList.toggle('lab-env-top-anchor--expanded', !!expanded);
    anchor.classList.toggle('lab-env-top-anchor--pinned', !!pinned);
    anchor.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    var panel = byId(OVERLAY_PANEL_ID) || anchor.querySelector('.lab-env-overlay-panel');
    if (panel) {
      if (isOpen) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    }

    syncProfilePeekChrome(anchor, isProfileOnly);
    syncToolbarOverlayInset(anchor, isOpen);
    syncFullOpenBtn(anchor);

    try {
      global.dispatchEvent(
        new CustomEvent('aep-lab-env-overlay-state', {
          detail: { open: isOpen, expanded: !!expanded, pinned: !!pinned, profileOnly: isProfileOnly },
        }),
      );
    } catch (_ev) {
      /* noop */
    }

    var toggleBtn = byId(TOGGLE_BTN_ID);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isProfileOnly) {
        toggleBtn.setAttribute('aria-label', isOpen ? 'Hide profile lookup' : 'Show profile lookup');
        toggleBtn.setAttribute('title', isOpen ? 'Collapse profile lookup' : 'Show profile lookup');
      } else {
        toggleBtn.setAttribute('aria-label', isOpen ? 'Hide environment controls' : 'Show environment controls');
        toggleBtn.setAttribute('title', isOpen ? 'Collapse environment panel' : 'Expand environment panel');
      }
    }

    var pinBtn = byId(PIN_BTN_ID);
    if (pinBtn) {
      pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      pinBtn.setAttribute('aria-label', pinned ? 'Unpin environment panel' : 'Pin environment panel open');
      pinBtn.setAttribute('title', pinned ? 'Unpin environment panel' : 'Pin environment panel open');
    }
  }

  function shouldOpenProfilePeekFirst() {
    var sec = document.getElementById('aepDemoEnvSection');
    if (sec && sec.classList.contains('aep-demo-env-section--collapsed')) return true;
    var grid = document.getElementById('aepDemoEnvConfigGrid');
    if (grid && grid.hasAttribute('hidden')) return true;
    var scriptsBtn = document.getElementById('aepSpectrumScriptsCount');
    if (scriptsBtn) {
      var scriptText = String(scriptsBtn.textContent || '').trim();
      if (scriptText && scriptText !== 'None' && scriptText !== '—') return true;
    }
    return false;
  }

  function syncFullOpenBtn(anchor) {
    var btn = byId(FULL_OPEN_BTN_ID);
    if (!btn) return;
    var show = !!(anchor && anchor.classList.contains(PROFILE_ONLY_CLASS));
    if (show) btn.removeAttribute('hidden');
    else btn.setAttribute('hidden', '');
  }

  function openProfilePeek(anchor) {
    setExpanded(anchor, false, false, true);
  }

  function expandToFullEnvironment(anchor) {
    var expandBtn = byId(EXPAND_BTN_ID);
    if (expandBtn) {
      expandBtn.click();
      return;
    }
    openOverlay(anchor, anchor.classList.contains('lab-env-top-anchor--pinned'));
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
    btn.innerHTML = DOCK_ICON_SVG;
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
      anchor.classList.contains(PROFILE_ONLY_CLASS) ||
      anchor.classList.contains('lab-env-top-anchor--expanded') ||
      anchor.classList.contains('lab-env-top-anchor--pinned')
    );
  }

  function openOverlay(anchor, pin) {
    setExpanded(anchor, true, !!pin, false);
    if (pin) writePinnedToStorage(true);
    bindOverlayInteractionGuards(anchor);
  }

  function closeOverlay(anchor, opts) {
    anchor = anchor || resolveAnchor();
    if (!anchor) return false;
    var options = opts || {};
    if (!options.force && shouldBlockOverlayDismiss(anchor)) return false;
    setConfiguring(anchor, false);
    setExpanded(anchor, false, false, false);
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
    if (isOverlayOpen(anchor)) closeOverlay(anchor, { force: true });
    else if (shouldOpenProfilePeekFirst()) openProfilePeek(anchor);
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
    ensureSpectrumBannerPeekCleared(anchor);

    if (readPinnedFromStorage()) openOverlay(anchor, true);
    else syncToolbarOverlayInset(anchor, false);

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

    var fullOpenBtn = byId(FULL_OPEN_BTN_ID);
    if (fullOpenBtn) {
      fullOpenBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        expandToFullEnvironment(anchor);
      });
    }

    var toolbar = anchor.querySelector('.lab-env-toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', function (ev) {
        if (isInteractiveToolbarTarget(ev.target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (isOverlayOpen(anchor)) closeOverlay(anchor);
        else if (shouldOpenProfilePeekFirst()) openProfilePeek(anchor);
        else openOverlay(anchor, anchor.classList.contains('lab-env-top-anchor--pinned'));
      });
    }

    bindOverlayInteractionGuards(anchor);

    document.addEventListener(
      'click',
      function (ev) {
        if (!anchor.querySelector('.lab-env-overlay-panel')) return;
        if (!isOverlayOpen(anchor)) return;
        if (shouldBlockOverlayDismiss(anchor)) return;
        if (isOverlayInteractionTarget(ev.target, anchor)) return;
        closeOverlay(anchor);
      },
      true,
    );

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (datastreamManualEntryOpen) return;
      if (isOverlayPinned(anchor)) return;
      if (!isOverlayOpen(anchor)) return;
      closeOverlay(anchor);
    });
  }

  global.addEventListener('aep-lab-datastream-manual-entry', function (ev) {
    datastreamManualEntryOpen = !!(ev && ev.detail && ev.detail.open);
    var anchor = resolveAnchor();
    if (datastreamManualEntryOpen) {
      setConfiguring(anchor, true);
      if (anchor && !isOverlayOpen(anchor)) openOverlay(anchor, isOverlayPinned(anchor));
    }
  });

  global.addEventListener('aep-demo-env-configured', function () {
    if (global.AepLabTagsInjectGuard && global.AepLabTagsInjectGuard.isInProgress()) return;
    if (shouldBlockOverlayDismiss()) return;
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
