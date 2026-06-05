/**
 * Aviva Target lab — saved Aviva journey in iframe + Tags / Web SDK injection for Target A/B.
 */
const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'avivaTargetNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const avivaTargetMessage = document.getElementById('avivaTargetMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');
const avivaTargetFrame = document.getElementById('avivaTargetFrame');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const avivaTargetTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'avivaTarget',
        identityEventType: 'aviva.target.identity.stitch',
        messageSetter: setAvivaTargetMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'avivaTargetTagsCompany',
        tagsPropertyInputId: 'avivaTargetTagsProperty',
        tagsPropertyListId: 'avivaTargetTagsPropertyList',
        tagsEnvironmentId: 'avivaTargetTagsEnvironment',
        injectButtonId: 'avivaTargetInjectSdkBtn',
        selectedScriptId: 'avivaTargetSelectedScript',
        configFieldsId: 'avivaTargetSdkConfigFields',
        configSummaryId: 'avivaTargetSdkConfigSummary',
        configSummaryTextId: 'avivaTargetSdkConfigSummaryText',
        changeConfigButtonId: 'avivaTargetChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: ['avivaTargetFrame'],
        hideTagsCompanyUi: true,
      })
    : null;

function setAvivaTargetMessage(text, type) {
  if (!avivaTargetMessage) return;
  avivaTargetMessage.textContent = text || '';
  avivaTargetMessage.className =
    'aviva-target-demo-message' + (type ? ' aviva-target-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  avivaTargetMessage.hidden = !text;
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
  if (
    typeof window.AepDemoGeneratorTargets !== 'undefined' &&
    window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
  ) {
    generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
    return;
  }
  try {
    const res = await fetch('/api/events/generator-targets');
    const data = await res.json().catch(() => ({}));
    generatorTargets = Array.isArray(data.targets) ? data.targets : [];
    generatorTargetSelect.innerHTML = '';
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

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const idVal = getEmail().trim();
    if (!idVal) {
      setAvivaTargetMessage('Enter an ECID or email first.', 'error');
      return;
    }
    setAvivaTargetMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
    if (!ok || !avivaTargetTagsInjection || typeof avivaTargetTagsInjection.stitchAfterProfileLookup !== 'function') {
      return;
    }
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await avivaTargetTagsInjection.stitchAfterProfileLookup(profile, idVal);
    if (stitched) setAvivaTargetMessage('Profile loaded and identity linked to ECID for Target audiences.', 'success');
  });

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'aviva-target-demo-page--profile-open',
  viewName: 'Aviva Target demo',
  emailGetter: getEmail,
  messageSetter: setAvivaTargetMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

window.initLabDemoEnvBar && window.initLabDemoEnvBar({ prefix: 'avivaTarget' });

/** Reflect iframe journey path in parent URL (?journey=…) for bookmarks and Target QA. */
const AVIVA_JOURNEY_BASE = 'demos/aviva-target/';
const AVIVA_JOURNEY_MARKER = '/demos/aviva-target/';

function avivaJourneyPathFromFrame() {
  if (!avivaTargetFrame || !avivaTargetFrame.contentWindow) return '';
  try {
    const path = avivaTargetFrame.contentWindow.location.pathname || '';
    const idx = path.toLowerCase().indexOf(AVIVA_JOURNEY_MARKER);
    if (idx === -1) return '';
    return path.slice(idx + AVIVA_JOURNEY_MARKER.length);
  } catch (_e) {
    return '';
  }
}

function syncParentJourneyParam() {
  const journey = avivaJourneyPathFromFrame();
  if (!journey) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('journey') === journey) return;
  url.searchParams.set('journey', journey);
  window.history.replaceState(null, '', url.toString());
}

function applyInitialJourneyFromUrl() {
  if (!avivaTargetFrame) return;
  const journey = new URLSearchParams(window.location.search).get('journey');
  if (!journey) return;
  avivaTargetFrame.src = AVIVA_JOURNEY_BASE + journey.replace(/^\//, '');
}

applyInitialJourneyFromUrl();
if (avivaTargetFrame) {
  avivaTargetFrame.addEventListener('load', syncParentJourneyParam);
}

(function initAvivaTargetDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('aviva-target-demo-page')) return;
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
    body.classList.toggle('aviva-target-demo-page--nav-open', open);
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
    if (body.classList.contains('aviva-target-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('aviva-target-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();
