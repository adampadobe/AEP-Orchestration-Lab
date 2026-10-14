(function (global) {
  'use strict';
  const airports = [
    ['LHR', 'London', 'United Kingdom', 'Heathrow Airport'],
    ['RUH', 'Riyadh', 'Saudi Arabia', 'King Khalid International Airport'],
    ['BKK', 'Bangkok', 'Thailand', 'Suvarnabhumi Airport'],
    ['CGK', 'Jakarta', 'Indonesia', 'Soekarno-Hatta International Airport'],
    ['MXP', 'Milan', 'Italy', 'Milan Malpensa Airport'],
  ];
  const destinationImages = { LHR: 'london', RUH: 'riyadh', CGK: 'jakarta', MXP: 'milan', BKK: 'bangkok' };
  const inventory = {
    LHR: { outbound: [1994, 2494, 10815], returning: [1638, 3057, 9897], fromRiyadh: ['03:15 – 07:30', '7 h 15 m', 'RX100'], toRiyadh: ['09:30 – 19:00', '6 h 30 m', 'RX101'] },
    CGK: { outbound: [1690, 2490, 7200], returning: [1390, 2190, 6800], fromRiyadh: ['16:00 – 04:30 (+1 day)', '8 h 30 m', 'RX200'], toRiyadh: ['08:00 – 12:45', '8 h 45 m', 'RX201'] },
    MXP: { outbound: [1840, 2640, 8400], returning: [1540, 2340, 7900], fromRiyadh: ['05:00 – 09:20', '6 h 20 m', 'RX300'], toRiyadh: ['11:20 – 19:30', '6 h 10 m', 'RX301'] },
    BKK: { outbound: [1790, 2590, 7800], returning: [1490, 2290, 7300], fromRiyadh: ['23:30 – 10:40 (+1 day)', '7 h 10 m', 'RX400'], toRiyadh: ['07:30 – 11:20', '7 h 50 m', 'RX401'] },
  };
  const cabins = ['Economy', 'Premium Economy', 'Business'];
  const bundles = ['Lite', 'Smart', 'Flex'];
  const byId = (id) => document.getElementById(id);
  const escape = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateValue = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const parseDate = (value) => new Date(value + 'T12:00:00');
  const today = () => dateValue(new Date());
  const dateLabel = (value, full) => value ? parseDate(value).toLocaleDateString('en-GB', full
    ? { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }
    : { day: '2-digit', month: 'short' }) : '';
  const city = (code) => (airports.find((airport) => airport[0] === code) || [code, code])[1];
  const money = (value) => 'SAR ' + new Intl.NumberFormat('en-GB').format(value);

  function routeInventory(search) {
    if (!search || search.origin === search.destination ||
      !destinationImages[search.origin] || !destinationImages[search.destination] ||
      search.origin !== 'RUH' && search.destination !== 'RUH') {
      throw new Error('Demo flights are available between Riyadh and London, Jakarta, Milan or Bangkok. Choose a route to or from RUH.');
    }
    return inventory[search.origin === 'RUH' ? search.destination : search.origin];
  }

  function fare(leg, cabin, bundle, search) {
    const index = cabins.indexOf(cabin);
    const route = search ? routeInventory(search) : inventory.LHR;
    const fromRiyadh = search ? (leg === 'outbound' ? search.origin === 'RUH' : search.destination === 'RUH') : leg === 'outbound';
    const base = (fromRiyadh ? route.outbound : route.returning)[index];
    const extra = (fromRiyadh ? [0, 171, 347] : [0, 150, 306])[bundles.indexOf(bundle)];
    if (!Number.isFinite(base) || !Number.isFinite(extra)) throw new Error('Choose an available cabin and bundle.');
    const travelDate = search && (leg === 'outbound' ? search.date : search.returnDate);
    const anchor = fromRiyadh ? '2026-11-01' : '2026-11-19';
    const destination = search && (search.origin === 'RUH' ? search.destination : search.origin) || 'LHR';
    // Reference dates retain the supplied fares; other dates use stable demo demand.
    function demand(value) {
      const date = parseDate(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || dateValue(date) !== value) throw new Error('Choose a valid travel date.');
      const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
      const routeSeed = [...destination].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const weekday = [8, -5, -9, -6, 0, 12, 16][date.getDay()];
      const season = [12, 4, 7, 3, 0, 8, 17, 19, -4, -2, 0, 22][date.getMonth()];
      const inventoryDemand = ((day * 13 + routeSeed) % 17) - 8;
      return weekday + season + inventoryDemand;
    }
    const multiplier = travelDate ? 1 + (demand(travelDate) - demand(anchor)) / 100 : 1;
    const cabinBundleMultiplier = [1, 1.45, 2.6][index];
    return Math.round((base + Math.round(extra * cabinBundleMultiplier)) * multiplier);
  }

  function choice(search, leg, cabin, bundle) {
    const returning = leg === 'return';
    const origin = returning ? search.destination : search.origin;
    const destination = returning ? search.origin : search.destination;
    const route = routeInventory(search);
    const schedule = origin === 'RUH' ? route.fromRiyadh : route.toRiyadh;
    return { origin, destination, date: returning ? search.returnDate : search.date, cabin, bundle,
      fare: fare(leg, cabin, bundle, search), flight: schedule[2], times: schedule[0], duration: schedule[1] };
  }

  function flightRow(selection) {
    return '<div class="ra-flight-row"><span class="ra-flight-logo"><img src="riyadh-air-assets/footer-logo.avif" alt="Riyadh Air"></span><div>' +
      escape(selection.times) + '<small>Riyadh Air</small></div><div>' + escape(selection.duration) + '<small>' +
      escape(selection.origin) + ' – ' + escape(selection.destination) + '</small></div><div>Nonstop</div></div>';
  }

  function selectedCard(selection, leg, editable) {
    return '<section class="ra-selected-leg"><h2>Flight to ' + escape(city(selection.destination)) +
      '</h2><p>Fares shown are for all guests</p><article class="ra-result-card">' + flightRow(selection) +
      '<div class="ra-selected-fare"><span>' + escape(selection.bundle) + ' <span class="ra-tag">x1</span> · ' +
      escape(selection.cabin) + ' · ' + dateLabel(selection.date) + '</span><strong>' + money(selection.fare) + '</strong>' +
      (editable ? '<button class="ra-text-button" type="button" data-ra-action="editFlight" data-leg="' + leg + '">Change ' + leg + ' flight</button>' : '') +
      '</div></article></section>';
  }

  function dateStrip(search, leg, disabled, selectedCabin) {
    const center = parseDate(leg === 'outbound' ? search.date : search.returnDate);
    const minimum = leg === 'outbound' ? today() : search.date;
    return '<div class="ra-date-strip" aria-label="' + leg + ' departure dates">' + [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
      const day = new Date(center);
      day.setDate(day.getDate() + offset);
      const value = dateValue(day);
      const daySearch = { ...search, [leg === 'outbound' ? 'date' : 'returnDate']: value };
      return '<button type="button" data-ra-action="flightDate" data-leg="' + leg + '" data-date="' + value +
        '" aria-pressed="' + (offset === 0) + '"' + (disabled || value < minimum ? ' disabled' : '') + '>' +
        day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
        '<small>From ' + money(fare(leg, selectedCabin, 'Lite', daySearch)) + '</small></button>';
    }).join('') + '</div>';
  }

  function results(search, trip, activeLeg, selectedCabin) {
    const outbound = trip && trip.outbound;
    let html = activeLeg === 'return' && outbound ? selectedCard(outbound, 'outbound', true) : '';
    const renderLeg = (leg, disabled) => {
      const candidate = choice(search, leg, selectedCabin, 'Lite');
      const points = leg === 'outbound' ? [1806, 1976, 2151] : [869, 1017, 1173];
      return '<section class="ra-results-leg' + (disabled ? ' ra-leg-locked' : '') + '" aria-label="' + leg + ' flights">' +
        '<h2>Flight to ' + escape(city(candidate.destination)) + '</h2><p>Fares shown are for all guests</p>' +
        (disabled ? '<p class="ra-lock-note">Choose your outbound flight to unlock return selection.</p>' : '') +
        dateStrip(search, leg, disabled, selectedCabin) + '<p>Showing 1 of 1 results</p><article class="ra-result-card"><span class="ra-tag">Recommended</span>' +
        flightRow(candidate) + '<div class="ra-flight-detail"><strong>' + money(candidate.fare) +
        '</strong><details><summary>Flight details</summary><p>' + escape(candidate.flight) + ' · ' + dateLabel(candidate.date, true) +
        '. Illustrative inventory, not a live airline offer.</p></details></div><hr><h3>Choose cabin</h3><div class="ra-cabin-options">' +
        cabins.map((cabin) => '<button type="button" data-ra-action="cabin" data-leg="' + leg + '" data-cabin="' + cabin +
          '" aria-pressed="' + (cabin === selectedCabin) + '"' + (disabled ? ' disabled' : '') + '><span>' +
          cabin + '</span><span>From ' + money(fare(leg, cabin, 'Lite', search)) + '</span></button>').join('') +
        '</div><h3>Choose bundle</h3><div class="ra-bundle-options">' + bundles.map((bundle, index) => {
          const benefits = [['Sfeer Points earned', points[index].toLocaleString('en-GB')], ['Level Points earned', points[index].toLocaleString('en-GB')],
            ['Checked bags', [25, 30, 35][index] + ' Kg'], ['Seat selection', index === 2 ? 'Standard Seat' : 'For a fee'],
            ['Flight change', 'Free'], ['Refundable', 'Fee applies'], ['Carry-on bag', '7 Kg'], ['Personal item', '5 Kg']];
          return '<section class="ra-bundle"><div class="ra-bundle-heading"><div><h4>' + bundle + '</h4><strong>' + money(fare(leg, selectedCabin, bundle, search)) +
            '</strong></div><button type="button" class="ra-outline-button" data-ra-action="select" data-leg="' + leg +
            '" data-bundle="' + bundle + '" aria-label="Select ' + leg + ' ' + bundle + '"' + (disabled ? ' disabled' : '') +
            '>Select</button></div><dl>' + benefits.map(([label, value], n) => '<dt>' + label + '</dt><dd>' +
              (n < 2 ? '<span class="ra-points-icon' + (n === 1 ? ' ra-level-icon' : '') + '" aria-hidden="true">' + (n === 1 ? '●' : '∞') + '</span> ' : '') +
              value + '</dd>').join('') + '</dl>' + (index === 1 ? '<span class="ra-tag">1GB eSIM</span>' : '') + '</section>';
        }).join('') + '</div></article></section>';
    };
    html += renderLeg(activeLeg, false);
    if (activeLeg === 'outbound' && search.returnDate) html += renderLeg('return', true);
    return html;
  }

  const value = (guest, name) => escape(guest && guest[name]);
  function guests(trip, guest, contact) {
    const selected = trip.outbound ? selectedCard(trip.outbound, 'outbound', true) +
      (trip.inbound ? selectedCard(trip.inbound, 'return', true) : '') : '';
    const adultFields = '<label>Title<select name="title" required><option value="">Select</option>' +
      ['Mr', 'Ms', 'Mrs', 'Mx'].map((title) => '<option' + (guest.title === title ? ' selected' : '') + '>' + title + '</option>').join('') +
      '</select></label><label>First name<input name="firstName" autocomplete="given-name" maxlength="60" required value="' + value(guest, 'firstName') +
      '" placeholder="Type here"></label><label>Last name<input name="lastName" autocomplete="family-name" maxlength="60" required value="' +
      value(guest, 'lastName') + '" placeholder="Type here"></label><label>Date of birth<input name="dob" type="date" max="' + today() +
      '" required value="' + value(guest, 'dob') + '"></label><div class="ra-form-wide ra-loyalty-fields"><h3>Loyalty program details (optional)</h3></div>' +
      '<label>Program<select name="program"><option value="">Select</option><option' + (guest.program === 'Sfeer' ? ' selected' : '') +
      '>Sfeer</option></select></label><label>Email<input name="loyaltyEmail" type="email" maxlength="254" value="' + value(guest, 'loyaltyEmail') +
      '" placeholder="Enter email"></label><div class="ra-guest-sfeer ra-form-wide"><div class="ra-sfeer-mark">·sfeer·</div><div><p>Explore Sfeer</p>' +
      '<label><input type="checkbox" name="joinSfeer"' + (guest.joinSfeer ? ' checked' : '') + '>Join Sfeer</label><small>No membership is created.</small></div></div>';
    const contactFields = '<label>Email address<input name="contactEmail" type="email" autocomplete="email" maxlength="254" required value="' +
      value(guest, 'contactEmail') + '"></label><label>Phone number<input name="phone" type="tel" autocomplete="tel" maxlength="30" required value="' +
      value(guest, 'phone') + '"></label>';
    return selected + '<h2>Guest details</h2><p class="ra-guest-intro">Enter guest details exactly as shown on the passport. Use demo details only.</p>' +
      '<div class="ra-guest-layout"><nav aria-label="Guest details sections"><button class="ra-guest-tab" type="button" data-ra-action="adult" aria-current="' +
      (contact ? 'false' : 'page') + '">Adult 1</button><button class="ra-guest-tab" type="button" data-ra-action="contact" aria-current="' +
      (contact ? 'page' : 'false') + '">Contact details</button></nav><section class="ra-guest-card"><p>Already a member? <button class="ra-text-button" type="button" data-ra-action="profile">Log in</button></p>' +
      '<form id="' + (contact ? 'raContactForm' : 'raPassengerForm') + '" class="ra-form">' + (contact ? contactFields : adultFields) +
      '<p class="ra-form-wide ra-demo-note">Details are retained only in this tab for the demo and cleared on reset. They are not sent to AEP, Sfeer or the airline. The selected Lab profile remains the event identity.</p>' +
      '<button class="ra-button ra-form-wide" type="submit">' + (contact ? 'Save guest details' : 'Continue to contact details') + ' →</button></form></section></div>';
  }

  function cart(trip, ready, total, guest) {
    if (!trip) return '<p>Your cart is empty.</p><button class="ra-button" type="button" data-ra-action="home">Find a flight</button>';
    const image = destinationImages[trip.destination];
    return '<div class="ra-cart-total"><div><p>Total for all guests</p><strong>' + money(total) +
      '</strong><p>All taxes included · illustrative fares</p></div><button class="ra-button" type="button" data-ra-action="checkout"' +
      (ready ? '' : ' disabled') + '>Check out now</button></div><div class="ra-cart-draft"><h3>' + (ready ? 'Cart items (1)' : 'Draft') + '</h3><article class="ra-cart-card">' +
      (image ? '<img src="riyadh-air-assets/' + image + '.avif" alt="' + escape(city(trip.destination)) + '">' : '<div class="ra-cart-city" aria-hidden="true">' + escape(trip.destination) + '</div>') +
      '<div><h2>' + escape(city(trip.destination)) + ' trip</h2><p>' + dateLabel(trip.date, true) +
      (trip.returnDate ? ' – ' + dateLabel(trip.returnDate, true) : '') + '</p><p class="' + (ready ? '' : 'ra-error') + '">' +
      (ready ? '<span class="ra-tag">' + escape(guest.title) + '</span> Guest details complete' : 'Guest details required') + '</p></div><strong>' + money(total) +
      '</strong><div class="ra-actions"><button class="ra-text-button" type="button" data-ra-action="removeTrip">Remove</button>' +
      '<button class="ra-outline-button" type="button" data-ra-action="adult">' + (ready ? 'Edit' : 'Add') + ' guest details</button></div></article></div>';
  }

  function destinationHeader(trip) {
    const image = destinationImages[trip.destination];
    return '<div class="ra-destination-summary">' + (image ? '<img src="riyadh-air-assets/' + image + '.avif" alt="' + escape(city(trip.destination)) + '">' : '') +
      '<div><h2>' + escape(city(trip.destination)) + ' trip</h2><p>' + escape(trip.origin) + ' → ' + escape(trip.destination) +
      ' · ' + dateLabel(trip.date, true) + (trip.returnDate ? ' – ' + dateLabel(trip.returnDate, true) : '') +
      '</p><p>Booking reference: <strong>' + escape(trip.reference) + '</strong></p></div></div>';
  }

  function setupControls(onChange) {
    let airportField = 'origin';
    let calendarField = 'departure';
    let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let opener = null;
    const booking = byId('raBooking');
    const airportPicker = byId('raAirportPicker');
    const calendar = byId('raCalendar');
    for (const field of ['raOrigin', 'raDestination']) {
      byId(field).innerHTML = airports.map(([code, name]) => '<option value="' + code + '">' + code + ' - ' + name + '</option>').join('');
    }
    byId('raOrigin').value = 'LHR';
    byId('raDestination').value = 'RUH';
    function update() {
      byId('raOriginButton').textContent = byId('raOrigin').value + ' - ' + city(byId('raOrigin').value);
      byId('raDestinationButton').textContent = byId('raDestination').value + ' - ' + city(byId('raDestination').value);
      byId('raDepartureButton').textContent = dateLabel(byId('raDeparture').value) || 'Departure';
      byId('raReturnButton').textContent = dateLabel(byId('raReturn').value) || 'Add return';
      booking.querySelectorAll('[data-ra-clear-date]').forEach((button) => {
        button.hidden = !byId(button.dataset.raClearDate === 'departure' ? 'raDeparture' : 'raReturn').value;
      });
    }
    function close(focus) {
      airportPicker.hidden = calendar.hidden = true;
      booking.querySelectorAll('[aria-expanded]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
      if (focus && opener) opener.focus();
    }
    function airportsList() {
      const query = byId('raAirportSearch').value.trim().toLowerCase();
      const matches = airports.filter((airport) => airport.join(' ').toLowerCase().includes(query));
      byId('raAirportOptions').innerHTML = matches.length ? matches.map(([code, name, country, airport]) =>
        '<button type="button" data-ra-airport="' + code + '"><span>' + airport + '<small>' + name + ' - ' + country +
        '</small></span><strong>' + code + '</strong></button>').join('') : '<p>No airports match your search.</p>';
    }
    function renderCalendar(focusDate) {
      const departure = byId('raDeparture').value;
      const returning = byId('raReturn').value;
      let html = '<div class="ra-calendar-nav"><button type="button" data-ra-month="-1" aria-label="Previous month"' +
        (calendarMonth <= new Date(new Date().getFullYear(), new Date().getMonth(), 1) ? ' disabled' : '') +
        '>‹</button><span>Select departure, then return (optional)</span><button type="button" data-ra-month="1" aria-label="Next month">›</button></div><div class="ra-calendar-months">';
      for (let offset = 0; offset < 2; offset++) {
        const month = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
        html += '<section><h3>' + month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) +
          '</h3><div class="ra-calendar-grid">' + ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => '<span>' + day + '</span>').join('');
        html += '<span class="ra-calendar-spacer" style="grid-column: span ' + (month.getDay() || 1) + '"' + (month.getDay() ? '' : ' hidden') + '></span>';
        for (let day = 1; day <= new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); day++) {
          const value = dateValue(new Date(month.getFullYear(), month.getMonth(), day));
          const selected = value === departure || value === returning;
          html += '<button type="button" data-ra-day="' + value + '" aria-label="' + dateLabel(value, true) +
            '" aria-pressed="' + selected + '" class="' + (selected ? 'ra-date-endpoint' : departure && returning && value > departure && value < returning ? 'ra-date-in-range' : '') +
            '"' + (value < today() || calendarField === 'return' && departure && value < departure ? ' disabled' : '') + '>' + day + '</button>';
        }
        html += '</div></section>';
      }
      calendar.innerHTML = html + '</div><div class="ra-calendar-actions"><button class="ra-text-button" type="button" data-ra-one-way>One way</button>' +
        '<button class="ra-button" type="button" data-ra-done' + (!departure ? ' disabled' : '') + '>Done</button></div>';
      if (focusDate) {
        const button = calendar.querySelector('[data-ra-day="' + focusDate + '"]:not(:disabled)');
        if (button) button.focus();
      }
    }
    booking.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.raPicker) {
        close(false);
        opener = button;
        airportField = button.dataset.raPicker;
        airportPicker.hidden = false;
        airportPicker.dataset.field = airportField;
        button.setAttribute('aria-expanded', 'true');
        byId('raAirportSearch').value = '';
        airportsList();
        byId('raAirportSearch').focus();
      } else if (button.dataset.raAirport) {
        byId(airportField === 'origin' ? 'raOrigin' : 'raDestination').value = button.dataset.raAirport;
        update(); onChange(); close(true);
      } else if (button.dataset.raCalendar) {
        close(false);
        opener = button;
        calendarField = button.dataset.raCalendar;
        const selected = byId(calendarField === 'departure' ? 'raDeparture' : 'raReturn').value;
        const day = selected ? parseDate(selected) : new Date();
        calendarMonth = new Date(day.getFullYear(), day.getMonth(), 1);
        calendar.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        renderCalendar(selected || today());
        if (!calendar.contains(document.activeElement)) calendar.querySelector('button:not(:disabled)').focus();
      } else if (button.dataset.raDay) {
        const value = button.dataset.raDay;
        if (calendarField === 'departure' || !byId('raDeparture').value) {
          byId('raDeparture').value = value;
          if (byId('raReturn').value && byId('raReturn').value < value) byId('raReturn').value = '';
          calendarField = 'return';
        } else byId('raReturn').value = value;
        update(); onChange(); renderCalendar(value);
      } else if (button.dataset.raMonth) {
        calendarMonth.setMonth(calendarMonth.getMonth() + Number(button.dataset.raMonth));
        renderCalendar();
        calendar.querySelector('[data-ra-month="' + button.dataset.raMonth + '"]').focus();
      } else if (button.hasAttribute('data-ra-one-way')) {
        byId('raReturn').value = '';
        update(); onChange(); close(true);
      } else if (button.hasAttribute('data-ra-done') || button.hasAttribute('data-ra-close-picker')) close(true);
      else if (button.dataset.raClearDate) {
        byId(button.dataset.raClearDate === 'departure' ? 'raDeparture' : 'raReturn').value = '';
        update(); onChange();
      } else if (button.id === 'raSwapAirports') {
        const origin = byId('raOrigin').value;
        byId('raOrigin').value = byId('raDestination').value;
        byId('raDestination').value = origin;
        update(); onChange();
      }
    });
    byId('raAirportSearch').addEventListener('input', airportsList);
    booking.addEventListener('change', () => { update(); onChange(); });
    document.addEventListener('pointerdown', (event) => { if (!booking.contains(event.target)) close(false); });
    booking.addEventListener('focusout', () => {
      setTimeout(() => { if (!booking.contains(document.activeElement)) close(false); }, 0);
    });
    booking.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (!airportPicker.hidden && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const options = [byId('raAirportSearch'), ...airportPicker.querySelectorAll('[data-ra-airport]')];
        const index = options.indexOf(document.activeElement);
        options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
      }
      if (!calendar.hidden && event.target.dataset.raDay && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const day = parseDate(event.target.dataset.raDay);
        day.setDate(day.getDate() + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]));
        if (dateValue(day) < today() || calendarField === 'return' && dateValue(day) < byId('raDeparture').value) return;
        if (day < calendarMonth || day >= new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 2, 1)) {
          calendarMonth = new Date(day.getFullYear(), day.getMonth(), 1);
        }
        renderCalendar(dateValue(day));
      }
    });
    update();
    return { update, close, read: () => ({ origin: byId('raOrigin').value, destination: byId('raDestination').value,
      date: byId('raDeparture').value, returnDate: byId('raReturn').value, cabin: byId('raCabin').value }),
    restore: (search) => {
      if (!search) return;
      byId('raOrigin').value = search.origin;
      byId('raDestination').value = search.destination;
      byId('raDeparture').value = search.date;
      byId('raReturn').value = search.returnDate || '';
      byId('raCabin').value = search.cabin;
      update();
    } };
  }
  global.RiyadhAirBooking = Object.freeze({ city, money, fare, choice, results, guests, cart, selectedCard, setupControls, today, routeInventory, destinationHeader });
})(window);
