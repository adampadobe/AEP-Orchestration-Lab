(function (global) {
  'use strict';
  // Reference-led compositions; the shared header, booking bar and footer stay mounted.
  const places = {
    diriyah: { title: 'Diriyah', image: 'diriyah.avif', category: 'Heritage', intro: 'Discover the birthplace of the first Saudi state. Earth-coloured architecture, winding lanes and the story of At-Turaif invite you to see Riyadh from a different perspective.', detail: 'Make time for a walk through the historic district, then enjoy the setting of Bujairi Terrace. Check current opening times and ticket requirements with the venue before you visit.' },
    'edge-of-world': { title: 'Edge of the World', image: 'edge-of-world.avif', category: 'Adventure', intro: 'Leave the city behind for an extraordinary view across the escarpment. The cliffs and open horizons offer a different side of Riyadh.', detail: 'Plan a guided excursion with a local operator, suitable transport and plenty of water. Conditions and access can change; confirm arrangements before travelling.' },
    masmak: { title: 'Al Masmak Palace', image: 'masmak.avif', category: 'Heritage', intro: 'Step into the story of Riyadh at one of its most recognisable landmarks. Thick mud-brick walls and traditional towers frame a journey into Saudi history.', detail: 'Pair a visit to the palace with a walk through the nearby markets and old city. Check official visitor information for current access and opening hours.' },
    kafd: { title: 'King Abdullah Financial District', image: 'kafd.avif', category: 'Architecture', intro: 'Explore a new perspective on the capital. Bold architecture, public spaces and places to dine bring contemporary Riyadh into focus.', detail: 'Take a walk among the district’s striking buildings and discover its restaurants and gathering places. Choose your own pace, from an afternoon stroll to dinner in the city.' },
    'boulevard-city': { title: 'Boulevard City', image: 'boulevard-city.avif', category: 'Entertainment', intro: 'See the city come alive with entertainment, dining and experiences to share. There is always another corner to discover.', detail: 'Explore what is on during your trip and plan ahead for popular experiences. Event schedules, admission and availability are managed by the venues, not this website.' },
    souq: { title: 'Souq Al Zal', image: 'souq.avif', category: 'Culture', intro: 'Follow the textures, colours and scents of a traditional Riyadh market. Discover carpets, crafts and the pleasure of taking your time.', detail: 'Explore the stalls around the historic centre and meet the people behind the craft. Leave room in your day for Saudi coffee and a slower look at the city.' },
  };
  const labels = Object.freeze({
    home: 'Home page', plan: 'Plan & book', manage: 'Manage', cancellation: 'Cancel your booking', discover: 'Discover Riyadh',
    destinations: 'Where we fly', experience: 'The Riyadh Air experience',
    results: 'Flight search results', return: 'Return flights', passenger: 'Guest details',
    contact: 'Contact details', cart: 'Shopping cart', extras: 'Seats and extras',
    payment: 'Booking review', trip: 'My trip', upgrade: 'Cabin upgrade',
    ...Object.fromEntries(Object.entries(places).map(([key, place]) => [key, place.title])),
  });
  const link = (page, text, style = 'ra-button') => '<a class="' + style + '" href="?step=' + page + '" data-ra-page="' + page + '">' + text + '</a>';
  const image = (name, alt, eager = false) => '<img src="riyadh-air-assets/' + name + '" alt="' + alt + '" loading="' + (eager ? 'eager' : 'lazy') + '">';
  const book = (destination, text = 'Plan your journey') => '<button class="ra-button" type="button" data-ra-book-destination="' + destination + '">' + text + '</button>';
  const readout = (photo, alt, title, copy, action, reverse = false) =>
    '<section class="ra-section ra-readout' + (reverse ? ' ra-readout-reverse' : '') + '">' + image(photo, alt) +
    '<div><h2>' + title + '</h2><p>' + copy + '</p>' + action + '</div></section>';
  const card = (key) => {
    const place = places[key];
    return '<a class="ra-place-card" href="?step=' + key + '" data-ra-page="' + key + '">' +
      image(place.image, place.title) + '<div><small>' + place.category + '</small><h3>' + place.title +
      '</h3><span class="ra-card-arrow" aria-hidden="true">&#8599;</span></div></a>';
  };
  const hero = (photo, alt, title, copy, label) => '<section class="ra-explore-hero">' + image(photo, alt, true) +
    '<div>' + (label ? '<p>' + label + '</p>' : '') + '<h1 id="raExploreTitle" tabindex="-1">' + title +
    '</h1>' + (copy ? '<p>' + copy + '</p>' : '') + '</div></section>';

  function render(page) {
    if (page === 'manage') return '<div class="ra-manage">' +
      hero('manage-hero.avif', 'A Riyadh Air colleague helping a guest at the airport', 'We’re here to support your journey',
        'Access your booking details, make changes, or follow up on your travel plans securely and simply through Riyadh Air.') +
      '<section class="ra-section ra-manage-services" aria-label="Manage your journey">' +
      '<button class="ra-manage-service" type="button" data-ra-action="manage">' + image('manage-order.avif', '') +
      '<span class="ra-manage-service-copy"><span class="ra-manage-service-title">Manage your order</span>' +
      '<span>Access your confirmed journey, review your booking details, and explore seats and extras.</span></span><span class="ra-manage-arrow" aria-hidden="true">&#8594;</span></button>' +
      link('cancellation', image('manage-cancel.avif', '') + '<span class="ra-manage-service-copy"><span class="ra-manage-service-title">Cancel your booking</span>' +
        '<span>Find out what to check before cancelling your booking and where to get support.</span></span><span class="ra-manage-arrow" aria-hidden="true">&#8594;</span>', 'ra-manage-service') +
      '</section></div>';
    if (page === 'cancellation') return '<nav class="ra-explore-breadcrumb" aria-label="Breadcrumb">' + link('home', 'Home', '') +
      '<span aria-hidden="true">/</span>' + link('manage', 'Manage', '') + '<span aria-hidden="true">/</span><span aria-current="page">Cancel your booking</span></nav>' +
      hero('manage-hero.avif', 'A Riyadh Air colleague assisting a guest', 'Cancel your booking', 'Understand your options before changing your travel plans.') +
      '<section class="ra-section ra-place-intro"><h2>Before you cancel</h2><p>Check the fare conditions and any cancellation charges in your booking confirmation. Refund eligibility and timing depend on the fare and the original booking channel.</p>' +
      '<p>For a real reservation, contact the airline or the travel provider you booked with. This website cannot cancel airline tickets or issue refunds. Your local demo booking remains unchanged.</p>' +
      '<div class="ra-actions"><button class="ra-button" type="button" data-ra-action="manage">View your order</button>' +
      link('manage', 'Back to Manage', 'ra-text-button') + '</div></section>';
    if (page === 'plan') return hero('plan-waves.svg', '', 'Plan your next journey with ease', '', 'Plan &amp; manage') +
      '<p class="ra-explore-intro">Discover Riyadh Air destinations, explore travel options, and book with confidence. Your next adventure begins here.</p>' +
      readout('plan-destinations.webp', 'Riyadh Air aircraft above the Earth', 'Where we fly', 'Every destination tells a story. Find your next journey, from the heart of Saudi Arabia to a new horizon.', link('destinations', 'View destinations'), true) +
      readout('plan-manage.webp', 'A laptop, passport and headphones ready for a journey', 'Manage your order', 'Review your confirmed journey, explore seats and extras, or check the latest update for your flight.', '<button class="ra-button" type="button" data-ra-action="manage">Access your order</button>');
    if (page === 'discover') return hero('riyadh.avif', 'Riyadh skyline', 'Discover Riyadh', 'A city of new perspectives. A story waiting to be explored.') +
      readout('discover-collage.avif', 'Heritage, culture and experiences around Riyadh', 'The heart of modern Saudi', 'Discover a capital where heritage meets a new energy. Explore its historic streets, contemporary architecture and wide-open horizons.', '<a class="ra-button" href="#raAttractions">Explore Riyadh</a>', true) +
      '<section class="ra-section" id="raAttractions"><div class="ra-section-heading"><h2>Places to visit in Riyadh</h2><p>Find a different side of the city, one experience at a time.</p></div><div class="ra-place-grid">' +
      Object.keys(places).map(card).join('') + '</div></section>' +
      readout('heritage.avif', 'Traditional Saudi architecture', 'A city with a story to tell', 'From Diriyah to the old city, discover places that connect the present with the past.', link('diriyah', 'Discover Diriyah')) +
      readout('saudi-dining.avif', 'Traditional Saudi dishes', 'A taste of Saudi hospitality', 'Make room for shared tables, local flavours and the warmth of Saudi coffee. Let the city’s food become part of your journey.', link('souq', 'Explore the old city'), true) +
      readout('desert-adventure.avif', 'A desert excursion outside Riyadh', 'Beyond the city', 'Trade the skyline for open desert and sweeping views. Plan an adventure beyond the capital.', link('edge-of-world', 'Explore the outdoors')) +
      readout('saudi-culture.avif', 'Visitors discovering traditional Saudi crafts', 'Meet the culture', 'Spend an afternoon among traditional crafts and historic streets. Discover the details that make the city its own.', link('souq', 'Discover local traditions'), true) +
      readout('riyadh-shopping.avif', 'Visitors exploring contemporary Riyadh', 'A new perspective', 'Explore the capital’s contemporary spaces, from distinctive architecture to places to shop and meet.', link('kafd', 'See modern Riyadh')) +
      '<section class="ra-section"><div class="ra-section-heading"><h2>There is more to experience</h2><p>Build your visit around culture, shopping and the city’s changing calendar.</p></div><div class="ra-editorial-grid">' +
      '<article>' + image('riyadh-season.jpg', 'Riyadh Season entertainment') + '<h3>Riyadh Season</h3><p>Discover the city’s entertainment season. Check the official calendar for current events.</p>' + link('boulevard-city', 'Explore entertainment', 'ra-text-button') + '</article>' +
      '<article>' + image('esports.avif', 'An esports venue in Riyadh') + '<h3>A city in play</h3><p>Explore a capital with a growing calendar of sport, gaming and live experiences.</p>' + link('boulevard-city', 'Discover more', 'ra-text-button') + '</article>' +
      '<article>' + image('diriyah-season.avif', 'Historic Diriyah in the evening') + '<h3>Discover Diriyah</h3><p>Make space for heritage and a different view of the city.</p>' + link('diriyah', 'Plan a visit', 'ra-text-button') + '</article></div></section>' +
      '<section class="ra-section ra-explore-banner">' + image('explore-saudi.avif', 'Horse riding in Saudi Arabia') + '<div><h2>Your Saudi journey begins here</h2>' + book('RUH', 'Find flights to Riyadh') + '</div></section>';
    if (page === 'destinations') return hero('fleet.avif', 'Riyadh Air aircraft', 'Where we fly', 'From Riyadh, a world of possibility.') +
      '<section class="ra-section"><div class="ra-section-heading"><h2>Find your next destination</h2><p>Choose a destination to plan your flight. Flight options and fares in this experience are illustrative.</p></div><div class="ra-destinations">' +
      [['RUH', 'Riyadh', 'riyadh.avif'], ['LHR', 'London', 'london.avif'], ['CGK', 'Jakarta', 'jakarta.avif'], ['MXP', 'Milan', 'milan.avif'], ['BKK', 'Bangkok', 'bangkok.avif']].map(([code, city, photo]) =>
        '<button type="button" class="ra-photo-card ra-destination" data-ra-book-destination="' + code + '">' + image(photo, city) + '<div><h2>' + city + '</h2><span class="ra-card-arrow" aria-hidden="true">&#8599;</span></div></button>').join('') +
      '</div></section>' + readout('discover-collage.avif', 'Experiences in Riyadh', 'Start with Riyadh', 'Take time to explore the capital before your next flight.', link('discover', 'Discover Riyadh'), true);
    if (page === 'experience') return hero('cabin.avif', 'Riyadh Air cabin', 'The Riyadh Air experience', 'Discover a new way to make the journey your own.') +
      readout('cabin.avif', 'Cabin interior', 'Your space in the sky', 'Explore cabin options when you search, then choose the fare that suits your journey.', book('RUH', 'Explore flights'), true) +
      readout('lounge.avif', 'Hafawa lounge interior', 'A warm welcome', 'Discover the setting of the Hafawa lounge and explore optional extras for your confirmed journey.', '<button class="ra-button" type="button" data-ra-action="manage">View your journey</button>') +
      readout('entertainment.avif', 'Onboard entertainment', 'Time well spent', 'Look forward to a journey with room to unwind. Browse the cabin and plan your next flight.', link('plan', 'Plan &amp; book'), true);
    const place = places[page];
    if (!place) throw new Error('This Riyadh page is not available.');
    return '<nav class="ra-explore-breadcrumb" aria-label="Breadcrumb">' + link('home', 'Home', '') + '<span aria-hidden="true">/</span>' +
      link('discover', 'Discover Riyadh', '') + '<span aria-hidden="true">/</span><span aria-current="page">' + place.title + '</span></nav>' +
      hero(place.image, place.title, place.title, '') +
      '<section class="ra-section ra-place-intro"><h2>Discover ' + place.title + '</h2><p>' + place.intro + '</p><p>' + place.detail + '</p>' +
      '<div class="ra-actions">' + book('RUH', 'Find flights to Riyadh') + link('discover', 'Back to Discover Riyadh', 'ra-text-button') + '</div></section>' +
      '<section class="ra-section"><div class="ra-section-heading"><h2>Keep exploring</h2></div><div class="ra-place-grid">' +
      Object.keys(places).filter((key) => key !== page).slice(0, 3).map(card).join('') + '</div></section>';
  }
  global.RiyadhAirExplore = Object.freeze({
    render, labels,
    has: (page) => ['plan', 'manage', 'cancellation', 'discover', 'destinations', 'experience'].includes(page) || Object.hasOwn(places, page),
    title: (page) => labels[page] || labels.home,
  });
})(window);
