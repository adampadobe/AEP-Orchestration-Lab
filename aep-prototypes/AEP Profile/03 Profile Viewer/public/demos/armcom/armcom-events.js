/**
 * Arm journey events — postMessage to lab shell + optional alloy sendEvent.
 */
(function () {
  'use strict';

  var TOAST_STORAGE_KEY = 'armcomToastState';
  var SHELL_SOURCE = 'armcom-demo-shell';

  var PAGE_META = {
    home: { viewName: 'Home', topic: 'general', siteId: 'arm.com' },
    'cloud-ai-hub': { viewName: 'Cloud AI Hub', topic: 'cloud-ai', siteId: 'arm.com' },
    'data-center-ai': { viewName: 'Data Center AI', topic: 'cloud-ai', siteId: 'arm.com', intent: 'high' },
    developer: { viewName: 'Developer Portal', topic: 'developer', siteId: 'developer.arm.com' },
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
      viewName: 'Newsroom',
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
    'account-engagement': {
      viewName: 'Account engagement — colleagues researching',
      topic: 'cloud-ai',
      siteId: 'arm.com',
      intent: 'engage',
      contentType: 'account-insight',
      contentId: 'multi-contact-engagement',
    },
  };

  function pageId() {
    return (document.body && document.body.getAttribute('data-armcom-page-id')) || 'home';
  }

  function meta() {
    return PAGE_META[pageId()] || PAGE_META.home;
  }

  /** Human-readable drawer label: `arm.com — Cloud AI Hub`. */
  function formatDisplayLabel(m, pageTitleOverride) {
    var pageMeta = m || PAGE_META.home;
    var site = pageMeta.siteId ? String(pageMeta.siteId) : 'arm.com';
    var page = String(pageTitleOverride || pageMeta.viewName || 'Page').trim() || 'Page';
    return site + ' \u2014 ' + page;
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
    var pid = pageId();
    var displayLabel = formatDisplayLabel(m);
    postToParent('armcom-experience-event', {
      eventType: 'armcom.page.view',
      viewName: displayLabel,
      displayLabel: displayLabel,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: {
        pageName: pid,
        pageTitle: m.viewName,
        displayLabel: displayLabel,
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
    var displayLabel = formatDisplayLabel(m, label || m.viewName);
    notifyContentInterest(m.topic, label);
    postToParent('armcom-experience-event', {
      eventType: 'armcom.content.clicked',
      viewName: displayLabel,
      displayLabel: displayLabel,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: Object.assign(
        {
          label: label,
          pageTitle: label || m.viewName,
          displayLabel: displayLabel,
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
    var displayLabel = formatDisplayLabel(m, label || m.viewName);
    postToParent('armcom-experience-event', {
      eventType: 'armcom.content.interest',
      viewName: displayLabel,
      displayLabel: displayLabel,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: Object.assign(
        {
          label: label,
          pageTitle: label || m.viewName,
          displayLabel: displayLabel,
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
    var productLabel = (extra && extra.productName) || m.productName || 'Arm Neoverse N2';
    var displayLabel = formatDisplayLabel(m, productLabel);
    postToParent('armcom-experience-event', {
      eventType: 'armcom.product.view',
      viewName: displayLabel,
      displayLabel: displayLabel,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Web',
      public: Object.assign(
        {
          pageTitle: productLabel,
          displayLabel: displayLabel,
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
    var displayLabel = 'LinkedIn \u2014 AGI CPU Technical Brief ad';
    postToParent('armcom-experience-event', {
      eventType: 'armcom.paidSocial.clicked',
      viewName: displayLabel,
      displayLabel: displayLabel,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Paid Social',
      public: Object.assign(
        {
          displayLabel: displayLabel,
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
    var emailLabel = action === 'click' ? 'Email click' : 'Email open';
    var displayLabel = formatDisplayLabel(m, emailLabel);
    postToParent('armcom-experience-event', {
      eventType: eventType,
      viewName: displayLabel,
      displayLabel: displayLabel,
      viewUrl: window.location.href.split('?')[0],
      channel: 'Email',
      public: Object.assign(
        {
          displayLabel: displayLabel,
          pageTitle: emailLabel,
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

  function readToastState() {
    try {
      var raw = sessionStorage.getItem(TOAST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function writeToastState(patch) {
    var next = Object.assign({}, readToastState(), patch || {});
    try {
      sessionStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(next));
    } catch (_e) {
      /* ignore */
    }
    return next;
  }

  function getToastStack() {
    var stack = document.getElementById('armcomToastStack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'armcomToastStack';
    stack.className = 'armcom-toast-stack';
    stack.setAttribute('role', 'region');
    stack.setAttribute('aria-label', 'Demo notifications');
    document.body.appendChild(stack);
    return stack;
  }

  function dismissToast(toast) {
    if (!toast || toast.dataset.armcomDismissed === '1') return;
    toast.dataset.armcomDismissed = '1';
    toast.classList.remove('visible');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      var stack = document.getElementById('armcomToastStack');
      if (stack && !stack.childElementCount) stack.remove();
    }, 400);
  }

  function mountToast(id, className, html) {
    var existing = document.getElementById(id);
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = id;
    toast.className = 'armcom-toast' + (className ? ' ' + className : '');
    toast.setAttribute('role', 'status');
    toast.innerHTML = html;
    getToastStack().appendChild(toast);
    var dismissBtn = toast.querySelector('.armcom-toast-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        dismissToast(toast);
      });
    }
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
    return toast;
  }

  function showIdentityStitchToast() {
    if (readToastState().identityStitchShown) return;
    writeToastState({ identityStitchShown: true });
    mountToast(
      'armcomIdentityToast',
      'armcom-toast--info',
      '<button type="button" class="armcom-toast-dismiss" aria-label="Dismiss notification">×</button>' +
        '<strong>Identity resolved</strong><br>Anonymous Cloud AI browsing is now stitched to a known B2B profile across arm.com properties.',
    );
  }

  function showSegmentQualifiedToast() {
    if (readToastState().segmentQualifiedShown) return;
    writeToastState({ segmentQualifiedShown: true });
    mountToast(
      'armcomSegmentToast',
      'armcom-toast--segment',
      '<button type="button" class="armcom-toast-dismiss" aria-label="Dismiss notification">×</button>' +
        '<strong>Segment qualified</strong><br>Cloud AI Target Account — High Intent audience is ready for activation.',
    );
  }

  function showActivationToast() {
    if (readToastState().activationShown) return;
    writeToastState({ activationShown: true });
    mountToast(
      'armcomActivationToast',
      '',
      '<button type="button" class="armcom-toast-dismiss" aria-label="Dismiss notification">×</button>' +
        '<strong>Audience activated</strong><br>Cloud AI ICP segment synced to LinkedIn Matched Audiences.' +
        '<div class="armcom-toast-logos"><span>LinkedIn Matched Audiences</span></div>' +
        '<div class="armcom-toast-actions">' +
        '<a class="armcom-toast-link" href="' +
        linkedInMockHref() +
        '" target="_top">View on LinkedIn →</a>' +
        '</div>',
    );
    postToParent('armcom-audience-activated', { pageId: pageId() });
  }

  function showEmailNurtureToast() {
    if (readToastState().emailNurtureShown) return;
    writeToastState({ emailNurtureShown: true, emailNurtureUnlocked: true });
    mountToast(
      'armcomEmailNurtureToast',
      'armcom-toast--secondary',
      '<button type="button" class="armcom-toast-dismiss" aria-label="Dismiss notification">×</button>' +
        '<strong>Email nurture ready</strong><br>Marketo Engage follow-up is queued after paid social retargeting.' +
        '<div class="armcom-toast-actions">' +
        '<a class="armcom-toast-link" href="' +
        emailNurtureHref() +
        '" target="_top">Open nurture mock →</a>' +
        '</div>',
    );
  }

  function restorePersistedToasts() {
    var state = readToastState();
    if (state.activationShown) {
      showActivationToast();
    }
    /* Email nurture is unlocked by armcom-demo shell after brief + paid retargeting return — not on iframe load. */
  }

  function dismissActivationToast(toast) {
    dismissToast(toast);
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

      var leadLabel = source === 'footer-inline' ? 'Footer newsletter signup' : 'Newsletter signup';
      var displayLabel = formatDisplayLabel({ siteId: 'arm.com', viewName: leadLabel });
      postToParent('armcom-experience-event', {
        eventType: 'armcom.lead.capture',
        viewName: displayLabel,
        displayLabel: displayLabel,
        viewUrl: window.location.href.split('?')[0],
        channel: 'Web',
        public: {
          displayLabel: displayLabel,
          pageTitle: leadLabel,
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

      showSegmentQualifiedToast();
      window.setTimeout(function () {
        showActivationToast();
      }, 900);

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

      var displayLabel = formatDisplayLabel({ siteId: 'arm.com', viewName: 'AGI CPU Technical Brief download' });
      postToParent('armcom-experience-event', {
        eventType: 'armcom.lead.capture',
        viewName: displayLabel,
        displayLabel: displayLabel,
        viewUrl: window.location.href.split('?')[0],
        channel: 'Web',
        public: {
          displayLabel: displayLabel,
          pageTitle: 'AGI CPU Technical Brief download',
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

      showIdentityStitchToast();

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
    /* Paid social return + email nurture toast are driven by armcom-demo shell (?from=linkedin-ad). */
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

  function handleShellMessages(data) {
    if (!data || data.source !== SHELL_SOURCE) return;
    if (data.type === 'armcom-identity-stitched') {
      showIdentityStitchToast();
      return;
    }
    if (data.type === 'armcom-segment-qualified') {
      showSegmentQualifiedToast();
      return;
    }
    if (data.type === 'armcom-audience-activation') {
      showActivationToast();
      return;
    }
    if (data.type === 'armcom-email-nurture-unlocked') {
      showEmailNurtureToast();
      return;
    }
    if (data.type === 'login-complete' && data.found) {
      if (data.mode === 'agi-brief') {
        if (
          window.ArmcomPersonalizedBanner &&
          typeof window.ArmcomPersonalizedBanner.onRegistrationComplete === 'function'
        ) {
          window.ArmcomPersonalizedBanner.onRegistrationComplete({
            email: data.email,
            firstName: data.firstName,
            company: data.company,
          });
        }
        return;
      }
      if (
        window.ArmcomPersonalizedBanner &&
        typeof window.ArmcomPersonalizedBanner.isEnabled === 'function' &&
        !window.ArmcomPersonalizedBanner.isEnabled()
      ) {
        showIdentityStitchToast();
        window.setTimeout(function () {
          showSegmentQualifiedToast();
          window.setTimeout(showActivationToast, 900);
        }, 700);
        return;
      }
      if (
        window.ArmcomPersonalizedBanner &&
        typeof window.ArmcomPersonalizedBanner.onRegistrationComplete === 'function'
      ) {
        window.ArmcomPersonalizedBanner.onRegistrationComplete({
          email: data.email,
          firstName: data.firstName,
          company: data.company,
        });
      }
      showIdentityStitchToast();
      window.setTimeout(function () {
        showSegmentQualifiedToast();
        window.setTimeout(showActivationToast, 900);
      }, 700);
    }
  }

  function init() {
    sendPageView();
    initPageSpecificEvents();
    wireCtas();
    restorePersistedToasts();

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
      handleShellMessages(ev.data);
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
    showSegmentQualifiedToast: showSegmentQualifiedToast,
    showEmailNurtureToast: showEmailNurtureToast,
    showIdentityStitchToast: showIdentityStitchToast,
    requestDecisioningRefresh: requestDecisioningRefresh,
  };
})();
