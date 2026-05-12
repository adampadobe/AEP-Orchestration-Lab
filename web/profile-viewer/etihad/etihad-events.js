/**
 * Airline travel lab events — iframe posts to parent (etihad-demo.html) so
 * POST /api/events/generator runs with the sandbox + generator target from the shell.
 * Event types are generic (travel.*) for anonymous international-flight / abandonment demos.
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'etihad-airline-lab';

  /**
   * @param {string} eventType - e.g. travel.flight.search, travel.booking.abandon
   * @param {Record<string, unknown>} [publicObj] - merged into XDM tenant public
   * @param {string} [viewName]
   * @param {string} [viewUrl]
   */
  function emit(eventType, publicObj, viewName, viewUrl) {
    var payload = {
      eventType: String(eventType || 'travel.flight.search').trim(),
      public: publicObj && typeof publicObj === 'object' ? publicObj : {},
      viewName: viewName || 'Airline travel lab',
      viewUrl: viewUrl || (typeof location !== 'undefined' ? location.href.split('#')[0] : ''),
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: 'airline-experience-event', payload: payload }, '*');
      }
    } catch (e) {
      /* noop */
    }
  }

  window.EtihadAirlineLabEvents = {
    emit: emit,
    SOURCE: MSG_SOURCE,
  };
})();
