/**
 * Starbucks mobile demo — env bar outside simulator, postMessage bridge, flyout nav.
 */
var starbucksMobileFrame = document.getElementById('starbucksMobileFrame');
var Starbucks_XDM_TENANT_KEY = '_demoemea';

var starbucksLab = null;
var starbucksLabBootStarted = false;

function bootStarbucksMobileLab() {
  if (starbucksLabBootStarted && starbucksLab) return;
  if (typeof window.initStarbucksLab !== 'function') return;
  if (typeof window.DemoTagsInjection === 'undefined') {
    if (window.envBar && typeof window.envBar.onChange === 'function') {
      window.envBar.onChange(function (detail) {
        if (detail && detail.type === 'init' && typeof window.DemoTagsInjection !== 'undefined') {
          bootStarbucksMobileLab();
        }
      });
    }
    return;
  }
  starbucksLabBootStarted = true;
  starbucksLab = window.initStarbucksLab({ iframeIds: ['starbucksMobileFrame'] });
}

function whenEnvBarReady(run) {
  if (window.envBar && typeof window.envBar.ready === 'function') {
    window.envBar.ready().then(run).catch(function (err) {
      console.warn('[starbucks-mobile-demo] envBar.ready failed', err);
      run();
    });
  } else {
    run();
  }
}

whenEnvBarReady(bootStarbucksMobileLab);

function initStarbucksMobileBcAdapter() {
  if (window.MobileBcBoot && typeof window.MobileBcBoot.init === 'function') {
    window.MobileBcBoot.init();
  }
  if (window.MobileBcBoot && typeof window.MobileBcBoot.sync === 'function') {
    void window.MobileBcBoot.sync();
  }
}

whenEnvBarReady(initStarbucksMobileBcAdapter);

function setStarbucksMessage(text, type) {
  if (starbucksLab && typeof starbucksLab.setMessage === 'function') {
    starbucksLab.setMessage(text, type);
  }
}

function getSelectedGeneratorTarget() {
  return starbucksLab && typeof starbucksLab.getSelectedGeneratorTarget === 'function'
    ? starbucksLab.getSelectedGeneratorTarget()
    : null;
}

async function sendStarbucksMobileExperienceEvent(payload) {
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
    eventType: String(p.eventType || 'starbucks.mobile.page.view').trim(),
    viewName: String(p.viewName || 'Starbucks mobile lab').trim(),
    viewUrl: String(p.viewUrl || '').trim() || window.location.href.split('?')[0],
    channel: String(p.channel || 'Mobile App'),
    public: p.public && typeof p.public === 'object' ? p.public : {},
    xdmTenantKey: Starbucks_XDM_TENANT_KEY,
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
      setStarbucksMessage(data.error || data.message || 'Request failed.', 'error');
      return false;
    }
    var idPart = data.requestId ? ' Request ID: ' + data.requestId : data.eventId ? ' Event ID: ' + data.eventId : '';
    setStarbucksMessage((data.message || 'Starbucks mobile event sent to AEP.') + idPart, 'success');
    if (ecid && typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.refreshDrawerEventsForIdentity) {
      void DemoProfileDrawer.refreshDrawerEventsForIdentity(ecid, 'ecid');
    }
    return true;
  } catch (err) {
    setStarbucksMessage(err.message || 'Network error', 'error');
    return false;
  }
}

window.addEventListener('message', function (ev) {
  if (!starbucksMobileFrame || !starbucksMobileFrame.contentWindow || ev.source !== starbucksMobileFrame.contentWindow) return;
  if (!ev.data || ev.data.source !== 'starbucks-mobile-lab') return;
  if (ev.data.type === 'starbucks-experience-event') {
    void sendStarbucksMobileExperienceEvent(ev.data.payload);
    return;
  }
  if (ev.data.type === 'bc-set-display-mode' && window.SiteCloneBcEnv && typeof window.SiteCloneBcEnv.setDisplayMode === 'function') {
    window.SiteCloneBcEnv.setDisplayMode(ev.data.mode, { sync: true });
    if (window.MobileBcBoot && typeof window.MobileBcBoot.sync === 'function') {
      void window.MobileBcBoot.sync();
    }
  }
});

/* Notify iframe when SDK injected; trigger mobile BC sync */
if (window.envBar && typeof window.envBar.onChange === 'function') {
  window.envBar.onChange(function (detail) {
    if (detail && detail.type === 'tags-injected' && starbucksMobileFrame && starbucksMobileFrame.contentWindow) {
      try {
        starbucksMobileFrame.contentWindow.postMessage({ source: 'starbucks-mobile-lab-parent', type: 'sdk-injected' }, '*');
      } catch (_) {
        /* ignore */
      }
      if (window.MobileBcBoot && typeof window.MobileBcBoot.sync === 'function') {
        void window.MobileBcBoot.sync();
      }
    }
  });
}

(function initStarbucksMobileShell() {
  if (typeof MobileDemoConfigs === 'undefined' || typeof MobileDemoShell === 'undefined') return;
  var config = window.mobileDemoConfig || MobileDemoConfigs.getPageConfig('starbucks');
  MobileDemoShell.init({ config: config, storageKeyPrefix: 'starbucksMobile' });
})();

(function initStarbucksMobileFlyoutSidebar() {
  var body = document.body;
  if (!body.classList.contains('starbucks-mobile-demo-page')) return;
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
