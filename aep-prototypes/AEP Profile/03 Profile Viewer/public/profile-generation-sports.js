/**
 * Profile Generation — Sports industry section.
 *
 * Thin per-industry config that delegates the heavy lifting to the shared
 * runtime in profile-generation-industry-runtime.js. Same setup wizard,
 * Customer Analytics, Generate-N flow, and recent-snapshot picker — only
 * the sports-specific attributes (favourite sport / team, fan segment,
 * jersey size, merchandise spend, last attended event) and fan flags
 * differ.
 *
 * Schema-valid push paths:
 *
 *   tenant subtree (`_<tenant>.…`) — auto-prefixed by the proxy
 *     • industrySports.{favouriteSport, favouriteTeam, fanSegment,
 *         jerseySize, merchSpendBand, lastAttendedEvent}
 *     • industrySports.fanFlags.{seasonTicket, fantasyPlayer, betsRegularly,
 *         streamLive, newsletterSub, childFan}
 *           ← existing operator-context dropdowns + flags. Declared in the
 *              auto-created `Profile Sports v1` tenant FG body, see
 *              functions/sportsProfileInfraService.js.
 *     • individualCharacteristics.core.favouriteCategory  ← always 'sports'
 *     • individualCharacteristics.core.favouriteSubCategory  ← favouriteSport
 *     • scoring.product.affinity  ← favouriteTeam value (free-text affinity
 *           leaf on Profile Core v2; lets generic audience builders target by
 *           team without depending on the industrySports.* tenant subtree).
 *
 * Adobe ships no Profile-class Sports OOTB FG today, so unlike the other
 * industries there is no root-mixin section to expose.
 *
 * Wire-up:
 *   - DOM scope: #sportsProfilePanel.
 *   - Endpoints: /api/sports-profile-infra/* + /api/sports-profile-connection.
 *   - Counter / recent / scaler shared via window.AepProfileGenShared.
 */
(function () {
  'use strict';
  if (!window.AepProfileGenIndustry || typeof window.AepProfileGenIndustry.bind !== 'function') {
    console.error('[sports-profile] AepProfileGenIndustry runtime missing.');
    return;
  }

  const SCALAR_FIELDS = [
    { id: 'sportsFavouriteSport',     key: 'favouriteSport' },
    { id: 'sportsFavouriteTeam',      key: 'favouriteTeam' },
    { id: 'sportsFanSegment',         key: 'fanSegment' },
    { id: 'sportsJerseySize',         key: 'jerseySize' },
    { id: 'sportsMerchSpendBand',     key: 'merchSpendBand' },
    { id: 'sportsLastAttendedEvent',  key: 'lastAttendedEvent' },
  ];
  const FLAG_TOGGLES = [
    { id: 'sportsSeasonTicket',  key: 'seasonTicket' },
    { id: 'sportsFantasyPlayer', key: 'fantasyPlayer' },
    { id: 'sportsBetsRegularly', key: 'betsRegularly' },
    { id: 'sportsStreamLive',    key: 'streamLive' },
    { id: 'sportsNewsletterSub', key: 'newsletterSub' },
    { id: 'sportsChildFan',      key: 'childFan' },
  ];

  // Realistic team pools per favourite-sport option value (HTML
  // <select id="sportsFavouriteSport"> values, see profile-generation.html).
  // The HTML uses `football` for "Football / soccer" and `american_football`
  // for the NFL — pools below match those keys verbatim. Sports with no
  // canonical "team" concept (tennis is individual; rugby/cricket/motorsport
  // pull from a curated short list) keep a small pool so personas read as
  // believable Sports customers.
  const TEAMS_BY_SPORT = {
    football: [
      'Manchester United', 'Real Madrid', 'Barcelona', 'Arsenal',
      'Bayern Munich', 'PSG', 'Liverpool', 'Chelsea',
    ],
    american_football: [
      'Patriots', 'Chiefs', '49ers', 'Cowboys',
      'Eagles', 'Packers', 'Steelers', 'Ravens',
    ],
    basketball: [
      'Lakers', 'Celtics', 'Warriors', 'Heat',
      'Bulls', 'Knicks', 'Nets', 'Bucks',
    ],
    baseball: [
      'Yankees', 'Red Sox', 'Dodgers', 'Giants',
      'Cubs', 'Cardinals', 'Mets', 'Astros',
    ],
    hockey: [
      'Maple Leafs', 'Rangers', 'Bruins', 'Blackhawks',
      'Penguins', 'Capitals', 'Lightning', 'Avalanche',
    ],
    rugby: [
      'All Blacks', 'Springboks', 'Saracens', 'Crusaders',
      'Toulouse', 'Leinster', 'Stormers', 'Brumbies',
    ],
    cricket: [
      'Mumbai Indians', 'Chennai Super Kings', 'England', 'Australia',
      'India', 'Pakistan', 'South Africa', 'New Zealand',
    ],
    tennis: [
      'No team — individual sport',
    ],
    motorsport: [
      'Ferrari', 'Mercedes', 'Red Bull', 'McLaren',
      'Aston Martin', 'Williams', 'Haas', 'Alpine',
    ],
  };
  const TEAMS_PLACEHOLDER = '— Pick a sport first —';

  const $ = (id) => document.getElementById(id);
  const trim = (el) => (el && typeof el.value === 'string') ? el.value.trim() : '';
  const getCheck = (id) => { const el = $(id); return el ? !!el.checked : false; };
  const setCheck = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  const setSelect = (id, v) => {
    const el = $(id);
    if (!el || v == null) return;
    const val = String(v).trim();
    if (!val) return;
    const opts = Array.from(el.options || []);
    const exact = opts.find((o) => o.value === val);
    if (exact) { el.value = exact.value; return; }
    const ci = opts.find((o) => String(o.value).toLowerCase() === val.toLowerCase());
    if (ci) el.value = ci.value;
  };
  const selectValuesNonEmpty = (id) => {
    const el = $(id); if (!el || !el.options) return [];
    const out = []; for (let i = 0; i < el.options.length; i++) { const v = el.options[i].value; if (v !== '') out.push(v); } return out;
  };

  // Repopulate the favouriteTeam <select> options from TEAMS_BY_SPORT for
  // the currently-picked favourite sport. Preserves the operator's current
  // pick when it still appears in the new pool; otherwise clears the value
  // so the operator notices the team field needs a re-pick. Always emits a
  // single placeholder option at the top for the empty-value state.
  function repopulateTeamOptions(preserveValue) {
    const select = $('sportsFavouriteTeam');
    if (!select) return;
    const sport = trim($('sportsFavouriteSport'));
    const pool = (sport && TEAMS_BY_SPORT[sport]) ? TEAMS_BY_SPORT[sport] : [];
    const currentValue = preserveValue != null ? String(preserveValue) : trim(select);
    const placeholder = sport ? '— Select a team —' : TEAMS_PLACEHOLDER;
    const html = [`<option value="">${placeholder}</option>`]
      .concat(pool.map((team) => {
        const safe = String(team).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return `<option value="${safe}">${safe}</option>`;
      }))
      .join('');
    select.innerHTML = html;
    if (currentValue && pool.includes(currentValue)) {
      select.value = currentValue;
    } else {
      select.value = '';
    }
  }

  window.AepProfileGenIndustry.bind({
    industryKey: 'sports',
    industryDisplayName: 'Sports',
    panelShownEvent: 'aep-sports-panel-shown',
    apiPathPrefix: 'sports-profile',
    defaultFlowName: 'AEP Lab - Sports Profile - Dataflow',
    ids: {
      profilePanel: 'sportsProfilePanel',
      checkInfraBtn: 'sportsCheckInfraBtn',
      stepRunAllBtn: 'sportsStepRunAllBtn',
      infraProgressList: 'sportsInfraProgressList',
      stepCreateSchemaBtn: 'sportsStepCreateSchemaBtn',
      stepAttachFgBtn: 'sportsStepAttachFgBtn',
      stepCreateDatasetBtn: 'sportsStepCreateDatasetBtn',
      stepHttpFlowBtn: 'sportsStepHttpFlowBtn',
      enableProfileBtn: 'sportsEnableProfileBtn',
      enableProfileProgressList: 'sportsEnableProfileProgressList',
      infraStatusMessage: 'sportsInfraStatusMessage',
      infraDetails: 'sportsProfileInfraDetails',
      infraHint: 'sportsProfileInfraHint',
      streamSchemaId: 'sportsStreamSchemaId',
      streamDatasetId: 'sportsStreamDatasetId',
      streamXdmKey: 'sportsStreamXdmKey',
      streamFlowId: 'sportsStreamFlowId',
      streamFlowName: 'sportsStreamFlowName',
      streamUrl: 'sportsStreamUrl',
      loadFromFirebaseBtn: 'sportsLoadFromFirebaseBtn',
      fetchFlowFromAepBtn: 'sportsFetchFlowFromAepBtn',
      saveStreamBtn: 'sportsSaveStreamBtn',
      lookupNs: 'sportsLookupNs',
      lookupIdentifier: 'sportsLookupIdentifier',
      lookupBtn: 'sportsLookupBtn',
      lookupRecent: 'sportsLookupIdentifierRecent',
      baseEmail: 'sportsBaseEmail',
      counter: 'sportsCounter',
      generateCount: 'sportsGenerateCount',
      emailPreview: 'sportsEmailPreview',
      resetCounterBtn: 'sportsResetCounterBtn',
      updateProfileBtn: 'sportsUpdateProfileBtn',
      generateBtn: 'sportsGenerateBtn',
      dryRun: 'sportsDryRun',
      markTestProfile: 'sportsMarkTestProfile',
      profileMessage: 'sportsProfileMessage',
      firstName: 'sportsFirstName',
      lastName: 'sportsLastName',
      birthDate: 'sportsBirthDate',
      age: 'sportsAge',
      churn: 'sportsChurn',
      churnValue: 'sportsChurnValue',
      propensity: 'sportsPropensity',
      propensityValue: 'sportsPropensityValue',
      nps: 'sportsNps',
      aov: 'sportsAov',
      aovValue: 'sportsAovValue',
      preferredChannel: 'sportsPreferredChannel',
      gender: 'sportsGender',
      loyaltyEnabled: 'sportsLoyaltyEnabled',
      loyaltyFields: 'sportsLoyaltyFields',
      loyaltyID: 'sportsLoyaltyID',
      loyaltyTier: 'sportsLoyaltyTier',
      loyaltyPoints: 'sportsLoyaltyPoints',
      loyaltyRandomBtn: 'sportsLoyaltyRandomBtn',
      language: 'sportsLanguage',
      recentPicker: 'sportsRecentPicker',
      recentSelect: 'sportsRecentSelect',
      recentLoadBtn: 'sportsRecentLoadBtn',
      recentDetails: 'sportsRecentDetails',
      recentListBody: 'sportsRecentListBody',
      recentCountLabel: 'sportsRecentCountLabel',
      debug: 'sportsProfileDebug',
      debugClientRequest: 'sportsDebugClientRequest',
      debugStatus: 'sportsDebugStatus',
      debugResponse: 'sportsDebugResponse',
      payloadPreview: 'sportsPayloadPreview',
      payloadPreviewBtn: 'sportsPayloadPreviewBtn',
      payloadPreviewPre: 'sportsPayloadPreviewPre',
    },
    industry: {
      snapshot() {
        const flags = {};
        FLAG_TOGGLES.forEach((t) => { flags[t.key] = getCheck(t.id); });
        const scalar = {};
        SCALAR_FIELDS.forEach((f) => { const el = $(f.id); const v = el ? String(el.value || '').trim() : ''; if (v) scalar[f.key] = v; });
        return { ...scalar, fanFlags: flags };
      },
      buildUpdates({ push }) {
        // ---- Original industrySports.* pushes (kept; valid via Profile Sports v1) ----
        SCALAR_FIELDS.forEach((f) => {
          const el = $(f.id); const v = el ? String(el.value || '').trim() : '';
          if (v) push(`industrySports.${f.key}`, v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const el = $(t.id); if (!el) return;
          push(`industrySports.fanFlags.${t.key}`, !!el.checked);
        });

        // ---- Operator-context dropdown re-mappings onto Profile Core v2 ----
        // The auto-created Profile Sports v1 FG declares industrySports.* but
        // Adobe ships no Profile-class Sports OOTB FG to extend the schema
        // further. To make Sports profiles discoverable from generic
        // audience builders we fan out the favourite-sport / team values
        // onto Profile Core v2 leaves that every other industry sees too.
        const sport = trim($('sportsFavouriteSport'));
        if (sport) {
          // 'sports' is a reasonable parent for the generic favouriteCategory;
          // the specific sport carries the sub-category.
          push('individualCharacteristics.core.favouriteCategory', 'sports');
          push('individualCharacteristics.core.favouriteSubCategory', sport);
        }
        const team = trim($('sportsFavouriteTeam'));
        if (team) {
          // scoring.product.affinity is a string leaf on Profile Core v2;
          // free-form values are accepted.
          push('scoring.product.affinity', team);
        }
      },
      applyFindResult({ findBySuffix, findByKeywords, setSelectValueLoose }) {
        // Set non-team scalar fields first; then handle favouriteTeam after
        // we've populated favouriteSport so the team's option pool exists
        // when we assign the value.
        SCALAR_FIELDS.forEach((f) => {
          if (f.id === 'sportsFavouriteTeam') return;
          const v = findBySuffix([`industrysports.${f.key.toLowerCase()}`, f.key.toLowerCase()]) ||
                    findByKeywords('industrysports', f.key.toLowerCase());
          if (v) setSelectValueLoose($(f.id), v);
        });
        FLAG_TOGGLES.forEach((t) => {
          const v = findBySuffix([`fanflags.${t.key.toLowerCase()}`]) ||
                    findByKeywords('industrysports', 'fanflags', t.key.toLowerCase());
          if (v === '' || v == null) return;
          setCheck(t.id, String(v).toLowerCase() === 'true');
        });
        // Hydrate sport from Profile Core v2 if the industrySports.* tenant
        // subtree value was missing (e.g. cross-industry profile lookup).
        if (!trim($('sportsFavouriteSport'))) {
          const sub = findBySuffix(['individualcharacteristics.core.favouritesubcategory']) ||
                      findByKeywords('individualcharacteristics', 'core', 'favouritesubcategory');
          if (sub) setSelectValueLoose($('sportsFavouriteSport'), sub);
        }
        // Now resolve favouriteTeam — first repopulate the team options for
        // the chosen sport so the pool contains the team value we're about
        // to assign, THEN look up the team and set it.
        repopulateTeamOptions();
        const teamFromTenant = findBySuffix(['industrysports.favouriteteam']) ||
                               findByKeywords('industrysports', 'favouriteteam');
        const teamFromCore = findBySuffix(['scoring.product.affinity']) ||
                             findByKeywords('scoring', 'product', 'affinity');
        const team = teamFromTenant || teamFromCore;
        if (team) {
          const teamVal = String(team).trim();
          const teamSelect = $('sportsFavouriteTeam');
          if (teamSelect) {
            const matchExisting = Array.from(teamSelect.options || []).find(
              (o) => o.value === teamVal
            );
            if (matchExisting) {
              teamSelect.value = teamVal;
            } else if (teamVal) {
              // Profile carried a team value not in our curated pool — add
              // it so the operator's lookup never silently loses data.
              const opt = document.createElement('option');
              opt.value = teamVal;
              opt.textContent = teamVal;
              teamSelect.appendChild(opt);
              teamSelect.value = teamVal;
            }
          }
        }
      },
      loadFromSnapshot(snap) {
        if (!snap || typeof snap !== 'object') return;
        // Same ordering as applyFindResult: sport first, then repopulate the
        // team pool, then assign the team. Snapshot may carry team values
        // from older sessions that pre-dated TEAMS_BY_SPORT (e.g. team_a),
        // so we tolerate values that aren't in the curated pool.
        SCALAR_FIELDS.forEach((f) => {
          if (f.id === 'sportsFavouriteTeam') return;
          setSelect(f.id, snap[f.key]);
        });
        const flags = (snap.fanFlags && typeof snap.fanFlags === 'object') ? snap.fanFlags : {};
        FLAG_TOGGLES.forEach((t) => { setCheck(t.id, !!flags[t.key]); });
        repopulateTeamOptions();
        const team = snap.favouriteTeam;
        if (team) {
          const teamSelect = $('sportsFavouriteTeam');
          if (teamSelect) {
            const teamVal = String(team).trim();
            const matchExisting = Array.from(teamSelect.options || []).find(
              (o) => o.value === teamVal
            );
            if (matchExisting) {
              teamSelect.value = teamVal;
            } else if (teamVal) {
              const opt = document.createElement('option');
              opt.value = teamVal;
              opt.textContent = teamVal;
              teamSelect.appendChild(opt);
              teamSelect.value = teamVal;
            }
          }
        }
      },
      summarise(snap) {
        if (!snap || !snap.industry) return '';
        const ind = snap.industry;
        const parts = [];
        if (ind.favouriteSport) parts.push(ind.favouriteSport.replace(/_/g, ' '));
        if (ind.favouriteTeam) parts.push(ind.favouriteTeam.replace(/_/g, ' '));
        if (ind.fanSegment) parts.push(ind.fanSegment);
        if (ind.merchSpendBand) parts.push(`merch ${ind.merchSpendBand.replace(/_/g, ' ')}`);
        if (ind.fanFlags && typeof ind.fanFlags === 'object') {
          const on = Object.entries(ind.fanFlags).filter(([, v]) => !!v);
          if (on.length) parts.push(`${on.length} flags`);
        }
        return parts.join(' · ');
      },
      randomizePersona({ randomPick: pick }) {
        // Fill non-team scalar fields. We deliberately skip the team here
        // so it can be sourced from the realistic TEAMS_BY_SPORT pool keyed
        // off the (just-randomised) favourite sport — picking from the
        // <select>'s own placeholder option set would always pick
        // "— Pick a sport first —" or nothing.
        SCALAR_FIELDS.forEach((f) => {
          if (f.id === 'sportsFavouriteTeam') return;
          const opts = selectValuesNonEmpty(f.id);
          if (opts.length) { const el = $(f.id); if (el) el.value = pick(opts); }
        });
        // Repopulate the team pool now the sport is known, then pick a
        // realistic team value from TEAMS_BY_SPORT (or leave blank when
        // the sport has no curated pool).
        repopulateTeamOptions();
        const sport = trim($('sportsFavouriteSport'));
        const teamPool = (sport && TEAMS_BY_SPORT[sport]) ? TEAMS_BY_SPORT[sport] : [];
        if (teamPool.length) {
          const teamSelect = $('sportsFavouriteTeam');
          const team = pick(teamPool);
          if (teamSelect && team) teamSelect.value = team;
        }

        // Fan-flag pass via the shared randomizeFlagToggles helper so the
        // weights sit in one declarative table that audit tooling can
        // reason about (replaces the loose per-flag `Math.random() < N`
        // calls we previously had inline).
        const helpers = (window.AepProfileGenIndustry && window.AepProfileGenIndustry.helpers) || null;
        if (helpers && typeof helpers.randomizeFlagToggles === 'function') {
          helpers.randomizeFlagToggles([
            { id: 'sportsSeasonTicket',  weight: 0.20 },
            { id: 'sportsFantasyPlayer', weight: 0.30 },
            { id: 'sportsBetsRegularly', weight: 0.20 },
            { id: 'sportsStreamLive',    weight: 0.65 },
            { id: 'sportsNewsletterSub', weight: 0.55 },
            { id: 'sportsChildFan',      weight: 0.30 },
          ]);
        } else {
          setCheck('sportsSeasonTicket',  Math.random() < 0.20);
          setCheck('sportsFantasyPlayer', Math.random() < 0.30);
          setCheck('sportsBetsRegularly', Math.random() < 0.20);
          setCheck('sportsStreamLive',    Math.random() < 0.65);
          setCheck('sportsNewsletterSub', Math.random() < 0.55);
          setCheck('sportsChildFan',      Math.random() < 0.30);
        }

        // Cross-flag correlations (audit §6.7). Only nudge AFTER the random
        // first pass so the population still hits the marginal weights
        // above on average; the bias here just rules out implausible
        // combinations.
        const weightedBool = (helpers && typeof helpers.weightedBool === 'function')
          ? helpers.weightedBool
          : (p) => Math.random() < p;

        // attendsLiveGames === true → seasonTicketHolder 60% bias true.
        // The "live attendance" signal in this UI is the lastAttendedEvent
        // dropdown (anything other than `never` / blank → has attended).
        const lastAttended = trim($('sportsLastAttendedEvent'));
        const attendsLive = lastAttended && lastAttended !== 'never';
        if (attendsLive && weightedBool(0.60)) {
          setCheck('sportsSeasonTicket', true);
        }

        // watchesEverySeason ≈ streamLive (the streamLive flag is the
        // only "watches every game" signal in the schema). When true,
        // bias fanSegment toward the top tiers.
        if (getCheck('sportsStreamLive')) {
          const fanSegmentEl = $('sportsFanSegment');
          const topTiers = ['superfan', 'day_one'];
          if (fanSegmentEl) {
            const opts = selectValuesNonEmpty('sportsFanSegment');
            const candidates = topTiers.filter((t) => opts.includes(t));
            if (candidates.length && weightedBool(0.70)) {
              fanSegmentEl.value = pick(candidates);
            }
          }
        }

        // participatesInFantasy → 70% bias newsletterSub true (engaged
        // fantasy players almost always subscribe to club newsletters).
        if (getCheck('sportsFantasyPlayer') && weightedBool(0.70)) {
          setCheck('sportsNewsletterSub', true);
        }
      },
    },
  });

  // ----- Post-bind DOM wiring (runs after the runtime sets up its panel). -----

  // Repopulate the team pool whenever the operator picks a different sport.
  // Initial paint runs once on module load so the placeholder text matches
  // whatever the HTML currently holds (typically the empty default).
  const sportEl = $('sportsFavouriteSport');
  if (sportEl) {
    sportEl.addEventListener('change', () => repopulateTeamOptions());
  }
  repopulateTeamOptions();
})();
