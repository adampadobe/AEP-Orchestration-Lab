/**
 * Global settings — seed `ajoLookups/{sandbox}` for Contact centre + iPad demos (Firebase RTDB).
 * Requires: firebase compat (app, auth, database), anonymous auth from aep-lab-sandbox-sync.
 */
(function (global) {
  'use strict';

  function buildLabAjoLookupsStub() {
    var dep = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    return {
      StaffPortal: {
        AgentName: 'Demo agent',
        AgentID: 'AG-001',
        AgentType: 'Customer Care',
        Colour: '#1473e6',
        FlightTerminalInfo: 'Terminal 3 · Concourse B',
        CaptainName: 'Captain Lee',
        CoPilotName: 'First Officer Jordan',
      },
      CoreDemoData: {
        name: 'Etihad Airways',
        airlineName: 'Etihad Airways',
      },
      Mobile: {
        StaffName: 'Demo agent',
        StaffId: 'AG-001',
        StaffRole: 'Gate lead',
        Terminal: 'T3',
        Gate: 'B12',
        paxOnBoard: '184',
        CrewManifest: [
          { role: 'Purser', name: 'S. Ahmed' },
          { role: 'Lead', name: 'J. Smith' },
        ],
      },
      TravelData: {
        flightNumber: 'EY455',
        route: 'AUH → LHR',
        origin: 'AUH',
        destination: 'LHR',
        departure: '14:05 local',
        departureIso: dep,
        flightStatus: 'Boarding',
        gate: 'B12',
      },
      CustomerLoyalty: {
        tier: 'Gold',
        miles: '128400',
        balance: '128400',
      },
    };
  }

  var RESERVED_SLUGS = {
    workspaceclaims: true,
    userworkspaceowners: true,
    userworkspaces: true,
    ajolookups: true,
  };

  function normalizeAjoLookupSlug(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    if (s.length < 2 || s.length > 48) return '';
    if (RESERVED_SLUGS[s]) return '';
    return s;
  }

  function getActiveSandboxSlug() {
    try {
      if (global.AepAccessScope && global.AepAccessScope.getAccessMode && global.AepAccessScope.getAccessMode() === 'workspace') {
        return '';
      }
    } catch (e0) {}
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        return normalizeAjoLookupSlug(global.AepGlobalSandbox.getSandboxName());
      }
    } catch (e1) {}
    return '';
  }

  function ensureFirebaseApp() {
    if (typeof firebase === 'undefined' || !global.firebaseDatabaseConfig) return null;
    if (!firebase.apps.length) {
      firebase.initializeApp(global.firebaseDatabaseConfig);
    }
    return firebase.app();
  }

  function ensureWorkspaceClaim(database, uid, slug) {
    var refClaim = database.ref('workspaceClaims/' + slug);
    return refClaim.once('value').then(function (snap) {
      var v = snap.val();
      if (v === uid) return Promise.resolve();
      if (v != null && v !== uid) {
        return Promise.reject(
          new Error(
            'slug_taken: The workspace slug "' +
              slug +
              '" is already claimed by another Firebase user. Pick a different Adobe sandbox technical name, or coordinate via firebase-database.html.',
          ),
        );
      }
      return refClaim
        .transaction(function (current) {
          if (current === null || current === undefined) return uid;
          if (current === uid) return uid;
          return undefined;
        })
        .then(function (result) {
          if (!result.committed || result.snapshot.val() !== uid) {
            return Promise.reject(new Error('claim_failed'));
          }
        });
    });
  }

  function mergeStub(database, slug, stub) {
    return database.ref('ajoLookups/' + slug).update(stub);
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color =
      kind === 'err' ? 'var(--dash-error, #c9252d)' : kind === 'ok' ? 'var(--dash-success, #12805c)' : 'var(--dash-text-secondary, #64748b)';
  }

  function refreshSlugPreview(previewEl) {
    if (!previewEl) return;
    var s = getActiveSandboxSlug();
    previewEl.textContent = s || '(select an Adobe sandbox — workspace mode has no RTDB slug)';
  }

  function wire() {
    var btn = document.getElementById('aepRtdbSeedBtn');
    var statusEl = document.getElementById('aepRtdbSeedStatus');
    var previewEl = document.getElementById('aepRtdbSeedSlugPreview');
    var jsonTa = document.getElementById('aepRtdbSeedJsonPreview');
    if (!btn || !global.AepLabSandboxSync || typeof global.AepLabSandboxSync.whenReady !== 'object') return;

    function writeJsonPreview() {
      var stub = buildLabAjoLookupsStub();
      if (jsonTa) {
        try {
          jsonTa.value = JSON.stringify(stub, null, 2);
        } catch (e) {
          jsonTa.value = '{}';
        }
      }
      return stub;
    }

    writeJsonPreview();

    function tick() {
      refreshSlugPreview(previewEl);
    }
    tick();
    global.addEventListener('aep-global-sandbox-change', tick);
    global.addEventListener('aep-access-scope-change', tick);

    btn.addEventListener('click', function () {
      setStatus(statusEl, 'Working…', '');
      btn.disabled = true;
      var slug = getActiveSandboxSlug();
      if (!slug) {
        setStatus(
          statusEl,
          'Select an Adobe sandbox first (access mode must be Adobe sandbox, not “no Adobe sandbox”).',
          'err',
        );
        btn.disabled = false;
        return;
      }

      global.AepLabSandboxSync.whenReady
        .then(function () {
          ensureFirebaseApp();
          var auth = firebase.auth();
          var db = firebase.database();
          var u = auth.currentUser;
          if (!u) {
            return Promise.reject(new Error('Not signed in — wait for lab sync or enable Anonymous auth in Firebase Console.'));
          }
          var stub = buildLabAjoLookupsStub();
          if (jsonTa) {
            try {
              jsonTa.value = JSON.stringify(stub, null, 2);
            } catch (e2) {
              /* ignore */
            }
          }
          return ensureWorkspaceClaim(db, u.uid, slug).then(function () {
            return mergeStub(db, slug, stub);
          });
        })
        .then(function () {
          setStatus(statusEl, 'Updated ajoLookups/' + slug + ' (merged stub). Reload Contact centre / iPad demos.', 'ok');
        })
        .catch(function (e) {
          var msg = String((e && e.message) || e);
          if (msg.indexOf('slug_taken') === 0 || msg.indexOf('claim_failed') !== -1) {
            setStatus(statusEl, msg.replace(/^slug_taken: /, ''), 'err');
          } else {
            setStatus(statusEl, msg, 'err');
          }
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})(typeof window !== 'undefined' ? window : this);
