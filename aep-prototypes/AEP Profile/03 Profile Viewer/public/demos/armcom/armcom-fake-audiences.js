/**
 * Arm demo — linear fake audience progression for profile drawer (no AEP segment API).
 * Audience names mirror arm-journey.html segment narrative.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'armcomFakeAudienceStage';
  var JOURNEY_SLIDE_STORAGE_KEY = 'armcomJourneySlideIndex';
  var currentStage = 0;

  var NAMES = {
    anonCloudAi: 'Anonymous Cloud AI Content Engagement',
    multiProperty: 'Multi-Property Engagement',
    targetHighIntent: 'Cloud AI Target Account — High Intent',
    linkedInIcp: 'LinkedIn Matched Audiences — Cloud AI ICP',
    heroPersonalization: 'Cloud AI Hero Personalization Target',
    emailNurture: 'AGI CPU Technical Nurture',
    multiContact: 'Multi-Contact Account Engagement',
    cjaThreshold: 'CJA: Account Engagement Threshold',
    cjaAttribution: 'CJA: Cross-Channel Attribution',
  };

  /** Full drawer payload per journey stage index (0–12). */
  var STAGES = [
    { realized: [], exited: [] },
    { realized: [], exited: [] },
    { realized: [{ name: NAMES.anonCloudAi }], exited: [] },
    {
      realized: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
      exited: [],
    },
    {
      realized: [],
      exited: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
    },
    {
      realized: [{ name: NAMES.targetHighIntent }],
      exited: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
    },
    {
      realized: [{ name: NAMES.targetHighIntent }, { name: NAMES.linkedInIcp }],
      exited: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
    },
    {
      realized: [{ name: NAMES.targetHighIntent }, { name: NAMES.linkedInIcp }],
      exited: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
    },
    {
      realized: [
        { name: NAMES.targetHighIntent },
        { name: NAMES.linkedInIcp },
        { name: NAMES.heroPersonalization },
      ],
      exited: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
    },
    {
      realized: [
        { name: NAMES.targetHighIntent },
        { name: NAMES.linkedInIcp },
        { name: NAMES.heroPersonalization },
        { name: NAMES.emailNurture },
      ],
      exited: [{ name: NAMES.anonCloudAi }, { name: NAMES.multiProperty }],
    },
    {
      realized: [
        { name: NAMES.targetHighIntent },
        { name: NAMES.linkedInIcp },
        { name: NAMES.emailNurture },
        { name: NAMES.multiContact },
      ],
      exited: [
        { name: NAMES.anonCloudAi },
        { name: NAMES.multiProperty },
        { name: NAMES.heroPersonalization },
      ],
    },
    {
      realized: [
        { name: NAMES.targetHighIntent },
        { name: NAMES.linkedInIcp },
        { name: NAMES.emailNurture },
        { name: NAMES.multiContact },
        { name: NAMES.cjaThreshold },
      ],
      exited: [
        { name: NAMES.anonCloudAi },
        { name: NAMES.multiProperty },
        { name: NAMES.heroPersonalization },
      ],
    },
    {
      realized: [
        { name: NAMES.targetHighIntent },
        { name: NAMES.linkedInIcp },
        { name: NAMES.emailNurture },
        { name: NAMES.multiContact },
        { name: NAMES.cjaThreshold },
        { name: NAMES.cjaAttribution },
      ],
      exited: [
        { name: NAMES.anonCloudAi },
        { name: NAMES.multiProperty },
        { name: NAMES.heroPersonalization },
      ],
    },
  ];

  var PAGE_STAGE = {
    home: 1,
    'cloud-ai-hub': 2,
    'data-center-ai': 2,
    developer: 3,
    newsroom: 3,
    'blog-future-computing': 3,
    'agi-cpu-brief': 4,
    subscribe: 5,
    'neoverse-n2': 2,
    'email-nurture': 9,
    'account-engagement': 10,
  };

  function cloneRows(rows) {
    return (rows || []).map(function (row) {
      return { name: row.name, enteredAt: row.enteredAt || null, exitedAt: row.exitedAt || null };
    });
  }

  function audiencePayloadForStage(stage) {
    var idx = Math.max(0, Math.min(stage, STAGES.length - 1));
    var slice = STAGES[idx];
    return {
      realized: cloneRows(slice.realized),
      exited: cloneRows(slice.exited),
    };
  }

  function persistStage() {
    try {
      global.sessionStorage.setItem(STORAGE_KEY, String(currentStage));
    } catch (_e) {
      /* noop */
    }
  }

  function restoreStage() {
    try {
      var stored = parseInt(global.sessionStorage.getItem(STORAGE_KEY), 10);
      if (!isNaN(stored) && stored >= 0 && stored < STAGES.length) currentStage = stored;
    } catch (_e) {
      /* noop */
    }
  }

  function patchDrawer() {
    if (typeof global.DemoProfileDrawer === 'undefined') return;
    if (typeof global.DemoProfileDrawer.patchLastProfileOrUpdate !== 'function') return;
    global.DemoProfileDrawer.patchLastProfileOrUpdate({
      audiences: audiencePayloadForStage(currentStage),
    });
  }

  function applyStage(stage, opts) {
    opts = opts || {};
    var next = Math.max(0, Math.min(stage, STAGES.length - 1));
    if (!opts.force && next < currentStage) return currentStage;
    currentStage = next;
    persistStage();
    patchDrawer();
    try {
      global.dispatchEvent(
        new CustomEvent('armcom-fake-audiences-updated', {
          detail: { stage: currentStage, audiences: audiencePayloadForStage(currentStage) },
        }),
      );
    } catch (_evtErr) {
      /* noop */
    }
    return currentStage;
  }

  function advanceToAtLeast(stage) {
    if (stage > currentStage) return applyStage(stage);
    return currentStage;
  }

  function stageForPageId(pageId) {
    return PAGE_STAGE[String(pageId || '').trim()] != null ? PAGE_STAGE[String(pageId || '').trim()] : null;
  }

  function onPageView(pageId) {
    var stage = stageForPageId(pageId);
    if (stage != null) advanceToAtLeast(stage);
  }

  function onExperienceEvent(payload) {
    var p = payload && typeof payload === 'object' ? payload : {};
    var eventType = String(p.eventType || '').trim();
    var pageName = p.public && p.public.pageName ? String(p.public.pageName).trim() : '';

    if (pageName) onPageView(pageName);

    if (eventType === 'armcom.linkedin.organic.click') advanceToAtLeast(1);
    if (eventType === 'armcom.content.interest' || eventType === 'armcom.content.clicked') {
      advanceToAtLeast(2);
    }
    if (eventType === 'armcom.product.view') advanceToAtLeast(2);
    if (eventType === 'armcom.paidSocial.clicked') advanceToAtLeast(7);
    if (eventType === 'armcom.email.open' || eventType === 'armcom.email.clicked') advanceToAtLeast(9);
  }

  function onLeadCapture(mode) {
    if (mode === 'agi-brief' || mode === 'lead-capture') advanceToAtLeast(4);
    else advanceToAtLeast(4);
  }

  function onSegmentQualified() {
    advanceToAtLeast(5);
  }

  function onLinkedInActivation() {
    advanceToAtLeast(6);
  }

  function onLinkedInOrganicClick() {
    advanceToAtLeast(1);
  }

  function onLinkedInAdClick() {
    advanceToAtLeast(7);
  }

  function onDecisioningRefresh(payload) {
    var p = payload && typeof payload === 'object' ? payload : {};
    if (p.paidSocialReturn) advanceToAtLeast(7);
    if (p.paidSocialReturn && p.contentTriggered) advanceToAtLeast(8);
  }

  function persistJourneySlide(slideIndex) {
    try {
      global.sessionStorage.setItem(JOURNEY_SLIDE_STORAGE_KEY, String(slideIndex));
    } catch (_e) {
      /* noop */
    }
  }

  function restoreJourneySlide() {
    try {
      var stored = parseInt(global.sessionStorage.getItem(JOURNEY_SLIDE_STORAGE_KEY), 10);
      if (!isNaN(stored) && stored >= 0 && stored < STAGES.length) {
        applyStage(stored, { force: true });
        return stored;
      }
    } catch (_e) {
      /* noop */
    }
    return null;
  }

  function onJourneySlide(slideIndex) {
    var idx = Math.max(0, Math.min(Number(slideIndex), STAGES.length - 1));
    persistJourneySlide(idx);
    applyStage(idx, { force: true });
  }

  function reset() {
    applyStage(0, { force: true });
  }

  function init(opts) {
    opts = opts || {};
    restoreStage();
    restoreJourneySlide();

    if (opts.linkedinActivation) onLinkedInActivation();
    if (opts.linkedinAdReturn) onLinkedInAdClick();

    global.addEventListener('aep-profile-drawer-loaded', function () {
      patchDrawer();
    });

    patchDrawer();
  }

  global.ArmcomFakeAudiences = {
    init: init,
    applyStage: applyStage,
    advanceToAtLeast: advanceToAtLeast,
    onPageView: onPageView,
    onExperienceEvent: onExperienceEvent,
    onLeadCapture: onLeadCapture,
    onSegmentQualified: onSegmentQualified,
    onLinkedInActivation: onLinkedInActivation,
    onLinkedInOrganicClick: onLinkedInOrganicClick,
    onLinkedInAdClick: onLinkedInAdClick,
    onDecisioningRefresh: onDecisioningRefresh,
    onJourneySlide: onJourneySlide,
    restoreJourneySlide: restoreJourneySlide,
    persistJourneySlide: persistJourneySlide,
    JOURNEY_SLIDE_STORAGE_KEY: JOURNEY_SLIDE_STORAGE_KEY,
    reset: reset,
    patchDrawer: patchDrawer,
    getStage: function () {
      return currentStage;
    },
    getStageNames: function () {
      return STAGES.map(function (slice, idx) {
        return {
          stage: idx,
          realized: slice.realized.map(function (r) {
            return r.name;
          }),
          exited: slice.exited.map(function (r) {
            return r.name;
          }),
        };
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
