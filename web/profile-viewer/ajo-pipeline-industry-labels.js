/**
 * Per-industry display copy for ajo-decisioning-pipeline-v8-demo (Journey arbitration v2 iframe).
 * Journey ids and path ids stay FSI-shaped for engine compatibility; only labels change.
 */
(function () {
  window.AEP_PIPELINE_INDUSTRY_LABELS = {
    fsi: {},

    media: {
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
    },

    retail: {
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
    },

    travel: {
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
    },

    sports: {
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
    },

    telecommunications: {
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
    },

    public: {
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
    },

    healthcare: {
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
    },
  };
})();
