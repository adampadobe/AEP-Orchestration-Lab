/**
 * Per-user workspace demo config in Firebase RTDB.
 * All sections flat at ajoLookups/{ldapSlug}/{section} — no sandboxes/ nesting.
 */
(function (global) {
  'use strict';

  var SECTIONS = {
    CoreDemoData: 'CoreDemoData',
    StaffPortal: 'StaffPortal',
    TravelData: 'TravelData',
    Mobile: 'Mobile',
    CustomerLoyalty: 'CustomerLoyalty',
    iPad: 'iPad',
    CallCentre: 'CallCentre',
    AgenticLayer: 'AgenticLayer',
    ExpAccelerator: 'ExpAccelerator',
    ExpVisualiser: 'ExpVisualiser',
    ContentDecisionLive: 'ContentDecisionLive',
  };

  /** Flat at workspace root — all persisted demo sections. */
  var WORKSPACE_ROOT_SECTIONS = {
    CoreDemoData: true,
    StaffPortal: true,
    CallCentre: true,
    TravelData: true,
    Mobile: true,
    CustomerLoyalty: true,
    AgenticLayer: true,
    ExpAccelerator: true,
    ExpVisualiser: true,
    ContentDecisionLive: true,
  };

  var CANONICAL_CORE_DEMO_KEYS = ['name', 'shortName', 'slogan', 'url', 'customerLogo'];

  var STALE_CORE_DEMO_KEYS = ['airlineName', 'brand', 'customerShortName', 'brandName'];

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

  /** @deprecated Nested sandboxes/ paths removed — use workspaceSectionPath. */
  function sectionPath(ldapSlug, _sandboxSlug, section) {
    return workspaceSectionPath(ldapSlug, section);
  }

  function workspaceSectionPath(ldapSlug, section) {
    return 'ajoLookups/' + ldapSlug + '/' + section;
  }

  function isWorkspaceRootSection(section) {
    return !!WORKSPACE_ROOT_SECTIONS[section];
  }

  /** Workspace root ajoLookups/{ldap}/ for RTDB viewer + shared demo chrome */
  function legacyRootPath(ldapSlug) {
    return 'ajoLookups/' + ldapSlug;
  }

  function sanitizeCoreDemoData(partial) {
    var src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
    var out = {};
    CANONICAL_CORE_DEMO_KEYS.forEach(function (key) {
      out[key] = src[key] != null ? String(src[key]).trim() : '';
    });
    return out;
  }

  function stripStaleCoreDemoFields(core) {
    if (!core || typeof core !== 'object') return core;
    var out = Object.assign({}, core);
    STALE_CORE_DEMO_KEYS.forEach(function (key) {
      delete out[key];
    });
    return sanitizeCoreDemoData(out);
  }

  /** When LDAP slug is not yet resolved, many personal lab trees use sandbox name as the RTDB root segment. */
  function effectiveLdapSlug(ldapSlug, sandboxSlug) {
    return normalizeSlug(ldapSlug) || normalizeSlug(sandboxSlug) || '';
  }

  /** @deprecated sandboxes/ subtree removed. */
  function sandboxRestUrl(ldapSlug) {
    return getRtdbBase() + '/ajoLookups/' + encodeURIComponent(ldapSlug) + '.json';
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
      CoreDemoData: { name: 'Etihad Airways' },
      Mobile: { StaffName: 'Demo agent', StaffId: 'AG-001' },
      TravelData: { flightNumber: 'EY455', route: 'AUH → LHR', departureIso: dep, gate: 'B12' },
      CustomerLoyalty: { tier: 'Gold', miles: '128400' },
    };
  }

  function splitStubIntoSections(flat) {
    var src = flat && typeof flat === 'object' ? flat : buildFlatLabStub();
    var coreSrc = src.CoreDemoData && typeof src.CoreDemoData === 'object' ? src.CoreDemoData : {};
    return {
      CoreDemoData: sanitizeCoreDemoData(coreSrc),
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

  function prepCacheKey(ldapSlug) {
    return ldapSlug;
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
      pickTrimmedBrandField(core.shortName) ||
      pickTrimmedBrandField(core.slogan) ||
      pickTrimmedBrandField(core.url) ||
      pickTrimmedBrandField(core.customerLogo)
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
    var out = Object.assign({}, f, p);
    CANONICAL_CORE_DEMO_KEYS.forEach(function (k) {
      out[k] = pickTrimmedBrandField(p[k]) || pickTrimmedBrandField(f[k]) || '';
    });
    return sanitizeCoreDemoData(out);
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

  function loadSharedBrand() {
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      if (!ldapSlug) {
        return loadLegacyFlat('', '').then(function (legacy) {
          return {
            CoreDemoData: (legacy && legacy.CoreDemoData) || {},
            StaffPortal: (legacy && legacy.StaffPortal) || {},
          };
        });
      }
      var base = getRtdbBase();
      return Promise.all([
        fetchJson(base + '/' + workspaceSectionPath(ldapSlug, SECTIONS.CoreDemoData) + '.json'),
        fetchJson(base + '/' + workspaceSectionPath(ldapSlug, SECTIONS.StaffPortal) + '.json'),
      ]).then(function (results) {
        return {
          CoreDemoData: results[0] && typeof results[0] === 'object' ? results[0] : {},
          StaffPortal: results[1] && typeof results[1] === 'object' ? results[1] : {},
        };
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

  function loadWorkspaceSection(section, ldapSlug) {
    var base = getRtdbBase();
    var flatUrl = base + '/' + workspaceSectionPath(ldapSlug, section) + '.json';
    return fetchJson(flatUrl).then(function (flat) {
      if (flat && typeof flat === 'object' && Object.keys(flat).length) {
        if (section === SECTIONS.CoreDemoData) {
          return stripStaleCoreDemoFields(flat);
        }
        return flat;
      }
      return flat;
    });
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
          return loadSharedBrand().then(function (shared) {
            return mergeAppPayload(data, shared);
          });
        }
        return data;
      });
    });
  }

  function loadSectionInner(section, opts, _sandboxSlug) {
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      var ldapForPath = effectiveLdapSlug(ldapSlug, _sandboxSlug);

      if (section === SECTIONS.iPad) {
        if (!ldapForPath) {
          return loadLegacyFlat(_sandboxSlug, ldapSlug).then(function (legacy) {
            if (!legacy) return splitStubIntoSections().iPad;
            return {
              Mobile: legacy.Mobile || {},
              TravelData: legacy.TravelData || {},
              CustomerLoyalty: legacy.CustomerLoyalty || {},
            };
          });
        }
        return Promise.all([
          loadWorkspaceSection(SECTIONS.Mobile, ldapForPath),
          loadWorkspaceSection(SECTIONS.TravelData, ldapForPath),
          loadWorkspaceSection(SECTIONS.CustomerLoyalty, ldapForPath),
        ]).then(function (results) {
          return {
            Mobile: results[0] || {},
            TravelData: results[1] || {},
            CustomerLoyalty: results[2] || {},
          };
        });
      }

      if (!ldapForPath) {
        return loadLegacyFlat(_sandboxSlug, ldapSlug).then(function (legacy) {
          if (!legacy) return splitStubIntoSections()[section] || null;
          if (section === SECTIONS.CoreDemoData) return legacy.CoreDemoData || splitStubIntoSections().CoreDemoData;
          if (section === SECTIONS.StaffPortal) return legacy.StaffPortal || splitStubIntoSections().StaffPortal;
          if (section === SECTIONS.CallCentre) return { industryId: legacy.industryId || 'travel' };
          if (section === SECTIONS.TravelData) return legacy.TravelData || {};
          if (section === SECTIONS.Mobile) return legacy.Mobile || {};
          if (section === SECTIONS.CustomerLoyalty) return legacy.CustomerLoyalty || {};
          if (section === SECTIONS.AgenticLayer) return splitStubIntoSections().AgenticLayer;
          return legacy;
        });
      }

      if (isWorkspaceRootSection(section)) {
        return loadWorkspaceSection(section, ldapForPath).then(function (flat) {
          if (flat && typeof flat === 'object' && Object.keys(flat).length) {
            return flat;
          }
          return loadLegacyFlat(_sandboxSlug, ldapSlug).then(function (legacy) {
            if (!legacy) return flat || splitStubIntoSections()[section] || null;
            if (section === SECTIONS.CoreDemoData) return legacy.CoreDemoData || splitStubIntoSections().CoreDemoData;
            if (section === SECTIONS.StaffPortal) return legacy.StaffPortal || splitStubIntoSections().StaffPortal;
            if (section === SECTIONS.CallCentre) return { industryId: legacy.industryId || 'travel' };
            if (section === SECTIONS.TravelData) return legacy.TravelData || {};
            if (section === SECTIONS.Mobile) return legacy.Mobile || {};
            if (section === SECTIONS.CustomerLoyalty) return legacy.CustomerLoyalty || {};
            return flat || splitStubIntoSections()[section] || null;
          });
        });
      }

      return splitStubIntoSections()[section] || null;
    });
  }

  function loadWorkspaceSections(opts) {
    opts = opts || {};
    return ensurePrepReady({ silent: true }).then(function () {
      return resolveLdapSlugAsync().then(function (ldapSlug) {
        if (!ldapSlug) return null;
        return fetchJson(sandboxRestUrl(ldapSlug));
      });
    });
  }

  /** @deprecated Use loadWorkspaceSections */
  function loadSandboxSections(opts) {
    return loadWorkspaceSections(opts);
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
    opts = opts || {};
    var sandboxSlug = normalizeSlug(opts.sandboxSlug) || getActiveSandboxSlug();
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      var ldapForPath = effectiveLdapSlug(ldapSlug, sandboxSlug);
      if (!ldapForPath) {
        return loadLegacyFlat(sandboxSlug, ldapSlug).then(function (legacy) {
          return legacy || {};
        });
      }
      return Promise.all([
        loadSharedBrand(),
        loadWorkspaceSection(SECTIONS.TravelData, ldapForPath),
        loadWorkspaceSection(SECTIONS.Mobile, ldapForPath),
        loadWorkspaceSection(SECTIONS.CustomerLoyalty, ldapForPath),
      ]).then(function (results) {
        var shared = results[0] || {};
        return {
          StaffPortal: shared.StaffPortal || {},
          CoreDemoData: shared.CoreDemoData || {},
          Mobile: results[2] || {},
          TravelData: results[1] || {},
          CustomerLoyalty: results[3] || {},
        };
      });
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

  function saveSectionInner(section, partial, opts, _sandboxSlug) {
    return resolveLdapSlugAsync().then(function (ldapSlug) {
      var ldapForPath = effectiveLdapSlug(ldapSlug, _sandboxSlug);

      if (!ldapForPath) {
        console.warn('[AepDemoConfigRtdb] saveSectionInner rejected: missing workspace slug', {
          section: section,
          ldapSlug: ldapSlug,
        });
        return Promise.reject(new Error('Sign in with your Adobe lab account to save demo config.'));
      }

      var flatPath = workspaceSectionPath(ldapForPath, section);
      var payload =
        section === SECTIONS.CoreDemoData && partial && typeof partial === 'object'
          ? sanitizeCoreDemoData(partial)
          : partial;
      console.log('[AepDemoConfigRtdb] saveSectionInner start', {
        section: section,
        ldapSlug: ldapSlug,
        ldapForPath: ldapForPath,
        flatPath: flatPath,
        partial: payload,
      });

      return authHeadersPromise().then(function (headers) {
        if (!headers.Authorization) {
          console.warn('[AepDemoConfigRtdb] saveSectionInner rejected: not signed in', { section: section });
          return Promise.reject(new Error('Sign in with your Adobe lab account to save demo config.'));
        }
        var adobeEmail = '';
        try {
          var authUser = firebase.auth().currentUser;
          if (authUser && authUser.email) adobeEmail = String(authUser.email).trim().toLowerCase();
        } catch (_emailErr) {}
        return fetch('/api/lab/save-demo-config', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify({
            section: section,
            partial: payload,
            workspaceSlug: ldapForPath,
            adobeEmail: adobeEmail,
          }),
        })
          .then(function (res) {
            return res.json().then(function (body) {
              if (!res.ok || !body || !body.ok) {
                var msg = (body && body.error) || 'Save failed (' + res.status + ')';
                console.error('[AepDemoConfigRtdb] saveSectionInner API error', {
                  section: section,
                  status: res.status,
                  body: body,
                });
                return Promise.reject(new Error(msg));
              }
              console.log('[AepDemoConfigRtdb] saveSectionInner success', {
                section: section,
                flatPath: body.flatPath,
              });
              dispatchConfigChanged({ section: section, ldapSlug: ldapForPath });
              return { ok: true, ldapSlug: ldapForPath, section: section };
            });
          })
          .catch(function (err) {
            console.error('[AepDemoConfigRtdb] saveSectionInner failed', { section: section, error: err });
            throw err;
          });
      });
    });
  }

  function saveSectionDebounced(section, partial, opts) {
    var key = section + ':' + (getLdapSlugSync() || 'ws');
    clearTimeout(saveTimers[key]);
    return new Promise(function (resolve, reject) {
      saveTimers[key] = setTimeout(function () {
        saveSection(section, partial, opts).then(resolve).catch(reject);
      }, SAVE_DEBOUNCE_MS);
    });
  }

  function callProvisionApi() {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization) {
        var err = new Error('Sign in to provision demo config.');
        err.code = 'auth_required';
        throw err;
      }
      return fetch('/api/lab/provision-rtdb', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({}),
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
          dispatchConfigChanged({ provisioned: true, ldapSlug: result.body.ldapSlug });
          return result.body;
        });
    });
  }

  /**
   * Idempotent: ensures ajoLookups/{ldap}/ has all flat demo section stubs.
   * Called automatically before load/save and when opening Global settings / RTDB editor.
   */
  function ensurePrepReady(opts) {
    opts = opts || {};
    return whenReady().then(function () {
      return resolveLdapSlugAsync().then(function (ldapSlug) {
        if (!ldapSlug) {
          return { ok: false, skipped: true, reason: 'no_slug' };
        }
        var cacheKey = prepCacheKey(ldapSlug);
        if (prepEnsuredKeys[cacheKey]) {
          return { ok: true, cached: true, ldapSlug: ldapSlug };
        }
        if (prepEnsureInflight && prepEnsureInflight.key === cacheKey) {
          return prepEnsureInflight.promise;
        }
        var promise = callProvisionApi()
          .then(function (body) {
            prepEnsuredKeys[cacheKey] = true;
            return migrateLocalStorageKeys().then(function () {
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

  function clearPrepCache() {
    prepEnsuredKeys = {};
    return Promise.resolve({ ok: true });
  }

  function migrateLocalStorageKeys() {
    var tasks = [];

    try {
      var agenticRaw = localStorage.getItem('aepAgenticV2AgentUrls');
      if (agenticRaw) {
        var all = JSON.parse(agenticRaw);
        var urls = null;
        if (all && typeof all === 'object') {
          var sb = getActiveSandboxSlug();
          urls = (sb && all[sb]) || all._default || all;
          if (urls && !urls.brand && !urls.product) {
            var firstKey = Object.keys(all).find(function (k) {
              return all[k] && typeof all[k] === 'object';
            });
            if (firstKey) urls = all[firstKey];
          }
        }
        if (urls && typeof urls === 'object') {
          tasks.push(
            saveSection(SECTIONS.AgenticLayer, { agentUrls: urls }, { skipEnsurePrep: true }).then(function () {
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
          saveSection(SECTIONS.CallCentre, { industryId: String(industryRaw).trim() }, { skipEnsurePrep: true }),
        );
      }
    } catch (_e2) {}

    try {
      var expVizRaw = localStorage.getItem('aepExpVizImageUrls');
      if (expVizRaw) {
        var evAll = JSON.parse(expVizRaw);
        var ev = null;
        if (evAll && typeof evAll === 'object') {
          var sb2 = getActiveSandboxSlug();
          ev = (sb2 && evAll[sb2]) || evAll._default;
          if (!ev) {
            var evKey = Object.keys(evAll).find(function (k) {
              return evAll[k] && typeof evAll[k] === 'object';
            });
            if (evKey) ev = evAll[evKey];
          }
        }
        if (ev && typeof ev === 'object') {
          tasks.push(
            saveSection(SECTIONS.ExpVisualiser, ev, { skipEnsurePrep: true }).then(function () {
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
        var ea = null;
        if (eaAll && typeof eaAll === 'object') {
          var sb3 = getActiveSandboxSlug();
          ea = (sb3 && eaAll[sb3]) || eaAll._default;
          if (!ea) {
            var eaKey = Object.keys(eaAll).find(function (k) {
              return eaAll[k] && typeof eaAll[k] === 'object';
            });
            if (eaKey) ea = eaAll[eaKey];
          }
        }
        if (ea && typeof ea === 'object') {
          tasks.push(
            saveSection(SECTIONS.ExpAccelerator, ea, { skipEnsurePrep: true }).then(function () {
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
    WORKSPACE_ROOT_SECTIONS: WORKSPACE_ROOT_SECTIONS,
    CANONICAL_CORE_DEMO_KEYS: CANONICAL_CORE_DEMO_KEYS,
    normalizeSlug: normalizeSlug,
    getRtdbBase: getRtdbBase,
    getLdapSlugSync: getLdapSlugSync,
    setCachedLdapSlug: setCachedLdapSlug,
    resolveLdapSlugAsync: resolveLdapSlugAsync,
    getActiveSandboxSlug: getActiveSandboxSlug,
    sectionPath: sectionPath,
    workspaceSectionPath: workspaceSectionPath,
    isWorkspaceRootSection: isWorkspaceRootSection,
    legacyRootPath: legacyRootPath,
    sandboxRestUrl: sandboxRestUrl,
    buildFlatLabStub: buildFlatLabStub,
    splitStubIntoSections: splitStubIntoSections,
    sanitizeCoreDemoData: sanitizeCoreDemoData,
    stripStaleCoreDemoFields: stripStaleCoreDemoFields,
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
    loadWorkspaceSections: loadWorkspaceSections,
    loadSandboxSections: loadSandboxSections,
    migrateLocalStorageKeys: migrateLocalStorageKeys,
    loadLegacyFlat: loadLegacyFlat,
    whenReady: whenReady,
  };
})(typeof window !== 'undefined' ? window : this);
