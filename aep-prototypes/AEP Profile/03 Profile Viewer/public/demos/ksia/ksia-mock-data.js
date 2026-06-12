/**
 * KSIA demo — navigation map, carousel slides, sample flight board data.
 */
(function (global) {
  'use strict';

  var NAV = [
    { id: 'home', label: 'Home', href: 'index.html', section: null },
    { id: 'about', label: 'About KSIA', href: 'about.html', section: 'about' },
    {
      id: 'flights',
      label: 'Flights',
      href: 'flights/index.html',
      section: 'flights',
      children: [
        { label: 'Flights hub', href: 'flights/index.html' },
        { label: 'Arrivals', href: 'flights/arrivals.html' },
        { label: 'Departures', href: 'flights/departures.html' },
      ],
    },
    {
      id: 'at-the-airport',
      label: 'At the airport',
      href: 'at-the-airport/index.html',
      section: 'at-the-airport',
      children: [
        { label: 'At the airport hub', href: 'at-the-airport/index.html' },
        { label: 'Terminal guide', href: 'at-the-airport/terminal-guide.html' },
        { label: 'Terminal 1', href: 'at-the-airport/terminal-1.html' },
        { label: 'Terminal 2', href: 'at-the-airport/terminal-2.html' },
        { label: 'Terminal 3', href: 'at-the-airport/terminal-3.html' },
        { label: 'Terminal 4', href: 'at-the-airport/terminal-4.html' },
        { label: 'Terminal 5', href: 'at-the-airport/terminal-5.html' },
        { label: 'Terminal 6', href: 'at-the-airport/terminal-6.html' },
        { label: 'Maps', href: 'at-the-airport/maps.html' },
        { label: 'Security', href: 'at-the-airport/security.html' },
        { label: 'Services', href: 'at-the-airport/services/index.html' },
        { label: 'Lounges', href: 'at-the-airport/services/lounges.html' },
        { label: 'Special assistance', href: 'at-the-airport/services/special-assistance.html' },
      ],
    },
    {
      id: 'transport',
      label: 'Transport',
      href: 'transport/index.html',
      section: 'transport',
      children: [
        { label: 'Transport hub', href: 'transport/index.html' },
        { label: 'Parking', href: 'transport/parking.html' },
        { label: 'Drop-off', href: 'transport/drop-off.html' },
        { label: 'Public transport', href: 'transport/public-transport.html' },
      ],
    },
    {
      id: 'shop-dine',
      label: 'Shop & Dine',
      href: 'shop-dine/index.html',
      section: 'shop-dine',
      children: [
        { label: 'Shop & Dine hub', href: 'shop-dine/index.html' },
        { label: 'Duty free', href: 'shop-dine/duty-free.html' },
        { label: 'Restaurants', href: 'shop-dine/restaurants.html' },
      ],
    },
    {
      id: 'aivc',
      label: 'AIVC',
      href: 'aivc/index.html',
      section: 'aivc',
      children: [
        { label: 'AIVC hub', href: 'aivc/index.html' },
        { label: 'Wallet setup', href: 'aivc/wallet-setup.html' },
        { label: 'Disruption compensation', href: 'aivc/disruption-compensation.html' },
      ],
    },
    { id: 'media', label: 'Media', href: 'media.html', section: 'media' },
    { id: 'contact', label: 'Contact', href: 'contact.html', section: 'contact' },
  ];

  var CAROUSEL_SLIDES = [
    {
      title: 'King Salman International Airport',
      subtitle: 'Redefining travel for Vision 2030 — six terminals, one seamless experience.',
      theme: 'vision',
    },
    {
      title: 'Six world-class terminals',
      subtitle: 'From Terminal 1 to Terminal 6 — designed for capacity, comfort, and connection.',
      theme: 'terminals',
    },
    {
      title: 'Your AIVC companion',
      subtitle: 'Airport Intelligent Virtual Companion — wallet, wayfinding, and disruption support.',
      theme: 'aivc',
    },
  ];

  /** Coverflow gallery carousel (Etihad-style) — images from ksia.sa */
  var GALLERY_CAROUSEL = [
    {
      image: 'assets/images/ksia-gallery-2030.png',
      alt: 'Vision 2030',
      tag: 'Vision 2030',
      title: 'Vision 2030',
      meta: 'A catalyst for tourism, trade, and innovation',
    },
    {
      image: 'assets/images/ksia-gallery-gate.png',
      alt: 'Terminal gates',
      tag: 'Terminals',
      title: 'World-class gates',
      meta: 'Six terminals designed for seamless connection',
    },
    {
      image: 'assets/images/ksia-gallery-saudi.png',
      alt: 'Saudi heritage',
      tag: 'Heritage',
      title: 'Gateway to Saudi Arabia',
      meta: 'Where tradition meets the future of travel',
    },
    {
      image: 'assets/images/ksia-gallery-mbs.png',
      alt: 'HRH Crown Prince announcement',
      tag: 'Leadership',
      title: 'A national landmark',
      meta: 'Announced by HRH the Crown Prince',
    },
    {
      image: 'assets/images/ksia-news-oct.webp',
      alt: 'KSIA news',
      tag: 'News',
      title: 'Your journey, your destination',
      meta: 'Latest updates from King Salman International Airport',
    },
  ];

  var QUICK_LINKS = [
    { label: 'Flight arrivals', href: 'flights/arrivals.html', desc: 'Live arrival board' },
    { label: 'Flight departures', href: 'flights/departures.html', desc: 'Live departure board' },
    { label: 'Flights hub', href: 'flights/index.html', desc: 'Search & track your trip' },
    { label: 'At the airport', href: 'at-the-airport/index.html', desc: 'Terminals, security & services' },
    { label: 'Terminal maps', href: 'at-the-airport/maps.html', desc: 'Wayfinding & gates' },
    { label: 'Transport', href: 'transport/index.html', desc: 'Parking, drop-off & metro' },
    { label: 'Parking', href: 'transport/parking.html', desc: 'Rates & booking' },
    { label: 'Shop & Dine', href: 'shop-dine/index.html', desc: 'Retail & dining' },
    { label: 'Duty free', href: 'shop-dine/duty-free.html', desc: 'Collect at gate' },
    { label: 'AIVC companion', href: 'aivc/index.html', desc: 'Digital travel orchestration' },
    { label: 'AIVC wallet', href: 'aivc/wallet-setup.html', desc: 'Boarding pass & Fast Track' },
    { label: 'About KSIA', href: 'about.html', desc: 'Vision 2030 story' },
  ];

  var BOARD_ARRIVALS = [
    { flight: 'SV 456', airline: 'Saudia', from: 'Jeddah JED', scheduled: '13:40', estimated: '13:35', terminal: 'T1', belt: '4', status: 'Landed', tracked: true },
    { flight: 'SV 102', airline: 'Saudia', from: 'London LHR', scheduled: '14:25', estimated: '14:25', terminal: 'T1', belt: '2', status: 'Landed' },
    { flight: 'EK 815', airline: 'Emirates', from: 'Dubai DXB', scheduled: '15:10', estimated: '15:10', terminal: 'T2', belt: '6', status: 'On time' },
    { flight: 'QR 1188', airline: 'Qatar Airways', from: 'Doha DOH', scheduled: '15:45', estimated: '16:05', terminal: 'T1', belt: '3', status: 'Delayed' },
    { flight: 'BA 263', airline: 'British Airways', from: 'London LHR', scheduled: '16:20', estimated: '16:20', terminal: 'T3', belt: '1', status: 'On time' },
    { flight: 'TK 152', airline: 'Turkish Airlines', from: 'Istanbul IST', scheduled: '16:55', estimated: '16:50', terminal: 'T1', belt: '5', status: 'Landed' },
    { flight: 'LH 636', airline: 'Lufthansa', from: 'Frankfurt FRA', scheduled: '17:30', estimated: '17:30', terminal: 'T2', belt: '7', status: 'On time' },
    { flight: 'AF 1260', airline: 'Air France', from: 'Paris CDG', scheduled: '18:00', estimated: '18:00', terminal: 'T3', belt: '2', status: 'On time' },
    { flight: 'MS 652', airline: 'EgyptAir', from: 'Cairo CAI', scheduled: '18:25', estimated: '18:40', terminal: 'T1', belt: '4', status: 'Delayed' },
    { flight: 'FZ 821', airline: 'flydubai', from: 'Dubai DXB', scheduled: '19:10', estimated: '19:10', terminal: 'T2', belt: '8', status: 'On time' },
  ];

  var BOARD_DEPARTURES = [
    { flight: 'SV 123', airline: 'Saudia', to: 'London LHR', scheduled: '17:05', estimated: '17:05', gate: 'B12', terminal: 'T1', status: 'On time', tracked: true },
    { flight: 'SV 103', airline: 'Saudia', to: 'London LHR', scheduled: '17:05', estimated: '17:05', gate: 'B14', terminal: 'T1', status: 'Boarding' },
    { flight: 'EK 816', airline: 'Emirates', to: 'Dubai DXB', scheduled: '17:40', estimated: '17:40', gate: 'A4', terminal: 'T2', status: 'On time' },
    { flight: 'QR 1189', airline: 'Qatar Airways', to: 'Doha DOH', scheduled: '18:15', estimated: '18:15', gate: 'C7', terminal: 'T1', status: 'On time' },
    { flight: 'BA 264', airline: 'British Airways', to: 'London LHR', scheduled: '19:00', estimated: '19:00', gate: 'D3', terminal: 'T3', status: 'Gate open' },
    { flight: 'TK 153', airline: 'Turkish Airlines', to: 'Istanbul IST', scheduled: '19:35', estimated: '19:35', gate: 'B8', terminal: 'T1', status: 'On time' },
    { flight: 'LH 637', airline: 'Lufthansa', to: 'Frankfurt FRA', scheduled: '20:10', estimated: '20:25', gate: 'A9', terminal: 'T2', status: 'Delayed' },
    { flight: 'AF 1261', airline: 'Air France', to: 'Paris CDG', scheduled: '20:45', estimated: '20:45', gate: 'C2', terminal: 'T3', status: 'Check-in open' },
    { flight: 'MS 653', airline: 'EgyptAir', to: 'Cairo CAI', scheduled: '21:20', estimated: '21:20', gate: 'B6', terminal: 'T1', status: 'On time' },
    { flight: 'FZ 822', airline: 'flydubai', to: 'Dubai DXB', scheduled: '22:00', estimated: '22:00', gate: 'A2', terminal: 'T2', status: 'Scheduled' },
  ];

  var SAMPLE_ARRIVALS = BOARD_ARRIVALS.slice(0, 4).map(function (r) {
    return { flight: r.flight, from: r.from, time: r.scheduled, terminal: r.terminal, status: r.status };
  });

  var SAMPLE_DEPARTURES = BOARD_DEPARTURES.slice(0, 5).map(function (r) {
    return { flight: r.flight, to: r.to, time: r.scheduled, terminal: r.terminal, status: r.status };
  });

  var TRACKED_ARRIVAL = BOARD_ARRIVALS.find(function (r) { return r.tracked; }) || BOARD_ARRIVALS[0];
  var TRACKED_DEPARTURE = BOARD_DEPARTURES.find(function (r) { return r.tracked; }) || BOARD_DEPARTURES[0];

  var ARRIVALS_ASSISTANT = {
    title: 'Meeting someone?',
    lead: 'Your tracked arrival SV 456 from Jeddah is on belt 4, Terminal 1.',
    tips: [
      'Short-stay parking P1 is closest to Terminal 1 arrivals — 5 min walk to belt 4.',
      'Kerbside pickup zones are limited to 5 minutes; use the cell phone lot for longer waits.',
      'Share live flight status from your AIVC wallet so your guest knows when to head to the curb.',
    ],
    actions: [
      { label: 'Parking for pickup', href: 'transport/parking.html', icon: '&#127359;' },
      { label: 'Public transport', href: 'transport/public-transport.html', icon: '&#128652;' },
    ],
  };

  var DEPARTURES_ASSISTANT = {
    title: 'Next actions for your departure',
    lead: 'SV 123 to London — check-in opens at 14:05, gate B12 in Terminal 1.',
    actions: [
      { label: 'Open AIVC wallet', href: 'aivc/wallet-setup.html', icon: '&#128179;', desc: 'Boarding pass, Fast Track, and lounge access in one place.' },
      { label: 'Security & biometrics', href: 'at-the-airport/security.html', icon: '&#128737;', desc: 'E-gate screening linked to your wallet — lane B recommended.' },
      { label: 'Terminal 1 guide', href: 'at-the-airport/terminal-1.html', icon: '&#128506;', desc: 'Gate B12, shops, and lounge locations before you board.' },
    ],
  };

  var DEPARTURES_GATE_ALERT = {
    show: true,
    message: 'Gate change: LH 637 to Frankfurt now departs from Gate A11 (was A9). Allow extra walk time from security.',
  };

  var TERMINAL_GUIDE_AIRLINES = [
    { code: 'SV', name: 'Saudia', terminal: 'Terminal 1', note: 'International & domestic hub — check-in Zone A–C.' },
    { code: 'EK', name: 'Emirates', terminal: 'Terminal 2', note: 'Full-service carrier terminal with Emirates lounge.' },
    { code: 'QR', name: 'Qatar Airways', terminal: 'Terminal 1', note: 'Oneworld connections via Zone B.' },
    { code: 'BA', name: 'British Airways', terminal: 'Terminal 3', note: 'European routes — premium check-in desks 1–12.' },
    { code: 'TK', name: 'Turkish Airlines', terminal: 'Terminal 1', note: 'Star Alliance — transfer desk near Gate B zone.' },
    { code: 'LH', name: 'Lufthansa', terminal: 'Terminal 2', note: 'Schengen & long-haul — lounge Level 2.' },
  ];

  var TERMINAL_1_DETAIL = {
    name: 'Terminal 1',
    tagline: 'International hub — your flight SV 123 departs from Gate B12.',
    gatesMapLabel: 'Gates A–D map — Zone B international departures',
    amenities: [
      { label: 'Prayer rooms', desc: 'Level 1 near arrivals and Level 2 departures mezzanine.' },
      { label: 'Family services', desc: 'Nursing rooms and play area beside Gate B corridor.' },
      { label: 'AIVC kiosks', desc: 'Wallet setup and wayfinding beside main security hall.' },
      { label: 'Fast Track', desc: 'Lane B biometric screening — linked to AIVC wallet.' },
    ],
    shops: [
      { name: 'Saudi Heritage', type: 'Retail', note: 'Crafts & fragrances — Gate B mezzanine' },
      { name: 'Altitude Café', type: 'Dining', note: 'Coffee & light meals — pre-security' },
      { name: 'KSIA Duty Free', type: 'Duty free', note: 'Collect at Gate B12' },
    ],
    lounge: {
      name: 'Saudia Alfursan Lounge',
      desc: 'Complimentary for eligible Alfursan tiers — showers, buffet, and quiet workspace.',
      href: 'at-the-airport/services/lounges.html',
    },
    waitTimes: [
      { label: 'Security (standard)', time: '~12 min' },
      { label: 'Security (Fast Track B)', time: '~4 min' },
      { label: 'Immigration (arrivals)', time: '~8 min' },
    ],
  };

  var TERMINAL_STUBS = [
    { id: 'terminal-2', name: 'Terminal 2', lead: 'Regional and premium carrier operations — opening with KSIA expansion.' },
    { id: 'terminal-3', name: 'Terminal 3', lead: 'European and long-haul carriers — opening with KSIA expansion.' },
    { id: 'terminal-4', name: 'Terminal 4', lead: 'Low-cost carrier terminal — opening with KSIA expansion.' },
    { id: 'terminal-5', name: 'Terminal 5', lead: 'Cargo-adjacent passenger flows — opening with KSIA expansion.' },
    { id: 'terminal-6', name: 'Terminal 6', lead: 'Future expansion terminal — opening with KSIA expansion.' },
  ];

  var MAPS_WAYFINDING = {
    mapLabel: 'Terminal 1 — interactive map placeholder',
    searchPlaceholder: 'Find gate, shop, or facility…',
    directions: [
      'From main departures hall, proceed to Security Zone B.',
      'After screening, take escalator to mezzanine — international gates.',
      'Gate B12 is on the right, past Saudi Heritage retail (approx. 8 min walk).',
    ],
    accessibilityNote: 'Step-free route available via lifts beside Gate B corridor — toggle for accessible directions.',
  };

  var SECURITY_PAGE = {
    lanes: [
      { name: 'Standard screening', wait: '~12 min', note: 'All passengers — liquids & electronics ready.' },
      { name: 'Fast Track (AIVC)', wait: '~4 min', note: 'Biometric e-gate — wallet linked.' },
      { name: 'Family lane', wait: '~15 min', note: 'Strollers & assistance-friendly.' },
    ],
    egateSteps: [
      'Hold boarding pass in AIVC wallet or printed copy.',
      'Scan face at e-gate — matches passport on file.',
      'Place cabin bags on belt; keep laptop and liquids accessible.',
    ],
    checklist: [
      'Liquids in 100 ml containers, clear bag ready',
      'Laptop and large electronics out of cabin bag',
      'Remove belt, watch, and empty pockets',
      'AIVC wallet open for Fast Track lane B',
    ],
    fastTrackHref: 'aivc/wallet-setup.html',
  };

  var SERVICES_HUB_ITEMS = [
    { label: 'Lounges', href: 'at-the-airport/services/lounges.html', icon: '&#9749;', desc: 'Premium lounges across terminals — book or walk-in where available.' },
    { label: 'Special assistance', href: 'at-the-airport/services/special-assistance.html', icon: '&#9855;', desc: 'Mobility, hidden disabilities, and companion support from kerb to gate.' },
    { label: 'Baggage services', href: 'at-the-airport/services/index.html', icon: '&#128230;', desc: 'Wrapping, excess baggage, and lost property desks.' },
    { label: 'Information', href: 'contact.html', icon: '&#8505;', desc: 'Passenger help desks in every terminal hall.' },
    { label: 'Prayer rooms', href: 'at-the-airport/terminal-1.html', icon: '&#9770;', desc: 'Multi-faith quiet rooms — Level 1 and departures mezzanine.' },
    { label: 'Fast Track security', href: 'at-the-airport/security.html', icon: '&#9889;', desc: 'Skip the main queue with AIVC biometric screening.' },
  ];

  var LOUNGES_PAGE = {
    tiers: [
      { name: 'Alfursan Gold', access: 'Complimentary', perks: 'Saudia Alfursan Lounge T1 — showers, hot buffet, business zone.' },
      { name: 'Priority Pass', access: 'Walk-in or pre-book', perks: 'Select partner lounges T1 & T2 — subject to capacity.' },
      { name: 'Paid day pass', access: 'From SAR 199', perks: 'Same-day lounge entry when space available — book via AIVC.' },
    ],
    recommendation: {
      title: 'Recommended for you',
      body: 'Based on your Alfursan profile and SV 123 departure, Saudia Alfursan Lounge Terminal 1 is your best option — 6 min walk from Gate B12.',
      cta: 'View lounge on map',
      href: 'at-the-airport/maps.html',
    },
  };

  var SPECIAL_ASSISTANCE_PAGE = {
    requestSteps: [
      'Tell us your needs at least 48 hours before travel (recommended).',
      'Meet at the assistance desk in your terminal arrivals hall.',
      'AIVC can pre-fill your profile — wheelchair, escort, or hidden disability lanyard.',
    ],
    contacts: [
      { label: 'Assistance hotline', value: '+966 11 000 KSIA (mock)' },
      { label: 'Email', value: 'accessibility@ksia-demo.lab' },
      { label: 'WhatsApp (AIVC)', value: 'Chat via wallet assistant' },
    ],
    journeySupport: [
      'Kerbside drop-off to check-in escort',
      'Wheelchair and electric mobility devices',
      'Hidden disabilities sunflower lanyard',
      'Companion seating and gate boarding support',
    ],
  };

  var FLIGHTS_TRIP_CARD = {
    flight: 'SV 123',
    originCity: 'Riyadh',
    originCode: 'RUH',
    destCity: 'London',
    destCode: 'LHR',
    status: 'On time',
    statusKey: 'ontime',
    phase: 'Pre-trip',
    departure: '17:05',
    terminal: 'T1',
    gate: 'B12',
    checkInOpens: '14:05',
  };

  var FLIGHTS_JOURNEY_STEPS = [
    { label: 'Check-in', state: 'upcoming' },
    { label: 'Security', state: 'upcoming' },
    { label: 'Gate', state: 'upcoming' },
    { label: 'Board', state: 'upcoming' },
    { label: 'Arrive', state: 'upcoming' },
  ];

  var FLIGHTS_ASSISTANT_SUGGESTIONS = [
    {
      title: 'Set up your AIVC wallet',
      desc: 'Add boarding pass, parking, and loyalty cards before you travel.',
      href: 'aivc/wallet-setup.html',
      icon: '&#128179;',
    },
    {
      title: 'Terminal guide',
      desc: 'Find your check-in desk, security lane, and gate in Terminal 1.',
      href: 'at-the-airport/terminal-guide.html',
      icon: '&#128506;',
    },
    {
      title: 'Book parking',
      desc: 'Reserve short-stay or long-stay parking and pay with your wallet.',
      href: 'transport/parking.html',
      icon: '&#127359;',
    },
  ];

  var FLIGHTS_RELATED_SERVICES = [
    { label: 'Maps', href: 'at-the-airport/maps.html', icon: '&#128506;' },
    { label: 'Security', href: 'at-the-airport/security.html', icon: '&#128737;' },
    { label: 'Lounges', href: 'at-the-airport/services/lounges.html', icon: '&#9749;' },
    { label: 'Transport', href: 'transport/index.html', icon: '&#128652;' },
  ];

  var AIRPORT_HERO_CONTEXT = {
    details: ['Terminal 1', 'Gate B12', 'Boarding in 45 min'],
    stage: 'Airport stage · Day of travel',
  };

  var AIRPORT_FLIGHT_LOOKUP_OPTIONS = [
    {
      id: 'sv123',
      label: 'SV 123 — Saudia to London',
      result: { flight: 'SV 123', terminal: 'Terminal 1', gate: 'B12' },
    },
    {
      id: 'ek816',
      label: 'EK 816 — Emirates to Dubai',
      result: { flight: 'EK 816', terminal: 'Terminal 2', gate: 'A4' },
    },
    {
      id: 'qr1189',
      label: 'QR 1189 — Qatar Airways to Doha',
      result: { flight: 'QR 1189', terminal: 'Terminal 1', gate: 'C7' },
    },
  ];

  var AIRPORT_FLIGHT_LOOKUP_DEFAULT = AIRPORT_FLIGHT_LOOKUP_OPTIONS[0].result;

  var AIRPORT_WAYFINDING_STEPS = [
    'Enter Terminal 1 via main departures hall',
    'Follow signage to Zone B — international gates',
    'Gate B12 is on the mezzanine level, 8 min walk',
  ];

  var AIRPORT_SECURITY_PREVIEW = {
    waitTime: '~12 min',
    lead: 'Use e-gate biometric check-in for faster screening — your AIVC wallet is already linked.',
  };

  var AIRPORT_JOURNEY_STEPS = [
    { label: 'Arrive', state: 'done' },
    { label: 'Check-in', state: 'done' },
    { label: 'Security', state: 'current' },
    { label: 'Lounge', state: 'upcoming' },
    { label: 'Gate', state: 'upcoming' },
    { label: 'Board', state: 'upcoming' },
  ];

  var AIRPORT_NEXT_ACTION_HINT = 'Next: complete security screening — Fast Track lane B is recommended for your profile.';

  var AIRPORT_ASSISTANT_SUGGESTIONS = [
    {
      title: 'Fast Track security',
      desc: 'Skip the main queue with your AIVC wallet — lane B, Terminal 1.',
      href: 'at-the-airport/security.html',
      icon: '&#9889;',
    },
    {
      title: 'Find your gate on map',
      desc: 'Live wayfinding from security to Gate B12 with step-by-step directions.',
      href: 'at-the-airport/maps.html',
      icon: '&#128506;',
    },
    {
      title: 'Pre-order duty-free',
      desc: 'Collect at Gate B12 — browse Saudi crafts and fragrances before boarding.',
      href: 'shop-dine/duty-free.html',
      icon: '&#128722;',
    },
  ];

  var AIRPORT_SERVICES_GRID = [
    { label: 'Lounges', href: 'at-the-airport/services/lounges.html', icon: '&#9749;' },
    { label: 'Special assistance', href: 'at-the-airport/services/special-assistance.html', icon: '&#9855;' },
    { label: 'Fast Track', href: 'at-the-airport/security.html', icon: '&#9889;' },
    { label: 'Family services', href: 'at-the-airport/services/index.html', icon: '&#128106;' },
  ];

  var AIRPORT_TERMINALS = [
    {
      name: 'Terminal 1',
      desc: 'International hub — full services, lounges, AIVC kiosks, and Gate B12 for your flight.',
      href: 'at-the-airport/terminal-1.html',
      featured: true,
    },
    { name: 'Terminal 2', href: 'at-the-airport/terminal-2.html' },
    { name: 'Terminal 3', href: 'at-the-airport/terminal-3.html' },
    { name: 'Terminal 4', href: 'at-the-airport/terminal-4.html' },
    { name: 'Terminal 5', href: 'at-the-airport/terminal-5.html' },
    { name: 'Terminal 6', href: 'at-the-airport/terminal-6.html' },
  ];

  var TRANSPORT_HERO = {
    kicker: 'Getting to & from KSIA',
    lead: 'Plan parking, drop-off, or public transport for your SV 123 departure — Terminal 1, 17:05.',
    stage: 'Pre-trip · Transport planning',
  };

  var TRANSPORT_MODES = [
    { id: 'parking', label: 'Parking', desc: 'Short-stay, long-stay, and valet — book ahead with your AIVC wallet.', icon: '&#127359;', href: 'transport/parking.html' },
    { id: 'drop-off', label: 'Drop-off', desc: 'Kerbside zones by terminal — kiss & fly with clear time limits.', icon: '&#128663;', href: 'transport/drop-off.html' },
    { id: 'public-transport', label: 'Public transport', desc: 'Metro, bus, taxi, and ride-hail connections to Riyadh.', icon: '&#128652;', href: 'transport/public-transport.html' },
    { id: 'chauffeur', label: 'Chauffeur', desc: 'Premium meet-and-greet — AIVC PoT #14 stub coming soon.', icon: '&#128081;', href: 'aivc/index.html', stub: true },
  ];

  var TRANSPORT_ASSISTANT = {
    title: 'Best option for your trip',
    lead: 'For SV 123 departing Terminal 1 at 17:05, we recommend pre-booking P1 short-stay parking — 5 min walk to check-in.',
    recommendation: 'P1 Short-stay · Terminal 1 · from SAR 45 / 3 hrs',
    actions: [
      { label: 'Book parking', href: 'transport/parking.html', icon: '&#127359;' },
      { label: 'Drop-off zones', href: 'transport/drop-off.html', icon: '&#128663;' },
    ],
  };

  var PARKING_PRODUCTS = [
    { id: 'short', name: 'P1 Short-stay', type: 'Short stay', terminal: 'Terminal 1', proximity: '2 min walk to departures', price: 'SAR 45 / 3 hrs', priceNote: 'SAR 15 per additional hour', features: ['Closest to T1 check-in', 'AIVC wallet pay & extend', 'EV charging bays available'] },
    { id: 'long', name: 'P3 Long-stay', type: 'Long stay', terminal: 'All terminals', proximity: 'Shuttle every 8 min', price: 'SAR 95 / 24 hrs', priceNote: 'SAR 75 per additional day', features: ['Best value for trips 3+ days', 'Covered parking option', 'Pre-book via AIVC assistant'] },
    { id: 'valet', name: 'Premium Valet', type: 'Premium / Valet', terminal: 'Terminal 1', proximity: 'Kerbside handover', price: 'SAR 180 / day', priceNote: 'Includes wash & charge (mock)', features: ['Meet at departures kerb', 'Vehicle ready on return', 'Alfursan tier discount eligible'] },
  ];

  var PARKING_ASSISTANT = {
    title: 'Pre-book parking for SV 123',
    lead: 'Reserve P1 short-stay for your 17:05 departure — pay with AIVC wallet and extend if your flight is delayed.',
    cta: 'Book P1 for 14:00–20:00',
    flight: 'SV 123',
    terminal: 'Terminal 1',
  };

  var DROP_OFF_ZONES = [
    { terminal: 'Terminal 1', zone: 'Departures kerb A–C', maxStay: '5 minutes', note: 'International departures — follow Zone B signage after drop-off.' },
    { terminal: 'Terminal 2', zone: 'Departures kerb D–E', maxStay: '5 minutes', note: 'Regional carriers — cell phone lot available for longer waits.' },
    { terminal: 'Terminal 3', zone: 'Departures kerb F', maxStay: '5 minutes', note: 'European routes — assistance desk at kerb entrance.' },
  ];

  var DROP_OFF_RULES = [
    'Drivers must remain with vehicle at all times in active kerb lanes.',
    'Maximum stay 5 minutes — enforcement cameras apply after grace period.',
    'Kiss & fly: passenger only — no parking or waiting in live lanes.',
    'For longer waits use the free cell phone lot (15 min) or book short-stay parking.',
  ];

  var PUBLIC_TRANSPORT_OPTIONS = [
    { mode: 'Metro', name: 'Riyadh Metro Line 4 (stub)', time: '~35 min to city centre', cost: 'SAR 6 (mock)', note: 'KSIA station opening with airport expansion — integrated AIVC ticketing planned.' },
    { mode: 'Bus', name: 'SAPTCO Airport Express', time: '~45 min to King Fahd Road', cost: 'SAR 25', note: 'Departures every 20 min from T1 transport hub.' },
    { mode: 'Taxi', name: 'Official airport taxi rank', time: '~30 min to downtown (off-peak)', cost: 'From SAR 85', note: 'Fixed fare zones displayed at rank — pay card or wallet.' },
    { mode: 'Ride-hail', name: 'Careem / Uber pickup zones', time: 'Varies by traffic', cost: 'Dynamic pricing', note: 'Designated pickup P2 — share live flight status from AIVC.' },
    { mode: 'Chauffeur', name: 'AIVC PoT #14 — Premium chauffeur', time: 'Door-to-gate service', cost: 'From SAR 350', note: 'Stub: book meet-and-greet with luggage assistance via AIVC companion.', stub: true },
  ];

  var SHOP_DINE_HERO = {
    kicker: 'Shop & Dine at KSIA',
    lead: 'Duty-free, retail, and dining across six terminals — personalized picks for your SV 123 journey.',
    stage: 'Airport stage · Retail & dining',
  };

  var SHOP_DINE_CATEGORIES = [
    { id: 'duty-free', label: 'Duty-free', desc: 'Saudi crafts, fragrances, and global brands — collect at gate.', icon: '&#128722;', href: 'shop-dine/duty-free.html' },
    { id: 'restaurants', label: 'Restaurants', desc: 'From quick bites to fine dining — filter by terminal and cuisine.', icon: '&#127869;', href: 'shop-dine/restaurants.html' },
    { id: 'retail', label: 'Retail', desc: 'Fashion, electronics, and travel essentials across terminals.', icon: '&#128085;', href: 'shop-dine/duty-free.html' },
  ];

  var SHOP_PERSONALIZED_PICKS = [
    { title: 'Saudi Heritage gift set', desc: 'Recommended based on your profile — oud & dates collection.', badge: 'For you', href: 'shop-dine/duty-free.html' },
    { title: 'Altitude Café — Gate B12', desc: '15 min walk from security — your usual pre-board coffee.', badge: 'Near your gate', href: 'shop-dine/restaurants.html' },
    { title: 'Pre-order duty-free', desc: 'Collect at Gate B12 before boarding SV 123.', badge: 'Save time', href: 'shop-dine/duty-free.html' },
  ];

  var SHOP_TERMINAL_FILTERS = ['All terminals', 'Terminal 1', 'Terminal 2', 'Terminal 3'];

  var DUTY_FREE_OFFERS = [
    { id: 'heritage', name: 'Saudi Heritage gift set', category: 'Gifts', price: 'SAR 189', recommended: true, note: 'Oud, dates & artisan crafts — popular departure gift.' },
    { id: 'fragrance', name: 'Arabian Oud Signature', category: 'Fragrances', price: 'SAR 320', recommended: true, note: 'Exclusive KSIA duty-free blend.' },
    { id: 'chocolate', name: 'Date chocolate assortment', category: 'Food', price: 'SAR 65', recommended: false, note: 'Local premium dates coated in dark chocolate.' },
    { id: 'electronics', name: 'Noise-cancelling earbuds', category: 'Electronics', price: 'SAR 449', recommended: false, note: 'Travel essentials — gate collection available.' },
    { id: 'perfume', name: 'Luxury fragrance duo', category: 'Fragrances', price: 'SAR 580', recommended: true, note: 'Based on your past purchases — save 15% pre-order.' },
    { id: 'dates', name: 'Ajwa dates premium box', category: 'Food', price: 'SAR 95', recommended: false, note: 'Authentic Madinah ajwa — duty-free exclusive pack.' },
  ];

  var DUTY_FREE_ASSISTANT = {
    title: 'Pre-order for gate collection',
    lead: 'Order now, collect at Gate B12 before boarding SV 123 — pay with AIVC wallet at pickup.',
    walletHref: 'aivc/wallet-setup.html',
  };

  var RESTAURANTS = [
    { name: 'Altitude Café', terminal: 'Terminal 1', cuisine: 'Café', waitTime: '~5 min', dietary: 'Vegetarian options', featured: true },
    { name: 'Al Nakheel Restaurant', terminal: 'Terminal 1', cuisine: 'Saudi & Middle Eastern', waitTime: '~15 min', dietary: 'Halal · Gluten-free available' },
    { name: 'Sushi Express', terminal: 'Terminal 2', cuisine: 'Japanese', waitTime: '~10 min', dietary: 'Pescatarian · Nut-free' },
    { name: 'The Grill House', terminal: 'Terminal 1', cuisine: 'International grill', waitTime: '~20 min', dietary: 'Halal steaks & salads' },
    { name: 'Quick Bites', terminal: 'Terminal 3', cuisine: 'Fast food', waitTime: '~8 min', dietary: 'Standard allergen menu' },
    { name: 'Levant Kitchen', terminal: 'Terminal 2', cuisine: 'Levantine', waitTime: '~12 min', dietary: 'Vegan mezze platter' },
  ];

  var RESTAURANT_CUISINES = ['All cuisines', 'Café', 'Saudi & Middle Eastern', 'Japanese', 'International grill', 'Fast food', 'Levantine'];

  var RESTAURANTS_ASSISTANT = {
    title: 'Dietary preferences',
    lead: 'Your AIVC wallet stores halal and gluten-free preferences — restaurants with matching menus are highlighted.',
    walletHref: 'aivc/wallet-setup.html',
  };

  var AIVC_HERO = {
    kicker: 'Your AIVC companion',
    tripSummary: 'SV 123 · Riyadh → London · Terminal 1 · Gate B12 · 17:05',
    stage: 'Pre-trip → Post-trip orchestration',
    status: 'Wallet 50% complete',
  };

  var AIVC_JOURNEY_STAGES = [
    { id: 'pre-trip', label: 'Pre-trip', state: 'current', desc: 'Book parking, set up wallet, pre-order retail.' },
    { id: 'airport', label: 'At airport', state: 'upcoming', desc: 'Wayfinding, security, lounge, gate.' },
    { id: 'in-flight', label: 'In-flight', state: 'upcoming', desc: 'Entertainment, meal prefs, connection alerts.' },
    { id: 'post-trip', label: 'Post-trip', state: 'upcoming', desc: 'Baggage, ground transport, feedback.' },
  ];

  var AIVC_NEXT_ACTIONS = [
    { title: 'Complete wallet setup', desc: '2 of 4 steps done — add dietary prefs and notifications.', href: 'aivc/wallet-setup.html', priority: 'high', icon: '&#128179;' },
    { title: 'Pre-book parking', desc: 'P1 short-stay recommended for SV 123 — Terminal 1.', href: 'transport/parking.html', priority: 'medium', icon: '&#127359;' },
    { title: 'Pre-order duty-free', desc: 'Collect at Gate B12 — personalized picks ready.', href: 'shop-dine/duty-free.html', priority: 'medium', icon: '&#128722;' },
    { title: 'Open terminal map', desc: 'Gate B12 wayfinding from security.', href: 'at-the-airport/maps.html', priority: 'low', icon: '&#128506;' },
  ];

  var AIVC_CONNECTED_SERVICES = [
    { label: 'Parking', href: 'transport/parking.html', icon: '&#127359;', partner: 'KSIA Parking' },
    { label: 'Duty-free', href: 'shop-dine/duty-free.html', icon: '&#128722;', partner: 'KSIA Retail' },
    { label: 'Lounges', href: 'at-the-airport/services/lounges.html', icon: '&#9749;', partner: 'Saudia Alfursan' },
    { label: 'Disruption support', href: 'aivc/disruption-compensation.html', icon: '&#9888;', partner: 'AIVC Claims' },
    { label: 'Restaurants', href: 'shop-dine/restaurants.html', icon: '&#127869;', partner: 'KSIA F&B' },
    { label: 'Public transport', href: 'transport/public-transport.html', icon: '&#128652;', partner: 'SAPTCO' },
  ];

  var AIVC_WALLET_PREVIEW = {
    items: [
      { label: 'Boarding pass', value: 'SV 123 · Gate B12', status: 'ready' },
      { label: 'Identity', value: 'Nafath linked (mock)', status: 'ready' },
      { label: 'Parking', value: 'Not booked', status: 'pending' },
      { label: 'Preferences', value: 'Language · partial', status: 'partial' },
    ],
    progress: 2,
    total: 4,
  };

  var AIVC_TRUST_OUTCOMES = [
    { stat: '94%', label: 'Proactive alerts delivered before gate changes (mock)' },
    { stat: '12 min', label: 'Average time saved at security with e-gate wallet' },
    { stat: '200 SAR', label: 'Typical disruption voucher issued automatically' },
  ];

  var WALLET_SETUP_STEPS = [
    { id: 'identity', label: 'Verify identity', desc: 'Nafath-style federated auth (mock)', done: true },
    { id: 'boarding', label: 'Add boarding pass', desc: 'SV 123 synced from airline', done: true },
    { id: 'preferences', label: 'Set preferences', desc: 'Language, notifications, dietary', done: false },
    { id: 'payment', label: 'Link payment', desc: 'Parking, retail, and lounge pay', done: false },
  ];

  var WALLET_PREFERENCES = {
    languages: ['English', 'Arabic', 'French'],
    notifications: ['Flight status', 'Gate changes', 'Retail offers', 'Disruption alerts'],
    dietary: ['Halal', 'Vegetarian', 'Gluten-free', 'Nut-free'],
  };

  var DISRUPTION_SCENARIO = {
    flight: 'SV 456',
    route: 'Jeddah JED → Riyadh RUH',
    delay: '2 hours',
    originalDeparture: '14:30',
    revisedDeparture: '16:30',
    terminal: 'Terminal 1',
    voucherAmount: '200 SAR',
    voucherCode: 'KSIA-DLY-456-2026',
    alternatives: [
      { flight: 'SV 458', time: '15:45', seats: '12 seats left', status: 'On time' },
      { flight: 'SV 460', time: '17:20', seats: 'Available', status: 'On time' },
    ],
    retailLink: 'shop-dine/duty-free.html',
    retailNote: 'Redeem voucher at duty-free — 15% bonus on Saudi Heritage collection.',
  };

  var ABOUT_CONTENT = {
    visionLead: 'King Salman International Airport is Saudi Arabia\'s gateway to the world — a catalyst for Vision 2030 tourism, trade, and innovation.',
    stats: [
      { value: '6', label: 'World-class terminals' },
      { value: '185M', label: 'Annual passenger capacity (target)' },
      { value: '2030', label: 'Vision alignment' },
      { value: 'AIVC', label: 'Intelligent companion platform' },
    ],
    pillars: [
      { title: 'Seamless journeys', desc: 'From kerb to gate — orchestrated experiences powered by Adobe Experience Platform and AIVC.' },
      { title: 'Saudi hospitality', desc: 'Heritage-inspired design with world-class retail, dining, and passenger services.' },
      { title: 'Sustainable growth', desc: 'Supporting Vision 2030 tourism targets with efficient, connected airport operations.' },
    ],
  };

  var MEDIA_ITEMS = [
    { date: 'Oct 2025', title: 'KSIA announces six-terminal masterplan', tag: 'Press release' },
    { date: 'Nov 2025', title: 'AIVC companion platform preview for passengers', tag: 'Innovation' },
    { date: 'Jan 2026', title: 'Vision 2030 gateway — brand assets pack', tag: 'Brand' },
  ];

  var CONTACT_CHANNELS = [
    { label: 'Passenger services', value: '+966 11 000 KSIA (mock)', hours: '24/7' },
    { label: 'Lost property', value: 'lostproperty@ksia-demo.lab', hours: '08:00–22:00 AST' },
    { label: 'AIVC support', value: 'Chat via wallet assistant', hours: 'Always on' },
    { label: 'Media enquiries', value: 'media@ksia-demo.lab', hours: 'Business hours' },
  ];

  var PAGE_META = {
    about: {
      title: 'About KSIA',
      heading: 'Vision 2030 & the KSIA story',
      lead: 'King Salman International Airport is Saudi Arabia\'s gateway to the world — a catalyst for Vision 2030 tourism, trade, and innovation.',
      section: 'about',
      breadcrumbs: [{ label: 'About KSIA' }],
    },
    'flights-hub': {
      title: 'Flights',
      heading: 'Flights information',
      lead: 'Search, track arrivals and departures across six terminals.',
      section: 'flights',
      breadcrumbs: [
        { label: 'Flights', href: 'flights/index.html' },
        { label: 'Flights hub' },
      ],
    },
    'flights-arrivals': {
      title: 'Arrivals',
      heading: 'Flight arrivals',
      lead: 'Live arrival board with pickup tips for guests meeting incoming flights.',
      section: 'flights',
      breadcrumbs: [
        { label: 'Flights', href: 'flights/index.html' },
        { label: 'Arrivals' },
      ],
    },
    'flights-departures': {
      title: 'Departures',
      heading: 'Flight departures',
      lead: 'Live departure board with gate info and pre-flight actions for your journey.',
      section: 'flights',
      breadcrumbs: [
        { label: 'Flights', href: 'flights/index.html' },
        { label: 'Departures' },
      ],
    },
    'at-the-airport-hub': {
      title: 'At the airport',
      heading: 'At the airport',
      lead: 'Navigate terminals, security, and services with proactive AIVC guidance on your travel day.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Airport hub' },
      ],
    },
    'terminal-guide': {
      title: 'Terminal guide',
      heading: 'Terminal guide',
      lead: 'Look up your airline and find the right terminal before you travel.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal guide' },
      ],
    },
    'terminal-1': {
      title: 'Terminal 1',
      heading: 'Terminal 1',
      lead: 'International hub — gates, amenities, shops, and lounge access.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal guide', href: 'at-the-airport/terminal-guide.html' },
        { label: 'Terminal 1' },
      ],
    },
    'terminal-2': {
      title: 'Terminal 2',
      heading: 'Terminal 2',
      lead: 'Regional and premium carrier terminal — opening with KSIA expansion.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal 2' },
      ],
    },
    'terminal-3': {
      title: 'Terminal 3',
      heading: 'Terminal 3',
      lead: 'European and long-haul carriers — opening with KSIA expansion.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal 3' },
      ],
    },
    'terminal-4': {
      title: 'Terminal 4',
      heading: 'Terminal 4',
      lead: 'Low-cost carrier terminal — opening with KSIA expansion.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal 4' },
      ],
    },
    'terminal-5': {
      title: 'Terminal 5',
      heading: 'Terminal 5',
      lead: 'Cargo-adjacent passenger terminal — opening with KSIA expansion.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal 5' },
      ],
    },
    'terminal-6': {
      title: 'Terminal 6',
      heading: 'Terminal 6',
      lead: 'Future expansion terminal — opening with KSIA expansion.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Terminal 6' },
      ],
    },
    maps: {
      title: 'Maps',
      heading: 'Airport maps',
      lead: 'Wayfinding across terminals, gates, shops, and transport links.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Maps' },
      ],
    },
    security: {
      title: 'Security',
      heading: 'Security & screening',
      lead: 'Wait times, biometric e-gates, Fast Track, and what to prepare.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Security' },
      ],
    },
    'services-hub': {
      title: 'Services',
      heading: 'Passenger services',
      lead: 'Lounges, assistance, baggage, information, and more across KSIA.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Services' },
      ],
    },
    lounges: {
      title: 'Lounges',
      heading: 'Airport lounges',
      lead: 'Access tiers, personalized recommendations, and booking.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Services', href: 'at-the-airport/services/index.html' },
        { label: 'Lounges' },
      ],
    },
    'special-assistance': {
      title: 'Special assistance',
      heading: 'Special assistance',
      lead: 'Accessibility requests, contact options, and journey support.',
      section: 'at-the-airport',
      breadcrumbs: [
        { label: 'At the airport', href: 'at-the-airport/index.html' },
        { label: 'Services', href: 'at-the-airport/services/index.html' },
        { label: 'Special assistance' },
      ],
    },
    'transport-hub': {
      title: 'Transport',
      heading: 'Getting to & from KSIA',
      lead: 'Parking, drop-off, taxis, and public transport connections.',
      section: 'transport',
      breadcrumbs: [{ label: 'Transport', href: 'transport/index.html' }, { label: 'Transport hub' }],
    },
    parking: {
      title: 'Parking',
      heading: 'Parking',
      lead: 'Short-stay, long-stay, and valet options with AIVC wallet integration.',
      section: 'transport',
      breadcrumbs: [{ label: 'Transport', href: 'transport/index.html' }, { label: 'Parking' }],
    },
    'drop-off': {
      title: 'Drop-off',
      heading: 'Passenger drop-off',
      lead: 'Kerbside zones by terminal with clear signage and timing limits.',
      section: 'transport',
      breadcrumbs: [{ label: 'Transport', href: 'transport/index.html' }, { label: 'Drop-off' }],
    },
    'public-transport': {
      title: 'Public transport',
      heading: 'Public transport',
      lead: 'Metro, bus, and shuttle links to Riyadh and the region.',
      section: 'transport',
      breadcrumbs: [{ label: 'Transport', href: 'transport/index.html' }, { label: 'Public transport' }],
    },
    'shop-dine-hub': {
      title: 'Shop & Dine',
      heading: 'Shop & Dine',
      lead: 'Duty free, retail, and dining across all terminals.',
      section: 'shop-dine',
      breadcrumbs: [{ label: 'Shop & Dine', href: 'shop-dine/index.html' }, { label: 'Marketplace hub' }],
    },
    'duty-free': {
      title: 'Duty free',
      heading: 'Duty free shopping',
      lead: 'Saudi and international brands — collect at gate or home delivery.',
      section: 'shop-dine',
      breadcrumbs: [{ label: 'Shop & Dine', href: 'shop-dine/index.html' }, { label: 'Duty free' }],
    },
    restaurants: {
      title: 'Restaurants',
      heading: 'Restaurants & cafés',
      lead: 'From quick bites to fine dining before you fly.',
      section: 'shop-dine',
      breadcrumbs: [{ label: 'Shop & Dine', href: 'shop-dine/index.html' }, { label: 'Restaurants' }],
    },
    'aivc-hub': {
      title: 'AIVC',
      heading: 'Airport Intelligent Virtual Companion',
      lead: 'Your digital companion for wallet, wayfinding, and disruption support.',
      section: 'aivc',
      breadcrumbs: [{ label: 'AIVC', href: 'aivc/index.html' }, { label: 'Companion hub' }],
    },
    'wallet-setup': {
      title: 'Wallet setup',
      heading: 'AIVC wallet setup',
      lead: 'Link your boarding pass, parking, and loyalty cards in one wallet.',
      section: 'aivc',
      breadcrumbs: [{ label: 'AIVC', href: 'aivc/index.html' }, { label: 'Wallet setup' }],
    },
    'disruption-compensation': {
      title: 'Disruption compensation',
      heading: 'Disruption compensation',
      lead: 'Automated claims when delays or cancellations affect your journey.',
      section: 'aivc',
      breadcrumbs: [{ label: 'AIVC', href: 'aivc/index.html' }, { label: 'Disruption compensation' }],
    },
    media: {
      title: 'Media',
      heading: 'Media centre',
      lead: 'Press releases, brand assets, and Vision 2030 announcements.',
      section: 'media',
      breadcrumbs: [{ label: 'Media centre' }],
    },
    contact: {
      title: 'Contact',
      heading: 'Contact us',
      lead: 'Customer service, lost property, and feedback channels.',
      section: 'contact',
      breadcrumbs: [{ label: 'Contact us' }],
    },
  };

  global.KsiaMockData = {
    NAV: NAV,
    CAROUSEL_SLIDES: CAROUSEL_SLIDES,
    GALLERY_CAROUSEL: GALLERY_CAROUSEL,
    QUICK_LINKS: QUICK_LINKS,
    SAMPLE_ARRIVALS: SAMPLE_ARRIVALS,
    SAMPLE_DEPARTURES: SAMPLE_DEPARTURES,
    BOARD_ARRIVALS: BOARD_ARRIVALS,
    BOARD_DEPARTURES: BOARD_DEPARTURES,
    TRACKED_ARRIVAL: TRACKED_ARRIVAL,
    TRACKED_DEPARTURE: TRACKED_DEPARTURE,
    ARRIVALS_ASSISTANT: ARRIVALS_ASSISTANT,
    DEPARTURES_ASSISTANT: DEPARTURES_ASSISTANT,
    DEPARTURES_GATE_ALERT: DEPARTURES_GATE_ALERT,
    TERMINAL_GUIDE_AIRLINES: TERMINAL_GUIDE_AIRLINES,
    TERMINAL_1_DETAIL: TERMINAL_1_DETAIL,
    TERMINAL_STUBS: TERMINAL_STUBS,
    MAPS_WAYFINDING: MAPS_WAYFINDING,
    SECURITY_PAGE: SECURITY_PAGE,
    SERVICES_HUB_ITEMS: SERVICES_HUB_ITEMS,
    LOUNGES_PAGE: LOUNGES_PAGE,
    SPECIAL_ASSISTANCE_PAGE: SPECIAL_ASSISTANCE_PAGE,
    FLIGHTS_TRIP_CARD: FLIGHTS_TRIP_CARD,
    FLIGHTS_JOURNEY_STEPS: FLIGHTS_JOURNEY_STEPS,
    FLIGHTS_ASSISTANT_SUGGESTIONS: FLIGHTS_ASSISTANT_SUGGESTIONS,
    FLIGHTS_RELATED_SERVICES: FLIGHTS_RELATED_SERVICES,
    AIRPORT_HERO_CONTEXT: AIRPORT_HERO_CONTEXT,
    AIRPORT_FLIGHT_LOOKUP_OPTIONS: AIRPORT_FLIGHT_LOOKUP_OPTIONS,
    AIRPORT_FLIGHT_LOOKUP_DEFAULT: AIRPORT_FLIGHT_LOOKUP_DEFAULT,
    AIRPORT_WAYFINDING_STEPS: AIRPORT_WAYFINDING_STEPS,
    AIRPORT_SECURITY_PREVIEW: AIRPORT_SECURITY_PREVIEW,
    AIRPORT_JOURNEY_STEPS: AIRPORT_JOURNEY_STEPS,
    AIRPORT_NEXT_ACTION_HINT: AIRPORT_NEXT_ACTION_HINT,
    AIRPORT_ASSISTANT_SUGGESTIONS: AIRPORT_ASSISTANT_SUGGESTIONS,
    AIRPORT_SERVICES_GRID: AIRPORT_SERVICES_GRID,
    AIRPORT_TERMINALS: AIRPORT_TERMINALS,
    TRANSPORT_HERO: TRANSPORT_HERO,
    TRANSPORT_MODES: TRANSPORT_MODES,
    TRANSPORT_ASSISTANT: TRANSPORT_ASSISTANT,
    PARKING_PRODUCTS: PARKING_PRODUCTS,
    PARKING_ASSISTANT: PARKING_ASSISTANT,
    DROP_OFF_ZONES: DROP_OFF_ZONES,
    DROP_OFF_RULES: DROP_OFF_RULES,
    PUBLIC_TRANSPORT_OPTIONS: PUBLIC_TRANSPORT_OPTIONS,
    SHOP_DINE_HERO: SHOP_DINE_HERO,
    SHOP_DINE_CATEGORIES: SHOP_DINE_CATEGORIES,
    SHOP_PERSONALIZED_PICKS: SHOP_PERSONALIZED_PICKS,
    SHOP_TERMINAL_FILTERS: SHOP_TERMINAL_FILTERS,
    DUTY_FREE_OFFERS: DUTY_FREE_OFFERS,
    DUTY_FREE_ASSISTANT: DUTY_FREE_ASSISTANT,
    RESTAURANTS: RESTAURANTS,
    RESTAURANT_CUISINES: RESTAURANT_CUISINES,
    RESTAURANTS_ASSISTANT: RESTAURANTS_ASSISTANT,
    AIVC_HERO: AIVC_HERO,
    AIVC_JOURNEY_STAGES: AIVC_JOURNEY_STAGES,
    AIVC_NEXT_ACTIONS: AIVC_NEXT_ACTIONS,
    AIVC_CONNECTED_SERVICES: AIVC_CONNECTED_SERVICES,
    AIVC_WALLET_PREVIEW: AIVC_WALLET_PREVIEW,
    AIVC_TRUST_OUTCOMES: AIVC_TRUST_OUTCOMES,
    WALLET_SETUP_STEPS: WALLET_SETUP_STEPS,
    WALLET_PREFERENCES: WALLET_PREFERENCES,
    DISRUPTION_SCENARIO: DISRUPTION_SCENARIO,
    ABOUT_CONTENT: ABOUT_CONTENT,
    MEDIA_ITEMS: MEDIA_ITEMS,
    CONTACT_CHANNELS: CONTACT_CHANNELS,
    PAGE_META: PAGE_META,
  };
})(typeof window !== 'undefined' ? window : globalThis);
