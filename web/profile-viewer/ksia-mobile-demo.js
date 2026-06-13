/**
 * KSIA mobile demo — env bar outside simulator, postMessage bridge, flyout nav.
 */
var ksiaMobileFrame = document.getElementById('ksiaMobileFrame');
var KSIA_XDM_TENANT_KEY = '_demoemea';

var ksiaLab = null;
var ksiaLabBootStarted = false;

function bootKsiaMobileLab() {
  if (ksiaLabBootStarted && ksiaLab) return;
  if (typeof window.initKsiaLab !== 'function') return;
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootKsiaMobileLab();
        }
      });
    }
    return;
  }
  ksiaLabBootStarted = true;
  ksiaLab = window.initKsiaLab({ iframeIds: ['ksiaMobileFrame'] });
}

function whenEnvBarReady(run) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(run).catch(function (err) {
      console.warn('[ksia-mobile-demo] envBar.ready failed', err);
      run();
    });
  } else {
    run();
  }
}

whenEnvBarReady(bootKsiaMobileLab);

function setKsiaMessage(text, type) {
  if (ksiaLab && typeof ksiaLab.setMessage === 'function') {
    ksiaLab.setMessage(text, type);
  }
}

function getSelectedGeneratorTarget() {
  return ksiaLab && typeof ksiaLab.getSelectedGeneratorTarget === 'function'
    ? ksiaLab.getSelectedGeneratorTarget()
    : null;
}

async function sendKsiaMobileExperienceEvent(payload) {
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
    eventType: String(p.eventType || 'ksia.mobile.page.view').trim(),
    viewName: String(p.viewName || 'KSIA mobile lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || window.location.href.split('?')[0],
    channel: String(p.channel || 'Mobile App'),
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: KSIA_XDM_TENANT_KEY,
    identityMapEcidKey: 'ECID',
  };
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
      setKsiaMessage(data.error || data.message || 'Request failed.', 'error');
      return false;
    }
    var idPart = data.requestId ? ' Request ID: ' + data.requestId : data.eventId ? ' Event ID: ' + data.eventId : '';
    setKsiaMessage((data.message || 'KSIA mobile event sent to AEP.') + idPart, 'success');
    if (ecid && typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.refreshDrawerEventsForIdentity) {
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
    }
    return true;
  } catch (err) {
    setKsiaMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', function (ev) {
  if (!ksiaMobileFrame || !ksiaMobileFrame.contentWindow || ev.source !== ksiaMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'ksia-mobile-lab') return;
  if (ev.data.type === 'ksia-experience-event') {
    void sendKsiaMobileExperienceEvent(ev.data.payload);
  }
});

/* Notify iframe when SDK injected (placeholder bridge) */
if (window.envBar && typeof window.envBar.onChange === 'function') {
  window.envBar.onChange(function (detail) {
    if (detail && detail.type === 'tags-injected' && ksiaMobileFrame && ksiaMobileFrame.contentWindow) {
      try {
        ksiaMobileFrame.contentWindow.postMessage({ source: 'ksia-mobile-lab-parent', type: 'sdk-injected' }, '*');
      } catch (_) {
        /* ignore */
      }
    }
  });
}

(function initKsiaMobileShell() {
  if (typeof MobileDemoConfigs === 'undefined' || typeof MobileDemoShell === 'undefined') return;
  var config = window.mobileDemoConfig || MobileDemoConfigs.getPageConfig('ksia');
  MobileDemoShell.init({ config: config, storageKeyPrefix: 'ksiaMobile' });
})();

(function initKsiaMobileFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('ksia-mobile-demo-page')) return;
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
    body.classList.toggle('ksia-mobile-demo-page--nav-open', open);
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
      if (body.classList.contains('ksia-mobile-demo-page--nav-open')) scheduleClose();
    },
    { passive: true },
  );
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('ksia-mobile-demo-page--nav-open');
  });
  setFlyoutOpen(false);
})();
