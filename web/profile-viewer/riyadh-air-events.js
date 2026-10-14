(function (root) {
  'use strict';
  const TYPES = Object.freeze({
    search: 'travel.flight.search', select: 'travel.flight.select',
    passenger: 'travel.booking.passengerDetails', extras: 'travel.ancillary.select',
    booking: 'travel.booking.confirm', upgradeView: 'travel.upgrade.view',
    upgradeIntent: 'travel.upgrade.intent', abandon: 'travel.upgrade.abandon',
    manage: 'travel.booking.view', delay: 'travel.flight.delay', gate: 'travel.flight.gateChange',
  });

  function build(action, trip, context, options) {
    const eventType = TYPES[action];
    if (!eventType) throw new Error('Unknown Riyadh Air event action.');
    if (!context.sandbox) throw new Error('Select a sandbox in the Lab environment bar.');
    if (!context.target || context.target.id !== 'lab-event-tool-edge' || !context.target.dataStreamId) {
      throw new Error('Select the configured Lab Event tool Edge target. Other target schemas have not been verified for this travel contract.');
    }
    if (!/^\d{10,}$/.test(context.ecid || '')) throw new Error('Resolve a valid ECID before recording this interaction.');
    if (context.known && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.email || '')) {
      throw new Error('The selected profile needs a resolved email and ECID. Look up the profile again.');
    }
    if (action !== 'search' && !trip.reference) throw new Error('Select a flight before sending a booking event.');
    const url = new URL(context.url);
    url.search = '';
    url.hash = '';
    const extra = options || {};
    if (action === 'delay' && (!Number.isInteger(extra.delayMinutes) || extra.delayMinutes < 15 || extra.delayMinutes > 720)) {
      throw new Error('A disruption delay must be 15-720 whole minutes.');
    }
    if (action === 'gate' && !/^[A-Z0-9 -]{1,8}$/.test(extra.gate || '')) {
      throw new Error('A gate change requires a valid gate.');
    }
    if (extra.eventID && !/^[a-zA-Z0-9_-]{1,128}$/.test(extra.eventID)) throw new Error('Invalid AJO event ID.');
    url.searchParams.set('journey', 'riyadh-air-v1');
    url.searchParams.set('action', action);
    if (trip.reference) url.searchParams.set('booking', trip.reference);
    if (trip.flight) url.searchParams.set('flight', trip.flight);
    if (trip.date) url.searchParams.set('departure', trip.date);
    if (trip.cabin) url.searchParams.set('cabin', trip.cabin);
    if (trip.seat) url.searchParams.set('seat', trip.seat);
    if (trip.bag) url.searchParams.set('bag', 'extra-23kg');
    if (trip.lounge) url.searchParams.set('lounge', 'true');
    if (action === 'delay') url.searchParams.set('delayMinutes', String(extra.delayMinutes));
    if (action === 'gate') url.searchParams.set('gate', extra.gate);
    const travel = { departureAirport: trip.origin, arrivalAirport: trip.destination };
    if (trip.reference) travel.confirmationNumber = trip.reference;
    const body = {
      targetId: context.target.id, sandbox: context.sandbox,
      eventType, channel: 'Web', ecid: context.ecid,
      xdmStyle: 'full', identityMapEcidKey: 'ECID',
      viewName: 'Riyadh Air / ' + action, viewUrl: url.href,
      public: { travel, generic: { ctaLabel: eventType, linkUrl: url.href } },
    };
    if (context.known) body.email = context.email;
    if (extra.eventID) body.eventID = extra.eventID;
    return body;
  }
  const api = Object.freeze({ TYPES, build });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiyadhAirEvents = api;
})(typeof window !== 'undefined' ? window : globalThis);
