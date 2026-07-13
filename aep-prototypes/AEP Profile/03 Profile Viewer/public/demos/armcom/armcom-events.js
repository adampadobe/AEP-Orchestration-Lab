/**
 * Arm journey events — postMessage to lab shell + optional alloy sendEvent.
 */
(function () {
  'use strict';

  var PAGE_META = {
    home: { viewName: 'Arm home', topic: 'general', siteId: 'arm.com' },
    'cloud-ai-hub': { viewName: 'Cloud AI hub', topic: 'cloud-ai', siteId: 'arm.com' },
    'data-center-ai': { viewName: 'Data center AI', topic: 'cloud-ai', siteId: 'arm.com', intent: 'high' },
    developer: { viewName: 'Arm Developer', topic: 'cloud-ai', siteId: 'developer.arm.com' },
    subscribe: { viewName: 'Subscribe', topic: 'cloud-ai', siteId: 'arm.com' },
  };

  function pageId() {
    return (document.body && document.body.getAttribute('data-armcom-page-id')) || 'home';
  }

  function meta() {
    return PAGE_META[pageId()] || PAGE_META.home;
  }

  function postLoginRequest(email, company) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: 'armcom-lab',
            type: 'login-request',
            email: email,
            company: company,
          },
          '*',
        );
      }
    } catch (_e) {
      /* ignore */
    }
  }
  function postToParent(type, payload) {
    var msg = {
      source: 'armcom-lab',
      type: type,
      payload: payload || {},
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, '*');
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function sendPageView() {
    var m = meta();
    postToParent('armcom-experience-event', {
      eventType: 'armcom.page.view',
      viewName: m.viewName,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: {
        pageName: pageId(),
        topic: m.topic,
        siteId: m.siteId,
        cloudAiContent: m.topic === 'cloud-ai',
        intentLevel: m.intent || 'browse',
      },
    });
  }

  function sendContentClick(label, extra) {
    var m = meta();
    postToParent('armcom-experience-event', {
      eventType: 'armcom.content.clicked',
      viewName: m.viewName,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: Object.assign(
        {
          label: label,
          topic: m.topic,
          siteId: m.siteId,
          cloudAiContent: true,
        },
        extra || {},
      ),
    });
  }

  function showActivationToast() {
    var existing = document.getElementById('armcomActivationToast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'armcomActivationToast';
    toast.className = 'armcom-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<strong>Audience activated</strong><br>Cloud AI ICP segment synced to paid social destinations.' +
      '<div class="armcom-toast-logos"><span>LinkedIn Matched Audiences</span><span>·</span><span>Meta Custom Audiences</span></div>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 6000);
  }

  function handleSubscribeForm(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = String(form.email && form.email.value ? form.email.value : '').trim();
      var company = String(form.company && form.company.value ? form.company.value : '').trim();
      if (!email) return;

      postToParent('armcom-experience-event', {
        eventType: 'armcom.lead.capture',
        viewName: 'Marketo subscribe',
        viewUrl: window.location.href.split('?')[0],
        channel: 'Web',
        public: {
          topic: 'cloud-ai',
          siteId: 'arm.com',
          company: company,
          source: 'marketo-form',
          cloudAiContent: true,
          intentLevel: 'convert',
        },
      });

      postLoginRequest(email, company);

      showActivationToast();

      var success = document.getElementById('armcomSubscribeSuccess');
      if (success) {
        success.hidden = false;
        form.hidden = true;
      }
    });
  }

  function wireCtas() {
    document.querySelectorAll('[data-armcom-track]').forEach(function (el) {
      el.addEventListener('click', function () {
        sendContentClick(el.getAttribute('data-armcom-track') || 'cta', {
          href: el.getAttribute('href') || '',
        });
      });
    });
  }

  function init() {
    sendPageView();
    wireCtas();
    var form = document.getElementById('armcomSubscribeForm');
    if (form) handleSubscribeForm(form);

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== 'armcom-demo-shell') return;
      if (ev.data.type === 'login-complete' && ev.data.found) {
        showActivationToast();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ArmcomEvents = {
    sendPageView: sendPageView,
    sendContentClick: sendContentClick,
    showActivationToast: showActivationToast,
  };
})();
