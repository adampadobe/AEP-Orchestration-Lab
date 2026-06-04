/**
 * Saga Cruises lab events — iframe posts to parent (saga-demo.html) so
 * POST /api/events/generator runs with sandbox + generator target from the shell.
 *
 * Event types: web.webpagedetails.pageViews, travel.cruise.* (list, filter, detail, booking, abandon).
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'saga-cruises-lab';

  /**
   * @param {string} eventType
   * @param {Record<string, unknown>} [publicObj]
   * @param {string} [viewName]
   * @param {string} [viewUrl]
   */
  function emit(eventType, publicObj, viewName, viewUrl) {
    var payload = {
      eventType: String(eventType || 'web.webpagedetails.pageViews').trim(),
      public: publicObj && typeof publicObj === 'object' ? publicObj : {},
      viewName: viewName || 'Saga Cruises lab',
      viewUrl: viewUrl || (typeof location !== 'undefined' ? location.href.split('#')[0] : ''),
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: 'cruise-experience-event', payload: payload }, '*');
      }
    } catch (e) {
      /* noop */
    }
  }

  /**
   * @param {string} email
   */
  function requestLogin(email) {
    var em = String(email || '').trim();
    if (!em) return;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: 'login-request', email: em }, '*');
      }
    } catch (e) {
      /* noop */
    }
  }

  window.SagaCruisesLabEvents = {
    emit: emit,
    requestLogin: requestLogin,
    SOURCE: MSG_SOURCE,
  };
})();
