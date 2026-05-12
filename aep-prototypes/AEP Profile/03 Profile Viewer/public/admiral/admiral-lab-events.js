/**
 * Admiral insurance lab — iframe posts to parent (admiral-demo.html) so
 * POST /api/events/generator uses the shell sandbox, ECID, and generator target.
 * Payloads land under _demoemea.public (see eventGeneratorService.mergeGeneratorPublicIntoTenant).
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'admiral-insurance-lab';

  /**
   * @param {string} eventType - e.g. admiral.quoteForm.step1complete
   * @param {Record<string, unknown>} [publicObj] - merged into XDM _demoemea.public
   * @param {string} [viewName]
   * @param {string} [viewUrl]
   */
  function emit(eventType, publicObj, viewName, viewUrl) {
    var payload = {
      eventType: String(eventType || 'admiral.insurance.interaction').trim(),
      public: publicObj && typeof publicObj === 'object' ? publicObj : {},
      viewName: viewName || 'Admiral insurance demo',
      viewUrl: viewUrl || (typeof location !== 'undefined' ? location.href.split('#')[0] : ''),
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { source: MSG_SOURCE, type: 'admiral-insurance-experience-event', payload: payload },
          '*',
        );
      }
    } catch (e) {
      /* noop */
    }
  }

  window.AdmiralLabEvents = {
    emit: emit,
    SOURCE: MSG_SOURCE,
  };
})();
