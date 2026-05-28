/**
 * Sky LLM Optimizer — lab chrome (flyout nav, profile lookup) around frozen overview snapshot iframe.
 */
(function () {
  'use strict';

  function initLabFlyoutSidebar() {
    var body = document.body;
    if (!body.classList.contains('sky-llm-optimizer-page')) return;
    var sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return;

    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function setFlyoutOpen(open) {
      body.classList.toggle('mod-demo-page--nav-open', open);
    }

    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setFlyoutOpen(false);
      }, 450);
    }

    function onPointerMove(e) {
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
      if (body.classList.contains('mod-demo-page--nav-open')) scheduleClose();
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
      if (mq.matches) body.classList.remove('mod-demo-page--nav-open');
    });
    setFlyoutOpen(false);
  }

  function patchIframeWhenReady() {
    var frame = document.getElementById('skyLlmOptimizerFrame');
    if (!frame) return;
    frame.addEventListener('load', function () {
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
        var site = 'sky.com';
        doc.querySelectorAll('input').forEach(function (input) {
          if (/wknd/i.test(input.value || '')) input.value = site;
        });
      } catch (e) {
        /* same-origin only */
      }
    });
  }

  function initProfileLookup() {
    var customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'skyLlmNs');

    var skyLlmMessage = document.getElementById('skyLlmMessage');
    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var generatorTargets = [];

    function getEmail() {
      return customerEmail ? String(customerEmail.value || '').trim() : '';
    }

    function setMessage(text, type) {
      if (!skyLlmMessage) return;
      skyLlmMessage.textContent = text || '';
      skyLlmMessage.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      skyLlmMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    if (typeof DemoProfileDrawer !== 'undefined') {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'mod-demo-page--profile-open',
        viewName: 'Sky LLM Optimizer',
        emailGetter: getEmail,
        messageSetter: setMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var email = getEmail();
        if (!email) {
          setMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setMessage('Looking up profile…', '');
        await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
      });
    }

    if (generatorTargetSelect && window.AepDemoGeneratorTargets) {
      void window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {}).then(
        function (t) {
          generatorTargets = t || [];
        },
      );
    }

    if (typeof AepDemoEnvStrip !== 'undefined' && AepDemoEnvStrip.initStandardEnvBar) {
      AepDemoEnvStrip.initStandardEnvBar({});
    }
  }

  initLabFlyoutSidebar();
  patchIframeWhenReady();
  initProfileLookup();
})();
