/**
 * Admiral demo — profile lookup + Tags injection (shared DemoTagsInjection) + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'admiralNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const admiralMessage = document.getElementById('admiralMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const admiralTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'admiral',
        identityEventType: 'admiral.identity.stitch',
        messageSetter: setAdmiralMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'admiralTagsCompany',
        tagsPropertyInputId: 'admiralTagsProperty',
        tagsPropertyListId: 'admiralTagsPropertyList',
        tagsEnvironmentId: 'admiralTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'admiralSelectedScript',
        configFieldsId: 'admiralSdkConfigFields',
        configSummaryId: 'admiralSdkConfigSummary',
        configSummaryTextId: 'admiralSdkConfigSummaryText',
        changeConfigButtonId: 'admiralChangeSdkConfigBtn',
        iframeIds: ['admiralSiteFrame'],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setAdmiralMessage(text, type) {
  if (!admiralMessage) return;
  admiralMessage.textContent = text || '';
  admiralMessage.className =
    'admiral-demo-message' + (type ? ' admiral-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  admiralMessage.hidden = !text;
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

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setAdmiralMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setAdmiralMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !admiralTagsInjection || typeof admiralTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await admiralTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setAdmiralMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initAdmiralDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('admiral-demo-page')) return;
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
    body.classList.toggle('admiral-demo-page--nav-open', open);
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
    if (body.classList.contains('admiral-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('admiral-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'admiral-demo-page--profile-open',
  viewName: 'Admiral demo',
  emailGetter: getEmail,
  messageSetter: setAdmiralMessage,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initAdmiralSandboxAndEnvBar() {
  const sandboxSelect = document.getElementById('sandboxSelect');
  if (!sandboxSelect || typeof AepGlobalSandbox === 'undefined') return;
  if (typeof AepGlobalSandbox.onSandboxSelectChange === 'function') {
    AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
  }
  if (typeof AepGlobalSandbox.attachStorageSync === 'function') {
    AepGlobalSandbox.attachStorageSync(sandboxSelect);
  }
  if (typeof AepGlobalSandbox.loadSandboxesIntoSelect === 'function') {
    void AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
  }
  if (typeof AepDemoEnvBar !== 'undefined' && typeof AepDemoEnvBar.init === 'function') {
    AepDemoEnvBar.init({
      envSectionId: 'aepDemoEnvSection',
      envEditorId: 'aepDemoEnvEditor',
      envCollapsibleGridId: 'aepDemoEnvConfigGrid',
      envCompactId: 'aepDemoEnvCompact',
      envCompactTextId: 'aepDemoEnvCompactText',
      envExpandBtnId: 'aepDemoEnvExpandBtn',
      summaryId: 'admiralSdkConfigSummary',
      fieldsId: 'admiralSdkConfigFields',
      sandboxSelectId: 'sandboxSelect',
      selectedScriptCodeId: 'admiralSelectedScript',
    });
  }
})();
