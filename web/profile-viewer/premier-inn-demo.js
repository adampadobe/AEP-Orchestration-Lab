/**
 * Premier Inn demo — profile lookup + Tags injection (shared DemoTagsInjection) + optional Alloy web push + flyout lab nav.
 * Iframe journey emits generic hospitality events (hotel.*) via postMessage; parent POSTs /api/events/generator.
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'premierInnNs');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const premierInnMessage = document.getElementById('premierInnMessage');
const generatorTargetSelect = document.getElementById('generatorTarget');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

const premierInnSiteFrame = document.getElementById('premierInnSiteFrame');
/** Match Demo Website / global v1.1 style datasets (see Navigator `_demosystem5` for generator-only CTAs). */
const PREMIER_INN_XDM_TENANT_KEY = '_demoemea';

const PREMIER_INN_WEB_PUSH_ON_INJECT_KEY = 'premierInnWebPushOnInjectToggle';
const premierInnWebPushOnInjectToggle = document.getElementById('premierInnWebPushOnInjectToggle');
if (premierInnWebPushOnInjectToggle) {
  try {
    if (localStorage.getItem(PREMIER_INN_WEB_PUSH_ON_INJECT_KEY) === '1') premierInnWebPushOnInjectToggle.checked = true;
  } catch {
    /* noop */
  }
  premierInnWebPushOnInjectToggle.addEventListener('change', function () {
    try {
      localStorage.setItem(PREMIER_INN_WEB_PUSH_ON_INJECT_KEY, premierInnWebPushOnInjectToggle.checked ? '1' : '0');
    } catch {
      /* noop */
    }
  });
}

function premierInnWebPushOnInjectDesired() {
  return !!(premierInnWebPushOnInjectToggle && premierInnWebPushOnInjectToggle.checked);
}

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
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        getEmail: () => (customerEmail && customerEmail.value) || '',
        /* Launch only on the parent shell: iframe + third-party cookies often mint a different ECID than the parent, while hotel.* events use parent #infoEcid via the generator — bad anonymous tracking. */
        iframeIds: [],
        webPush: {
          enabled: true,
          subscribeAfterInject: premierInnWebPushOnInjectDesired,
          requestPermissionOnInject: premierInnWebPushOnInjectDesired,
        },
      })
    : null;

const premierInnWebPushRetryBtn = document.getElementById('premierInnWebPushRetryBtn');
if (premierInnWebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  premierInnWebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: 'premierInn' }).then(function (ok) {
      setPremierInnMessage(
        ok
          ? 'Web push subscription sent (requires Tags Web SDK pushNotifications, permission, and AJO push surface).'
          : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
        ok ? 'success' : 'error',
      );
    });
  });
}

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

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

function premierInnLooksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

/**
 * Upserts the stayer generic profile and returns the ECID Adobe has for that person
 * (existing lookup when appendIfExisting, else generated) so the follow-up Experience Event
 * can use the same identities as the profile, not the booker's browser ECID.
 * @param {Record<string, unknown>} [pub] - iframe `public` (hotelStayer* fields)
 * @returns {Promise<{ ok: true, email: string, ecid: string } | { ok: false, error: string }>}
 */
async function upsertPremierInnStayerProfile(pub) {
  const p = pub && typeof pub === 'object' ? pub : {};
  if (p.hotelStayerSameAsBooker === true) {
    return { ok: false, error: 'Stayer is the same as the booker — no separate stayer profile event.' };
  }
  const em = String(p.hotelStayerEmail || '').trim();
  if (!premierInnLooksLikeEmail(em)) {
    return { ok: false, error: 'Missing valid stayer email for profile upsert.' };
  }
  const fn = String(p.hotelStayerFirstName || '').trim();
  const ln = String(p.hotelStayerLastName || '').trim();
  /** @type {Record<string, string>} */
  const attrs = {};
  if (fn) attrs['person.name.firstName'] = fn;
  if (ln) attrs['person.name.lastName'] = ln;
  const body = { email: em, industry: 'generic', appendIfExisting: true, attributes: attrs };
  const postBody =
    typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody
      ? window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
      : body;
  const doFetch =
    typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.labAuthFetch
      ? (url, opts) => window.AepDemoGeneratorTargets.labAuthFetch(url, opts)
      : fetch;
  try {
    const res = await doFetch('/api/profile/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.error || data.message || `HTTP ${res.status}`;
      return { ok: false, error: String(detail) };
    }
    const outEcid = data.ecid != null ? String(data.ecid).trim() : '';
    if (!/^\d{10,}$/.test(outEcid)) {
      return { ok: false, error: 'Profile upsert succeeded but no usable ECID was returned for the stayer.' };
    }
    return { ok: true, email: em, ecid: outEcid };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * @param {{ eventType?: string, viewName?: string, viewUrl?: string, public?: Record<string, unknown> }} payload
 */
async function sendPremierInnHotelExperienceEvent(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const eventType = String(p.eventType || 'hotel.search').trim();
  const pub = p.public && typeof p.public === 'object' ? p.public : {};
  const ecidEl = document.getElementById('infoEcid');
  const ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
  let ecid =
    ecidText && ecidText !== '-' && ecidText !== '\u2014' && /^\d+$/.test(ecidText) && ecidText.length >= 10
      ? ecidText
      : null;
  let emailForEvent = getEmail().trim();

  if (eventType === 'hotel.booking.stayerIdentified') {
    const prep = await upsertPremierInnStayerProfile(pub);
    if (!prep.ok) {
      setPremierInnMessage(
        prep.error + ' The stayer event was not sent so it does not land on the wrong profile.',
        'error',
      );
      return false;
    }
    emailForEvent = prep.email;
    ecid = prep.ecid;
  }

  const target = getSelectedGeneratorTarget();
  const body = {
    targetId: target ? target.id : undefined,
    eventType,
    viewName: String(p.viewName || 'Premier Inn lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''),
    channel: 'web',
    public: pub,
    xdmTenantKey: PREMIER_INN_XDM_TENANT_KEY,
    identityMapEcidKey: 'ECID',
  };
  if (emailForEvent) body.email = emailForEvent;
  if (ecid) body.ecid = ecid;
  const postBody =
    typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody
      ? window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
      : body;
  try {
    const res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.error || data.message || 'Request failed.';
      let extra = '';
      if (data.streamingResponse) extra = ' \u2014 ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
      else if (data.edgeBody) extra = ' \u2014 ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
      setPremierInnMessage(errMsg + extra, 'error');
      return false;
    }
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setPremierInnMessage((data.message || 'Hotel journey event sent to AEP.') + idPart, 'success');
    if (ecid && typeof DemoProfileDrawer !== 'undefined' && typeof DemoProfileDrawer.refreshDrawerEventsForIdentity === 'function') {
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
      window.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
      }, 2500);
      window.setTimeout(function () {
        void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
      }, 8000);
    }
    return true;
  } catch (err) {
    setPremierInnMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', async function (ev) {
  if (!premierInnSiteFrame || !premierInnSiteFrame.contentWindow || ev.source !== premierInnSiteFrame.contentWindow) {
    return;
  }
  if (!ev.data || ev.data.source !== 'premier-inn-lab') return;

  if (ev.data.type === 'login-request') {
    const email = String(ev.data.email || '').trim();
    if (!email) return;

    if (customerEmail) customerEmail.value = email;

    const ok = await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
    const profile =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    const profileMsg = profile
      ? {
          firstName: profile.firstName || null,
          lastName: profile.lastName || null,
          loyaltyStatus: profile.loyaltyStatus || null,
          churnPrediction: profile.churnPrediction != null ? profile.churnPrediction : null,
          propensityScore: profile.propensityScore != null ? profile.propensityScore : null,
        }
      : null;

    if (premierInnSiteFrame && premierInnSiteFrame.contentWindow) {
      premierInnSiteFrame.contentWindow.postMessage(
        {
          source: 'premier-inn-demo-shell',
          type: 'login-complete',
          found: !!ok,
          email: email,
          firstName: profile ? profile.firstName || null : null,
          profile: profileMsg,
        },
        '*'
      );
      if (ok && profileMsg) {
        premierInnSiteFrame.contentWindow.postMessage(
          { source: 'premier-inn-demo-shell', type: 'profile-loaded', profile: profileMsg },
          '*'
        );
      }
    }

    if (ok && premierInnTagsInjection && typeof premierInnTagsInjection.stitchAfterProfileLookup === 'function') {
      void premierInnTagsInjection.stitchAfterProfileLookup(profile, email);
    }
    return;
  }

  if (ev.data.type === 'hotel-experience-event') {
    void sendPremierInnHotelExperienceEvent(ev.data.payload);
    return;
  }

  if (ev.data.type === 'set-shell-customer-email') {
    const em = String(ev.data.email || '').trim();
    if (!em) return;
    if (customerEmail) customerEmail.value = em;
    void (async () => {
      try {
        const ok = await DemoProfileDrawer.loadProfileDataForDrawer(em, { updateMessage: true });
        const profile =
          window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? window.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        if (ok && premierInnTagsInjection && typeof premierInnTagsInjection.stitchAfterProfileLookup === 'function') {
          await premierInnTagsInjection.stitchAfterProfileLookup(profile, em);
        }
      } catch {
        /* Guest path may have no UPS profile; strip email still updates generator identity. */
      }
    })();
    return;
  }

  if (ev.data.type === 'shell-booker-request') {
    const rid = ev.data.requestId != null ? String(ev.data.requestId) : '';
    if (!rid || !premierInnSiteFrame || !premierInnSiteFrame.contentWindow) return;
    const shellEmail = getEmail().trim();
    const prof =
      window.DemoProfileDrawer && typeof window.DemoProfileDrawer.getLastLookedUpProfile === 'function'
        ? window.DemoProfileDrawer.getLastLookedUpProfile()
        : null;
    premierInnSiteFrame.contentWindow.postMessage(
      {
        source: 'premier-inn-demo-shell',
        type: 'shell-booker-context',
        requestId: rid,
        email: shellEmail || null,
        firstName: prof && prof.firstName ? String(prof.firstName).trim() : null,
        lastName: prof && prof.lastName ? String(prof.lastName).trim() : null,
      },
      '*'
    );
  }
});

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
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});

(function initPremierInnSandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'premierInnSdkConfigSummary',
    fieldsId: 'premierInnSdkConfigFields',
    selectedScriptCodeId: 'premierInnSelectedScript',
  });
})();
