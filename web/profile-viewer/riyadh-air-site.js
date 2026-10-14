(function (global) {
  'use strict';
  const lab = global.RiyadhAirLab;
  const booking = global.RiyadhAirBooking;
  const byId = (id) => document.getElementById(id);
  const site = byId('raCustomerSite');
  const content = byId('raJourneyContent');
  const titles = { results: 'Choose your flight', return: 'Choose your return flight', passenger: 'Guest details', contact: 'Contact details', cart: 'Your cart', extras: 'Make it your journey', payment: 'Review your booking', trip: 'Your journey, at a glance', upgrade: 'A little more extraordinary.' };
  const airportNames = { LHR: 'London', RUH: 'Riyadh', DXB: 'Dubai', CDG: 'Paris', CGK: 'Jakarta', MXP: 'Milan', BKK: 'Bangkok' };
  const features = {
    cabin: ['Cabin interiors', 'Explore your seat and cabin options in the booking flow. A confirmed Economy booking also lets you browse an illustrative Business upgrade.'],
    entertainment: ['In-flight entertainment', 'Discover the onboard setting in the supplied cabin imagery. Entertainment selection is not part of this demo booking.'],
    lounge: ['Hafawa lounge', 'Add illustrative lounge access in the extras step of your booking. No airport admission is issued by this demo.'],
    fleet: ['Fleet', 'Explore Riyadh Air aircraft imagery, then plan an illustrative flight using the booking bar. Schedules are demo data, not live airline inventory.'],
    cargo: ['Riyadh Cargo', 'This section introduces the cargo service visually. Cargo quotes, bookings and shipment tracking are not connected in this customer demo.'],
    visa: ['Visa information', 'Requirements vary by nationality and purpose of travel. Consult the official Saudi visa service before travelling; this demo does not assess eligibility or collect documents.'],
  };
  let owner = '';
  let trip = null;
  let search = null;
  let step = 'home';
  let busy = false;
  let guest = {};
  let cabin = 'Economy';
  let restored = false;
  const controls = booking.setupControls(() => {});
  const price = (value) => trip && !trip.outbound
    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value)
    : booking.money(value);
  const escape = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const total = () => trip.outbound ? trip.outbound.fare + (trip.inbound ? trip.inbound.fare : 0) : trip.fare;
  const ancillaryTotal = () => (trip.pendingSeat ? trip.pendingSeat.price : 0) + (trip.pendingBag ? 250 : 0) + (trip.pendingLounge ? 300 : 0);
  const guestsComplete = () => !!(guest.adultComplete && guest.contactComplete);

  function save() {
    try {
      global.sessionStorage.setItem('riyadhAirJourneyV1', JSON.stringify({ owner, trip, search, step, guest, cabin }));
    } catch (error) {
      lab.message('This browser cannot retain the local demo trip across reloads: ' + error.message, true);
    }
  }

  function syncOwner() {
    let nextOwner;
    try { nextOwner = lab.ownerKey(); } catch { nextOwner = ''; }
    if (nextOwner === owner) return;
    owner = nextOwner;
    restored = false;
    trip = null;
    search = null;
    guest = {};
    step = 'home';
    try {
      const raw = global.sessionStorage.getItem('riyadhAirJourneyV1');
      const saved = raw ? JSON.parse(raw) : null;
      if (owner && saved && saved.owner === owner) {
        trip = saved.trip;
        search = saved.search;
        guest = saved.guest || {};
        cabin = saved.cabin || 'Economy';
        const requested = new URL(global.location.href).searchParams.get('step') || saved.step;
        step = validStep(requested);
        controls.restore(search);
        restored = true;
      }
    } catch (error) {
      lab.message('Stored demo trip could not be restored: ' + error.message + '. Use Reset local trip.', true);
    }
    byId('raTriggerDisruption').disabled = !trip || !trip.booked;
    render();
    if (restored) route(step, true);
  }

  function validStep(next) {
    const requestedBooking = new URL(global.location.href).searchParams.get('booking');
    if (requestedBooking && (!trip || requestedBooking !== trip.reference)) {
      lab.message('This booking link does not match the selected identity’s stored demo booking. Resolve the original profile in this tab or start a new booking.', true);
      return 'home';
    }
    if (trip && trip.booked && ['results', 'return', 'passenger', 'contact', 'cart', 'payment'].includes(next)) return 'trip';
    if (next === 'home' || next === 'cart') return next;
    if (!Object.hasOwn(titles, next)) return 'home';
    if (next === 'results') return search ? next : 'home';
    if (next === 'return') return search && search.returnDate && trip && trip.outbound ? next : search ? 'results' : 'home';
    if (!trip) return search ? 'results' : 'home';
    if (trip.outbound && trip.returnDate && !trip.inbound) return 'return';
    if (next === 'payment' && trip.outbound && !guestsComplete()) return 'passenger';
    if (next === 'payment' && trip.booked) return 'trip';
    if (next === 'extras' && !trip.booked) return 'cart';
    if (['trip', 'upgrade'].includes(next) && !trip.booked) return 'cart';
    if (next === 'upgrade' && trip.disruption) return 'trip';
    if (next === 'extras' && trip.disruption) return 'trip';
    return next;
  }

  function route(next, replace) {
    const url = new URL(global.location.href);
    url.searchParams.set('step', next);
    if (trip && trip.booked) url.searchParams.set('booking', trip.reference);
    else url.searchParams.delete('booking');
    if (next === 'extras') url.searchParams.set('offer', 'extra-legroom-outbound');
    else url.searchParams.delete('offer');
    url.hash = '';
    global.history[replace ? 'replaceState' : 'pushState']({ riyadhStep: next }, '', url);
  }

  function navigate(next, replace) {
    controls.close(false);
    step = validStep(next);
    route(step, replace);
    render();
    save();
    if (next !== 'home') {
      byId('raJourneyTitle').focus();
      byId('raJourney').scrollIntoView({ block: 'start' });
    }
  }

  function summary() {
    if (trip.outbound) return booking.selectedCard(trip.outbound, 'outbound', !trip.booked) +
      (trip.inbound ? booking.selectedCard(trip.inbound, 'return', !trip.booked) : '');
    return '<div class="ra-trip-summary"><div><h2>' + escape(airportNames[trip.origin] || trip.origin) + ' &rarr; ' + escape(airportNames[trip.destination] || trip.destination) + '</h2><p>' +
      escape(trip.date) + ' &middot; ' + escape(trip.flight) + ' &middot; ' + escape(trip.cabin) +
      '</p></div><div><small>Booking reference</small><p class="ra-reference">' + escape(trip.reference) + '</p></div></div>';
  }

  function render() {
    lab.previewTrip(trip && trip.booked ? trip : null);
    const bookingPage = ['results', 'return', 'passenger', 'contact'].includes(step);
    site.dataset.bookingPage = String(bookingPage);
    site.dataset.referencePage = String(bookingPage || step === 'cart');
    byId('raBooking').hidden = !(bookingPage || step === 'home');
    byId('raCartCount').textContent = trip ? '1' : '0';
    site.dataset.care = String(!!(trip && trip.disruption));
    byId('raHome').hidden = step !== 'home';
    byId('raJourney').hidden = step === 'home';
    byId('raTriggerDisruption').disabled = busy || !trip || !trip.booked;
    byId('raTravelUpdateCopy').textContent = trip && trip.disruption
      ? careCopy() : 'Planning your journey? View your booking for departure details and the latest updates.';
    if (step === 'home') return;
    byId('raJourneyTitle').textContent = titles[step];
    document.querySelectorAll('[data-ra-step]').forEach((item) => {
      if (item.dataset.raStep === step || (step === 'upgrade' && item.dataset.raStep === 'trip') ||
        (step === 'return' && item.dataset.raStep === 'results') || (step === 'contact' && item.dataset.raStep === 'passenger')) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    if (step === 'results' || step === 'return') {
      content.innerHTML = booking.results(search, trip, step === 'return' ? 'return' : 'outbound', cabin);
    } else if (step === 'passenger' || step === 'contact') {
      content.innerHTML = booking.guests(trip, guest, step === 'contact');
    } else if (step === 'cart') {
      content.innerHTML = booking.cart(trip, guestsComplete(), trip ? total() : 0, guest);
    } else if (step === 'extras') {
      const seats = ['14A', '14B', '14C', '', '14D', '14E', '14F', '15A', '15B', '15C', '', '15D', '15E', '15F', '16A', '16B', '16C', '', '16D', '16E', '16F'];
      const pending = trip.pendingSeat;
      content.innerHTML = summary() + '<p class="ra-demo-note">Illustrative seat layout, adapted from the Lab Etihad seat interaction. No real seat assignment or payment is made.</p>' +
        '<div class="ra-seat-layout"><section class="ra-seat-map-card"><h2>Choose your outbound seat</h2><p>' +
        (trip.outbound && trip.outbound.bundle === 'Flex' ? 'Your Flex fare includes a standard-seat entitlement. Extra-legroom and preferred tiers are optional paid upgrades.' : 'Optional paid seat tiers are shown below. Your flight remains confirmed without one.') +
        '</p><div class="ra-seat-legend"><span>Row 14: Extra legroom · SAR 180</span><span>Rows 15–16: Preferred · SAR 120</span><span>15B / 16E: Unavailable</span></div>' +
        '<div class="ra-seat-picker" role="group" aria-label="Choose your seat">' +
        seats.map((seat) => seat ? '<button type="button" data-ra-action="seat" data-seat="' + seat + '" aria-label="Seat ' + seat +
          '" aria-pressed="' + !!(pending && pending.seat === seat) + '"' + (['15B', '16E'].includes(seat) ? ' disabled' : '') +
          '>' + seat + '</button>' : '<span aria-hidden="true"></span>').join('') +
        '</div><p>Front of aircraft ↑ · Concept layout, not an airline seat map</p></section><aside class="ra-seat-offer"><h2>' +
        (pending ? 'Seat ' + escape(pending.seat) : 'Your seat offer') + '</h2><p>' +
        (pending ? escape(pending.tier) + ' · ' + escape(pending.position) + ' · outbound flight' : 'Select a seat to see its price and benefits.') +
        '</p>' + (pending ? '<h3>' + booking.money(pending.price) + '</h3><p>' +
        (pending.tier === 'Extra legroom' ? 'More space to stretch out in the illustrative forward row.' : 'A preferred location closer to the front of the illustrative cabin.') +
        '</p><p class="ra-error">Not purchased or assigned</p>' : '') +
        '<div class="ra-extra-options"><label><input id="raBag" type="checkbox"' + (trip.pendingBag ? ' checked' : '') +
        '>Extra 23 kg bag · SAR 250</label><label><input id="raLounge" type="checkbox"' + (trip.pendingLounge ? ' checked' : '') +
        '>Lounge access · SAR 300</label></div><p id="raAncillarySubtotal">Ancillary subtotal: ' + booking.money(ancillaryTotal()) +
        '</p><p>Confirmed flight amount: ' + price(trip.paidAmount === undefined ? total() : trip.paidAmount) +
        ' (unchanged)</p><div class="ra-actions"><button class="ra-button" type="button" data-ra-action="ancillaryIntent">Save paid-seat interest</button>' +
        '<button type="button" class="ra-text-button" data-ra-action="skipExtras">Continue without paid seat or extras</button></div><p>' +
        (trip.ancillaryAbandoned ? 'This offer was left without purchase. Your booking remains confirmed.' : 'Selections are tentative. No ancillary checkout is connected.') +
        '</p></aside></div>';
    } else if (step === 'payment') {
      content.innerHTML = booking.destinationHeader(trip) + summary() + '<h2>Your booking summary</h2><dl class="ra-review"><dt>Flights</dt><dd>' + price(trip.fare) +
        '</dd><dt>Paid seat / ancillaries</dt><dd>Not purchased · explore after booking</dd>' +
        '<dt><strong>Total</strong></dt><dd><strong>' + price(total()) + '</strong></dd></dl>' +
        '<form id="raPaymentForm"><label class="ra-payment-consent"><input type="checkbox" required>I understand this is a demo booking. No payment details are collected and no ticket is issued.</label>' +
        '<div class="ra-actions"><button type="submit" class="ra-button">Confirm demo booking &#8594;</button><button type="button" class="ra-text-button" data-ra-action="cart">Back to cart</button></div></form>';
    } else if (step === 'trip') {
      content.innerHTML = '<p>' + (trip.booked ? 'Your demo booking is confirmed.' : 'Your booking is not yet confirmed.') + '</p>' + booking.destinationHeader(trip) + summary() +
        (trip.disruption ? '<section class="ra-care" role="status"><h2>We are here for your journey.</h2><p>' + escape(careCopy()) +
          '</p><p>Please check the airport departure boards. Our team will help with your onward journey.</p></section>' :
          '<p>Trip status: On time (illustrative) &middot; Gate A08 &middot; ' + escape(trip.outbound ? trip.outbound.times : trip.index ? '18:20' : '10:30') + '</p>') +
        '<p>Booking reference: <strong class="ra-reference">' + escape(trip.reference) + '</strong></p>' +
        '<dl class="ra-review"><dt>Confirmed flight amount</dt><dd id="raPaidAmount">' + price(trip.paidAmount === undefined ? total() : trip.paidAmount) +
        '</dd><dt>Seat assignment</dt><dd>' + escape(trip.seat || 'No paid seat purchased or assigned') + '</dd><dt>Standard-seat entitlement</dt><dd>' +
        (trip.outbound && trip.outbound.bundle === 'Flex' ? 'Included with outbound Flex; not an assignment' : 'Subject to selected fare') + '</dd><dt>Extra bag</dt><dd>' +
        (trip.bag ? '23 kg' : 'None') + '</dd><dt>Lounge</dt><dd>' + (trip.lounge ? 'Selected' : 'Not selected') +
        '</dd></dl>' +
        '<div class="ra-actions">' + (!trip.disruption && trip.booked ? '<button type="button" class="ra-button" data-ra-action="openExtras">Choose seats and extras</button>' : '') +
        (!trip.disruption && trip.booked && trip.cabin !== 'Business' ? '<button type="button" class="ra-outline-button" data-ra-action="upgrade">Explore a cabin upgrade &#8599;</button>' : '') +
        '<button type="button" class="ra-text-button" data-ra-action="profile">View profile and activity &#8599;</button></div>';
    } else if (step === 'upgrade') {
      content.innerHTML = summary() + '<section class="ra-experience"><img class="ra-upgrade-photo" src="riyadh-air-assets/cabin.avif" alt="Riyadh Air cabin interior">' +
        '<div><h2>More space.<br>More possibility.</h2><p>Explore Business comfort for your journey. Illustrative upgrade: ' + price(420) +
        '. This website records your interest, not an upgrade purchase.</p><div class="ra-actions"><button class="ra-button" type="button" data-ra-action="upgradeIntent">I am interested &#8594;</button>' +
        '<button class="ra-text-button" type="button" data-ra-action="abandon">Not now &mdash; return to my trip</button></div><p id="raUpgradeNote">' +
        (trip.upgradeIntent ? 'Your interest was submitted. Your booking is unchanged.' : '') + '</p></div></section>';
    }
  }

  function careCopy() {
    if (!trip || !trip.disruption) return '';
    return trip.disruption.kind === 'delay'
      ? trip.flight + ' is delayed by ' + trip.disruption.delayMinutes + ' minutes. Your booking ' + trip.reference + ' is now in customer-care mode on this website.'
      : trip.flight + ' now departs from gate ' + trip.disruption.gate + '. Please proceed to the new gate for booking ' + trip.reference + '.';
  }

  async function actionTask(task) {
    if (busy) return;
    busy = true;
    site.setAttribute('aria-busy', 'true');
    const buttons = [...site.querySelectorAll('button'), byId('raTriggerDisruption')];
    const previouslyDisabled = buttons.map((button) => button.disabled);
    buttons.forEach((button) => { button.disabled = true; });
    try { await task(); } catch (error) {
      lab.reportError(error);
      if (step === 'extras') render();
    }
    finally {
      busy = false;
      site.removeAttribute('aria-busy');
      buttons.forEach((button, index) => { if (button.isConnected) button.disabled = previouslyDisabled[index]; });
      byId('raTriggerDisruption').disabled = !trip || !trip.booked;
    }
  }

  async function abandonUpgrade() {
    if (step === 'extras' && trip && !trip.disruption && (trip.pendingSeat || trip.pendingBag || trip.pendingLounge) && !trip.ancillaryAbandoned) {
      await lab.send('ancillaryAbandon', trip, ancillaryContext());
      trip.ancillaryAbandoned = true;
      save();
    }
    if (step !== 'upgrade' || !trip || trip.disruption || trip.upgradeAbandoned) return;
    await lab.send('abandon', trip);
    trip.upgradeAbandoned = true;
    save();
  }

  function ancillaryContext() {
    return { offer: 'paid-seat', seat: trip.pendingSeat && trip.pendingSeat.seat, seatTier: trip.pendingSeat && trip.pendingSeat.tier,
      amount: ancillaryTotal(), currency: 'SAR', bag: !!trip.pendingBag, lounge: !!trip.pendingLounge, leg: 'outbound' };
  }

  async function manage() {
    if (!trip || !trip.booked) throw new Error('There is no confirmed booking for this identity in this tab. Book a flight first.');
    await abandonUpgrade();
    await lab.send('manage', trip);
    navigate('trip');
  }

  async function openProfile() {
    const button = byId('queryProfileBtn');
    if (byId('customerEmail').value.trim()) {
      await lab.lookup();
      await global.DemoProfileDrawer.openDrawerAndLoad();
      return;
    }
    if (global.EnvBarCompact) global.EnvBarCompact.openOverlay();
    button.scrollIntoView({ block: 'center' });
    button.focus();
  }

  site.addEventListener('click', (event) => {
    const originLink = event.target.closest('[data-ra-origin]');
    if (originLink) byId('raOrigin').value = originLink.dataset.raOrigin;
    const destinationLink = event.target.closest('[data-ra-destination]');
    if (destinationLink) {
      byId('raOrigin').value = 'RUH';
      byId('raDestination').value = destinationLink.dataset.raDestination;
    }
    if (originLink || destinationLink) controls.update();
    const feature = event.target.closest('[data-ra-feature]');
    if (feature) {
      void actionTask(async () => {
        const detail = features[feature.dataset.raFeature];
        if (!detail) throw new Error('This experience is not available.');
        await abandonUpgrade();
        navigate('home');
        byId('raFeatureTitle').textContent = detail[0];
        byId('raFeatureCopy').textContent = detail[1];
        byId('raFeatureDetail').hidden = false;
        byId('raFeatureTitle').focus();
        byId('raFeatureDetail').scrollIntoView({ block: 'start' });
      });
      return;
    }
    const trigger = event.target.closest('[data-ra-action]');
    if (!trigger) {
      const link = event.target.closest('a[href^="#"]');
      if (link && step !== 'home') {
        event.preventDefault();
        void actionTask(async () => {
          await abandonUpgrade();
          navigate('home');
          const destination = document.getElementById(link.hash.slice(1));
          if (destination) destination.scrollIntoView({ block: 'start' });
        });
      }
      return;
    }
    void actionTask(async () => {
      const action = trigger.dataset.raAction;
      if (action === 'profile') return openProfile();
      if (action === 'home') { await abandonUpgrade(); navigate('home'); return; }
      if (action === 'manage') return manage();
      if (action === 'cart') { await abandonUpgrade(); navigate(trip && trip.booked ? 'trip' : 'cart'); return; }
      if (action === 'adult' || action === 'contact') {
        if (!trip) throw new Error('Choose your flights first.');
        navigate(action === 'adult' ? 'passenger' : 'contact');
        return;
      }
      if (action === 'checkout') {
        if (!trip || !guestsComplete()) throw new Error('Complete guest and contact details before checkout.');
        navigate('payment');
        return;
      }
      if (action === 'removeTrip') {
        trip = null; guest = {}; navigate('cart'); return;
      }
      if (action === 'cabin') { cabin = trigger.dataset.cabin; render(); save(); return; }
      if (action === 'editFlight') {
        if (!trip || trip.booked) throw new Error('Confirmed flights cannot be edited in this demo.');
        cabin = (trigger.dataset.leg === 'return' ? trip.inbound : trip.outbound).cabin;
        navigate(trigger.dataset.leg === 'return' ? 'return' : 'results');
        return;
      }
      if (action === 'flightDate') {
        if (trip && trip.booked) throw new Error('Reset the local trip before starting another booking.');
        const returning = trigger.dataset.leg === 'return';
        const candidate = { ...search, [returning ? 'returnDate' : 'date']: trigger.dataset.date };
        if (candidate.returnDate && candidate.returnDate < candidate.date) throw new Error('Return must be on or after departure.');
        await lab.send('search', candidate);
        search = candidate;
        if (trip) {
          if (returning) { trip.returnDate = candidate.returnDate; trip.inbound = null; trip.fare = trip.outbound.fare; }
          else trip = null;
        }
        controls.restore(search);
        navigate(returning ? 'return' : 'results', true);
        return;
      }
      if (action === 'select') {
        if (!search) throw new Error('Search for a flight first.');
        if (trip && trip.booked) throw new Error('Reset the local trip before starting another booking.');
        const returning = trigger.dataset.leg === 'return';
        if (returning && (!trip || !trip.outbound)) throw new Error('Choose your outbound flight first.');
        const selection = booking.choice(search, returning ? 'return' : 'outbound', cabin, trigger.dataset.bundle);
        const candidate = returning ? { ...trip, inbound: selection, fare: trip.outbound.fare + selection.fare } :
          { ...search, index: 0, flight: selection.flight, cabin: selection.cabin,
            reference: trip && trip.reference || 'RA' + global.crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
            outbound: selection, inbound: trip && trip.inbound || null, fare: selection.fare + (trip && trip.inbound ? trip.inbound.fare : 0),
            seat: '', bag: false, lounge: false, booked: false };
        await lab.send('select', { ...candidate, ...selection }, { leg: returning ? 'return' : 'outbound', bundle: selection.bundle, amount: selection.fare, currency: 'SAR' });
        trip = candidate;
        const profile = lab.profile();
        if (!guest.firstName) guest.firstName = profile && profile.firstName || '';
        if (!guest.lastName) guest.lastName = profile && profile.lastName || '';
        cabin = search.cabin;
        navigate(!returning && search.returnDate ? 'return' : 'passenger');
        return;
      }
      if (!trip) throw new Error('Select a flight first.');
      if (action === 'seat') {
        if (!trip.booked || trip.disruption) throw new Error('Paid seats require a confirmed, undisrupted booking.');
        const seat = trigger.dataset.seat;
        if (!/^(14|15|16)[A-F]$/.test(seat) || ['15B', '16E'].includes(seat)) throw new Error('Choose an available seat.');
        if (trip.pendingSeat && trip.pendingSeat.seat === seat) return;
        const extraLegroom = seat.startsWith('14');
        const selection = { seat, tier: extraLegroom ? 'Extra legroom' : 'Preferred', price: extraLegroom ? 180 : 120,
          position: ['A', 'F'].includes(seat.slice(-1)) ? 'Window' : ['C', 'D'].includes(seat.slice(-1)) ? 'Aisle' : 'Middle' };
        await lab.send('extras', trip, { offer: 'paid-seat', seat, seatTier: selection.tier, amount: selection.price, currency: 'SAR', leg: 'outbound' });
        trip.pendingSeat = selection;
        trip.ancillaryAbandoned = false;
        trip.ancillaryIntent = false;
        render(); save();
      } else if (action === 'skipExtras') {
        await abandonUpgrade();
        navigate('trip');
      } else if (action === 'ancillaryIntent') {
        if (!trip.pendingSeat && !trip.pendingBag && !trip.pendingLounge) throw new Error('Select a seat or ancillary first.');
        if (trip.ancillaryIntent) throw new Error('Interest is already recorded for this selection.');
        await lab.send('ancillaryIntent', trip, ancillaryContext());
        trip.ancillaryIntent = true;
        save();
      } else if (action === 'openExtras') {
        if (!trip.booked || trip.disruption) throw new Error('Paid seats require a confirmed, undisrupted booking.');
        await lab.send('ancillaryView', trip, { offer: 'paid-seat', currency: 'SAR', leg: 'outbound' });
        navigate('extras');
      } else if (action === 'upgrade') {
        if (trip.disruption) throw new Error('Customer care is active for this trip.');
        await lab.send('upgradeView', trip);
        navigate('upgrade');
      } else if (action === 'upgradeIntent') {
        if (trip.upgradeIntent) throw new Error('Upgrade interest is already recorded for this booking.');
        await lab.send('upgradeIntent', trip);
        trip.upgradeIntent = true;
        save();
        byId('raUpgradeNote').textContent = 'Your interest was submitted. Your booking is unchanged.';
      } else if (action === 'abandon') {
        await abandonUpgrade();
        navigate('trip');
      }
    });
  });

  site.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    if (form.hasAttribute('data-ra-local-form')) {
      form.reset();
      form.querySelector('.ra-form-result').textContent = 'Demo form completed locally. No data was stored or sent, and no subscription was created.';
      return;
    }
    void actionTask(async () => {
      if (form.id === 'raSearchForm') {
        const candidate = controls.read();
        if (!candidate.date || candidate.date < booking.today()) throw new Error('Choose today or a future departure date.');
        if (candidate.returnDate && candidate.returnDate < candidate.date) throw new Error('Return must be on or after departure.');
        if (trip && trip.booked) throw new Error('Reset the local trip before starting another booking.');
        if (candidate.origin === candidate.destination) throw new Error('Choose different departure and arrival airports.');
        booking.routeInventory(candidate);
        await lab.send('search', candidate);
        search = candidate;
        trip = null;
        guest = {};
        cabin = candidate.cabin;
        navigate('results');
      } else if (form.id === 'raPassengerForm') {
        const fields = new FormData(form);
        if (!String(fields.get('firstName')).trim() || !String(fields.get('lastName')).trim()) throw new Error('Enter the passenger first and last name.');
        const dob = fields.get('dob');
        const oldestAdult = new Date(trip.date + 'T12:00:00');
        oldestAdult.setFullYear(oldestAdult.getFullYear() - 12);
        if (!dob || dob > oldestAdult.toISOString().slice(0, 10)) throw new Error('Adult 1 must be at least 12 on departure. Use illustrative guest details.');
        guest = { ...guest, ...Object.fromEntries(fields), firstName: String(fields.get('firstName')).trim(),
          lastName: String(fields.get('lastName')).trim(), joinSfeer: fields.has('joinSfeer'), adultComplete: true };
        navigate('contact');
      } else if (form.id === 'raContactForm') {
        const fields = new FormData(form);
        if (!guest.adultComplete) throw new Error('Complete Adult 1 details first.');
        if (!String(fields.get('phone')).trim()) throw new Error('Enter a demo contact phone number.');
        if (!guest.eventRecorded) await lab.send('passenger', trip);
        guest = { ...guest, ...Object.fromEntries(fields), contactComplete: true, eventRecorded: true };
        navigate('cart');
      } else if (form.id === 'raPaymentForm') {
        if (trip.booked) throw new Error('This booking is already confirmed.');
        await lab.send('booking', trip);
        trip.booked = true;
        trip.paidAmount = total();
        navigate('trip');
      }
    });
  });

  byId('raTriggerDisruption').addEventListener('click', () => {
    void actionTask(async () => {
      if (!trip || !trip.booked) throw new Error('Confirm a booking before sending a disruption.');
      const kind = byId('raDisruptionKind').value;
      const minutes = Number(byId('raDelayMinutes').value);
      const gate = byId('raNewGate').value.trim().toUpperCase();
      if (kind === 'delay' && (!Number.isInteger(minutes) || minutes < 15 || minutes > 720)) throw new Error('Set a delay between 15 and 720 minutes.');
      if (kind === 'gate' && !/^[A-Z0-9 -]{1,8}$/.test(gate)) throw new Error('Enter a gate of 1-8 letters, digits, spaces or hyphens.');
      const eventID = byId('raOrchestrationId').value.trim();
      if (eventID && !/^[a-zA-Z0-9_-]{1,128}$/.test(eventID)) throw new Error('The AJO event ID must contain only letters, numbers, underscores or hyphens.');
      await lab.send(kind, trip, { delayMinutes: minutes, gate, eventID });
      trip.disruption = { kind, delayMinutes: minutes, gate };
      navigate('trip');
    });
  });

  byId('raResetJourney').addEventListener('click', () => {
    if (busy) { lab.message('Wait for the in-flight event before resetting the local trip.', true); return; }
    trip = null;
    search = null;
    guest = {};
    navigate('home');
    lab.message('Local trip reset. Existing AEP events and AJO state were not changed.', false);
  });
  byId('raCloseFeature').addEventListener('click', () => {
    byId('raFeatureDetail').hidden = true;
    const trigger = site.querySelector('[data-ra-feature]');
    trigger.focus();
  });
  global.addEventListener('riyadh-air-context-change', syncOwner);
  global.addEventListener('popstate', () => {
    controls.close(false);
    const requested = new URL(global.location.href).searchParams.get('step') || 'home';
    step = validStep(requested);
    if (step !== requested) route(step, true);
    render(); save();
  });
  site.addEventListener('input', (event) => {
    if (event.target.closest('#raPassengerForm, #raContactForm')) {
      const form = event.target.form;
      guest = { ...guest, ...Object.fromEntries(new FormData(form)), joinSfeer: form.id === 'raPassengerForm' ? form.elements.joinSfeer.checked : guest.joinSfeer };
      if (form.id === 'raPassengerForm') guest.adultComplete = false;
      else guest.contactComplete = false;
      save();
    }
  });
  site.addEventListener('change', (event) => {
    if (!['raBag', 'raLounge'].includes(event.target.id) || !trip || !trip.booked) return;
    void actionTask(async () => {
      const bag = byId('raBag').checked;
      const lounge = byId('raLounge').checked;
      await lab.send('extras', trip, { offer: 'ancillary', bag, lounge, amount: (trip.pendingSeat ? trip.pendingSeat.price : 0) + (bag ? 250 : 0) + (lounge ? 300 : 0), currency: 'SAR', leg: 'outbound' });
      trip.pendingBag = bag;
      trip.pendingLounge = lounge;
      trip.ancillaryAbandoned = false;
      trip.ancillaryIntent = false;
      render(); save();
    });
  });
  const tomorrow = new Date();
  const localDate = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  byId('raDeparture').min = localDate(tomorrow);
  tomorrow.setDate(tomorrow.getDate() + 14);
  byId('raDeparture').value = localDate(tomorrow);
  controls.update();
  lab.ready.then(syncOwner).catch((error) => lab.message(error.message, true));
})(window);
