(function () {
  'use strict';

  var FRAME_ID = 'britishairwaDemoSiteFrame';
  function positionHero(frame) {
    var doc;
    try {
      doc = frame.contentDocument;
    } catch (error) {
      return;
    }

    if (!doc) return;

    var hero = doc.getElementById('hero-banner');
    var heroHost = doc.getElementById('heroBanner');
    var flightSearch = doc.querySelector('[data-testid="flight-search-section-body"]');
    if (!hero || !heroHost || !flightSearch) return;

    if (flightSearch.nextElementSibling !== heroHost) {
      flightSearch.insertAdjacentElement('afterend', heroHost);
    }
  }

  function initialise() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return;

    frame.addEventListener('load', function () {
      positionHero(frame);
    });

    if (frame.contentDocument && frame.contentDocument.readyState !== 'loading') {
      positionHero(frame);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
