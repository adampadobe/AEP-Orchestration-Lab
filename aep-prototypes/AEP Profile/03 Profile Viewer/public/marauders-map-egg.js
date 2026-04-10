/**
 * Home dashboard — Marauder’s Map easter egg (tiny speck trigger).
 */
(function () {
  'use strict';

  var speck = document.querySelector('.map-egg-speck');
  if (!speck) return;

  var OATH_FULL = 'i solemnly swear that i am up to no good';
  var OATH_SHORT = 'i solemnly swear i am up to no good';

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\bsolomly\b/g, 'solemnly')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function oathOk(typed) {
    var n = normalize(typed);
    return n === OATH_FULL || n === OATH_SHORT;
  }

  var overlay = document.createElement('div');
  overlay.className = 'map-egg-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mapEggOathTitle');
  overlay.innerHTML =
    '<div class="map-egg-scroll">' +
    '<div class="map-egg-parchment">' +
    '<div class="map-egg-phase map-egg-phase--active" data-phase="oath">' +
    '<p id="mapEggOathTitle" class="map-egg-oath-title">The blank parchment stares back</p>' +
    '<p class="map-egg-oath-hint">Perhaps an oath would help—exactly the sort you might swear when the Ministry isn’t looking.</p>' +
    '<label class="visually-hidden" for="mapEggOathInput">Oath</label>' +
    '<input id="mapEggOathInput" class="map-egg-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type the oath…" />' +
    '<p class="map-egg-err" id="mapEggErr" aria-live="polite"></p>' +
    '<div class="map-egg-row">' +
    '<button type="button" class="map-egg-btn" data-map-egg-cancel>Never mind</button>' +
    '<button type="button" class="map-egg-btn map-egg-btn--primary" data-map-egg-submit>Reveal</button>' +
    '</div></div>' +
    '<div class="map-egg-phase" data-phase="map">' +
    '<div class="map-egg-cover">' +
    '<p class="map-egg-present">Palmer &amp; Kirkham</p>' +
    '<p class="map-egg-proudly">proudly present</p>' +
    '<h2 class="map-egg-lab-title">The AEP Orchestration Lab</h2>' +
    '<div class="map-egg-footprints" aria-hidden="true">· · · · ·</div>' +
    '</div>' +
    '<div class="map-egg-inner">' +
    '<p class="map-egg-inner-lead">Herein lie orchestrations so neatly woven that even the <em>Ministry of Data</em> might pause before stamping “deny.” Footprints fade; events do not—unless your retention policy says so.</p>' +
    '<ul class="map-egg-charms">' +
    '<li><span class="map-egg-rune" aria-hidden="true">◎</span> <strong>Decisioning</strong> — offers rearrange themselves as if by enchantment (ranking formulas optional; chaos included at no charge).</li>' +
    '<li><span class="map-egg-rune" aria-hidden="true">◇</span> <strong>Journeys</strong> — threads of intent, charted across sandboxes; mind the gaps between QA and prod.</li>' +
    '<li><span class="map-egg-rune" aria-hidden="true">✦</span> <strong>Profile</strong> — not a ghost on the stairs: a real-time ghost <em>in the graph</em>, politely requesting consent.</li>' +
    '</ul>' +
    '<p class="map-egg-signoff">Messrs. Palmer &amp; Kirkham accept no liability for unexpected audience overlap, temporal paradoxes in streaming ingestion, or sudden urges to diagram consent on napkins.</p>' +
    '<div class="map-egg-links">' +
    '<a href="decisioning-visualiser.html">The ranking explorer</a>' +
    '<a href="decisioning-catalog.html">The offer registry</a>' +
    '<a href="journeys.html">The journey atlas</a>' +
    '<a href="index.html">The profile pensieve</a>' +
    '</div>' +
    '<p class="map-egg-managed"><button type="button" class="map-egg-close-managed" data-map-egg-managed>Mischief managed</button></p>' +
    '<p class="map-egg-fineprint">No owls were harmed in the composition of this lab. Nimbus 2000 not required for npm install.</p>' +
    '</div></div></div></div>';

  document.body.appendChild(overlay);

  var phaseOath = overlay.querySelector('[data-phase="oath"]');
  var phaseMap = overlay.querySelector('[data-phase="map"]');
  var input = overlay.querySelector('#mapEggOathInput');
  var err = overlay.querySelector('#mapEggErr');

  function openEgg() {
    overlay.classList.add('map-egg-overlay--open');
    phaseOath.classList.add('map-egg-phase--active');
    phaseMap.classList.remove('map-egg-phase--active');
    err.textContent = '';
    if (input) {
      input.value = '';
      setTimeout(function () {
        input.focus();
      }, 120);
    }
  }

  function closeEgg() {
    overlay.classList.remove('map-egg-overlay--open');
    err.textContent = '';
    if (input) input.value = '';
    speck.focus();
  }

  function tryReveal() {
    var v = input ? input.value : '';
    if (!oathOk(v)) {
      err.textContent = 'The parchment stays stubbornly blank. Try the classic wording—solemnly, and with mischief in mind.';
      return;
    }
    err.textContent = '';
    phaseOath.classList.remove('map-egg-phase--active');
    phaseMap.classList.add('map-egg-phase--active');
  }

  speck.addEventListener('click', function (e) {
    e.preventDefault();
    openEgg();
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeEgg();
  });

  overlay.querySelector('[data-map-egg-cancel]').addEventListener('click', closeEgg);
  overlay.querySelector('[data-map-egg-submit]').addEventListener('click', tryReveal);

  overlay.querySelector('[data-map-egg-managed]').addEventListener('click', closeEgg);

  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryReveal();
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('map-egg-overlay--open')) {
      closeEgg();
    }
  });
})();
