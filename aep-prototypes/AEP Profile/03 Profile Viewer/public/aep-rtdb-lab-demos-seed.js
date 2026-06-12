/**
 * Global settings — demo prep RTDB previews (per LDAP user + Adobe sandbox).
 * Stubs are auto-provisioned via AepDemoConfigRtdb.ensurePrepReady (see aep-demo-config-prep-ui.js).
 */
(function (global) {
  'use strict';

  function buildLabAjoLookupsStub() {
    if (global.AepDemoConfigRtdb && typeof global.AepDemoConfigRtdb.buildFlatLabStub === 'function') {
      return global.AepDemoConfigRtdb.buildFlatLabStub();
    }
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

  global.AepRtdbLabDemosSeed = {
    buildLabAjoLookupsStub: buildLabAjoLookupsStub,
  };

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color =
      kind === 'err' ? 'var(--dash-error, #c9252d)' : kind === 'ok' ? 'var(--dash-success, #12805c)' : 'var(--dash-text-secondary, #64748b)';
  }

  function refreshPreviews() {
    var ldapEl = document.getElementById('aepRtdbLdapPreview');
    var sbEl = document.getElementById('aepRtdbSeedSlugPreview');
    var urlEl = document.getElementById('aepRtdbSandboxUrlPreview');
    var cfg = global.AepDemoConfigRtdb;
    if (!cfg) return;
    var ldap = cfg.getLdapSlugSync() || '—';
    var sb = cfg.getActiveSandboxSlug() || '—';
    if (ldapEl) ldapEl.textContent = ldap;
    if (sbEl) sbEl.textContent = sb;
    if (urlEl && ldap !== '—' && sb !== '—') {
      urlEl.textContent = cfg.sandboxRestUrl(ldap, sb);
    } else if (urlEl) {
      urlEl.textContent = '—';
    }
  }

  function wireRemergeBtn() {
    var btn = document.getElementById('aepRtdbSeedBtn');
    var statusEl = document.getElementById('aepRtdbSeedStatus');
    if (!btn || !global.AepDemoConfigRtdb) return;

    btn.addEventListener('click', function () {
      setStatus(statusEl, 'Re-merging missing sections…', '');
      btn.disabled = true;
      var sb = global.AepDemoConfigRtdb.getActiveSandboxSlug();
      if (!sb) {
        setStatus(statusEl, 'Select an Adobe sandbox first.', 'err');
        btn.disabled = false;
        return;
      }
      global.AepDemoConfigRtdb.clearPrepCache({ sandboxSlug: sb })
        .then(function () {
          return global.AepDemoConfigRtdb.ensurePrepReady({ sandboxSlug: sb });
        })
        .then(function () {
          setStatus(statusEl, 'Missing sections merged for “' + sb + '”.', 'ok');
          refreshPreviews();
          try {
            global.dispatchEvent(new CustomEvent('aep-demo-config-prep-reload'));
          } catch (_e) {}
        })
        .catch(function (e) {
          setStatus(statusEl, String((e && e.message) || e), 'err');
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  function init() {
    refreshPreviews();
    wireRemergeBtn();
    global.addEventListener('aep-global-sandbox-change', refreshPreviews);
    global.addEventListener('aep-access-scope-change', refreshPreviews);
    global.addEventListener('aep-demo-config-changed', refreshPreviews);
    if (global.AepDemoConfigRtdb && typeof global.AepDemoConfigRtdb.whenReady === 'function') {
      global.AepDemoConfigRtdb.whenReady().then(refreshPreviews);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
