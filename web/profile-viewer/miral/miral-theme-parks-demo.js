/**
 * Miral Yas Island theme parks lab — shared Web SDK / Tags injection + profile drawer
 * across Warner Bros. World, SeaWorld, and Ferrari World demo pages (same origin).
 */

const parkId = (document.body && document.body.getAttribute('data-miral-park')) || 'wbworld';

/** @type {Record<string, { viewName: string; identityEventType: string; sourceUrl: string }>} */
const PARK = {
  wbworld: {
    viewName: 'Warner Bros. World Yas Island (lab)',
    identityEventType: 'miral.wbworld.identity.stitch',
    sourceUrl: 'https://www.wbworldabudhabi.com/',
  },
  seaworld: {
    viewName: 'SeaWorld Yas Island (lab)',
    identityEventType: 'miral.seaworld.identity.stitch',
    sourceUrl: 'https://www.seaworldabudhabi.com/',
  },
  ferrariworld: {
    viewName: 'Ferrari World Yas Island (lab)',
    identityEventType: 'miral.ferrariworld.identity.stitch',
    sourceUrl: 'https://www.ferrariworldabudhabi.com/',
  },
};

const park = PARK[parkId] || PARK.wbworld;

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'miralNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const miralMessage = document.getElementById('miralMessage');

/** @type {Array<{ id: string; label: string; transport: string }>} */
let generatorTargets = [];

const miralTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'miralThemeParksDemo',
        identityEventType: park.identityEventType,
        messageSetter: setMiralMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'miralTagsCompany',
        tagsPropertyInputId: 'miralTagsProperty',
        tagsPropertyListId: 'miralTagsPropertyList',
        tagsEnvironmentId: 'miralTagsEnvironment',
        injectButtonId: 'miralInjectSdkBtn',
        selectedScriptId: 'miralSelectedScript',
        configFieldsId: 'miralSdkConfigFields',
        configSummaryId: 'miralSdkConfigSummary',
        configSummaryTextId: 'miralSdkConfigSummaryText',
        changeConfigButtonId: 'miralChangeSdkConfigBtn',
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        iframeIds: [],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setMiralMessage(text, type) {
  if (!miralMessage) return;
  miralMessage.textContent = text || '';
  miralMessage.className =
    'miral-park-demo-message' +
    (type ? ' miral-park-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  miralMessage.hidden = !text;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
    generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
    return;
  }
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
      setMiralMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setMiralMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !miralTagsInjection || typeof miralTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await miralTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setMiralMessage('Profile loaded and identifier linked to ECID for stitching.', 'success');
  });

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

(function initMiralDemoSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'miralSdkConfigSummary',
    fieldsId: 'miralSdkConfigFields',
    selectedScriptCodeId: 'miralSelectedScript',
  });
})();

(function initMiralDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('miral-park-demo-page')) return;
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
    body.classList.toggle('miral-park-demo-page--nav-open', open);
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
    if (body.classList.contains('miral-park-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('miral-park-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'miral-park-demo-page--profile-open',
  viewName: park.viewName,
  emailGetter: getEmail,
  messageSetter: setMiralMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});
