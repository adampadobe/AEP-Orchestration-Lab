/**
 * Flow Analysis view (#viewFlow) — profile signals, simulate cards, message controls,
 * and flow email preview. Merged into AEP_PIPELINE_INDUSTRY_LABELS after labels.js.
 * FSI has no merge: apply.js restores the HTML baseline when toolbar key is fsi.
 * Signal ids (mortgage_need, refi_intent, …) stay FSI-shaped for scoring compatibility.
 */
(function () {
  var root = window.AEP_PIPELINE_INDUSTRY_LABELS;
  if (!root) return;

  function a(sid, icon, color, name, detail, shortLabel) {
    return { sid: sid, icon: icon, color: color, name: name, detail: detail, shortLabel: shortLabel || name };
  }

  function simBtn(simKey, value, label, active) {
    return { simKey: simKey, value: value, label: label, active: !!active };
  }

  function annBlock(inner) {
    return inner + '<div class="em-annotation"><div class="em-ann-line"></div></div>';
  }

  function mediaPack() {
    return {
      sectionLabels: {
        goals: 'Viewing goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'ARPU',
      attrs: [
        a('mortgage_need', '🎬', 'red', 'Upgrade to annual plan?', 'Trial ending · drama bundle viewed 4×', 'Annual upgrade'),
        a('refi_intent', '📊', 'red', 'Compared plan tiers', 'Pricing page · payment sheet opened 2h ago', 'Plan compare'),
        a('rewards_interest', '⭐', 'amber', 'Maximise loyalty points?', '£42/mo spend · points expiring', 'Loyalty points'),
        a('debt_consolidation', '📵', 'amber', 'Reduce ad interruptions', 'Ad-tier session · skip rate high', 'Ad fatigue'),
        a('savings_growth', '📈', 'blue', 'Discover new genres?', 'Binge cluster · hero rails clicked', 'Discovery'),
        a('family_protection', '👨‍👩‍👧', 'teal', 'Safe kids profiles', 'Parental gate used · 2 child profiles', 'Kids safety'),
        a('school_savings', '🎓', 'blue', 'Add family seats?', 'Household plan eligible · 1 seat used', 'Family seats'),
        a('churn_risk', '⚠', 'coral', 'Cancel risk elevated', 'Trial downgrade page · low opens', 'Churn risk'),
        a('mobile_first', '📱', 'teal', 'Smart TV + mobile', '68% watch time on TV app · mobile companion', 'Multi-screen'),
        a('agent_intent', '🤖', 'amber', 'In-app assist chat', '"Add sports for the weekend" · 3m ago', 'Assist chat'),
        a('email_cap', '🚫', 'coral', 'Promo email cap reached', 'Weekly promo limit (3/3) · cooldown active', 'Email cap'),
      ],
      features: {
        savings: {
          label: 'Feature you might love',
          title: 'Watchlist+',
          body: 'Save series across devices and pick up exactly where you left off — included with Premium.',
          meta: ['Included with Premium', 'Syncs to all profiles'],
          signal: 'feature_enabled=false · watchlist_plus · tenure≥6mo',
        },
        roundups: {
          label: 'Small habit, big catalogue',
          title: 'Offline downloads',
          body: 'Download episodes before a flight or commute — no buffering, no surprises on data use.',
          meta: ['Pause anytime', 'Up to 25 titles per device'],
          signal: 'feature_enabled=false · offline_dl · mobile_first active',
        },
        credit: {
          label: 'Understand your value',
          title: 'Genre match quiz',
          body: 'A two-minute taste profile surfaces rails tuned to your household — no account changes required.',
          meta: ['Optional', 'Improves recommendations'],
          signal: 'feature_enabled=false · taste_quiz · binge_cluster active',
        },
      },
      strategy: {
        standard: {
          title: 'Your upgrade options, side by side',
          body: 'Compare annual vs monthly with your loyalty credits applied. Drama bundle pricing reflects your recent binge cluster.',
          savingPeriod: 'estimated annual saving vs monthly billing',
          cta: 'Compare plans',
          secondary: 'Chat with support',
          timer: null,
        },
        urgency: {
          title: 'Your trial window is closing soon',
          body: 'The promotional annual rate is held for the next 24 hours. Review upgrade options while this pricing still applies.',
          savingPeriod: 'estimated saving at promotional annual rate',
          cta: 'Upgrade now',
          secondary: 'Remind me later',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'subscriberValue',
        valueCond: 'packaging / ARPU multiplier',
        valueOp: '× subscriberValue',
        simBankTag: 'Journey · subscriberValue',
      },
      simulate: {
        leverDesc: 'What is editorial or packaging pushing this quarter?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Upgrade push', false),
          simBtn('lever', 'retention', 'Win-back', false),
          simBtn('lever', 'cards', 'Add-on bundle', false),
        ],
        bankDesc: 'Override the subscriber-value multiplier for a specific journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost upgrade', false),
          simBtn('bankBoost', 'retention', 'Boost win-back', false),
          simBtn('bankBoost', 'card', 'Boost add-on', false),
        ],
        urgencyDesc: 'Time-sensitive context that lifts fast paths and dampens slow ones.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Trial ending', false),
          simBtn('urgency', 'churn', 'Churn imminent', false),
        ],
        channelDesc: 'How should the business execute? Auto reads mobile / TV signals. Overrides force app or specialist.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'App-first', false),
          simBtn('channelStrategy', 'advisor', 'Specialist-led', false),
        ],
        agenticDesc: 'Assist or voice signal — toggled via in-app assist in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Underused feature',
        features: [
          { key: 'savings', label: 'Watchlist+', active: true },
          { key: 'roundups', label: 'Offline downloads', active: false },
          { key: 'credit', label: 'Genre match', active: false },
        ],
        featureHint: 'Swaps the Dynamic content container in the message preview',
        sliderLabel: 'Trial window',
        sliderHint: 'Pull below 24h to trigger the urgency variant of the Selection Strategy',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore upgrade paths',
        channels: 'Click the top path to see channel ranking for this household',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what Alex sees in the app and inbox',
      },
      email: {
        subject: 'Your StreamMax upgrade options',
        brand: 'StreamMax',
        brandSub: 'Stories worth staying for',
        greetingHtml:
          'Good evening, <span class="em-hl">Alex</span> <span class="em-tier-badge">★ Premium annual</span>',
        profileBodyHtml:
          'Thanks for being a Premium member since <strong>2022</strong>. Based on your <strong>drama binge cluster</strong>, we lined up annual and bundle options that match how you watch.',
        navHtml: '<a>Watch</a><a>Plans</a><a>Downloads</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">📋</span> Your plan comparison — saved</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Current plan</div><div class="em-ctx-value">Monthly Premium</div></div><div class="em-ctx-item"><div class="em-ctx-label">Annual offer</div><div class="em-ctx-value em-highlight">£89/yr</div></div><div class="em-ctx-item"><div class="em-ctx-label">Drama bundle</div><div class="em-ctx-value">+£4/mo</div></div><div class="em-ctx-item"><div class="em-ctx-label">Est. annual saving</div><div class="em-ctx-value highlight">£36/yr</div></div></div></div><div class="em-body-text" style="margin-top:8px;font-size:11px">Pick up your comparison whenever you are ready — we kept your place.</div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested for you</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Sports weekend add-on</div><div style="font-size:10px;color:#666;margin-top:2px">Matches your recent assist request.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Family seat bundle</div><div style="font-size:10px;color:#666;margin-top:2px">Add profiles for kids with parental controls.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  function retailPack() {
    return {
      sectionLabels: {
        goals: 'Shopping goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'margin',
      attrs: [
        a('mortgage_need', '🛒', 'red', 'Complete basket checkout?', '3 items saved · promo stack eligible', 'Basket checkout'),
        a('refi_intent', '🏷', 'red', 'Compared loyalty prices', 'Price alert opened · competitor match viewed', 'Price compare'),
        a('rewards_interest', '💳', 'amber', 'Boost loyalty tier?', 'Gold points · £240/mo spend', 'Loyalty tier'),
        a('debt_consolidation', '📦', 'amber', 'Consolidate deliveries', 'Split shipments · pickup slot friction', 'Delivery merge'),
        a('savings_growth', '📈', 'blue', 'Discover new categories?', 'Browse history · home & garden rail', 'Category discovery'),
        a('family_protection', '👨‍👩‍👧', 'teal', 'Household account', 'Shared list · 2 dependents', 'Household'),
        a('school_savings', '🎒', 'blue', 'Back-to-school list?', 'Seasonal list started · no checkout', 'Seasonal list'),
        a('churn_risk', '⚠', 'coral', 'Cart abandon risk', 'Competitor coupon detected · low app opens', 'Abandon risk'),
        a('mobile_first', '📱', 'teal', 'App-first shopper', '72% orders on app · scan & go user', 'App-first'),
        a('agent_intent', '🤖', 'amber', 'Store assist chat', '"Where is my pickup?" · 8m ago', 'Store assist'),
        a('email_cap', '🚫', 'coral', 'Promo SMS cap reached', 'Weekly SMS limit (2/2) · cooldown', 'SMS cap'),
      ],
      features: {
        savings: {
          label: 'Service you might like',
          title: 'Click & collect',
          body: 'Reserve online and collect in store within 2 hours — skip the queue on busy days.',
          meta: ['Free on Gold', 'Most stores'],
          signal: 'feature_enabled=false · click_collect · loyalty_gold',
        },
        roundups: {
          label: 'Habit, less waste',
          title: 'Subscribe & save',
          body: 'Reorder household staples on a rhythm you control — pause or skip any cycle.',
          meta: ['5% off eligible lines', 'Flexible cadence'],
          signal: 'feature_enabled=false · subscribe_save · basket_repeat',
        },
        credit: {
          label: 'Know your benefits',
          title: 'Rewards calculator',
          body: 'See how much your last quarter could have earned on the next tier up.',
          meta: ['Soft estimate only', 'No card change'],
          signal: 'feature_enabled=false · rewards_calc · tier_near',
        },
      },
      strategy: {
        standard: {
          title: 'Your pickup and offers, clearly laid out',
          body: 'Review slot options and loyalty savings on the items still in your basket — no pressure framing.',
          savingPeriod: 'estimated savings vs standard delivery',
          cta: 'View basket',
          secondary: 'Store locator',
          timer: null,
        },
        urgency: {
          title: 'Your reserved pickup slot is soon',
          body: 'The hold on your collection window expires in the next few hours. Confirm or reschedule while stock is allocated.',
          savingPeriod: 'savings if you confirm before slot expiry',
          cta: 'Confirm pickup',
          secondary: 'Reschedule',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'marginValue',
        valueCond: 'category margin multiplier',
        valueOp: '× marginValue',
        simBankTag: 'Journey · marginValue',
      },
      simulate: {
        leverDesc: 'What is merchandising pushing this season?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Basket recovery', false),
          simBtn('lever', 'retention', 'Loyalty renewal', false),
          simBtn('lever', 'cards', 'Cross-category', false),
        ],
        bankDesc: 'Override the margin multiplier for a specific journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost basket', false),
          simBtn('bankBoost', 'retention', 'Boost loyalty', false),
          simBtn('bankBoost', 'card', 'Boost cross-sell', false),
        ],
        urgencyDesc: 'Pickup or promo windows that lift fast fulfilment paths.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Slot expiring', false),
          simBtn('urgency', 'churn', 'Abandon imminent', false),
        ],
        channelDesc: 'Auto reads app-first behaviour. Overrides force store or specialist.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'Digital-first', false),
          simBtn('channelStrategy', 'advisor', 'Store-led', false),
        ],
        agenticDesc: 'Store assist signal — toggled via assist chat in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Underused service',
        features: [
          { key: 'savings', label: 'Click & collect', active: true },
          { key: 'roundups', label: 'Subscribe & save', active: false },
          { key: 'credit', label: 'Rewards calc', active: false },
        ],
        featureHint: 'Swaps the Dynamic content block in the message preview',
        sliderLabel: 'Pickup slot window',
        sliderHint: 'Pull below 4h to trigger urgency creative in the Selection Strategy',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore fulfilment paths',
        channels: 'Click the top path to see channel ranking',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what the shopper sees',
      },
      email: {
        subject: 'Your basket and pickup options',
        brand: 'Northline Retail',
        brandSub: 'Everyday value, clearly priced',
        greetingHtml:
          'Hello, <span class="em-hl">Jordan</span> <span class="em-tier-badge">★ Gold loyalty</span>',
        profileBodyHtml:
          'As a Gold member, your <strong>saved basket</strong> and <strong>pickup eligibility</strong> are ready to review — we applied loyalty pricing where it applies.',
        navHtml: '<a>Shop</a><a>Orders</a><a>Stores</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">🛒</span> Basket summary</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Items</div><div class="em-ctx-value">3</div></div><div class="em-ctx-item"><div class="em-ctx-label">Loyalty saving</div><div class="em-ctx-value em-highlight">£12.40</div></div><div class="em-ctx-item"><div class="em-ctx-label">Pickup slot</div><div class="em-ctx-value">Today 17:00</div></div><div class="em-ctx-item"><div class="em-ctx-label">Delivery alt.</div><div class="em-ctx-value">£3.99</div></div></div></div><div class="em-body-text" style="margin-top:8px;font-size:11px">Your slot is held — confirm when it suits you.</div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Subscribe & save staples</div><div style="font-size:10px;color:#666;margin-top:2px">Based on repeat basket lines.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Extended warranty</div><div style="font-size:10px;color:#666;margin-top:2px">For electronics in your basket.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  function travelPack() {
    return {
      sectionLabels: {
        goals: 'Trip goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'trip value',
      attrs: [
        a('mortgage_need', '✈', 'red', 'Upgrade cabin or fare?', 'Long-haul in 12d · upgrade tile opened', 'Fare upgrade'),
        a('refi_intent', '🧳', 'red', 'Compared ancillaries', 'Seat map · bags · lounge viewed', 'Ancillary browse'),
        a('rewards_interest', '⭐', 'amber', 'Maximise miles?', '42k miles · expiry in 90d', 'Miles balance'),
        a('debt_consolidation', '🔄', 'amber', 'Simplify connections', 'Multi-leg itinerary · long layover', 'Connection pain'),
        a('savings_growth', '🏨', 'blue', 'Add hotel bundle?', 'Destination search · 3 hotels saved', 'Hotel attach'),
        a('family_protection', '👨‍👩‍', 'teal', 'Travel with family', '4 PAX · child meal prefs on file', 'Family trip'),
        a('school_savings', '🎒', 'blue', 'School holiday trip?', 'Break dates · no booking yet', 'Holiday window'),
        a('churn_risk', '⚠', 'coral', 'Loyalty lapse risk', 'No flight 11mo · competitor promo', 'Lapse risk'),
        a('mobile_first', '📱', 'teal', 'App-first traveller', 'Boarding pass in app · push opt-in', 'App traveller'),
        a('agent_intent', '🤖', 'amber', 'Travel assist chat', '"Change my seat" · 12m ago', 'Travel assist'),
        a('email_cap', '🚫', 'coral', 'Promo email cap', 'Weekly promo limit reached', 'Email cap'),
      ],
      features: {
        savings: {
          label: 'Benefit to unlock',
          title: 'Lounge access pass',
          body: 'One complimentary lounge visit on your upcoming long-haul — activate before departure.',
          meta: ['Gold+ only', 'Single use'],
          signal: 'feature_enabled=false · lounge_pass · long_haul_soon',
        },
        roundups: {
          label: 'Trip smoother',
          title: 'Auto check-in',
          body: 'We check you in and deliver boarding passes to the app as soon as the window opens.',
          meta: ['Opt-in', 'Push required'],
          signal: 'feature_enabled=false · auto_checkin · app_first',
        },
        credit: {
          label: 'Plan ahead',
          title: 'Disruption cover',
          body: 'See what rebooking options apply before you travel — plain language, no fine print hunt.',
          meta: ['Estimate only', 'Policy linked'],
          signal: 'feature_enabled=false · disruption_cover · multi_leg',
        },
      },
      strategy: {
        standard: {
          title: 'Your trip extras, clearly priced',
          body: 'Review seat, bag, and lounge options for your upcoming departure — loyalty miles quoted upfront.',
          savingPeriod: 'miles earned on selected bundles',
          cta: 'Review extras',
          secondary: 'Manage booking',
          timer: null,
        },
        urgency: {
          title: 'Departure window is approaching',
          body: 'Some ancillaries close 24 hours before departure. Confirm choices while inventory is available.',
          savingPeriod: 'miles bonus if purchased before cutoff',
          cta: 'Confirm extras',
          secondary: 'View itinerary',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'tripValue',
        valueCond: 'ancillary margin multiplier',
        valueOp: '× tripValue',
        simBankTag: 'Journey · tripValue',
      },
      simulate: {
        leverDesc: 'What is network revenue management pushing?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Ancillary uplift', false),
          simBtn('lever', 'retention', 'Loyalty save', false),
          simBtn('lever', 'cards', 'Partner bundle', false),
        ],
        bankDesc: 'Override trip-value multiplier for a journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost ancillary', false),
          simBtn('bankBoost', 'retention', 'Boost loyalty', false),
          simBtn('bankBoost', 'card', 'Boost partner', false),
        ],
        urgencyDesc: 'Departure countdown lifts time-sensitive paths.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Departure <24h', false),
          simBtn('urgency', 'churn', 'Disruption risk', false),
        ],
        channelDesc: 'Auto reads app-first traveller. Overrides force digital or agent desk.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'App-first', false),
          simBtn('channelStrategy', 'advisor', 'Agent desk', false),
        ],
        agenticDesc: 'Travel assist — toggled via assist chat in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Underused benefit',
        features: [
          { key: 'savings', label: 'Lounge pass', active: true },
          { key: 'roundups', label: 'Auto check-in', active: false },
          { key: 'credit', label: 'Disruption cover', active: false },
        ],
        featureHint: 'Swaps Dynamic content in the message preview',
        sliderLabel: 'Departure countdown',
        sliderHint: 'Pull below 24h to trigger urgency variant',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore trip paths',
        channels: 'Click the top path to see channel ranking',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what the traveller sees',
      },
      email: {
        subject: 'Your trip extras for LHR → JFK',
        brand: 'Horizon Airways',
        brandSub: 'Travel made clear',
        greetingHtml:
          'Hello, <span class="em-hl">Morgan</span> <span class="em-tier-badge">★ Gold flyer</span>',
        profileBodyHtml:
          'Your <strong>departure on 14 Jun</strong> is coming up. We prepared seat, bag, and lounge options matched to your loyalty tier.',
        navHtml: '<a>Trips</a><a>Check-in</a><a>Miles</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">✈</span> Itinerary snapshot</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Route</div><div class="em-ctx-value">LHR → JFK</div></div><div class="em-ctx-item"><div class="em-ctx-label">Fare</div><div class="em-ctx-value">Economy Flex</div></div><div class="em-ctx-item"><div class="em-ctx-label">Seat</div><div class="em-ctx-value em-highlight">12A held</div></div><div class="em-ctx-item"><div class="em-ctx-label">Miles earn</div><div class="em-ctx-value highlight">+4,200</div></div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Hotel bundle — Manhattan</div><div style="font-size:10px;color:#666;margin-top:2px">Matches your destination search.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Travel insurance</div><div style="font-size:10px;color:#666;margin-top:2px">Trip protection for 4 travellers.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  function sportsPack() {
    return {
      sectionLabels: {
        goals: 'Fan goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'fan value',
      attrs: [
        a('mortgage_need', '🎟', 'red', 'Upgrade membership?', 'Renewal in 30d · premium tier viewed', 'Membership'),
        a('refi_intent', '🏟', 'red', 'Browsed ticket bundles', 'Derby match · VIP package page', 'Ticket bundles'),
        a('rewards_interest', '⭐', 'amber', 'Maximise fan points?', '12k points · merch discount eligible', 'Fan points'),
        a('debt_consolidation', '📺', 'amber', 'Stream + stadium bundle', 'OTT trial · broadcast rights', 'Broadcast bundle'),
        a('savings_growth', '👕', 'blue', 'Merch drop interest', 'Kit preorder · size saved', 'Merch drop'),
        a('family_protection', '👨‍👩‍', 'teal', 'Family section seats', '2 junior members · safe standing opt-out', 'Family seats'),
        a('school_savings', '🎓', 'blue', 'Youth academy camps?', 'Age 10 · camp brochure opened', 'Youth camp'),
        a('churn_risk', '⚠', 'coral', 'Renewal at risk', 'Skipped last 3 home games', 'Renewal risk'),
        a('mobile_first', '📱', 'teal', 'App match-day user', 'Mobile ticket · push alerts on', 'Match-day app'),
        a('agent_intent', '🤖', 'amber', 'Fan assist chat', '"Which entrance for block G?" · 5m ago', 'Fan assist'),
        a('email_cap', '🚫', 'coral', 'Match promo cap', 'Weekly promo limit hit', 'Promo cap'),
      ],
      features: {
        savings: {
          label: 'Benefit for members',
          title: 'Early ticket window',
          body: 'Members get a 48-hour presale on cup fixtures — activate for the next home stand release.',
          meta: ['Members only', 'One click'],
          signal: 'feature_enabled=false · presale_window · renewal_near',
        },
        roundups: {
          label: 'Match day easier',
          title: 'Mobile parking pass',
          body: 'Pre-pay parking and scan on arrival — skip the gate queue on busy fixtures.',
          meta: ['Limited bays', 'Refundable'],
          signal: 'feature_enabled=false · parking_pass · match_day_app',
        },
        credit: {
          label: 'Know your tier',
          title: 'Points forecast',
          body: 'See projected fan points from merch and attendance through end of season.',
          meta: ['Estimate', 'No purchase required'],
          signal: 'feature_enabled=false · points_forecast · tier_near',
        },
      },
      strategy: {
        standard: {
          title: 'Your membership and ticket options',
          body: 'Compare renewal tiers and upcoming fixture bundles with loyalty points applied.',
          savingPeriod: 'points earned on selected bundles',
          cta: 'View offers',
          secondary: 'Fixture calendar',
          timer: null,
        },
        urgency: {
          title: 'Payment plan window closing',
          body: 'Installment plans for season tickets close soon. Confirm while your seats are held.',
          savingPeriod: 'saving vs pay-in-full',
          cta: 'Confirm plan',
          secondary: 'Talk to membership',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'fanValue',
        valueCond: 'revenue / margin multiplier',
        valueOp: '× fanValue',
        simBankTag: 'Journey · fanValue',
      },
      simulate: {
        leverDesc: 'What is the club commercial team pushing?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Membership', false),
          simBtn('lever', 'retention', 'Renewal', false),
          simBtn('lever', 'cards', 'Merch / media', false),
        ],
        bankDesc: 'Override fan-value multiplier for a journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost membership', false),
          simBtn('bankBoost', 'retention', 'Boost renewal', false),
          simBtn('bankBoost', 'card', 'Boost merch', false),
        ],
        urgencyDesc: 'Fixture or payment deadlines lift urgent paths.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Plan ending', false),
          simBtn('urgency', 'churn', 'Renewal risk', false),
        ],
        channelDesc: 'Auto reads match-day app usage. Overrides force digital or rep.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'App-first', false),
          simBtn('channelStrategy', 'advisor', 'Rep-led', false),
        ],
        agenticDesc: 'Fan assist — toggled via assist chat in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Underused benefit',
        features: [
          { key: 'savings', label: 'Presale window', active: true },
          { key: 'roundups', label: 'Parking pass', active: false },
          { key: 'credit', label: 'Points forecast', active: false },
        ],
        featureHint: 'Swaps Dynamic content in the message preview',
        sliderLabel: 'Payment plan window',
        sliderHint: 'Pull below 24h to trigger urgency variant',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore fan paths',
        channels: 'Click the top path to see channel ranking',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what the fan sees',
      },
      email: {
        subject: 'Your membership renewal options',
        brand: 'City FC',
        brandSub: 'Pride in every match',
        greetingHtml:
          'Hi, <span class="em-hl">Sam</span> <span class="em-tier-badge">★ Season member</span>',
        profileBodyHtml:
          'Your <strong>renewal window</strong> is open. We matched tier benefits to your attendance and merch history.',
        navHtml: '<a>Tickets</a><a>Membership</a><a>Shop</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">🎟</span> Renewal snapshot</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Current tier</div><div class="em-ctx-value">Gold</div></div><div class="em-ctx-item"><div class="em-ctx-label">Seats</div><div class="em-ctx-value">Block G · Row 12</div></div><div class="em-ctx-item"><div class="em-ctx-label">Points</div><div class="em-ctx-value em-highlight">12,400</div></div><div class="em-ctx-item"><div class="em-ctx-label">Installment</div><div class="em-ctx-value">£42/mo</div></div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Cup fixture bundle</div><div style="font-size:10px;color:#666;margin-top:2px">Based on derby browsing.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Broadcast add-on</div><div style="font-size:10px;color:#666;margin-top:2px">Stream away fixtures live.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  function telcoPack() {
    return {
      sectionLabels: {
        goals: 'Account goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'CLV',
      attrs: [
        a('mortgage_need', '📶', 'red', 'Upgrade fibre plan?', 'FTTP available · speed test run', 'Fibre upgrade'),
        a('refi_intent', '📱', 'red', 'Compared device deals', 'Handset page · trade-in estimator', 'Device compare'),
        a('rewards_interest', '🎁', 'amber', 'Redeem loyalty perks?', 'Points balance · partner offers', 'Perks'),
        a('debt_consolidation', '🔄', 'amber', 'Consolidate lines', '3 lines · family plan eligible', 'Line merge'),
        a('savings_growth', '🏠', 'blue', 'Smart home bundle?', 'Router IoT page · security cam promo', 'Smart home'),
        a('family_protection', '👨‍👩‍', 'teal', 'Parental controls', 'Kids line · content filter on', 'Family safe'),
        a('school_savings', '🎒', 'blue', 'Student discount?', 'Age 17 · edu email verified', 'Student offer'),
        a('churn_risk', '⚠', 'coral', 'Contract end risk', 'Out of contract in 14d · competitor ad', 'Churn risk'),
        a('mobile_first', '📱', 'teal', 'App account manager', 'Bill pay in app · usage alerts on', 'App user'),
        a('agent_intent', '🤖', 'amber', 'Care assist chat', '"Fix my roaming charges" · 6m ago', 'Care assist'),
        a('email_cap', '🚫', 'coral', 'Marketing SMS cap', 'Weekly cap reached', 'SMS cap'),
      ],
      features: {
        savings: {
          label: 'Plan feature',
          title: 'Wi‑Fi secure',
          body: 'Whole-home security and parental controls included on fibre tiers — one tap to enable.',
          meta: ['Fibre tiers', 'No hardware fee'],
          signal: 'feature_enabled=false · wifi_secure · fttp_eligible',
        },
        roundups: {
          label: 'Usage insight',
          title: 'Bill explainer',
          body: 'See what drove this month\'s bill in plain language — roaming, addons, and discounts separated.',
          meta: ['In-app', 'Updated daily'],
          signal: 'feature_enabled=false · bill_explainer · roaming_query',
        },
        credit: {
          label: 'Upgrade path',
          title: 'Speed recommender',
          body: 'Based on household usage, see if a higher tier would actually help — before you commit.',
          meta: ['No install until confirm', '30-day revert'],
          signal: 'feature_enabled=false · speed_rec · usage_high',
        },
      },
      strategy: {
        standard: {
          title: 'Your plan and device options',
          body: 'Compare fibre speeds and handset offers with loyalty credits applied — transparent total cost.',
          savingPeriod: 'estimated monthly saving vs current plan',
          cta: 'Compare plans',
          secondary: 'Chat to care',
          timer: null,
        },
        urgency: {
          title: 'Install window reserved',
          body: 'Your engineer slot is held for 48 hours. Confirm fibre upgrade before the reservation expires.',
          savingPeriod: 'promotional saving on install bundle',
          cta: 'Confirm install',
          secondary: 'Reschedule',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'clvValue',
        valueCond: 'CLV / margin multiplier',
        valueOp: '× clvValue',
        simBankTag: 'Journey · clvValue',
      },
      simulate: {
        leverDesc: 'What is commercial pushing this quarter?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Fibre push', false),
          simBtn('lever', 'retention', 'Save at risk', false),
          simBtn('lever', 'cards', 'Device attach', false),
        ],
        bankDesc: 'Override CLV multiplier for a journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost fibre', false),
          simBtn('bankBoost', 'retention', 'Boost save', false),
          simBtn('bankBoost', 'card', 'Boost device', false),
        ],
        urgencyDesc: 'Install or contract deadlines lift urgent paths.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Install <48h', false),
          simBtn('urgency', 'churn', 'Contract ending', false),
        ],
        channelDesc: 'Auto reads app-first account behaviour. Overrides force digital or care.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'App-first', false),
          simBtn('channelStrategy', 'advisor', 'Care-led', false),
        ],
        agenticDesc: 'Care assist — toggled via assist chat in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Underused feature',
        features: [
          { key: 'savings', label: 'Wi‑Fi secure', active: true },
          { key: 'roundups', label: 'Bill explainer', active: false },
          { key: 'credit', label: 'Speed recommender', active: false },
        ],
        featureHint: 'Swaps Dynamic content in the message preview',
        sliderLabel: 'Install reservation',
        sliderHint: 'Pull below 48h to trigger urgency variant',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore account paths',
        channels: 'Click the top path to see channel ranking',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what the account holder sees',
      },
      email: {
        subject: 'Your fibre upgrade reservation',
        brand: 'ConnectTel',
        brandSub: 'Clear connections',
        greetingHtml:
          'Hello, <span class="em-hl">Riley</span> <span class="em-tier-badge">★ Family plan</span>',
        profileBodyHtml:
          'Good news — <strong>fibre is available</strong> at your address. Your install slot and pricing are saved below.',
        navHtml: '<a>Plan</a><a>Usage</a><a>Devices</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">📶</span> Upgrade snapshot</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Current</div><div class="em-ctx-value">100 Mbps</div></div><div class="em-ctx-item"><div class="em-ctx-label">Offer</div><div class="em-ctx-value em-highlight">900 Mbps</div></div><div class="em-ctx-item"><div class="em-ctx-label">Install</div><div class="em-ctx-value">Sat 09:00</div></div><div class="em-ctx-item"><div class="em-ctx-label">Monthly</div><div class="em-ctx-value highlight">£38</div></div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Handset trade-in</div><div style="font-size:10px;color:#666;margin-top:2px">Based on device browsing.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Smart home cam</div><div style="font-size:10px;color:#666;margin-top:2px">Bundles with your fibre tier.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  function publicPack() {
    return {
      sectionLabels: {
        goals: 'Citizen goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'program value',
      attrs: [
        a('mortgage_need', '📋', 'red', 'Complete benefit application?', 'Draft saved · docs 80% uploaded', 'Benefit apply'),
        a('refi_intent', '🔍', 'red', 'Checked eligibility', 'Portal quiz completed · result viewed', 'Eligibility'),
        a('rewards_interest', '🤝', 'amber', 'Volunteer programme?', 'Orientation email opened', 'Volunteer'),
        a('debt_consolidation', '🔄', 'amber', 'Merge duplicate cases', 'Two case IDs · same programme', 'Case merge'),
        a('savings_growth', '📚', 'blue', 'Skills grant interest', 'Course catalogue · bookmarked 2', 'Skills grant'),
        a('family_protection', '👨‍👩‍', 'teal', 'Household benefits', '3 dependents · school meal eligible', 'Household'),
        a('school_savings', '🎒', 'blue', 'School transport pass?', 'Term start · no pass applied', 'Transport pass'),
        a('churn_risk', '⚠', 'coral', 'Missed deadline risk', 'Renewal due · no submission', 'Deadline risk'),
        a('mobile_first', '📱', 'teal', 'Portal-first citizen', 'Gov ID app · SMS reminders on', 'Portal user'),
        a('agent_intent', '🤖', 'amber', 'Digital assistant', '"What documents for housing?" · 4m ago', 'Digital assistant'),
        a('email_cap', '🚫', 'coral', 'Outreach cap reached', 'Monthly outreach limit met', 'Outreach cap'),
      ],
      features: {
        savings: {
          label: 'Service to try',
          title: 'Document checklist',
          body: 'A personalised list of what to upload for your programme — with plain-language examples.',
          meta: ['No login change', 'Saves progress'],
          signal: 'feature_enabled=false · doc_checklist · application_draft',
        },
        roundups: {
          label: 'Easier access',
          title: 'SMS reminders',
          body: 'Opt into deadline reminders by text — accessible format, no marketing mixed in.',
          meta: ['Opt-in', 'Stop anytime'],
          signal: 'feature_enabled=false · sms_remind · deadline_near',
        },
        credit: {
          label: 'Understand options',
          title: 'Programme navigator',
          body: 'Answer three questions to see programmes you may qualify for — estimates only, not a decision.',
          meta: ['Guidance only', 'Links to official rules'],
          signal: 'feature_enabled=false · prog_nav · eligibility_viewed',
        },
      },
      strategy: {
        standard: {
          title: 'Your application steps, clearly listed',
          body: 'Review what is left to submit for your housing benefit renewal — accessible language throughout.',
          savingPeriod: 'estimated time to complete remaining steps',
          cta: 'Continue application',
          secondary: 'Book support',
          timer: null,
        },
        urgency: {
          title: 'Submission deadline approaching',
          body: 'Your renewal must be received by the published date. Incomplete applications may pause payments.',
          savingPeriod: 'days remaining on your deadline',
          cta: 'Submit now',
          secondary: 'Request extension info',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'programValue',
        valueCond: 'program outcome multiplier',
        valueOp: '× programValue',
        simBankTag: 'Journey · programValue',
      },
      simulate: {
        leverDesc: 'What is the agency priority this quarter?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Benefits', false),
          simBtn('lever', 'retention', 'Renewals', false),
          simBtn('lever', 'cards', 'Skills / grants', false),
        ],
        bankDesc: 'Override program-value multiplier for a journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost benefits', false),
          simBtn('bankBoost', 'retention', 'Boost renewal', false),
          simBtn('bankBoost', 'card', 'Boost grants', false),
        ],
        urgencyDesc: 'Published deadlines lift time-sensitive paths.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Deadline <7d', false),
          simBtn('urgency', 'churn', 'Payment at risk', false),
        ],
        channelDesc: 'Auto reads portal-first behaviour. Overrides force digital or caseworker.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'Portal-first', false),
          simBtn('channelStrategy', 'advisor', 'Caseworker', false),
        ],
        agenticDesc: 'Digital assistant — toggled via assistant dialogue in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Helpful tool',
        features: [
          { key: 'savings', label: 'Doc checklist', active: true },
          { key: 'roundups', label: 'SMS reminders', active: false },
          { key: 'credit', label: 'Programme navigator', active: false },
        ],
        featureHint: 'Swaps Dynamic content in the message preview',
        sliderLabel: 'Deadline window',
        sliderHint: 'Pull below 7d to trigger urgency variant',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore service paths',
        channels: 'Click the top path to see channel ranking',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what the citizen sees',
      },
      email: {
        subject: 'Action needed: housing benefit renewal',
        brand: 'GovServices',
        brandSub: 'Clear public services',
        greetingHtml:
          'Hello, <span class="em-hl">Taylor</span> <span class="em-tier-badge">★ Verified account</span>',
        profileBodyHtml:
          'Your <strong>housing benefit renewal</strong> is in progress. The checklist below shows what is still required.',
        navHtml: '<a>My account</a><a>Applications</a><a>Appointments</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">📋</span> Application status</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Reference</div><div class="em-ctx-value">HB-2026-4412</div></div><div class="em-ctx-item"><div class="em-ctx-label">Complete</div><div class="em-ctx-value em-highlight">80%</div></div><div class="em-ctx-item"><div class="em-ctx-label">Due</div><div class="em-ctx-value">21 Jun</div></div><div class="em-ctx-item"><div class="em-ctx-label">Support</div><div class="em-ctx-value highlight">Booked</div></div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">School transport pass</div><div style="font-size:10px;color:#666;margin-top:2px">Related to household profile.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Skills grant</div><div style="font-size:10px;color:#666;margin-top:2px">Courses you bookmarked.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  function healthcarePack() {
    return {
      sectionLabels: {
        goals: 'Member goals & signals',
        agentic: 'Agentic signals',
        contact: 'Contact policy',
        message: 'Message personalisation',
      },
      valueMultLabel: 'quality value',
      attrs: [
        a('mortgage_need', '🩺', 'red', 'Book preventive visit?', 'A1C due · gap in care 6mo', 'Preventive visit'),
        a('refi_intent', '💊', 'red', 'Reviewed medication plan', 'Formulary page · refill due', 'Medication review'),
        a('rewards_interest', '🏃', 'amber', 'Wellness programme?', 'Steps challenge enrolled · week 2', 'Wellness'),
        a('debt_consolidation', '🔄', 'amber', 'Consolidate authorizations', 'Two referrals · same specialty', 'Auth merge'),
        a('savings_growth', '🥗', 'blue', 'Nutrition coaching?', 'Diabetes programme · intro watched', 'Nutrition'),
        a('family_protection', '👨‍👩‍', 'teal', 'Dependent coverage', 'Spouse + 1 child on plan', 'Dependents'),
        a('school_savings', '🎒', 'blue', 'Student well-being?', 'University clinic · no visit yet', 'Student care'),
        a('churn_risk', '⚠', 'coral', 'Plan switch risk', 'Open enrollment window · competitor quote', 'Switch risk'),
        a('mobile_first', '📱', 'teal', 'App member', 'Telehealth used · push reminders on', 'App member'),
        a('agent_intent', '🤖', 'amber', 'Care guide chat', '"Is my A1C test covered?" · 7m ago', 'Care guide'),
        a('email_cap', '🚫', 'coral', 'Outreach cap reached', 'Monthly wellness email cap', 'Outreach cap'),
      ],
      features: {
        savings: {
          label: 'Benefit to use',
          title: 'Telehealth follow-up',
          body: 'A 15-minute virtual check-in for lab review — often lower copay than in-person when eligible.',
          meta: ['Check eligibility', 'HIPAA secure'],
          signal: 'feature_enabled=false · telehealth_fu · care_gap',
        },
        roundups: {
          label: 'Stay on track',
          title: 'Medication reminders',
          body: 'Opt into refill and dose reminders — you control channels and timing.',
          meta: ['Opt-in', 'Not medical advice'],
          signal: 'feature_enabled=false · med_remind · refill_due',
        },
        credit: {
          label: 'Understand coverage',
          title: 'Cost estimator',
          body: 'See estimated out-of-pocket for the visit type you selected — before you book.',
          meta: ['Estimate only', 'Not a guarantee'],
          signal: 'feature_enabled=false · cost_est · preventive_due',
        },
      },
      strategy: {
        standard: {
          title: 'Your visit and screening options',
          body: 'Review recommended preventive visits with estimated copay — supportive, plain language.',
          savingPeriod: 'estimated copay after HSA',
          cta: 'Book visit',
          secondary: 'Message care team',
          timer: null,
        },
        urgency: {
          title: 'Care gap closing soon',
          body: 'Your A1C screening is overdue for quality measures. Book while in-network slots are available.',
          savingPeriod: 'copay estimate for virtual visit',
          cta: 'Book now',
          secondary: 'See coverage',
          timer: true,
        },
      },
      formula: {
        valueRuleName: 'qualityValue',
        valueCond: 'quality / outcome multiplier',
        valueOp: '× qualityValue',
        simBankTag: 'Journey · qualityValue',
      },
      simulate: {
        leverDesc: 'What is the health plan pushing this quarter?',
        leverButtons: [
          simBtn('lever', 'none', 'None', true),
          simBtn('lever', 'mortgage', 'Preventive', false),
          simBtn('lever', 'retention', 'Retention', false),
          simBtn('lever', 'cards', 'Wellness attach', false),
        ],
        bankDesc: 'Override quality-value multiplier for a journey.',
        bankBoostButtons: [
          simBtn('bankBoost', 'none', 'Default', true),
          simBtn('bankBoost', 'mortgage', 'Boost preventive', false),
          simBtn('bankBoost', 'retention', 'Boost retention', false),
          simBtn('bankBoost', 'card', 'Boost wellness', false),
        ],
        urgencyDesc: 'Care-gap clocks lift time-sensitive paths.',
        urgencyButtons: [
          simBtn('urgency', 'none', 'Standard', true),
          simBtn('urgency', 'rateLock', 'Gap > overdue', false),
          simBtn('urgency', 'churn', 'Switch risk', false),
        ],
        channelDesc: 'Auto reads app-first member behaviour. Overrides force digital or care guide.',
        channelButtons: [
          simBtn('channelStrategy', 'auto', 'Auto', true),
          simBtn('channelStrategy', 'digital', 'App-first', false),
          simBtn('channelStrategy', 'advisor', 'Care guide', false),
        ],
        agenticDesc: 'Care guide — toggled via guide chat in the profile panel.',
      },
      messagePersonalisation: {
        featureLabel: 'Helpful benefit',
        features: [
          { key: 'savings', label: 'Telehealth', active: true },
          { key: 'roundups', label: 'Med reminders', active: false },
          { key: 'credit', label: 'Cost estimator', active: false },
        ],
        featureHint: 'Swaps Dynamic content in the message preview',
        sliderLabel: 'Care-gap clock',
        sliderHint: 'Pull below 24h to trigger urgency variant',
      },
      intros: {
        paths: 'Select signals, then click the top journey to explore care paths',
        channels: 'Click the top path to see channel ranking',
        sendTime: 'Channel selection determines send time',
        email: 'Send time determines when — this shows what the member sees',
      },
      email: {
        subject: 'Your A1C screening is due',
        brand: 'HealthFirst',
        brandSub: 'Care that fits your life',
        greetingHtml:
          'Hi, <span class="em-hl">Jordan</span> <span class="em-tier-badge">★ HSA member</span>',
        profileBodyHtml:
          'Our records show your <strong>A1C preventive screening</strong> is due. Virtual visits may lower your copay when eligible.',
        navHtml: '<a>Benefits</a><a>Claims</a><a>Find care</a><a>Help</a>',
        contextHtml: annBlock(
          '<div class="em-context-card"><div class="em-context-title"><span class="em-ctx-icon">🩺</span> Care reminder</div><div class="em-context-grid"><div class="em-ctx-item"><div class="em-ctx-label">Screening</div><div class="em-ctx-value">A1C</div></div><div class="em-ctx-item"><div class="em-ctx-label">Last visit</div><div class="em-ctx-value">8 mo ago</div></div><div class="em-ctx-item"><div class="em-ctx-label">Est. copay</div><div class="em-ctx-value em-highlight">$25</div></div><div class="em-ctx-item"><div class="em-ctx-label">Telehealth</div><div class="em-ctx-value highlight">Eligible</div></div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag context">Contextual data</span></div>'
        ),
        crossSellHtml: annBlock(
          '<div style="display:flex;gap:10px"><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Suggested</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Nutrition coaching</div><div style="font-size:10px;color:#666;margin-top:2px">Matches diabetes programme interest.</div></div><div style="flex:1;background:#F4F8F7;border-radius:6px;padding:10px 12px;border:1px solid #DBE9E4"><div style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Worth exploring</div><div style="font-size:12px;font-weight:600;color:#1a1a1a">Medication sync</div><div style="font-size:10px;color:#666;margin-top:2px">Refill due next week.</div></div></div><div class="em-annotation"><div class="em-ann-line"></div><span class="em-ann-tag decisioning">AI-ranked next best</span></div>'
        ),
      },
    };
  }

  var flowPacks = {
    media: mediaPack(),
    retail: retailPack(),
    travel: travelPack(),
    sports: sportsPack(),
    telecommunications: telcoPack(),
    public: publicPack(),
    healthcare: healthcarePack(),
  };

  Object.keys(flowPacks).forEach(function (k) {
    if (root[k]) root[k].flowAnalysis = flowPacks[k];
  });
})();
