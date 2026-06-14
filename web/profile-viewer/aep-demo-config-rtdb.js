/**
 * Per-user + per-sandbox demo config in Firebase RTDB.
 * Path: ajoLookups/{ldapSlug}/sandboxes/{sandboxSlug}/{section}
 * Sections: CoreDemoData, StaffPortal, iPad, CallCentre, AgenticLayer, ExpAccelerator, ExpVisualiser, ContentDecisionLive
 */
(function (global) {
  'use strict';

  var SECTIONS = {
    CoreDemoData: 'CoreDemoData',
    StaffPortal: 'StaffPortal',
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
  /** Per-session keys ldap:sandbox already provisioned via API. */
  var prepEnsuredKeys = {};
  var prepEnsureInflight = null;

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
    var fromGlobal = '';
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        fromGlobal = normalizeSlug(global.AepGlobalSandbox.getSandboxName());
      }
    } catch (_e) {}
    if (fromGlobal) return fromGlobal;
    try {
      var stored = normalizeSlug(localStorage.getItem('aepGlobalSandboxName'));
      if (stored) return stored;
    } catch (_e2) {}
    try {
      if (global.AepAccessScope && typeof global.AepAccessScope.getWorkspaceSlug === 'function') {
        var ws = normalizeSlug(global.AepAccessScope.getWorkspaceSlug());
        if (ws) return ws;
      }
    } catch (_e3) {}
    var ldap = getLdapSlugSync();
    if (ldap) return ldap;
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

  /** Legacy flat keys at ajoLookups/{ldap}/ for RTDB viewer + AJO GET …/ajoLookups/{ldap}.json */
  function legacyRootPath(ldapSlug) {
    return 'ajoLookups/' + ldapSlug;
  }

  var LEGACY_ROOT_MIRROR_SECTIONS = {
    CoreDemoData: true,
    StaffPortal: true,
    iPad: true,
  };

  function mirrorSectionToLegacyRoot(db, ldapSlug, section, partial) {
    if (!LEGACY_ROOT_MIRROR_SECTIONS[section] || !ldapSlug || !partial || typeof partial !== 'object') {
      return Promise.resolve();
    }
    if (section === SECTIONS.iPad) {
      return db.ref(legacyRootPath(ldapSlug)).update(partial);
    }
    return db.ref(legacyRootPath(ldapSlug) + '/' + section).update(partial);
  }

  /** When LDAP slug is not yet resolved, many personal lab trees use sandbox name as the RTDB root segment. */
  function effectiveLdapSlug(ldapSlug, sandboxSlug) {
    return normalizeSlug(ldapSlug) || normalizeSlug(sandboxSlug) || '';
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
    var coreSrc = src.CoreDemoData && typeof src.CoreDemoData === 'object' ? src.CoreDemoData : {};
    return {
      CoreDemoData: {
        name: coreSrc.name || '',
        airlineName: coreSrc.airlineName || coreSrc.name || '',
        slogan: coreSrc.slogan || '',
        url: coreSrc.url || '',
        customerLogo: coreSrc.customerLogo || '',
        shortName: coreSrc.shortName || '',
      },
      StaffPortal: Object.assign(
        {
          AgentName: 'Demo agent',
          AgentID: 'AG-001',
          AgentType: 'Customer Care',
          Colour: '#1473e6',
        },
        src.StaffPortal || {},
      ),
      iPad: {
        Mobile: src.Mobile || {},
        TravelData: src.TravelData || {},
        CustomerLoyalty: src.CustomerLoyalty || {},
      },
      CallCentre: {
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
      ExpAccelerator: {
        displayNameOverride: '',
        opportunityIndustry: 'general',
        useIndustrySamplePack: true,
      },
      ExpVisualiser: {
        treatmentA: 'https://contenthosting.web.app/experiments/treatmenta.png',
        treatmentB: 'https://contenthosting.web.app/experiments/treatmentb.png',
        treatmentC: 'https://contenthosting.web.app/experiments/treatmentc.png',
        emailA: 'https://contenthosting.web.app/experiments/emailsubjecta.png',
        emailB: 'https://contenthosting.web.app/experiments/emailsubjectb.png',
      },
      ContentDecisionLive: {
        edgeConfigId: '',
        decisionScopes: '',
        edgeForceConfigure: false,
        edgeConfigBySandbox: {},
      },
    };
  }

  function prepCacheKey(ldapSlug, sandboxSlug) {
    return ldapSlug + ':' + sandboxSlug;
  }

  function mergeAppPayload(appSection, shared) {
    var app = appSection && typeof appSection === 'object' ? appSection : {};
    var sh = shared && typeof shared === 'object' ? shared : {};
    var sharedCore =
      sh.CoreDemoData && hasMeaningfulCoreDemoData(sh.CoreDemoData) ? sh.CoreDemoData : null;
    var sharedStaff =
      sh.StaffPortal && !isProvisionStaffPortalStub(sh.StaffPortal) ? sh.StaffPortal : null;
    return Object.assign({}, app, {
      CoreDemoData: sharedCore || app.CoreDemoData || {},
      StaffPortal: sharedStaff || app.StaffPortal || {},
    });
  }

  function pickTrimmedBrandField(val) {
    return val != null ? String(val).trim() : '';
  }

  function hasMeaningfulCoreDemoData(core) {
    if (!core || typeof core !== 'object') return false;
    return !!(
      pickTrimmedBrandField(core.name) ||
      pickTrimmedBrandField(core.airlineName) ||
      pickTrimmedBrandField(core.shortName) ||
      pickTrimmedBrandField(core.brand) ||
      pickTrimmedBrandField(core.customerShortName)
    );
  }

  function normalizeBrandHexColour(raw) {
    var s = String(raw || '')
      .trim()
      .replace(/^#/, '');
    return /^[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : '';
  }

  function isProvisionStaffPortalStub(staff) {
    if (!staff || typeof staff !== 'object') return true;
    var stub = splitStubIntoSections().StaffPortal;
    var name = pickTrimmedBrandField(staff.AgentName);
    var id = pickTrimmedBrandField(staff.AgentID);
    var type = pickTrimmedBrandField(staff.AgentType);
    var colour = normalizeBrandHexColour(staff.Colour);
    var stubColour = normalizeBrandHexColour(stub.Colour);
    if (name && name !== stub.AgentName) return false;
    if (id && id !== stub.AgentID) return false;
    if (type && type !== stub.AgentType) return false;
    if (colour && colour !== stubColour) return false;
    return true;
  }

  function mergeCoreDemoDataFields(primary, fallback) {
    var p = primary && typeof primary === 'object' ? primary : {};
    var f = fallback && typeof fallback === 'object' ? fallback : {};
    var keys = ['name', 'airlineName', 'shortName', 'brand', 'customerShortName', 'slogan', 'url', 'customerLogo'];
    var out = Object.assign({}, f, p);
    keys.forEach(function (k) {
      out[k] = pickTrimmedBrandField(p[k]) || pickTrimmedBrandField(f[k]) || '';
    });
    return out;
  }

  function mergeStaffPortalFields(primary, fallback) {
    var p = primary && typeof primary === 'object' ? primary : {};
    var f = fallback && typeof fallback === 'object' ? fallback : {};
    var keys = ['AgentName', 'AgentID', 'AgentType', 'Colour', 'FlightTerminalInfo', 'agentName'];
    var out = Object.assign({}, f, p);
    keys.forEach(function (k) {
      out[k] = pickTrimmedBrandField(p[k]) || pickTrimmedBrandField(f[k]) || (p[k] != null ? p[k] : f[k]);
    });
    return out;
  }

  function resolveSharedBrand(core, staff, legacy) {
    var legacyCore = (legacy && legacy.CoreDemoData) || {};
    var legacyStaff = (legacy && legacy.StaffPortal) || {};
    var nestedCore = core && typeof core === 'object' ? core : {};
    var nestedStaff = staff && typeof staff === 'object' ? staff : {};
    return {
      CoreDemoData: !hasMeaningfulCoreDemoData(nestedCore) && hasMeaningfulCoreDemoData(legacyCore)
        ? legacyCore
        : mergeCoreDemoDataFields(nestedCore, legacyCore),
      StaffPortal: isProvisionStaffPortalStub(nestedStaff) && !isProvisionStaffPortalStub(legacyStaff)
        ? legacyStaff
        : mergeStaffPortalFields(nestedStaff, legacyStaff),
    };
  }

  function loadSharedBrand(sandboxSlug) {
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      return loadLegacyFlat(sandboxSlug, ldapSlug).then(function (legacy) {
        if (!ldapSlug || !sandboxSlug) {
          return {
            CoreDemoData: (legacy && legacy.CoreDemoData) || {},
            StaffPortal: (legacy && legacy.StaffPortal) || {},
          };
        }
        var base = getRtdbBase();
        return Promise.all([
          fetchJson(base + '/' + sectionPath(ldapSlug, sandboxSlug, SECTIONS.CoreDemoData) + '.json'),
          fetchJson(base + '/' + sectionPath(ldapSlug, sandboxSlug, SECTIONS.StaffPortal) + '.json'),
        ]).then(function (results) {
          return resolveSharedBrand(results[0], results[1], legacy);
        });
      });
    });
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    });
  }

  /** Legacy flat ajoLookups/{sandbox} or ajoLookups/{ldap} top-level keys. */
  function extractLegacyFlatKeys(data) {
    if (!data || typeof data !== 'object') return null;
    var legacy = {};
    if (data.CoreDemoData) legacy.CoreDemoData = data.CoreDemoData;
    if (data.StaffPortal) legacy.StaffPortal = data.StaffPortal;
    if (data.Mobile) legacy.Mobile = data.Mobile;
    if (data.TravelData) legacy.TravelData = data.TravelData;
    if (data.CustomerLoyalty) legacy.CustomerLoyalty = data.CustomerLoyalty;
    if (data.industryId) legacy.industryId = data.industryId;
    return Object.keys(legacy).length ? legacy : null;
  }

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
          if (data.sandboxes) return extractLegacyFlatKeys(data);
          return extractLegacyFlatKeys(data);
        });
      });
    });
    return chain;
  }

  function loadSection(section, opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    var chain = opts.skipEnsurePrep
      ? Promise.resolve()
      : ensurePrepReady({ sandboxSlug: sandboxSlug, silent: true });
    return chain.then(function () {
      return loadSectionInner(section, opts, sandboxSlug).then(function (data) {
        if (
          data &&
          !opts.skipBrandMerge &&
          (section === SECTIONS.iPad || section === SECTIONS.CallCentre)
        ) {
          return loadSharedBrand(sandboxSlug).then(function (shared) {
            return mergeAppPayload(data, shared);
          });
        }
        return data;
      });
    });
  }

  function loadSectionInner(section, opts, sandboxSlug) {
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      var ldapForPath = effectiveLdapSlug(ldapSlug, sandboxSlug);
      if (!ldapForPath || !sandboxSlug) {
        return loadLegacyFlat(sandboxSlug, ldapSlug).then(function (legacy) {
          if (!legacy) return null;
          if (section === SECTIONS.CoreDemoData) return legacy.CoreDemoData || null;
          if (section === SECTIONS.StaffPortal) return legacy.StaffPortal || null;
          if (section === SECTIONS.iPad) {
            return {
              Mobile: legacy.Mobile || {},
              TravelData: legacy.TravelData || {},
              CustomerLoyalty: legacy.CustomerLoyalty || {},
            };
          }
          if (section === SECTIONS.CallCentre) {
            return { industryId: legacy.industryId || 'travel' };
          }
          if (section === SECTIONS.AgenticLayer) return { agentUrls: splitStubIntoSections().AgenticLayer.agentUrls };
          return legacy;
        });
      }

      var url =
        getRtdbBase() +
        '/' +
        sectionPath(ldapForPath, sandboxSlug, section) +
        '.json';
      return fetchJson(url).then(function (nested) {
        if (nested && typeof nested === 'object' && Object.keys(nested).length) return nested;
        return loadLegacyFlat(sandboxSlug, ldapSlug).then(function (legacy) {
          if (!legacy) return null;
          if (section === SECTIONS.CoreDemoData) return legacy.CoreDemoData || splitStubIntoSections().CoreDemoData;
          if (section === SECTIONS.StaffPortal) return legacy.StaffPortal || splitStubIntoSections().StaffPortal;
          if (section === SECTIONS.iPad) {
            return {
              Mobile: legacy.Mobile || {},
              TravelData: legacy.TravelData || {},
              CustomerLoyalty: legacy.CustomerLoyalty || {},
            };
          }
          if (section === SECTIONS.CallCentre) {
            return { industryId: legacy.industryId || 'travel' };
          }
          if (section === SECTIONS.AgenticLayer) {
            return { agentUrls: splitStubIntoSections().AgenticLayer.agentUrls };
          }
          return legacy;
        });
      });
    });
  }

  function loadSandboxSections(opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return ensurePrepReady({ sandboxSlug: sandboxSlug, silent: true }).then(function () {
      return resolveLdapSlugAsync().then(function (ldapSlug) {
        if (!ldapSlug || !sandboxSlug) return null;
        return fetchJson(sandboxRestUrl(ldapSlug, sandboxSlug));
      });
    });
  }

  function loadCoreDemoData(opts) {
    return loadSection(SECTIONS.CoreDemoData, opts);
  }

  function loadStaffPortal(opts) {
    return loadSection(SECTIONS.StaffPortal, opts);
  }

  function saveCoreDemoData(partial, opts) {
    return saveSection(SECTIONS.CoreDemoData, partial, opts);
  }

  function saveStaffPortal(partial, opts) {
    return saveSection(SECTIONS.StaffPortal, partial, opts);
  }

  /** Flat iPad-shaped object for etihad-ipad.js compatibility. */
  function loadIPadFlat(opts) {
    return loadSection(SECTIONS.iPad, opts).then(function (section) {
      if (!section) return {};
      return {
        StaffPortal: section.StaffPortal || {},
        CoreDemoData: section.CoreDemoData || {},
        Mobile: section.Mobile || {},
        TravelData: section.TravelData || {},
        CustomerLoyalty: section.CustomerLoyalty || {},
      };
    });
  }

  function saveSection(section, partial, opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    var chain = opts.skipEnsurePrep
      ? Promise.resolve()
      : ensurePrepReady({ sandboxSlug: sandboxSlug, silent: true });
    return chain.then(function () {
      return saveSectionInner(section, partial, opts, sandboxSlug);
    });
  }

  function saveSectionInner(section, partial, opts, sandboxSlug) {
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      var ldapForPath = effectiveLdapSlug(ldapSlug, sandboxSlug);
      if (!ldapForPath || !sandboxSlug) {
        return Promise.reject(new Error('LDAP slug and sandbox are required to save demo config.'));
      }
      var db = getDatabase();
      if (!db) return Promise.reject(new Error('Firebase RTDB not available'));
      var auth = firebase.auth();
      var u = auth.currentUser;
      if (!u || !u.email) {
        return Promise.reject(new Error('Sign in with your Adobe lab account to save demo config.'));
      }
      var ref = db.ref(sectionPath(ldapForPath, sandboxSlug, section));
      return ref
        .update(partial)
        .then(function () {
          return mirrorSectionToLegacyRoot(db, ldapForPath, section, partial);
        })
        .then(function () {
          dispatchConfigChanged({ section: section, ldapSlug: ldapForPath, sandboxSlug: sandboxSlug });
          return { ok: true, ldapSlug: ldapForPath, sandboxSlug: sandboxSlug, section: section };
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

  function callProvisionApi(sandboxSlug) {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization) {
        var err = new Error('Sign in to provision demo config.');
        err.code = 'auth_required';
        throw err;
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

  /**
   * Idempotent: ensures ajoLookups/{ldap}/sandboxes/{sandbox}/ has all demo section stubs.
   * Called automatically before load/save and when opening Global settings / RTDB editor.
   */
  function ensurePrepReady(opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return whenReady().then(function () {
      return resolveLdapSlugAsync().then(function (ldapSlug) {
        if (!ldapSlug || !sandboxSlug) {
          return { ok: false, skipped: true, reason: 'no_slug' };
        }
        var cacheKey = prepCacheKey(ldapSlug, sandboxSlug);
        if (prepEnsuredKeys[cacheKey]) {
          return { ok: true, cached: true, ldapSlug: ldapSlug, sandboxSlug: sandboxSlug };
        }
        if (prepEnsureInflight && prepEnsureInflight.key === cacheKey) {
          return prepEnsureInflight.promise;
        }
        var promise = callProvisionApi(sandboxSlug)
          .then(function (body) {
            prepEnsuredKeys[cacheKey] = true;
            return migrateLocalStorageKeys(sandboxSlug).then(function () {
              return Object.assign({ ok: true }, body || {});
            });
          })
          .catch(function (e) {
            if (opts.silent && e && e.code === 'auth_required') {
              return { ok: false, skipped: true, reason: 'auth' };
            }
            throw e;
          })
          .finally(function () {
            if (prepEnsureInflight && prepEnsureInflight.key === cacheKey) {
              prepEnsureInflight = null;
            }
          });
        prepEnsureInflight = { key: cacheKey, promise: promise };
        return promise;
      });
    });
  }

  function ensureSandboxStub(opts) {
    return ensurePrepReady(opts);
  }

  function clearPrepCache(opts) {
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      if (ldapSlug && sandboxSlug) {
        delete prepEnsuredKeys[prepCacheKey(ldapSlug, sandboxSlug)];
      } else {
        prepEnsuredKeys = {};
      }
      return { ok: true };
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
    return Promise.all(
      tasks.map(function (task) {
        return task.catch(function (err) {
          console.warn('[aep-demo-config-rtdb] migrateLocalStorageKeys skipped:', err);
          return null;
        });
      }),
    ).then(function () {
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
    loadCoreDemoData: loadCoreDemoData,
    loadStaffPortal: loadStaffPortal,
    loadSharedBrand: loadSharedBrand,
    mergeAppPayload: mergeAppPayload,
    loadIPadFlat: loadIPadFlat,
    saveSection: saveSection,
    saveCoreDemoData: saveCoreDemoData,
    saveStaffPortal: saveStaffPortal,
    saveSectionDebounced: saveSectionDebounced,
    ensureSandboxStub: ensureSandboxStub,
    ensurePrepReady: ensurePrepReady,
    clearPrepCache: clearPrepCache,
    loadSandboxSections: loadSandboxSections,
    migrateLocalStorageKeys: migrateLocalStorageKeys,
    loadLegacyFlat: loadLegacyFlat,
    whenReady: whenReady,
  };
})(typeof window !== 'undefined' ? window : this);
