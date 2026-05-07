/**
 * MOD (British Army) demo â€” profile lookup + flyout lab nav; saved homepage in iframe.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'modNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const modMessage = document.getElementById('modMessage');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];
const modTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'modDemo',
        identityEventType: 'mod.identity.stitch',
        messageSetter: setModMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'modTagsCompany',
        tagsPropertyInputId: 'modTagsProperty',
        tagsPropertyListId: 'modTagsPropertyList',
        tagsEnvironmentId: 'modTagsEnvironment',
        injectButtonId: 'modInjectSdkBtn',
        selectedScriptId: 'modSelectedScript',
        configFieldsId: 'modSdkConfigFields',
        configSummaryId: 'modSdkConfigSummary',
        configSummaryTextId: 'modSdkConfigSummaryText',
        changeConfigButtonId: 'modChangeSdkConfigBtn',
        iframeIds: ['modDemoSiteFrame'],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setModMessage(text, type) {
  if (!modMessage) return;
  modMessage.textContent = text || '';
  modMessage.className =
    'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  modMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
  try {
    const res = await fetch('/api/events/generator-targets');
    const data = await res.json().catch(() => ({}));
    generatorTargets = Array.isArray(data.targets) ? data.targets : [];
    generatorTargetSelect.innerHTML = '';
    if (generatorTargets.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No targets (check event-generator-targets.json)';
      generatorTargetSelect.appendChild(opt);
      return;
    }
    generatorTargets.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label || t.id;
      generatorTargetSelect.appendChild(opt);
    });
  } catch {
    generatorTargetSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Failed to load targets';
    generatorTargetSelect.appendChild(opt);
  }
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setModMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setModMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !modTagsInjection || typeof modTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await modTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setModMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

loadGeneratorTargets();

(function normalizeSnapshotFrame() {
  const frame = document.querySelector('.mod-demo-site-frame');
  if (!frame) return;

  function applySnapshotLayoutFix(doc) {
    const root = doc.documentElement;
    const body = doc.body;
    if (!root || !body) return;

    root.classList.remove('lenis', 'lenis-scrolling');
    root.style.removeProperty('--viewport-width');
    root.style.removeProperty('--viewport-height');
    root.style.removeProperty('--scrollbar-width');
    root.style.removeProperty('scroll-behavior');

    let styleEl = doc.getElementById('aep-mod-snapshot-runtime-fix');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'aep-mod-snapshot-runtime-fix';
      doc.head.appendChild(styleEl);
    }

    styleEl.textContent = [
      'html,body{margin:0!important;width:100%!important;max-width:none!important;overflow-x:hidden!important;}',
      '.pin-spacer{width:100%!important;max-width:100%!important;left:0!important;right:0!important;padding:0!important;margin:0!important;transform:none!important;overflow:visible!important;}',
      '.pin-spacer>.exp-content__block-container,.pin-spacer>[x-ref=\"blockInner\"]{width:100%!important;max-width:100%!important;left:0!important;right:0!important;top:0!important;margin:0!important;transform:none!important;}',
      '.exp-hero-banner__logo{position:fixed!important;top:18px!important;left:50%!important;transform:translateX(-50%)!important;z-index:1200!important;margin:0!important;}',
      '.exp-hero-banner__cta-btn{position:fixed!important;top:18px!important;left:22px!important;transform:none!important;z-index:1200!important;margin:0!important;}',
      '.exp-hero-banner__text-container,.exp-hero-banner__media-container,.exp-hero-banner__scroll-prompt{transform:none!important;}',
    ].join('');
  }

  frame.addEventListener('load', function () {
    const doc = frame.contentDocument;
    if (!doc) return;
    applySnapshotLayoutFix(doc);
    try {
      frame.contentWindow.scrollTo(0, 0);
    } catch {}
  });
})();

(function initModDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('mod-demo-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('mod-demo-page--nav-open', open);
  }

  function scheduleClose() {
    clearHideTimer();
    hideTimer = window.setTimeout(function () {
      setFlyoutOpen(false);
      hideTimer = null;
    }, 450);
  }

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 24) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    const r = sidebar.getBoundingClientRect();
    const over =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    if (body.classList.contains('mod-demo-page--nav-open')) {
      scheduleClose();
    }
  }

  sidebar.addEventListener('mouseenter', function () {
    if (!mq.matches) {
      clearHideTimer();
      setFlyoutOpen(true);
    }
  });

  sidebar.addEventListener('mouseleave', function () {
    if (!mq.matches) scheduleClose();
  });

  document.addEventListener('mousemove', onPointerMove, { passive: true });

  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('mod-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'mod-demo-page--profile-open',
  viewName: 'MOD (British Army)',
  emailGetter: getEmail,
  messageSetter: setModMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function setupModDemoAskOverlay() {
  const body = document.body;
  const floatBtn = document.getElementById('modDemoAskFloat');
  const overlay = document.getElementById('modDemoAskDialog');
  const panelInput = document.getElementById('modDemoAskInput');
  const sendBtn = document.getElementById('modDemoAskSend');
  if (!floatBtn || !overlay || !panelInput || !sendBtn) return;

  function deepQuerySelector(root, selector) {
    if (!root || !root.querySelector) return null;
    const hit = root.querySelector(selector);
    if (hit) return hit;
    const hosts = root.querySelectorAll('*');
    for (let i = 0; i < hosts.length; i++) {
      const el = hosts[i];
      if (el.shadowRoot) {
        const inner = deepQuerySelector(el.shadowRoot, selector);
        if (inner) return inner;
      }
    }
    return null;
  }

  function findConciergeField(mount) {
    if (!mount) return null;
    const selectors = ['textarea', 'input[type="text"]', 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'];
    for (let s = 0; s < selectors.length; s++) {
      const el = deepQuerySelector(mount, selectors[s]);
      if (el && typeof el.value === 'string' && !el.disabled) return el;
    }
    return null;
  }

  function findConciergeSend(mount) {
    if (!mount) return null;
    return (
      deepQuerySelector(mount, 'button[aria-label*="Send" i]') ||
      deepQuerySelector(mount, 'button[type="submit"]') ||
      null
    );
  }

  function forwardToConcierge(text) {
    const mount = document.getElementById('brand-concierge-mount');
    if (!mount) return false;
    const field = findConciergeField(mount);
    if (!field) return false;
    field.focus();
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    const go = findConciergeSend(mount);
    if (go) {
      go.click();
    } else {
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
      );
    }
    return true;
  }

  function attemptForward(text, attempt) {
    const n = typeof attempt === 'number' ? attempt : 0;
    if (forwardToConcierge(text)) {
      panelInput.value = '';
      return;
    }
    if (n >= 45) return;
    window.setTimeout(function () {
      attemptForward(text, n + 1);
    }, 120);
  }

  function isOverlayOpen() {
    return overlay && !overlay.hasAttribute('hidden');
  }

  function closeAskOverlay() {
    overlay.setAttribute('hidden', '');
    body.classList.remove('mod-demo-page--ask-open');
    floatBtn.setAttribute('aria-expanded', 'false');
    body.style.overflow = '';
    floatBtn.focus();
  }

  function openAskOverlay() {
    overlay.removeAttribute('hidden');
    body.classList.add('mod-demo-page--ask-open');
    floatBtn.setAttribute('aria-expanded', 'true');
    body.style.overflow = 'hidden';
    window.setTimeout(function () {
      panelInput.focus();
    }, 0);
  }

  floatBtn.addEventListener('click', function () {
    if (isOverlayOpen()) return;
    openAskOverlay();
  });

  overlay.querySelectorAll('[data-mod-demo-ask-close]').forEach(function (el) {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      closeAskOverlay();
    });
  });

  overlay.querySelectorAll('[data-mod-demo-ask-suggestion]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const q = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (!q) return;
      panelInput.value = q;
      submitFromPanel();
    });
  });

  function submitFromPanel() {
    const text = (panelInput.value || '').trim();
    if (!text) return;

    closeAskOverlay();

    const dismissed = document.body.classList.contains('aep-bc-panel-dismissed');
    if (dismissed) {
      const reopen = document.getElementById('aepBcReopenBtn');
      if (reopen) reopen.click();
      window.setTimeout(function () {
        attemptForward(text, 0);
      }, 280);
      return;
    }

    attemptForward(text, 0);
  }

  sendBtn.addEventListener('click', submitFromPanel);
  panelInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      submitFromPanel();
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!isOverlayOpen()) return;
    ev.preventDefault();
    closeAskOverlay();
  });
})();
