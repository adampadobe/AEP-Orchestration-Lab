(function (global) {
  'use strict';
  const lab = global.RiyadhAirLab;
  const byId = (id) => document.getElementById(id);
  const site = byId('raCustomerSite');
  const content = byId('raJourneyContent');
  const titles = { results: 'Choose your flight', passenger: 'Who is travelling?', extras: 'Make it your journey', payment: 'Review your booking', trip: 'Your journey, at a glance', upgrade: 'A little more extraordinary.' };
  let owner = '';
  let trip = null;
  let search = null;
  let step = 'home';
  let busy = false;
  const price = (value) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
  const escape = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const total = () => trip.fare + (trip.seat ? 35 : 0) + (trip.bag ? 65 : 0) + (trip.lounge ? 50 : 0);

  function save() {
    try {
      global.sessionStorage.setItem('riyadhAirJourneyV1', JSON.stringify({ owner, trip, search, step }));
    } catch (error) {
      lab.message('This browser cannot retain the local demo trip across reloads: ' + error.message, true);
    }
  }

  function syncOwner() {
    let nextOwner;
    try { nextOwner = lab.ownerKey(); } catch { nextOwner = ''; }
    if (nextOwner === owner) return;
    owner = nextOwner;
    trip = null;
    search = null;
    step = 'home';
    try {
      const raw = global.sessionStorage.getItem('riyadhAirJourneyV1');
      const saved = raw ? JSON.parse(raw) : null;
      if (owner && saved && saved.owner === owner && saved.trip && saved.trip.reference && saved.trip.origin && saved.trip.date) {
        trip = saved.trip;
        search = saved.search;
        step = trip.booked ? 'trip' : 'passenger';
      }
    } catch (error) {
      lab.message('Stored demo trip could not be restored: ' + error.message + '. Use Reset local trip.', true);
    }
    byId('raTriggerDisruption').disabled = !trip || !trip.booked;
    render();
  }

  function navigate(next) {
    step = next;
    render();
    save();
    if (next !== 'home') {
      byId('raJourneyTitle').focus();
      byId('raJourney').scrollIntoView({ block: 'start' });
    }
  }

  function summary() {
    return '<div class="ra-trip-summary"><div><h2>' + escape(trip.origin) + ' &rarr; Riyadh</h2><p>' +
      escape(trip.date) + ' &middot; ' + escape(trip.flight) + ' &middot; ' + escape(trip.cabin) +
      '</p></div><div><small>Booking reference</small><p class="ra-reference">' + escape(trip.reference) + '</p></div></div>';
  }

  function render() {
    site.dataset.care = String(!!(trip && trip.disruption));
    byId('raHome').hidden = step !== 'home';
    byId('raJourney').hidden = step === 'home';
    byId('raTriggerDisruption').disabled = busy || !trip || !trip.booked;
    byId('raTravelUpdateCopy').textContent = trip && trip.disruption
      ? careCopy() : 'Planning your journey? View your booking for departure details and the latest updates.';
    if (step === 'home') return;
    byId('raJourneyTitle').textContent = titles[step];
    document.querySelectorAll('[data-ra-step]').forEach((item) => {
      if (item.dataset.raStep === step || (step === 'upgrade' && item.dataset.raStep === 'trip')) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    if (step === 'results') {
      const fares = search.cabin === 'Business' ? [1650, 1790] : [485, 565];
      content.innerHTML = '<p>' + escape(search.origin) + ' &rarr; RUH &middot; ' + escape(search.date) +
        ' &middot; 1 adult &middot; ' + escape(search.cabin) + '</p>' +
        fares.map((fare, index) => '<article class="ra-flight"><div><strong>' + (index ? '18:20' : '10:30') +
          '</strong><small>' + escape(search.origin) + '</small></div><div><p>Non-stop &middot; illustrative schedule</p><small>RX' +
          (index ? '102' : '100') + ' &middot; ' + escape(search.cabin) +
          '</small></div><div><span class="ra-price">' + price(fare) +
          '</span><small> / adult &middot; demo fare</small></div><button type="button" class="ra-button" data-ra-action="select" data-flight="' +
          index + '">Select flight</button></article>').join('');
    } else if (step === 'passenger') {
      const profile = lab.profile();
      content.innerHTML = summary() + '<form id="raPassengerForm" class="ra-form"><label>First name<input name="firstName" autocomplete="given-name" maxlength="60" required value="' +
        escape(profile && profile.firstName) + '"></label><label>Last name<input name="lastName" autocomplete="family-name" maxlength="60" required value="' +
        escape(profile && profile.lastName) + '"></label><p class="ra-form-wide">Passenger names stay in this tab. Events use the profile selected in the Lab bar; a passenger name does not change your identity.</p>' +
        '<button class="ra-button ra-form-wide" type="submit">Continue to extras &#8594;</button></form>';
    } else if (step === 'extras') {
      const seats = ['14A', '14B', '14C', '', '14D', '14E', '14F', '15A', '15B', '15C', '', '15D', '15E', '15F', '16A', '16B', '16C', '', '16D', '16E', '16F'];
      content.innerHTML = summary() + '<div class="ra-extras"><section><h2>Your seat</h2><p>Optional seat selection &middot; ' + price(35) +
        '</p><div class="ra-seat-picker" role="group" aria-label="Choose your seat">' +
        seats.map((seat) => seat ? '<button type="button" data-ra-action="seat" data-seat="' + seat + '" aria-label="Seat ' + seat +
          '" aria-pressed="' + (trip.seat === seat) + '">' + seat + '</button>' : '<span aria-hidden="true"></span>').join('') +
        '</div></section><section><h2>A little extra</h2><div class="ra-extra-options"><label><input id="raBag" type="checkbox"' +
        (trip.bag ? ' checked' : '') + '>Extra 23 kg bag &middot; ' + price(65) + '</label><label><input id="raLounge" type="checkbox"' +
        (trip.lounge ? ' checked' : '') + '>Lounge access &middot; ' + price(50) + '</label></div></section></div>' +
        '<div class="ra-actions"><button type="button" class="ra-button" data-ra-action="extras">Review booking &#8594;</button><button type="button" class="ra-text-button" data-ra-action="skipExtras">Continue without extras</button></div>';
    } else if (step === 'payment') {
      content.innerHTML = summary() + '<h2>Your booking summary</h2><dl class="ra-review"><dt>Flight</dt><dd>' + price(trip.fare) +
        '</dd><dt>Seat</dt><dd>' + (trip.seat ? escape(trip.seat) + ' / ' + price(35) : 'Assigned at check-in') +
        '</dd><dt>Extra baggage</dt><dd>' + (trip.bag ? price(65) : 'Not selected') +
        '</dd><dt>Lounge</dt><dd>' + (trip.lounge ? price(50) : 'Not selected') +
        '</dd><dt><strong>Total</strong></dt><dd><strong>' + price(total()) + '</strong></dd></dl>' +
        '<form id="raPaymentForm"><label class="ra-payment-consent"><input type="checkbox" required>I understand this is a demo booking. No payment details are collected and no ticket is issued.</label>' +
        '<div class="ra-actions"><button type="submit" class="ra-button">Confirm demo booking &#8594;</button><button type="button" class="ra-text-button" data-ra-action="editExtras">Edit extras</button></div></form>';
    } else if (step === 'trip') {
      content.innerHTML = '<p>' + (trip.booked ? 'Your demo booking is confirmed.' : 'Your booking is not yet confirmed.') + '</p>' + summary() +
        (trip.disruption ? '<section class="ra-care" role="status"><h2>We are here for your journey.</h2><p>' + escape(careCopy()) +
          '</p><p>Please check the airport departure boards. Our team will help with your onward journey.</p></section>' :
          '<p>Trip status: On time (illustrative) &middot; Gate A08 &middot; ' + (trip.index ? '18:20' : '10:30') + ' departure</p>') +
        '<dl class="ra-review"><dt>Seat</dt><dd>' + escape(trip.seat || 'Assigned at check-in') + '</dd><dt>Extra bag</dt><dd>' +
        (trip.bag ? '23 kg' : 'None') + '</dd><dt>Lounge</dt><dd>' + (trip.lounge ? 'Selected' : 'Not selected') +
        '</dd><dt>Upgrade purchase via external channels</dt><dd>Not verified</dd></dl>' +
        '<div class="ra-actions">' + (!trip.disruption && trip.booked && trip.cabin !== 'Business' ? '<button type="button" class="ra-button" data-ra-action="upgrade">Explore a cabin upgrade &#8599;</button>' : '') +
        '<button type="button" class="ra-text-button" data-ra-action="profile">View profile and activity &#8599;</button></div>';
    } else if (step === 'upgrade') {
      content.innerHTML = summary() + '<section class="ra-experience"><div class="ra-cabin-art" aria-hidden="true"><div class="ra-window"></div><div class="ra-seat"></div></div>' +
        '<div><h2>More space.<br>More possibility.</h2><p>Explore Business comfort for your journey. Illustrative upgrade: ' + price(420) +
        '. This website records your interest, not an upgrade purchase.</p><div class="ra-actions"><button class="ra-button" type="button" data-ra-action="upgradeIntent">I am interested &#8594;</button>' +
        '<button class="ra-text-button" type="button" data-ra-action="abandon">Not now &mdash; return to my trip</button></div><p id="raUpgradeNote">' +
        (trip.upgradeIntent ? 'Your interest was submitted. Your AJO channels manage any follow-up.' : '') + '</p></div></section>';
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
    try { await task(); } catch (error) { lab.message(error.message, true); }
    finally {
      busy = false;
      site.removeAttribute('aria-busy');
      buttons.forEach((button, index) => { if (button.isConnected) button.disabled = previouslyDisabled[index]; });
      byId('raTriggerDisruption').disabled = !trip || !trip.booked;
    }
  }

  async function abandonUpgrade() {
    if (step !== 'upgrade' || !trip || trip.disruption) return;
    await lab.send('abandon', trip);
    trip.upgradeAbandoned = true;
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
      if (action === 'select') {
        if (!search) throw new Error('Search for a flight first.');
        const index = Number(trigger.dataset.flight);
        const candidate = { ...search, index, flight: index ? 'RX102' : 'RX100',
          reference: 'RA' + global.crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
          fare: search.cabin === 'Business' ? (index ? 1790 : 1650) : (index ? 565 : 485),
          seat: '', bag: false, lounge: false, booked: false };
        await lab.send('select', candidate);
        trip = candidate;
        navigate('passenger');
        return;
      }
      if (!trip) throw new Error('Select a flight first.');
      if (action === 'seat') {
        const candidate = { ...trip, seat: trip.seat === trigger.dataset.seat ? '' : trigger.dataset.seat,
          bag: byId('raBag').checked, lounge: byId('raLounge').checked };
        await lab.send('extras', candidate);
        trip = candidate;
        navigate('extras');
      } else if (action === 'extras' || action === 'skipExtras') {
        const candidate = { ...trip, seat: action === 'skipExtras' ? '' : trip.seat,
          bag: action === 'extras' && byId('raBag').checked, lounge: action === 'extras' && byId('raLounge').checked };
        await lab.send('extras', candidate);
        trip = candidate;
        navigate('payment');
      } else if (action === 'editExtras') {
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
        byId('raUpgradeNote').textContent = 'Your interest was submitted. Your AJO channels manage any follow-up. No upgrade purchase has been made here.';
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
    void actionTask(async () => {
      if (form.id === 'raSearchForm') {
        const date = byId('raDeparture').value;
        if (date < byId('raDeparture').min) throw new Error('Choose today or a future departure date.');
        const candidate = { origin: byId('raOrigin').value, destination: byId('raDestination').value, date, cabin: byId('raCabin').value };
        await lab.send('search', candidate);
        search = candidate;
        navigate('results');
      } else if (form.id === 'raPassengerForm') {
        const fields = new FormData(form);
        if (!String(fields.get('firstName')).trim() || !String(fields.get('lastName')).trim()) throw new Error('Enter the passenger first and last name.');
        await lab.send('passenger', trip);
        navigate('extras');
      } else if (form.id === 'raPaymentForm') {
        if (trip.booked) throw new Error('This booking is already confirmed.');
        await lab.send('booking', trip);
        trip.booked = true;
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
    navigate('home');
    lab.message('Local trip reset. Existing AEP events and AJO state were not changed.', false);
  });
  global.addEventListener('riyadh-air-context-change', syncOwner);
  const tomorrow = new Date();
  const localDate = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  byId('raDeparture').min = localDate(tomorrow);
  tomorrow.setDate(tomorrow.getDate() + 14);
  byId('raDeparture').value = localDate(tomorrow);
  lab.ready.then(syncOwner).catch((error) => lab.message(error.message, true));
})(window);
