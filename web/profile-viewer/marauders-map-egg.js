/**
 * Marauder’s Map easter egg — tiny speck(s), oath, map, register (notify founders).
 * Per-page copy: data-map-egg-flavor="home|journeys|catalog|profile" on .map-egg-speck
 */
(function () {
  'use strict';

  var OATH_FULL = 'i solemnly swear that i am up to no good';
  var OATH_SHORT = 'i solemnly swear i am up to no good';

  var FLAVOR = {
    home: {
      introTag: 'Messrs. of the margin',
      coverProudly: 'proudly present',
      oathHint:
        'Perhaps an oath would help—exactly the sort you might swear when the Ministry isn’t looking.',
      innerLead:
        'Herein lie orchestrations so neatly woven that even the <em>Ministry of Data</em> might pause before stamping “deny.” Footprints fade; events do not—unless your retention policy says so.',
      charms: [
        {
          rune: '◎',
          title: 'Decisioning',
          text: 'Offers rearrange themselves as if by enchantment (ranking formulas optional; chaos included at no charge).',
        },
        {
          rune: '◇',
          title: 'Journeys',
          text: 'Threads of intent, charted across sandboxes; mind the gaps between QA and prod.',
        },
        {
          rune: '✦',
          title: 'Profile',
          text: 'Not a ghost on the stairs: a real-time ghost <em>in the graph</em>, politely requesting consent.',
        },
      ],
      signoff:
        'Messrs. Palmer &amp; Kirkham accept no liability for unexpected audience overlap, temporal paradoxes in streaming ingestion, or sudden urges to diagram consent on napkins.',
      registerBlurb:
        'If you’ve read this far, the founders would like to know who’s awake. Sign the register—an owl may carry word to Palmer &amp; Kirkham.',
    },
    journeys: {
      introTag: 'Unofficial keepers of the atlas',
      coverProudly: 'proudly detour through',
      oathHint:
        'The parchment knows when you’re browsing AJO in good faith. Swear the usual nonsense anyway—it’s tradition.',
      innerLead:
        'Every journey leaves prints in the sand: <em>Enters</em> here, <em>Delivered</em> there, and the occasional metric that refuses to load until you pick the right CJA data view. The map does not judge cache TTLs; it merely sighs.',
      charms: [
        {
          rune: '↻',
          title: 'Refresh',
          text: 'Sometimes the truth is one button away; sometimes it’s buried under a stale Firestore cache and mild panic.',
        },
        {
          rune: '⏱',
          title: 'Temporal drift',
          text: 'QA sandboxes and prod sandboxes are different countries. Pack your identity namespaces accordingly.',
        },
        {
          rune: '✉',
          title: 'Delivered',
          text: 'Not an owl-delivered letter—still counts if the channel says it fired.',
        },
      ],
      signoff:
        'Should your journey fork unexpectedly, consult the Ministry of Retry Logic. Messrs. Palmer &amp; Kirkham are on tea break.',
      registerBlurb:
        'You found the map on the journey atlas—bold. Leave a name so the cartographers can toast you.',
    },
    catalog: {
      introTag: 'Merchants of the rotating offer',
      coverProudly: 'proudly stack-rank',
      oathHint:
        'Collections, strategies, items—say the oath before the parchment explodes into JSON.',
      innerLead:
        'Here the shelves rearrange themselves: <strong>offer items</strong> glitter, <strong>collections</strong> herd them into polite groups, and <strong>selection strategies</strong> pretend ranking is a personality trait. The map approves of curiosity; it frowns on unversioned hotfixes.',
      charms: [
        {
          rune: '◇',
          title: 'Offer items',
          text: 'Tiny treasure chests of copy and constraints—lift the lid gently.',
        },
        {
          rune: '⎔',
          title: 'Collections',
          text: 'Rule-bound gatherings; like house tables, but for content.',
        },
        {
          rune: '≋',
          title: 'Selection strategies',
          text: 'Where math meets drama. May your formula be stable and your fallbacks merciful.',
        },
      ],
      signoff:
        'No warranty if two strategies disagree in production. Bring popcorn and a rollback plan.',
      registerBlurb:
        'You combed the decisioning catalog and still noticed the speck—sign here; the registry loves a completionist.',
    },
    profile: {
      introTag: 'Keepers of the unified graph',
      coverProudly: 'proudly reconcile',
      oathHint:
        'Namespaces await. Swear the oath—the blank parchment is judging your identifier format.',
      innerLead:
        'Identity threads stitch together here: email, ECID, loyalty—pick your needle. The profile is less a ghost in the machine than a very punctual ghost with consent receipts and a crowded <em>identityMap</em>.',
      charms: [
        {
          rune: '✦',
          title: 'Lookup',
          text: 'One click from “who is this?” to “here’s every attribute we’re allowed to show.”',
        },
        {
          rune: '◎',
          title: 'Audiences',
          text: 'Segments cling like house scarves—check which ones you’re wearing today.',
        },
        {
          rune: '⚗',
          title: 'Events',
          text: 'Experience events leave traces; retention policies decide how long the echo lasts.',
        },
      ],
      signoff:
        'If attributes disagree, trust the sandbox. If sandboxes disagree, trust coffee.',
      registerBlurb:
        'You found the map on the profile pensieve—leave your name; the founders enjoy knowing who digs past the fold.',
    },
  };

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

  function renderCharms(ul, charms) {
    if (!ul || !charms) return;
    ul.innerHTML = charms
      .map(function (c) {
        return (
          '<li><span class="map-egg-rune" aria-hidden="true">' +
          c.rune +
          '</span> <strong>' +
          c.title +
          '</strong> — ' +
          c.text +
          '</li>'
        );
      })
      .join('');
  }

  function applyFlavor(overlay, flavorKey) {
    var f = FLAVOR[flavorKey] || FLAVOR.home;
    var el = function (id) {
      return overlay.querySelector('#' + id);
    };
    var tag = el('mapEggIntroTag');
    if (tag) tag.innerHTML = f.introTag;
    var proudly = el('mapEggCoverProudly');
    if (proudly) proudly.textContent = f.coverProudly;
    var hint = el('mapEggOathHint');
    if (hint) hint.innerHTML = f.oathHint;
    var lead = el('mapEggInnerLead');
    if (lead) lead.innerHTML = f.innerLead;
    renderCharms(el('mapEggCharms'), f.charms);
    var sign = el('mapEggSignoff');
    if (sign) sign.innerHTML = f.signoff;
    var reg = el('mapEggRegisterBlurb');
    if (reg) reg.innerHTML = f.registerBlurb;
  }

  var specks = document.querySelectorAll('.map-egg-speck');
  if (!specks.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'map-egg-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mapEggIntroTitle');
  overlay.innerHTML =
    '<div class="map-egg-scroll">' +
    '<div class="map-egg-parchment">' +
    '<div class="map-egg-phase map-egg-phase--active" data-phase="intro">' +
    '<p id="mapEggIntroTitle" class="map-egg-intro-names">Palmer &amp; Kirkham</p>' +
    '<p class="map-egg-intro-tag" id="mapEggIntroTag">Messrs. of the margin</p>' +
    '<div class="map-egg-row map-egg-row--intro">' +
    '<button type="button" class="map-egg-btn" data-map-egg-cancel-intro>Never mind</button>' +
    '<button type="button" class="map-egg-btn map-egg-btn--primary" data-map-egg-continue>Continue</button>' +
    '</div></div>' +
    '<div class="map-egg-phase" data-phase="oath">' +
    '<p id="mapEggOathTitle" class="map-egg-oath-title">The blank parchment stares back</p>' +
    '<p class="map-egg-oath-hint" id="mapEggOathHint">Perhaps an oath would help—exactly the sort you might swear when the Ministry isn’t looking.</p>' +
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
    '<p class="map-egg-proudly" id="mapEggCoverProudly">proudly present</p>' +
    '<h2 id="mapEggLabTitle" class="map-egg-lab-title">The AEP Orchestration Lab</h2>' +
    '<div class="map-egg-footprints" aria-hidden="true">· · · · ·</div>' +
    '</div>' +
    '<div class="map-egg-inner">' +
    '<p class="map-egg-inner-lead" id="mapEggInnerLead">Herein lie orchestrations…</p>' +
    '<ul class="map-egg-charms" id="mapEggCharms"></ul>' +
    '<p class="map-egg-signoff" id="mapEggSignoff"></p>' +
    '<details class="map-egg-hall" id="mapEggHall">' +
    '<summary class="map-egg-hall-summary">' +
    '<span class="map-egg-hall-title">The mischief roster</span>' +
    '<span class="map-egg-hall-count" id="mapEggHallCount"></span>' +
    '</summary>' +
    '<p class="map-egg-hall-sub">Everyone who sent the owl and signed the register—newest scrawls first.</p>' +
    '<ul class="map-egg-hall-list" id="mapEggHallList"></ul>' +
    '<p class="map-egg-hall-status" id="mapEggHallStatus" aria-live="polite"></p>' +
    '</details>' +
    '<div class="map-egg-register">' +
    '<p class="map-egg-register-blurb" id="mapEggRegisterBlurb"></p>' +
    '<label for="mapEggSigner" class="map-egg-register-label">Your name or worthy alias</label>' +
    '<input id="mapEggSigner" class="map-egg-input map-egg-input--signer" type="text" autocomplete="name" maxlength="120" placeholder="e.g. Moony, or your actual name" />' +
    '<p class="map-egg-register-status" id="mapEggRegisterStatus" aria-live="polite"></p>' +
    '<div class="map-egg-row map-egg-row--register">' +
    '<button type="button" class="map-egg-btn map-egg-btn--primary" data-map-egg-send-owl>Send the owl</button>' +
    '</div></div>' +
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

  var phaseIntro = overlay.querySelector('[data-phase="intro"]');
  var phaseOath = overlay.querySelector('[data-phase="oath"]');
  var phaseMap = overlay.querySelector('[data-phase="map"]');
  var input = overlay.querySelector('#mapEggOathInput');
  var signer = overlay.querySelector('#mapEggSigner');
  var err = overlay.querySelector('#mapEggErr');
  var regStatus = overlay.querySelector('#mapEggRegisterStatus');
  var btnContinue = overlay.querySelector('[data-map-egg-continue]');
  var hallDetails = overlay.querySelector('#mapEggHall');
  var hallList = overlay.querySelector('#mapEggHallList');
  var hallCount = overlay.querySelector('#mapEggHallCount');
  var hallStatus = overlay.querySelector('#mapEggHallStatus');
  var currentFlavor = 'home';
  var lastSpeck = specks[0];
  var sendingOwl = false;
  /** Monotonic id so an older fetch cannot overwrite a newer roster. */
  var hallFetchGeneration = 0;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatAgo(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    var sec = Math.floor((Date.now() - t) / 1000);
    if (sec < 45) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderHallEntries(entries) {
    if (!hallList) return;
    if (!entries || !entries.length) {
      hallList.innerHTML =
        '<li class="map-egg-hall-empty">No signatures yet—be the first to send the owl below.</li>';
      if (hallCount) hallCount.textContent = '(0)';
      return;
    }
    if (hallCount) hallCount.textContent = '(' + entries.length + ')';
    hallList.innerHTML = entries
      .map(function (row) {
        var ago = formatAgo(row.at);
        var label = esc(row.flavorLabel || row.flavor || '');
        return (
          '<li class="map-egg-hall-item">' +
          '<span class="map-egg-hall-name">' +
          esc(row.name) +
          '</span>' +
          '<span class="map-egg-hall-meta">' +
          label +
          (ago ? ' · ' + esc(ago) : '') +
          '</span>' +
          '</li>'
        );
      })
      .join('');
  }

  function loadHall() {
    if (!hallList) return;
    var gen = ++hallFetchGeneration;
    if (hallStatus) {
      hallStatus.textContent = '';
      hallStatus.className = 'map-egg-hall-status';
    }
    if (hallCount) hallCount.textContent = '…';
    hallList.innerHTML = '<li class="map-egg-hall-empty">Unfurling the parchment…</li>';
    var url = '/api/easter-egg-found?_=' + Date.now();
    fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (result) {
        if (gen !== hallFetchGeneration) return;
        if (!result.ok || !result.data || !result.data.ok) {
          if (hallStatus) {
            hallStatus.textContent = 'The roster would not unfold—try again later.';
            hallStatus.className = 'map-egg-hall-status map-egg-hall-status--err';
          }
          if (hallList) hallList.innerHTML = '';
          if (hallCount) hallCount.textContent = '';
          return;
        }
        renderHallEntries(result.data.entries || []);
      })
      .catch(function () {
        if (gen !== hallFetchGeneration) return;
        if (hallStatus) {
          hallStatus.textContent = 'Could not reach the roster.';
          hallStatus.className = 'map-egg-hall-status map-egg-hall-status--err';
        }
        if (hallList) hallList.innerHTML = '';
        if (hallCount) hallCount.textContent = '';
      });
  }

  function showPhase(which) {
    phaseIntro.classList.toggle('map-egg-phase--active', which === 'intro');
    phaseOath.classList.toggle('map-egg-phase--active', which === 'oath');
    phaseMap.classList.toggle('map-egg-phase--active', which === 'map');
    if (which === 'intro') {
      overlay.setAttribute('aria-labelledby', 'mapEggIntroTitle');
    } else if (which === 'oath') {
      overlay.setAttribute('aria-labelledby', 'mapEggOathTitle');
    } else {
      overlay.setAttribute('aria-labelledby', 'mapEggLabTitle');
    }
  }

  function goToOath() {
    err.textContent = '';
    if (input) input.value = '';
    showPhase('oath');
    if (input) {
      setTimeout(function () {
        input.focus();
      }, 120);
    }
  }

  function openEgg(fromSpeck) {
    lastSpeck = fromSpeck || specks[0];
    currentFlavor = String(lastSpeck.getAttribute('data-map-egg-flavor') || 'home').trim() || 'home';
    applyFlavor(overlay, currentFlavor);
    overlay.classList.add('map-egg-overlay--open');
    err.textContent = '';
    if (regStatus) regStatus.textContent = '';
    if (signer) signer.value = '';
    if (input) input.value = '';
    showPhase('intro');
    loadHall();
    setTimeout(function () {
      if (btnContinue) btnContinue.focus();
    }, 120);
  }

  function closeEgg() {
    overlay.classList.remove('map-egg-overlay--open');
    err.textContent = '';
    if (regStatus) regStatus.textContent = '';
    if (input) input.value = '';
    if (signer) signer.value = '';
    sendingOwl = false;
    hallFetchGeneration += 1;
    if (hallDetails) hallDetails.open = false;
    showPhase('intro');
    lastSpeck.focus();
  }

  function tryReveal() {
    var v = input ? input.value : '';
    if (!oathOk(v)) {
      err.textContent = 'The parchment stays stubbornly blank. Try the classic wording—solemnly, and with mischief in mind.';
      return;
    }
    err.textContent = '';
    showPhase('map');
    loadHall();
    if (signer) {
      setTimeout(function () {
        signer.focus();
      }, 120);
    }
  }

  function sendOwl() {
    if (sendingOwl) return;
    var name = signer ? String(signer.value || '').trim() : '';
    if (name.length < 1) {
      if (regStatus) {
        regStatus.textContent = 'The owl needs something to call you—add a name (or alias).';
        regStatus.className = 'map-egg-register-status map-egg-register-status--err';
      }
      return;
    }
    sendingOwl = true;
    if (regStatus) {
      regStatus.textContent = 'Dispatching owl…';
      regStatus.className = 'map-egg-register-status';
    }
    var payload = {
      name: name,
      flavor: currentFlavor,
      page: typeof location !== 'undefined' ? location.pathname + location.search : '',
    };
    fetch('/api/easter-egg-found', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (result) {
        sendingOwl = false;
        if (!result.ok) {
          if (regStatus) {
            regStatus.textContent =
              (result.data && result.data.error) || 'The owl hit a headwind—try again in a moment.';
            regStatus.className = 'map-egg-register-status map-egg-register-status--err';
          }
          return;
        }
        if (regStatus) {
          regStatus.innerHTML =
            'The owl is away. Palmer &amp; Kirkham have been notified (and your name is in the register).';
          regStatus.className = 'map-egg-register-status map-egg-register-status--ok';
        }
        loadHall();
      })
      .catch(function () {
        sendingOwl = false;
        if (regStatus) {
          regStatus.textContent = 'Network trouble—check your connection and try again.';
          regStatus.className = 'map-egg-register-status map-egg-register-status--err';
        }
      });
  }

  specks.forEach(function (speck) {
    speck.addEventListener('click', function (e) {
      e.preventDefault();
      openEgg(speck);
    });
  });

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeEgg();
  });

  overlay.querySelector('[data-map-egg-cancel-intro]').addEventListener('click', closeEgg);
  overlay.querySelector('[data-map-egg-continue]').addEventListener('click', goToOath);

  overlay.querySelector('[data-map-egg-cancel]').addEventListener('click', closeEgg);
  overlay.querySelector('[data-map-egg-submit]').addEventListener('click', tryReveal);

  overlay.querySelector('[data-map-egg-managed]').addEventListener('click', closeEgg);
  overlay.querySelector('[data-map-egg-send-owl]').addEventListener('click', sendOwl);

  if (hallDetails) {
    hallDetails.addEventListener('toggle', function () {
      if (hallDetails.open) loadHall();
    });
  }

  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryReveal();
      }
    });
  }
  if (signer) {
    signer.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendOwl();
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('map-egg-overlay--open')) {
      closeEgg();
    }
  });
})();
