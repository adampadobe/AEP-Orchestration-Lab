/**
 * Per-user + per-sandbox demo config in Firebase RTDB.
 * Path: ajoLookups/{ldapSlug}/sandboxes/{sandboxSlug}/{section}
 * Sections: iPad, CallCentre, AgenticLayer, ExpAccelerator, ExpVisualiser, ContentDecisionLive
 */
(function (global) {
  'use strict';

  var SECTIONS = {
    iPad: 'iPad',
    CallCentre: 'CallCentre',
    AgenticLayer: 'AgenticLayer',
    ExpAccelerator: 'ExpAccelerator',
    ExpVisualiser: 'ExpVisualiser',
    ContentDecisionLive: 'ContentDecisionLive',
  };

  var cachedLdapSlug = '';
  var saveTimers = {};
  var SAVE_DEBOUNCE_MS = 800;

  function normalizeSlug(raw) {
    if (global.AepLdapSlug && typeof global.AepLdapSlug.normalizeLdapSlug === 'function') {
      return global.AepLdapSlug.normalizeLdapSlug(raw);
    }
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    if (s.length < 2 || s.length > 48) return '';
    return s;
  }

  function getRtdbBase() {
    var cfg = global.firebaseDatabaseConfig || {};
    return String(cfg.databaseURL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com').replace(/\/$/, '');
  }

  function ensureFirebaseApp() {
    if (typeof firebase === 'undefined' || !global.firebaseDatabaseConfig) return false;
    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(global.firebaseDatabaseConfig);
      } catch (_e) {
        return false;
      }
    }
    return true;
  }

  function getDatabase() {
    if (!ensureFirebaseApp()) return null;
    return firebase.database();
  }

  function getActiveSandboxSlug() {
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        return normalizeSlug(global.AepGlobalSandbox.getSandboxName());
      }
    } catch (_e) {}
    try {
      return normalizeSlug(localStorage.getItem('aepGlobalSandboxName'));
    } catch (_e2) {}
    return '';
  }

  function ldapFromEmail(email) {
    if (global.AepLdapSlug && typeof global.AepLdapSlug.ldapSlugFromEmail === 'function') {
      return global.AepLdapSlug.ldapSlugFromEmail(email);
    }
    return normalizeSlug(String(email || '').split('@')[0]);
  }

  function getLdapSlugSync() {
    if (cachedLdapSlug) return cachedLdapSlug;
    try {
      if (global.AepAccessScope && typeof global.AepAccessScope.getWorkspaceSlug === 'function') {
        var ws = normalizeSlug(global.AepAccessScope.getWorkspaceSlug());
        if (ws) {
          cachedLdapSlug = ws;
          return ws;
        }
      }
    } catch (_e) {}
    try {
      var stored = normalizeSlug(localStorage.getItem('aepWorkspaceSlug'));
      if (stored) {
        cachedLdapSlug = stored;
        return stored;
      }
    } catch (_e2) {}
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        var u = firebase.auth().currentUser;
        if (u && u.email) {
          var fromEmail = ldapFromEmail(u.email);
          if (fromEmail) {
            cachedLdapSlug = fromEmail;
            return fromEmail;
          }
        }
      }
    } catch (_e3) {}
    return '';
  }

  function setCachedLdapSlug(slug) {
    cachedLdapSlug = normalizeSlug(slug) || '';
  }

  function resolveLdapSlugAsync() {
    var sync = getLdapSlugSync();
    if (sync) return Promise.resolve(sync);

    return fetchWorkspaceProfileSlug().then(function (profileSlug) {
      if (profileSlug) {
        cachedLdapSlug = profileSlug;
        try {
          if (global.AepAccessScope && typeof global.AepAccessScope.setWorkspaceSlug === 'function') {
            global.AepAccessScope.setWorkspaceSlug(profileSlug);
          }
        } catch (_e) {}
        return profileSlug;
      }
      return resolveLdapFromRtdbOwner();
    });
  }

  function authHeadersPromise() {
    return new Promise(function (resolve) {
      if (!ensureFirebaseApp()) {
        resolve({});
        return;
      }
      var auth = firebase.auth();
      var u = auth.currentUser;
      if (!u) {
        resolve({});
        return;
      }
      u.getIdToken()
        .then(function (t) {
          resolve(t ? { Authorization: 'Bearer ' + t } : {});
        })
        .catch(function () {
          resolve({});
        });
    });
  }

  function fetchWorkspaceProfileSlug() {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization) return '';
      return fetch('/api/lab/workspace-profile', { headers: headers })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          var slug = data && data.profile && data.profile.workspaceSlug;
          return normalizeSlug(slug);
        })
        .catch(function () {
          return '';
        });
    });
  }

  function resolveLdapFromRtdbOwner() {
    var db = getDatabase();
    if (!db || typeof firebase === 'undefined' || !firebase.auth) return Promise.resolve('');
    var u = firebase.auth().currentUser;
    if (!u || !u.uid) return Promise.resolve('');
    return db
      .ref('userWorkspaceOwners/' + u.uid)
      .once('value')
      .then(function (snap) {
        var v = snap.val();
        var slug = normalizeSlug(v != null ? String(v) : '');
        if (slug) cachedLdapSlug = slug;
        return slug;
      })
      .catch(function () {
        return '';
      });
  }

  function sectionPath(ldapSlug, sandboxSlug, section) {
    return 'ajoLookups/' + ldapSlug + '/sandboxes/' + sandboxSlug + '/' + section;
  }

  function sandboxRestUrl(ldapSlug, sandboxSlug) {
    return getRtdbBase() + '/ajoLookups/' + encodeURIComponent(ldapSlug) + '/sandboxes/' + encodeURIComponent(sandboxSlug) + '.json';
  }

  function dispatchConfigChanged(detail) {
    try {
      global.dispatchEvent(new CustomEvent('aep-demo-config-changed', { detail: detail || {} }));
    } catch (_e) {}
  }

  function buildFlatLabStub() {
    if (global.AepRtdbLabDemosSeed && typeof global.AepRtdbLabDemosSeed.buildLabAjoLookupsStub === 'function') {
      return global.AepRtdbLabDemosSeed.buildLabAjoLookupsStub();
    }
    var dep = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    return {
      StaffPortal: {
        AgentName: 'Demo agent',
        AgentID: 'AG-001',
        AgentType: 'Customer Care',
        Colour: '#1473e6',
      },
      CoreDemoData: { name: 'Etihad Airways', airlineName: 'Etihad Airways' },
      Mobile: { StaffName: 'Demo agent', StaffId: 'AG-001' },
      TravelData: { flightNumber: 'EY455', route: 'AUH → LHR', departureIso: dep, gate: 'B12' },
      CustomerLoyalty: { tier: 'Gold', miles: '128400' },
    };
  }

  function splitStubIntoSections(flat) {
    var src = flat && typeof flat === 'object' ? flat : buildFlatLabStub();
    return {
      iPad: {
        StaffPortal: src.StaffPortal || {},
        CoreDemoData: src.CoreDemoData || {},
        Mobile: src.Mobile || {},
        TravelData: src.TravelData || {},
        CustomerLoyalty: src.CustomerLoyalty || {},
      },
      CallCentre: {
        StaffPortal: src.StaffPortal || {},
        CoreDemoData: src.CoreDemoData || {},
        Mobile: src.Mobile || {},
        industryId: 'travel',
      },
      AgenticLayer: {
        agentUrls: {
          brand: '',
          product: '',
          operational: '',
          field: '',
          audience: '',
          journey: '',
          data: '',
          support: '',
        },
      },
      ExpAccelerator: {},
      ExpVisualiser: {},
      ContentDecisionLive: {},
    };
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    });
  }

  /** Legacy flat ajoLookups/{sandbox} or ajoLookups/{ldap} top-level keys. */
  function loadLegacyFlat(sandboxSlug, ldapSlug) {
    var base = getRtdbBase();
    var candidates = [];
    if (sandboxSlug) candidates.push(base + '/ajoLookups/' + encodeURIComponent(sandboxSlug) + '.json');
    if (ldapSlug && ldapSlug !== sandboxSlug) {
      candidates.push(base + '/ajoLookups/' + encodeURIComponent(ldapSlug) + '.json');
    }
    var chain = Promise.resolve(null);
    candidates.forEach(function (url) {
      chain = chain.then(function (found) {
        if (found) return found;
        return fetchJson(url).then(function (data) {
          if (!data || typeof data !== 'object') return null;
          if (data.sandboxes) return null;
          if (data.StaffPortal || data.TravelData || data.CoreDemoData) return data;
          return null;
        });
      });
    });
    return chain;
  }

  function loadSection(section, opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      if (!ldapSlug || !sandboxSlug) {
        return loadLegacyFlat(sandboxSlug, ldapSlug).then(function (legacy) {
          if (!legacy) return null;
          if (section === SECTIONS.iPad || section === SECTIONS.CallCentre) {
            var copy = Object.assign({}, legacy);
            if (section === SECTIONS.CallCentre && !copy.industryId) copy.industryId = 'travel';
            return copy;
          }
          if (section === SECTIONS.AgenticLayer) return { agentUrls: splitStubIntoSections().AgenticLayer.agentUrls };
          return legacy;
        });
      }

      var url =
        getRtdbBase() +
        '/' +
        sectionPath(ldapSlug, sandboxSlug, section) +
        '.json';
      return fetchJson(url).then(function (nested) {
        if (nested && typeof nested === 'object' && Object.keys(nested).length) return nested;
        return loadLegacyFlat(sandboxSlug, ldapSlug).then(function (legacy) {
          if (!legacy) return null;
          if (section === SECTIONS.iPad) {
            return {
              StaffPortal: legacy.StaffPortal || {},
              CoreDemoData: legacy.CoreDemoData || {},
              Mobile: legacy.Mobile || {},
              TravelData: legacy.TravelData || {},
              CustomerLoyalty: legacy.CustomerLoyalty || {},
            };
          }
          if (section === SECTIONS.CallCentre) {
            return {
              StaffPortal: legacy.StaffPortal || {},
              CoreDemoData: legacy.CoreDemoData || {},
              Mobile: legacy.Mobile || {},
              industryId: legacy.industryId || 'travel',
            };
          }
          if (section === SECTIONS.AgenticLayer) {
            return { agentUrls: splitStubIntoSections().AgenticLayer.agentUrls };
          }
          return legacy;
        });
      });
    });
  }

  /** Flat iPad-shaped object for etihad-ipad.js compatibility. */
  function loadIPadFlat(opts) {
    return loadSection(SECTIONS.iPad, opts).then(function (section) {
      if (!section) return {};
      if (section.StaffPortal || section.TravelData) {
        return {
          StaffPortal: section.StaffPortal || {},
          CoreDemoData: section.CoreDemoData || {},
          Mobile: section.Mobile || {},
          TravelData: section.TravelData || {},
          CustomerLoyalty: section.CustomerLoyalty || {},
        };
      }
      return section;
    });
  }

  function saveSection(section, partial, opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      if (!ldapSlug || !sandboxSlug) {
        return Promise.reject(new Error('LDAP slug and sandbox are required to save demo config.'));
      }
      var db = getDatabase();
      if (!db) return Promise.reject(new Error('Firebase RTDB not available'));
      var auth = firebase.auth();
      var u = auth.currentUser;
      if (!u || !u.email) {
        return Promise.reject(new Error('Sign in with your Adobe lab account to save demo config.'));
      }
      var ref = db.ref(sectionPath(ldapSlug, sandboxSlug, section));
      return ref.update(partial).then(function () {
        dispatchConfigChanged({ section: section, ldapSlug: ldapSlug, sandboxSlug: sandboxSlug });
        return { ok: true, ldapSlug: ldapSlug, sandboxSlug: sandboxSlug, section: section };
      });
    });
  }

  function saveSectionDebounced(section, partial, opts) {
    var key = section + ':' + (opts && opts.sandboxSlug ? opts.sandboxSlug : getActiveSandboxSlug());
    clearTimeout(saveTimers[key]);
    return new Promise(function (resolve, reject) {
      saveTimers[key] = setTimeout(function () {
        saveSection(section, partial, opts).then(resolve).catch(reject);
      }, SAVE_DEBOUNCE_MS);
    });
  }

  function ensureSandboxStub(opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization) {
        return Promise.reject(new Error('Sign in to provision demo config.'));
      }
      return fetch('/api/lab/provision-rtdb', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          defaultSandbox: sandboxSlug,
          mergeSandboxStub: true,
        }),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { status: res.status, body: body };
          });
        })
        .then(function (result) {
          if (!result.body || !result.body.ok) {
            throw new Error((result.body && result.body.error) || 'Provision failed');
          }
          if (result.body.ldapSlug) setCachedLdapSlug(result.body.ldapSlug);
          dispatchConfigChanged({ provisioned: true, sandboxSlug: sandboxSlug });
          return result.body;
        });
    });
  }

  function migrateLocalStorageKeys(sandboxSlug) {
    var sb = normalizeSlug(sandboxSlug) || getActiveSandboxSlug();
    if (!sb) return Promise.resolve({ skipped: true });

    var tasks = [];

    try {
      var agenticRaw = localStorage.getItem('aepAgenticV2AgentUrls');
      if (agenticRaw) {
        var all = JSON.parse(agenticRaw);
        var urls = all && all[sb] ? all[sb] : all && all._default ? all._default : null;
        if (urls && typeof urls === 'object') {
          tasks.push(
            saveSection(SECTIONS.AgenticLayer, { agentUrls: urls }, { sandboxSlug: sb }).then(function () {
              localStorage.removeItem('aepAgenticV2AgentUrls');
            }),
          );
        }
      }
    } catch (_e) {}

    try {
      var industryRaw = localStorage.getItem('aepLabCallCenterIndustry_v1');
      if (industryRaw) {
        tasks.push(
          saveSection(SECTIONS.CallCentre, { industryId: String(industryRaw).trim() }, { sandboxSlug: sb }),
        );
      }
    } catch (_e2) {}

    try {
      var expVizRaw = localStorage.getItem('aepExpVizImageUrls');
      if (expVizRaw) {
        var evAll = JSON.parse(expVizRaw);
        var ev = evAll && evAll[sb] ? evAll[sb] : evAll && evAll._default ? evAll._default : null;
        if (ev && typeof ev === 'object') {
          tasks.push(
            saveSection(SECTIONS.ExpVisualiser, ev, { sandboxSlug: sb }).then(function () {
              localStorage.removeItem('aepExpVizImageUrls');
            }),
          );
        }
      }
    } catch (_e3) {}

    try {
      var expAccelRaw = localStorage.getItem('aepExpAccelUiPrefs');
      if (expAccelRaw) {
        var eaAll = JSON.parse(expAccelRaw);
        var ea = eaAll && eaAll[sb] ? eaAll[sb] : eaAll && eaAll._default ? eaAll._default : null;
        if (ea && typeof ea === 'object') {
          tasks.push(
            saveSection(SECTIONS.ExpAccelerator, ea, { sandboxSlug: sb }).then(function () {
              localStorage.removeItem('aepExpAccelUiPrefs');
            }),
          );
        }
      }
    } catch (_e4) {}

    if (!tasks.length) return Promise.resolve({ migrated: false });
    return Promise.all(tasks).then(function () {
      return { migrated: true };
    });
  }

  function whenReady() {
    var chain = Promise.resolve();
    if (global.__aepLabSyncReady && typeof global.__aepLabSyncReady.then === 'function') {
      chain = global.__aepLabSyncReady;
    }
    return chain.then(function () {
      return resolveLdapSlugAsync();
    });
  }

  global.AepDemoConfigRtdb = {
    SECTIONS: SECTIONS,
    normalizeSlug: normalizeSlug,
    getRtdbBase: getRtdbBase,
    getLdapSlugSync: getLdapSlugSync,
    setCachedLdapSlug: setCachedLdapSlug,
    resolveLdapSlugAsync: resolveLdapSlugAsync,
    getActiveSandboxSlug: getActiveSandboxSlug,
    sectionPath: sectionPath,
    sandboxRestUrl: sandboxRestUrl,
    buildFlatLabStub: buildFlatLabStub,
    splitStubIntoSections: splitStubIntoSections,
    loadSection: loadSection,
    loadIPadFlat: loadIPadFlat,
    saveSection: saveSection,
    saveSectionDebounced: saveSectionDebounced,
    ensureSandboxStub: ensureSandboxStub,
    migrateLocalStorageKeys: migrateLocalStorageKeys,
    loadLegacyFlat: loadLegacyFlat,
    whenReady: whenReady,
  };
})(typeof window !== 'undefined' ? window : this);
