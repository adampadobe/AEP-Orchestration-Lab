/**
 * Journey arbitration — standalone demo (restored from pre–5-tab visualiser logic, commit 17f493f).
 * Weighted signals score candidate journeys; toggles reshuffle the demo ranking per industry.
 */
(function () {
  'use strict';

  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_EDP_INDUSTRY = 'aepEdpIndustry';

  var INDUSTRY_LABEL_UI = {
    retail: 'Retail',
    fsi: 'FSI',
    travel: 'Travel',
    media: 'Media',
    sports: 'Sports',
    telecommunications: 'Telecommunications',
    public: 'Public',
    healthcare: 'Healthcare',
  };

  var INDUSTRY_ORDER = ['retail', 'fsi', 'travel', 'media', 'sports', 'telecommunications', 'public', 'healthcare'];

  var INDUSTRY_ICON_INNER = {
    retail:
      '<circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />',
    fsi:
      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />',
    travel:
      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />',
    media: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" />',
    sports:
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
    telecommunications: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />',
    public:
      '<line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" />',
    healthcare:
      '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .6.3"/><path d="M8 15v1a6 6 0 0 0 12 0v-4"/>',
  };

  function industryIconMarkup(key) {
    var inner = INDUSTRY_ICON_INNER[key] || INDUSTRY_ICON_INNER.media;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        inner +
        '</svg>'
    );
  }

  function migrateIndustryKey(k) {
    if (!k) return 'media';
    var leg = { telco: 'telecommunications', automotive: 'sports' };
    return leg[k] || k;
  }

  function isValidIndustry(k) {
    return INDUSTRY_ORDER.indexOf(k) >= 0;
  }

  function getIndustry() {
    var b = migrateIndustryKey(document.body && document.body.getAttribute('data-dce-industry'));
    if (isValidIndustry(b)) return b;
    return 'media';
  }

  function escColHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  /** @type {Record<string, boolean[]>} */
  var DCE_JOURNEY_ON = {};

  /** Industry packs — telecommunications + sports derived from historical telco / automotive packs (17f493f); public is new. */
  var DCE_JOURNEY_DATA = {
    media: {
      profile: { initials: 'AC', name: 'Alex Chen', meta: 'Premium annual · San Francisco · Age 29' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_journey_value',
      signals: [
        { title: 'Binge weekend streak?', desc: '12h watched · Fri–Sun', icon: '📺', defaultOn: true, boost: [0.28, 0.06, 0.1, 0.14, 0.04] },
        { title: 'Drama genre affinity', desc: 'Top genre 90d = drama', icon: '🎬', defaultOn: true, boost: [0.22, 0.05, 0.04, 0.2, 0.03] },
        { title: 'Kids profile active', desc: 'Family plan · parental controls on', icon: '👨‍👩‍👧', defaultOn: false, boost: [0.04, 0.06, 0.02, 0.08, 0.32] },
        { title: 'Ad-supported tier', desc: 'Upgrade window open', icon: '📣', defaultOn: false, boost: [0.18, 0.24, 0.26, 0.05, 0.02] },
        { title: 'High churn risk', desc: 'Login drop · competitor promo seen', icon: '⚠️', defaultOn: false, boost: [0.05, 0.38, 0.04, 0.06, 0.02] },
      ],
      journeys: [
        { title: 'Upgrade & save', subtitle: 'Annual plan · drama bundle', pill: 'Drama fit +22%', base: 0.72, valueNote: '+0.9 ARPU lift' },
        { title: 'Win-back offer', subtitle: 'Discounted comeback window', pill: 'Churn save +35%', base: 0.55, valueNote: '+0.5 save rate' },
        { title: 'Trial conversion', subtitle: 'Extended trial · card on file', pill: 'Trial +18%', base: 0.58, valueNote: '+0.6 activation' },
        { title: 'Content discovery', subtitle: 'Hero rails · continue watching', pill: 'Engage +12%', base: 0.5, valueNote: '+0.3 hours' },
        { title: 'Family plan pitch', subtitle: 'Add-on seats · kids profile', pill: 'Family +30%', base: 0.48, valueNote: '+0.4 attach' },
      ],
      policy: { title: 'Reached push frequency', desc: 'Daily cap hit (3/3) — email fallback only.', warn: true },
    },
    travel: {
      profile: { initials: 'JM', name: 'Jordan Miles', meta: 'Gold · London hub · Age 41' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_route_value',
      signals: [
        { title: 'Upcoming long-haul?', desc: 'LHR → SFO in 9d · wide-body', icon: '✈️', defaultOn: true, boost: [0.32, 0.06, 0.12, 0.05, 0.08] },
        { title: 'Seat not selected', desc: 'Party of 2 · exit row eligible', icon: '💺', defaultOn: true, boost: [0.26, 0.04, 0.08, 0.14, 0.03] },
        { title: 'Lounge eligible', desc: 'Gold + long-haul', icon: '🛋', defaultOn: false, boost: [0.14, 0.05, 0.28, 0.2, 0.04] },
        { title: 'Family trip', desc: 'Child traveller on PNR', icon: '👪', defaultOn: false, boost: [0.08, 0.22, 0.06, 0.18, 0.1] },
        { title: 'Price-sensitive search', desc: 'Compared 6 fares · 48h', icon: '🔍', defaultOn: false, boost: [0.05, 0.28, 0.04, 0.06, 0.24] },
      ],
      journeys: [
        { title: 'Long-haul ancillaries', subtitle: 'Bags · seats · Wi‑Fi', pill: 'Route +28%', base: 0.74, valueNote: '+£42 ancillary' },
        { title: 'Short-haul bundles', subtitle: 'City breaks · saver stack', pill: 'Leisure +15%', base: 0.62, valueNote: '+£18 bundle' },
        { title: 'Loyalty accelerator', subtitle: 'Tier miles · status boost', pill: 'Gold +20%', base: 0.58, valueNote: '+3k miles' },
        { title: 'Airport retail & parking', subtitle: 'Partner earn', pill: 'Airport +10%', base: 0.45, valueNote: '+£6 retail' },
        { title: 'Partner earn push', subtitle: 'Hotels · car · experiences', pill: 'Partner +8%', base: 0.42, valueNote: '+£4 partner' },
      ],
      policy: { title: 'Contact policy — SMS', desc: 'Transactional only until opt-in marketing.', warn: false },
    },
    retail: {
      profile: { initials: 'ML', name: 'Morgan Lee', meta: 'Platinum · Manchester · Age 32' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_offer_value',
      signals: [
        { title: 'High-intent cart abandon?', desc: '£120 basket · 2h ago', icon: '🛒', defaultOn: true, boost: [0.34, 0.05, 0.22, 0.08, 0.06] },
        { title: 'Loyalty Platinum', desc: '12-mo rolling · early access', icon: '👑', defaultOn: true, boost: [0.12, 0.3, 0.06, 0.14, 0.05] },
        { title: 'Mobile-first sessions', desc: '78% traffic on app', icon: '📱', defaultOn: false, boost: [0.2, 0.08, 0.04, 0.18, 0.1] },
        { title: 'Seasonal campaign match', desc: 'Outerwear browse spike', icon: '🧥', defaultOn: false, boost: [0.06, 0.1, 0.26, 0.2, 0.08] },
        { title: 'Click & collect pending', desc: 'Order ready — not collected', icon: '📦', defaultOn: false, boost: [0.24, 0.04, 0.08, 0.06, 0.12] },
      ],
      journeys: [
        { title: 'Express checkout recovery', subtitle: 'Free delivery · one tap', pill: 'Cart +32%', base: 0.7, valueNote: '+18% recover' },
        { title: 'Loyalty rewards lane', subtitle: 'Points burn · tier gift', pill: 'Tier +25%', base: 0.64, valueNote: '+£12 margin' },
        { title: 'Markdown & clearance', subtitle: 'Matched category sale', pill: 'Promo +20%', base: 0.52, valueNote: '+9% attach' },
        { title: 'Upsell attach path', subtitle: 'Care · warranty · bundle', pill: 'Attach +14%', base: 0.5, valueNote: '+£8 AOV' },
        { title: 'Brand stories & editorial', subtitle: 'Inspire · discover', pill: 'Engage +10%', base: 0.44, valueNote: '+0.4 pages' },
      ],
      policy: { title: 'Email frequency cap', desc: 'Promo weekly limit reached — app only.', warn: true },
    },
    fsi: {
      profile: { initials: 'SR', name: 'Sarah Reynolds', meta: 'Gold tier · London, UK · Age 34' },
      formula: 'score = Σ (attribute_weights × journey_fit) + base_journey_value',
      signals: [
        { title: 'Reduce my mortgage?', desc: 'Rate lock expiring · £320k outstanding', icon: '🏠', defaultOn: true, boost: [0.48, 0.04, 0.02, 0.06, 0.1] },
        { title: 'Checked refinance rates', desc: 'Viewed calculator 2h ago', icon: '📊', defaultOn: true, boost: [0.4, 0.08, 0.05, 0.04, 0.06] },
        { title: 'Improve my rewards?', desc: '£3.2k/mo spend · standard card', icon: '💳', defaultOn: false, boost: [0.05, 0.12, 0.42, 0.06, 0.08] },
        { title: 'Grow my savings?', desc: 'ISA eligible · idle cash', icon: '🌱', defaultOn: false, boost: [0.04, 0.38, 0.06, 0.14, 0.05] },
        { title: 'High churn risk', desc: 'Competitor offer detected', icon: '⚠️', defaultOn: false, boost: [0.06, 0.05, 0.08, 0.06, 0.36] },
      ],
      journeys: [
        { title: 'Mortgage refinance', subtitle: 'Highest margin · rate lock window', pill: 'Refi +40%', base: 0.68, valueNote: '+1.5 margin score' },
        { title: 'Investment advisory', subtitle: 'Wealth · ISA products', pill: 'Wealth +22%', base: 0.62, valueNote: '+1.1 margin score' },
        { title: 'Credit card upgrade', subtitle: 'Rewards · fee tier', pill: 'Spend +18%', base: 0.55, valueNote: '+0.7 interchange' },
        { title: 'Insurance cross-sell', subtitle: 'Home · life wrap', pill: 'Cover +12%', base: 0.48, valueNote: '+0.5 premium' },
        { title: 'Retention & loyalty', subtitle: 'Save offer · service bundle', pill: 'Save +35%', base: 0.45, valueNote: '+0.4 NPS' },
      ],
      policy: { title: 'Reached email contact frequency', desc: 'Weekly cap hit (3/3) — cooldown active.', warn: true },
    },
    telecommunications: {
      profile: { initials: 'SO', name: 'Sam Okonkwo', meta: 'Unlimited mobile · Fibre-ready · Age 28' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_programme_value',
      signals: [
        { title: 'High data usage', desc: 'Near unlimited cap · video heavy', icon: '📶', defaultOn: true, boost: [0.14, 0.08, 0.28, 0.06, 0.1] },
        { title: 'Fibre addressable', desc: 'FTTP live on postcode', icon: '🏠', defaultOn: true, boost: [0.38, 0.06, 0.12, 0.05, 0.04] },
        { title: 'Contract end window', desc: '≤ 60 days · save risk', icon: '⏱', defaultOn: false, boost: [0.06, 0.42, 0.1, 0.08, 0.12] },
        { title: 'Multi-line household', desc: '3 lines · family plan', icon: '👪', defaultOn: false, boost: [0.1, 0.06, 0.18, 0.22, 0.06] },
        { title: 'Open care case', desc: 'Bill dispute · NPS follow-up', icon: '🎧', defaultOn: false, boost: [0.04, 0.36, 0.08, 0.1, 0.14] },
      ],
      journeys: [
        { title: 'Fibre upgrade', subtitle: '1Gb install · self-setup', pill: 'ARPU +24%', base: 0.72, valueNote: '+£18 MRR' },
        { title: 'Mobile save / retention', subtitle: 'Loyalty discount · add-ons', pill: 'Save path +32%', base: 0.58, valueNote: '+0.6 save rate' },
        { title: 'Device trade-in', subtitle: 'Early upgrade · recycle', pill: 'Hardware +15%', base: 0.54, valueNote: '+£9 attach' },
        { title: 'SMB static IP', subtitle: 'Business line · SLA', pill: 'B2B +20%', base: 0.46, valueNote: '+£25 ARPU' },
        { title: 'Roaming & travel pack', subtitle: 'Trip add-on', pill: 'Roaming +10%', base: 0.44, valueNote: '+£6 pack' },
      ],
      policy: { title: 'Marketing consent', desc: 'SMS promos off — in-app only.', warn: false },
    },
    sports: {
      profile: { initials: 'CT', name: 'Chris Taylor', meta: 'Season member · Hospitality interest · Age 36' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_programme_value',
      signals: [
        { title: 'Renewal window open', desc: 'Seat held · payment plan eligible', icon: '🎟️', defaultOn: true, boost: [0.4, 0.1, 0.06, 0.14, 0.05] },
        { title: 'Matchday hospitality lead', desc: 'Corporate box enquiry', icon: '🥂', defaultOn: true, boost: [0.12, 0.42, 0.08, 0.16, 0.04] },
        { title: 'Merch bundle in cart', desc: 'Kit + scarf abandoned', icon: '🛍️', defaultOn: false, boost: [0.06, 0.08, 0.44, 0.12, 0.05] },
        { title: 'Partner / B2B buyer', desc: 'Hospitality package on file', icon: '🏢', defaultOn: false, boost: [0.05, 0.14, 0.06, 0.38, 0.22] },
        { title: 'Broadcast add-on spike', desc: 'Out-of-market games viewed', icon: '📺', defaultOn: false, boost: [0.22, 0.2, 0.04, 0.08, 0.18] },
      ],
      journeys: [
        { title: 'Season renewal push', subtitle: 'Early-bird · seat map', pill: 'Renew +30%', base: 0.7, valueNote: '+12% renewal' },
        { title: 'Matchday upsell', subtitle: 'Parking · F&B · lounge', pill: 'Gameday +25%', base: 0.64, valueNote: '+£28 attach' },
        { title: 'Membership & loyalty', subtitle: 'Tier miles · partner perks', pill: 'Loyalty +22%', base: 0.56, valueNote: '+0.4 visits' },
        { title: 'Merch & retail', subtitle: 'Kit · collect at stadium', pill: 'Retail +14%', base: 0.5, valueNote: '+£18 AOV' },
        { title: 'Partner B2B lane', subtitle: 'Boxes · sponsorship', pill: 'B2B +18%', base: 0.45, valueNote: '+£40k TCV' },
      ],
      policy: { title: 'Out-of-hours contact', desc: 'Calls routed — SMS booking only.', warn: false },
    },
    public: {
      profile: { initials: 'RK', name: 'Riley Kim', meta: 'Reduced fare eligible · Metro account · Age 44' },
      formula: 'score = Σ (signal_weight × programme_fit) + base_service_value',
      signals: [
        { title: 'Income band updated', desc: 'Verified for reduced programmes', icon: '📋', defaultOn: true, boost: [0.34, 0.06, 0.12, 0.08, 0.1] },
        { title: 'Transit commute pattern', desc: '5-day peak usage', icon: '🚇', defaultOn: true, boost: [0.28, 0.08, 0.1, 0.14, 0.04] },
        { title: 'Permit application open', desc: 'Digital queue position 12', icon: '🏛️', defaultOn: false, boost: [0.08, 0.36, 0.06, 0.18, 0.1] },
        { title: 'Benefits re-cert due', desc: '45-day window', icon: '⏱', defaultOn: false, boost: [0.1, 0.1, 0.42, 0.12, 0.06] },
        { title: 'Case worker assigned', desc: 'Housing follow-up', icon: '🏠', defaultOn: false, boost: [0.06, 0.14, 0.08, 0.34, 0.22] },
      ],
      journeys: [
        { title: 'Transit & mobility benefits', subtitle: 'Passes · concessions', pill: 'Transit +28%', base: 0.7, valueNote: '+18% uptake' },
        { title: 'Income-linked programmes', subtitle: 'Grants · fee relief', pill: 'Equity +24%', base: 0.62, valueNote: '+9k households' },
        { title: 'Permit & licensing fast lane', subtitle: 'Digital proof', pill: 'SLA +20%', base: 0.55, valueNote: '−3d median' },
        { title: 'Skills & workforce', subtitle: 'Cohort intake', pill: 'Workforce +16%', base: 0.5, valueNote: '+420 seats' },
        { title: 'Housing support pathway', subtitle: 'Case-managed', pill: 'Housing +32%', base: 0.46, valueNote: '+0.6 resolution' },
      ],
      policy: { title: 'Channel preference', desc: 'SMS limited to transactional — portal for updates.', warn: false },
    },
    healthcare: {
      profile: { initials: 'JE', name: 'Jordan Ellis', meta: 'PPO · Employer HSA · Age 39' },
      formula: 'score = Σ (signal_weight × pathway_fit) + base_care_value',
      signals: [
        { title: 'Virtual visit unused', desc: '2 visits left · plan year', icon: '💻', defaultOn: true, boost: [0.36, 0.08, 0.06, 0.12, 0.1] },
        { title: 'Specialty search spike', desc: 'Cardiology content 3×', icon: '🫀', defaultOn: true, boost: [0.08, 0.4, 0.06, 0.18, 0.05] },
        { title: 'Refill due soon', desc: 'Rx maintenance · 7d', icon: '💊', defaultOn: false, boost: [0.06, 0.06, 0.42, 0.1, 0.08] },
        { title: 'Diabetes care pathway', desc: 'HbA1c due · CM enrolled', icon: '📋', defaultOn: false, boost: [0.1, 0.12, 0.08, 0.38, 0.06] },
        { title: 'Open enrolment window', desc: 'Employer plan selection', icon: '🏢', defaultOn: false, boost: [0.05, 0.06, 0.05, 0.06, 0.4] },
      ],
      journeys: [
        { title: 'Virtual-first care', subtitle: 'Triage · same-week slot', pill: 'Virtual +28%', base: 0.68, valueNote: '+0.8 utilisation' },
        { title: 'Specialty referral assist', subtitle: 'In-network · prior auth', pill: 'Specialty +24%', base: 0.62, valueNote: '+12 days faster' },
        { title: 'Pharmacy adherence', subtitle: 'Mail order · 90d', pill: 'PDC +18%', base: 0.55, valueNote: '+6% adherence' },
        { title: 'Chronic programme', subtitle: 'Coaching · devices', pill: 'CM +32%', base: 0.52, valueNote: '+0.4 engagement' },
        { title: 'Wellness incentive', subtitle: 'Steps · screenings', pill: 'Wellness +14%', base: 0.46, valueNote: '+£40 reward' },
      ],
      policy: { title: 'Sensitive channel guard', desc: 'No SMS for clinical content — app inbox.', warn: true },
    },
  };

  function getJourneyData(ind) {
    var d = DCE_JOURNEY_DATA[ind];
    return d || DCE_JOURNEY_DATA.media;
  }

  function getJourneyOnState(ind, nSignals) {
    var a = DCE_JOURNEY_ON[ind];
    var data = getJourneyData(ind);
    var defs = data.signals;
    if (!a || a.length !== nSignals) {
      a = [];
      for (var i = 0; i < nSignals; i++) {
        a[i] = defs[i] && defs[i].defaultOn === true;
      }
      DCE_JOURNEY_ON[ind] = a;
    }
    return a;
  }

  function computeJourneyScores(ind) {
    var data = getJourneyData(ind);
    var nj = data.journeys.length;
    var st = getJourneyOnState(ind, data.signals.length);
    var out = [];
    for (var j = 0; j < nj; j++) {
      var s = data.journeys[j].base || 0;
      for (var i = 0; i < data.signals.length; i++) {
        if (st[i] && data.signals[i].boost && data.signals[i].boost[j] != null) {
          s += data.signals[i].boost[j];
        }
      }
      out.push(Math.round(s * 100) / 100);
    }
    return out;
  }

  function renderJourneyPanel() {
    var panel = document.getElementById('panel-journey');
    if (!panel) return;
    var ind = getIndustry();
    var data = getJourneyData(ind);
    var scores = computeJourneyScores(ind);
    var st = getJourneyOnState(ind, data.signals.length);

    var rank = [];
    for (var rj = 0; rj < scores.length; rj++) {
      rank.push({ ix: rj, score: scores[rj], j: data.journeys[rj] });
    }
    rank.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.ix - b.ix;
    });

    var prof = document.getElementById('dce-journey-profile-mount');
    if (prof) {
      prof.innerHTML =
        '<div class="dce-journey-avatar" aria-hidden="true">' +
        escColHtml(data.profile.initials) +
        '</div>' +
        '<div class="dce-journey-profile-text">' +
        '<div class="dce-journey-profile-name">' +
        escColHtml(data.profile.name) +
        '</div>' +
        '<div class="dce-journey-profile-meta">' +
        escColHtml(data.profile.meta) +
        '</div></div>';
    }

    var sigMount = document.getElementById('dce-journey-signals-mount');
    if (sigMount) {
      var sh = '';
      for (var si = 0; si < data.signals.length; si++) {
        var sg = data.signals[si];
        var on = !!st[si];
        sh +=
          '<button type="button" class="dce-journey-signal card' +
          (on ? ' is-on' : '') +
          '" data-dce-journey-signal="' +
          si +
          '">' +
          '<span class="dce-journey-signal-ico" aria-hidden="true">' +
          escColHtml(sg.icon) +
          '</span>' +
          '<span class="dce-journey-signal-body">' +
          '<span class="dce-journey-signal-title">' +
          escColHtml(sg.title) +
          '</span>' +
          '<span class="dce-journey-signal-desc">' +
          escColHtml(sg.desc) +
          '</span></span>' +
          '<span class="dce-journey-signal-switch" aria-hidden="true"></span>' +
          '</button>';
      }
      sigMount.innerHTML = sh;
    }

    var pol = document.getElementById('dce-journey-policy-mount');
    if (pol && data.policy) {
      pol.innerHTML =
        '<div class="dce-journey-policy card' +
        (data.policy.warn ? ' dce-journey-policy--warn' : '') +
        '">' +
        '<span class="dce-journey-policy-ico" aria-hidden="true">' +
        (data.policy.warn ? '⛔' : 'ℹ️') +
        '</span>' +
        '<div class="dce-journey-policy-text">' +
        '<div class="dce-journey-policy-title">' +
        escColHtml(data.policy.title) +
        '</div>' +
        '<div class="dce-journey-policy-desc">' +
        escColHtml(data.policy.desc) +
        '</div></div></div>';
      pol.style.display = '';
    } else if (pol) {
      pol.innerHTML = '';
    }

    var fm = document.getElementById('dce-journey-formula');
    if (fm) fm.textContent = data.formula;

    var rm = document.getElementById('dce-journey-rank-mount');
    if (rm) {
      var rh = '';
      for (var ri = 0; ri < rank.length; ri++) {
        var row = rank[ri];
        var jj = row.j;
        var isWin = ri === 0;
        rh +=
          '<div class="dce-journey-card card' +
          (isWin ? ' dce-journey-card--winner' : '') +
          '" data-dce-journey-index="' +
          row.ix +
          '">' +
          '<div class="dce-journey-card-top">' +
          '<span class="dce-journey-card-num" aria-hidden="true">' +
          (ri + 1) +
          '</span>' +
          '<div class="dce-journey-card-main">' +
          '<div class="dce-journey-card-title">' +
          escColHtml(jj.title) +
          '</div>' +
          '<div class="dce-journey-card-sub">' +
          escColHtml(jj.subtitle) +
          '</div>' +
          (jj.pill ? '<span class="dce-journey-pill">' + escColHtml(jj.pill) + '</span>' : '') +
          '</div>' +
          '<div class="dce-journey-card-score-block">' +
          '<div class="dce-journey-card-score">' +
          escColHtml(String(row.score)) +
          '</div>' +
          '<div class="dce-journey-card-value">' +
          escColHtml(jj.valueNote || '') +
          '</div></div></div>' +
          (isWin
            ? '<div class="dce-journey-card-hint">Highest score wins — toggle signals on the left to reshuffle.</div>'
            : '') +
          '</div>';
      }
      rm.innerHTML = rh;
    }
  }

  function bindJourneyPanel() {
    var panel = document.getElementById('panel-journey');
    if (!panel || panel.getAttribute('data-dce-journey-bound') === '1') return;
    panel.setAttribute('data-dce-journey-bound', '1');
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.dce-journey-signal');
      if (!btn || !panel.contains(btn)) return;
      e.preventDefault();
      var raw = btn.getAttribute('data-dce-journey-signal');
      var ix = raw == null ? NaN : parseInt(raw, 10);
      if (isNaN(ix)) return;
      var ind = getIndustry();
      var data = getJourneyData(ind);
      var st = getJourneyOnState(ind, data.signals.length);
      st[ix] = !st[ix];
      renderJourneyPanel();
    });
  }

  function dceJaBuildIndustryDropdown() {
    var menu = document.getElementById('dce-ja-industry-menu');
    if (!menu || menu.getAttribute('data-dce-built') === '1') return;
    menu.setAttribute('data-dce-built', '1');
    menu.innerHTML = '';
    INDUSTRY_ORDER.forEach(function (key) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      btn.className = 'dce-edp-dropdown-item';
      btn.setAttribute('data-dce-industry', key);
      var ico = document.createElement('span');
      ico.className = 'dce-edp-menu-ico';
      ico.innerHTML = industryIconMarkup(key);
      var lab = document.createElement('span');
      lab.className = 'dce-edp-menu-label';
      lab.textContent = INDUSTRY_LABEL_UI[key];
      btn.appendChild(ico);
      btn.appendChild(lab);
      menu.appendChild(btn);
    });
  }

  function dceJaSyncIndustryChrome(key) {
    var ico = document.getElementById('dce-ja-industry-ico');
    if (ico) ico.innerHTML = industryIconMarkup(key);
    document.querySelectorAll('#dce-ja-industry-menu .dce-edp-dropdown-item').forEach(function (b) {
      var on = b.getAttribute('data-dce-industry') === key;
      b.classList.toggle('dce-edp-dropdown-item--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function setIndustry(key, persist) {
    key = migrateIndustryKey(key);
    if (!isValidIndustry(key)) key = 'media';
    try {
      document.body.setAttribute('data-dce-industry', key);
      if (persist !== false) {
        localStorage.setItem(LS_INDUSTRY, key);
        localStorage.setItem(LS_EDP_INDUSTRY, key);
      }
    } catch (e) {}
    var pgLbl = document.getElementById('dce-ja-industry-label');
    if (pgLbl) pgLbl.textContent = INDUSTRY_LABEL_UI[key] || INDUSTRY_LABEL_UI.media;
    dceJaSyncIndustryChrome(key);
    renderJourneyPanel();
  }

  function bindIndustryUi() {
    var root = document.getElementById('dceVizRoot');
    if (!root || root.getAttribute('data-dce-ja-bound') === '1') return;
    root.setAttribute('data-dce-ja-bound', '1');
    dceJaBuildIndustryDropdown();

    var ddBtn = document.getElementById('dce-ja-industry-btn');
    var ddMenu = document.getElementById('dce-ja-industry-menu');
    if (ddBtn && ddMenu) {
      function closeIndustryMenu() {
        ddMenu.hidden = true;
        ddBtn.setAttribute('aria-expanded', 'false');
      }
      ddBtn.addEventListener('click', function (e) {
        e.preventDefault();
        ddMenu.hidden = !ddMenu.hidden;
        ddBtn.setAttribute('aria-expanded', ddMenu.hidden ? 'false' : 'true');
      });
      ddMenu.querySelectorAll('[data-dce-industry]').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.preventDefault();
          var key = migrateIndustryKey(item.getAttribute('data-dce-industry'));
          if (key && isValidIndustry(key)) setIndustry(key, true);
          closeIndustryMenu();
        });
      });
      document.addEventListener('click', function (e) {
        if (!ddMenu.hidden && ddBtn && !ddBtn.contains(e.target) && !ddMenu.contains(e.target)) {
          closeIndustryMenu();
        }
      });
    }
  }

  function initIndustry() {
    var key = 'media';
    try {
      var edp = migrateIndustryKey(localStorage.getItem(LS_EDP_INDUSTRY));
      var legacy = migrateIndustryKey(localStorage.getItem(LS_INDUSTRY));
      if (isValidIndustry(edp)) key = edp;
      else if (isValidIndustry(legacy)) key = legacy;
    } catch (e) {}
    setIndustry(key, false);
  }

  function boot() {
    if (!document.getElementById('dceVizRoot')) return;
    bindIndustryUi();
    bindJourneyPanel();
    initIndustry();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
