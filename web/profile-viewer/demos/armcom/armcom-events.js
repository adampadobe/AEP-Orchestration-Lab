/**
 * Arm journey events — postMessage to lab shell + optional alloy sendEvent.
 */
(function () {
  'use strict';

  var PAGE_META = {
    home: { viewName: 'Arm home', topic: 'general', siteId: 'arm.com' },
    'cloud-ai-hub': { viewName: 'Cloud AI hub', topic: 'cloud-ai', siteId: 'arm.com' },
    'data-center-ai': { viewName: 'Data center AI', topic: 'cloud-ai', siteId: 'arm.com', intent: 'high' },
    developer: { viewName: 'Arm Developer', topic: 'developer', siteId: 'developer.arm.com' },
    subscribe: { viewName: 'Subscribe', topic: 'cloud-ai', siteId: 'arm.com' },
    'blog-future-computing': {
      viewName: 'The future of computing',
      topic: 'cloud-ai',
      siteId: 'arm.com',
      intent: 'engage',
      contentType: 'blog',
      contentId: 'future-of-computing',
    },
    'neoverse-n2': {
      viewName: 'Arm Neoverse N2',
      topic: 'neoverse',
      siteId: 'arm.com',
      intent: 'high',
      productName: 'Arm Neoverse N2',
      productCategory: 'Cloud compute',
      productId: 'neoverse-n2',
    },
  };

  function pageId() {
    return (document.body && document.body.getAttribute('data-armcom-page-id')) || 'home';
  }

  function meta() {
    return PAGE_META[pageId()] || PAGE_META.home;
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

  function requestDecisioningRefresh() {
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.isEnabled === 'function') {
      if (!window.ArmcomPersonalizedBanner.isEnabled()) {
        postToParent('armcom-decisioning-refresh', {});
        return;
      }
    }
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.refresh === 'function') {
      window.ArmcomPersonalizedBanner.refresh({ contentTriggered: true });
      return;
    }
    postToParent('armcom-decisioning-refresh', {});
  }

  function notifyLeadCapture(email, company, source) {
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.onLeadCapture === 'function') {
      window.ArmcomPersonalizedBanner.onLeadCapture({ email: email, company: company, source: source });
    }
    postToParent('armcom-lead-capture', { email: email, company: company, source: source });
  }

  function notifyContentInterest(topic, label) {
    if (
      window.ArmcomPersonalizedBanner &&
      typeof window.ArmcomPersonalizedBanner.isEnabled === 'function' &&
      !window.ArmcomPersonalizedBanner.isEnabled()
    ) {
      return;
    }
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.onContentInterest === 'function') {
      window.ArmcomPersonalizedBanner.onContentInterest(topic, label);
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
      tenant: buildTenantExtras(m),
    });
  }

  function buildTenantExtras(m) {
    if (!m || m.topic !== 'cloud-ai') return undefined;
    var extras = {
      b2bContent: {
        topic: m.topic,
        siteId: m.siteId,
        intentLevel: m.intent || 'browse',
      },
    };
    if (m.contentType) extras.b2bContent.contentType = m.contentType;
    if (m.contentId) extras.b2bContent.contentId = m.contentId;
    if (m.productName) extras.b2bContent.productName = m.productName;
    if (m.productCategory) extras.b2bContent.productCategory = m.productCategory;
    if (m.productId) extras.b2bContent.productId = m.productId;
    return extras;
  }

  function sendContentClick(label, extra) {
    var m = meta();
    notifyContentInterest(m.topic, label);
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
          cloudAiContent: m.topic === 'cloud-ai',
        },
        extra || {},
      ),
      tenant: buildTenantExtras(m),
    });
    if (m.topic === 'cloud-ai') requestDecisioningRefresh();
  }

  function sendContentInterest(label, extra) {
    var m = meta();
    postToParent('armcom-experience-event', {
      eventType: 'armcom.content.interest',
      viewName: m.viewName,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: Object.assign(
        {
          label: label,
          topic: m.topic,
          siteId: m.siteId,
          cloudAiContent: true,
          intentLevel: m.intent || 'engage',
        },
        extra || {},
      ),
      tenant: buildTenantExtras(m),
    });
    requestDecisioningRefresh();
  }

  function sendProductView(extra) {
    var m = meta();
    postToParent('armcom-experience-event', {
      eventType: 'armcom.product.view',
      viewName: m.viewName,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: Object.assign(
        {
          topic: m.topic,
          siteId: m.siteId,
          cloudAiContent: true,
          productName: m.productName || 'Arm Neoverse N2',
          productCategory: m.productCategory || 'Cloud compute',
          productId: m.productId || 'neoverse-n2',
          intentLevel: 'high',
        },
        extra || {},
      ),
      tenant: buildTenantExtras(m),
    });
    requestDecisioningRefresh();
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

  function handleSubscribeForm(form, options) {
    options = options || {};
    var source = options.source || 'marketo-form';
    var successId = options.successId || 'armcomSubscribeSuccess';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = String(form.email && form.email.value ? form.email.value : '').trim();
      var company = String(form.company && form.company.value ? form.company.value : '').trim();
      if (!email) return;

      notifyLeadCapture(email, company, source);

      postToParent('armcom-experience-event', {
        eventType: 'armcom.lead.capture',
        viewName: source === 'footer-inline' ? 'Footer newsletter' : 'Marketo subscribe',
        viewUrl: window.location.href.split('?')[0],
        channel: 'Web',
        public: {
          topic: 'cloud-ai',
          siteId: 'arm.com',
          company: company,
          source: source,
          cloudAiContent: true,
          intentLevel: 'convert',
        },
        tenant: {
          b2bContent: {
            topic: 'cloud-ai',
            siteId: 'arm.com',
            intentLevel: 'convert',
            leadSource: source,
          },
        },
      });

      showActivationToast();

      var success = document.getElementById(successId);
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

  function initPageSpecificEvents() {
    var id = pageId();
    if (id === 'blog-future-computing') {
      sendContentInterest('Blog article — The future of computing', {
        contentType: 'blog',
        contentId: 'future-of-computing',
        articleTopic: 'Leadership · AI industry trends',
      });
    }
    if (id === 'neoverse-n2') {
      sendProductView({
        productName: 'Arm Neoverse N2',
        productCategory: 'Cloud compute',
        productId: 'neoverse-n2',
      });
    }
  }

  function init() {
    sendPageView();
    initPageSpecificEvents();
    wireCtas();

    var subscribeForm = document.getElementById('armcomSubscribeForm');
    if (subscribeForm) handleSubscribeForm(subscribeForm, { source: 'marketo-form' });

    var footerForm = document.getElementById('armcomFooterNewsletterForm');
    if (footerForm) {
      handleSubscribeForm(footerForm, {
        source: 'footer-inline',
        successId: 'armcomFooterNewsletterSuccess',
      });
    }

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== 'armcom-demo-shell') return;
      if (ev.data.type === 'login-complete' && ev.data.found) {
        if (
          window.ArmcomPersonalizedBanner &&
          typeof window.ArmcomPersonalizedBanner.isEnabled === 'function' &&
          !window.ArmcomPersonalizedBanner.isEnabled()
        ) {
          showActivationToast();
          return;
        }
        if (
          window.ArmcomPersonalizedBanner &&
          typeof window.ArmcomPersonalizedBanner.onRegistrationComplete === 'function'
        ) {
          window.ArmcomPersonalizedBanner.onRegistrationComplete({
            email: ev.data.email,
            firstName: ev.data.firstName,
            company: ev.data.company,
          });
        }
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
    sendContentInterest: sendContentInterest,
    sendProductView: sendProductView,
    showActivationToast: showActivationToast,
    requestDecisioningRefresh: requestDecisioningRefresh,
  };
})();
