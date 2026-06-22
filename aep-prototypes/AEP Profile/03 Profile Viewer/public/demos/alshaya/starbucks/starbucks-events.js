/**
 * Starbucks UAE (Alshaya) lab events — iframe posts to parent shell for POST /api/events/generator.
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'starbucks-lab';

  /**
   * @param {string} eventType
   * @param {Record<string, unknown>} [publicObj]
   * @param {string} [viewName]
   * @param {string} [viewUrl]
   */
  function emit(eventType, publicObj, viewName, viewUrl) {
    var payload = {
      eventType: String(eventType || 'starbucks.page.view').trim(),
      public: publicObj && typeof publicObj === 'object' ? publicObj : {},
      viewName: viewName || 'Starbucks UAE lab',
      viewUrl: viewUrl || (typeof location !== 'undefined' ? location.href.split('#')[0] : ''),
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: 'starbucks-experience-event', payload: payload }, '*');
      }
    } catch (_e) {
      /* noop */
    }
  }

  function emitPageView(pageId, section) {
    emit('starbucks.page.view', { pageId: pageId || '', section: section || '' }, 'Starbucks — ' + (pageId || 'page'));
  }

  function emitFlightSearch(origin, destination, date) {
    emit('starbucks.flight.search', {
      origin: origin || '',
      destination: destination || '',
      travelDate: date || '',
    });
  }

  function emitAivcAction(action) {
    emit('starbucks.aivc.action', { action: action || '' });
  }

  window.StarbucksLabEvents = {
    emit: emit,
    emitPageView: emitPageView,
    emitFlightSearch: emitFlightSearch,
    emitAivcAction: emitAivcAction,
    SOURCE: MSG_SOURCE,
  };
})();
