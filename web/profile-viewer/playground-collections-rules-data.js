/**
 * Collections + Decision Rules — data aligned with
 * https://github.com/alexmtmr/experience-decisioning-playground
 * (src/data/collections.js, rules.js, profiles.js)
 *
 * Retail collections use the same five definitions and offer ids (1–10) as the playground.
 * Offer titles/icons come from playground-items-offers.js when available.
 * Other industries use the same UI shape with vertical-specific catalogs.
 */
(function () {
  'use strict';

  /* Exact playground collections.js (retail) */
  var COLLECTIONS_RETAIL_PLAYGROUND = [
    {
      name: 'High-Margin Offers',
      rule: 'margin = "High"',
      items: [1, 6, 8],
      info: 'High profit margin offers — prioritized to maximize revenue per impression.',
    },
    {
      name: 'Loyalty Rewards',
      rule: 'type IN ("Loyalty","Exclusive")',
      items: [1, 2, 7],
      info: 'For loyalty members — builds retention and lifetime value.',
    },
    {
      name: 'Electronics Deals',
      rule: 'category = "Electronics"',
      items: [3, 6, 8],
      info: 'Electronics category — targets tech-interested shoppers.',
    },
    {
      name: 'Discount & Bundles',
      rule: 'type IN ("Discount","Bundle")',
      items: [4, 5, 6, 10],
      info: 'Price-led promotions for price-sensitive segments.',
    },
    {
      name: 'All Active Offers',
      rule: 'endDate > now()',
      items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      info: 'Every offer within its validity window — broadest selection.',
    },
  ];

  var RETAIL_OFFERS_FALLBACK = [
    { id: '1', title: 'Free Express Delivery', icon: '🚚' },
    { id: '2', title: '3× Loyalty Points Weekend', icon: '🏅' },
    { id: '3', title: '0% BNPL on Electronics', icon: '💳' },
    { id: '4', title: '20% Off Running Shoes', icon: '👟' },
    { id: '5', title: 'Back-to-School Bundle', icon: '🎁' },
    { id: '6', title: 'Premium Headphones €30 Off', icon: '🎧' },
    { id: '7', title: 'New Collection Preview', icon: '👕' },
    { id: '8', title: 'Smart Watch Trade-In', icon: '⌚' },
    { id: '9', title: 'Home — Free Assembly', icon: '🛋' },
    { id: '10', title: 'Grocery Flash Sale — 15% Off', icon: '🍴' },
  ];

  function buildRetailCollectionsUi() {
    var src = window.DCE_PLAYGROUND_ITEMS_BY_INDUSTRY && window.DCE_PLAYGROUND_ITEMS_BY_INDUSTRY.retail;
    var offers;
    if (src && src.length) {
      offers = src.map(function (it) {
        return { id: String(it.id), title: it.name, icon: it.ico };
      });
    } else {
      offers = RETAIL_OFFERS_FALLBACK;
    }
    var pills = COLLECTIONS_RETAIL_PLAYGROUND.map(function (c) {
      return {
        label: c.name,
        rule: c.rule,
        info: c.info,
        matchIds: c.items.map(String),
      };
    });
    return { offers: offers, pills: pills };
  }

  window.DCE_PLAYGROUND_COLLECTIONS_UI = {
    get retail() {
      return buildRetailCollectionsUi();
    },
    media: {
      offers: [
        { id: 'm1', title: 'Premium annual — 2 months free', icon: '🎬' },
        { id: 'm2', title: 'Sports live pass add-on', icon: '⚽' },
        { id: 'm3', title: 'Kids & family annual', icon: '👨‍👩‍👧' },
        { id: 'm4', title: '30-day trial — card on file', icon: '🎁' },
        { id: 'm5', title: '4K UHD tier upgrade', icon: '📺' },
        { id: 'm6', title: 'Documentary hub monthly', icon: '📚' },
        { id: 'm7', title: 'Student plan discount', icon: '🎓' },
        { id: 'm8', title: 'CTV big-screen bundle', icon: '🖥' },
        { id: 'm9', title: 'Win-back — 50% off 3 mo', icon: '💌' },
        { id: 'm10', title: 'Streaming + music bundle', icon: '🎵' },
      ],
      pills: [
        { label: 'Premium & high ARPU', ruleExpr: 'margin = "High"', description: 'Top-yield subscription SKUs — annual and tier upgrades first.', matchIds: ['m1', 'm5', 'm6'] },
        { label: 'Live & sports', ruleExpr: 'genre = "Sports"', description: 'Live events and league passes for sports-heavy profiles.', matchIds: ['m2', 'm8'] },
        { label: 'Family & kids paths', ruleExpr: 'audience IN ("Family", "Kids")', description: 'Household and parental-control bundles in the same policy.', matchIds: ['m3', 'm7'] },
        { label: 'Trial & win-back', ruleExpr: 'segment IN ("trial", "win_back")', description: 'Acquisition and re-activation offers with short windows.', matchIds: ['m4', 'm9'] },
        { label: 'Full active catalogue', ruleExpr: 'endDate > now()', description: 'Everything currently valid — broadest eligible pool.', matchIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'] },
      ],
    },
    travel: {
      offers: [
        { id: 't1', title: 'Extra legroom — long-haul', icon: '✈️' },
        { id: 't2', title: 'Checked bags — 2×23 kg', icon: '🧳' },
        { id: 't3', title: 'Priority boarding — Group 1', icon: '⭐' },
        { id: 't4', title: 'Lounge pass — departure', icon: '☕' },
        { id: 't5', title: 'Inflight Wi‑Fi streaming', icon: '📶' },
        { id: 't6', title: 'Chef meal upgrade', icon: '🍽' },
        { id: 't7', title: 'Carbon offset bundle', icon: '🌱' },
        { id: 't8', title: 'Twin seat assignment', icon: '💺' },
        { id: 't9', title: 'Family row bundle', icon: '👨‍👩‍👧' },
        { id: 't10', title: 'Last-minute upgrade window', icon: '⚡' },
      ],
      pills: [
        { label: 'High-yield ancillaries', ruleExpr: 'yield_tier = "high"', description: 'Seat and service upsells with the strongest route yield.', matchIds: ['t1', 't6', 't10'] },
        { label: 'Loyalty & status', ruleExpr: 'tier IN ("Gold", "Platinum")', description: 'Tier-based perks that stack with fare rules.', matchIds: ['t3', 't4', 't8'] },
        { label: 'Long-haul comfort', ruleExpr: 'haul = "long"', description: 'Comfort bundles for intercontinental legs.', matchIds: ['t1', 't5', 't9'] },
        { label: 'Flash & seasonal', ruleExpr: 'window IN ("flash", "seasonal")', description: 'Time-boxed ancillaries during peaks and campaigns.', matchIds: ['t7', 't10'] },
        { label: 'All bookable', ruleExpr: 'inventory > 0', description: 'Every ancillary still available for this itinerary.', matchIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'] },
      ],
    },
    fsi: {
      offers: [
        { id: 'f1', title: 'Fixed-rate mortgage — 4.19% 5 yr', icon: '🏠' },
        { id: 'f2', title: 'Balance-transfer — 0% 24 mo', icon: '💳' },
        { id: 'f3', title: 'Stocks & Shares ISA — bonus', icon: '📈' },
        { id: 'f4', title: 'Everyday cashback current', icon: '🏦' },
        { id: 'f5', title: 'Premium wealth review', icon: '👔' },
        { id: 'f6', title: 'Student account pack', icon: '🎓' },
        { id: 'f7', title: 'SMB business tariff', icon: '🏢' },
        { id: 'f8', title: 'Green retrofit loan', icon: '🌿' },
        { id: 'f9', title: 'Home insurance bundle', icon: '🛡' },
        { id: 'f10', title: 'Mobile savings — 4.5% AER', icon: '📱' },
      ],
      pills: [
        { label: 'Mortgage & lending', ruleExpr: 'product_line = "lending"', description: 'Secured lending and regulated mortgage paths.', matchIds: ['f1', 'f8'] },
        { label: 'Cards & revolving', ruleExpr: 'type IN ("card", "credit")', description: 'Card acquisition and balance mechanics.', matchIds: ['f2', 'f4'] },
        { label: 'Wealth & invest', ruleExpr: 'segment IN ("wealth", "invest")', description: 'ISA, advisory, and growth-led offers.', matchIds: ['f3', 'f5'] },
        { label: 'Everyday & acquire', ruleExpr: 'segment = "retail_banking"', description: 'Current accounts, student, and SMB entry bundles.', matchIds: ['f4', 'f6', 'f7'] },
        { label: 'All approved offers', ruleExpr: 'compliance_status = "approved"', description: 'Everything passing policy and fair-lending checks.', matchIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10'] },
      ],
    },
    telco: {
      offers: [
        { id: 'z1', title: '5G Unlimited Plus + eSIM', icon: '📱' },
        { id: 'z2', title: 'Fibre Gigabit + mesh Wi‑Fi', icon: '🏠' },
        { id: 'z3', title: 'Business multi-line + SD‑WAN', icon: '🏢' },
        { id: 'z4', title: 'Prepaid data booster', icon: '📶' },
        { id: 'z5', title: 'Family plan — 5 lines', icon: '👨‍👩‍👧' },
        { id: 'z6', title: 'Roaming Europe pass', icon: '✈️' },
        { id: 'z7', title: 'TV + fibre bundle', icon: '📺' },
        { id: 'z8', title: 'Churn save — 30% off', icon: '💌' },
        { id: 'z9', title: 'IoT fleet SIM pack', icon: '🚚' },
        { id: 'z10', title: 'Priority fault repair SLA', icon: '🔧' },
      ],
      pills: [
        { label: 'Mobile & 5G', ruleExpr: 'service = "mobile"', description: 'Handset-led and SIM-first acquisition paths.', matchIds: ['z1', 'z4', 'z5', 'z6'] },
        { label: 'Fibre & home', ruleExpr: 'service = "fixed"', description: 'Broadband and entertainment convergence.', matchIds: ['z2', 'z7'] },
        { label: 'SMB & business', ruleExpr: 'segment = "smb"', description: 'B2B connectivity and fleet-style add-ons.', matchIds: ['z3', 'z9'] },
        { label: 'Retention & save', ruleExpr: 'journey IN ("save", "retention")', description: 'Discounts and SLAs aimed at reducing churn.', matchIds: ['z8', 'z10'] },
        { label: 'All in-market', ruleExpr: 'status = "active"', description: 'Every SKU currently purchasable in region.', matchIds: ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'z9', 'z10'] },
      ],
    },
    automotive: {
      offers: [
        { id: 'a1', title: 'Hybrid SUV PCP weekend', icon: '🚙' },
        { id: 'a2', title: 'EV bundle — wallbox + tariff', icon: '🔌' },
        { id: 'a3', title: 'Service plan+ — 36k miles', icon: '🛠' },
        { id: 'a4', title: 'Winter tyre pack', icon: '❄' },
        { id: 'a5', title: 'Fleet multi-vehicle lease', icon: '🚚' },
        { id: 'a6', title: 'EV test-drive incentive', icon: '🎁' },
        { id: 'a7', title: 'Accessories & retrofit pack', icon: '🧰' },
        { id: 'a8', title: 'PCP end-of-term upgrade', icon: '🔄' },
        { id: 'a9', title: 'Certified pre-owned warranty', icon: '✅' },
        { id: 'a10', title: 'Mobile tyre fitting', icon: '🛞' },
      ],
      pills: [
        { label: 'EV & electrification', ruleExpr: 'powertrain = "EV"', description: 'Charging, tariffs, and EV-first programmes.', matchIds: ['a2', 'a6'] },
        { label: 'Retail PCP', ruleExpr: 'programme = "retail_pcp"', description: 'Consumer finance and showroom-led vehicles.', matchIds: ['a1', 'a8'] },
        { label: 'Aftersales & care', ruleExpr: 'journey = "aftersales"', description: 'Service, tyres, and workshop attach.', matchIds: ['a3', 'a4', 'a10'] },
        { label: 'Fleet & business', ruleExpr: 'segment = "fleet"', description: 'Multi-vehicle and B2B incentives.', matchIds: ['a5', 'a9'] },
        { label: 'All programmes', ruleExpr: 'stock > 0', description: 'Every offer with available stock in market.', matchIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'] },
      ],
    },
    healthcare: {
      offers: [
        { id: 'h1', title: 'Virtual primary — same-day video', icon: '🩺' },
        { id: 'h2', title: 'Specialty — cardiology intake', icon: '🏥' },
        { id: 'h3', title: 'Pharmacy 90-day + coaching', icon: '💊' },
        { id: 'h4', title: 'Employer biometric screening', icon: '💼' },
        { id: 'h5', title: 'Urgent care video queue', icon: '⚡' },
        { id: 'h6', title: 'Chronic care — diabetes pathway', icon: '🫀' },
        { id: 'h7', title: 'Maternity bundle', icon: '🍼' },
        { id: 'h8', title: 'Mental health — EAP 6 sessions', icon: '🧠' },
        { id: 'h9', title: 'Preventive screening kit', icon: '📋' },
        { id: 'h10', title: 'Dental discount network', icon: '🦷' },
      ],
      pills: [
        { label: 'Virtual & primary', ruleExpr: 'care_mode = "virtual"', description: 'Digital front door and same-day access.', matchIds: ['h1', 'h5'] },
        { label: 'Specialty & referral', ruleExpr: 'pathway = "specialty"', description: 'Referral-led and specialty queues.', matchIds: ['h2', 'h6'] },
        { label: 'Pharmacy & wellness', ruleExpr: 'programme IN ("pharmacy", "wellness")', description: 'Medication adherence and prevention.', matchIds: ['h3', 'h9'] },
        { label: 'Employer & benefits', ruleExpr: 'payer = "employer"', description: 'Sponsored screenings and carve-outs.', matchIds: ['h4', 'h7', 'h8'] },
        { label: 'All covered', ruleExpr: 'eligible = true', description: 'Full benefits-eligible catalogue for this member.', matchIds: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'] },
      ],
    },
  };

  window.DCE_PLAYGROUND_RULES_DATA = {
    retail: {
      rules: [
        { title: 'VIP Customers Only', keepsLabel: 'keeps ~20%', source: 'Profile', condition: 'loyaltyTier IN ("Platinum","Gold")', icon: '👑', keepRate: 0.2 },
        { title: 'Cart Value > €80', keepsLabel: 'keeps ~50%', source: 'Context', condition: 'cart.value > 80', icon: '🛒', keepRate: 0.5 },
        { title: 'Category Browsers', keepsLabel: 'keeps ~70%', source: 'Event', condition: 'browsedCategories CONTAINS "…"', icon: '🖥', keepRate: 0.7 },
        { title: 'Repeat Purchasers', keepsLabel: 'keeps ~40%', source: 'Computed', condition: 'purchaseCount ≥ 3 in 90d', icon: '🔁', keepRate: 0.4 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan, 34 · Platinum', detail: 'App-first · 3-4×/mo · Electronics & Beauty', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley, 27 · No tier', detail: 'Cart abandons · Converts on promo', pass: [false, false, true, false] },
        { initials: 'P', line: 'The Parkers · Silver', detail: 'Weekly family shop · School list + home', pass: [false, true, true, true] },
      ],
    },
    media: {
      rules: [
        { title: 'Premium subscribers', keepsLabel: 'keeps ~22%', logic: 'Profile · subscriptionTier IN ("Premium", "Annual")', icon: '⭐', keepRate: 0.22 },
        { title: 'High engagement viewers', keepsLabel: 'keeps ~48%', logic: 'Computed · watchHours30d ≥ 8', icon: '📺', keepRate: 0.48 },
        { title: 'Genre affinity match', keepsLabel: 'keeps ~65%', logic: 'Profile · genreAffinity CONTAINS campaign.genre', icon: '🎬', keepRate: 0.65 },
        { title: 'Win-back cohort', keepsLabel: 'keeps ~35%', logic: 'Segment · churnRisk90d = true', icon: '💌', keepRate: 0.35 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Premium annual', pass: [true, true, true, false] },
        { initials: 'R', line: 'Riley · Ad-supported tier', pass: [false, false, true, true] },
        { initials: 'P', line: 'The Parkers · Family plan', pass: [true, true, false, false] },
      ],
    },
    travel: {
      rules: [
        { title: 'Gold & Platinum tier', keepsLabel: 'keeps ~18%', logic: 'Profile · loyaltyTier IN ("Gold", "Platinum")', icon: '✈️', keepRate: 0.18 },
        { title: 'Long-haul route', keepsLabel: 'keeps ~45%', logic: 'Context · haul = "long"', icon: '🌍', keepRate: 0.45 },
        { title: 'Ancillary window open', keepsLabel: 'keeps ~72%', logic: 'Context · hoursToDeparture ≤ 48', icon: '⏱', keepRate: 0.72 },
        { title: 'Repeat route bookers', keepsLabel: 'keeps ~38%', logic: 'Computed · segmentsFlown12m ≥ 3', icon: '🔁', keepRate: 0.38 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Platinum · LHR→SFO', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley · Member · short-haul', pass: [false, false, true, false] },
        { initials: 'P', line: 'The Parkers · Silver · family', pass: [false, true, true, true] },
      ],
    },
    fsi: {
      rules: [
        { title: 'Authenticated session', keepsLabel: 'keeps ~55%', logic: 'Context · channel IN ("mobile_bank", "web_auth")', icon: '🔐', keepRate: 0.55 },
        { title: 'Wealth & invest intent', keepsLabel: 'keeps ~15%', logic: 'Profile · intentScore ≥ 0.75', icon: '📈', keepRate: 0.15 },
        { title: 'Product eligible', keepsLabel: 'keeps ~60%', logic: 'Profile · regulatedProduct IN ("mortgage", "isa")', icon: '🏦', keepRate: 0.6 },
        { title: 'Marketing consent', keepsLabel: 'keeps ~80%', logic: 'Consent · marketing = true', icon: '✉️', keepRate: 0.8 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Logged-in · mortgage intent', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley · Guest · browsing', pass: [false, false, false, false] },
        { initials: 'P', line: 'The Parkers · ISA · opted in', pass: [true, false, true, true] },
      ],
    },
    telco: {
      rules: [
        { title: 'Unlimited mobile plan', keepsLabel: 'keeps ~28%', logic: 'Profile · planType = "unlimited"', icon: '📱', keepRate: 0.28 },
        { title: 'Fibre-addressable', keepsLabel: 'keeps ~52%', logic: 'Context · serviceability.fibre = true', icon: '🏠', keepRate: 0.52 },
        { title: 'SMB account', keepsLabel: 'keeps ~12%', logic: 'Segment · accountType = "smb"', icon: '🏢', keepRate: 0.12 },
        { title: 'Save / retention journey', keepsLabel: 'keeps ~33%', logic: 'Journey · stage IN ("save", "retention")', icon: '💌', keepRate: 0.33 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Unlimited · fibre-ready', pass: [true, true, false, false] },
        { initials: 'R', line: 'Riley · Prepaid · urban', pass: [false, true, false, true] },
        { initials: 'P', line: 'The Parkers · SMB static IP', pass: [false, true, true, false] },
      ],
    },
    automotive: {
      rules: [
        { title: 'EV hand-raiser', keepsLabel: 'keeps ~20%', logic: 'Profile · interestTags CONTAINS "EV"', icon: '🔌', keepRate: 0.2 },
        { title: 'PCP retail eligible', keepsLabel: 'keeps ~45%', logic: 'Context · programme = "retail_pcp"', icon: '🚙', keepRate: 0.45 },
        { title: 'Service due ≤ 90d', keepsLabel: 'keeps ~58%', logic: 'Vehicle · serviceDueDays ≤ 90', icon: '🛠', keepRate: 0.58 },
        { title: 'Fleet / business', keepsLabel: 'keeps ~14%', logic: 'Segment · buyer = "fleet"', icon: '🚚', keepRate: 0.14 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · EV configure · PCP', pass: [true, true, true, false] },
        { initials: 'R', line: 'Riley · First enquiry · cash', pass: [false, false, false, false] },
        { initials: 'P', line: 'The Parkers · Workshop due · ICE', pass: [false, true, true, false] },
      ],
    },
    healthcare: {
      rules: [
        { title: 'Benefits active', keepsLabel: 'keeps ~70%', logic: 'Coverage · status = "active"', icon: '🩺', keepRate: 0.7 },
        { title: 'Virtual care eligible', keepsLabel: 'keeps ~40%', logic: 'Benefits · virtualVisitsRemaining > 0', icon: '💻', keepRate: 0.4 },
        { title: 'Chronic programme', keepsLabel: 'keeps ~25%', logic: 'Programme · pathway IN ("diabetes", "heart")', icon: '🫀', keepRate: 0.25 },
        { title: 'Employer-sponsored', keepsLabel: 'keeps ~35%', logic: 'Payer · type = "employer"', icon: '💼', keepRate: 0.35 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · PPO · diabetes CM', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley · Gap coverage · ad-hoc', pass: [false, false, false, false] },
        { initials: 'P', line: 'The Parkers · Employer HSA', pass: [true, true, false, true] },
      ],
    },
  };
})();
