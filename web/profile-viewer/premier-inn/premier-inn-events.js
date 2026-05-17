/**
 * Hospitality lab events — iframe posts to parent (premier-inn-demo.html) so
 * POST /api/events/generator runs with the sandbox + generator target from the shell.
 * Event types are generic (hotel.*) e.g. hotel.search, hotel.availability.view, hotel.filter.apply,
 * hotel.content.view, hotel.room.select, hotel.booking.start, hotel.payment.expose, hotel.checkout.abandon,
 * hotel.booking.complete, hotel.booking.stayerIdentified (second POST when booker ≠ stayer; same shell ECID/email),
 * hotel.funnel.exit (logo / title → lab home; use hotelJourneyStage + hotelExitVia vs payment abandon).
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'premier-inn-lab';

  /**
   * @param {string} eventType - e.g. hotel.search, hotel.checkout.abandon
   * @param {Record<string, unknown>} [publicObj] - merged into XDM tenant public (hotel* + itineraryId)
   * @param {string} [viewName]
   * @param {string} [viewUrl]
   */
  function emit(eventType, publicObj, viewName, viewUrl) {
    var payload = {
      eventType: String(eventType || 'hotel.search').trim(),
      public: publicObj && typeof publicObj === 'object' ? publicObj : {},
      viewName: viewName || 'Hospitality lab',
      viewUrl: viewUrl || (typeof location !== 'undefined' ? location.href.split('#')[0] : ''),
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: 'hotel-experience-event', payload: payload }, '*');
      }
    } catch (e) {
      /* noop */
    }
  }

  window.PremierInnLabEvents = {
    emit: emit,
    SOURCE: MSG_SOURCE,
  };
})();
