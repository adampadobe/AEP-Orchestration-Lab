/**
 * Decisioning controls tab (cascade view) — chips + SCENARIOS for mini-cards 01–06 in
 * the-anatomy-of-a-decision-v19-1.html. Merged by ajo-pipeline-industry-apply.js after
 * SF_JOURNEYS / SF_PATHS label patches. Omitted for `fsi` (HTML + SCENARIOS baseline).
 */
(function () {
  var ST = {
    mobile: '19:00',
    desktop: '09:00',
    hours_m: [
      0.15, 0.12, 0.08, 0.06, 0.05, 0.1, 0.25, 0.55, 0.82, 0.75, 0.6, 0.48, 0.52, 0.58, 0.45, 0.38, 0.5, 0.72, 0.9,
      0.95, 0.85, 0.65, 0.42, 0.22,
    ],
    hours_d: [
      0.08, 0.05, 0.04, 0.03, 0.02, 0.15, 0.45, 0.78, 0.9, 0.85, 0.72, 0.55, 0.48, 0.52, 0.6, 0.58, 0.42, 0.35,
      0.25, 0.18, 0.12, 0.1, 0.08, 0.06,
    ],
  };

  var S5 = [
    [0.87, 0.91, 0.62],
    [0.64, 0.72, 0.48],
    [0.51, 0.68, 0.35],
    [0.38, 0.42, 0.31],
    [0.29, 0.18, 0.78],
  ];

  function jM(names) {
    return names.map(function (n, i) {
      var s = S5[i] || [0.5, 0.6, 0.4];
      return { name: n, scores: { balanced: s[0], aggressive: s[1], retention: s[2] } };
    });
  }

  function sendCopy() {
    return {
      mobile: ST.mobile,
      desktop: ST.desktop,
      hours_m: ST.hours_m.slice(),
      hours_d: ST.hours_d.slice(),
    };
  }

  function mk(label, ps, jnames, paths, infl, chM, chD, msgs, rt, rd) {
    return {
      label: label,
      propScore: ps,
      journeys: jM(jnames),
      paths: paths,
      pathInfluence: infl,
      channels: { mobile: chM, desktop: chD },
      sendTime: sendCopy(),
      msgSections: msgs,
      resultTitle: rt,
      resultDesc: rd,
    };
  }

  function chM1() {
    return [
      { name: 'Push notification', score: 0.84, sel: true },
      { name: 'Email', score: 0.71, sel: false },
      { name: 'SMS', score: 0.66, sel: false },
      { name: 'In-app', score: 0.52, sel: false },
    ];
  }

  function chD1() {
    return [
      { name: 'Email', score: 0.82, sel: true },
      { name: 'In-app', score: 0.68, sel: false },
      { name: 'Push notification', score: 0.54, sel: false },
      { name: 'SMS', score: 0.48, sel: false },
    ];
  }

  function travelPack() {
    var jn = [
      'Long-haul ancillaries',
      'Short-haul bundles',
      'Loyalty accelerator',
      'Airport retail & parking',
      'Partner earn push',
    ];
    var p0 = [
      { name: 'Seat + bag bundle', pct: 67, sel: true },
      { name: 'Upgrade auction path', pct: 58, sel: false },
      { name: 'Standard ancillaries', pct: 42, sel: false },
    ];
    var mRefi = [
      { section: 'Hero', content: 'Bundle bags + Wi‑Fi for your LHR→SFO trip', active: true },
      { section: 'Body', content: 'Seat map with exit-row availability and partner earn', active: true },
      { section: 'Social proof', content: '18k travellers added ancillaries this week', active: false },
      { section: 'CTA', content: '"Review bundle" — deep-link to trip wallet', active: true },
      { section: 'Cross-sell', content: 'Lounge pass + travel insurance — ranked next best', active: true },
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">High-yield routes</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">App-first itinerary</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Web booking preference</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Gold elite lounge</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">Disruption-prone flyer</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">New loyalty enrollee</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Long-haul ancillaries</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">Loyalty accelerator</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Co-brand perks</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">Status retention</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'High-yield routes',
        'mobile-first': 'App-first itinerary',
        'desktop-pref': 'Web booking preference',
        'mortgage-holder': 'Gold elite lounge',
        'high-churn': 'Disruption-prone flyer',
        'new-customer': 'New loyalty enrollee',
      },
      channelHints: { mobile: 'App-first itinerary signal', desktop: 'Web booking preference signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Long-haul ancillaries',
          0.82,
          jn,
          p0,
          ['IROP disruption window', 'Cabin upgrade fit', 'Partner earn velocity'],
          chM1(),
          chD1(),
          mRefi,
          'Optimised for ancillary attach on long-haul',
          'Trip context, elite tier, and mobile-first behaviour lift the ancillary bundle path, push in the evening peak, and trip-wallet messaging without mortgage metaphors.'
        ),
        invest: mk(
          'Loyalty accelerator',
          0.61,
          ['Loyalty accelerator', 'Long-haul ancillaries', 'Co-brand perks', 'Partner earn push', 'Short-haul bundles'],
          [
            { name: 'Lounge + miles webinar', pct: 61, sel: true },
            { name: 'Family traveller pack', pct: 55, sel: false },
            { name: 'Gold service desk', pct: 38, sel: false },
          ],
          ['Status gap', 'Partner earn curve', 'Elite service propensity'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Double miles on partner hotels this month', active: true },
            { section: 'Body', content: 'Workshop invite + tier review checklist', active: true },
            { section: 'Social proof', content: 'Top flyers unlocked status in 6 weeks', active: false },
            { section: 'CTA', content: '"Reserve my session" — calendar deep link', active: true },
            { section: 'Cross-sell', content: 'Car hire partner earn — decisioning ranked', active: true },
          ],
          'Optimised for loyalty education and earn',
          'Loyalty propensity (0.61) shifts toward email on desktop mornings, education-first paths, and partner-earn cross-sell blocks.'
        ),
        card: mk(
          'Co-brand perks',
          0.44,
          ['Co-brand perks', 'Long-haul ancillaries', 'Loyalty accelerator', 'Partner earn push', 'Short-haul bundles'],
          [
            { name: 'Co-brand perks compare', pct: 54, sel: true },
            { name: 'Spend-to-miles calculator', pct: 48, sel: false },
            { name: 'Standard card offer', pct: 35, sel: false },
          ],
          ['Wallet spend', 'Route frequency', 'Lounge utilisation'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Miles multiplier on travel booked with your card', active: true },
            { section: 'Body', content: 'Calculator: next trip could earn 12k miles', active: true },
            { section: 'Social proof', content: 'Cardholders saved 14% on ancillaries', active: false },
            { section: 'CTA', content: '"Compare perks" — instant pre-qual', active: true },
            { section: 'Cross-sell', content: 'Lounge day-pass — ranked next best', active: true },
          ],
          'Optimised for co-brand conversion',
          'Spend-to-miles signals favour the perk-comparison path, mobile push at lunch, and miles-forward hero copy.'
        ),
        retain: mk(
          'Status retention',
          0.38,
          ['Status retention', 'Long-haul ancillaries', 'Partner earn push', 'Loyalty accelerator', 'Short-haul bundles'],
          [
            { name: 'Status match save', pct: 72, sel: true },
            { name: 'Gold renewal pack', pct: 65, sel: false },
            { name: 'Standard notice', pct: 40, sel: false },
          ],
          ['Tier risk', 'Partner breakage', 'Disruption sensitivity'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Jordan, your Gold benefits renew in 30 days', active: true },
            { section: 'Body', content: 'Bonus miles + partner fast-track for early renew', active: true },
            { section: 'Social proof', content: 'Your personalised 2026 travel value recap', active: true },
            { section: 'CTA', content: '"Keep my Gold perks" — one tap', active: true },
            { section: 'Cross-sell', content: 'Priority security voucher — optional attach', active: false },
          ],
          'Optimised for elite retention',
          'Retention formula lifts SMS at 10:00, save-first paths, and value reinforcement over hard cross-sell.'
        ),
      },
    };
  }

  function mediaPack() {
    var jn = [
      'Upgrade & save',
      'Win-back offer',
      'Trial conversion',
      'Content discovery',
      'Family plan pitch',
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">Premium SVOD tier</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">Smart-TV primary</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Desktop binge viewer</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Binge cluster · drama</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">Trial ending soon</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">Ad-tier eligible</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Upgrade & save</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">Win-back offer</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Trial conversion</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">Family plan pitch</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'Premium SVOD tier',
        'mobile-first': 'Smart-TV primary',
        'desktop-pref': 'Desktop binge viewer',
        'mortgage-holder': 'Binge cluster · drama',
        'high-churn': 'Trial ending soon',
        'new-customer': 'Ad-tier eligible',
      },
      channelHints: { mobile: 'Smart-TV + mobile app signal', desktop: 'Desktop binge signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Upgrade & save',
          0.82,
          jn,
          [
            { name: 'Upgrade checkout', pct: 67, sel: true },
            { name: 'Drama bundle path', pct: 58, sel: false },
            { name: 'Standard offers page', pct: 42, sel: false },
          ],
          ['Binge streak', 'Trial window', 'Ad tolerance'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Upgrade annual + drama bundle in one checkout', active: true },
            { section: 'Body', content: 'Save tile vs ad-tier — personalised comparison', active: true },
            { section: 'Social proof', content: '1.2M upgrades this quarter', active: false },
            { section: 'CTA', content: '"See my upgrade" — in-app sheet', active: true },
            { section: 'Cross-sell', content: 'Sports add-on — ranked next best', active: true },
          ],
          'Optimised for upgrade conversion',
          'Upgrade propensity (0.82), smart-TV signal, and premium tier cascade into the checkout path, push at evening peak, and bundle-forward creative.'
        ),
        invest: mk(
          'Win-back offer',
          0.61,
          ['Win-back offer', 'Upgrade & save', 'Trial conversion', 'Content discovery', 'Family plan pitch'],
          [
            { name: 'Save desk callback', pct: 61, sel: true },
            { name: 'In-app upgrade flow', pct: 55, sel: false },
            { name: 'Standard offers page', pct: 38, sel: false },
          ],
          ['Churn score', 'Watch-time drop', 'Price sensitivity'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'We saved your spot — 40% comeback offer', active: true },
            { section: 'Body', content: 'Pick up the series you paused mid-season', active: true },
            { section: 'Social proof', content: 'Fans who returned binged 3× more', active: false },
            { section: 'CTA', content: '"Restart my trial" — one tap', active: true },
            { section: 'Cross-sell', content: 'Kids profile add-on — ranked next best', active: true },
          ],
          'Optimised for win-back acceptance',
          'Win-back propensity shifts email-first mornings, agent-assisted save path, and comeback-focused copy.'
        ),
        card: mk(
          'Trial conversion',
          0.44,
          ['Trial conversion', 'Upgrade & save', 'Content discovery', 'Family plan pitch', 'Win-back offer'],
          [
            { name: 'In-app upgrade flow', pct: 54, sel: true },
            { name: 'Watch-time calculator', pct: 48, sel: false },
            { name: 'Standard upgrade', pct: 35, sel: false },
          ],
          ['Trial usage', 'Genre affinity', 'Payment readiness'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Lock your trial price before it ends', active: true },
            { section: 'Body', content: 'Card on file + annual discount stack', active: true },
            { section: 'Social proof', content: 'Trials that convert watch 5+ hrs/week', active: false },
            { section: 'CTA', content: '"Keep my plan" — wallet sheet', active: true },
            { section: 'Cross-sell', content: 'Ad-free tier teaser — ranked next best', active: true },
          ],
          'Optimised for trial conversion',
          'Trial propensity routes mobile lunch window, frictionless upgrade path, and urgency-led hero.'
        ),
        retain: mk(
          'Family plan pitch',
          0.38,
          ['Family plan pitch', 'Upgrade & save', 'Content discovery', 'Win-back offer', 'Trial conversion'],
          [
            { name: 'Kids profile onboarding', pct: 72, sel: true },
            { name: 'Partner success call', pct: 65, sel: false },
            { name: 'Standard offers page', pct: 40, sel: false },
          ],
          ['Household size', 'Kids profile gap', 'Co-viewing'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Alex, add seats for the household plan', active: true },
            { section: 'Body', content: 'PIN-safe kids rails + parental controls', active: true },
            { section: 'Social proof', content: 'Households stream 2× genres with family plan', active: true },
            { section: 'CTA', content: '"Add profiles" — guided flow', active: true },
            { section: 'Cross-sell', content: 'Sports weekend pass — optional attach', active: false },
          ],
          'Optimised for household attach',
          'Retention-focus lifts SMS morning bursts, onboarding-first path, and household messaging.'
        ),
      },
    };
  }

  function retailPack() {
    var jn = [
      'Express checkout recovery',
      'Loyalty rewards lane',
      'Markdown & clearance',
      'Upsell attach path',
      'Brand stories & editorial',
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">High-value shopper</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">Mobile app–first</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Desktop catalogue</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Cart abandoner · 72h</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">Returns risk</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">Beauty & wellness buyer</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Express checkout recovery</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">Loyalty rewards lane</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Upsell attach path</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">Markdown & clearance</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'High-value shopper',
        'mobile-first': 'Mobile app–first',
        'desktop-pref': 'Desktop catalogue',
        'mortgage-holder': 'Cart abandoner · 72h',
        'high-churn': 'Returns risk',
        'new-customer': 'Beauty & wellness buyer',
      },
      channelHints: { mobile: 'App-first shopper signal', desktop: 'Desktop catalogue signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Express checkout recovery',
          0.82,
          jn,
          [
            { name: 'Abandoned cart rescue', pct: 67, sel: true },
            { name: 'Click & collect fast lane', pct: 58, sel: false },
            { name: 'Standard promo page', pct: 42, sel: false },
          ],
          ['Basket heat', 'Free-ship threshold', 'Loyalty tier'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Your basket is waiting — free delivery unlocked', active: true },
            { section: 'Body', content: 'One-tap checkout with saved address', active: true },
            { section: 'Social proof', content: '12k shoppers recovered baskets this week', active: false },
            { section: 'CTA', content: '"Complete checkout" — deep link', active: true },
            { section: 'Cross-sell', content: 'Care plan attach — ranked next best', active: true },
          ],
          'Optimised for basket recovery',
          'Cart propensity (0.82) with mobile-first signal selects push evening slot, rescue path, and ship-forward copy.'
        ),
        invest: mk(
          'Loyalty rewards lane',
          0.61,
          ['Loyalty rewards lane', 'Express checkout recovery', 'Upsell attach path', 'Markdown & clearance', 'Brand stories & editorial'],
          [
            { name: 'Tier perks workshop', pct: 61, sel: true },
            { name: 'App-only flash sale', pct: 55, sel: false },
            { name: 'Standard promo page', pct: 38, sel: false },
          ],
          ['Points balance', 'Tier velocity', 'Category affinity'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Double points on beauty this weekend', active: true },
            { section: 'Body', content: 'Workshop RSVP + burn calculator', active: true },
            { section: 'Social proof', content: 'Platinum members redeemed 3× faster', active: false },
            { section: 'CTA', content: '"Book my slot" — calendar link', active: true },
            { section: 'Cross-sell', content: 'Click & collect upgrade — ranked next best', active: true },
          ],
          'Optimised for loyalty burn',
          'Loyalty propensity routes email mornings, education-first path, and points-led hero.'
        ),
        card: mk(
          'Upsell attach path',
          0.44,
          ['Upsell attach path', 'Express checkout recovery', 'Loyalty rewards lane', 'Markdown & clearance', 'Brand stories & editorial'],
          [
            { name: 'Care plan assessment', pct: 54, sel: true },
            { name: 'Bundle with delivery plus', pct: 48, sel: false },
            { name: 'Standard upgrade', pct: 35, sel: false },
          ],
          ['SKU category', 'Delivery slot', 'Warranty propensity'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Protect your new blazer for £2/mo', active: true },
            { section: 'Body', content: 'Care tiers matched to basket value', active: true },
            { section: 'Social proof', content: 'Attach rate up 14% with contextual care', active: false },
            { section: 'CTA', content: '"Add care" — checkout step', active: true },
            { section: 'Cross-sell', content: 'Extended returns — ranked next best', active: true },
          ],
          'Optimised for attach revenue',
          'Attach propensity favours checkout-step care, mobile path, and SKU-aware blocks.'
        ),
        retain: mk(
          'Markdown & clearance',
          0.38,
          ['Markdown & clearance', 'Express checkout recovery', 'Brand stories & editorial', 'Loyalty rewards lane', 'Upsell attach path'],
          [
            { name: 'Win-back voucher', pct: 72, sel: true },
            { name: 'Platinum fee waiver', pct: 65, sel: false },
            { name: 'Standard promo page', pct: 40, sel: false },
          ],
          ['Lapse score', 'Category affinity', 'Promo fatigue'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Morgan, your VIP weekend markdown is live', active: true },
            { section: 'Body', content: 'Reserved sizes in your saved brands', active: true },
            { section: 'Social proof', content: 'Early access for Platinum only', active: true },
            { section: 'CTA', content: '"Shop my edit" — app deep link', active: true },
            { section: 'Cross-sell', content: 'Free ship threshold nudge — optional', active: false },
          ],
          'Optimised for clearance engagement',
          'Retention-focus lifts SMS bursts, voucher-first path, and VIP framing.'
        ),
      },
    };
  }

  function sportsPack() {
    var jn = [
      'Season ticket renewal',
      'Single-match upsell',
      'Membership upgrade',
      'Merch drop pre-sale',
      'Broadcast bundle',
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">Season ticket holder</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">Stadium app user</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Web replay viewer</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Concession power buyer</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">Attendance risk</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">First-time fan</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Season ticket renewal</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">Membership upgrade</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Single-match upsell</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">Merch drop pre-sale</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'Season ticket holder',
        'mobile-first': 'Stadium app user',
        'desktop-pref': 'Web replay viewer',
        'mortgage-holder': 'Concession power buyer',
        'high-churn': 'Attendance risk',
        'new-customer': 'First-time fan',
      },
      channelHints: { mobile: 'Stadium app + push signal', desktop: 'Web replay signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Season ticket renewal',
          0.82,
          jn,
          [
            { name: 'Renewal checkout', pct: 67, sel: true },
            { name: 'Payment plan path', pct: 58, sel: false },
            { name: 'Standard renewal page', pct: 42, sel: false },
          ],
          ['Seat utilisation', 'Playoff interest', 'Member tenure'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Lock 2026 seats before public on-sale', active: true },
            { section: 'Body', content: '3-installment plan with member perks', active: true },
            { section: 'Social proof', content: '92% of early renewals kept same seats', active: false },
            { section: 'CTA', content: '"Renew now" — wallet', active: true },
            { section: 'Cross-sell', content: 'Parking pass add-on — ranked next best', active: true },
          ],
          'Optimised for season renewal',
          'Renewal propensity (0.82) with app-first behaviour selects push peaks, express renewal path, and seat-hold copy.'
        ),
        invest: mk(
          'Membership upgrade',
          0.61,
          ['Membership upgrade', 'Season ticket renewal', 'Single-match upsell', 'Merch drop pre-sale', 'Broadcast bundle'],
          [
            { name: 'Member lounge access', pct: 61, sel: true },
            { name: 'Upgrade concierge', pct: 55, sel: false },
            { name: 'Standard upgrade page', pct: 38, sel: false },
          ],
          ['Visit frequency', 'Merch spend', 'Playoff intent'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Gold member lane + lounge fast pass', active: true },
            { section: 'Body', content: 'Compare tiers with playoff priority', active: true },
            { section: 'Social proof', content: 'Gold members attended 4 more matches', active: false },
            { section: 'CTA', content: '"Upgrade today" — in-app', active: true },
            { section: 'Cross-sell', content: 'Merch bundle — ranked next best', active: true },
          ],
          'Optimised for membership upgrade',
          'Upgrade propensity shifts email-first, concierge path, and tier-benefit blocks.'
        ),
        card: mk(
          'Single-match upsell',
          0.44,
          ['Single-match upsell', 'Season ticket renewal', 'Broadcast bundle', 'Merch drop pre-sale', 'Membership upgrade'],
          [
            { name: 'Dynamic pricing tile', pct: 54, sel: true },
            { name: 'Add-on bundle path', pct: 48, sel: false },
            { name: 'Standard ticket page', pct: 35, sel: false },
          ],
          ['Rivalry demand', 'Weather window', 'Seat map heat'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Better seats just opened for Saturday', active: true },
            { section: 'Body', content: 'Map view with aisle preference', active: true },
            { section: 'Social proof', content: 'Fans who upgraded sat 12 rows closer', active: false },
            { section: 'CTA', content: '"Grab seats" — Apple Pay', active: true },
            { section: 'Cross-sell', content: 'Concession pre-order — ranked next best', active: true },
          ],
          'Optimised for match-day upsell',
          'Upsell propensity targets mobile game-day window, dynamic seat path, and urgency hero.'
        ),
        retain: mk(
          'Merch drop pre-sale',
          0.38,
          ['Merch drop pre-sale', 'Season ticket renewal', 'Membership upgrade', 'Single-match upsell', 'Broadcast bundle'],
          [
            { name: 'VIP merch queue', pct: 72, sel: true },
            { name: 'Member early access', pct: 65, sel: false },
            { name: 'General drop page', pct: 40, sel: false },
          ],
          ['Merch affinity', 'Drop history', 'Loyalty tier'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Member-only jersey drop in 2 hours', active: true },
            { section: 'Body', content: 'Saved size + express ship to seat', active: true },
            { section: 'Social proof', content: 'Last drop sold out in 14 minutes', active: true },
            { section: 'CTA', content: '"Join the queue" — app', active: true },
            { section: 'Cross-sell', content: 'Digital collectible — optional', active: false },
          ],
          'Optimised for merch hype',
          'Retention-focus uses SMS bursts, queue-first path, and scarcity copy.'
        ),
      },
    };
  }

  function telcoPack() {
    var jn = [
      'Fibre upgrade push',
      '5G handset refresh',
      'Roaming saver',
      'SMB bundle',
      'Loyalty perks lane',
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">Multi-line household</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">5G heavy usage</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Fixed-line primary</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Roaming frequent</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">Competitive offer risk</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">New line port-in</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Fibre upgrade push</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">5G handset refresh</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Roaming saver</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">SMB bundle</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'Multi-line household',
        'mobile-first': '5G heavy usage',
        'desktop-pref': 'Fixed-line primary',
        'mortgage-holder': 'Roaming frequent',
        'high-churn': 'Competitive offer risk',
        'new-customer': 'New line port-in',
      },
      channelHints: { mobile: '5G + app care signal', desktop: 'Fixed-line portal signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Fibre upgrade push',
          0.82,
          jn,
          [
            { name: 'Self-install fibre kit', pct: 67, sel: true },
            { name: 'Technician slot booking', pct: 58, sel: false },
            { name: 'Standard fibre page', pct: 42, sel: false },
          ],
          ['Speed tests', 'Neighbourhood fibre', 'Contract window'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Double speed for £7/mo more', active: true },
            { section: 'Body', content: 'Router swap + install checklist', active: true },
            { section: 'Social proof', content: 'Neighbours upgraded 3× this month', active: false },
            { section: 'CTA', content: '"Book install" — app', active: true },
            { section: 'Cross-sell', content: 'Mesh Wi‑Fi pods — ranked next best', active: true },
          ],
          'Optimised for fibre attach',
          'Upgrade propensity (0.82) with heavy usage selects push evening, self-install path, and speed-led hero.'
        ),
        invest: mk(
          '5G handset refresh',
          0.61,
          ['5G handset refresh', 'Fibre upgrade push', 'Roaming saver', 'SMB bundle', 'Loyalty perks lane'],
          [
            { name: 'Trade-in estimator', pct: 61, sel: true },
            { name: 'Retail pickup lane', pct: 55, sel: false },
            { name: 'Standard handset page', pct: 38, sel: false },
          ],
          ['Device age', 'Network band', 'Trade value'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Your phone is 36 months old — refresh deals', active: true },
            { section: 'Body', content: 'Trade-in + 0% financing stack', active: true },
            { section: 'Social proof', content: '5G users saw 2× faster downloads', active: false },
            { section: 'CTA', content: '"See trade value" — flow', active: true },
            { section: 'Cross-sell', content: 'Accessory bundle — ranked next best', active: true },
          ],
          'Optimised for handset refresh',
          'Refresh propensity routes email mornings, trade-in-first path, and financing blocks.'
        ),
        card: mk(
          'Roaming saver',
          0.44,
          ['Roaming saver', 'Fibre upgrade push', 'SMB bundle', 'Loyalty perks lane', '5G handset refresh'],
          [
            { name: 'Travel pass builder', pct: 54, sel: true },
            { name: 'Destination bundle', pct: 48, sel: false },
            { name: 'Pay-as-you-go roam', pct: 35, sel: false },
          ],
          ['Trip dates', 'Destination cluster', 'Data caps'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: '7-day EU pass for your Barcelona trip', active: true },
            { section: 'Body', content: 'Cap alerts + Wi‑Fi offload tips', active: true },
            { section: 'Social proof', content: 'Savers cut roaming bills 41%', active: false },
            { section: 'CTA', content: '"Add pass" — one tap', active: true },
            { section: 'Cross-sell', content: 'Travel insurance partner — ranked next best', active: true },
          ],
          'Optimised for roaming attach',
          'Roaming propensity uses trip context, mobile path, and pass-first creative.'
        ),
        retain: mk(
          'SMB bundle',
          0.38,
          ['SMB bundle', 'Fibre upgrade push', 'Loyalty perks lane', '5G handset refresh', 'Roaming saver'],
          [
            { name: 'SMB retention desk', pct: 72, sel: true },
            { name: 'Dedicated account manager', pct: 65, sel: false },
            { name: 'Standard SMB page', pct: 40, sel: false },
          ],
          ['ARPU trend', 'SLA tickets', 'Competitive quotes'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Lock your SMB bundle before renewal spike', active: true },
            { section: 'Body', content: 'Dedicated line + static IP included', active: true },
            { section: 'Social proof', content: 'SMBs on bundle churn 32% less', active: true },
            { section: 'CTA', content: '"Talk to retention" — call-back', active: true },
            { section: 'Cross-sell', content: 'Cyber-security add-on — optional', active: false },
          ],
          'Optimised for SMB save',
          'Retention-focus lifts SMS, desk-first path, and SLA-led messaging.'
        ),
      },
    };
  }

  function publicPack() {
    var jn = [
      'Benefit renewal reminder',
      'Programme enrolment',
      'Permit fast-track',
      'Equity outreach',
      'Digital service shift',
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">Priority cohort</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">Mobile gov ID</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Desktop kiosk user</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Accessibility needs</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">Deadline risk</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">New resident</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Benefit renewal reminder</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">Programme enrolment</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Permit fast-track</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">Equity outreach</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'Priority cohort',
        'mobile-first': 'Mobile gov ID',
        'desktop-pref': 'Desktop kiosk user',
        'mortgage-holder': 'Accessibility needs',
        'high-churn': 'Deadline risk',
        'new-customer': 'New resident',
      },
      channelHints: { mobile: 'Mobile gov ID signal', desktop: 'Kiosk / web portal signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Benefit renewal reminder',
          0.82,
          jn,
          [
            { name: 'Digital renewal flow', pct: 67, sel: true },
            { name: 'Paper assist path', pct: 58, sel: false },
            { name: 'Service centre triage', pct: 42, sel: false },
          ],
          ['Eligibility rules', 'Language preference', 'Deadline window'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Renew childcare credit before 30 June', active: true },
            { section: 'Body', content: 'Pre-filled form + document checklist', active: true },
            { section: 'Social proof', content: 'Digital renewals clear in 48h', active: false },
            { section: 'CTA', content: '"Continue renewal" — gov ID', active: true },
            { section: 'Cross-sell', content: 'Linked housing benefit — ranked next best', active: true },
          ],
          'Optimised for timely renewal',
          'Renewal propensity (0.82) with mobile ID selects push reminders, digital-first path, and deadline clarity.'
        ),
        invest: mk(
          'Programme enrolment',
          0.61,
          ['Programme enrolment', 'Benefit renewal reminder', 'Permit fast-track', 'Equity outreach', 'Digital service shift'],
          [
            { name: 'Info session + enrol', pct: 61, sel: true },
            { name: 'Community navigator', pct: 55, sel: false },
            { name: 'Static PDF pack', pct: 38, sel: false },
          ],
          ['Income band', 'Household size', 'Language'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'You may qualify for the warm-home programme', active: true },
            { section: 'Body', content: '15-minute digital intake + proof upload', active: true },
            { section: 'Social proof', content: '12k households enrolled last winter', active: false },
            { section: 'CTA', content: '"Check eligibility" — guided', active: true },
            { section: 'Cross-sell', content: 'Energy audit slot — ranked next best', active: true },
          ],
          'Optimised for programme uptake',
          'Enrolment propensity routes email, navigator path, and inclusive language blocks.'
        ),
        card: mk(
          'Permit fast-track',
          0.44,
          ['Permit fast-track', 'Benefit renewal reminder', 'Digital service shift', 'Equity outreach', 'Programme enrolment'],
          [
            { name: 'Fast-track digital', pct: 54, sel: true },
            { name: 'Inspection booking', pct: 48, sel: false },
            { name: 'Counter queue ticket', pct: 35, sel: false },
          ],
          ['Permit type', 'Neighbourhood load', 'Docs on file'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Skip the line — upload your contractor bond', active: true },
            { section: 'Body', content: 'Slot picker + fee estimator', active: true },
            { section: 'Social proof', content: 'Digital fast-track clears 61% faster', active: false },
            { section: 'CTA', content: '"Start fast-track" — portal', active: true },
            { section: 'Cross-sell', content: 'Inspection bundle — ranked next best', active: true },
          ],
          'Optimised for permit completion',
          'Fast-track propensity uses mobile-first intake, slot path, and transparency copy.'
        ),
        retain: mk(
          'Equity outreach',
          0.38,
          ['Equity outreach', 'Benefit renewal reminder', 'Programme enrolment', 'Permit fast-track', 'Digital service shift'],
          [
            { name: 'Navigator callback', pct: 72, sel: true },
            { name: 'Community workshop', pct: 65, sel: false },
            { name: 'Standard notice', pct: 40, sel: false },
          ],
          ['Equity index', 'Language access', 'Transport barrier'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'We can help you finish this renewal', active: true },
            { section: 'Body', content: 'Free callback + translated pack', active: true },
            { section: 'Social proof', content: 'Outreach cohort completion +28%', active: true },
            { section: 'CTA', content: '"Book navigator" — SMS reply', active: true },
            { section: 'Cross-sell', content: 'Transport voucher info — optional', active: false },
          ],
          'Optimised for equitable completion',
          'Retention-focus uses SMS, navigator path, and supportive tone.'
        ),
      },
    };
  }

  function healthcarePack() {
    var jn = [
      'Care gap closure',
      'Medication adherence',
      'Preventive screening',
      'Benefit navigation',
      'Chronic care programme',
    ];
    return {
      attrChipsHtml:
        '<div class="chip active" data-attr="high-value" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-value">High-risk panel</span></div>' +
        '<div class="chip active" data-attr="mobile-first" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mobile-first">Portal mobile user</span></div>' +
        '<div class="chip" data-attr="desktop-pref" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="desktop-pref">Caregiver desktop</span></div>' +
        '<div class="chip active" data-attr="mortgage-holder" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="mortgage-holder">Gap in care team</span></div>' +
        '<div class="chip" data-attr="high-churn" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="high-churn">No-show pattern</span></div>' +
        '<div class="chip" data-attr="new-customer" onclick="toggleAttr(this)"><span data-aep-dc-attr-chip="new-customer">New enrollee</span></div>',
      propChipsHtml:
        '<div class="chip active" data-prop="refi" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="refi">Care gap closure</span> <span class="chip-val" data-aep-dc-prop-val="refi">0.82</span></div>' +
        '<div class="chip" data-prop="invest" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="invest">Medication adherence</span> <span class="chip-val" data-aep-dc-prop-val="invest">0.61</span></div>' +
        '<div class="chip" data-prop="card" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="card">Preventive screening</span> <span class="chip-val" data-aep-dc-prop-val="card">0.44</span></div>' +
        '<div class="chip" data-prop="retain" onclick="toggleProp(this)"><span data-aep-dc-prop-chip="retain">Benefit navigation</span> <span class="chip-val" data-aep-dc-prop-val="retain">0.38</span></div>',
      attrLabels: {
        'high-value': 'High-risk panel',
        'mobile-first': 'Portal mobile user',
        'desktop-pref': 'Caregiver desktop',
        'mortgage-holder': 'Gap in care team',
        'high-churn': 'No-show pattern',
        'new-customer': 'New enrollee',
      },
      channelHints: { mobile: 'Portal + SMS care signal', desktop: 'Caregiver web portal signal' },
      stateDefaults: { attrs: ['high-value', 'mobile-first', 'mortgage-holder'], prop: 'refi', formula: 'balanced' },
      scenarios: {
        refi: mk(
          'Care gap closure',
          0.82,
          jn,
          [
            { name: 'Care coordinator call', pct: 67, sel: true },
            { name: 'Telehealth intake', pct: 58, sel: false },
            { name: 'Printed care pack', pct: 42, sel: false },
          ],
          ['Risk score', 'Social drivers', 'Benefit tier'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Schedule your gap-closure visit this week', active: true },
            { section: 'Body', content: 'Transport help + interpreter options', active: true },
            { section: 'Social proof', content: 'Members who closed gaps had 31% fewer ER visits', active: false },
            { section: 'CTA', content: '"Book now" — portal', active: true },
            { section: 'Cross-sell', content: 'Pharmacy sync programme — ranked next best', active: true },
          ],
          'Optimised for gap closure',
          'Gap propensity (0.82) selects push reminders, coordinator path, and supportive tone.'
        ),
        invest: mk(
          'Medication adherence',
          0.61,
          ['Medication adherence', 'Care gap closure', 'Preventive screening', 'Benefit navigation', 'Chronic care programme'],
          [
            { name: 'Dose reminder + refill', pct: 61, sel: true },
            { name: 'Pharmacist consult', pct: 55, sel: false },
            { name: 'Static refill page', pct: 38, sel: false },
          ],
          ['Therapeutic class', 'Pickup pattern', 'Side-effect flags'],
          [
            { name: 'Email', score: 0.76, sel: true },
            { name: 'Push notification', score: 0.68, sel: false },
            { name: 'In-app', score: 0.55, sel: false },
            { name: 'SMS', score: 0.42, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'Refill due in 5 days — tap to confirm', active: true },
            { section: 'Body', content: '90-day supply option if eligible', active: true },
            { section: 'Social proof', content: 'Adherent members stay in target range longer', active: false },
            { section: 'CTA', content: '"Confirm refill" — SMS link', active: true },
            { section: 'Cross-sell', content: 'MTM review invite — ranked next best', active: true },
          ],
          'Optimised for adherence',
          'Adherence propensity routes SMS-first, refill path, and reminder cadence.'
        ),
        card: mk(
          'Preventive screening',
          0.44,
          ['Preventive screening', 'Care gap closure', 'Chronic care programme', 'Benefit navigation', 'Medication adherence'],
          [
            { name: 'At-home kit path', pct: 54, sel: true },
            { name: 'Clinic scheduler', pct: 48, sel: false },
            { name: 'Education-only track', pct: 35, sel: false },
          ],
          ['Age cohort', 'Last screen date', 'Benefit coverage'],
          chM1(),
          chD1(),
          [
            { section: 'Hero', content: 'Your mammogram is due — pick a slot', active: true },
            { section: 'Body', content: 'Covered screening sites within 8 miles', active: true },
            { section: 'Social proof', content: 'Early screens improved outcomes in cohort studies', active: false },
            { section: 'CTA', content: '"Schedule screening" — portal', active: true },
            { section: 'Cross-sell', content: 'Genetic counselling info — ranked next best', active: true },
          ],
          'Optimised for screening uptake',
          'Screening propensity uses mobile scheduling, kit-first path, and benefit clarity.'
        ),
        retain: mk(
          'Benefit navigation',
          0.38,
          ['Benefit navigation', 'Care gap closure', 'Chronic care programme', 'Preventive screening', 'Medication adherence'],
          [
            { name: 'Navigator SMS thread', pct: 72, sel: true },
            { name: 'Benefits hotline', pct: 65, sel: false },
            { name: 'Static FAQ page', pct: 40, sel: false },
          ],
          ['Coverage tier', 'Copay stress', 'Language'],
          [
            { name: 'SMS', score: 0.8, sel: true },
            { name: 'Push notification', score: 0.72, sel: false },
            { name: 'Email', score: 0.65, sel: false },
            { name: 'In-app', score: 0.48, sel: false },
          ],
          chD1(),
          [
            { section: 'Hero', content: 'We can lower this copay with a rider programme', active: true },
            { section: 'Body', content: 'Two-tap attestation + document upload', active: true },
            { section: 'Social proof', content: 'Members saved avg $140/mo after navigation', active: true },
            { section: 'CTA', content: '"Text navigator" — short code', active: true },
            { section: 'Cross-sell', content: 'Transport benefit — optional', active: false },
          ],
          'Optimised for benefit clarity',
          'Navigation-focus uses SMS, guided attestation, and financial peace-of-mind copy.'
        ),
      },
    };
  }

  window.AEP_PIPELINE_DECISIONING_CONTROLS = {
    media: mediaPack(),
    retail: retailPack(),
    travel: travelPack(),
    sports: sportsPack(),
    telecommunications: telcoPack(),
    public: publicPack(),
    healthcare: healthcarePack(),
  };
})();
