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

function syncIframeToJourneyUrl() {
  if (!armcomSiteFrame) return;
  var rel = armcomJourneyRelativeFromPathname(window.location.pathname);
  if (rel) {
    armcomSiteFrame.src = 'demos/armcom/' + rel.replace(/^\//, '');
    return;
  }
  if (/armcom-demo\.html$/i.test(window.location.pathname)) {
    armcomSiteFrame.src = 'demos/armcom/index.html?v=20260714e';
  }
}

var armcomLab = null;
var armcomLabBootStarted = false;

function bootArmcomDemoLab() {
  if (armcomLabBootStarted && armcomLab) return;
  if (typeof window.initArmcomLab !== 'function') return;
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootArmcomDemoLab();
        }
      });
    }
    return;
  }
  armcomLabBootStarted = true;
  armcomLab = window.initArmcomLab({ iframeIds: ['armcomSiteFrame'] });
}

function whenEnvBarReady(run) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(run).catch(function (err) {
      console.warn('[armcom-demo] envBar.ready failed', err);
      run();
    });
  } else {
    run();
  }
}

whenEnvBarReady(bootArmcomDemoLab);

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

function triggerArmcomDecisioningRefresh() {
  if (
    window.DecisioningProfileRuntime &&
    typeof window.DecisioningProfileRuntime.runContentDecision === 'function'
  ) {
    void window.DecisioningProfileRuntime.runContentDecision().catch(function (err) {
      console.warn('[armcom-demo] decisioning refresh failed', err && err.message ? err.message : err);
    });
  } else if (
    window.SiteCloneDecisioningBoot &&
    typeof window.SiteCloneDecisioningBoot.syncFromProfileLookup === 'function'
  ) {
    void window.SiteCloneDecisioningBoot.syncFromProfileLookup();
  }
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
    viewName: String(p.viewName || 'Arm lab').trim(),
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
    eventType === 'armcom.product.view'
  );
}

window.addEventListener('message', function (ev) {
  if (!armcomSiteFrame || !armcomSiteFrame.contentWindow || ev.source !== armcomSiteFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'armcom-lab') return;
  if (ev.data.type === 'armcom-experience-event') {
    void sendArmcomExperienceEvent(ev.data.payload).then(function (ok) {
      if (ok && isArmcomDecisioningSignal(ev.data.payload)) triggerArmcomDecisioningRefresh();
    });
    return;
  }
  if (ev.data.type === 'armcom-decisioning-refresh') {
    triggerArmcomDecisioningRefresh();
  }
});

window.addEventListener('popstate', syncIframeToJourneyUrl);
syncIframeToJourneyUrl();

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
