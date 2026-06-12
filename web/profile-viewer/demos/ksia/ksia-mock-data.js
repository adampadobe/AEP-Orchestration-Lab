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
    { label: 'Terminal maps', href: 'at-the-airport/maps.html', desc: 'Wayfinding & gates' },
    { label: 'Parking', href: 'transport/parking.html', desc: 'Rates & booking' },
    { label: 'AIVC wallet', href: 'aivc/wallet-setup.html', desc: 'Digital travel companion' },
    { label: 'Shop & Dine', href: 'shop-dine/index.html', desc: 'Retail & dining' },
  ];

  var SAMPLE_ARRIVALS = [
    { flight: 'SV 102', from: 'London LHR', time: '14:25', terminal: 'T1', status: 'Landed' },
    { flight: 'EK 815', from: 'Dubai DXB', time: '15:10', terminal: 'T2', status: 'On time' },
    { flight: 'QR 1188', from: 'Doha DOH', time: '15:45', terminal: 'T1', status: 'Delayed' },
    { flight: 'BA 263', from: 'London LHR', time: '16:20', terminal: 'T3', status: 'On time' },
  ];

  var SAMPLE_DEPARTURES = [
    { flight: 'SV 123', to: 'London LHR', time: '17:05', terminal: 'T1', status: 'On time' },
    { flight: 'SV 103', to: 'London LHR', time: '17:05', terminal: 'T1', status: 'Boarding' },
    { flight: 'EK 816', to: 'Dubai DXB', time: '17:40', terminal: 'T2', status: 'On time' },
    { flight: 'QR 1189', to: 'Doha DOH', time: '18:15', terminal: 'T1', status: 'On time' },
    { flight: 'BA 264', to: 'London LHR', time: '19:00', terminal: 'T3', status: 'Gate open' },
  ];

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

  var PAGE_META = {
    about: { title: 'About KSIA', heading: 'Vision 2030 & the KSIA story', lead: 'King Salman International Airport is Saudi Arabia\'s gateway to the world — a catalyst for Vision 2030 tourism, trade, and innovation.' },
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
    'flights-arrivals': { title: 'Arrivals', heading: 'Flight arrivals', lead: 'Live arrival information for King Salman International Airport.' },
    'flights-departures': { title: 'Departures', heading: 'Flight departures', lead: 'Live departure information for King Salman International Airport.' },
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
    'terminal-guide': { title: 'Terminal guide', heading: 'Terminal guide', lead: 'Overview of KSIA\'s six-terminal layout and passenger flows.' },
    'terminal-1': { title: 'Terminal 1', heading: 'Terminal 1', lead: 'International hub — full services, lounges, and AIVC kiosks.' },
    'terminal-2': { title: 'Terminal 2', heading: 'Terminal 2', lead: 'Regional and domestic operations (stub — content coming soon).' },
    'terminal-3': { title: 'Terminal 3', heading: 'Terminal 3', lead: 'Premium carrier terminal (stub — content coming soon).' },
    'terminal-4': { title: 'Terminal 4', heading: 'Terminal 4', lead: 'Low-cost carrier terminal (stub — content coming soon).' },
    'terminal-5': { title: 'Terminal 5', heading: 'Terminal 5', lead: 'Cargo-adjacent passenger terminal (stub — content coming soon).' },
    'terminal-6': { title: 'Terminal 6', heading: 'Terminal 6', lead: 'Future expansion terminal (stub — content coming soon).' },
    maps: { title: 'Maps', heading: 'Airport maps', lead: 'Interactive wayfinding across terminals, gates, and transport links.' },
    security: { title: 'Security', heading: 'Security & screening', lead: 'Prepare for security — liquids, electronics, and fast-track options.' },
    'services-hub': { title: 'Services', heading: 'Passenger services', lead: 'Baggage, information desks, prayer rooms, and more.' },
    lounges: { title: 'Lounges', heading: 'Airport lounges', lead: 'Premium lounges across terminals — book or walk-in where available.' },
    'special-assistance': { title: 'Special assistance', heading: 'Special assistance', lead: 'Mobility support, hidden disabilities, and companion services.' },
    'transport-hub': { title: 'Transport', heading: 'Getting to & from KSIA', lead: 'Parking, drop-off, taxis, and public transport connections.' },
    parking: { title: 'Parking', heading: 'Parking', lead: 'Short-stay, long-stay, and valet options with AIVC wallet integration.' },
    'drop-off': { title: 'Drop-off', heading: 'Passenger drop-off', lead: 'Kerbside zones by terminal with clear signage and timing limits.' },
    'public-transport': { title: 'Public transport', heading: 'Public transport', lead: 'Metro, bus, and shuttle links to Riyadh and the region.' },
    'shop-dine-hub': { title: 'Shop & Dine', heading: 'Shop & Dine', lead: 'Duty free, retail, and dining across all terminals.' },
    'duty-free': { title: 'Duty free', heading: 'Duty free shopping', lead: 'Saudi and international brands — collect at gate or home delivery.' },
    restaurants: { title: 'Restaurants', heading: 'Restaurants & cafés', lead: 'From quick bites to fine dining before you fly.' },
    'aivc-hub': { title: 'AIVC', heading: 'Airport Intelligent Virtual Companion', lead: 'Your digital companion for wallet, wayfinding, and disruption support.' },
    'wallet-setup': { title: 'Wallet setup', heading: 'AIVC wallet setup', lead: 'Link your boarding pass, parking, and loyalty cards in one wallet.' },
    'disruption-compensation': { title: 'Disruption compensation', heading: 'Disruption compensation', lead: 'Automated claims when delays or cancellations affect your journey.' },
    media: { title: 'Media', heading: 'Media centre', lead: 'Press releases, brand assets, and Vision 2030 announcements.' },
    contact: { title: 'Contact', heading: 'Contact us', lead: 'Customer service, lost property, and feedback channels.' },
  };

  global.KsiaMockData = {
    NAV: NAV,
    CAROUSEL_SLIDES: CAROUSEL_SLIDES,
    GALLERY_CAROUSEL: GALLERY_CAROUSEL,
    QUICK_LINKS: QUICK_LINKS,
    SAMPLE_ARRIVALS: SAMPLE_ARRIVALS,
    SAMPLE_DEPARTURES: SAMPLE_DEPARTURES,
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
    PAGE_META: PAGE_META,
  };
})(typeof window !== 'undefined' ? window : globalThis);
