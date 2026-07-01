/**
 * Sky News lab — iframe posts experience events to the Profile Viewer shell.
 */
(function () {
  'use strict';

  var MSG_SOURCE = 'sky-news-lab';

  function postToShell(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: MSG_SOURCE, type: type, payload: payload || {} }, '*');
      }
    } catch (e) {
      /* noop */
    }
  }

  /**
   * @param {{ eventType: string, viewName?: string, viewUrl?: string, public?: object, tenant?: object, person?: object, homeAddress?: object, personalEmail?: object, email?: string }} payload
   */
  function emitExperienceEvent(payload) {
    postToShell('sky-news-experience-event', payload && typeof payload === 'object' ? payload : {});
  }

  function requestProfilePrefill() {
    postToShell('sky-news-profile-prefill-request', {});
  }

  /**
   * Profile stream update (shell → /api/profile/update) then insider.registered experience event.
   * @param {Array<{ path: string, value: unknown }>} profileUpdates
   * @param {Record<string, unknown>} eventPayload
   */
  function submitInsiderRegistration(profileUpdates, eventPayload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: MSG_SOURCE,
            type: 'sky-news-insider-registration',
            updates: Array.isArray(profileUpdates) ? profileUpdates : [],
            payload: eventPayload && typeof eventPayload === 'object' ? eventPayload : {},
          },
          '*',
        );
      }
    } catch (e) {
      /* noop */
    }
  }

  window.SkyNewsLabEvents = {
    emit: emitExperienceEvent,
    submitRegistration: submitInsiderRegistration,
    requestProfilePrefill: requestProfilePrefill,
    SOURCE: MSG_SOURCE,
  };

  document.addEventListener('DOMContentLoaded', function () {
    var cta = document.querySelector('[data-sky-insider-cta]');
    if (cta) {
      cta.addEventListener('click', function () {
        emitExperienceEvent({
          eventType: 'insider.clicked',
          viewName: 'Sky News — Insider promo',
          viewUrl: typeof location !== 'undefined' ? location.href.split('?')[0] : '',
        });
      });
    }
  });
})();
