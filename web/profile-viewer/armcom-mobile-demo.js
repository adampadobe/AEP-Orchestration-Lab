/**
 * Arm mobile demo — env bar outside simulator, postMessage bridge, flyout nav.
 */
var armcomMobileFrame = document.getElementById('armcomMobileFrame');
var ARMCOM_XDM_TENANT_KEY = '_demoemea';

var armcomLab = null;
var armcomLabBootStarted = false;

function bootArmcomMobileLab(reason) {
  if (armcomLabBootStarted && armcomLab) return;
  if (typeof window.initArmcomLab !== 'function') {
    console.warn('[armcom-lab] mobile lab boot deferred — initArmcomLab not available', { reason: reason || 'unknown' });
    return;
  }
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootArmcomMobileLab('env-bar-change:init');
        }
      });
    }
    console.warn('[armcom-lab] mobile lab boot deferred — DemoTagsInjection not available', { reason: reason || 'unknown' });
    return;
  }
  armcomLabBootStarted = true;
  console.info('[armcom-lab] mobile lab boot start', { reason: reason || 'unknown' });
  armcomLab = window.initArmcomLab({ iframeIds: ['armcomMobileFrame'] });
  console.info('[armcom-lab] mobile lab boot success');
}

function whenEnvBarReady(run, label) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(function () {
      console.info('[aep-env-bar] mobile env bar ready', { label: label || 'boot' });
      run();
    }).catch(function (err) {
      console.warn('[armcom-lab] mobile envBar.ready failed', err);
      run();
    });
  } else {
    console.warn('[armcom-lab] mobile env bar API missing');
    run();
  }
}

whenEnvBarReady(bootArmcomMobileLab, 'initial');

document.addEventListener('DOMContentLoaded', function () {
  bootArmcomMobileLab('DOMContentLoaded');
});

window.addEventListener('env-bar-change', function (ev) {
  if (ev && ev.detail && ev.detail.type === 'init') {
    bootArmcomMobileLab('env-bar-change:init');
  }
});

function initArmcomMobileBcAdapter() {
  if (window.MobileBcBoot && typeof window.MobileBcBoot.init === 'function') {
    window.MobileBcBoot.init();
  }
  if (window.MobileBcBoot && typeof window.MobileBcBoot.sync === 'function') {
    void window.MobileBcBoot.sync();
  }
}

whenEnvBarReady(initArmcomMobileBcAdapter);

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

async function sendArmcomMobileExperienceEvent(payload) {
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
    eventType: String(p.eventType || 'armcom.mobile.page.view').trim(),
    viewName: String(p.viewName || 'Arm mobile lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || window.location.href.split('?')[0],
    channel: String(p.channel || 'Mobile App'),
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: ARMCOM_XDM_TENANT_KEY,
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
      setArmcomMessage(data.error || data.message || 'Request failed.', 'error');
      return false;
    }
    var idPart = data.requestId ? ' Request ID: ' + data.requestId : data.eventId ? ' Event ID: ' + data.eventId : '';
    setArmcomMessage((data.message || 'Arm mobile event sent to AEP.') + idPart, 'success');
    if (ecid && typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.refreshDrawerEventsForIdentity) {
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
    }
    return true;
  } catch (err) {
    setArmcomMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', function (ev) {
  if (!armcomMobileFrame || !armcomMobileFrame.contentWindow || ev.source !== armcomMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'armcom-mobile-lab') return;
  if (ev.data.type === 'armcom-experience-event') {
    void sendArmcomMobileExperienceEvent(ev.data.payload);
  }
});

function notifyArmcomMobileIframeSdkInjected() {
  if (!armcomMobileFrame || !armcomMobileFrame.contentWindow) return;
  try {
    armcomMobileFrame.contentWindow.postMessage({ source: 'armcom-mobile-lab-parent', type: 'sdk-injected' }, '*');
  } catch (_) {
    /* ignore */
  }
  if (window.MobileBcBoot && typeof window.MobileBcBoot.sync === 'function') {
    void window.MobileBcBoot.sync();
  }
}

window.addEventListener('aep-demo-tags-injected', notifyArmcomMobileIframeSdkInjected);
window.addEventListener('aep-demo-env-configured', notifyArmcomMobileIframeSdkInjected);

(function initArmcomMobileShell() {
  if (typeof MobileDemoConfigs === 'undefined' || typeof MobileDemoShell === 'undefined') return;
  var config = window.mobileDemoConfig || MobileDemoConfigs.getPageConfig('armcom');
  MobileDemoShell.init({ config: config, storageKeyPrefix: 'armcomMobile' });
})();

(function initArmcomMobileFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('armcom-mobile-demo-page')) return;
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
    body.classList.toggle('mobile-demo-shell-page--nav-open', open);
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
      if (body.classList.contains('mobile-demo-shell-page--nav-open')) scheduleClose();
    },
    { passive: true },
  );
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('mobile-demo-shell-page--nav-open');
  });
  setFlyoutOpen(false);
})();
