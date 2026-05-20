/**
 * Miral Yas Island — Cross-Site CDP Event Tracking
 *
 * Auto-initialises on Ferrari World, WB World and SeaWorld demo pages.
 * Stores a lightweight behaviour state in localStorage so the Facebook demo
 * page can read it and inject the right retargeting ad.
 *
 * Usage (HTML pages):
 *   Add data-miral-attraction="fw:formula-rossa" data-miral-attraction-name="Formula Rossa"
 *   to sections you want tracked via IntersectionObserver.
 *   Add data-miral-ticket="single-day" to Buy Tickets buttons.
 *   Load this script AFTER the park-specific demo.js.
 *
 * Facebook page reads window.MiralCrossSite.getAdForSlot(slotId) to obtain
 * brand-personalised ad HTML for each slot.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'miralCrossSiteState';

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

  function getEcid() {
    for (var i = 0; i < ECID_KEYS.length; i++) {
      try {
        var v = localStorage.getItem(ECID_KEYS[i]);
        if (v) return v;
      } catch (e) { /* noop */ }
    }
    return null;
  }

  function getGeneratorTarget() {
    var sel = document.getElementById('generatorTarget');
    if (!sel || !sel.value) return null;
    return { id: sel.value };
  }

  // ── Event firing ─────────────────────────────────────────────────────────

  function fireEvent(eventType, viewName, viewUrl, extra) {
    var ecid = getEcid();
    var target = getGeneratorTarget();
    if (!target || !ecid) return; // silently no-op until Tags is injected

    var body = {
      targetId: target.id,
      eventType: eventType,
      viewName: viewName || document.title,
      viewUrl: viewUrl || window.location.pathname,
      channel: 'web',
      public: {},
      xdmTenantKey: '_demoemea',
      identityMapEcidKey: 'ECID',
      ecid: ecid,
    };
    if (extra && extra.email) body.email = extra.email;

    fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () {});
  }

  // ── Behaviour tracking ───────────────────────────────────────────────────

  function trackPageView(parkId, parkName) {
    var s = getState();
    var sites = s.sitesVisited || [];
    if (sites.indexOf(parkId) === -1) {
      sites = sites.concat([parkId]);
      setState({ sitesVisited: sites });
    }
    fireEvent(
      'miral.' + parkId + '.pageView',
      parkName + ' — page view',
      window.location.pathname
    );
  }

  function trackAttractionView(parkId, attractionId, attractionName) {
    var s = getState();
    var interests = s.attractionInterests || [];
    if (interests.indexOf(attractionId) === -1) {
      interests = interests.concat([attractionId]);
      var topBrand = resolveTopBrand(interests);
      setState({ attractionInterests: interests, topBrand: topBrand });
    }
    fireEvent(
      'miral.' + parkId + '.attractionView',
      attractionName,
      window.location.pathname + '#' + attractionId
    );
  }

  function trackTicketIntent(parkId, ticketType) {
    var s = getState();
    var intents = s.ticketIntentSites || [];
    if (intents.indexOf(parkId) === -1) intents = intents.concat([parkId]);
    setState({ ticketIntentSites: intents, lastTicketIntentBrand: parkId });
    fireEvent(
      'miral.' + parkId + '.ticketIntent',
      ticketType + ' ticket — purchase intent',
      window.location.pathname
    );
  }

  function trackEmailCapture(parkId, email) {
    setState({ emailCaptured: true, capturedEmail: email, emailCaptureSource: parkId });
    var ecid = getEcid();
    var target = getGeneratorTarget();
    if (!target || !ecid) return;

    var body = {
      targetId: target.id,
      eventType: 'miral.' + parkId + '.emailCapture',
      viewName: 'Email capture — ' + parkId,
      viewUrl: window.location.pathname,
      channel: 'web',
      public: {},
      xdmTenantKey: '_demoemea',
      identityMapEcidKey: 'ECID',
      ecid: ecid,
      email: email,
    };
    fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () {});
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

  // ── Page-level initialisation ────────────────────────────────────────────

  function initPageTracking(park) {
    trackPageView(park.id, park.name);

    // IntersectionObserver on [data-miral-attraction] elements
    if (typeof IntersectionObserver !== 'undefined') {
      var seen = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var aId = el.getAttribute('data-miral-attraction');
          if (aId && !seen[aId]) {
            seen[aId] = true;
            io.unobserve(el);
            var aName = el.getAttribute('data-miral-attraction-name') || aId;
            trackAttractionView(park.id, aId, aName);
          }
        });
      }, { threshold: 0.3 });

      document.querySelectorAll('[data-miral-attraction]').forEach(function (el) {
        io.observe(el);
      });
    }

    // Click listeners on [data-miral-ticket] elements
    document.querySelectorAll('[data-miral-ticket]').forEach(function (el) {
      el.addEventListener('click', function () {
        trackTicketIntent(park.id, el.getAttribute('data-miral-ticket') || 'single-day');
      });
    });

    // WB World newsletter email capture
    if (park.id === 'wbworld') {
      var newsletter = document.querySelector('.newsletter__form');
      if (newsletter) {
        newsletter.addEventListener('submit', function () {
          var emailInput = newsletter.querySelector('input[type="email"]');
          var email = emailInput && emailInput.value.trim();
          if (email) trackEmailCapture('wbworld', email);
        });
      }
    }
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
      avatar: 'https://static.myconnect.ae/-/media/yasconnect/project/wbw/header/wbw_logo_footer.png',
      brand: 'Warner Bros. World™ Abu Dhabi',
      text: 'You left the magic behind! Come back and step into <strong>Gotham City, Bedrock and more</strong> — exclusive offer for returning visitors: <strong>20% off Single Day Tickets</strong> this weekend.',
      img: 'https://static.myconnect.ae/-/media/yasconnect/project/wbw/offers/etihad/warner_gotham_etihad.jpg',
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
      avatar: 'https://static.myconnect.ae/-/media/yasconnect/project/wbw/header/wbw_logo_footer.png',
      brand: 'Warner Bros. World™ Abu Dhabi',
      text: 'Your exclusive offer is waiting! You showed interest in <strong>Warner Bros. World™</strong> on Yas Island. Complete your booking now — your personalised deal expires soon.',
      img: 'https://static.myconnect.ae/-/media/yasconnect/project/wbw/productdetail/vip-experience/wbw_vip_card.jpg',
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
      avatar: 'https://static.myconnect.ae/-/media/yasconnect/project/fwad/common/header/fwad_new_header.png?w=160',
      brand: 'Ferrari World Abu Dhabi',
      text: 'The world\'s fastest roller coaster is calling. <strong>Formula Rossa</strong> hits 240 km/h — experience it at Ferrari World Abu Dhabi, Yas Island. Ready to feel the rush?',
      img: 'https://static.myconnect.ae/-/media/yasconnect/project/fwad/home/thumbnails/formula-rossa-thumbnail.jpg',
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
      avatar: 'https://static.myconnect.ae/-/media/yasconnect/project/swad/common/header/english-color-new.png',
      brand: 'SeaWorld Abu Dhabi',
      text: 'Get up close with <strong>dolphins, orcas and penguins</strong> at SeaWorld Abu Dhabi — the world\'s first SeaWorld outside the US. Book a Dolphin Discovery experience today.',
      img: 'https://static.myconnect.ae/-/media/yasconnect/project/swad/20230724/dolphinecounter1-medium.jpg',
      imgAlt: 'Dolphin Discovery — SeaWorld Abu Dhabi',
      domain: 'seaworldabudhabi.com',
      headline: 'SeaWorld Abu Dhabi — Book an Encounter',
      sub: 'One Ocean. Countless discoveries.',
      cta: 'Explore now',
      slotLabel: slotLabel,
    });
  }

  // Miral cross-sell rail ad — promotes a different park
  function buildMiralCrossSellRailAd(sites, topBrand, slotLabel) {
    // Promote the park the user hasn't visited yet (or visited least)
    var promote = 'ferrariworld';
    if (sites.indexOf('ferrariworld') !== -1 && sites.indexOf('wbworld') === -1) promote = 'wbworld';
    else if (sites.indexOf('wbworld') !== -1 && sites.indexOf('seaworld') === -1) promote = 'seaworld';
    else if (topBrand === 'wbworld') promote = 'seaworld';
    else if (topBrand === 'ferrariworld') promote = 'wbworld';

    var opts = {
      ferrariworld: {
        img: 'https://static.myconnect.ae/-/media/yasconnect/project/fwad/home/thumbnails/formula-rossa-thumbnail.jpg',
        imgAlt: 'Formula Rossa — Ferrari World',
        title: 'Ferrari World Abu Dhabi',
        sub: 'ferrariworldabudhabi.com · World\'s fastest coaster',
        cta: 'Explore',
      },
      wbworld: {
        img: 'https://static.myconnect.ae/-/media/yasconnect/project/wbw/home/wbw-friends-and-family-746x421-1.jpg',
        imgAlt: 'Warner Bros. World Yas Island',
        title: 'Warner Bros. World™',
        sub: 'wbworldabudhabi.com · 6 immersive lands',
        cta: 'Explore',
      },
      seaworld: {
        img: 'https://static.myconnect.ae/-/media/yasconnect/project/swad/home/sw-encounters.jpg',
        imgAlt: 'SeaWorld Abu Dhabi encounters',
        title: 'SeaWorld Abu Dhabi',
        sub: 'seaworldabudhabi.com · Dolphin encounters',
        cta: 'Explore',
      },
    };
    var o = opts[promote] || opts.wbworld;
    return buildRailAd({ img: o.img, imgAlt: o.imgAlt, title: o.title, sub: o.sub, cta: o.cta, slotLabel: slotLabel });
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

  window.MiralCrossSite = {
    getState: getState,
    setState: setState,
    getEcid: getEcid,
    fireEvent: fireEvent,
    trackPageView: trackPageView,
    trackAttractionView: trackAttractionView,
    trackTicketIntent: trackTicketIntent,
    trackEmailCapture: trackEmailCapture,
    getAdForSlot: getAdForSlot,
    resetState: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    },
  };
})();
