/**
 * Decisioning visualiser — interactive ranking methods (decisioning-visualiser.html).
 * Industry context: media (default), travel, retail, FSI, or telco (examples + copy).
 */
(function () {
  'use strict';

  var LS_INDUSTRY = 'dceVizIndustry';

  function getIndustry() {
    var b = document.body && document.body.getAttribute('data-dce-industry');
    if (b === 'travel' || b === 'retail' || b === 'fsi' || b === 'telco') return b;
    return 'media';
  }

  // ── TAB NAVIGATION ────────────────────────────────────────────────────────
  function showPanel(id) {
    var root = document.getElementById('dceVizRoot');
    if (!root) return;
    var panel = document.getElementById('dceViz-panel-' + id);
    if (!panel) return;
    var order = ['overview', 'priority', 'formula', 'ai', 'experiment'];
    var idx = order.indexOf(id);
    if (idx < 0) return;

    root.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    root.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    panel.classList.add('active');

    var btns = root.querySelectorAll('.tab-btn');
    if (btns[idx]) btns[idx].classList.add('active');

    var sec = document.getElementById('decisioning-visualiser');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.dceVizShowPanel = showPanel;

  function bindVizRootClicks() {
    var root = document.getElementById('dceVizRoot');
    if (!root || root.getAttribute('data-dce-viz-bound') === '1') return;
    root.setAttribute('data-dce-viz-bound', '1');
    root.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.tab-btn');
      if (tab && root.contains(tab)) {
        e.preventDefault();
        var pid = tab.getAttribute('data-dce-panel');
        if (pid) showPanel(pid);
        return;
      }
      var card = e.target.closest && e.target.closest('a.overview-card');
      if (card && root.contains(card)) {
        e.preventDefault();
        var cid = card.getAttribute('data-dce-panel');
        if (cid) showPanel(cid);
      }
    });
  }
  bindVizRootClicks();

  // ── INDUSTRY CONFIG ─────────────────────────────────────────────────────────
  var PRIORITY_MEDIA = [
    { name: '🎬 Annual Plan — 2 months free', sub: 'Highest value · Long-term commitment', id: 's1' },
    { name: '📺 Premium HD — First month £4.99', sub: 'Mid-tier entry point · Monthly rolling', id: 's2' },
    { name: '🔔 30-Day Free Trial', sub: 'Low commitment · Acquisition offer', id: 's3' },
  ];
  var PRIORITY_TRAVEL = [
    { name: '✈️ Extra legroom — long-haul bundle', sub: 'Highest margin · Limited inventory', id: 's1' },
    { name: '🧳 Checked bags — 2×23kg', sub: 'Popular ancillary · mid route yield', id: 's2' },
    { name: '⭐ Priority boarding — Group 1', sub: 'Broad eligibility · conversion driver', id: 's3' },
  ];
  var PRIORITY_RETAIL = [
    { name: '🛍️ Cart VIP — free express delivery', sub: 'Highest margin · conversion on big-ticket baskets', id: 's1' },
    { name: '🏷️ Loyalty 3× points — this weekend', sub: 'Mid-tier · drives app & repeat visits', id: 's2' },
    { name: '💳 BNPL 0% — 12 months on electrics', sub: 'Broad reach · reduces basket abandonment', id: 's3' },
  ];
  var PRIORITY_FSI = [
    { name: '🏦 Fixed-rate mortgage — 4.19% 5yr', sub: 'Strategic priority · high lifetime value', id: 's1' },
    { name: '💳 Balance-transfer card — 0% 24 months', sub: 'Acquisition · broad eligibility', id: 's2' },
    { name: '📈 Stocks & Shares ISA — £150 switching bonus', sub: 'Mid-term savings · cross-sell', id: 's3' },
  ];
  var PRIORITY_TELCO = [
    { name: '📱 5G Unlimited Plus — roaming & eSIM', sub: 'Highest ARPU · strategic mobile growth', id: 's1' },
    { name: '🏠 Fibre Max 1Gbps — mesh Wi‑Fi included', sub: 'Home broadband · acquisition & churn save', id: 's2' },
    { name: '🧑‍💼 Business multi-line — static IP & SD‑WAN trial', sub: 'SMB connectivity · B2B attach', id: 's3' },
  ];

  var FORMULA_MEDIA = [
    { name: 'Drama Series — Annual Plan', category: 'drama', baseScore: 75, expiresIn: 20 },
    { name: 'Documentary Hub — Monthly', category: 'documentary', baseScore: 85, expiresIn: 36 },
    { name: 'Kids & Family — Annual Plan', category: 'kids', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_TRAVEL = [
    { name: 'Business cabin upgrade — long-haul', category: 'business', baseScore: 75, expiresIn: 20 },
    { name: 'City break saver — short-haul bundle', category: 'leisure', baseScore: 85, expiresIn: 36 },
    { name: 'Family row + bags — 4 seats', category: 'family', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_RETAIL = [
    { name: 'Member exclusive — extra 20% off electrics', category: 'member', baseScore: 75, expiresIn: 20 },
    { name: 'Premium beauty bundle — gift with purchase', category: 'premium', baseScore: 85, expiresIn: 36 },
    { name: 'Value aisle flash — household essentials', category: 'value', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_FSI = [
    { name: 'Wealth — advisory portfolio review', category: 'wealth', baseScore: 75, expiresIn: 20 },
    { name: 'Everyday — cashback current account', category: 'everyday', baseScore: 85, expiresIn: 36 },
    { name: 'Business banking — fee-free 12 months', category: 'smb', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_TELCO = [
    { name: 'Mobile — 5G device + unlimited bundle', category: 'mobile', baseScore: 75, expiresIn: 20 },
    { name: 'Home & fibre — gigabit + mesh upgrade', category: 'home', baseScore: 85, expiresIn: 36 },
    { name: 'Business lines — multi-line + static IP pack', category: 'smb', baseScore: 78, expiresIn: 10 },
  ];

  var offers = PRIORITY_MEDIA.slice();
  var formulaOffers = FORMULA_MEDIA.slice();

  var profilesMedia = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Maya streams 20+ hours/month — she already loves the product. High engagement signals low price-sensitivity. The model predicts she\'ll commit to an annual plan if anchored with the "2 months free" value framing. A free trial would be wasted on someone who\'s already sold.',
      ranks: [
        { name: 'Annual Plan — 2 months free', why: 'High engagement → ready to commit long-term', conf: 92 },
        { name: 'Premium HD — Monthly', why: 'Fallback if annual feels like too much', conf: 71 },
        { name: '30-Day Free Trial', why: 'Low relevance — she already uses the free tier heavily', conf: 34 },
        { name: 'Family Plan — 3 screens', why: 'No multi-user signals in her behaviour', conf: 18 },
        { name: 'Student Discount Plan', why: 'Age & usage profile doesn\'t match', conf: 9 },
        { name: '7-Day Free Trial — No card required', why: 'Too short — high engager needs commitment framing', conf: 6 },
        { name: 'Monthly Plan — Cancel anytime', why: 'Annual offer dominates; monthly adds little incremental value', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Marcus watches infrequently and primarily uses a desktop browser — a signal of passive intent. He\'s never clicked a subscription prompt before. The model predicts he needs a low-stakes entry point with no credit card friction. Long-term commitment items will likely cause drop-off.',
      ranks: [
        { name: '7-Day Free Trial — No card required', why: 'Zero friction → matches low-commitment signals', conf: 87 },
        { name: 'Monthly Plan — Cancel anytime', why: 'Short commitment horizon fits his usage pattern', conf: 64 },
        { name: 'Student Discount Plan', why: 'Price sensitivity signal, though age uncertain', conf: 41 },
        { name: 'Annual Plan — 2 months free', why: 'Too long a commitment for passive viewer', conf: 22 },
        { name: 'Family Plan — 3 screens', why: 'Single-device usage — no multi-screen need', conf: 8 },
        { name: '30-Day Free Trial', why: 'Longer trial unlikely to convert passive user', conf: 5 },
        { name: 'Premium HD — Monthly', why: 'Price point too high for low-intent profile', conf: 3 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> The García household streams across 3 devices simultaneously, with both kids and adult content. This is the clearest signal for a family plan. The model has seen this pattern convert at 2.4× the rate of individual plans for households with similar multi-device behaviour.',
      ranks: [
        { name: 'Family Plan — 3 screens', why: 'Multi-device usage is the #1 conversion predictor', conf: 94 },
        { name: 'Annual Plan — 2 months free', why: 'High engagement household justifies annual savings', conf: 68 },
        { name: 'Premium HD — Monthly', why: 'Good fallback if family plan price is a barrier', conf: 45 },
        { name: '30-Day Free Trial', why: 'Already active — trial doesn\'t add perceived value', conf: 21 },
        { name: '7-Day Free Trial — No card required', why: 'Too short for a household to evaluate properly', conf: 11 },
        { name: 'Monthly Plan — Cancel anytime', why: 'Family needs multi-screen, not flexibility', conf: 7 },
        { name: 'Student Discount Plan', why: 'Household profile doesn\'t match student segment', conf: 2 },
      ],
    },
  ];

  var profilesTravel = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Alex is Gold tier with 40+ segments/year and always books business on long-haul. The model predicts seat and cabin upsells over bags — time savings and comfort dominate. A generic “extra bag” offer would underperform.',
      ranks: [
        { name: 'Business cabin upgrade — LHR→JFK', why: 'Tier + route history → highest uplift probability', conf: 93 },
        { name: 'Extra legroom bundle', why: 'Strong secondary for overnight flights', conf: 76 },
        { name: 'Priority security + lounge pass', why: 'Matches business traveller pain points', conf: 58 },
        { name: 'Wi‑Fi day pass', why: 'Nice add-on; lower incremental revenue', conf: 31 },
        { name: 'Checked bag bundle', why: 'Usually included in biz — weaker fit', conf: 22 },
        { name: 'Family row package', why: 'Solo traveller profile', conf: 9 },
        { name: 'Travel insurance add-on', why: 'Low propensity from past purchases', conf: 5 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Sam books leisure rarely and compares on price. First long-haul in years — the model favours low-friction ancillaries (bags, standard seat) before premium upsells. Pushing business class would likely abandon the funnel.',
      ranks: [
        { name: 'Checked bag bundle — save vs airport', why: 'Price-sensitive · clear value', conf: 88 },
        { name: 'Standard seat selection', why: 'Reduces anxiety without big spend', conf: 67 },
        { name: 'Meal preorder discount', why: 'Small upsell aligned to budget trip', conf: 42 },
        { name: 'Priority boarding', why: 'Nice-to-have after core needs', conf: 28 },
        { name: 'Business cabin upgrade', why: 'High ticket — poor fit for profile', conf: 14 },
        { name: 'Lounge day pass', why: 'Luxury step too far for this trip', conf: 8 },
        { name: 'Travel insurance', why: 'Often deferred until later in path', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> The Nguyens travel as a family in peak season with a connecting itinerary. The model prioritises seated-together and bag bundles over individual upgrades — group cohesion is the strongest predictor of ancillary uptake here.',
      ranks: [
        { name: 'Family row + bags — 4 seats', why: 'Household + kids → #1 predictor for this segment', conf: 95 },
        { name: 'Priority boarding — Group 2 family', why: 'Board together · reduce stress', conf: 72 },
        { name: 'Meal bundle — kids', why: 'Aligned to family trip context', conf: 48 },
        { name: 'Extra legroom single seat', why: 'Weaker — family books as a unit', conf: 19 },
        { name: 'Business upgrade — one segment', why: 'Uneven value across party', conf: 11 },
        { name: 'Wi‑Fi pass', why: 'Secondary after seating resolved', conf: 7 },
        { name: 'Lounge access', why: 'Short connection — lower priority', conf: 3 },
      ],
    },
  ];

  var profilesRetail = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Jordan is Platinum loyalty with high app engagement and basket values over £120. The model predicts member-only and premium bundles over generic clearance — price sensitivity is low; recognition and exclusivity drive conversion.',
      ranks: [
        { name: 'Member exclusive — extra 20% off electrics', why: 'Tier + electronics browse history → strongest fit', conf: 93 },
        { name: 'Premium beauty bundle — gift with purchase', why: 'Cross-category affinity from past orders', conf: 76 },
        { name: 'Express delivery — next-day slot', why: 'Convenience matches high-intent checkout', conf: 58 },
        { name: 'Value aisle flash — household essentials', why: 'Lower margin vs member tier offers', conf: 31 },
        { name: 'Clearance apparel — extra 25% at checkout', why: 'Brand mismatch vs usual basket', conf: 22 },
        { name: 'Kids back-to-school bundle', why: 'No kids’ categories in profile', conf: 9 },
        { name: 'Subscription first month — half price', why: 'Already on paid tier — weak incremental', conf: 5 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Riley abandons carts often and only converts on promo or free shipping. The model favours value aisle and BNPL-style framing before premium beauty — luxury upsells would likely bounce.',
      ranks: [
        { name: 'Value aisle flash — household essentials', why: 'Price-led · clear savings message', conf: 88 },
        { name: 'BNPL 0% — 12 months on electrics', why: 'Reduces sticker shock on big-ticket', conf: 67 },
        { name: 'Clearance apparel — extra 25% at checkout', why: 'Deal seeker profile', conf: 42 },
        { name: 'Express delivery — next-day slot', why: 'Only after basket value clears threshold', conf: 28 },
        { name: 'Premium beauty bundle — gift with purchase', why: 'Premium step — poor fit for tight budget', conf: 14 },
        { name: 'Member exclusive — extra 20% off electrics', why: 'Needs login friction — weaker for guest', conf: 8 },
        { name: 'Subscription first month — half price', why: 'Commitment aversion in segment', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> The Parkers shop weekly for a household of five with recurring grocery and school lists. The model prioritises bulk value and family bundles over single-SKU premium SKUs.',
      ranks: [
        { name: 'Kids back-to-school bundle', why: 'Household + kids categories → top predictor', conf: 95 },
        { name: 'Value aisle flash — household essentials', why: 'Bulk buy pattern · high basket overlap', conf: 72 },
        { name: 'Express delivery — next-day slot', why: 'Slot booking reduces trip stress', conf: 48 },
        { name: 'Member exclusive — extra 20% off electrics', why: 'Weaker — electronics not core for this trip', conf: 19 },
        { name: 'Premium beauty bundle — gift with purchase', why: 'Single-SKU focus vs basket mission', conf: 11 },
        { name: 'BNPL 0% — 12 months on electrics', why: 'Deferred for grocery-heavy shop', conf: 7 },
        { name: 'Clearance apparel — extra 25% at checkout', why: 'Secondary to school list', conf: 3 },
      ],
    },
  ];

  var profilesFSI = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Elena is a private-banking client with investable assets above £750k and regular advisory meetings. The model predicts wealth and structured products over mass-market cards — regulatory fit and relationship depth dominate.',
      ranks: [
        { name: 'Wealth — advisory portfolio review', why: 'Segment + AUM → strongest predicted uptake', conf: 94 },
        { name: 'Credit card — travel rewards', why: 'Premium spend pattern · aligns to lifestyle', conf: 71 },
        { name: 'Home insurance — multi-policy discount', why: 'Cross-hold opportunity from mortgage data', conf: 52 },
        { name: 'Everyday — cashback current account', why: 'Weaker — already on packaged current account', conf: 28 },
        { name: 'Business banking — fee-free 12 months', why: 'Solo profile — no SMB signals', conf: 14 },
        { name: 'Personal loan — 5.9% representative APR', why: 'Low debt appetite in file', conf: 9 },
        { name: 'Junior ISA — £25 top-up bonus', why: 'No dependents flagged in household', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Chris uses the mobile app weekly for balance checks and has one direct debit — a classic mass-market profile. The model favours everyday cashback and balance-transfer nudges before wealth propositions that would feel mis-targeted.',
      ranks: [
        { name: 'Everyday — cashback current account', why: 'Salary-in pattern · everyday banking fit', conf: 89 },
        { name: 'Balance-transfer card — 0% 24 months', why: 'Revolving balance signal in bureau summary', conf: 68 },
        { name: 'Personal loan — 5.9% representative APR', why: 'Consolidation intent from browse', conf: 41 },
        { name: 'Stocks & Shares ISA — £150 switching bonus', why: 'Investment curiosity but lower priority', conf: 24 },
        { name: 'Wealth — advisory portfolio review', why: 'Wealth threshold not met — poor fit', conf: 11 },
        { name: 'Business banking — fee-free 12 months', why: 'No business account or turnover signals', conf: 6 },
        { name: 'Credit card — travel rewards', why: 'Fee sensitivity vs rewards value', conf: 3 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Miguel runs a limited company with a business current account and regular card spend on software and travel. The model prioritises SMB banking and expense-friendly cards over retail ISA offers.',
      ranks: [
        { name: 'Business banking — fee-free 12 months', why: 'Ltd co. + BCA activity → top predictor', conf: 93 },
        { name: 'Credit card — travel rewards', why: 'Expense volume · reclaim-friendly categories', conf: 74 },
        { name: 'Personal loan — 5.9% representative APR', why: 'Equipment financing intent from search', conf: 46 },
        { name: 'Everyday — cashback current account', why: 'Secondary — business wallet already primary', conf: 21 },
        { name: 'Wealth — advisory portfolio review', why: 'AUM below private threshold', conf: 12 },
        { name: 'Balance-transfer card — 0% 24 months', why: 'Lower revolving need on business profile', conf: 7 },
        { name: 'Junior ISA — £25 top-up bonus', why: 'Irrelevant to company context', conf: 2 },
      ],
    },
  ];

  var profilesTelco = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Priya burns 40GB+/month with roaming and sports streaming on 5G. The model predicts handset upgrades and unlimited tiers over home fibre upsells — she’s rarely on Wi‑Fi during the day.',
      ranks: [
        { name: '5G Unlimited Plus — roaming & eSIM', why: 'Data volume + roaming events → strongest fit', conf: 94 },
        { name: 'International roaming pass — 30 days', why: 'Frequent EU/US trips in calendar', conf: 76 },
        { name: 'Tablet + 5G data add-on', why: 'Multi-device usage on account', conf: 58 },
        { name: 'Fibre Max 1Gbps — mesh Wi‑Fi included', why: 'Weaker — mobile-first usage pattern', conf: 29 },
        { name: 'Family plan — 4 lines', why: 'Single-line profile', conf: 18 },
        { name: 'Business multi-line — static IP & SD‑WAN trial', why: 'No B2B or VAT signals', conf: 9 },
        { name: 'Pay-as-you-go starter', why: 'Postpaid tenure 4+ years', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Dan’s household streams 4K on multiple TVs and works from home — fibre speed and Wi‑Fi quality dominate. The model favours gigabit and mesh before mobile handset promos.',
      ranks: [
        { name: 'Fibre Max 1Gbps — mesh Wi‑Fi included', why: 'Usage + speed tests → line saturation signals', conf: 92 },
        { name: 'Home phone + streaming bundle', why: 'Bundle affinity from billing', conf: 68 },
        { name: 'Tablet + 5G data add-on', why: 'Kids’ devices on account', conf: 44 },
        { name: '5G Unlimited Plus — roaming & eSIM', why: 'Secondary — home is primary pain point', conf: 22 },
        { name: 'International roaming pass — 30 days', why: 'Low outbound travel score', conf: 11 },
        { name: 'Business multi-line — static IP & SD‑WAN trial', why: 'Residential service address', conf: 7 },
        { name: 'Pay-as-you-go starter', why: 'Long-standing postpaid customer', conf: 3 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Renee runs a 12-person office on the operator’s business tariff with rising upload needs. The model prioritises SD‑WAN and multi-line packs over consumer handset offers.',
      ranks: [
        { name: 'Business multi-line — static IP & SD‑WAN trial', why: 'BCA + ticket volume → B2B predictor', conf: 95 },
        { name: '5G Unlimited Plus — roaming & eSIM', why: 'Director lines on same contract', conf: 71 },
        { name: 'International roaming pass — 30 days', why: 'Roaming for client visits', conf: 46 },
        { name: 'Fibre Max 1Gbps — mesh Wi‑Fi included', why: 'Weaker — office on leased line elsewhere', conf: 21 },
        { name: 'Family plan — 4 lines', why: 'Business account, not consumer household', conf: 12 },
        { name: 'Home phone + streaming bundle', why: 'Irrelevant to registered business ID', conf: 6 },
        { name: 'Pay-as-you-go starter', why: 'Established SMB billing', conf: 2 },
      ],
    },
  ];

  var profiles = profilesMedia;

  var allAiItems = [];

  function recomputeAllAiItems() {
    allAiItems = [];
    var seen = Object.create(null);
    profiles.forEach(function (p) {
      p.ranks.forEach(function (r) {
        if (!seen[r.name]) {
          seen[r.name] = true;
          allAiItems.push(r.name);
        }
      });
    });
  }

  // ── OFFER PRIORITY ────────────────────────────────────────────────────────
  function buildPriorityList() {
    var list = document.getElementById('dceViz-priority-list');
    if (!list) return;
    list.innerHTML = '';
    offers.forEach(function (o) {
      var el = document.createElement('div');
      el.className = 'offer-row';
      el.dataset.offerId = o.id;
      el.innerHTML =
        '<div class="offer-score-badge" id="dceViz-badge-' + o.id + '">0</div>' +
        '<div style="flex:1; min-width:0;">' +
        '<div class="offer-name">' + o.name + '</div>' +
        '<div class="offer-sub">' + o.sub + '</div>' +
        '<div class="priority-bar-wrap">' +
        '<div class="priority-bar-track">' +
        '<div class="priority-bar-fill" id="dceViz-bar-' + o.id + '" style="width:0%"></div>' +
        '</div></div></div>' +
        '<div class="crown">👑</div>';
      list.appendChild(el);
    });
  }

  function syncPrioritySliderLabels() {
    var n1 = document.getElementById('dceViz-s1-name');
    var n2 = document.getElementById('dceViz-s2-name');
    var n3 = document.getElementById('dceViz-s3-name');
    if (n1 && offers[0]) n1.textContent = offers[0].name;
    if (n2 && offers[1]) n2.textContent = offers[1].name;
    if (n3 && offers[2]) n3.textContent = offers[2].name;
  }

  function updatePriority() {
    var vals = offers.map(function (o) {
      return { name: o.name, sub: o.sub, id: o.id, score: parseInt(document.getElementById('dceViz-' + o.id).value, 10) };
    });
    document.getElementById('dceViz-s1-val').textContent = vals[0].score;
    document.getElementById('dceViz-s2-val').textContent = vals[1].score;
    document.getElementById('dceViz-s3-val').textContent = vals[2].score;

    var sorted = vals.slice().sort(function (a, b) { return b.score - a.score; });
    var maxScore = Math.max.apply(null, vals.map(function (v) { return v.score; }));
    var winner = sorted[0];
    var list = document.getElementById('dceViz-priority-list');

    var nodes = {};
    offers.forEach(function (o) {
      var el = list.querySelector('[data-offer-id="' + o.id + '"]');
      nodes[o.id] = el;
      el._firstTop = el.getBoundingClientRect().top;
    });

    vals.forEach(function (o) {
      document.getElementById('dceViz-badge-' + o.id).textContent = o.score;
      document.getElementById('dceViz-bar-' + o.id).style.width = maxScore > 0 ? (o.score / maxScore) * 100 + '%' : '0%';
    });
    offers.forEach(function (o) {
      nodes[o.id].classList.toggle('winner', o.id === winner.id);
    });

    sorted.forEach(function (o) {
      list.appendChild(nodes[o.id]);
    });

    sorted.forEach(function (o) {
      var el = nodes[o.id];
      var lastTop = el.getBoundingClientRect().top;
      var delta = el._firstTop - lastTop;
      if (Math.abs(delta) > 1) {
        el.style.transform = 'translateY(' + delta + 'px)';
        el.style.transition = 'none';
        el.getBoundingClientRect();
        el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
        el.style.transform = 'translateY(0)';
      }
    });

    var wl = document.getElementById('dceViz-winner-label');
    if (wl) {
      var nm = winner.name;
      var sp = nm.indexOf(' ');
      wl.textContent = sp >= 0 ? nm.slice(sp + 1).trim() : nm;
    }
  }

  // ── RANKING FORMULA ───────────────────────────────────────────────────────
  var currentInterest = 'drama';
  var currentPropensity = 'medium';
  var currentCampaign = 'none';

  function getHoursSlider() {
    var k = getIndustry();
    if (k === 'travel') return document.getElementById('dceViz-hours-slider-travel');
    if (k === 'retail') return document.getElementById('dceViz-hours-slider-retail');
    if (k === 'fsi') return document.getElementById('dceViz-hours-slider-fsi');
    if (k === 'telco') return document.getElementById('dceViz-hours-slider-telco');
    return document.getElementById('dceViz-hours-slider');
  }

  function getHoursValEl() {
    var k = getIndustry();
    if (k === 'travel') return document.getElementById('dceViz-hours-val-travel');
    if (k === 'retail') return document.getElementById('dceViz-hours-val-retail');
    if (k === 'fsi') return document.getElementById('dceViz-hours-val-fsi');
    if (k === 'telco') return document.getElementById('dceViz-hours-val-telco');
    return document.getElementById('dceViz-hours-val');
  }

  function setInterest(interest, btn) {
    currentInterest = interest;
    if (btn && btn.closest) {
      btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    var ruleInterest = document.getElementById('dceViz-rule-interest');
    if (ruleInterest) ruleInterest.classList.add('active-rule');
    updateFormula();
  }

  function setPropensity(level, btn) {
    currentPropensity = level;
    if (btn && btn.closest) {
      btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    updateFormula();
  }

  function setCampaign(group, btn) {
    currentCampaign = group;
    if (btn && btn.closest) {
      btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    updateFormula();
  }

  function computeFormulaScore(offer, interest, hours, propensity, campaign) {
    var score = offer.baseScore;
    var urgency = hours <= offer.expiresIn;
    var match = offer.category === interest;
    var highPropensity = propensity === 'high';
    var campaignMatch = campaign !== 'none' && offer.category === campaign;

    if (urgency) score *= 2;
    if (match) score += 30;
    if (highPropensity) score = Math.round(score * 1.5);
    if (campaignMatch) score += 50;

    return { score: score, urgency: urgency, match: match, highPropensity: highPropensity, campaignMatch: campaignMatch };
  }

  function buildFormulaList() {
    var container = document.getElementById('dceViz-formula-offers');
    if (!container) return;
    container.innerHTML = '';
    formulaOffers.forEach(function (o, i) {
      var el = document.createElement('div');
      el.className = 'formula-input-row';
      el.dataset.formulaId = o.category;
      el.innerHTML =
        '<div class="formula-rank-num" id="dceViz-frank-' + o.category + '">' + (i + 1) + '</div>' +
        '<div class="formula-input-label" style="flex:1;">' +
        '<span class="formula-trophy-' + o.category + '"></span>' +
        '<span style="color:white; font-weight:500;">' + o.name + '</span>' +
        '<div class="formula-sub-' + o.category + '" style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:3px; line-height:1.5;"></div>' +
        '</div>' +
        '<div class="formula-input-value" id="dceViz-fscore-' + o.category + '" style="color:rgba(255,255,255,0.9); font-size:18px; font-weight:700;">—</div>';
      container.appendChild(el);
    });
  }

  function updateFormula() {
    var hs = getHoursSlider();
    if (!hs) return;
    var hours = parseInt(hs.value, 10);
    var hve = getHoursValEl();
    if (hve) hve.textContent = hours + 'h remaining';

    var urgencyActive = formulaOffers.some(function (o) { return hours <= o.expiresIn; });

    var urgencyFlag = document.getElementById('dceViz-urgency-flag');
    var urgencyFlagT = document.getElementById('dceViz-urgency-flag-travel');
    if (urgencyFlag) {
      urgencyFlag.style.display = getIndustry() === 'media' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'media' && urgencyActive) {
        var boostedNames = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlag.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedNames.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    if (urgencyFlagT) {
      urgencyFlagT.style.display = getIndustry() === 'travel' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'travel' && urgencyActive) {
        var boostedT = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagT.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedT.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagR = document.getElementById('dceViz-urgency-flag-retail');
    if (urgencyFlagR) {
      urgencyFlagR.style.display = getIndustry() === 'retail' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'retail' && urgencyActive) {
        var boostedR = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagR.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedR.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagFsi = document.getElementById('dceViz-urgency-flag-fsi');
    if (urgencyFlagFsi) {
      urgencyFlagFsi.style.display = getIndustry() === 'fsi' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'fsi' && urgencyActive) {
        var boostedF = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagFsi.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedF.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagTelco = document.getElementById('dceViz-urgency-flag-telco');
    if (urgencyFlagTelco) {
      urgencyFlagTelco.style.display = getIndustry() === 'telco' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'telco' && urgencyActive) {
        var boostedTel = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagTelco.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedTel.join(', ') + '</strong> — ranking order has changed.';
      }
    }

    var crossoverHint = document.getElementById('dceViz-crossover-hint');
    var crossoverHintT = document.getElementById('dceViz-crossover-hint-travel');
    var crossoverHintR = document.getElementById('dceViz-crossover-hint-retail');
    var crossoverHintFsi = document.getElementById('dceViz-crossover-hint-fsi');
    var crossoverHintTelco = document.getElementById('dceViz-crossover-hint-telco');
    if (crossoverHint) crossoverHint.style.display = getIndustry() === 'media' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintT) crossoverHintT.style.display = getIndustry() === 'travel' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintR) crossoverHintR.style.display = getIndustry() === 'retail' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintFsi) crossoverHintFsi.style.display = getIndustry() === 'fsi' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintTelco) crossoverHintTelco.style.display = getIndustry() === 'telco' && !urgencyActive ? 'block' : 'none';

    var ruleUrgency = document.getElementById('dceViz-rule-urgency');
    if (ruleUrgency) {
      ruleUrgency.classList.toggle('active-rule', urgencyActive);
      var badge = document.getElementById('dceViz-urgency-badge');
      if (badge) badge.style.opacity = urgencyActive ? '1' : '0.3';
    }

    var interestDisplay = document.getElementById('dceViz-interest-val-display');
    if (interestDisplay) {
      if (getIndustry() === 'travel') {
        interestDisplay.textContent = currentInterest + ' (tripProfile → item.tripSegment)';
      } else if (getIndustry() === 'retail') {
        interestDisplay.textContent = currentInterest + ' (shopperSegment → item.merchSegment)';
      } else if (getIndustry() === 'fsi') {
        interestDisplay.textContent = currentInterest + ' (customerIntent → product.line)';
      } else if (getIndustry() === 'telco') {
        interestDisplay.textContent = currentInterest + ' (subscriberSegment → offer.line)';
      } else {
        interestDisplay.textContent = currentInterest + ' (viewer genre → item.genre)';
      }
    }

    var highPropensity = currentPropensity === 'high';
    var rulePropensity = document.getElementById('dceViz-rule-propensity');
    if (rulePropensity) {
      rulePropensity.classList.toggle('active-rule', highPropensity);
      var pb = document.getElementById('dceViz-propensity-badge');
      if (pb) pb.style.opacity = highPropensity ? '1' : '0.3';
    }

    var campaignActive = currentCampaign !== 'none';
    var ruleCampaign = document.getElementById('dceViz-rule-campaign');
    if (ruleCampaign) {
      ruleCampaign.classList.toggle('active-rule', campaignActive);
      var cb = document.getElementById('dceViz-campaign-badge');
      if (cb) cb.style.opacity = campaignActive ? '1' : '0.3';
      var display = document.getElementById('dceViz-campaign-val-display');
      if (display) display.textContent = campaignActive ? currentCampaign : 'strategic';
    }

    var scored = formulaOffers.map(function (o) {
      var r = computeFormulaScore(o, currentInterest, hours, currentPropensity, currentCampaign);
      return {
        name: o.name, category: o.category, baseScore: o.baseScore, expiresIn: o.expiresIn,
        score: r.score, urgency: r.urgency, match: r.match, highPropensity: r.highPropensity, campaignMatch: r.campaignMatch
      };
    }).sort(function (a, b) { return b.score - a.score; });

    var winner = scored[0];

    var scoreEl = document.getElementById('dceViz-formula-score');
    if (scoreEl) scoreEl.textContent = winner.score;

    var expr = 'baseScore';
    if (winner.urgency) expr += ' × 2';
    if (winner.match) expr += ' + 30';
    if (winner.highPropensity) expr += ' × 1.5';
    if (winner.campaignMatch) expr += ' + 50';
    var exprEl = document.getElementById('dceViz-formula-expr-text');
    if (exprEl) exprEl.textContent = expr + ' = ' + winner.score;

    var winnerEl = document.getElementById('dceViz-formula-winner');
    if (winnerEl) winnerEl.textContent = winner.name;

    var indForm = getIndustry();
    var matchLabel = 'genre(+30)';
    if (indForm === 'travel') matchLabel = 'trip(+30)';
    if (indForm === 'retail') matchLabel = 'segment(+30)';
    if (indForm === 'fsi') matchLabel = 'intent(+30)';
    if (indForm === 'telco') matchLabel = 'line(+30)';
    var breakdown = 'base(' + winner.baseScore + ')';
    if (winner.urgency) breakdown += ' × urgency(×2)';
    if (winner.match) breakdown += ' + ' + matchLabel;
    if (winner.highPropensity) breakdown += ' × propensity(×1.5)';
    if (winner.campaignMatch) breakdown += ' + campaign(+50)';
    breakdown += ' = ' + winner.score;
    var bdEl = document.getElementById('dceViz-formula-breakdown');
    if (bdEl) bdEl.textContent = breakdown;

    var container = document.getElementById('dceViz-formula-offers');
    var nodes = {};
    formulaOffers.forEach(function (o) {
      var el = container.querySelector('[data-formula-id="' + o.category + '"]');
      nodes[o.category] = el;
      el._firstTop = el.getBoundingClientRect().top;
    });

    scored.forEach(function (o, i) {
      var isWinner = i === 0;
      var el = nodes[o.category];
      el.classList.toggle('winner-row', isWinner);
      var rankNum = document.getElementById('dceViz-frank-' + o.category);
      if (rankNum) rankNum.textContent = i + 1;
      var trophy = el.querySelector('.formula-trophy-' + o.category);
      if (trophy) trophy.textContent = isWinner ? '🏆 ' : '';
      var sub = el.querySelector('.formula-sub-' + o.category);
      if (sub) {
        var tripOrGenre = '🎯 +30 genre';
        if (getIndustry() === 'travel') tripOrGenre = '🎯 +30 trip match';
        if (getIndustry() === 'retail') tripOrGenre = '🎯 +30 segment match';
        if (getIndustry() === 'fsi') tripOrGenre = '🎯 +30 intent match';
        if (getIndustry() === 'telco') tripOrGenre = '🎯 +30 line match';
        sub.innerHTML = (o.urgency ? '<span style="color:#f5a623;font-weight:600;">⚡ ×2 urgency</span> · ' : '<span style="color:rgba(255,255,255,0.35);">cut-off ' + o.expiresIn + 'h</span> · ') +
          (o.match ? '<span style="color:#5ecf90;font-weight:600;">' + tripOrGenre + '</span> · ' : '') +
          (o.highPropensity ? '<span style="color:#c4a3f0;font-weight:600;">🧠 ×1.5 propensity</span> · ' : '') +
          (o.campaignMatch ? '<span style="color:#f87171;font-weight:600;">🚀 +50 campaign</span> · ' : '') +
          'base ' + o.baseScore + ' → <strong style="color:white;">' + o.score + '</strong>';
      }
      var scoreSpan = document.getElementById('dceViz-fscore-' + o.category);
      if (scoreSpan) scoreSpan.textContent = o.score;
    });

    scored.forEach(function (o) {
      container.appendChild(nodes[o.category]);
    });

    scored.forEach(function (o) {
      var el = nodes[o.category];
      var lastTop = el.getBoundingClientRect().top;
      var delta = el._firstTop - lastTop;
      if (Math.abs(delta) > 1) {
        el.style.transform = 'translateY(' + delta + 'px)';
        el.style.transition = 'none';
        el.getBoundingClientRect();
        el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
        el.style.transform = 'translateY(0)';
      }
    });
  }

  // ── AI MODELS ─────────────────────────────────────────────────────────────
  function selectProfile(idx, el) {
    var root = document.getElementById('dceVizRoot');
    var ind = getIndustry();
    root.querySelectorAll('.profile-card[data-dce-profile-industry="' + ind + '"]').forEach(function (c) { c.classList.remove('selected'); });
    el.classList.add('selected');
    var p = profiles[idx];
    document.getElementById('dceViz-ai-reasoning').innerHTML = p.reasoning;
    renderAiRanks(p.ranks);
  }

  function buildAiRanksList() {
    var container = document.getElementById('dceViz-ai-ranks');
    if (!container) return;
    container.innerHTML = '';
    allAiItems.forEach(function (name) {
      var el = document.createElement('div');
      el.className = 'ai-offer-row';
      el.setAttribute('data-ai-item', name);
      el.style.cssText = 'flex-direction:column; align-items:stretch; gap:6px; padding:10px 14px;';
      el.innerHTML =
        '<div style="display:flex; align-items:center; gap:10px;">' +
        '<div class="ai-rank" data-rank-num>1</div>' +
        '<div class="ai-offer-name" style="flex:1;">' + name + '</div>' +
        '<div class="ai-confidence">' +
        '<div class="conf-bar"><div class="conf-fill" data-conf-fill style="width:0%"></div></div>' +
        '<span style="min-width:30px; text-align:right;" data-conf-pct>0%</span>' +
        '</div></div>' +
        '<div style="font-size:11px; padding-left:34px; font-style:italic;" data-why></div>';
      container.appendChild(el);
    });
  }

  function renderAiRanks(ranks) {
    var container = document.getElementById('dceViz-ai-ranks');
    var nodes = {};
    allAiItems.forEach(function (name) {
      container.querySelectorAll('[data-ai-item]').forEach(function (node) {
        if (node.getAttribute('data-ai-item') === name) nodes[name] = node;
      });
      if (nodes[name]) nodes[name]._firstTop = nodes[name].getBoundingClientRect().top;
    });

    ranks.forEach(function (r, i) {
      var el = nodes[r.name];
      if (!el) return;
      el.classList.toggle('top', i === 0);
      el.querySelector('[data-rank-num]').textContent = i + 1;
      el.querySelector('[data-conf-fill]').style.width = r.conf + '%';
      el.querySelector('[data-conf-pct]').textContent = r.conf + '%';
      var why = el.querySelector('[data-why]');
      why.textContent = r.why;
      why.style.color = i === 0 ? '#1a7a4a' : '#9a948e';
    });

    ranks.forEach(function (r) {
      container.appendChild(nodes[r.name]);
    });

    ranks.forEach(function (r) {
      var el = nodes[r.name];
      if (!el) return;
      var lastTop = el.getBoundingClientRect().top;
      var delta = el._firstTop - lastTop;
      if (Math.abs(delta) > 1) {
        el.style.transform = 'translateY(' + delta + 'px)';
        el.style.transition = 'none';
        el.getBoundingClientRect();
        el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
        el.style.transform = 'translateY(0)';
      }
    });
  }

  // ── INDUSTRY SWITCH ───────────────────────────────────────────────────────
  function setIndustry(key, persist) {
    if (key !== 'travel' && key !== 'media' && key !== 'retail' && key !== 'fsi' && key !== 'telco') key = 'media';

    var prevIndustry = document.body.getAttribute('data-dce-industry') || 'media';
    if (prevIndustry !== 'travel' && prevIndustry !== 'media' && prevIndustry !== 'retail' && prevIndustry !== 'fsi' && prevIndustry !== 'telco') prevIndustry = 'media';

    var hsm = document.getElementById('dceViz-hours-slider');
    var hst = document.getElementById('dceViz-hours-slider-travel');
    var hsr = document.getElementById('dceViz-hours-slider-retail');
    var hsf = document.getElementById('dceViz-hours-slider-fsi');
    var hstel = document.getElementById('dceViz-hours-slider-telco');
    var v = 48;
    if (prevIndustry === 'media' && hsm) v = parseInt(hsm.value, 10) || 48;
    else if (prevIndustry === 'travel' && hst) v = parseInt(hst.value, 10) || 48;
    else if (prevIndustry === 'retail' && hsr) v = parseInt(hsr.value, 10) || 48;
    else if (prevIndustry === 'fsi' && hsf) v = parseInt(hsf.value, 10) || 48;
    else if (prevIndustry === 'telco' && hstel) v = parseInt(hstel.value, 10) || 48;

    document.body.setAttribute('data-dce-industry', key);
    if (persist) {
      try { localStorage.setItem(LS_INDUSTRY, key); } catch (e) {}
    }

    document.querySelectorAll('.dce-viz-industry-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-dce-industry') === key);
    });

    if (key === 'travel') {
      offers = PRIORITY_TRAVEL.slice();
      formulaOffers = FORMULA_TRAVEL.slice();
      profiles = profilesTravel;
      currentInterest = 'business';
    } else if (key === 'retail') {
      offers = PRIORITY_RETAIL.slice();
      formulaOffers = FORMULA_RETAIL.slice();
      profiles = profilesRetail;
      currentInterest = 'member';
    } else if (key === 'fsi') {
      offers = PRIORITY_FSI.slice();
      formulaOffers = FORMULA_FSI.slice();
      profiles = profilesFSI;
      currentInterest = 'everyday';
    } else if (key === 'telco') {
      offers = PRIORITY_TELCO.slice();
      formulaOffers = FORMULA_TELCO.slice();
      profiles = profilesTelco;
      currentInterest = 'mobile';
    } else {
      offers = PRIORITY_MEDIA.slice();
      formulaOffers = FORMULA_MEDIA.slice();
      profiles = profilesMedia;
      currentInterest = 'drama';
    }
    currentCampaign = 'none';
    currentPropensity = 'medium';

    syncPrioritySliderLabels();
    buildPriorityList();
    updatePriority();

    buildFormulaList();
    if (hsm) hsm.value = String(v);
    if (hst) hst.value = String(v);
    if (hsr) hsr.value = String(v);
    if (hsf) hsf.value = String(v);
    if (hstel) hstel.value = String(v);

    recomputeAllAiItems();
    buildAiRanksList();
    renderAiRanks(profiles[0].ranks);
    var ar = document.getElementById('dceViz-ai-reasoning');
    if (ar) ar.innerHTML = profiles[0].reasoning;

    var simWrap = document.querySelector('#dceViz-panel-formula .dce-viz-sim-grid[data-dce-industry-show="' + key + '"]');
    if (simWrap) {
      var pills = simWrap.querySelectorAll('.toggle-pill');
      if (pills[0]) {
        pills[0].querySelectorAll('.toggle-opt').forEach(function (b, i) { b.classList.toggle('active', i === 0); });
      }
      if (pills[1]) {
        pills[1].querySelectorAll('.toggle-opt').forEach(function (b, i) { b.classList.toggle('active', i === 1); });
      }
      if (pills[2]) {
        pills[2].querySelectorAll('.toggle-opt').forEach(function (b, i) { b.classList.toggle('active', i === 0); });
      }
    }

    document.querySelectorAll('.profile-card[data-dce-profile-industry="' + key + '"]').forEach(function (c, i) { c.classList.toggle('selected', i === 0); });

    updateFormula();
  }

  function initIndustry() {
    var key = 'media';
    try {
      var s = localStorage.getItem(LS_INDUSTRY);
      if (s === 'travel' || s === 'media' || s === 'retail' || s === 'fsi' || s === 'telco') key = s;
    } catch (e) {}
    setIndustry(key, false);

    document.querySelectorAll('.dce-viz-industry-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-dce-industry');
        if (k) setIndustry(k, true);
      });
    });
  }

  // ── INIT ───────────────────────────────────────────────────────────────────
  try {
    initIndustry();
  } catch (err) {
    console.error('[decisioning-visualizer] init', err);
  }

  window.dceVizUpdatePriority = updatePriority;
  window.dceVizUpdateFormula = updateFormula;
  window.dceVizSetInterest = setInterest;
  window.dceVizSetPropensity = setPropensity;
  window.dceVizSetCampaign = setCampaign;
  window.dceVizSelectProfile = selectProfile;
})();
