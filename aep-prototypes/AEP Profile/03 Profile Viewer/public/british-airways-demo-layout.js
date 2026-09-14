(function () {
  'use strict';

  var FRAME_ID = 'britishairwaDemoSiteFrame';
  var STYLE_ID = 'aep-british-airways-hero-placement';

  function positionHero(frame) {
    var doc;
    try {
      doc = frame.contentDocument;
    } catch (error) {
      return;
    }

    if (!doc) return;

    var hero = doc.getElementById('hero-banner');
    var flightSearch = doc.querySelector('[data-testid="flight-search-section-body"]');
    if (!hero || !flightSearch) return;

    if (flightSearch.nextElementSibling !== hero) {
      flightSearch.insertAdjacentElement('afterend', hero);
    }

    if (!doc.getElementById(STYLE_ID)) {
      var style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = [
        '#hero-banner {',
        '  box-sizing: border-box;',
        '  width: 100%;',
        '  max-width: 1312px;',
        '  margin: 2rem auto 0;',
        '}',
        '@media (max-width: 1344px) {',
        '  #hero-banner { padding-inline: 1rem; }',
        '}'
      ].join('\n');
      (doc.head || doc.documentElement).appendChild(style);
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
