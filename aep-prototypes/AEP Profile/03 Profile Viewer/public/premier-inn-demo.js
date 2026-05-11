/**
 * Premier Inn demo — profile lookup + Tags injection (shared DemoTagsInjection) + flyout lab nav.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'premierInnNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const premierInnMessage = document.getElementById('premierInnMessage');

const premierInnTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined'
    ? window.DemoTagsInjection.init({
        storagePrefix: 'premierInn',
        identityEventType: 'premierinn.identity.stitch',
        messageSetter: setPremierInnMessage,
        infoEcidId: 'infoEcid',
        tagsCompanyId: 'premierInnTagsCompany',
        tagsPropertyInputId: 'premierInnTagsProperty',
        tagsPropertyListId: 'premierInnTagsPropertyList',
        tagsEnvironmentId: 'premierInnTagsEnvironment',
        injectButtonId: 'injectSdkBtn',
        selectedScriptId: 'premierInnSelectedScript',
        configFieldsId: 'premierInnSdkConfigFields',
        configSummaryId: 'premierInnSdkConfigSummary',
        configSummaryTextId: 'premierInnSdkConfigSummaryText',
        changeConfigButtonId: 'premierInnChangeSdkConfigBtn',
        iframeIds: ['premierInnSiteFrame'],
      })
    : null;

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setPremierInnMessage(text, type) {
  if (!premierInnMessage) return;
  premierInnMessage.textContent = text || '';
  premierInnMessage.className =
    'premier-inn-demo-message' + (type ? ' premier-inn-demo-message--' + String(type).replace(/\s+/g, '-') : '');
  premierInnMessage.hidden = !text;
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setPremierInnMessage('Enter a customer identifier first.', 'error');
      return;
    }
    setPremierInnMessage('Looking up profile...', '');
    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    if (!ok || !premierInnTagsInjection || typeof premierInnTagsInjection.stitchAfterProfileLookup !== 'function') return;
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const stitched = await premierInnTagsInjection.stitchAfterProfileLookup(profile, email);
    if (stitched) setPremierInnMessage('Profile loaded and email linked to ECID for stitching.', 'success');
  });

(function initPremierInnDemoFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('premier-inn-demo-page')) return;
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
    body.classList.toggle('premier-inn-demo-page--nav-open', open);
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
    if (body.classList.contains('premier-inn-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('premier-inn-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: 'premier-inn-demo-page--profile-open',
  viewName: 'Premier Inn demo',
  emailGetter: getEmail,
  messageSetter: setPremierInnMessage,
  fetchBrowserEcidOnInit: true,
});

(function initPremierInnSandboxAndEnvBar() {
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
      summaryId: 'premierInnSdkConfigSummary',
      fieldsId: 'premierInnSdkConfigFields',
      sandboxSelectId: 'sandboxSelect',
      selectedScriptCodeId: 'premierInnSelectedScript',
    });
  }
})();
