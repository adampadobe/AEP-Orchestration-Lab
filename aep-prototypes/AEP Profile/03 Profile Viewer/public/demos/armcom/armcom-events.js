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
    'agi-cpu-brief': {
      viewName: 'AGI CPU Technical Brief',
      topic: 'cloud-ai',
      siteId: 'arm.com',
      intent: 'convert',
      contentType: 'technical-brief',
      contentId: 'agi-cpu-technical-brief',
      productName: 'Arm AGI CPU',
      productCategory: 'Cloud compute',
      productId: 'agi-cpu',
    },
    newsroom: {
      viewName: 'Arm Newsroom',
      topic: 'cloud-ai',
      siteId: 'arm.com',
      intent: 'engage',
      contentType: 'press-release',
      contentId: 'agi-cpu-launch',
    },
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
    'email-nurture': {
      viewName: 'Marketo email nurture mock',
      topic: 'cloud-ai',
      siteId: 'arm.com',
      intent: 'engage',
      contentType: 'email',
      contentId: 'agi-cpu-nurture',
      productName: 'Arm AGI CPU',
      productCategory: 'Cloud compute',
      productId: 'agi-cpu',
    },
  };

  function pageId() {
    return (document.body && document.body.getAttribute('data-armcom-page-id')) || 'home';
  }

  function meta() {
    return PAGE_META[pageId()] || PAGE_META.home;
  }

  function assetPrefix() {
    var path = String(location.pathname || '');
    var marker = '/demos/armcom/';
    var idx = path.indexOf(marker);
    if (idx === -1) return '';
    var rest = path.slice(idx + marker.length);
    var depth = (rest.match(/\//g) || []).length;
    return depth ? '../'.repeat(depth) : '';
  }

  function linkedInMockHref() {
    return assetPrefix() + '../../social/linkedin.html?from=activation';
  }

  function emailNurtureHref() {
    return assetPrefix() + 'resources/email-nurture.html';
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

  function requestDecisioningRefresh(opts) {
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.isEnabled === 'function') {
      if (!window.ArmcomPersonalizedBanner.isEnabled()) {
        postToParent('armcom-decisioning-refresh', opts || {});
        return;
      }
    }
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.refresh === 'function') {
      window.ArmcomPersonalizedBanner.refresh(Object.assign({ contentTriggered: true }, opts || {}));
      return;
    }
    postToParent('armcom-decisioning-refresh', opts || {});
  }

  function notifyLeadCapture(email, company, source, extra) {
    var payload = Object.assign({ email: email, company: company, source: source }, extra || {});
    if (window.ArmcomPersonalizedBanner && typeof window.ArmcomPersonalizedBanner.onLeadCapture === 'function') {
      window.ArmcomPersonalizedBanner.onLeadCapture(payload);
    }
    postToParent('armcom-lead-capture', payload);
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

  function sendPaidSocialClicked(extra) {
    var m = meta();
    postToParent('armcom-experience-event', {
      eventType: 'armcom.paidSocial.clicked',
      viewName: 'LinkedIn sponsored ad',
      viewUrl: window.location.href.split('?')[0],
      channel: 'Paid Social',
      public: Object.assign(
        {
          platform: 'linkedin',
          adName: 'AGI CPU Technical Brief',
          topic: 'cloud-ai',
          siteId: m.siteId,
          cloudAiContent: true,
          intentLevel: 'high',
        },
        extra || {},
      ),
      tenant: {
        b2bContent: {
          topic: 'cloud-ai',
          siteId: m.siteId,
          intentLevel: 'high',
          contentType: 'technical-brief',
          contentId: 'agi-cpu-technical-brief',
          productName: 'Arm AGI CPU',
          leadSource: 'linkedin-paid-social',
        },
      },
    });
    requestDecisioningRefresh({ paidSocialReturn: true, forceVariant: 'brand-awareness' });
  }

  function sendEmailEngagement(action, extra) {
    var m = meta();
    var eventType = action === 'click' ? 'armcom.email.clicked' : 'armcom.email.open';
    postToParent('armcom-experience-event', {
      eventType: eventType,
      viewName: m.viewName,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Email',
      public: Object.assign(
        {
          topic: m.topic,
          siteId: m.siteId,
          cloudAiContent: true,
          intentLevel: m.intent || 'engage',
          contentType: m.contentType || 'email',
          contentId: m.contentId || 'agi-cpu-nurture',
          productName: m.productName || 'Arm AGI CPU',
          emailAction: action,
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
      '<strong>Audience activated</strong><br>Cloud AI ICP segment synced to LinkedIn Matched Audiences.' +
      '<div class="armcom-toast-logos"><span>LinkedIn Matched Audiences</span></div>' +
      '<div class="armcom-toast-actions">' +
      '<a class="armcom-toast-link" href="' +
      linkedInMockHref() +
      '" target="_top">View on LinkedIn →</a>' +
      '<a class="armcom-toast-link armcom-toast-link--secondary" href="' +
      emailNurtureHref() +
      '" target="_top">Email nurture (demo) →</a>' +
      '</div>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 8000);
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

  function handleAgiBriefForm(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstName = String(form.firstname && form.firstname.value ? form.firstname.value : '').trim();
      var lastName = String(form.lastname && form.lastname.value ? form.lastname.value : '').trim();
      var email = String(form.email && form.email.value ? form.email.value : '').trim();
      var company = String(form.company && form.company.value ? form.company.value : '').trim();
      if (!email || !firstName || !lastName) return;

      notifyLeadCapture(email, company, 'agi-cpu-brief', {
        firstName: firstName,
        lastName: lastName,
      });

      postToParent('armcom-experience-event', {
        eventType: 'armcom.lead.capture',
        viewName: 'AGI CPU Technical Brief download',
        viewUrl: window.location.href.split('?')[0],
        channel: 'Web',
        public: {
          topic: 'cloud-ai',
          siteId: 'arm.com',
          company: company,
          firstName: firstName,
          lastName: lastName,
          source: 'agi-cpu-brief',
          cloudAiContent: true,
          intentLevel: 'convert',
          contentType: 'technical-brief',
          contentId: 'agi-cpu-technical-brief',
          productName: 'Arm AGI CPU',
        },
        tenant: {
          b2bContent: {
            topic: 'cloud-ai',
            siteId: 'arm.com',
            intentLevel: 'convert',
            leadSource: 'agi-cpu-brief',
            contentType: 'technical-brief',
            contentId: 'agi-cpu-technical-brief',
            productName: 'Arm AGI CPU',
            productCategory: 'Cloud compute',
            productId: 'agi-cpu',
          },
        },
      });

      showActivationToast();

      var success = document.getElementById('armcomAgiBriefSuccess');
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

  function initLinkedInAdReturnVisit() {
    var params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (_e) {
      return;
    }
    if (params.get('from') !== 'linkedin-ad') return;
    sendPaidSocialClicked({ returnVisit: true });
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
    if (id === 'newsroom') {
      sendContentInterest('Press release — Arm unveils AGI CPU', {
        contentType: 'press-release',
        contentId: 'agi-cpu-launch',
      });
    }
    if (id === 'data-center-ai') {
      sendContentInterest('AGI CPU vs Nvidia/Intel benchmark comparison', {
        contentType: 'benchmark-comparison',
        contentId: 'agi-cpu-vs-nvidia-intel',
        productName: 'Arm AGI CPU',
        comparisonView: 'data-center-ai',
      });
    }
    initLinkedInAdReturnVisit();
  }

  function initEmailNurtureMock() {
    if (pageId() !== 'email-nurture') return;
    var row = document.getElementById('armcomEmailRow');
    var message = document.getElementById('armcomEmailMessage');
    var openBtn = document.getElementById('armcomEmailOpenBtn');
    var opened = false;

    function openEmail() {
      if (opened) return;
      opened = true;
      if (row) {
        row.classList.remove('armcom-email-row--unread');
        row.setAttribute('aria-expanded', 'true');
      }
      if (message) message.hidden = false;
      sendEmailEngagement('open', {
        subject: 'Aisha — your AGI CPU efficiency benchmarks',
        persona: 'Aisha Reyes',
      });
    }

    if (row) {
      row.addEventListener('click', openEmail);
    }
    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openEmail();
      });
    }
    document.querySelectorAll('.armcom-email-cta').forEach(function (el) {
      el.addEventListener('click', function () {
        sendEmailEngagement('click', {
          label: el.getAttribute('data-armcom-track') || 'email-cta',
          href: el.getAttribute('href') || '',
        });
      });
    });
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

    var briefForm = document.getElementById('armcomAgiBriefForm');
    if (briefForm) handleAgiBriefForm(briefForm);

    initEmailNurtureMock();

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
    sendPaidSocialClicked: sendPaidSocialClicked,
    sendEmailEngagement: sendEmailEngagement,
    showActivationToast: showActivationToast,
    requestDecisioningRefresh: requestDecisioningRefresh,
  };
})();
