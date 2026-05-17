/**
 * Per-industry display copy for embedded AJO pipeline HTML (the-anatomy-of-a-decision iframe).
 * Journey ids and path ids stay FSI-shaped for engine compatibility; only labels change.
 * `businessImpact` drives the #impact KPI strip; `profileHub` drives Stage 1 hub cards;
 * `journeyPrioritisation` drives Stage 2 (#s2) intro, funnel, formula term, and legend;
 * `rankedJourneys` drives the ranked journey rows, card title, and result banner copy.
 * `nextBestPath` drives Stage 3 (#s3): intro, AJO 101, mini-canvas, formula legend, ranked path cards, footer.
 * `fsi` omits `nextBestPath` so the iframe HTML baseline (mortgage demo) restores for that toolbar key.
 * Stages 4–6 (#s4–#s6): `channelOptimisation`, `sendTimeOptimisation`, `messagePersonalisation`; `fsi` omits all three.
 * Load `ajo-pipeline-industry-stages456-labels.js` immediately after this file so merges run before `ajo-pipeline-industry-apply.js`.
 * Canonical toolbar keys: retail, fsi, travel, media, sports, telecommunications, public, healthcare
 * (dce-industry-toolbar.js). Legacy keys sent by some embeds are normalised in
 * ajo-pipeline-industry-apply.js migrateIndustryKey: telco→telecommunications, automotive→sports.
 */
(function () {
  window.AEP_PIPELINE_INDUSTRY_LABELS = {
    /** Default iframe copy stays FSI-shaped; hub cards override when FSI is selected */
    fsi: {
      businessImpact: {
        sectionDesc:
          'When lending and payments journeys stay compliant, orchestrated optimisation still compounds across profile, path, channel, and message — turning marginal gains into measurable portfolio outcomes.',
        cards: [
          {
            value: '+41%',
            valueTone: 'accent',
            label: 'Conversion uplift',
            sub: 'vs batch delivery baseline',
          },
          {
            value: '+31%',
            valueTone: 'teal',
            label: 'Open rate improvement',
            sub: 'via send time optimisation',
          },
          {
            value: '+25%',
            valueTone: 'amber',
            label: 'Path conversion lift',
            sub: 'vs default journey branch',
          },
          {
            value: '3.89%',
            valueTone: 'blue',
            label: 'Personalised APR',
            sub: 'tailored to profile attributes',
          },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'Mass-affluent household', tone: 'accent' },
          { text: 'Primary current account', tone: 'teal' },
          { text: 'Mortgage renewal · 90d', tone: 'amber' },
          { text: 'Digital banking active', tone: 'coral' },
          { text: 'Investments lite user', tone: 'blue' },
          { text: 'Open-banking consent on', tone: 'accent' },
        ],
        events: [
          { key: '1h ago', text: 'Savings rate comparison tool · 3× product tiles opened' },
          { key: '5h ago', text: 'Inbound secure message · ISA allowance question' },
          { key: '1d ago', text: 'Card present · grocery · contactless under £100' },
          { key: '4d ago', text: 'Mobile app · biometric re-auth · statement PDF export' },
        ],
        support: {
          lastCall: '11 May 2026 · ISA transfer status and cut-off dates',
          csat: '4.7 / 5 · Follow-up scheduled with wealth desk',
        },
        propensities: [
          { name: 'Product cross-hold', val: '0.76', w: '76%', barClass: 'bar-red' },
          { name: 'Mortgage retention', val: '0.71', w: '71%', barClass: 'bar-blue' },
          { name: 'Wealth advice uptake', val: '0.48', w: '48%', barClass: 'bar-amber' },
          { name: 'Fraud alert sensitivity', val: '0.29', w: '29%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 6 min ago',
          quoteBefore: 'Please ',
          quoteEm: 'confirm my ISA transfer deadline',
          quoteAfter: ' and text me the reference number.',
          tags: [
            { cls: 'intent', text: 'intent: transfer_status' },
            { cls: 'entity', text: 'entity: isa_wrapper' },
            { cls: 'sentiment', text: 'tone: compliance-focused' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'retail_banking_terms_2026.pdf', meta: '2,041 chunks' },
            { icon: '📄', name: 'isa_transfer_faq_secure.pdf', meta: '1,267 chunks' },
            { icon: '🎙', name: 'voice_session_isa_help.transcript', meta: '412 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '86%', label: 'Multi-product retail · digital-first savers', val: '0.86' },
            { w: '79%', label: 'Mortgage maturity · retention offers', val: '0.79' },
            { w: '71%', label: 'Voice banking · authenticated sessions', val: '0.71' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible journeys in the repository. A composite score blends the customer\'s signal-driven propensity with business value, agentic context, and strategic levers — selecting the highest-priority journey for this profile right now.',
        funnelDetails: [
          'across the journey repository',
          'passes regulatory + product rules',
          'matches this profile\'s life-stage & segments',
          'passes contact policy + frequency caps',
          'composite priority score',
        ],
        valueTerm: 'bankValue',
        valueMultSpoken: 'bank value',
        legendBase: 'Journey base + product margin',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'Voice-agent dialogue × 1.5',
        legendStrategic: 'Quarterly business push × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Mortgage refinance',
            desc: 'Highest margin · Rate-lock window open · Refi signals strong',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 bank value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'sales',
            title: 'Investment advisory',
            desc: 'ISA & wealth planning · driven by savings_growth signal',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 bank value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Insurance cross-sell',
            desc: 'Life cover · Home protection',
            score: '108',
            barWidth: '31%',
            barOpacity: 0.45,
            multipliers: '×1.10 bank value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Credit card upgrade',
            desc: 'Premium tier · debt-consolidation signal',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 bank value',
          },
          {
            rank: 5,
            issue: 'retention',
            title: 'Retention & loyalty',
            desc: 'Churn-risk offset · loyalty reinforcement',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 bank value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Mortgage refinance journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong mortgage signals (mortgage_need + refi_intent) drive a high signalPropensity (190 points), the bankValue multiplier (×1.50) reflects highest product margin, and the agenticLift (×1.50) fires on this customer\'s recent voice-agent dialogue. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
    },

    media: {
      businessImpact: {
        sectionDesc:
          'When content, packaging, and save offers align to viewing behaviour, small lifts in engagement, completion, and renewal stack into sustainable subscriber revenue.',
        cards: [
          {
            value: '+35%',
            valueTone: 'accent',
            label: 'Upgrade conversion',
            sub: 'vs blanket upsell cohort',
          },
          {
            value: '+42%',
            valueTone: 'teal',
            label: 'Series completion',
            sub: 'personalised rails + nudges',
          },
          {
            value: '+28%',
            valueTone: 'amber',
            label: 'Save-offer acceptance',
            sub: 'model-led vs static discount',
          },
          {
            value: '+18%',
            valueTone: 'blue',
            label: 'Ad-tier tolerance',
            sub: 'frequency-capped personalisation',
          },
        ],
      },
      profile: {
        initials: 'AC',
        name: 'Alex Chen',
        meta: 'Premium annual · San Francisco · Age 29',
        centerSub: 'Age 29 · San Francisco · Premium annual',
      },
      heroP:
        'From binge streaks to renewal windows — see how streaming signals cascade through journey, path, channel, and message for a media subscriber.',
      journeys: [
        { name: 'Upgrade & save', desc: 'Annual plan · drama bundle · ARPU lift', issue: 'sales' },
        { name: 'Win-back offer', desc: 'Discounted comeback · churn save window', issue: 'retention' },
        { name: 'Trial conversion', desc: 'Extended trial · card on file', issue: 'sales' },
        { name: 'Content discovery', desc: 'Hero rails · continue watching', issue: 'sales' },
        { name: 'Family plan pitch', desc: 'Add-on seats · kids profile', issue: 'sales' },
      ],
      paths: {
        mortgage: [
          { name: 'Upgrade checkout', actions: 'Plan compare → Promo stack → One-tap pay', desc: 'Self-serve upgrade lane' },
          { name: 'Drama bundle path', actions: 'Genre fit → Bundle price → Trial bridge', desc: 'Editorial-led conversion' },
          { name: 'Save desk callback', actions: 'Churn score → Offer tier → Agent queue', desc: 'High-touch save for at-risk subs' },
          { name: 'Standard offers page', actions: 'Catalog → FAQ → Support link', desc: 'Default catch-all' },
        ],
        invest: [
          { name: 'Loyalty webinar + review', actions: 'Points balance → Tier perks → Booking', desc: 'Education-led retention' },
          { name: 'Kids profile onboarding', actions: 'PIN setup → Content rail → Add seat', desc: 'Family attach path' },
          { name: 'In-app upgrade flow', actions: 'Paywall → Payment sheet → Confirm', desc: 'Mobile-first upgrade' },
          { name: 'Partner success call', actions: 'Priority flag → Specialist → Follow-up', desc: 'VIP subscriber lane' },
        ],
        insurance: [
          { name: 'Device protection quote', actions: 'Device list → Risk tier → Bundle price', desc: 'Add-on protection gap' },
          { name: 'Bundle with broadband', actions: 'Service address → Stack offer → Checkout', desc: 'Cross-sell with connectivity' },
          { name: 'Income-linked discount', actions: 'Verify tier → Eligible offers → Apply', desc: 'Promo eligibility path' },
        ],
        card: [
          { name: 'Reward tier compare', actions: 'Spend history → Tier chart → Upgrade CTA', desc: 'Visual tier comparison' },
          { name: 'Watch-time calculator', actions: 'Profile import → Value preview → Upsell', desc: 'Personalised value story' },
          { name: 'Ad-tier to premium', actions: 'Ad load stats → Upgrade pitch → Confirm', desc: 'Monetisation path' },
          { name: 'Standard upgrade', actions: 'Product page → Features → Subscribe', desc: 'Default upgrade' },
        ],
        retention: [
          { name: 'Personalised save offer', actions: 'Churn model → Discount engine → In-app', desc: 'Model-driven retention' },
          { name: 'Loyalty bonus unlock', actions: 'Tenure calc → Credits → Fee waiver', desc: 'Value reinforcement' },
          { name: 'Dedicated specialist', actions: 'Priority queue → Callback → Save script', desc: 'White-glove save' },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'Premium SVOD tier', tone: 'accent' },
          { text: 'Binge cluster · drama', tone: 'teal' },
          { text: 'Trial ending · 48h', tone: 'amber' },
          { text: 'Smart TV primary', tone: 'coral' },
          { text: 'Household · 3 profiles', tone: 'blue' },
          { text: 'Ad-tier eligible upsell', tone: 'accent' },
        ],
        events: [
          { key: '45m ago', text: 'Episode complete · auto-play next · 4× skips in opening credits' },
          { key: '3h ago', text: 'In-app upgrade tile · annual plan compare · payment sheet opened' },
          { key: '1d ago', text: 'Kids profile · parental gate · content rail curated' },
          { key: '5d ago', text: 'Email click · “double points on bundles” loyalty teaser' },
        ],
        support: {
          lastCall: '10 May 2026 · Device limit and 4K playback troubleshooting',
          csat: '4.6 / 5 · Self-serve article link + follow-up push',
        },
        propensities: [
          { name: 'Annual plan conversion', val: '0.73', w: '73%', barClass: 'bar-red' },
          { name: 'Bundle attach', val: '0.61', w: '61%', barClass: 'bar-blue' },
          { name: 'Churn save accept', val: '0.44', w: '44%', barClass: 'bar-amber' },
          { name: 'Ad-tier tolerance', val: '0.38', w: '38%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 3 min ago',
          quoteBefore: 'Can you ',
          quoteEm: 'add the sports add-on for this weekend only',
          quoteAfter: ' and show me what it costs on my plan?',
          tags: [
            { cls: 'intent', text: 'intent: add_on_purchase' },
            { cls: 'entity', text: 'entity: subscription_tier' },
            { cls: 'sentiment', text: 'tone: promotional interest' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'subscriber_fair_use_policy.pdf', meta: '1,654 chunks' },
            { icon: '📄', name: 'bundle_pricing_matrix_2026.pdf', meta: '982 chunks' },
            { icon: '🎙', name: 'voice_session_addon_request.transcript', meta: '298 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '87%', label: 'High watch-time · premium upsell cohorts', val: '0.87' },
            { w: '80%', label: 'Household plans · multi-seat upgrades', val: '0.80' },
            { w: '72%', label: 'Voice commerce · media subscriptions', val: '0.72' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible journeys in the catalogue. A composite score blends signal-driven propensity with subscriber economics, agentic context, and editorial or packaging levers — picking the highest-priority journey for this household right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes rights, packaging, and entitlement rules',
          'matches this subscriber profile & taste clusters',
          'passes contact policy + ad-load / frequency caps',
          'composite priority score',
        ],
        valueTerm: 'subscriberValue',
        valueMultSpoken: 'subscriber value',
        legendBase: 'Journey base + ARPU / packaging economics',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'In-app or assist chat context × 1.5',
        legendStrategic: 'Seasonal campaign / window push × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Upgrade & save',
            desc: 'Annual plan · drama bundle · ARPU lift',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 subscriber value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'retention',
            title: 'Win-back offer',
            desc: 'Discounted comeback · churn save window',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 subscriber value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Trial conversion',
            desc: 'Extended trial · card on file',
            score: '112',
            barWidth: '32%',
            barOpacity: 0.45,
            multipliers: '×1.10 subscriber value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Content discovery',
            desc: 'Hero rails · continue watching',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 subscriber value',
          },
          {
            rank: 5,
            issue: 'sales',
            title: 'Family plan pitch',
            desc: 'Add-on seats · kids profile',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 subscriber value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Upgrade & save journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong upgrade and trial-end signals drive a high signalPropensity (190 points), the subscriberValue multiplier (×1.50) reflects the strongest incremental ARPU lift, and the agenticLift (×1.50) reflects a recent authenticated assist session in the app. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Upgrade & save journey, the engine arbitrates across four upgrade paths. Each path is a sequence of actions toward conversion. Path scoring blends attach-rate economics with the household\'s signal fit, binge-and-trial behaviour, and renewal-window urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Upgrade checkout, Drama bundle path, Save desk callback, Standard offers page) are the four branches of a conditional split inside the Upgrade & save journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one upgrade journey can produce a hyper-personalised outcome for thousands of distinct subscribers.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Upgrade & save · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Upgrade checkout', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Drama bundle path', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Save desk callback', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard offers page', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Attach-rate base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ household watch habit (×1.2)',
            'Renewal / trial window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Upgrade & save',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Upgrade checkout',
            actions: 'Plan compare → Promo stack → One-tap pay',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ binge_cluster' },
              { cls: 'teal', text: '+ trial_end_48h' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Drama bundle path',
            actions: 'Genre fit → Bundle price → Trial bridge',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ genre_affinity' },
              { cls: 'teal', text: '+ ad_tier_eligible' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Assisted',
            name: 'Save desk callback',
            actions: 'Churn score → Offer tier → Agent queue',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · In-app',
            name: 'Standard offers page',
            actions: 'Catalog → FAQ → Support link',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Conversion likelihood',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },

    retail: {
      businessImpact: {
        sectionDesc:
          'When basket intent, loyalty tier, and fulfilment preference inform every layer, conversion and basket economics improve together — without eroding margin with generic blasts.',
        cards: [
          {
            value: '+38%',
            valueTone: 'accent',
            label: 'Revenue per session',
            sub: 'vs generic promo baseline',
          },
          {
            value: '+27%',
            valueTone: 'teal',
            label: 'Email CTR lift',
            sub: 'segmented journeys + send time',
          },
          {
            value: '+22%',
            valueTone: 'amber',
            label: 'Cart recovery',
            sub: 'vs default abandonment branch',
          },
          {
            value: '+14%',
            valueTone: 'blue',
            label: 'AOV uplift',
            sub: 'bundles & care attach at checkout',
          },
        ],
      },
      profile: {
        initials: 'ML',
        name: 'Morgan Lee',
        meta: 'Platinum · Manchester · Age 32',
        centerSub: 'Age 32 · Manchester · Platinum',
      },
      heroP:
        'From cart intent to loyalty tiers — see how retail signals flow through journey selection, path design, channel mix, and last-mile offers.',
      journeys: [
        { name: 'Express checkout recovery', desc: 'Free delivery · one tap · basket rescue', issue: 'sales' },
        { name: 'Loyalty rewards lane', desc: 'Points burn · tier gift · early access', issue: 'sales' },
        { name: 'Markdown & clearance', desc: 'Category sale · matched browse', issue: 'sales' },
        { name: 'Upsell attach path', desc: 'Care · warranty · bundle attach', issue: 'sales' },
        { name: 'Brand stories & editorial', desc: 'Inspire · discover · soft conversion', issue: 'sales' },
      ],
      paths: {
        mortgage: [
          { name: 'Abandoned cart rescue', actions: 'Basket recall → Free ship → One-tap checkout', desc: 'High-intent recovery' },
          { name: 'Click & collect fast lane', actions: 'Store stock → Slot pick → QR pickup', desc: 'Omnichannel fulfilment' },
          { name: 'Stylist callback', actions: 'Size history → Recommendations → Book slot', desc: 'Assisted basket build' },
          { name: 'Standard promo page', actions: 'Category landing → Grid → Cart', desc: 'Default retail path' },
        ],
        invest: [
          { name: 'Tier perks workshop', actions: 'Points rules → Burn options → RSVP', desc: 'Loyalty education' },
          { name: 'Family account setup', actions: 'Household link → Shared cart → Benefits', desc: 'Household growth' },
          { name: 'App-only flash sale', actions: 'Push deep link → Timer → Checkout', desc: 'Mobile-first promo' },
          { name: 'Personal shopper session', actions: 'Lookbook → Calendar → In-store', desc: 'High-touch retail' },
        ],
        insurance: [
          { name: 'Care plan assessment', actions: 'SKU match → Warranty tiers → Quote', desc: 'Attach care at checkout' },
          { name: 'Bundle with delivery plus', actions: 'Address → Slot + care → Single checkout', desc: 'Service bundle path' },
          { name: 'Returns protection', actions: 'Order value → Premium return → Fee', desc: 'Risk-based add-on' },
        ],
        card: [
          { name: 'Premium perks showcase', actions: 'Spend categories → Points uplift → Compare', desc: 'Tier comparison experience' },
          { name: 'Savings from spend', actions: 'Import receipts → Category map → Preview', desc: 'Personalised savings story' },
          { name: 'BNPL eligibility', actions: 'Soft check → Limit → Split pay', desc: 'Flexible payment path' },
          { name: 'Standard upgrade', actions: 'Card page → Benefits → Apply', desc: 'Default card path' },
        ],
        retention: [
          { name: 'Win-back voucher', actions: 'Lapse score → Offer stack → Email + app', desc: 'Lapsed buyer save' },
          { name: 'Platinum fee waiver', actions: 'Tenure → Perks unlock → Confirm', desc: 'Tier reinforcement' },
          { name: 'Store manager outreach', actions: 'VIP flag → Local store → Call', desc: 'High-value retention' },
        ],
      },
      /** Stage 1 hub cards (profileHub) — applied by ajo-pipeline-industry-apply.js */
      profileHub: {
        segmentTags: [
          { text: 'High-value shopper', tone: 'accent' },
          { text: 'Platinum loyalty tier', tone: 'teal' },
          { text: 'Cart abandoner · 72h', tone: 'amber' },
          { text: 'Mobile app–first', tone: 'coral' },
          { text: 'Beauty & wellness buyer', tone: 'blue' },
          { text: 'Omnichannel active', tone: 'accent' },
        ],
        events: [
          { key: '2h ago', text: 'Product detail views · satin blazer · 4× size compare' },
          { key: '6h ago', text: 'Cart add · guest checkout started · free-ship threshold near' },
          { key: '1d ago', text: 'Order confirmation · £124 · home delivery' },
          { key: '3d ago', text: 'Push opened · loyalty double-points weekend teaser' },
        ],
        support: {
          lastCall: '12 May 2026 · Click & collect locker pickup help',
          csat: '4.9 / 5 · Style advisor follow-up booked',
        },
        propensities: [
          { name: 'Repeat purchase', val: '0.79', w: '79%', barClass: 'bar-red' },
          { name: 'Upsell / attach', val: '0.64', w: '64%', barClass: 'bar-blue' },
          { name: 'Loyalty enrolment', val: '0.52', w: '52%', barClass: 'bar-amber' },
          { name: 'Returns risk', val: '0.34', w: '34%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 4 min ago',
          quoteBefore: 'Can you ',
          quoteEm: 'switch this to store pickup tomorrow',
          quoteAfter: '? I need it before the weekend.',
          tags: [
            { cls: 'intent', text: 'intent: fulfilment_change' },
            { cls: 'entity', text: 'entity: pickup_store' },
            { cls: 'sentiment', text: 'tone: action-oriented' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'return_policy_retail_2026.pdf', meta: '1,892 chunks' },
            { icon: '📄', name: 'click_collect_store_guide.pdf', meta: '1,104 chunks' },
            { icon: '🎙', name: 'voice_session_pickup_help.transcript', meta: '356 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '88%', label: 'High-intent apparel buyers · flagship cities', val: '0.88' },
            { w: '81%', label: 'VIP loyalty · omnichannel redeemers', val: '0.81' },
            { w: '74%', label: 'Voice-agent journeys · retail service', val: '0.74' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible journeys in the catalogue. A composite score blends signal-driven propensity with basket and margin economics, agentic fulfilment context, and campaign levers — picking the highest-priority journey for this shopper right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes catalogue, promo, and loyalty rules',
          'matches this shopper profile & micro-segments',
          'passes contact policy + frequency caps',
          'composite priority score',
        ],
        valueTerm: 'basketValue',
        valueMultSpoken: 'basket value',
        legendBase: 'Journey base + margin / attach economics',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'Store or digital assist session × 1.5',
        legendStrategic: 'Category / seasonal campaign lever × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Express checkout recovery',
            desc: 'Free delivery · one tap · basket rescue',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 basket value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'sales',
            title: 'Loyalty rewards lane',
            desc: 'Points burn · tier gift · early access',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 basket value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Markdown & clearance',
            desc: 'Category sale · matched browse',
            score: '110',
            barWidth: '32%',
            barOpacity: 0.45,
            multipliers: '×1.10 basket value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Upsell attach path',
            desc: 'Care · warranty · bundle attach',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 basket value',
          },
          {
            rank: 5,
            issue: 'sales',
            title: 'Brand stories & editorial',
            desc: 'Inspire · discover · soft conversion',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 basket value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Express checkout recovery journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong cart-recovery and loyalty signals drive a high signalPropensity (190 points), the basketValue multiplier (×1.50) reflects the strongest expected basket lift, and the agenticLift (×1.50) reflects a recent pickup-and-delivery assist thread. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Express checkout recovery journey, the engine arbitrates across four checkout paths. Each path is a sequence of actions toward conversion. Path scoring blends basket economics with the shopper\'s signal fit, omnichannel habit, and cut-off urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Abandoned cart rescue, Click & collect fast lane, Stylist callback, Standard promo page) are the four branches of a conditional split inside the Express checkout recovery journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one basket-rescue journey can produce a hyper-personalised outcome for thousands of distinct shoppers.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Express checkout recovery · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Abandoned cart rescue', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Click & collect fast lane', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Stylist callback', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard promo page', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Basket-intent base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ fulfilment habit (×1.2)',
            'Cut-off / slot window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Express checkout recovery',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Abandoned cart rescue',
            actions: 'Basket recall → Free ship → One-tap checkout',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ cart_abandon_72h' },
              { cls: 'teal', text: '+ platinum_tier' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Click & collect fast lane',
            actions: 'Store stock → Slot pick → QR pickup',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ omnichannel_active' },
              { cls: 'teal', text: '+ beauty_category' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Assisted',
            name: 'Stylist callback',
            actions: 'Size history → Recommendations → Book slot',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Store',
            name: 'Standard promo page',
            actions: 'Category landing → Grid → Cart',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Conversion likelihood',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },

    travel: {
      businessImpact: {
        sectionDesc:
          'When trip context, loyalty status, and disruption risk inform journeys end-to-end, ancillary attach and completion rates rise while service costs stay predictable.',
        cards: [
          {
            value: '+33%',
            valueTone: 'accent',
            label: 'Ancillary attach rate',
            sub: 'seat, bag & Wi‑Fi bundle path',
          },
          {
            value: '+29%',
            valueTone: 'teal',
            label: 'Booking completion',
            sub: 'channel + timing orchestration',
          },
          {
            value: '+21%',
            valueTone: 'amber',
            label: 'Upgrade bid uptake',
            sub: 'vs static upsell tile',
          },
          {
            value: '+$67',
            valueTone: 'blue',
            label: 'Trip revenue lift',
            sub: 'demo PNR-level attach mix',
          },
        ],
      },
      profile: {
        initials: 'JM',
        name: 'Jordan Miles',
        meta: 'Gold · London hub · Age 41',
        centerSub: 'Age 41 · London hub · Gold',
      },
      heroP:
        'From seat selection to partner earn — see how travel intent cascades through journeys, paths, channels, and personalised trip content.',
      journeys: [
        { name: 'Long-haul ancillaries', desc: 'Bags · seats · Wi‑Fi · route margin', issue: 'sales' },
        { name: 'Short-haul bundles', desc: 'City breaks · saver stack', issue: 'sales' },
        { name: 'Loyalty accelerator', desc: 'Tier miles · status boost', issue: 'sales' },
        { name: 'Airport retail & parking', desc: 'Partner earn · airport partners', issue: 'sales' },
        { name: 'Partner earn push', desc: 'Hotels · car · experiences', issue: 'sales' },
      ],
      paths: {
        mortgage: [
          { name: 'Seat + bag bundle', actions: 'PNR lookup → Bundle price → Pay', desc: 'Ancillary self-serve' },
          { name: 'Upgrade auction path', actions: 'Bid window → Cabin map → Confirm', desc: 'Revenue-managed upgrade' },
          { name: 'Agent rebooking', actions: 'Disruption queue → Options → Ticket', desc: 'Irregular ops assist' },
          { name: 'Standard ancillaries', actions: 'Grid → Fees → Checkout', desc: 'Default attach path' },
        ],
        invest: [
          { name: 'Lounge + miles webinar', actions: 'Eligibility → Session → Enrol', desc: 'Status education' },
          { name: 'Family traveller pack', actions: 'Child traveller → Bundle → Seat', desc: 'Family trip upsell' },
          { name: 'App day-of-travel', actions: 'Boarding pass → Upsell carousel → Pay', desc: 'Mobile journey day' },
          { name: 'Gold service desk', actions: 'Priority line → Rebook → Hotels', desc: 'High-touch loyalty' },
        ],
        insurance: [
          { name: 'Travel insurance quote', actions: 'Trip dates → Cover tiers → Bind', desc: 'Protection at booking' },
          { name: 'Hotel + flight bundle', actions: 'Partner rates → Package → Checkout', desc: 'Package cross-sell' },
          { name: 'Flex fare add-on', actions: 'Risk profile → Change fee waiver → Pay', desc: 'Flexibility upsell' },
        ],
        card: [
          { name: 'Co-brand perks compare', actions: 'Miles earn → Lounge access → Apply', desc: 'Card benefit showcase' },
          { name: 'Spend-to-miles calculator', actions: 'Import trips → Earn preview → Upgrade', desc: 'Personalised earn story' },
          { name: 'Partner transfer promo', actions: 'Partner list → Bonus window → Move miles', desc: 'Partners currency path' },
          { name: 'Standard card offer', actions: 'Landing → APR table → Apply', desc: 'Default card path' },
        ],
        retention: [
          { name: 'Status match save', actions: 'Tier risk → Match offer → Confirm', desc: 'Elite retention' },
          { name: 'Gold renewal pack', actions: 'Year review → Bonus miles → Renew', desc: 'Loyalty reinforcement' },
          { name: 'Proactive rebook assist', actions: 'Ops alert → Options → Agent', desc: 'Service-led save' },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'Gold frequent flyer', tone: 'accent' },
          { text: 'Long-haul leisure · LHR hub', tone: 'teal' },
          { text: 'IRROPS sensitive · 72h', tone: 'amber' },
          { text: 'Co-brand card holder', tone: 'coral' },
          { text: 'Ancillary buyer · seats', tone: 'blue' },
          { text: 'Partner hotel linker', tone: 'accent' },
        ],
        events: [
          { key: '30m ago', text: 'Mobile check-in · seat 12A · paid bag added to PNR' },
          { key: '4h ago', text: 'Fare alert opened · JFK route · flexible dates toggled' },
          { key: '1d ago', text: 'Lounge access scan · Tier-2 · on-time departure' },
          { key: '6d ago', text: 'Partner hotel booking · earn miles · confirmation email' },
        ],
        support: {
          lastCall: '9 May 2026 · Schedule change and rebooking options',
          csat: '4.8 / 5 · Proactive SMS with new itinerary link',
        },
        propensities: [
          { name: 'Ancillary upsell', val: '0.77', w: '77%', barClass: 'bar-red' },
          { name: 'Co-brand acquisition', val: '0.58', w: '58%', barClass: 'bar-blue' },
          { name: 'Status retention', val: '0.66', w: '66%', barClass: 'bar-amber' },
          { name: 'Compensation claim risk', val: '0.31', w: '31%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 8 min ago',
          quoteBefore: 'I need to ',
          quoteEm: 'move my return flight one day later',
          quoteAfter: ' without losing my seat fee—what are my options?',
          tags: [
            { cls: 'intent', text: 'intent: itinerary_change' },
            { cls: 'entity', text: 'entity: pnr_record' },
            { cls: 'sentiment', text: 'tone: stressed but polite' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'tariff_rules_flex_plus_2026.pdf', meta: '1,776 chunks' },
            { icon: '📄', name: 'irrops_customer_commitments.pdf', meta: '1,021 chunks' },
            { icon: '🎙', name: 'voice_session_rebook_help.transcript', meta: '367 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '85%', label: 'Gold tier · long-haul leisure mix', val: '0.85' },
            { w: '78%', label: 'High ancillary attach · seat + bag buyers', val: '0.78' },
            { w: '70%', label: 'Voice IVR · disruption handling cohorts', val: '0.70' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible journeys in the catalogue. A composite score blends signal-driven propensity with trip and cabin economics, disruption-aware context, and revenue-management levers — picking the highest-priority journey for this traveller right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes fare rules, inventory, and partner constraints',
          'matches this traveller profile & loyalty context',
          'passes contact policy + disruption comms caps',
          'composite priority score',
        ],
        valueTerm: 'tripValue',
        valueMultSpoken: 'trip value',
        legendBase: 'Journey base + route / cabin economics',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'Service or IVR dialogue context × 1.5',
        legendStrategic: 'Yield / partner promo lever × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Long-haul ancillaries',
            desc: 'Bags · seats · Wi‑Fi · route margin',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 trip value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'sales',
            title: 'Short-haul bundles',
            desc: 'City breaks · saver stack',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 trip value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Loyalty accelerator',
            desc: 'Tier miles · status boost',
            score: '114',
            barWidth: '33%',
            barOpacity: 0.45,
            multipliers: '×1.10 trip value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Airport retail & parking',
            desc: 'Partner earn · airport partners',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 trip value',
          },
          {
            rank: 5,
            issue: 'sales',
            title: 'Partner earn push',
            desc: 'Hotels · car · experiences',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 trip value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Long-haul ancillaries journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong ancillary and upgrade signals drive a high signalPropensity (190 points), the tripValue multiplier (×1.50) reflects the strongest expected segment revenue, and the agenticLift (×1.50) reflects a recent itinerary-change assist session. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Long-haul ancillaries journey, the engine arbitrates across four attach paths. Each path is a sequence of actions toward conversion. Path scoring blends cabin-route economics with the traveller\'s signal alignment, digital habit, and departure-window urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Seat + bag bundle, Upgrade auction path, Agent rebooking, Standard ancillaries) are the four branches of a conditional split inside the Long-haul ancillaries journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one ancillary journey can produce a hyper-personalised outcome for thousands of distinct travellers.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Long-haul ancillaries · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Seat + bag bundle', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Upgrade auction path', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Agent rebooking', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard ancillaries', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Route attach base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ trip-day habit (×1.2)',
            'Departure / IRROPS window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Long-haul ancillaries',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Seat + bag bundle',
            actions: 'PNR lookup → Bundle price → Pay',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ ancillary_intent' },
              { cls: 'teal', text: '+ gold_tier' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Upgrade auction path',
            actions: 'Bid window → Cabin map → Confirm',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ upgrade_bid_open' },
              { cls: 'teal', text: '+ seat_pref_window' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Assisted',
            name: 'Agent rebooking',
            actions: 'Disruption queue → Options → Ticket',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Service desk',
            name: 'Standard ancillaries',
            actions: 'Grid → Fees → Checkout',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Attach likelihood',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },

    sports: {
      businessImpact: {
        sectionDesc:
          'When renewal windows, seat preferences, and matchday behaviour inform arbitration, ticketing and hospitality revenue compound without spamming the whole list.',
        cards: [
          {
            value: '+36%',
            valueTone: 'accent',
            label: 'Season renewal rate',
            sub: 'vs batch reminder only',
          },
          {
            value: '+31%',
            valueTone: 'teal',
            label: 'Matchday attach',
            sub: 'parking & F&B digital path',
          },
          {
            value: '+19%',
            valueTone: 'amber',
            label: 'Hospitality lead rate',
            sub: 'VIP cohort vs generic invite',
          },
          {
            value: '+24%',
            valueTone: 'blue',
            label: 'Merch uptake',
            sub: 'drops + member pricing',
          },
        ],
      },
      profile: {
        initials: 'CT',
        name: 'Chris Taylor',
        meta: 'Season member · Hospitality interest · Age 36',
        centerSub: 'Age 36 · Season member · Hospitality',
      },
      heroP:
        'From renewal windows to matchday upsell — see how fan signals drive journey arbitration across paths, channels, and gameday messages.',
      journeys: [
        { name: 'Season renewal push', desc: 'Early-bird · seat map · renewal rate', issue: 'sales' },
        { name: 'Matchday upsell', desc: 'Parking · F&B · lounge attach', issue: 'sales' },
        { name: 'Membership & loyalty', desc: 'Tier miles · partner perks', issue: 'sales' },
        { name: 'Merch & retail', desc: 'Kit · collect at stadium', issue: 'sales' },
        { name: 'Partner B2B lane', desc: 'Boxes · sponsorship pipeline', issue: 'sales' },
      ],
      paths: {
        mortgage: [
          { name: 'Renewal checkout', actions: 'Seat hold → Payment plan → Confirm', desc: 'Digital renewal lane' },
          { name: 'Upgrade seat map', actions: 'View from seat → Price ladder → Pay', desc: 'Seat upgrade path' },
          { name: 'Membership services', actions: 'Pause/transfer → Agent → Resolution', desc: 'Complex account help' },
          { name: 'Standard renewal page', actions: 'FAQ → Renew CTA → Portal', desc: 'Default renewal' },
        ],
        invest: [
          { name: 'Hospitality preview event', actions: 'Corporate fit → Suite tour → Deposit', desc: 'Premium pipeline' },
          { name: 'Junior membership', actions: 'Family plan → Benefits → Checkout', desc: 'Youth attach' },
          { name: 'In-app add-ons', actions: 'Matchday tile → Parking → Pay', desc: 'Mobile gameday path' },
          { name: 'Relationship manager', actions: 'HNW flag → Calendar → Call', desc: 'High-touch sales' },
        ],
        insurance: [
          { name: 'Event cancellation cover', actions: 'Fixture list → Cover options → Bind', desc: 'Ticketing protection' },
          { name: 'Travel with the team', actions: 'Away trips → Bundle → Checkout', desc: 'Travel partner path' },
          { name: 'Injury waiver add-on', actions: 'Plan rules → Fee → Confirm', desc: 'Add-on protection' },
        ],
        card: [
          { name: 'Official card perks', actions: 'Cashback on merch → Stadium access → Apply', desc: 'Co-brand showcase' },
          { name: 'Spend-to-reward sim', actions: 'Import purchases → Points preview → Upgrade', desc: 'Rewards calculator' },
          { name: 'Installment ticket plan', actions: 'Soft check → Schedule → Seats', desc: 'Pay-over-time path' },
          { name: 'Standard upgrade', actions: 'Product page → Benefits → Apply', desc: 'Default path' },
        ],
        retention: [
          { name: 'Win-back pack', actions: 'Lapse risk → Offer stack → Renew', desc: 'Lapsed member save' },
          { name: 'Loyalty tier unlock', actions: 'Tenure → Perks → Fee credit', desc: 'Value reinforcement' },
          { name: 'Dedicated rep outreach', actions: 'VIP queue → Personal call → Offer', desc: 'White-glove retention' },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'Season ticket holder', tone: 'accent' },
          { text: 'Renewal window · 30d', tone: 'teal' },
          { text: 'Hospitality prospect', tone: 'amber' },
          { text: 'Stadium app power user', tone: 'coral' },
          { text: 'Merch high basket', tone: 'blue' },
          { text: 'Family zone buyer', tone: 'accent' },
        ],
        events: [
          { key: '2h ago', text: 'Seat upgrade flow · interactive map · payment abandoned at confirm' },
          { key: '6h ago', text: 'Matchday push · parking pass purchased · QR saved to wallet' },
          { key: '1d ago', text: 'Official store · kit pre-order · player name personalisation' },
          { key: '4d ago', text: 'Renewal email opened · payment plan calculator used' },
        ],
        support: {
          lastCall: '13 May 2026 · Seat relocation after partial stadium closure',
          csat: '4.7 / 5 · Callback from membership services within SLA',
        },
        propensities: [
          { name: 'Season renewal', val: '0.82', w: '82%', barClass: 'bar-red' },
          { name: 'Matchday upsell', val: '0.69', w: '69%', barClass: 'bar-blue' },
          { name: 'Hospitality conversion', val: '0.41', w: '41%', barClass: 'bar-amber' },
          { name: 'Payment plan default risk', val: '0.27', w: '27%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 5 min ago',
          quoteBefore: 'Can we ',
          quoteEm: 'split our season seats across two payment cards',
          quoteAfter: ' before the renewal deadline tonight?',
          tags: [
            { cls: 'intent', text: 'intent: payment_split' },
            { cls: 'entity', text: 'entity: season_seat_block' },
            { cls: 'sentiment', text: 'tone: urgent deadline' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'membership_terms_renewal_2026.pdf', meta: '1,512 chunks' },
            { icon: '📄', name: 'stadium_accessibility_guide.pdf', meta: '887 chunks' },
            { icon: '🎙', name: 'voice_session_renewal_help.transcript', meta: '334 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '84%', label: 'Renewal cohort · multi-seat households', val: '0.84' },
            { w: '77%', label: 'Premium hospitality · B2B entertaining', val: '0.77' },
            { w: '69%', label: 'Gameday digital · parking + F&B buyers', val: '0.69' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible journeys in the catalogue. A composite score blends signal-driven propensity with ticketing and hospitality economics, member-service context, and gameday levers — picking the highest-priority journey for this fan right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes eligibility, inventory, and partner rules',
          'matches the active fan profile & segments',
          'passes contact policy + matchday frequency caps',
          'composite priority score',
        ],
        valueTerm: 'fanValue',
        valueMultSpoken: 'fan value',
        legendBase: 'Journey base + attach & hospitality yield',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'Membership services conversation × 1.5',
        legendStrategic: 'Renewal / gameday campaign lever × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Season renewal push',
            desc: 'Early-bird · seat map · renewal rate',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 fan value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'sales',
            title: 'Matchday upsell',
            desc: 'Parking · F&B · lounge attach',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 fan value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Membership & loyalty',
            desc: 'Tier miles · partner perks',
            score: '114',
            barWidth: '33%',
            barOpacity: 0.45,
            multipliers: '×1.10 fan value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Merch & retail',
            desc: 'Kit · collect at stadium',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 fan value',
          },
          {
            rank: 5,
            issue: 'sales',
            title: 'Partner B2B lane',
            desc: 'Boxes · sponsorship pipeline',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 fan value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Season renewal push journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong renewal and seat-map signals drive a high signalPropensity (190 points), the fanValue multiplier (×1.50) reflects the strongest expected attach, and the agenticLift (×1.50) reflects a recent authenticated membership-services conversation. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Season renewal push journey, the engine arbitrates across four renewal paths. Each path is a sequence of actions toward conversion. Path scoring blends ticketing yield with the fan\'s signal fit, digital gameday habit, and deadline urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Renewal checkout, Upgrade seat map, Membership services, Standard renewal page) are the four branches of a conditional split inside the Season renewal push journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one renewal journey can produce a hyper-personalised outcome for thousands of distinct members.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Season renewal push · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Renewal checkout', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Upgrade seat map', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Membership services', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard renewal page', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Renewal-yield base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ gameday digital habit (×1.2)',
            'Deadline / payment-plan window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Season renewal push',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Renewal checkout',
            actions: 'Seat hold → Payment plan → Confirm',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ renewal_window_30d' },
              { cls: 'teal', text: '+ season_seat_holder' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Upgrade seat map',
            actions: 'View from seat → Price ladder → Pay',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ seat_upgrade_flow' },
              { cls: 'teal', text: '+ matchday_upsell' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Assisted',
            name: 'Membership services',
            actions: 'Pause/transfer → Agent → Resolution',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Box office',
            name: 'Standard renewal page',
            actions: 'FAQ → Renew CTA → Portal',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Renewal likelihood',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },

    telecommunications: {
      businessImpact: {
        sectionDesc:
          'When usage, contract end-date, and install complexity inform every touchpoint, upgrade and save journeys convert faster while truck rolls and bill shock shrink.',
        cards: [
          {
            value: '+32%',
            valueTone: 'accent',
            label: 'Fibre upgrade accept',
            sub: 'vs single-channel blast',
          },
          {
            value: '+41%',
            valueTone: 'teal',
            label: 'Save-offer take-up',
            sub: 'model-led retention branch',
          },
          {
            value: '+26%',
            valueTone: 'amber',
            label: 'Trade-in completion',
            sub: 'guided omnichannel flow',
          },
          {
            value: '+19%',
            valueTone: 'blue',
            label: 'ARPU lift',
            sub: 'add-ons + plan optimisation',
          },
        ],
      },
      profile: {
        initials: 'SO',
        name: 'Sam Okonkwo',
        meta: 'Unlimited mobile · Fibre-ready · Age 28',
        centerSub: 'Age 28 · Unlimited mobile · Fibre-ready',
      },
      heroP:
        'From data usage to contract end — see how connectivity signals cascade through journeys, paths, omni-channel, and save-time messaging.',
      journeys: [
        { name: 'Fibre upgrade', desc: '1Gb install · self-setup · ARPU lift', issue: 'sales' },
        { name: 'Mobile save / retention', desc: 'Loyalty discount · add-ons', issue: 'retention' },
        { name: 'Device trade-in', desc: 'Early upgrade · recycle value', issue: 'sales' },
        { name: 'SMB static IP', desc: 'Business line · SLA attach', issue: 'sales' },
        { name: 'Roaming & travel pack', desc: 'Trip add-on · bolt-on revenue', issue: 'sales' },
      ],
      paths: {
        mortgage: [
          { name: 'Fibre address check', actions: 'Postcode → Speed promise → Book install', desc: 'Upgrade qualification' },
          { name: 'Self-install kit path', actions: 'Router ship → App setup → Activate', desc: 'Low-touch install' },
          { name: 'Engineer install', actions: 'Survey → Slot → Truck roll', desc: 'Complex premises' },
          { name: 'Standard broadband page', actions: 'Plans table → Chat → Order', desc: 'Default acquisition' },
        ],
        invest: [
          { name: 'SMB consult webinar', actions: 'Static IP demo → SLA → Book', desc: 'B2B education' },
          { name: 'Family plan builder', actions: 'Lines count → Shared data → Checkout', desc: 'Household growth' },
          { name: 'App-only upgrade', actions: 'Usage nudge → Add-on tile → Pay', desc: 'In-app revenue' },
          { name: 'Business specialist', actions: 'Lead score → AE assign → Call', desc: 'High-touch B2B' },
        ],
        insurance: [
          { name: 'Device protect quote', actions: 'Handset model → Tier → Monthly fee', desc: 'Handset insurance' },
          { name: 'Home broadband bundle', actions: 'Address match → Multi-play → Checkout', desc: 'Convergence bundle' },
          { name: 'Roaming shield', actions: 'Trip dates → Cap options → Enable', desc: 'Bill-shock prevention' },
        ],
        card: [
          { name: 'Trade-in estimator', actions: 'IMEI → Value → New device', desc: 'Hardware refresh path' },
          { name: 'Add-on marketplace', actions: 'Usage profile → Recommendations → Cart', desc: 'Digital add-ons' },
          { name: 'Contract buy-out', actions: 'Early termination → Offer → Switch', desc: 'Competitive save' },
          { name: 'Standard upgrade', actions: 'Handsets grid → Finance → Order', desc: 'Default device path' },
        ],
        retention: [
          { name: 'Save squad offer', actions: 'Churn model → Discount stack → SMS confirm', desc: 'Retention offer engine' },
          { name: 'Loyalty credit unlock', actions: 'Tenure → Bill credit → Renew', desc: 'Loyalty reinforcement' },
          { name: 'Care case owner', actions: 'Open ticket → Owner → Callback', desc: 'Service-led save' },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'Fibre-ready address', tone: 'accent' },
          { text: 'Unlimited mobile · 5G', tone: 'teal' },
          { text: 'Contract end · 45d', tone: 'amber' },
          { text: 'High data utilisation', tone: 'coral' },
          { text: 'Multi-play household', tone: 'blue' },
          { text: 'SMB static IP interest', tone: 'accent' },
        ],
        events: [
          { key: '20m ago', text: 'Usage spike · tethering · fair-use policy page viewed' },
          { key: '2h ago', text: 'Upgrade journey · handset trade-in estimator completed' },
          { key: '1d ago', text: 'Network status push acknowledged · outage resolved' },
          { key: '5d ago', text: 'Bill shock prevention · roaming pack purchased pre-trip' },
        ],
        support: {
          lastCall: '14 May 2026 · Router swap and line speed verification',
          csat: '4.5 / 5 · Engineer visit confirmed via app',
        },
        propensities: [
          { name: 'Fibre upgrade', val: '0.74', w: '74%', barClass: 'bar-red' },
          { name: 'Handset refresh', val: '0.62', w: '62%', barClass: 'bar-blue' },
          { name: 'Save offer acceptance', val: '0.55', w: '55%', barClass: 'bar-amber' },
          { name: 'Churn to competitor', val: '0.36', w: '36%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 7 min ago',
          quoteBefore: "I'm moving house next week—can you ",
          quoteEm: 'schedule the fibre install before my contract renews',
          quoteAfter: '?',
          tags: [
            { cls: 'intent', text: 'intent: install_reschedule' },
            { cls: 'entity', text: 'entity: service_address' },
            { cls: 'sentiment', text: 'tone: logistics stress' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'broadband_install_booking_policy.pdf', meta: '1,445 chunks' },
            { icon: '📄', name: 'fair_usage_mobile_unlimited.pdf', meta: '1,198 chunks' },
            { icon: '🎙', name: 'voice_session_install_book.transcript', meta: '401 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '83%', label: 'Fibre upgrade candidates · speed-test engaged', val: '0.83' },
            { w: '76%', label: 'Contract-end save · outbound retention', val: '0.76' },
            { w: '68%', label: 'Roaming-heavy · travel bolt-on buyers', val: '0.68' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible journeys in the catalogue. A composite score blends signal-driven propensity with contract and ARPU economics, care-session context, and network or device levers — picking the highest-priority journey for this subscriber right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes plan, credit, and serviceability rules',
          'matches this subscriber profile & usage context',
          'passes contact policy + save / upgrade caps',
          'composite priority score',
        ],
        valueTerm: 'contractValue',
        valueMultSpoken: 'contract value',
        legendBase: 'Journey base + contract & ARPU economics',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'Omnichannel care dialogue × 1.5',
        legendStrategic: 'Retention / upgrade programme push × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Fibre upgrade',
            desc: '1Gb install · self-setup · ARPU lift',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 contract value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'retention',
            title: 'Mobile save / retention',
            desc: 'Loyalty discount · add-ons',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 contract value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Device trade-in',
            desc: 'Early upgrade · recycle value',
            score: '114',
            barWidth: '33%',
            barOpacity: 0.45,
            multipliers: '×1.10 contract value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'SMB static IP',
            desc: 'Business line · SLA attach',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 contract value',
          },
          {
            rank: 5,
            issue: 'sales',
            title: 'Roaming & travel pack',
            desc: 'Trip add-on · bolt-on revenue',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 contract value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Fibre upgrade journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong upgrade and speed-test signals drive a high signalPropensity (190 points), the contractValue multiplier (×1.50) reflects the strongest expected ARPU lift, and the agenticLift (×1.50) reflects a recent install-booking assist session. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Fibre upgrade journey, the engine arbitrates across four install paths. Each path is a sequence of actions toward conversion. Path scoring blends line economics with the subscriber\'s usage signals, channel habit, and contract-end urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Fibre address check, Self-install kit path, Engineer install, Standard broadband page) are the four branches of a conditional split inside the Fibre upgrade journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one upgrade journey can produce a hyper-personalised outcome for thousands of distinct subscribers.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Fibre upgrade · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Fibre address check', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Self-install kit path', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Engineer install', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard broadband page', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Service attach base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ install / app habit (×1.2)',
            'Contract / truck-roll window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Fibre upgrade',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Fibre address check',
            actions: 'Postcode → Speed promise → Book install',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ fibre_ready_addr' },
              { cls: 'teal', text: '+ high_data_use' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Self-install kit path',
            actions: 'Router ship → App setup → Activate',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ self_serve_pref' },
              { cls: 'teal', text: '+ contract_end_45d' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Field ops',
            name: 'Engineer install',
            actions: 'Survey → Slot → Truck roll',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Retail store',
            name: 'Standard broadband page',
            actions: 'Plans table → Chat → Order',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Upgrade completion',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },

    public: {
      businessImpact: {
        sectionDesc:
          'When eligibility, language, and channel policy are respected, digital completion improves and assisted-service load falls — better citizen outcomes within the same budget.',
        cards: [
          {
            value: '+44%',
            valueTone: 'accent',
            label: 'Digital completion',
            sub: 'checklists + proactive reminders',
          },
          {
            value: '+31%',
            valueTone: 'teal',
            label: 'On-time submission',
            sub: 'document prompts + SMS nudge',
          },
          {
            value: '+26%',
            valueTone: 'amber',
            label: 'Programme uptake',
            sub: 'eligibility-aligned outreach',
          },
          {
            value: '−22%',
            valueTone: 'blue',
            label: 'Contact-centre minutes',
            sub: 'self-serve resolution mix',
          },
        ],
      },
      profile: {
        initials: 'RK',
        name: 'Riley Kim',
        meta: 'Reduced fare eligible · Metro account · Age 44',
        centerSub: 'Age 44 · Metro account · Reduced fare',
      },
      heroP:
        'From eligibility signals to channel policy — see how public-sector journeys stay compliant while optimising paths, channels, and citizen messaging.',
      journeys: [
        { name: 'Transit & mobility benefits', desc: 'Passes · concessions · uptake', issue: 'sales' },
        { name: 'Income-linked programmes', desc: 'Grants · fee relief', issue: 'sales' },
        { name: 'Permit & licensing fast lane', desc: 'Digital proof · SLA', issue: 'sales' },
        { name: 'Skills & workforce', desc: 'Cohort intake · training', issue: 'sales' },
        { name: 'Housing support pathway', desc: 'Case-managed · resolution', issue: 'retention' },
      ],
      paths: {
        mortgage: [
          { name: 'Benefit eligibility checker', actions: 'Income verify → Program list → Apply', desc: 'Self-serve benefits' },
          { name: 'Reduced fare onboarding', actions: 'Doc upload → Review → Pass issue', desc: 'Transit concession' },
          { name: 'Assisted application', actions: 'Queue ticket → Caseworker → Finish', desc: 'Digital equity path' },
          { name: 'Standard info hub', actions: 'FAQ → PDF forms → Portal', desc: 'Default citizen path' },
        ],
        invest: [
          { name: 'Workforce info session', actions: 'Cohort invite → RSVP → Enrol', desc: 'Programme education' },
          { name: 'Youth transit pass', actions: 'School verify → Guardian consent → Issue', desc: 'Family programme' },
          { name: 'Portal-only workflow', actions: 'Login → Pre-filled form → Submit', desc: 'Digital-first service' },
          { name: 'Community liaison', actions: 'Language need → Interpreter → Appointment', desc: 'Inclusive support' },
        ],
        insurance: [
          { name: 'Permit fee waiver', actions: 'Hardship check → Rules engine → Approve', desc: 'Fee relief path' },
          { name: 'Bundle service appointment', actions: 'Slot + documents → Reminder → Visit', desc: 'Multi-step service' },
          { name: 'Income protection programme', actions: 'Means test → Benefit tier → Notify', desc: 'Safety-net path' },
        ],
        card: [
          { name: 'Digital ID verify', actions: 'Document scan → Liveness → Unlock', desc: 'Identity assurance' },
          { name: 'Service cost estimator', actions: 'Household data → Estimates → Next step', desc: 'Transparency tool' },
          { name: 'Payment plan setup', actions: 'Balance → Instalments → Autopay', desc: 'Arrears support' },
          { name: 'Standard service page', actions: 'Service list → Chatbot → Form', desc: 'Default path' },
        ],
        retention: [
          { name: 'Proactive outreach pack', actions: 'Risk flags → Channel policy → Notify', desc: 'Case retention' },
          { name: 'Fee waiver + reinstatement', actions: 'Tenure rules → Credit → Confirm', desc: 'Citizen value back' },
          { name: 'Dedicated navigator', actions: 'Complex case → Assign → Call', desc: 'Human-assisted path' },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'Reduced fare eligible', tone: 'accent' },
          { text: 'Transit pass holder', tone: 'teal' },
          { text: 'Digital equity pathway', tone: 'amber' },
          { text: 'Multilingual preference', tone: 'coral' },
          { text: 'Benefits renewal due', tone: 'blue' },
          { text: 'Portal-first citizen', tone: 'accent' },
        ],
        events: [
          { key: '1h ago', text: 'Eligibility wizard · income band · document checklist downloaded' },
          { key: '5h ago', text: 'Reduced fare application · photo upload · status pending review' },
          { key: '2d ago', text: 'SMS reminder · permit renewal · appointment slot held' },
          { key: '1w ago', text: 'Community workshop RSVP · workforce skills session' },
        ],
        support: {
          lastCall: '8 May 2026 · Interpreter-assisted housing intake call',
          csat: '4.6 / 5 · Written confirmation in preferred language',
        },
        propensities: [
          { name: 'Programme uptake', val: '0.68', w: '68%', barClass: 'bar-red' },
          { name: 'Digital completion', val: '0.59', w: '59%', barClass: 'bar-blue' },
          { name: 'Assisted-service need', val: '0.46', w: '46%', barClass: 'bar-amber' },
          { name: 'Appeal / escalation risk', val: '0.22', w: '22%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 12 min ago',
          quoteBefore: 'I need help to ',
          quoteEm: 'upload my proof of income in the right format',
          quoteAfter: ' before my benefit deadline Friday.',
          tags: [
            { cls: 'intent', text: 'intent: document_upload_help' },
            { cls: 'entity', text: 'entity: eligibility_case' },
            { cls: 'sentiment', text: 'tone: anxious · deadline-driven' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'reduced_fare_policy_2026.pdf', meta: '1,389 chunks' },
            { icon: '📄', name: 'digital_accessibility_service_standard.pdf', meta: '1,056 chunks' },
            { icon: '🎙', name: 'voice_session_eligibility_help.transcript', meta: '289 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '82%', label: 'Income-linked programmes · high completion intent', val: '0.82' },
            { w: '75%', label: 'Transit concessions · mobile-first applicants', val: '0.75' },
            { w: '67%', label: 'Navigator-assisted · complex multi-agency cases', val: '0.67' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible service journeys. A composite score blends signal-driven propensity with approved programme value, accessibility-aware context, and policy levers — picking the highest-priority journey for this citizen right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes policy, consent, and eligibility rules',
          'matches the citizen case profile & segments',
          'passes channel policy + outreach frequency caps',
          'composite priority score',
        ],
        valueTerm: 'citizenValue',
        valueMultSpoken: 'citizen value',
        legendBase: 'Journey base + approved service value',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: '311 / navigator assist intent × 1.5',
        legendStrategic: 'Service improvement wave × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Transit & mobility benefits',
            desc: 'Passes · concessions · uptake',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 citizen value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'sales',
            title: 'Income-linked programmes',
            desc: 'Grants · fee relief',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 citizen value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Permit & licensing fast lane',
            desc: 'Digital proof · SLA',
            score: '114',
            barWidth: '33%',
            barOpacity: 0.45,
            multipliers: '×1.10 citizen value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Skills & workforce',
            desc: 'Cohort intake · training',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 citizen value',
          },
          {
            rank: 5,
            issue: 'retention',
            title: 'Housing support pathway',
            desc: 'Case-managed · resolution',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 citizen value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Transit & mobility benefits journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong eligibility-completion signals drive a high signalPropensity (190 points), the citizenValue multiplier (×1.50) reflects the strongest programme fit, and the agenticLift (×1.50) reflects a recent document-format assist session. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Transit & mobility benefits journey, the engine arbitrates across four service paths. Each path is a sequence of actions toward completion. Path scoring blends programme value with the citizen\'s eligibility signals, channel policy fit, and deadline urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Benefit eligibility checker, Reduced fare onboarding, Assisted application, Standard info hub) are the four branches of a conditional split inside the Transit & mobility benefits journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one benefits journey can produce a hyper-personalised outcome for thousands of distinct citizens.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Transit & mobility benefits · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Benefit eligibility checker', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Reduced fare onboarding', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Assisted application', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard info hub', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Service-fit base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ digital-equity habit (×1.2)',
            'Deadline / SLA window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Transit & mobility benefits',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Benefit eligibility checker',
            actions: 'Income verify → Program list → Apply',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ reduced_fare_flag' },
              { cls: 'teal', text: '+ portal_first' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Reduced fare onboarding',
            actions: 'Doc upload → Review → Pass issue',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ doc_checklist_done' },
              { cls: 'teal', text: '+ multilingual_pref' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Navigator',
            name: 'Assisted application',
            actions: 'Queue ticket → Caseworker → Finish',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · 311',
            name: 'Standard info hub',
            actions: 'FAQ → PDF forms → Portal',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Digital completion',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },

    healthcare: {
      businessImpact: {
        sectionDesc:
          'When access, benefits, and clinical programmes stay appropriate to each member, operational metrics like show-rate and gap closure improve without noisy outreach.',
        cards: [
          {
            value: '+29%',
            valueTone: 'accent',
            label: 'Appointment show-rate',
            sub: 'reminders + channel fit',
          },
          {
            value: '+24%',
            valueTone: 'teal',
            label: 'Care-gap closure',
            sub: 'preventive outreach vs static mail',
          },
          {
            value: '+21%',
            valueTone: 'amber',
            label: 'Mail-order adherence',
            sub: '90-day refill orchestration',
          },
          {
            value: '+18%',
            valueTone: 'blue',
            label: 'Portal task completion',
            sub: 'personalised benefit prompts',
          },
        ],
      },
      profile: {
        initials: 'JE',
        name: 'Jordan Ellis',
        meta: 'PPO · Employer HSA · Age 39',
        centerSub: 'Age 39 · PPO · Employer HSA',
      },
      heroP:
        'From virtual visits to adherence — see how care signals cascade through clinically appropriate journeys, paths, channels, and sensitive messaging.',
      journeys: [
        { name: 'Virtual-first care', desc: 'Triage · same-week slot · utilisation', issue: 'sales' },
        { name: 'Specialty referral assist', desc: 'In-network · prior auth', issue: 'sales' },
        { name: 'Pharmacy adherence', desc: 'Mail order · 90-day fills', issue: 'sales' },
        { name: 'Chronic programme', desc: 'Coaching · devices · engagement', issue: 'sales' },
        { name: 'Wellness incentive', desc: 'Steps · screenings · rewards', issue: 'sales' },
      ],
      paths: {
        mortgage: [
          { name: 'Video visit booking', actions: 'Symptom triage → Slot → Intake form', desc: 'Virtual access path' },
          { name: 'Care gap closure', actions: 'Preventive due → Schedule → Reminder', desc: 'Quality programme' },
          { name: 'Nurse line escalation', actions: 'Protocol → Nurse → Orders', desc: 'Clinical assist' },
          { name: 'Standard care finder', actions: 'ZIP → Providers → Book', desc: 'Default directory path' },
        ],
        invest: [
          { name: 'Specialty education session', actions: 'Referral status → Class → Next step', desc: 'Member education' },
          { name: 'Dependent coverage setup', actions: 'Life event → Eligibility → Enrol', desc: 'Family coverage' },
          { name: 'App care programme', actions: 'Device sync → Tasks → Coach', desc: 'Digital therapeutic' },
          { name: 'Care navigator call', actions: 'Complex case → Authorisation help', desc: 'High-touch support' },
        ],
        insurance: [
          { name: 'Prior auth fast track', actions: 'Clinical criteria → Attachments → Submit', desc: 'Authorisation workflow' },
          { name: 'Pharmacy mail order', actions: 'Drug list → 90-day → Ship', desc: 'Maintenance medication' },
          { name: 'Cost estimator', actions: 'Procedure code → Network → OOP', desc: 'Financial transparency' },
        ],
        card: [
          { name: 'Benefit comparison', actions: 'Plan year → Copay grid → Choose', desc: 'Open enrolment assist' },
          { name: 'HSA contribution planner', actions: 'Payroll → Limits → Confirm', desc: 'Financial wellness' },
          { name: 'Care programme enrol', actions: 'Risk score → Programme fit → Opt-in', desc: 'Condition management' },
          { name: 'Standard benefits page', actions: 'Summary → ID card → Support', desc: 'Default member path' },
        ],
        retention: [
          { name: 'Care gap outreach', actions: 'Quality rules → Compliant channel → Book', desc: 'Retention outreach' },
          { name: 'Premium support unlock', actions: 'Tenure → Concierge → Callback', desc: 'Member reinforcement' },
          { name: 'Pharmacist consult', actions: 'Med review → Interaction check → Plan', desc: 'Clinical retention' },
        ],
      },
      profileHub: {
        segmentTags: [
          { text: 'PPO in-network', tone: 'accent' },
          { text: 'Chronic condition programme', tone: 'teal' },
          { text: 'Mail-order pharmacy', tone: 'amber' },
          { text: 'Virtual-first utiliser', tone: 'coral' },
          { text: 'HSA contributor', tone: 'blue' },
          { text: 'Care gap flagged · A1c', tone: 'accent' },
        ],
        events: [
          { key: '90m ago', text: 'Video visit completed · follow-up lab order sent to in-network lab' },
          { key: '4h ago', text: 'Member portal · prior auth status · document upload' },
          { key: '1d ago', text: 'Pharmacy refill · 90-day maintenance · SMS pick-up reminder' },
          { key: '3d ago', text: 'Wellness app sync · step goal · incentive points credited' },
        ],
        support: {
          lastCall: '7 May 2026 · Prior authorisation for specialty tier-3 drug',
          csat: '4.7 / 5 · Nurse line callback within committed window',
        },
        propensities: [
          { name: 'Care gap closure', val: '0.72', w: '72%', barClass: 'bar-red' },
          { name: 'Mail-order adherence', val: '0.67', w: '67%', barClass: 'bar-blue' },
          { name: 'Programme enrolment', val: '0.51', w: '51%', barClass: 'bar-amber' },
          { name: 'ED utilisation risk', val: '0.33', w: '33%', barClass: 'bar-teal' },
        ],
        agentic: {
          voiceLabel: 'Voice-agent dialogue · 9 min ago',
          quoteBefore: 'Can you ',
          quoteEm: 'tell me if this specialist is in network for my plan',
          quoteAfter: ' and what my copay would be?',
          tags: [
            { cls: 'intent', text: 'intent: network_benefit_lookup' },
            { cls: 'entity', text: 'entity: plan_tier' },
            { cls: 'sentiment', text: 'tone: cost-sensitive' },
          ],
          docsLabel: 'Indexed unstructured · vectorised',
          docs: [
            { icon: '📄', name: 'member_coverage_summary_2026.pdf', meta: '2,103 chunks' },
            { icon: '📄', name: 'prior_auth_clinical_criteria_index.pdf', meta: '1,512 chunks' },
            { icon: '🎙', name: 'voice_session_benefits_lookup.transcript', meta: '356 chunks' },
          ],
          neighboursLabel: 'Semantic neighbours · cosine similarity',
          neighbours: [
            { w: '86%', label: 'Chronic care · high digital engagement members', val: '0.86' },
            { w: '79%', label: 'Pharmacy adherence · mail-order 90-day', val: '0.79' },
            { w: '71%', label: 'Benefits voice · authenticated portal sessions', val: '0.71' },
          ],
        },
      },
      journeyPrioritisation: {
        intro:
          'The Next-Best-Action engine arbitrates across all eligible care and benefits journeys. A composite score blends signal-driven propensity with clinically appropriate programme value, benefits-navigation context, and quality levers — picking the highest-priority journey for this member right now.',
        funnelDetails: [
          'across the full journey catalogue',
          'passes benefits, clinical, and consent rules',
          'aligns with this member care profile & segments',
          'passes outreach policy + sensitive-channel caps',
          'composite priority score',
        ],
        valueTerm: 'memberValue',
        valueMultSpoken: 'member value',
        legendBase: 'Journey base + programme appropriateness',
        legendSignal: 'Σ active signals × journey affinity',
        legendAgentic: 'Benefits navigator dialogue × 1.5',
        legendStrategic: 'Care programme weighting × 1.3',
      },
      rankedJourneys: {
        heading: 'Ranked journeys for this profile',
        rows: [
          {
            rank: 1,
            issue: 'sales',
            title: 'Virtual-first care',
            desc: 'Triage · same-week slot · utilisation',
            score: '345',
            barWidth: '100%',
            barOpacity: 1,
            multipliers: '×1.50 member value · ×1.50 agentic',
          },
          {
            rank: 2,
            issue: 'sales',
            title: 'Specialty referral assist',
            desc: 'In-network · prior auth',
            score: '136',
            barWidth: '40%',
            barOpacity: 0.55,
            multipliers: '×1.30 member value',
          },
          {
            rank: 3,
            issue: 'sales',
            title: 'Pharmacy adherence',
            desc: 'Mail order · 90-day fills',
            score: '114',
            barWidth: '33%',
            barOpacity: 0.45,
            multipliers: '×1.10 member value',
          },
          {
            rank: 4,
            issue: 'sales',
            title: 'Chronic programme',
            desc: 'Coaching · devices · engagement',
            score: '82',
            barWidth: '24%',
            barOpacity: 0.3,
            multipliers: '×0.90 member value',
          },
          {
            rank: 5,
            issue: 'sales',
            title: 'Wellness incentive',
            desc: 'Steps · screenings · rewards',
            score: '61',
            barWidth: '18%',
            barOpacity: 0.2,
            multipliers: '×1.40 member value',
          },
        ],
        selectedExplainer: {
          title: 'Selected: Virtual-first care journey',
          body:
            'Composite score 345 — winning by 2.5×. Strong access and care-gap signals drive a high signalPropensity (190 points), the memberValue multiplier (×1.50) reflects the strongest appropriate programme lift, and the agenticLift (×1.50) reflects a recent in-network benefits lookup session. ',
          bodyEm: 'Try the Flow Analysis above to swap the strategicLever and watch the ranking re-arbitrate live.',
        },
      },
      nextBestPath: {
        intro:
          'Inside the chosen Virtual-first care journey, the engine arbitrates across four access paths. Each path is a sequence of actions toward the next best clinical step. Path scoring blends programme appropriateness with the member\'s benefit signals, channel sensitivity, and care-gap urgency.',
        ajo101: {
          titleHtml: 'What is a <em>conditional split</em>?',
          bodyHtml:
            'In <strong>Adobe Journey Optimizer</strong>, a journey is built on a visual canvas. A <strong>conditional split node</strong> is a fork in that canvas — incoming profiles are evaluated against a rule, and each profile is routed down one branch or another. The branches you see below (Video visit booking, Care gap closure, Nurse line escalation, Standard care finder) are the four branches of a conditional split inside the Virtual-first care journey. The percentage on each branch shows the share of profiles that flowed down that branch — your real metric for path effectiveness.',
          whyHtml:
            '<strong>Why it matters:</strong> the path scoring formula above runs <em>per profile</em> at the split node. Two profiles entering the same journey can take entirely different branches because their signal mix tips the formula differently. That is how one access journey can produce a hyper-personalised outcome for thousands of distinct members.',
          sourceHtml:
            'This is a simplified illustration of an Adobe Journey Optimizer Journey Canvas — the real canvas in AJO offers the same conditional-split mechanic with richer branching, expression rules, percentages and segment overlays.',
        },
        canvas: {
          entryLabel: 'Virtual-first care · entry',
          splitLabel: 'Conditional split',
          branches: [
            { name: 'Video visit booking', statHtml: '<strong>87%</strong> 11,171 profiles', winner: true },
            { name: 'Care gap closure', statHtml: '<strong>71%</strong> 9,116 profiles', winner: false },
            { name: 'Nurse line escalation', statHtml: '<strong>52%</strong> 6,677 profiles', winner: false },
            { name: 'Standard care finder', statHtml: '<strong>38%</strong> 4,879 profiles', winner: false },
          ],
        },
        formula: {
          pathTerm: 'pathBase',
          legends: [
            'Clinical-fit base 0.35–0.55',
            'Σ signal × path-specific boosts',
            'Path channel ↔ portal / telehealth habit (×1.2)',
            'Care-gap / refill window: fast paths +15%, slow paths −10%',
          ],
        },
        rankedPathsTitle: 'Ranked paths within Virtual-first care',
        paths: [
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Video visit booking',
            actions: 'Symptom triage → Slot → Intake form',
            score: '87%',
            winner: true,
            tags: [
              { cls: 'teal', text: '+ virtual_visit_pref' },
              { cls: 'teal', text: '+ care_gap_a1c' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
              { cls: 'amber', text: 'urgencyWindow ✓ (fast)' },
            ],
          },
          {
            channel: 'digital',
            channelLabel: 'Channel · Digital',
            name: 'Care gap closure',
            actions: 'Preventive due → Schedule → Reminder',
            score: '71%',
            tags: [
              { cls: 'teal', text: '+ quality_gap_open' },
              { cls: 'teal', text: '+ in_network_lab' },
              { cls: 'violet', text: 'behaviouralFit ✓' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Nurse line',
            name: 'Nurse line escalation',
            actions: 'Protocol → Nurse → Orders',
            score: '52%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'urgencyWindow miss (slow)' },
            ],
          },
          {
            channel: 'assisted',
            channelLabel: 'Channel · Care guide',
            name: 'Standard care finder',
            actions: 'ZIP → Providers → Book',
            score: '38%',
            tags: [
              { cls: 'dim', text: 'behaviouralFit miss' },
              { cls: 'dim', text: 'slow path' },
            ],
          },
        ],
        footer: {
          pathsEvaluatedLabel: 'Paths evaluated',
          pathsEvaluatedValue: '4',
          conversionLabel: 'Visit show-rate',
          conversionValue: '87%',
          conversionBarW: '87%',
          liftLabel: 'Lift vs default branch',
          liftValue: '+25%',
        },
      },
    },
  };
})();
