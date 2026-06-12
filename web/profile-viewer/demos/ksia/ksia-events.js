/**
 * KSIA airport lab events — iframe posts to parent shell for POST /api/events/generator.
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'ksia-airport-lab';

  /**
   * @param {string} eventType
   * @param {Record<string, unknown>} [publicObj]
   * @param {string} [viewName]
   * @param {string} [viewUrl]
   */
  function emit(eventType, publicObj, viewName, viewUrl) {
    var payload = {
      eventType: String(eventType || 'ksia.page.view').trim(),
      public: publicObj && typeof publicObj === 'object' ? publicObj : {},
      viewName: viewName || 'KSIA airport lab',
      viewUrl: viewUrl || (typeof location !== 'undefined' ? location.href.split('#')[0] : ''),
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: 'ksia-experience-event', payload: payload }, '*');
      }
    } catch (_e) {
      /* noop */
    }
  }

  function emitPageView(pageId, section) {
    emit('ksia.page.view', { pageId: pageId || '', section: section || '' }, 'KSIA — ' + (pageId || 'page'));
  }

  function emitFlightSearch(origin, destination, date) {
    emit('ksia.flight.search', {
      origin: origin || '',
      destination: destination || '',
      travelDate: date || '',
    });
  }

  function emitAivcAction(action) {
    emit('ksia.aivc.action', { action: action || '' });
  }

  window.KsiaLabEvents = {
    emit: emit,
    emitPageView: emitPageView,
    emitFlightSearch: emitFlightSearch,
    emitAivcAction: emitAivcAction,
    SOURCE: MSG_SOURCE,
  };
})();
