/**
 * Decisioning visualiser — core 5-tab ranking explorer (multi-industry).
 */
(function () {
  'use strict';

  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_EDP_INDUSTRY = 'aepEdpIndustry';

  /* Labels + order match web/profile-viewer/dce-shared-industries.js (Decision overview / EDP) */
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

  /* Lucide icon inner markup (lucide-static ISC) — same icons as EDP Shell */
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

  function dceVizBuildIndustryDropdown() {
    var menu = document.getElementById('dce-pg-industry-menu');
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

  function dceVizSyncIndustryChrome(key) {
    var ico = document.getElementById('dce-edp-industry-ico');
    if (ico) ico.innerHTML = industryIconMarkup(key);
    document.querySelectorAll('#dce-pg-industry-menu .dce-edp-dropdown-item').forEach(function (b) {
      var on = b.getAttribute('data-dce-industry') === key;
      b.classList.toggle('dce-edp-dropdown-item--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
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
  var PRIORITY_TELECOMMUNICATIONS = [
    { name: '📱 5G Unlimited Plus — roaming & eSIM', sub: 'Highest ARPU · strategic mobile growth', id: 's1' },
    { name: '🏠 Fibre Max 1Gbps — mesh Wi‑Fi included', sub: 'Home broadband · acquisition & churn save', id: 's2' },
    { name: '🧑‍💼 Business multi-line — static IP & SD‑WAN trial', sub: 'SMB connectivity · B2B attach', id: 's3' },
  ];
  var PRIORITY_SPORTS = [
    { name: '🏟️ Season ticket renewals — early-bird window', sub: 'Seat upgrades · loyalty tiers', id: 's1' },
    { name: '🎽 Kit + merch bundle — matchday pickup', sub: 'Retail attach · fan engagement', id: 's2' },
    { name: '📺 Streaming add-on — out-of-market games', sub: 'Broadcast rights · incremental ARPU', id: 's3' },
  ];
  var PRIORITY_PUBLIC = [
    { name: '🏛️ Transit pass — reduced fare pilot', sub: 'Eligibility rules · income bands', id: 's1' },
    { name: '📋 Permit fast-track — digital submission', sub: 'SLA · queue priority', id: 's2' },
    { name: '🧑‍🎓 Skills grant — cohort intake', sub: 'Workforce programme · regional cap', id: 's3' },
  ];
  var PRIORITY_HEALTHCARE = [
    { name: '🩺 Specialty pathway — remote monitoring bundle', sub: 'Chronic care · adherence & devices', id: 's1' },
    { name: '🏥 Primary care — annual wellness visit', sub: 'Preventive revenue · gap closure', id: 's2' },
    { name: '🧠 Behavioral health — digital coaching programme', sub: 'BH integration · engagement', id: 's3' },
  ];

  function getPriorityListForIndustry(key) {
    if (key === 'travel') return PRIORITY_TRAVEL;
    if (key === 'retail') return PRIORITY_RETAIL;
    if (key === 'fsi') return PRIORITY_FSI;
    if (key === 'telecommunications') return PRIORITY_TELECOMMUNICATIONS;
    if (key === 'sports') return PRIORITY_SPORTS;
    if (key === 'public') return PRIORITY_PUBLIC;
    if (key === 'healthcare') return PRIORITY_HEALTHCARE;
    return PRIORITY_MEDIA;
  }
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
  var FORMULA_TELECOMMUNICATIONS = [
    { name: 'Mobile — 5G device + unlimited bundle', category: 'mobile', baseScore: 75, expiresIn: 20 },
    { name: 'Home & fibre — gigabit + mesh upgrade', category: 'home', baseScore: 85, expiresIn: 36 },
    { name: 'Business lines — multi-line + static IP pack', category: 'smb', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_SPORTS = [
    { name: 'Season seats — renewal offer', category: 'season', baseScore: 75, expiresIn: 20 },
    { name: 'VIP hospitality — playoff pack', category: 'vip', baseScore: 85, expiresIn: 36 },
    { name: 'Youth academy camp — summer slots', category: 'youth', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_PUBLIC = [
    { name: 'Housing support — first-time applicant', category: 'housing', baseScore: 75, expiresIn: 20 },
    { name: 'Benefits check — universal screening', category: 'benefits', baseScore: 85, expiresIn: 36 },
    { name: 'Mobility pass — senior eligibility', category: 'mobility', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_HEALTHCARE = [
    { name: 'Cardiology remote monitoring — kit + coach', category: 'specialty', baseScore: 75, expiresIn: 20 },
    { name: 'PCP wellness — covered annual visit', category: 'primary', baseScore: 85, expiresIn: 36 },
    { name: 'Behavioral health — CBT app + coach', category: 'wellness', baseScore: 78, expiresIn: 10 },
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

  var profilesTelecommunications = [
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

  var profilesSports = [
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Alex renewed seats last season and opened the app on matchday morning — strong loyalty and upsell signals. The model predicts season renewals and bundle ladders before single-game discounts.',
      ranks: [
        { name: '🏟️ Season ticket renewals — early-bird window', why: 'Tenure + match attendance → strongest conversion', conf: 93 },
        { name: '🎽 Kit + merch bundle — matchday pickup', why: 'Basket affinity from prior purchases', conf: 72 },
        { name: '📺 Streaming add-on — out-of-market games', why: 'Geo + device signals for broadcast upsell', conf: 58 },
        { name: 'VIP hospitality — playoff pack', why: 'Premium cohort · lower on mass ladder', conf: 41 },
        { name: 'Youth academy camp — summer slots', why: 'Household kids flag · secondary on adult path', conf: 22 },
        { name: 'Single-game flash — tonight only', why: 'Inventory risk · behind renewals', conf: 11 },
        { name: 'Partner credit card — points x2', why: 'Financial product · weak on gameday path', conf: 5 },
      ],
    },
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Jordan browsed out-of-market streaming and device compatibility pages — broadcast-first intent. The model prioritises streaming add-ons and device bundles before in-venue merch.',
      ranks: [
        { name: '📺 Streaming add-on — out-of-market games', why: 'Geo + device research → top predictor', conf: 94 },
        { name: 'VIP hospitality — playoff pack', why: 'Premium experience attach for cord-cutters', conf: 77 },
        { name: '🏟️ Season ticket renewals — early-bird window', why: 'Fallback if renewal window closed', conf: 52 },
        { name: '🎽 Kit + merch bundle — matchday pickup', why: 'Retail path · secondary to broadcast', conf: 28 },
        { name: 'Youth academy camp — summer slots', why: 'Different household segment', conf: 14 },
        { name: 'Season seats — renewal offer', why: 'Formula sim label overlap · lower fit here', conf: 8 },
        { name: 'Single-game flash — tonight only', why: 'Impulse path · weaker for research-heavy user', conf: 4 },
      ],
    },
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Sam runs partnership marketing for a league sponsor — B2B2C goals and inventory commitments. The model prioritises hospitality packs and youth programmes over retail single-game.',
      ranks: [
        { name: 'VIP hospitality — playoff pack', why: 'Sponsor ID + inventory hold → B2B predictor', conf: 95 },
        { name: 'Youth academy camp — summer slots', why: 'Grassroots programme commitments', conf: 73 },
        { name: '🏟️ Season ticket renewals — early-bird window', why: 'Partner bundle allocation', conf: 46 },
        { name: '🎽 Kit + merch bundle — matchday pickup', why: 'Licensing attach · secondary to hospitality', conf: 24 },
        { name: '📺 Streaming add-on — out-of-market games', why: 'Rights window not in sponsor brief', conf: 12 },
        { name: 'Single-game flash — tonight only', why: 'Not a partner-managed path', conf: 7 },
        { name: 'Partner credit card — points x2', why: 'Different acquisition funnel', conf: 3 },
      ],
    },
  ];

  var profilesPublic = [
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Riley started a benefits pre-check and uploaded income proof — strong eligibility workflow. The model predicts housing and benefits bundles before mobility add-ons.',
      ranks: [
        { name: 'Housing support — first-time applicant', why: 'Income + household signals → strongest fit', conf: 93 },
        { name: 'Benefits check — universal screening', why: 'Completed wizard steps', conf: 74 },
        { name: 'Mobility pass — senior eligibility', why: 'Age flag · secondary on this journey', conf: 58 },
        { name: '🏛️ Transit pass — reduced fare pilot', why: 'Different programme gate', conf: 41 },
        { name: '📋 Permit fast-track — digital submission', why: 'No permit type selected yet', conf: 22 },
        { name: '🧑‍🎓 Skills grant — cohort intake', why: 'Education segment · later nurture', conf: 11 },
        { name: 'Community volunteer stipend', why: 'Out of scope for this intake', conf: 5 },
      ],
    },
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Casey needs a construction permit with a hard deadline — urgency and document completeness dominate. The model prioritises fast-track permits before grant programmes.',
      ranks: [
        { name: '📋 Permit fast-track — digital submission', why: 'Deadline + doc completeness → top predictor', conf: 95 },
        { name: '🏛️ Transit pass — reduced fare pilot', why: 'Complementary mobility benefit', conf: 76 },
        { name: 'Housing support — first-time applicant', why: 'Weaker — different service line', conf: 42 },
        { name: 'Benefits check — universal screening', why: 'Triage step · not replacement for permit SLA', conf: 28 },
        { name: 'Mobility pass — senior eligibility', why: 'Different cohort rules', conf: 14 },
        { name: '🧑‍🎓 Skills grant — cohort intake', why: 'Not a workforce journey this session', conf: 8 },
        { name: 'Community volunteer stipend', why: 'Irrelevant to permit path', conf: 4 },
      ],
    },
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Admin for a regional skills programme is enrolling a summer cohort — education policy goals. The model prioritises skills grants and partner employers before transit retail offers.',
      ranks: [
        { name: '🧑‍🎓 Skills grant — cohort intake', why: 'Programme admin + roster ID → predictor', conf: 94 },
        { name: 'Benefits check — universal screening', why: 'Eligibility cross-check for stipend', conf: 71 },
        { name: 'Housing support — first-time applicant', why: 'Secondary — different intake', conf: 38 },
        { name: '🏛️ Transit pass — reduced fare pilot', why: 'Student subsidy overlap', conf: 24 },
        { name: '📋 Permit fast-track — digital submission', why: 'Not a construction journey', conf: 12 },
        { name: 'Mobility pass — senior eligibility', why: 'Age rules don’t match cohort', conf: 7 },
        { name: 'Community volunteer stipend', why: 'Different budget line', conf: 3 },
      ],
    },
  ];

  var profilesHealthcare = [
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Morgan is attributed to a primary care panel with rising A1c and two open care gaps. The model predicts specialty remote monitoring and coaching bundles before generic wellness nudges.',
      ranks: [
        { name: '🩺 Specialty pathway — remote monitoring bundle', why: 'Chronic markers + engagement → strongest uptake', conf: 94 },
        { name: 'PCP wellness — covered annual visit', why: 'Gap closure on preventive schedule', conf: 76 },
        { name: 'Behavioral health — digital coaching programme', why: 'Stress + sleep signals in app', conf: 58 },
        { name: 'Cardiology remote monitoring — kit + coach', why: 'Formula sim overlap · high fit', conf: 41 },
        { name: 'Retail pharmacy flash — 15% off', why: 'Secondary to clinical path', conf: 22 },
        { name: 'Telehealth urgent — same day', why: 'Different acuity ladder', conf: 11 },
        { name: 'Gym discount partner', why: 'Out of benefit design for this episode', conf: 5 },
      ],
    },
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> James searched chest discomfort and completed a cardiac risk screener — urgency and specialty routing dominate. The model prioritises cardiology pathways before primary-care wellness.',
      ranks: [
        { name: 'Cardiology remote monitoring — kit + coach', why: 'Risk score + symptom cluster → top predictor', conf: 95 },
        { name: '🩺 Specialty pathway — remote monitoring bundle', why: 'Care-team handoff messaging', conf: 78 },
        { name: 'Telehealth urgent — same day', why: 'Triage alternative · secondary slot', conf: 52 },
        { name: 'PCP wellness — covered annual visit', why: 'Weaker — acute intent this session', conf: 28 },
        { name: 'Behavioral health — digital coaching programme', why: 'Follow-on after acute ruled out', conf: 14 },
        { name: 'Retail pharmacy flash — 15% off', why: 'Irrelevant to cardiology path', conf: 8 },
        { name: 'Gym discount partner', why: 'Not clinically indicated', conf: 3 },
      ],
    },
    {
      reasoning:
        '🧠 <strong>Model reasoning:</strong> Taylor leads employer-sponsored screenings for a 400-person site — population health goals. The model prioritises on-site PCP wellness and BH programmes before individual specialty kits.',
      ranks: [
        { name: 'PCP wellness — covered annual visit', why: 'Employer roster + screening targets → predictor', conf: 93 },
        { name: 'Behavioral health — digital coaching programme', why: 'EAP attach rate from HR feed', conf: 72 },
        { name: '🩺 Specialty pathway — remote monitoring bundle', why: 'High-risk cohort subset only', conf: 46 },
        { name: 'Cardiology remote monitoring — kit + coach', why: 'Named referrals only', conf: 24 },
        { name: 'Telehealth urgent — same day', why: 'Not an occupational health path', conf: 11 },
        { name: 'Retail pharmacy flash — 15% off', why: 'Different acquisition funnel', conf: 6 },
        { name: 'Gym discount partner', why: 'Wellness perk · lower priority than screenings', conf: 3 },
      ],
    },
  ];

  var profiles = profilesMedia;

  var currentInterest = 'drama';
  var currentPropensity = 'medium';
  var currentCampaign = 'none';
  var aiSelectedProfileIdx = 0;
  var aiRankSortByScore = false;

  function syncPrioritySliderLabels() {
    for (var i = 0; i < 3; i++) {
      var el = document.getElementById('priority-s' + (i + 1) + '-label');
      if (el && offers[i]) el.textContent = offers[i].name;
    }
  }

  function buildPriorityList() {
    var list = document.getElementById('priority-list');
    if (!list) return;
    list.innerHTML = '';
    offers.forEach(function (o) {
      var el = document.createElement('div');
      el.className = 'offer-row';
      el.dataset.offerId = o.id;
      el.innerHTML =
        '<div class="offer-score-badge" id="badge-' +
        o.id +
        '">0</div>' +
        '<div style="flex:1; min-width:0;">' +
        '<div class="offer-name">' +
        o.name +
        '</div>' +
        '<div class="offer-sub">' +
        o.sub +
        '</div>' +
        '<div class="priority-bar-wrap">' +
        '<div class="priority-bar-track">' +
        '<div class="priority-bar-fill" id="bar-' +
        o.id +
        '" style="width:0%"></div>' +
        '</div></div></div>' +
        '<div class="crown">👑</div>';
      list.appendChild(el);
    });
  }

  function updatePriority() {
    var vals = offers.map(function (o) {
      return {
        name: o.name,
        sub: o.sub,
        id: o.id,
        score: parseInt(document.getElementById(o.id).value, 10) || 0,
      };
    });
    document.getElementById('s1-val').textContent = vals[0].score;
    document.getElementById('s2-val').textContent = vals[1].score;
    document.getElementById('s3-val').textContent = vals[2].score;

    var sorted = vals.slice().sort(function (a, b) {
      return b.score - a.score;
    });
    var maxScore = Math.max.apply(
      null,
      vals.map(function (v) {
        return v.score;
      })
    );
    var winner = sorted[0];
    var list = document.getElementById('priority-list');

    var nodes = {};
    offers.forEach(function (o) {
      var el = list.querySelector('[data-offer-id="' + o.id + '"]');
      nodes[o.id] = el;
      el._firstTop = el.getBoundingClientRect().top;
    });

    vals.forEach(function (o) {
      document.getElementById('badge-' + o.id).textContent = o.score;
      document.getElementById('bar-' + o.id).style.width =
        maxScore > 0 ? (o.score / maxScore) * 100 + '%' : '0%';
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

    var wl = document.getElementById('winner-label');
    if (wl) wl.textContent = winner.name.replace(/^.\s/, '').trim() || winner.name;
  }

  function genreMatchTag() {
    var ind = getIndustry();
    if (ind === 'travel') return '🎯 +30 trip match';
    if (ind === 'retail') return '🎯 +30 segment match';
    if (ind === 'fsi') return '🎯 +30 intent match';
    if (ind === 'telecommunications') return '🎯 +30 line match';
    if (ind === 'sports') return '🎯 +30 fan match';
    if (ind === 'public') return '🎯 +30 case match';
    if (ind === 'healthcare') return '🎯 +30 pathway match';
    return '🎯 +30 genre';
  }

  /** Profile-side attribute name in the formula builder (matches industry-specific profile schema). */
  function profileMatchFormulaAttrName() {
    var ind = getIndustry();
    if (ind === 'retail') return 'shopperSegment';
    if (ind === 'fsi') return 'bankingIntent';
    if (ind === 'travel') return 'tripPreference';
    if (ind === 'telecommunications') return 'lineIntent';
    if (ind === 'sports') return 'fanAffinity';
    if (ind === 'public') return 'servicePathway';
    if (ind === 'healthcare') return 'carePathway';
    return 'preferredGenre';
  }

  /** Helper text under the profile match toggle in "Simulate — set the context". */
  function profileMatchSimulateHint() {
    var ind = getIndustry();
    if (ind === 'retail') return 'Which loyalty or shopping segment best describes this customer?';
    if (ind === 'fsi') return 'Which banking or wealth line is this customer most focused on?';
    if (ind === 'travel') return 'What kind of trip does this traveler usually book?';
    if (ind === 'telecommunications') return 'What connectivity need is this subscriber optimizing for?';
    if (ind === 'sports') return 'Which program or product line is this fan most aligned with?';
    if (ind === 'public') return 'Which service pathway is this resident navigating?';
    if (ind === 'healthcare') return 'Which clinical or wellness pathway is this member on?';
    return 'What content does this viewer primarily watch?';
  }

  function syncProfileMatchFormulaLabels() {
    var name = profileMatchFormulaAttrName();
    var hint = profileMatchSimulateHint();
    var ra = document.getElementById('dce-formula-rule-profile-attr');
    if (ra) ra.textContent = name;
    var sim = document.getElementById('dce-formula-profile-simulate-attr');
    if (sim) sim.textContent = name;
    var h = document.getElementById('dce-formula-profile-simulate-hint');
    if (h) h.textContent = hint;
  }

  /** Short label for the serving breakdown line (winner score). */
  function profileMatchBreakdownFragment() {
    var ind = getIndustry();
    if (ind === 'travel') return ' + trip(+30)';
    if (ind === 'retail') return ' + segment(+30)';
    if (ind === 'fsi') return ' + intent(+30)';
    if (ind === 'telecommunications') return ' + line(+30)';
    if (ind === 'sports') return ' + fan(+30)';
    if (ind === 'public') return ' + pathway(+30)';
    if (ind === 'healthcare') return ' + pathway(+30)';
    return ' + genre(+30)';
  }

  function interestRuleDisplay() {
    var ind = getIndustry();
    var tail = ' (viewer genre → item.genre)';
    if (ind === 'travel') tail = ' (trip preference → offer.tripType)';
    if (ind === 'retail') tail = ' (segment → offer.segment)';
    if (ind === 'fsi') tail = ' (intent → offer.line)';
    if (ind === 'telecommunications') tail = ' (line intent → offer.planType)';
    if (ind === 'sports') tail = ' (program intent → offer.program)';
    if (ind === 'public') tail = ' (path → offer.pathway)';
    if (ind === 'healthcare') tail = ' (care pathway → offer.serviceLine)';
    return currentInterest + tail;
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

  function shortOfferTitle(o) {
    var parts = String(o.name || '').split('—');
    return parts[0].trim() || o.name;
  }

  function syncFormulaSimulationControls() {
    var interestMount = document.getElementById('dce-formula-interest-pill');
    var campaignMount = document.getElementById('dce-formula-campaign-pill');
    if (!interestMount || !campaignMount) return;

    var fo = formulaOffers;
    var iHtml = '';
    for (var i = 0; i < fo.length; i++) {
      var o = fo[i];
      var active = o.category === currentInterest ? ' active' : '';
      iHtml +=
        '<button type="button" class="toggle-opt' +
        active +
        '" onclick="dceFormulaPickInterest(\'' +
        o.category +
        '\', this)">' +
        shortOfferTitle(o) +
        '</button>';
    }
    interestMount.innerHTML = iHtml;

    var c0 = fo[0] && fo[0].category;
    var c2 = fo[2] && fo[2].category;
    var noneOn = currentCampaign === 'none' ? ' active' : '';
    var c0On = currentCampaign === c0 ? ' active' : '';
    var c2On = currentCampaign === c2 ? ' active' : '';
    campaignMount.innerHTML =
      '<button type="button" class="toggle-opt' +
      noneOn +
      '" onclick="dceFormulaPickCampaign(\'none\', this)">🚫 None active</button>' +
      '<button type="button" class="toggle-opt' +
      c0On +
      '" onclick="dceFormulaPickCampaign(\'' +
      c0 +
      '\', this)">🚀 Boost ' +
      shortOfferTitle(fo[0]) +
      '</button>' +
      '<button type="button" class="toggle-opt' +
      c2On +
      '" onclick="dceFormulaPickCampaign(\'' +
      c2 +
      '\', this)">🚀 Boost ' +
      shortOfferTitle(fo[2]) +
      '</button>';

    var ruleInterest = document.getElementById('rule-interest');
    if (ruleInterest) ruleInterest.classList.add('active-rule');
    syncProfileMatchFormulaLabels();
  }

  function dceFormulaPickInterest(cat, btn) {
    currentInterest = cat;
    var mount = document.getElementById('dce-formula-interest-pill');
    if (mount) {
      mount.querySelectorAll('.toggle-opt').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }
    var ruleInterest = document.getElementById('rule-interest');
    if (ruleInterest) ruleInterest.classList.add('active-rule');
    updateFormula();
  }

  function dceFormulaPickCampaign(group, btn) {
    currentCampaign = group;
    var mount = document.getElementById('dce-formula-campaign-pill');
    if (mount) {
      mount.querySelectorAll('.toggle-opt').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }
    updateFormula();
  }

  function setPropensity(level, btn) {
    currentPropensity = level;
    var pill = btn.closest('.toggle-pill');
    if (pill) {
      pill.querySelectorAll('.toggle-opt').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    }
    updateFormula();
  }

  function buildFormulaList() {
    var container = document.getElementById('formula-offers');
    if (!container) return;
    container.innerHTML = '';
    formulaOffers.forEach(function (o, i) {
      var el = document.createElement('div');
      el.className = 'formula-input-row';
      el.dataset.formulaId = o.category;
      el.innerHTML =
        '<div class="formula-rank-num" id="frank-' +
        o.category +
        '">' +
        (i + 1) +
        '</div>' +
        '<div class="formula-input-label" style="flex:1;">' +
        '<span class="formula-trophy-' +
        o.category +
        '"></span>' +
        '<span style="color:white; font-weight:500;">' +
        o.name +
        '</span>' +
        '<div class="formula-sub-' +
        o.category +
        '" style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:3px; line-height:1.5;"></div>' +
        '</div>' +
        '<div class="formula-input-value" id="fscore-' +
        o.category +
        '" style="color:rgba(255,255,255,0.9); font-size:18px; font-weight:700;">—</div>';
      container.appendChild(el);
    });
  }

  function updateFormula() {
    var hoursSlider = document.getElementById('hours-slider');
    if (!hoursSlider) return;
    var hours = parseInt(hoursSlider.value, 10) || 0;
    var hoursVal = document.getElementById('hours-val');
    if (hoursVal) hoursVal.textContent = hours + 'h remaining';

    var urgencyActive = formulaOffers.some(function (o) {
      return hours <= o.expiresIn;
    });

    var urgencyFlag = document.getElementById('urgency-flag');
    if (urgencyFlag) {
      urgencyFlag.style.display = urgencyActive ? 'flex' : 'none';
      var boostedNames = formulaOffers
        .filter(function (o) {
          return hours <= o.expiresIn;
        })
        .map(function (o) {
          return o.name.split('—')[0].trim();
        });
      urgencyFlag.innerHTML =
        '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' +
        boostedNames.join(', ') +
        '</strong> — ranking order has changed.';
    }

    var crossoverHint = document.getElementById('crossover-hint');
    if (crossoverHint) {
      crossoverHint.style.display = !urgencyActive ? 'block' : 'none';
      if (!urgencyActive) {
        var bits = formulaOffers.map(function (o) {
          return shortOfferTitle(o) + ' at <strong style="color:#c47b00;">' + o.expiresIn + 'h</strong>';
        });
        crossoverHint.innerHTML =
          '↓ Drag left — each item has its own expiry. ' + bits.join(' · ') + '. Watch the ranking flip as each one gets boosted.';
      }
    }

    var ruleUrgency = document.getElementById('rule-urgency');
    if (ruleUrgency) {
      ruleUrgency.classList.toggle('active-rule', urgencyActive);
      var badge = document.getElementById('urgency-badge');
      if (badge) badge.style.opacity = urgencyActive ? '1' : '0.3';
    }

    var interestDisplay = document.getElementById('interest-val-display');
    if (interestDisplay) interestDisplay.textContent = interestRuleDisplay();

    var highPropensity = currentPropensity === 'high';
    var rulePropensity = document.getElementById('rule-propensity');
    if (rulePropensity) {
      rulePropensity.classList.toggle('active-rule', highPropensity);
      var pb = document.getElementById('propensity-badge');
      if (pb) pb.style.opacity = highPropensity ? '1' : '0.3';
    }

    var campaignActive = currentCampaign !== 'none';
    var ruleCampaign = document.getElementById('rule-campaign');
    if (ruleCampaign) {
      ruleCampaign.classList.toggle('active-rule', campaignActive);
      var cb = document.getElementById('campaign-badge');
      if (cb) cb.style.opacity = campaignActive ? '1' : '0.3';
      var display = document.getElementById('campaign-val-display');
      if (display) display.textContent = campaignActive ? currentCampaign : 'strategic';
    }

    var scored = formulaOffers
      .map(function (o) {
        var r = computeFormulaScore(o, currentInterest, hours, currentPropensity, currentCampaign);
        return {
          name: o.name,
          category: o.category,
          baseScore: o.baseScore,
          expiresIn: o.expiresIn,
          score: r.score,
          urgency: r.urgency,
          match: r.match,
          highPropensity: r.highPropensity,
          campaignMatch: r.campaignMatch,
        };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });

    var winner = scored[0];

    var scoreEl = document.getElementById('formula-score');
    if (scoreEl) scoreEl.textContent = winner.score;

    var expr = 'baseScore';
    if (winner.urgency) expr += ' × 2';
    if (winner.match) expr += ' + 30';
    if (winner.highPropensity) expr += ' × 1.5';
    if (winner.campaignMatch) expr += ' + 50';
    var exprEl = document.getElementById('formula-expr-text');
    if (exprEl) exprEl.textContent = expr + ' = ' + winner.score;

    var winnerEl = document.getElementById('formula-winner');
    if (winnerEl) winnerEl.textContent = winner.name;

    var breakdown = 'base(' + winner.baseScore + ')';
    if (winner.urgency) breakdown += ' × urgency(×2)';
    if (winner.match) breakdown += profileMatchBreakdownFragment();
    if (winner.highPropensity) breakdown += ' × propensity(×1.5)';
    if (winner.campaignMatch) breakdown += ' + campaign(+50)';
    breakdown += ' = ' + winner.score;
    var bdEl = document.getElementById('formula-breakdown');
    if (bdEl) bdEl.textContent = breakdown;

    var container = document.getElementById('formula-offers');
    if (!container) return;

    var nodes = {};
    formulaOffers.forEach(function (o) {
      var el = container.querySelector('[data-formula-id="' + o.category + '"]');
      nodes[o.category] = el;
      if (el) el._firstTop = el.getBoundingClientRect().top;
    });

    var gm = genreMatchTag();
    scored.forEach(function (o, i) {
      var isWinner = i === 0;
      var el = nodes[o.category];
      if (!el) return;
      el.classList.toggle('winner-row', isWinner);
      var rankNum = document.getElementById('frank-' + o.category);
      if (rankNum) rankNum.textContent = i + 1;
      var trophy = el.querySelector('.formula-trophy-' + o.category);
      if (trophy) trophy.textContent = isWinner ? '🏆 ' : '';
      var sub = el.querySelector('.formula-sub-' + o.category);
      if (sub) {
        sub.innerHTML =
          (o.urgency
            ? '<span style="color:#f5a623;font-weight:600;">⚡ ×2 urgency</span> · '
            : '<span style="color:rgba(255,255,255,0.35);">expires ' + o.expiresIn + 'h</span> · ') +
          (o.match ? '<span style="color:#5ecf90;font-weight:600;">' + gm + '</span> · ' : '') +
          (o.highPropensity ? '<span style="color:#c4a3f0;font-weight:600;">🧠 ×1.5 propensity</span> · ' : '') +
          (o.campaignMatch ? '<span style="color:#f87171;font-weight:600;">🚀 +50 campaign</span> · ' : '') +
          'base ' +
          o.baseScore +
          ' → <strong style="color:white;">' +
          o.score +
          '</strong>';
      }
      var scoreSpan = document.getElementById('fscore-' + o.category);
      if (scoreSpan) scoreSpan.textContent = o.score;
    });

    scored.forEach(function (o) {
      container.appendChild(nodes[o.category]);
    });

    scored.forEach(function (o) {
      var el = nodes[o.category];
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

  function dceVizSelectProfile(idx, el) {
    var root = document.getElementById('dceVizRoot');
    var ind = getIndustry();
    if (root) {
      root.querySelectorAll('.profile-card[data-dce-profile-industry="' + ind + '"]').forEach(function (c) {
        c.classList.remove('selected');
      });
    }
    el.classList.add('selected');
    aiSelectedProfileIdx = idx;
    var p = profiles[idx];
    var ar = document.getElementById('ai-reasoning');
    if (ar && p) ar.innerHTML = p.reasoning;
    renderAiRankPanel();
  }

  function updateAiSortButtonLabel() {
    var btn = document.getElementById('dce-core-ai-sort-btn');
    if (!btn) return;
    btn.textContent = aiRankSortByScore ? 'Model rank order' : 'Sort by score ↓';
    btn.setAttribute('aria-pressed', aiRankSortByScore ? 'true' : 'false');
  }

  function renderAiRankPanel() {
    var container = document.getElementById('ai-ranks');
    if (!container) return;
    var p = profiles[aiSelectedProfileIdx];
    if (!p || !Array.isArray(p.ranks)) return;

    var ranks = p.ranks.map(function (r) {
      return { name: r.name, why: r.why, conf: r.conf };
    });
    if (aiRankSortByScore) {
      ranks.sort(function (a, b) {
        return b.conf - a.conf;
      });
    }

    container.innerHTML = '';
    ranks.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'ai-offer-row' + (i === 0 ? ' top' : '');
      row.style.cssText = 'flex-direction:column; align-items:stretch; gap:6px; padding:10px 14px;';

      var topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex; align-items:center; gap:10px;';

      var rankEl = document.createElement('div');
      rankEl.className = 'ai-rank';
      rankEl.textContent = String(i + 1);

      var nameEl = document.createElement('div');
      nameEl.className = 'ai-offer-name';
      nameEl.style.flex = '1';
      nameEl.textContent = r.name;

      var confWrap = document.createElement('div');
      confWrap.className = 'ai-confidence';
      var bar = document.createElement('div');
      bar.className = 'conf-bar';
      var fill = document.createElement('div');
      fill.className = 'conf-fill';
      fill.style.width = Math.max(0, Math.min(100, Number(r.conf) || 0)) + '%';
      bar.appendChild(fill);
      var pct = document.createElement('span');
      pct.style.cssText = 'min-width:36px; text-align:right;';
      pct.textContent = (Number(r.conf) || 0) + '%';
      confWrap.appendChild(bar);
      confWrap.appendChild(pct);

      topRow.appendChild(rankEl);
      topRow.appendChild(nameEl);
      topRow.appendChild(confWrap);

      var whyEl = document.createElement('div');
      whyEl.style.cssText = 'font-size:11px; padding-left:34px; font-style:italic;';
      whyEl.textContent = r.why;
      whyEl.style.color = i === 0 ? '#1a7a4a' : '#9a948e';

      row.appendChild(topRow);
      row.appendChild(whyEl);
      container.appendChild(row);
    });
  }

  function dceVizShowPanel(id) {
    var order = ['overview', 'priority', 'formula', 'ai', 'experiment'];
    if (order.indexOf(id) < 0) return;
    var root = document.getElementById('dceVizRoot');
    if (!root) return;
    var idx = order.indexOf(id);
    var fill = document.getElementById('dce-edp-progress-fill');
    if (fill) fill.style.width = ((idx + 1) / order.length) * 100 + '%';
    order.forEach(function (p) {
      var panel = document.getElementById('panel-' + p);
      var tab = root.querySelector('[data-dce-core-panel="' + p + '"]');
      var on = p === id;
      if (panel) panel.classList.toggle('active', on);
      if (tab) tab.classList.toggle('active', on);
    });
    var sec = document.getElementById('decisioning-visualiser');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var innerContent = root.querySelector('.content');
    if (innerContent) innerContent.scrollTop = 0;
  }

  function bindVizRootClicks() {
    var root = document.getElementById('dceVizRoot');
    if (!root || root.getAttribute('data-dce-core-bound') === '1') return;
    root.setAttribute('data-dce-core-bound', '1');
    dceVizBuildIndustryDropdown();
    root.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.tab-nav .tab-btn');
      if (tab && root.contains(tab)) {
        e.preventDefault();
        var pid = tab.getAttribute('data-dce-core-panel');
        if (pid) dceVizShowPanel(pid);
        return;
      }
      var card = e.target.closest && e.target.closest('a.overview-card');
      if (card && root.contains(card)) {
        e.preventDefault();
      }
    });

    var ddBtn = document.getElementById('dce-pg-industry-btn');
    var ddMenu = document.getElementById('dce-pg-industry-menu');
    if (!ddBtn || !ddMenu) return;

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

  function setIndustry(key, persist) {
    key = migrateIndustryKey(key);
    if (!isValidIndustry(key)) key = 'media';

    var prev = migrateIndustryKey(document.body.getAttribute('data-dce-industry') || 'media');
    if (!isValidIndustry(prev)) prev = 'media';

    var hs = document.getElementById('hours-slider');
    var v = 48;
    if (hs) v = parseInt(hs.value, 10) || 48;

    document.body.setAttribute('data-dce-industry', key);
    if (persist) {
      try {
        localStorage.setItem(LS_INDUSTRY, key);
        localStorage.setItem(LS_EDP_INDUSTRY, key);
      } catch (e) {}
    }

    var pgLbl = document.getElementById('dce-pg-industry-label');
    if (pgLbl) pgLbl.textContent = INDUSTRY_LABEL_UI[key] || INDUSTRY_LABEL_UI.media;
    dceVizSyncIndustryChrome(key);

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
    } else if (key === 'telecommunications') {
      offers = PRIORITY_TELECOMMUNICATIONS.slice();
      formulaOffers = FORMULA_TELECOMMUNICATIONS.slice();
      profiles = profilesTelecommunications;
      currentInterest = 'mobile';
    } else if (key === 'sports') {
      offers = PRIORITY_SPORTS.slice();
      formulaOffers = FORMULA_SPORTS.slice();
      profiles = profilesSports;
      currentInterest = 'season';
    } else if (key === 'public') {
      offers = PRIORITY_PUBLIC.slice();
      formulaOffers = FORMULA_PUBLIC.slice();
      profiles = profilesPublic;
      currentInterest = 'housing';
    } else if (key === 'healthcare') {
      offers = PRIORITY_HEALTHCARE.slice();
      formulaOffers = FORMULA_HEALTHCARE.slice();
      profiles = profilesHealthcare;
      currentInterest = 'specialty';
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

    syncFormulaSimulationControls();
    buildFormulaList();
    if (hs) hs.value = String(v);
    var hoursValEl = document.getElementById('hours-val');
    if (hoursValEl) hoursValEl.textContent = v + 'h remaining';
    updateFormula();

    aiSelectedProfileIdx = 0;
    aiRankSortByScore = false;
    updateAiSortButtonLabel();
    var ar = document.getElementById('ai-reasoning');
    if (ar && profiles[0]) ar.innerHTML = profiles[0].reasoning;
    renderAiRankPanel();

    document.querySelectorAll('.profile-card[data-dce-profile-industry="' + key + '"]').forEach(function (c, i) {
      c.classList.toggle('selected', i === 0);
    });

    var propPill = document.getElementById('dce-formula-propensity-pill');
    if (propPill) {
      propPill.querySelectorAll('.toggle-opt').forEach(function (b, i) {
        b.classList.toggle('active', i === 1);
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

  bindVizRootClicks();
  initIndustry();

  var sortBtn = document.getElementById('dce-core-ai-sort-btn');
  if (sortBtn) {
    sortBtn.addEventListener('click', function () {
      aiRankSortByScore = !aiRankSortByScore;
      updateAiSortButtonLabel();
      renderAiRankPanel();
    });
  }

  window.dceVizShowPanel = dceVizShowPanel;
  window.dceVizSelectProfile = dceVizSelectProfile;
  window.updatePriority = updatePriority;
  window.updateFormula = updateFormula;
  window.setPropensity = setPropensity;
  window.dceFormulaPickInterest = dceFormulaPickInterest;
  window.dceFormulaPickCampaign = dceFormulaPickCampaign;
})();
