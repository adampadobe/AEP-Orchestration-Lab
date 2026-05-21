/**
 * Miral Yas Island — Cross-Site CDP Event Tracking
 *
 * Auto-initialises on Ferrari World, WB World and SeaWorld demo pages.
 * Stores a lightweight behaviour state in localStorage so the Facebook demo
 * page can read it and inject the right retargeting ad.
 *
 * **Stable eventType values (AJO / rules):** do not rename without a migration plan.
 *   Park-scoped verbs (lowercase park id + dot + camelCase), no `miral.` prefix:
 *   - {parkId}.pageView — e.g. ferrariworld.pageView
 *   - {parkId}.attractionView — e.g. ferrariworld.attractionView
 *   - {parkId}.ticketIntent — e.g. wbworld.ticketIntent
 *   - newsletter.signup (email capture). Talk track PDF may say “emailCapture”; the
 *     stable generator eventType remains newsletter.signup — use public.miralEmailCapturePark
 *     for the originating park id (ferrariworld | wbworld | seaworld).
 *
 * **Attraction impressions:** primary path matches the Miral CDP demo script — an
 * IntersectionObserver fires when ~25% of a `[data-miral-attraction]` root is visible.
 * Clicks still work as a fallback (deduped per `data-miral-attraction` id per page load).
 * Attraction differentiation: `eventType` ({park}.attractionView), `viewName` (“… — Attraction view: …”),
 * and `public` (`miralParkDisplayName`, `miralAttractionName`, `miralAttractionId`, `miralAttractionCategory`).
 *
 * **Page view + ECID:** `trackPageView` runs after a short defer; `retryPageView()` (from
 * DemoTagsInjection after ECID resolves) only POSTs if the initial page view never reached
 * `/api/events/generator` — avoids duplicate `{parkId}.pageView` rows when ECID was already present.
 *
 * Usage (HTML pages):
 *   Add data-miral-attraction="fw:formula-rossa" data-miral-attraction-name="Formula Rossa"
 *   to ONE scrollable root per logical attraction (duplicate ids on multiple nodes create duplicate story risk).
 *   Add data-miral-ticket="single-day" to Buy Tickets buttons.
 *   Load this script AFTER the park-specific demo.js.
 *
 * Facebook page reads window.MiralCrossSite.getAdForSlot(slotId) to obtain
 * brand-personalised ad HTML for each slot. Rail slots `rail-1` / `rail-2` each
 * resolve a distinct cross-sell park when the candidate list allows it.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'miralCrossSiteState';

  /** True once a {parkId}.pageView POST was accepted (had ECID) for this document. */
  var pageViewDeliveredThisDocument = false;

  /** Attraction ids that already produced a successful attractionView POST this document. */
  var attractionDeliveredById = Object.create(null);

  /** parkId|ticketType — at most one ticketIntent per combo per load (reduces duplicate CTAs). */
  var ticketIntentDelivered = Object.create(null);

  // All custom events go through /api/events/generator — the same CF proxy that
  // Etihad and Premier Inn demos use. The CF resolves the targetId server-side
  // (presets in functions/event-generator-targets.json + Firestore) and applies
  // server-to-server IMS auth before hitting Edge Network. This is the only
  // proven path that lands custom eventTypes on AEP profiles.
  var DEFAULT_TARGET_ID = 'lab-event-tool-edge';

  // ECID may be stored under any of these prefixes depending on which park demo
  // was active when Tags was injected.
  var ECID_KEYS = [
    'miralThemeParksDemoecid',
    'ferrariworldecid',
    'wbworldecid',
    'seaworldecid',
    'facebookHomeecid',
  ];

  var PARK_MAP = {
    'ferrari-world-abu-dhabi-demo-page': {
      id: 'ferrariworld',
      name: 'Ferrari World Yas Island',
      url: 'ferrari-world-abu-dhabi/index.html',
    },
    'wb-world-abu-dhabi-demo-page': {
      id: 'wbworld',
      name: 'Warner Bros. World Yas Island',
      url: 'wb-world-abu-dhabi/index.html',
    },
    'seaworld-abu-dhabi-demo-page': {
      id: 'seaworld',
      name: 'SeaWorld Abu Dhabi',
      url: 'seaworld-abu-dhabi/index.html',
    },
  };

  var PARK_DISPLAY = {
    ferrariworld: 'Ferrari World Yas Island',
    wbworld: 'Warner Bros. World Yas Island',
    seaworld: 'SeaWorld Abu Dhabi',
  };

  function resolveParkDisplayName(parkId) {
    return PARK_DISPLAY[parkId] || parkId;
  }

  /** Interest category for `public.miralAttractionCategory` (AJO / profile facets). */
  function miralInterestCategory(attractionId) {
    var id = String(attractionId || '').toLowerCase();
    if (id.indexOf('vip') !== -1) return 'Premium experience';
    if (id.indexOf('formula') !== -1 || id.indexOf('rossa') !== -1) return 'Thrill ride';
    if (id.indexOf('buy-ticket') !== -1) return 'Booking page';
    if (id.indexOf('gotham') !== -1 || id.indexOf('plaza') !== -1 || id.indexOf('bedrock') !== -1 || id.indexOf('metropolis') !== -1 || id.indexOf('cartoon') !== -1) return 'Themed land';
    if (id.indexOf('offer') !== -1 || id.indexOf('nbd') !== -1) return 'Partner offer';
    if (id.indexOf('dolphin') !== -1 || id.indexOf('penguin') !== -1 || id.indexOf('orca') !== -1) return 'Animal encounter';
    if (id.indexOf('ocean') !== -1 || id.indexOf('realm') !== -1) return 'Realm';
    return 'Attraction interest';
  }

  function buildAttractionViewTitle(parkId, attractionId, attractionName) {
    var parkDisplay = resolveParkDisplayName(parkId);
    var raw = String(attractionName || attractionId || 'Attraction').trim();
    return parkDisplay + ' — Attraction view: ' + raw;
  }

  function buildTicketIntentTitle(parkId, ticketType) {
    return resolveParkDisplayName(parkId) + ' — Ticket intent: ' + String(ticketType || 'single-day');
  }

  // ── State helpers ────────────────────────────────────────────────────────

  function getState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function setState(updates) {
    try {
      var s = getState();
      for (var k in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, k)) s[k] = updates[k];
      }
      s.lastSeen = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) { /* noop */ }
  }

  /** Same sandbox key shape as `demo-tags-injection.js` / `aep-demo-web-push.js`. */
  function getSandboxKey() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      var raw = String(window.AepGlobalSandbox.getSandboxName() || '').trim().toLowerCase();
      return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
    }
    return '__default__';
  }

  function readStorageMap(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * DemoTagsInjection stores the resolved ECID per sandbox under
   * `{storagePrefix}LastResolvedEcidBySandbox` (JSON map). Legacy Miral pages used
   * flat keys like `wbworldecid`; without reading the map, `fireEvent` no-ops after inject.
   */
  function readTagsInjectionEcidForPrefix(prefix) {
    var p = String(prefix || '').trim();
    if (!p) return null;
    var map = readStorageMap(p + 'LastResolvedEcidBySandbox');
    var id = map[getSandboxKey()];
    if (id && String(id).trim()) return String(id).trim();
    return null;
  }

  function getEcidFromInfoBanner() {
    var el = document.getElementById('infoEcid');
    if (!el) return null;
    var t = String(el.textContent || '').trim();
    if (!t || t === '\u2014' || t === '-') return null;
    if (/^\d{10,}$/.test(t)) return t;
    return null;
  }

  function getEcid() {
    for (var i = 0; i < ECID_KEYS.length; i++) {
      try {
        var v = localStorage.getItem(ECID_KEYS[i]);
        if (v) return v;
      } catch (e) { /* noop */ }
    }
    var p = detectPark();
    if (p && p.id) {
      var fromTags = readTagsInjectionEcidForPrefix(p.id);
      if (fromTags) return fromTags;
    }
    return getEcidFromInfoBanner();
  }

  function getTargetId() {
    var sel = document.getElementById('generatorTarget');
    if (sel && sel.value) return sel.value;
    return DEFAULT_TARGET_ID;
  }

  // ── Event firing ─────────────────────────────────────────────────────────

  function fireEvent(eventType, viewName, viewUrl, extra) {
    var ecid = getEcid();
    if (!ecid) return false;
    var pub = {};
    if (extra && extra.public && typeof extra.public === 'object') {
      for (var pk in extra.public) {
        if (Object.prototype.hasOwnProperty.call(extra.public, pk)) pub[pk] = extra.public[pk];
      }
    }
    var body = {
      targetId: getTargetId(),
      eventType: eventType,
      viewName: viewName || document.title,
      viewUrl: viewUrl || window.location.pathname,
      channel: 'web',
      public: pub,
      xdmTenantKey: '_demoemea',
      identityMapEcidKey: 'ECID',
      ecid: ecid,
    };
    if (extra && extra.email) body.email = extra.email;
    var postBody = typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody
      ? window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
      : body;
    fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
      keepalive: true,
    }).catch(function () {});
    return true;
  }

  // ── Behaviour tracking ───────────────────────────────────────────────────

  function trackPageView(parkId, parkName) {
    var s = getState();
    var sites = s.sitesVisited || [];
    if (sites.indexOf(parkId) === -1) {
      sites = sites.concat([parkId]);
      setState({ sitesVisited: sites });
    }
    if (pageViewDeliveredThisDocument) return true;
    var sent = fireEvent(
      parkId + '.pageView',
      parkName + ' — Page view',
      window.location.pathname,
      {
        public: {
          miralParkId: parkId,
          miralParkDisplayName: parkName,
          miralEventSurface: 'miral-lab-demo',
          miralTrackingSource: 'pageInit',
        },
      }
    );
    if (sent) pageViewDeliveredThisDocument = true;
    return sent;
  }

  function trackAttractionView(parkId, a, b, c, d) {
    var attractionId;
    var attractionName;
    var trackingSource;
    if (typeof a === 'string' && /^(fw|wb|sw):/.test(a) && typeof b === 'string') {
      attractionId = a;
      attractionName = b;
      trackingSource = c;
    } else {
      attractionId = b;
      attractionName = c;
      trackingSource = d;
    }
    var src = trackingSource || 'click';
    var parkDisplay = resolveParkDisplayName(parkId);
    var nameRaw = String(attractionName || attractionId || '').trim();
    var title = buildAttractionViewTitle(parkId, attractionId, attractionName);
    var sent = fireEvent(
      parkId + '.attractionView',
      title,
      window.location.pathname + '#' + attractionId,
      {
        public: {
          miralParkId: parkId,
          miralParkDisplayName: parkDisplay,
          miralAttractionId: attractionId,
          miralAttractionName: nameRaw || attractionId,
          miralAttractionCategory: miralInterestCategory(attractionId),
          miralEventSurface: 'miral-lab-demo',
          miralTrackingSource: src,
        },
      }
    );
    if (!sent) return false;
    var s = getState();
    var interests = s.attractionInterests || [];
    if (interests.indexOf(attractionId) === -1) {
      interests = interests.concat([attractionId]);
      var topBrand = resolveTopBrand(interests);
      setState({ attractionInterests: interests, topBrand: topBrand });
    }
    return true;
  }

  function trackTicketIntent(parkId, ticketType) {
    var tt = String(ticketType || 'single-day').trim();
    var dedupeKey = parkId + '|' + tt;
    if (ticketIntentDelivered[dedupeKey]) return false;
    var title = buildTicketIntentTitle(parkId, tt);
    var sent = fireEvent(
      parkId + '.ticketIntent',
      title,
      window.location.pathname,
      {
        public: {
          miralParkId: parkId,
          miralParkDisplayName: resolveParkDisplayName(parkId),
          miralTicketType: tt,
          miralEventSurface: 'miral-lab-demo',
          miralTrackingSource: 'ctaClick',
        },
      }
    );
    if (!sent) return false;
    ticketIntentDelivered[dedupeKey] = true;
    var s = getState();
    var intents = s.ticketIntentSites || [];
    if (intents.indexOf(parkId) === -1) intents = intents.concat([parkId]);
    setState({ ticketIntentSites: intents, lastTicketIntentBrand: parkId });
    return true;
  }

  function trackEmailCapture(parkId, email) {
    setState({ emailCaptured: true, capturedEmail: email, emailCaptureSource: parkId });
    var ecid = getEcid();

    // Fire the newsletter.signup event (carries both ECID + email for AEP stitching)
    if (ecid) {
      var body = {
        targetId: getTargetId(),
        eventType: 'newsletter.signup',
        viewName: resolveParkDisplayName(parkId) + ' — Newsletter sign-up',
        viewUrl: window.location.pathname,
        channel: 'web',
        public: {
          miralEmailCapturePark: parkId,
          miralEventSurface: 'miral-lab-demo',
          miralTrackingSource: 'newsletterForm',
        },
        xdmTenantKey: '_demoemea',
        identityMapEcidKey: 'ECID',
        ecid: ecid,
        email: email,
      };
      var postBody = typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody
        ? window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
        : body;
      fetch('/api/events/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      }).catch(function () {});
    }

    // Stitch email → ECID via alloy (same path as the profile viewer Query Profile button
    // and Etihad login — goes through the injected Tags SDK to Edge Network)
    if (typeof window.AepDemoParkStitch !== 'undefined' && typeof window.AepDemoParkStitch.stitch === 'function') {
      window.AepDemoParkStitch.stitch(email, ecid);
    }

    // Open the drawer and load the matching profile so the lab operator sees it
    if (typeof window.DemoProfileDrawer !== 'undefined' && typeof window.DemoProfileDrawer.openDrawerAndLoad === 'function') {
      window.DemoProfileDrawer.openDrawerAndLoad(email);
    }
  }

  function resolveTopBrand(interests) {
    var counts = { wbworld: 0, ferrariworld: 0, seaworld: 0 };
    interests.forEach(function (a) {
      if (a.indexOf('wb:') === 0) counts.wbworld++;
      else if (a.indexOf('fw:') === 0) counts.ferrariworld++;
      else if (a.indexOf('sw:') === 0) counts.seaworld++;
    });
    var top = 'miral';
    var max = 0;
    for (var brand in counts) {
      if (counts[brand] > max) { max = counts[brand]; top = brand; }
    }
    return top;
  }

  // ── Tracking affordance styles ───────────────────────────────────────────

  function injectTrackingStyles() {
    if (document.getElementById('miral-tracking-styles')) return;
    var style = document.createElement('style');
    style.id = 'miral-tracking-styles';
    style.textContent = [
      '[data-miral-attraction]{cursor:pointer;position:relative;}',
      '[data-miral-attraction]::after{',
      '  content:"View";',
      '  position:absolute;top:10px;right:10px;',
      '  background:rgba(0,0,0,0.72);color:#fff;',
      '  font:700 11px/1 sans-serif;letter-spacing:.5px;text-transform:uppercase;',
      '  padding:5px 9px;border-radius:4px;',
      '  opacity:0;transition:opacity .18s;pointer-events:none;z-index:99;',
      '}',
      '[data-miral-attraction]:hover::after{opacity:1;}',
      '[data-miral-attraction]:active{outline:2px solid rgba(255,60,0,.7);}',
      '[data-miral-attraction--fired]::after{content:"✓ Sent";opacity:.6 !important;}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Page-level initialisation ────────────────────────────────────────────

  /**
   * Try to POST one attractionView for an element (dedupes by miralAttraction id
   * after a successful send). Used by IntersectionObserver, click fallback, and
   * post-ECID visibility flush.
   */
  function miralTryAttractionFromElement(parkRef, el, trackingSource) {
    if (!parkRef || !el) return false;
    var aId = el.getAttribute('data-miral-attraction');
    if (!aId) return false;
    if (attractionDeliveredById[aId]) return false;
    var aName = el.getAttribute('data-miral-attraction-name') || aId;
    var ok = trackAttractionView(parkRef.id, parkRef.name, aId, aName, trackingSource);
    if (ok) {
      attractionDeliveredById[aId] = true;
      el.setAttribute('data-miral-attraction--fired', '1');
    }
    return ok;
  }

  /** After ECID resolves, catch sections already on-screen that missed the first IO cycle. */
  function flushVisibleAttractions(parkRef, reason) {
    if (!parkRef) return;
    var src = reason || 'ecidFlush';
    document.querySelectorAll('[data-miral-attraction]').forEach(function (el) {
      var aid = el.getAttribute('data-miral-attraction');
      if (!aid || attractionDeliveredById[aid]) return;
      var rect = el.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      var top = Math.max(rect.top, 0);
      var bottom = Math.min(rect.bottom, vh);
      var visibleH = Math.max(0, bottom - top);
      var ratio = rect.height > 0 ? visibleH / rect.height : 0;
      if (ratio < 0.2) return;
      miralTryAttractionFromElement(parkRef, el, src);
    });
  }

  function initPageTracking(park) {
    injectTrackingStyles();
    trackPageView(park.id, park.name);

    var attractionIo = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || entry.intersectionRatio < 0.22) return;
            if (miralTryAttractionFromElement(park, entry.target, 'intersection')) {
              attractionIo.unobserve(entry.target);
            }
          });
        }, { threshold: [0, 0.12, 0.22, 0.35, 0.5], rootMargin: '0px 0px -6% 0px' })
      : null;

    document.querySelectorAll('[data-miral-attraction]').forEach(function (el) {
      if (attractionIo) attractionIo.observe(el);
      el.addEventListener('click', function () {
        miralTryAttractionFromElement(park, el, 'click');
      });
    });

    // Click listeners on [data-miral-ticket] elements
    document.querySelectorAll('[data-miral-ticket]').forEach(function (el) {
      el.addEventListener('click', function () {
        trackTicketIntent(park.id, el.getAttribute('data-miral-ticket') || 'single-day');
      });
    });

    // Newsletter / sign-up email capture is called from each page's inline submit
    // handler (handleNewsletterSubmit / handleSignupSubmit) via MiralCrossSite.trackEmailCapture
    // so the email is captured before the input is cleared.
  }

  // ── Facebook ad builders ─────────────────────────────────────────────────

  var SPONSORED_ROW =
    '<div class="fbh-post-header">' +
      '<img class="fbh-post-avatar" src="{avatar}" alt="{brand}" />' +
      '<div class="fbh-post-meta">' +
        '<div class="fbh-post-author">{brand} <span class="fbh-verified">&#10003;</span></div>' +
        '<div class="fbh-post-time fbh-sponsored">Sponsored &middot; ' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>' +
        '</div>' +
      '</div>' +
      '<div class="fbh-post-options"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></div>' +
    '</div>';

  var ACTION_BAR =
    '<div class="fbh-post-divider"></div>' +
    '<div class="fbh-post-action-bar">' +
      '<button class="fbh-action-btn"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="1.8" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path stroke="currentColor" stroke-width="1.8" d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg> Like</button>' +
      '<button class="fbh-action-btn"><svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="1.8" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/></svg> Comment</button>' +
      '<button class="fbh-ad-cta-btn fbh-ad-cta-btn--feed">{cta}</button>' +
    '</div>';

  function t(tmpl, data) {
    return tmpl.replace(/\{(\w+)\}/g, function (_, k) { return data[k] !== undefined ? data[k] : ''; });
  }

  function buildFeedAd(opts) {
    return (
      t(SPONSORED_ROW, { avatar: opts.avatar, brand: opts.brand }) +
      '<div class="fbh-post-text">' + opts.text + '</div>' +
      '<div class="fbh-post-img-wrap"><img src="' + opts.img + '" alt="' + opts.imgAlt + '" /></div>' +
      '<div class="fbh-ad-cta-strip">' +
        '<div class="fbh-ad-cta-text">' +
          '<div class="fbh-ad-cta-domain">' + opts.domain + '</div>' +
          '<div class="fbh-ad-cta-headline">' + opts.headline + '</div>' +
          '<div class="fbh-ad-cta-sub">' + opts.sub + '</div>' +
        '</div>' +
        '<button class="fbh-ad-cta-btn">' + opts.cta + '</button>' +
      '</div>' +
      '<div class="fbh-ad-badge"><svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path stroke="currentColor" stroke-width="1.8" d="M12 8v4l2 2"/></svg> AEP Personalised Ad &mdash; <code>' + opts.slotLabel + '</code></div>' +
      t(ACTION_BAR, { cta: opts.cta })
    );
  }

  function buildRailAd(opts) {
    return (
      '<img class="fbh-rail-ad-img" src="' + opts.img + '" alt="' + opts.imgAlt + '" />' +
      '<div class="fbh-rail-ad-body">' +
        '<div class="fbh-rail-ad-title">' + opts.title + '</div>' +
        '<div class="fbh-rail-ad-sub">' + opts.sub + '</div>' +
        '<button class="fbh-rail-ad-btn">' + opts.cta + '</button>' +
      '</div>' +
      '<div class="fbh-ad-badge fbh-ad-badge--rail">AEP Personalised &mdash; <code>' + opts.slotLabel + '</code></div>'
    );
  }

  // WB World retargeting — user showed interest but no purchase
  function buildWbWorldOfferAd(slotLabel) {
    return buildFeedAd({
      avatar: '../wb-world-abu-dhabi/images/logo.png',
      brand: 'Warner Bros. World™ Abu Dhabi',
      text: 'You left the magic behind! Come back and step into <strong>Gotham City, Bedrock and more</strong> — exclusive offer for returning visitors: <strong>20% off Single Day Tickets</strong> this weekend.',
      img: '../wb-world-abu-dhabi/images/gotham-etihad.jpg',
      imgAlt: 'Warner Bros. World Yas Island — Gotham City',
      domain: 'wbworldabudhabi.com',
      headline: 'Warner Bros. World™ — 20% Off This Weekend',
      sub: 'Six immersive lands on Yas Island, Abu Dhabi.',
      cta: 'Get offer',
      slotLabel: slotLabel,
    });
  }

  // WB World booking completion — user captured email but didn't book
  function buildWbWorldBookingAd(slotLabel) {
    return buildFeedAd({
      avatar: '../wb-world-abu-dhabi/images/logo.png',
      brand: 'Warner Bros. World™ Abu Dhabi',
      text: 'Your exclusive offer is waiting! You showed interest in <strong>Warner Bros. World™</strong> on Yas Island. Complete your booking now — your personalised deal expires soon.',
      img: '../wb-world-abu-dhabi/images/vip-experience.jpg',
      imgAlt: 'Warner Bros. World VIP Experience',
      domain: 'wbworldabudhabi.com',
      headline: 'Complete Your WB World Booking',
      sub: 'Your saved offer expires in 48 hours.',
      cta: 'Book now',
      slotLabel: slotLabel,
    });
  }

  // Ferrari World retargeting
  function buildFerrariWorldAd(slotLabel) {
    return buildFeedAd({
      avatar: '../ferrari-world-abu-dhabi/images/logo-sm.png',
      brand: 'Ferrari World Abu Dhabi',
      text: 'The world\'s fastest roller coaster is calling. <strong>Formula Rossa</strong> hits 240 km/h — experience it at Ferrari World Abu Dhabi, Yas Island. Ready to feel the rush?',
      img: '../ferrari-world-abu-dhabi/images/formula-rossa.jpg',
      imgAlt: 'Formula Rossa — Ferrari World Abu Dhabi',
      domain: 'ferrariworldabudhabi.com',
      headline: 'Ferrari World Abu Dhabi — Book Your Visit',
      sub: '40+ rides &amp; attractions on Yas Island.',
      cta: 'Book tickets',
      slotLabel: slotLabel,
    });
  }

  // SeaWorld retargeting
  function buildSeaWorldAd(slotLabel) {
    return buildFeedAd({
      avatar: '../seaworld-abu-dhabi/images/logo-color.png',
      brand: 'SeaWorld Abu Dhabi',
      text: 'Get up close with <strong>dolphins, orcas and penguins</strong> at SeaWorld Abu Dhabi — the world\'s first SeaWorld outside the US. Book a Dolphin Discovery experience today.',
      img: '../seaworld-abu-dhabi/images/dolphin-encounter.jpg',
      imgAlt: 'Dolphin Discovery — SeaWorld Abu Dhabi',
      domain: 'seaworldabudhabi.com',
      headline: 'SeaWorld Abu Dhabi — Book an Encounter',
      sub: 'One Ocean. Countless discoveries.',
      cta: 'Explore now',
      slotLabel: slotLabel,
    });
  }

  /** Canonical Yas Island park ids for cross-sell ordering. */
  var MIRAL_PARK_ORDER = ['ferrariworld', 'wbworld', 'seaworld'];

  /**
   * Single "primary" cross-sell park from legacy heuristics (attraction/ticket story).
   * Used as the first preference when building an ordered candidate list.
   */
  function computePrimaryCrossSellPark(sites, topBrand) {
    var promote = 'ferrariworld';
    if (sites.indexOf('ferrariworld') !== -1 && sites.indexOf('wbworld') === -1) promote = 'wbworld';
    else if (sites.indexOf('wbworld') !== -1 && sites.indexOf('seaworld') === -1) promote = 'seaworld';
    else if (topBrand === 'wbworld') promote = 'seaworld';
    else if (topBrand === 'ferrariworld') promote = 'wbworld';
    return promote;
  }

  /**
   * Ordered parks for rail-1 / rail-2: prefer primary heuristic, then other
   * unvisited parks (canonical order), then recent visits (reverse of sitesVisited)
   * so the second rail can show another brand when only one park remains unvisited.
   */
  function buildCrossSellCandidateParks(sites, topBrand) {
    var sitesArr = Array.isArray(sites) ? sites : [];
    var primary = computePrimaryCrossSellPark(sitesArr, topBrand);
    var unvisited = MIRAL_PARK_ORDER.filter(function (p) { return sitesArr.indexOf(p) === -1; });
    var candidates = [];
    function pushUnique(p) {
      if (!p || candidates.indexOf(p) !== -1) return;
      candidates.push(p);
    }
    pushUnique(primary);
    unvisited.forEach(function (p) { pushUnique(p); });
    if (candidates.length < 2) {
      for (var i = sitesArr.length - 1; i >= 0; i--) {
        pushUnique(sitesArr[i]);
        if (candidates.length >= 2) break;
      }
    }
    if (candidates.length < 2) {
      MIRAL_PARK_ORDER.forEach(function (p) { pushUnique(p); });
    }
    return candidates;
  }

  function pickCrossSellParkForRail(slotId, sites, topBrand) {
    var list = buildCrossSellCandidateParks(sites, topBrand);
    var wantSecond = slotId === 'rail-2';
    var parkId = wantSecond ? (list[1] || list[0]) : list[0];
    var useSecondaryCopy = wantSecond && list.length === 1;
    return { parkId: parkId, useSecondaryCopy: useSecondaryCopy };
  }

  // Miral cross-sell rail ad — promotes a different park per slot when possible
  function buildMiralCrossSellRailAd(sites, topBrand, slotId) {
    var pick = pickCrossSellParkForRail(slotId, sites, topBrand);
    var promote = pick.parkId || 'wbworld';

    var opts = {
      ferrariworld: {
        img: '../ferrari-world-abu-dhabi/images/formula-rossa.jpg',
        imgAlt: 'Formula Rossa — Ferrari World',
        title: 'Ferrari World Abu Dhabi',
        sub: 'ferrariworldabudhabi.com · World\'s fastest coaster',
        cta: 'Explore',
      },
      wbworld: {
        img: '../wb-world-abu-dhabi/images/friends-family.jpg',
        imgAlt: 'Warner Bros. World Yas Island',
        title: 'Warner Bros. World™',
        sub: 'wbworldabudhabi.com · 6 immersive lands',
        cta: 'Explore',
      },
      seaworld: {
        img: '../seaworld-abu-dhabi/images/encounters.jpg',
        imgAlt: 'SeaWorld Abu Dhabi encounters',
        title: 'SeaWorld Abu Dhabi',
        sub: 'seaworldabudhabi.com · Dolphin encounters',
        cta: 'Explore',
      },
    };
    var o = opts[promote] || opts.wbworld;
    if (pick.useSecondaryCopy) {
      o = {
        img: o.img,
        imgAlt: o.imgAlt,
        title: o.title,
        sub: o.sub + ' · Multi-park Yas Island tips',
        cta: 'View offers',
      };
    }
    return buildRailAd({ img: o.img, imgAlt: o.imgAlt, title: o.title, sub: o.sub, cta: o.cta, slotLabel: slotId });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  function getAdForSlot(slotId) {
    var s = getState();
    var sites = s.sitesVisited || [];
    if (sites.length === 0) return null; // user never visited a Miral park

    var topBrand = s.topBrand || '';
    var emailCaptured = !!s.emailCaptured;

    if (slotId === 'feed-1' || slotId === 'feed-2') {
      if (topBrand === 'wbworld' && emailCaptured) return buildWbWorldBookingAd(slotId);
      if (topBrand === 'wbworld') return buildWbWorldOfferAd(slotId);
      if (sites.indexOf('seaworld') !== -1) return buildSeaWorldAd(slotId);
      if (sites.indexOf('ferrariworld') !== -1) return buildFerrariWorldAd(slotId);
    }
    if (slotId === 'rail-1' || slotId === 'rail-2') {
      return buildMiralCrossSellRailAd(sites, topBrand, slotId);
    }
    return null;
  }

  // ── Auto-init on park pages ──────────────────────────────────────────────

  function detectPark() {
    var classes = document.body && document.body.className ? document.body.className.split(/\s+/) : [];
    for (var i = 0; i < classes.length; i++) {
      if (PARK_MAP[classes[i]]) return PARK_MAP[classes[i]];
    }
    return null;
  }

  var park = detectPark();
  if (park) {
    // Defer slightly so the demo.js (and thus the generator target select) is
    // already initialised before we fire the page-view event.
    setTimeout(function () { initPageTracking(park); }, 800);
  }

  /**
   * Re-fires the page-view once an ECID is available if the deferred init never
   * reached `/api/events/generator`. Also flushes visible attraction roots that
   * may have crossed the viewport before ECID existed (IntersectionObserver gap).
   */
  function retryPageView() {
    if (!park) return;
    if (!pageViewDeliveredThisDocument) {
      var sent = fireEvent(
        park.id + '.pageView',
        park.name + ' — Page view',
        window.location.pathname,
        {
          public: {
            miralParkId: park.id,
            miralParkDisplayName: park.name,
            miralEventSurface: 'miral-lab-demo',
            miralTrackingSource: 'ecidReady',
          },
        }
      );
      if (sent) pageViewDeliveredThisDocument = true;
    }
    flushVisibleAttractions(park, 'ecidReady');
  }

  window.MiralCrossSite = {
    getState: getState,
    setState: setState,
    getEcid: getEcid,
    fireEvent: fireEvent,
    trackPageView: trackPageView,
    trackAttractionView: trackAttractionView,
    trackTicketIntent: trackTicketIntent,
    trackEmailCapture: trackEmailCapture,
    retryPageView: retryPageView,
    flushVisibleAttractions: function () {
      flushVisibleAttractions(park, 'manual');
    },
    getAdForSlot: getAdForSlot,
    // Kept as a no-op for backward compat — events now route via /api/events/generator
    // which resolves the datastream server-side from targetId presets.
    setDatastreamId: function () {},
    resetState: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    },
  };
})();
