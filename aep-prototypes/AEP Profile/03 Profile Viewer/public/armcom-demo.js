/**
 * Arm demo shell — iframe postMessage bridge, journey URL sync, flyout lab nav.
 */
var armcomSiteFrame = document.getElementById('armcomSiteFrame');
var ARMCOM_XDM_TENANT_KEY = '_demoemea';
var ARMCOM_JOURNEY_MARKER = '/demos/armcom/';

function armcomJourneyRelativeFromPathname(pathname) {
  var path = String(pathname || '');
  var idx = path.toLowerCase().indexOf(ARMCOM_JOURNEY_MARKER);
  if (idx === -1) return '';
  return path.slice(idx + ARMCOM_JOURNEY_MARKER.length);
}

function normalizeArmcomFrameSrc(src) {
  var raw = String(src || '').trim();
  if (!raw) return '';
  try {
    var u = new URL(raw, window.location.href);
    return u.pathname.replace(/^\//, '') + (u.search || '');
  } catch (_e) {
    return raw.split('#')[0].replace(/^\//, '');
  }
}

function setArmcomFrameSrcIfNeeded(nextSrc) {
  if (!armcomSiteFrame) return false;
  var next = normalizeArmcomFrameSrc(nextSrc);
  var cur = normalizeArmcomFrameSrc(armcomSiteFrame.getAttribute('src') || armcomSiteFrame.src || '');
  if (!next || cur === next) return false;
  armcomSiteFrame.src = nextSrc;
  return true;
}

function isLinkedInAdReturnVisit() {
  if (window.ArmcomLinkedInReturn && typeof window.ArmcomLinkedInReturn.isLinkedInAdReturnVisit === 'function') {
    return window.ArmcomLinkedInReturn.isLinkedInAdReturnVisit();
  }
  try {
    return new URLSearchParams(window.location.search).get('from') === 'linkedin-ad';
  } catch (_e) {
    return false;
  }
}

function isLinkedInReturnVisit() {
  if (window.ArmcomLinkedInReturn && typeof window.ArmcomLinkedInReturn.isLinkedInReturnVisit === 'function') {
    return window.ArmcomLinkedInReturn.isLinkedInReturnVisit();
  }
  try {
    var from = new URLSearchParams(window.location.search).get('from') || '';
    return from === 'linkedin-ad' || from === 'linkedin-organic' || from === 'activation';
  } catch (_e) {
    return false;
  }
}

function onLinkedInAdReturnIframeReady() {
  if (!isLinkedInReturnVisit()) return;
  if (isLinkedInAdReturnVisit()) {
    triggerArmcomDecisioningRefresh({
      paidSocialReturn: true,
      forceVariant: 'brand-awareness',
      contentTriggered: true,
      leadCaptured: true,
      registered: true,
    });
    if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.onLinkedInAdClick === 'function') {
      window.ArmcomFakeAudiences.onLinkedInAdClick();
    }
    postArmcomBannerMessage('armcom-email-nurture-unlocked', {});
    setArmcomMessage('Returned from LinkedIn ad — brand awareness banner refreshed.', 'success');
    return;
  }
  if (window.ArmcomLinkedInReturn && window.ArmcomLinkedInReturn.isLinkedInOrganicReturnVisit()) {
    setArmcomMessage('Returned from LinkedIn News — arm.com loaded with lab SDK.', 'success');
  }
}

function syncIframeToJourneyUrl() {
  if (!armcomSiteFrame) return;
  var params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (_e) {
    params = null;
  }
  var frameParam = params ? params.get('frame') : null;
  if (frameParam) {
    setArmcomFrameSrcIfNeeded('demos/armcom/' + String(frameParam).replace(/^\//, ''));
    return;
  }
  var rel = armcomJourneyRelativeFromPathname(window.location.pathname);
  if (rel) {
    setArmcomFrameSrcIfNeeded('demos/armcom/' + rel.replace(/^\//, ''));
    return;
  }
  if (/armcom-demo\.html$/i.test(window.location.pathname)) {
    setArmcomFrameSrcIfNeeded('demos/armcom/index.html?v=20260720d');
  }
}

var armcomLab = null;
var armcomLabBootStarted = false;

function bootArmcomDemoLab(reason, force) {
  if (!force && armcomLabBootStarted && armcomLab) return;
  if (typeof window.initArmcomLab !== 'function') return;
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootArmcomDemoLab('env-bar-change:init');
        }
      });
    }
    return;
  }
  armcomLabBootStarted = true;
  try {
    armcomLab = window.initArmcomLab({
      iframeIds: ['armcomSiteFrame'],
      force: !!force,
      onProfileLookupComplete: function (detail) {
        scheduleArmcomDrawerRefresh();
      },
    });
  } catch (_err) {
    armcomLabBootStarted = false;
  }
}

function whenEnvBarReady(run) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(run).catch(function () {
      run();
    });
  } else {
    run();
  }
}

whenEnvBarReady(function () {
  bootArmcomDemoLab('envBar.ready');
  syncArmcomDecisioningStateToIframe();
});

window.addEventListener('pageshow', function (ev) {
  if (!ev || !ev.persisted) return;
  armcomLabBootStarted = false;
  armcomLab = null;
  whenEnvBarReady(function () {
    bootArmcomDemoLab('pageshow:bfcache', true);
    syncIframeToJourneyUrl();
    syncArmcomDecisioningStateToIframe();
  });
});

window.addEventListener('env-bar-change', function (ev) {
  var detail = ev && ev.detail ? ev.detail : {};
  if (detail.type === 'init') bootArmcomDemoLab('env-bar-change:init');
});

document.addEventListener('change', function (ev) {
  if (!ev || !ev.target || ev.target.id !== 'siteCloneDecisioningEnabledToggle') return;
  syncArmcomDecisioningStateToIframe();
});

function setArmcomMessage(text, type) {
  if (armcomLab && typeof armcomLab.setMessage === 'function') {
    armcomLab.setMessage(text, type);
  }
}

function getSelectedGeneratorTarget() {
  return armcomLab && typeof armcomLab.getSelectedGeneratorTarget === 'function'
    ? armcomLab.getSelectedGeneratorTarget()
    : null;
}

function normaliseEcidDigits(raw) {
  var v = String(raw || '').trim();
  if (!v || v === '-' || v === '\u2014') return '';
  return /^\d+$/.test(v) && v.length >= 10 ? v : '';
}

function getArmcomDrawerRefreshIdentity() {
  var customerEmail = document.getElementById('customerEmail');
  var email = customerEmail ? String(customerEmail.value || '').trim() : '';
  if (email) return { id: email, ns: 'email' };
  var ecidEl = document.getElementById('infoEcid');
  var ecid = normaliseEcidDigits(ecidEl ? ecidEl.textContent : '');
  if (ecid) return { id: ecid, ns: 'ecid' };
  return null;
}

function scheduleArmcomDrawerRefresh() {
  if (typeof DemoProfileDrawer === 'undefined') return;
  if (typeof DemoProfileDrawer.refreshDrawerEventsForLoadedProfile === 'function') {
    void DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
    window.setTimeout(function () {
      void DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
    }, 2500);
    window.setTimeout(function () {
      void DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
    }, 8000);
    return;
  }
  var identity = getArmcomDrawerRefreshIdentity();
  if (!identity || typeof DemoProfileDrawer.refreshDrawerEventsForIdentity !== 'function') return;
  void DemoProfileDrawer.refreshDrawerEventsForIdentity(identity.id, identity.ns);
  window.setTimeout(function () {
    void DemoProfileDrawer.refreshDrawerEventsForIdentity(identity.id, identity.ns);
  }, 2500);
  window.setTimeout(function () {
    void DemoProfileDrawer.refreshDrawerEventsForIdentity(identity.id, identity.ns);
  }, 8000);
}

function postArmcomBannerMessage(type, payload) {
  if (!armcomSiteFrame || !armcomSiteFrame.contentWindow) return;
  armcomSiteFrame.contentWindow.postMessage(
    {
      source: 'armcom-demo-shell',
      type: type,
      payload: payload || {},
    },
    '*',
  );
}

function isArmcomDecisioningEnabled() {
  var toggle = document.getElementById('siteCloneDecisioningEnabledToggle');
  return !!(toggle && toggle.checked);
}

function syncArmcomDecisioningStateToIframe() {
  var enabled = isArmcomDecisioningEnabled();
  postArmcomBannerMessage('armcom-decisioning-state', { enabled: enabled });
  if (enabled) {
    triggerArmcomDecisioningRefresh();
  }
}

function wireArmcomFakeDecisioningSync() {
  window.addEventListener('site-clone-fake-decisioning-sync', function (ev) {
    var detail = ev && ev.detail ? ev.detail : {};
    if (detail.prefix && detail.prefix !== 'armcom') return;
    syncArmcomDecisioningStateToIframe();
  });
}

function wireArmcomIframeDecisioningSync() {
  if (!armcomSiteFrame || armcomSiteFrame.getAttribute('data-armcom-decisioning-sync-wired') === '1') return;
  armcomSiteFrame.setAttribute('data-armcom-decisioning-sync-wired', '1');
  armcomSiteFrame.addEventListener('load', function () {
    syncArmcomDecisioningStateToIframe();
    onLinkedInAdReturnIframeReady();
    syncArmcomFakeAudiencesFromIframe();
  });
}

function syncArmcomFakeAudiencesFromIframe() {
  if (!armcomSiteFrame || !window.ArmcomFakeAudiences) return;
  var src = String(armcomSiteFrame.src || '');
  var marker = 'demos/armcom/';
  var idx = src.indexOf(marker);
  if (idx === -1) return;
  var rel = src.slice(idx + marker.length).split('?')[0].split('#')[0];
  var pageId = rel.replace(/\.html$/i, '');
  if (!pageId || pageId === 'index') pageId = 'home';
  else if (pageId.indexOf('/') !== -1) {
    var parts = pageId.split('/');
    pageId = parts[parts.length - 1].replace(/\.html$/i, '');
  }
  if (typeof window.ArmcomFakeAudiences.onPageView === 'function') {
    window.ArmcomFakeAudiences.onPageView(pageId);
  }
}

function applyArmcomJourneySlide(slideIndex) {
  var idx = Number(slideIndex);
  if (isNaN(idx)) return;
  if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.onJourneySlide === 'function') {
    window.ArmcomFakeAudiences.onJourneySlide(idx);
  }
}

function restoreArmcomJourneySlideFromStorage() {
  if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.restoreJourneySlide === 'function') {
    window.ArmcomFakeAudiences.restoreJourneySlide();
    return;
  }
  try {
    var stored = parseInt(sessionStorage.getItem('armcomJourneySlideIndex'), 10);
    if (!isNaN(stored)) applyArmcomJourneySlide(stored);
  } catch (_e) {
    /* noop */
  }
}

function wireArmcomJourneySlideSync() {
  restoreArmcomJourneySlideFromStorage();
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'armcomJourneySlideIndex' || ev.newValue == null) return;
    applyArmcomJourneySlide(ev.newValue);
  });
}

wireArmcomJourneySlideSync();
wireArmcomFakeDecisioningSync();
wireArmcomIframeDecisioningSync();

function triggerArmcomDecisioningRefresh(payload) {
  if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.onDecisioningRefresh === 'function') {
    window.ArmcomFakeAudiences.onDecisioningRefresh(payload || {});
  }
  if (!isArmcomDecisioningEnabled()) return;
  postArmcomBannerMessage('armcom-banner-refresh', payload || { contentTriggered: true });
}

async function sendArmcomExperienceEvent(payload) {
  var p = payload && typeof payload === 'object' ? payload : {};
  var ecidEl = document.getElementById('infoEcid');
  var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
  var ecid =
    ecidText && ecidText !== '-' && ecidText !== '\u2014' && /^\d+$/.test(ecidText) && ecidText.length >= 10
      ? ecidText
      : null;
  var customerEmail = document.getElementById('customerEmail');
  var emailForEvent = customerEmail ? String(customerEmail.value || '').trim() : '';
  var target = getSelectedGeneratorTarget();
  var body = {
    targetId: target ? target.id : undefined,
    eventType: String(p.eventType || 'armcom.page.view').trim(),
    viewName: String(p.displayLabel || p.viewName || 'Arm lab').trim(),
    displayLabel: String(p.displayLabel || p.viewName || '').trim() || undefined,
    pageName: p.public && p.public.pageName ? String(p.public.pageName) : undefined,
    pageTitle: p.public && p.public.pageTitle ? String(p.public.pageTitle) : undefined,
    viewUrl: String(p.viewUrl || '').trim() || window.location.href.split('?')[0],
    channel: String(p.channel || 'Web'),
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: ARMCOM_XDM_TENANT_KEY,
    identityMapEcidKey: 'ECID',
  };
  if (p.tenant && typeof p.tenant === 'object') body.tenant = p.tenant;
  if (emailForEvent) body.email = emailForEvent;
  if (ecid) body.ecid = ecid;
  var postBody =
    typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody
      ? window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
      : body;
  try {
    var res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      setArmcomMessage(data.error || data.message || 'Request failed.', 'error');
      return false;
    }
    var idPart = data.requestId ? ' Request ID: ' + data.requestId : data.eventId ? ' Event ID: ' + data.eventId : '';
    setArmcomMessage((data.message || 'Arm event sent to AEP.') + idPart, 'success');
    scheduleArmcomDrawerRefresh();
    return true;
  } catch (err) {
    setArmcomMessage(err.message || 'Network error', 'error');
    return false;
  }
}

function isArmcomDecisioningSignal(payload) {
  var p = payload && typeof payload === 'object' ? payload : {};
  var eventType = String(p.eventType || '');
  return (
    eventType === 'armcom.content.clicked' ||
    eventType === 'armcom.content.interest' ||
    eventType === 'armcom.product.view' ||
    eventType === 'armcom.paidSocial.clicked'
  );
}

window.addEventListener('message', function (ev) {
  if (ev.data && ev.data.source === 'armcom-journey' && ev.data.type === 'armcom-journey-slide') {
    applyArmcomJourneySlide(ev.data.slideIndex);
    return;
  }
  if (!armcomSiteFrame || !armcomSiteFrame.contentWindow || ev.source !== armcomSiteFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'armcom-lab') return;
  if (ev.data.type === 'armcom-experience-event') {
    if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.onExperienceEvent === 'function') {
      window.ArmcomFakeAudiences.onExperienceEvent(ev.data.payload);
    }
    void sendArmcomExperienceEvent(ev.data.payload).then(function (ok) {
      if (ok && isArmcomDecisioningSignal(ev.data.payload)) triggerArmcomDecisioningRefresh();
    });
    return;
  }
  if (ev.data.type === 'armcom-audience-activated') {
    if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.onLinkedInActivation === 'function') {
      window.ArmcomFakeAudiences.onLinkedInActivation();
    }
    return;
  }
  if (ev.data.type === 'armcom-decisioning-refresh' || ev.data.type === 'armcom-lead-capture') {
    if (ev.data.type === 'armcom-decisioning-refresh') {
      syncArmcomDecisioningStateToIframe();
      return;
    }
    if (ev.data.type === 'armcom-lead-capture') {
      var lead = ev.data.payload && typeof ev.data.payload === 'object' ? ev.data.payload : {};
      if (window.ArmcomFakeAudiences && typeof window.ArmcomFakeAudiences.onLeadCapture === 'function') {
        window.ArmcomFakeAudiences.onLeadCapture(lead.source === 'agi-cpu-brief' ? 'agi-brief' : 'lead-capture');
      }
      return;
    }
    triggerArmcomDecisioningRefresh({ contentTriggered: true });
  }
});

function stripArmcomLaunchReloadParam() {
  try {
    var u = new URL(window.location.href);
    if (!u.searchParams.has('armcomLaunchReload')) return;
    u.searchParams.delete('armcomLaunchReload');
    var qs = u.searchParams.toString();
    var href = u.pathname + (qs ? '?' + qs : '') + u.hash;
    window.history.replaceState(window.history.state, '', href);
  } catch (_e) {
    /* noop */
  }
}

window.addEventListener('popstate', syncIframeToJourneyUrl);
syncIframeToJourneyUrl();
stripArmcomLaunchReloadParam();

(function wireArmcomLaunchReloadCleanup() {
  window.addEventListener('aep-demo-tags-injected', stripArmcomLaunchReloadParam);
})();

(function initArmcomDemoFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('armcom-demo-page')) return;
  var sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;
  var mq = window.matchMedia('(max-width: 768px)');
  var hideTimer = null;
  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
  function setFlyoutOpen(open) {
    body.classList.toggle('armcom-demo-page--nav-open', open);
  }
  function scheduleClose() {
    clearHideTimer();
    hideTimer = setTimeout(function () {
      setFlyoutOpen(false);
    }, 450);
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
  document.addEventListener(
    'mousemove',
    function (e) {
      if (mq.matches) return;
      if (e.clientX <= 24) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      var r = sidebar.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      if (body.classList.contains('armcom-demo-page--nav-open')) scheduleClose();
    },
    { passive: true },
  );
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('armcom-demo-page--nav-open');
  });
  setFlyoutOpen(false);
})();
