/**
 * Arm demo — local fake decisioning banners (no Edge Decisioning API).
 * Mimics Adobe Target post-registration brand awareness in #TopRibbon.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'armcomBannerState';
  var SHELL_SOURCE = 'armcom-demo-shell';
  var decisioningEnabled = false;

  var TOPIC_LABELS = {
    'cloud-ai': 'Cloud AI',
    neoverse: 'Neoverse',
    developer: 'Developer',
    general: 'Cloud AI',
  };

  var VARIANTS = {
    'brand-awareness': {
      id: 'brand-awareness',
      segment: 'Brand awareness — post-registration',
      headline: "Hi {firstName}, explore Arm's first production silicon for AI data centers",
      subtext:
        'The Arm AGI CPU is purpose-built for agentic AI — orchestrating compute, managing accelerators, and coordinating thousands of agents at rack scale.',
      interestLine: 'Based on your interest in {interest}, we thought this would resonate at {company}.',
      cta: 'Read about AGI CPU',
      ctaHref: 'cloud-ai/data-center-ai.html',
      image: 'assets/hero-agi-cpu.png',
      imageAlt: 'Arm AGI CPU — the world\u2019s most efficient agentic CPU',
    },
    'cloud-ai': {
      id: 'cloud-ai',
      segment: 'Content affinity — Cloud AI',
      headline: '{firstName}, scale agentic AI with rack-level efficiency',
      subtext:
        'Arm Neoverse CSS V3 and the AGI CPU deliver more than 2\u00d7 performance per rack for converged AI data centers.',
      interestLine: 'Continuing your {interest} journey for {company}.',
      cta: 'Explore Cloud AI',
      ctaHref: 'cloud-ai/index.html',
      image: 'assets/tab-cloud-ai.jpg',
      imageAlt: 'Arm Cloud AI infrastructure',
    },
    neoverse: {
      id: 'neoverse',
      segment: 'Content affinity — Neoverse',
      headline: '{firstName}, meet Arm Neoverse for cloud-scale compute',
      subtext:
        'High-performance Neoverse cores power the AGI CPU and custom cloud CPUs — built for sustained AI throughput.',
      interestLine: 'Recommended after your {interest} research at {company}.',
      cta: 'View Neoverse N2',
      ctaHref: 'products/neoverse-n2.html',
      image: 'assets/highlight-rethinking-ai-cpu.jpg',
      imageAlt: 'Arm Neoverse cloud compute',
    },
    developer: {
      id: 'developer',
      segment: 'Content affinity — Developer',
      headline: '{firstName}, optimize workloads for Arm AGI CPU',
      subtext:
        'Arm Performix helps developers identify bottlenecks and tune AI workloads for production silicon.',
      interestLine: 'Tailored for {company} teams exploring {interest}.',
      cta: 'Developer hub',
      ctaHref: 'developer/index.html',
      image: 'assets/highlight-space-learning.jpg',
      imageAlt: 'Arm developer ecosystem',
    },
  };

  function assetPrefix() {
    var path = String(location.pathname || '');
    var marker = '/demos/armcom/';
    var idx = path.indexOf(marker);
    if (idx === -1) return '';
    var rest = path.slice(idx + marker.length);
    var depth = (rest.match(/\//g) || []).length;
    return depth ? '../'.repeat(depth) : '';
  }

  function resolveHref(href) {
    return assetPrefix() + String(href || '').replace(/^\//, '');
  }

  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function writeState(patch) {
    var next = Object.assign({}, readState(), patch || {});
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_e) {
      /* ignore */
    }
    return next;
  }

  function firstNameFromEmail(email) {
    var local = String(email || '').split('@')[0] || '';
    var part = local.split(/[._+\-]/)[0] || '';
    if (!part) return 'there';
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }

  function displayFirstName(state) {
    if (state.firstName) return String(state.firstName).trim();
    if (state.email) return firstNameFromEmail(state.email);
    return 'there';
  }

  function displayCompany(state) {
    var c = String(state.company || '').trim();
    return c || 'your organization';
  }

  function displayInterest(state) {
    var topic = String(state.lastContentTopic || state.topic || 'cloud-ai').trim();
    return TOPIC_LABELS[topic] || TOPIC_LABELS['cloud-ai'];
  }

  function fillTemplate(text, state) {
    return String(text || '')
      .replace(/\{firstName\}/g, displayFirstName(state))
      .replace(/\{company\}/g, displayCompany(state))
      .replace(/\{interest\}/g, displayInterest(state));
  }

  function pickVariant(state) {
    if (!state.registered && !state.leadCaptured) return null;
    if (state.forceVariant && VARIANTS[state.forceVariant]) return VARIANTS[state.forceVariant];
    if (state.registered || state.leadCaptured) {
      var topic = String(state.lastContentTopic || '').trim();
      if (topic && VARIANTS[topic] && state.contentTriggered) return VARIANTS[topic];
      return VARIANTS['brand-awareness'];
    }
    return null;
  }

  function renderBanner(mount, variant, state) {
    if (!mount || !variant) return;
    mount.textContent = '';
    mount.classList.add('armcom-personalized-banner-mount');

    var root = document.createElement('div');
    root.className = 'armcom-personalized-banner';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Personalized offer');

    var inner = document.createElement('div');
    inner.className = 'armcom-personalized-banner__inner';

    var visual = document.createElement('div');
    visual.className = 'armcom-personalized-banner__visual';
    var img = document.createElement('img');
    img.className = 'armcom-personalized-banner__image';
    img.src = resolveHref(variant.image);
    img.alt = variant.imageAlt || '';
    img.width = 120;
    img.height = 120;
    img.loading = 'lazy';
    img.decoding = 'async';
    visual.appendChild(img);

    var copy = document.createElement('div');
    copy.className = 'armcom-personalized-banner__copy';

    var segment = document.createElement('p');
    segment.className = 'armcom-personalized-banner__segment';
    segment.textContent = variant.segment;

    var headline = document.createElement('p');
    headline.className = 'armcom-personalized-banner__headline';
    headline.textContent = fillTemplate(variant.headline, state);

    var subtext = document.createElement('p');
    subtext.className = 'armcom-personalized-banner__subtext';
    subtext.textContent = fillTemplate(variant.subtext, state);

    var interest = document.createElement('p');
    interest.className = 'armcom-personalized-banner__interest';
    interest.textContent = fillTemplate(variant.interestLine, state);

    copy.appendChild(segment);
    copy.appendChild(headline);
    copy.appendChild(subtext);
    copy.appendChild(interest);

    var actions = document.createElement('div');
    actions.className = 'armcom-personalized-banner__actions';
    var cta = document.createElement('a');
    cta.className = 'armcom-personalized-banner__cta';
    cta.href = resolveHref(variant.ctaHref);
    cta.textContent = variant.cta;
    cta.setAttribute('data-armcom-track', 'Personalized banner — ' + variant.cta);
    actions.appendChild(cta);

    inner.appendChild(visual);
    inner.appendChild(copy);
    inner.appendChild(actions);
    root.appendChild(inner);
    mount.appendChild(root);
  }

  function clearBanner() {
    var mount = document.getElementById('TopRibbon');
    if (!mount) return;
    mount.textContent = '';
    mount.classList.remove('armcom-personalized-banner-mount');
  }

  function applyRefreshOpts(state, opts) {
    if (opts.contentTriggered) state.contentTriggered = true;
    if (opts.forceVariant) state.forceVariant = opts.forceVariant;
    if (opts.leadCaptured) state.leadCaptured = true;
    if (opts.registered) state.registered = true;
    if (opts.email) state.email = String(opts.email).trim();
    if (opts.company) state.company = String(opts.company).trim();
    if (opts.firstName) state.firstName = String(opts.firstName).trim() || null;
    return state;
  }

  function refresh(opts) {
    opts = opts || {};
    var state = applyRefreshOpts(readState(), opts);
    writeState(state);
    if (!decisioningEnabled) {
      clearBanner();
      return false;
    }

    var variant = pickVariant(state);
    var mount = document.getElementById('TopRibbon');
    if (!variant || !mount) {
      clearBanner();
      return false;
    }
    renderBanner(mount, variant, state);
    return true;
  }

  function onLeadCapture(payload) {
    var p = payload && typeof payload === 'object' ? payload : {};
    var email = String(p.email || '').trim();
    var company = String(p.company || '').trim();
    if (!email) return;
    refresh({
      email: email,
      company: company,
      leadCaptured: true,
      contentTriggered: false,
      forceVariant: null,
    });
  }

  function onRegistrationComplete(payload) {
    var p = payload && typeof payload === 'object' ? payload : {};
    var prior = readState();
    refresh({
      email: String(p.email || prior.email || '').trim(),
      company: String(p.company || prior.company || '').trim(),
      firstName: String(p.firstName || '').trim() || null,
      registered: true,
      leadCaptured: true,
      contentTriggered: false,
      forceVariant: null,
    });
  }

  function onContentInterest(topic, label) {
    var t = String(topic || '').trim() || 'cloud-ai';
    var state = writeState({
      lastContentTopic: t,
      lastContentLabel: String(label || '').trim() || TOPIC_LABELS[t] || t,
      topic: t,
    });
    if (state.registered || state.leadCaptured) {
      refresh({ contentTriggered: true, forceVariant: mapTopicToVariant(t) });
    }
  }

  function mapTopicToVariant(topic) {
    if (topic === 'neoverse' || topic === 'cloud-ai') return topic;
    if (topic === 'developer') return 'developer';
    return 'cloud-ai';
  }

  function onPageView(topic) {
    var t = String(topic || '').trim();
    if (!t) return;
    writeState({ lastContentTopic: t, topic: t });
  }

  function wireMessages() {
    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.source !== SHELL_SOURCE) return;
      if (ev.data.type === 'armcom-decisioning-state') {
        decisioningEnabled = !!(ev.data.payload && ev.data.payload.enabled);
        if (!decisioningEnabled) clearBanner();
        else refresh();
        return;
      }
      if (ev.data.type === 'login-complete') {
        onRegistrationComplete({
          email: ev.data.email,
          firstName: ev.data.firstName,
          company: ev.data.company,
        });
        return;
      }
      if (ev.data.type === 'armcom-banner-refresh') {
        refresh(ev.data.payload || {});
      }
    });
  }

  function requestDecisioningStateFromShell() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { source: 'armcom-lab', type: 'armcom-decisioning-refresh', payload: {} },
          '*',
        );
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function init() {
    wireMessages();
    requestDecisioningStateFromShell();
    var body = document.body;
    var pageId = body ? body.getAttribute('data-armcom-page-id') || '' : '';
    var topicMap = {
      home: 'general',
      'cloud-ai-hub': 'cloud-ai',
      'data-center-ai': 'cloud-ai',
      developer: 'developer',
      'neoverse-n2': 'neoverse',
      subscribe: 'cloud-ai',
      'blog-future-computing': 'cloud-ai',
    };
    onPageView(topicMap[pageId] || 'general');
  }

  window.ArmcomPersonalizedBanner = {
    refresh: refresh,
    isEnabled: function () {
      return decisioningEnabled;
    },
    onLeadCapture: onLeadCapture,
    onRegistrationComplete: onRegistrationComplete,
    onContentInterest: onContentInterest,
    onPageView: onPageView,
    clear: clearBanner,
    readState: readState,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
