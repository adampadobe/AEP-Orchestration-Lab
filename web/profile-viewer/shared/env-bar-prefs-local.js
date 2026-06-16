/**
 * Unified localStorage for lab env bar user prefs (cross-demo sandbox, Tags, BC, generator).
 * Namespace: aepLabEnvBarV1 — migrates legacy per-demo {storagePrefix}* keys on first read.
 *
 * @module env-bar-prefs-local
 */
(function attachLabEnvBarPrefsLocal(global) {
  'use strict';

  var STORAGE_KEY = 'aepLabEnvBarV1';
  var LS_SANDBOX = 'aepGlobalSandboxName';
  var GEN_TARGET_LEGACY = 'aepDemoGeneratorTargetBySandbox';
  var MIGRATED_FLAG = 'aepLabEnvBarV1Migrated';
  var USER_PICK_SESSION_KEY = 'aepLabEnvBarSandboxUserPickAt';

  /** Monotonic stamp when the user explicitly picks a sandbox (dropdown / setEnvironment). */
  var localSandboxUserPickAt = 0;

  /** Legacy map suffix → unified tags field */
  var TAGS_SUFFIX_TO_FIELD = {
    SelectedLaunchScriptBySandbox: 'launchScript',
    SdkConfiguredBySandbox: 'configured',
    SelectedTagsCompanyBySandbox: 'company',
    SelectedTagsPropertyBySandbox: 'property',
    SelectedTagsEnvironmentBySandbox: 'environment',
    LastResolvedEcidBySandbox: 'ecid',
  };

  /** Shared BC keys (cross-demo) → bc field */
  var SHARED_BC_KEY_TO_FIELD = {
    siteCloneBcStyleConfigUrlBySandbox: 'styleUrl',
    siteCloneBcDatastreamIdBySandbox: 'datastreamId',
    siteCloneBcDisplayPrefsBySandbox: 'displayPrefs',
    siteCloneDecisioningPrefsBySandbox: 'decisioningPrefs',
  };

  function emptyDoc() {
    return {
      version: 1,
      selectedSandbox: '',
      tagsBySandbox: {},
      bcBySandbox: {},
      generatorTargetBySandbox: {},
    };
  }

  function readRawDoc() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyDoc();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyDoc();
      return {
        version: 1,
        selectedSandbox: String(parsed.selectedSandbox || ''),
        tagsBySandbox: parsed.tagsBySandbox && typeof parsed.tagsBySandbox === 'object' ? parsed.tagsBySandbox : {},
        bcBySandbox: parsed.bcBySandbox && typeof parsed.bcBySandbox === 'object' ? parsed.bcBySandbox : {},
        generatorTargetBySandbox:
          parsed.generatorTargetBySandbox && typeof parsed.generatorTargetBySandbox === 'object'
            ? parsed.generatorTargetBySandbox
            : {},
      };
    } catch (_e) {
      return emptyDoc();
    }
  }

  function writeRawDoc(doc) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc || emptyDoc()));
    } catch (_e2) {
      /* noop */
    }
  }

  function sandboxKey(raw) {
    var v = String(raw || '').trim().toLowerCase();
    return v ? v.replace(/[^a-z0-9_-]/g, '_') : '__default__';
  }

  function readLegacyMap(key) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function writeLegacyMap(key, mapObj) {
    try {
      global.localStorage.setItem(key, JSON.stringify(mapObj || {}));
    } catch (_e) {
      /* noop */
    }
  }

  function parseTagsLegacyKey(legacyKey) {
    var key = String(legacyKey || '');
    for (var suffix in TAGS_SUFFIX_TO_FIELD) {
      if (key.indexOf(suffix) === key.length - suffix.length) {
        return { field: TAGS_SUFFIX_TO_FIELD[suffix], prefix: key.slice(0, key.length - suffix.length) };
      }
    }
    return null;
  }

  function isWebPushLegacyKey(legacyKey) {
    return /WebPushOnInjectBySandbox$/.test(String(legacyKey || ''));
  }

  function migrateOnce() {
    try {
      if (global.localStorage.getItem(MIGRATED_FLAG) === '1') return;
    } catch (_f) {
      return;
    }

    var doc = readRawDoc();
    var changed = false;

    /* Sandbox from aepGlobalSandboxName */
    try {
      var sb = String(global.localStorage.getItem(LS_SANDBOX) || '').trim();
      if (sb && !doc.selectedSandbox) {
        doc.selectedSandbox = sb;
        changed = true;
      }
    } catch (_s) {}

    /* Generator targets legacy flat map */
    var genMap = readLegacyMap(GEN_TARGET_LEGACY);
    for (var gk in genMap) {
      if (!Object.prototype.hasOwnProperty.call(genMap, gk)) continue;
      var gsk = sandboxKey(gk);
      if (!doc.generatorTargetBySandbox[gsk]) {
        doc.generatorTargetBySandbox[gsk] = String(genMap[gk] || '');
        changed = true;
      }
    }

    /* Scan localStorage for *BySandbox tags keys */
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var lk = global.localStorage.key(i);
        if (!lk) continue;
        var tagsMeta = parseTagsLegacyKey(lk);
        if (tagsMeta) {
          var tmap = readLegacyMap(lk);
          for (var tsk in tmap) {
            if (!Object.prototype.hasOwnProperty.call(tmap, tsk)) continue;
            var norm = sandboxKey(tsk);
            if (!doc.tagsBySandbox[norm]) doc.tagsBySandbox[norm] = {};
            if (doc.tagsBySandbox[norm][tagsMeta.field] == null || doc.tagsBySandbox[norm][tagsMeta.field] === '') {
              doc.tagsBySandbox[norm][tagsMeta.field] = tmap[tsk];
              changed = true;
            }
          }
        } else if (SHARED_BC_KEY_TO_FIELD[lk]) {
          var bfield = SHARED_BC_KEY_TO_FIELD[lk];
          var bmap = readLegacyMap(lk);
          for (var bsk in bmap) {
            if (!Object.prototype.hasOwnProperty.call(bmap, bsk)) continue;
            var bnorm = sandboxKey(bsk);
            if (!doc.bcBySandbox[bnorm]) doc.bcBySandbox[bnorm] = {};
            if (doc.bcBySandbox[bnorm][bfield] == null || doc.bcBySandbox[bnorm][bfield] === '') {
              doc.bcBySandbox[bnorm][bfield] = bmap[bsk];
              changed = true;
            }
          }
        } else if (isWebPushLegacyKey(lk)) {
          var wpmap = readLegacyMap(lk);
          for (var wsk in wpmap) {
            if (!Object.prototype.hasOwnProperty.call(wpmap, wsk)) continue;
            var wnorm = sandboxKey(wsk);
            if (!doc.bcBySandbox[wnorm]) doc.bcBySandbox[wnorm] = {};
            if (doc.bcBySandbox[wnorm].webPush == null || doc.bcBySandbox[wnorm].webPush === '') {
              doc.bcBySandbox[wnorm].webPush = wpmap[wsk];
              changed = true;
            }
          }
        }
      }
    } catch (_scan) {}

    if (changed) writeRawDoc(doc);
    try {
      global.localStorage.setItem(MIGRATED_FLAG, '1');
    } catch (_m) {}
  }

  function getDoc() {
    migrateOnce();
    return readRawDoc();
  }

  function patchDoc(partial) {
    var doc = getDoc();
    if (partial && partial.selectedSandbox != null) doc.selectedSandbox = String(partial.selectedSandbox || '').trim();
    if (partial && partial.tagsBySandbox) {
      for (var tsk in partial.tagsBySandbox) {
        if (!Object.prototype.hasOwnProperty.call(partial.tagsBySandbox, tsk)) continue;
        var tn = sandboxKey(tsk);
        doc.tagsBySandbox[tn] = Object.assign({}, doc.tagsBySandbox[tn] || {}, partial.tagsBySandbox[tsk]);
      }
    }
    if (partial && partial.bcBySandbox) {
      for (var bsk in partial.bcBySandbox) {
        if (!Object.prototype.hasOwnProperty.call(partial.bcBySandbox, bsk)) continue;
        var bn = sandboxKey(bsk);
        var existing = doc.bcBySandbox[bn] || {};
        var incoming = partial.bcBySandbox[bsk] || {};
        var merged = Object.assign({}, existing, incoming);
        if (existing.displayPrefs && typeof existing.displayPrefs === 'object') {
          merged.displayPrefs = existing.displayPrefs;
        }
        doc.bcBySandbox[bn] = merged;
      }
    }
    if (partial && partial.generatorTargetBySandbox) {
      for (var gsk in partial.generatorTargetBySandbox) {
        if (!Object.prototype.hasOwnProperty.call(partial.generatorTargetBySandbox, gsk)) continue;
        var gn = sandboxKey(gsk);
        var gv = String(partial.generatorTargetBySandbox[gsk] || '').trim();
        if (gv) doc.generatorTargetBySandbox[gn] = gv;
        else delete doc.generatorTargetBySandbox[gn];
      }
    }
    writeRawDoc(doc);
    return doc;
  }

  function readSandboxUserPickAt() {
    if (localSandboxUserPickAt > 0) return localSandboxUserPickAt;
    try {
      var raw = global.sessionStorage.getItem(USER_PICK_SESSION_KEY);
      var n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (_e) {
      return 0;
    }
  }

  function markSandboxUserPick() {
    localSandboxUserPickAt = Date.now();
    try {
      global.sessionStorage.setItem(USER_PICK_SESSION_KEY, String(localSandboxUserPickAt));
    } catch (_s) {}
  }

  function hasLocalSandboxUserPick() {
    return readSandboxUserPickAt() > 0;
  }

  function shouldKeepLocalSandboxOverRemote(remoteSandbox) {
    var local = getSelectedSandbox();
    var remote = String(remoteSandbox || '').trim();
    if (!local || !remote || local === remote) return false;
    /* Persisted localStorage wins over Firestore on hard refresh — session pick is optional extra guard. */
    return hasUserSandboxPref() || hasLocalSandboxUserPick();
  }

  function getSelectedSandbox() {
    var doc = getDoc();
    if (doc.selectedSandbox) return doc.selectedSandbox;
    try {
      return String(global.localStorage.getItem(LS_SANDBOX) || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function setSelectedSandbox(name, opts) {
    var v = String(name || '').trim();
    var explicit = !opts || opts.explicit !== false;
    var prev = getSelectedSandbox();
    if (explicit && v) markSandboxUserPick();
    if (v === prev) return;
    patchDoc({ selectedSandbox: v });
    try {
      if (v) global.localStorage.setItem(LS_SANDBOX, v);
      else global.localStorage.removeItem(LS_SANDBOX);
    } catch (_e) {}
    try {
      global.dispatchEvent(new CustomEvent('aep-lab-env-bar-prefs-change', { detail: { type: 'sandbox', sandbox: v } }));
    } catch (_ev) {}
  }

  function hasUserSandboxPref() {
    return !!getSelectedSandbox();
  }

  /**
   * Build legacy per-field map from unified tagsBySandbox (for DemoTagsInjection compat).
   * @param {string} legacyKey
   * @returns {object}
   */
  function readUnifiedLegacyMap(legacyKey) {
    var tagsMeta = parseTagsLegacyKey(legacyKey);
    if (tagsMeta) {
      var doc = getDoc();
      var out = {};
      for (var sk in doc.tagsBySandbox) {
        if (!Object.prototype.hasOwnProperty.call(doc.tagsBySandbox, sk)) continue;
        var entry = doc.tagsBySandbox[sk];
        if (entry && entry[tagsMeta.field] != null && entry[tagsMeta.field] !== '') {
          out[sk] = entry[tagsMeta.field];
        }
      }
      return out;
    }
    if (SHARED_BC_KEY_TO_FIELD[legacyKey]) {
      var field = SHARED_BC_KEY_TO_FIELD[legacyKey];
      var bdoc = getDoc();
      var bout = {};
      for (var bsk in bdoc.bcBySandbox) {
        if (!Object.prototype.hasOwnProperty.call(bdoc.bcBySandbox, bsk)) continue;
        var be = bdoc.bcBySandbox[bsk];
        if (be && be[field] != null && be[field] !== '') bout[bsk] = be[field];
      }
      return bout;
    }
    if (isWebPushLegacyKey(legacyKey)) {
      var wdoc = getDoc();
      var wout = {};
      for (var wsk in wdoc.bcBySandbox) {
        if (!Object.prototype.hasOwnProperty.call(wdoc.bcBySandbox, wsk)) continue;
        var we = wdoc.bcBySandbox[wsk];
        if (we && we.webPush != null && we.webPush !== '') wout[wsk] = we.webPush;
      }
      return wout;
    }
    if (legacyKey === GEN_TARGET_LEGACY) {
      return Object.assign({}, getDoc().generatorTargetBySandbox);
    }
    return null;
  }

  function writeUnifiedLegacyMap(legacyKey, mapObj) {
    var tagsMeta = parseTagsLegacyKey(legacyKey);
    var map = mapObj && typeof mapObj === 'object' ? mapObj : {};
    if (tagsMeta) {
      var tagsPatch = {};
      for (var sk in map) {
        if (!Object.prototype.hasOwnProperty.call(map, sk)) continue;
        var norm = sandboxKey(sk);
        if (!tagsPatch[norm]) tagsPatch[norm] = {};
        tagsPatch[norm][tagsMeta.field] = map[sk];
      }
      patchDoc({ tagsBySandbox: tagsPatch });
      return true;
    }
    if (SHARED_BC_KEY_TO_FIELD[legacyKey]) {
      var field = SHARED_BC_KEY_TO_FIELD[legacyKey];
      var bcPatch = {};
      for (var bsk in map) {
        if (!Object.prototype.hasOwnProperty.call(map, bsk)) continue;
        var bnorm = sandboxKey(bsk);
        if (!bcPatch[bnorm]) bcPatch[bnorm] = {};
        bcPatch[bnorm][field] = map[bsk];
      }
      patchDoc({ bcBySandbox: bcPatch });
      return true;
    }
    if (isWebPushLegacyKey(legacyKey)) {
      var wpPatch = {};
      for (var wsk in map) {
        if (!Object.prototype.hasOwnProperty.call(map, wsk)) continue;
        var wnorm = sandboxKey(wsk);
        if (!wpPatch[wnorm]) wpPatch[wnorm] = {};
        wpPatch[wnorm].webPush = map[wsk];
      }
      patchDoc({ bcBySandbox: wpPatch });
      return true;
    }
    if (legacyKey === GEN_TARGET_LEGACY) {
      patchDoc({ generatorTargetBySandbox: map });
      return true;
    }
    return false;
  }

  function readMap(legacyKey) {
    var unified = readUnifiedLegacyMap(legacyKey);
    if (unified != null) {
      var legacy = readLegacyMap(legacyKey);
      return Object.assign({}, legacy, unified);
    }
    return readLegacyMap(legacyKey);
  }

  function writeMap(legacyKey, mapObj) {
    writeUnifiedLegacyMap(legacyKey, mapObj);
    writeLegacyMap(legacyKey, mapObj);
    try {
      global.dispatchEvent(new CustomEvent('aep-lab-env-bar-prefs-change', { detail: { type: 'map', key: legacyKey } }));
    } catch (_e) {}
  }

  /**
   * Strip user-controlled fields from remote demo config when user pref exists.
   * @param {object} remote
   * @returns {object}
   */
  function stripRemoteUserFields(remote) {
    if (!remote || typeof remote !== 'object') return remote || {};
    if (!hasUserSandboxPref()) return remote;
    var out = Object.assign({}, remote);
    delete out.defaultSandbox;
    return out;
  }

  function exportForSync() {
    var doc = getDoc();
    return {
      selectedSandbox: doc.selectedSandbox || getSelectedSandbox(),
      tagsBySandbox: doc.tagsBySandbox || {},
      bcBySandbox: doc.bcBySandbox || {},
      generatorTargetBySandbox: doc.generatorTargetBySandbox || {},
    };
  }

  function resolveInjectGuardPrefix() {
    try {
      if (global.envBarConfig) {
        var p = String(global.envBarConfig.storagePrefix || global.envBarConfig.prefix || '').trim();
        if (p) return p;
      }
    } catch (_cfg) {}
    return '';
  }

  function tagsInjectInProgress() {
    if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.isInProgress === 'function') {
      if (global.AepLabTagsInjectGuard.isInProgress()) return true;
    }
    var prefix = resolveInjectGuardPrefix();
    if (!prefix) return false;
    try {
      return global.sessionStorage.getItem(prefix + 'InjectInProgress') === '1';
    } catch (_e) {
      return false;
    }
  }

  function tagsInjectSandboxSnapshot() {
    if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.getSandboxSnapshot === 'function') {
      var viaGuard = String(global.AepLabTagsInjectGuard.getSandboxSnapshot() || '').trim();
      if (viaGuard) return viaGuard;
    }
    var prefix = resolveInjectGuardPrefix();
    if (!prefix) return '';
    try {
      if (global.sessionStorage.getItem(prefix + 'InjectInProgress') !== '1') return '';
      return String(global.sessionStorage.getItem(prefix + 'InjectSandboxSnapshot') || '').trim();
    } catch (_e2) {
      return '';
    }
  }

  function importFromSync(prefs, opts) {
    if (!prefs || typeof prefs !== 'object') return getDoc();
    var remoteSb = String(prefs.selectedSandbox || '').trim();
    var skipSandbox = shouldKeepLocalSandboxOverRemote(remoteSb);
    if (tagsInjectInProgress()) {
      skipSandbox = true;
    }
    var patch = {
      tagsBySandbox: prefs.tagsBySandbox,
      bcBySandbox: prefs.bcBySandbox,
      generatorTargetBySandbox: prefs.generatorTargetBySandbox,
    };
    if (!skipSandbox) patch.selectedSandbox = prefs.selectedSandbox;
    else {
      var injectSnap = tagsInjectSandboxSnapshot();
      if (injectSnap) patch.selectedSandbox = injectSnap;
    }
    patchDoc(patch);
    var sb = skipSandbox ? getSelectedSandbox() : remoteSb;
    if (tagsInjectInProgress()) {
      var snap = tagsInjectSandboxSnapshot();
      if (snap) sb = snap;
    }
    var applySandboxUi = sb && (!skipSandbox || tagsInjectInProgress());
    if (applySandboxUi) {
      var current =
        global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSelected === 'function'
          ? String(global.AepGlobalSandbox.getSelected() || '').trim()
          : getSelectedSandbox();
      try {
        if (sb) global.localStorage.setItem(LS_SANDBOX, sb);
      } catch (_e) {}
      if (sb !== current) {
        if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.setSelected === 'function') {
          global.AepGlobalSandbox.setSelected(sb, {
            source: tagsInjectInProgress() ? 'programmatic' : 'sync',
          });
        }
      }
      var select = global.document && global.document.getElementById('sandboxSelect');
      if (select && sb && select.value !== sb) {
        select.value = sb;
        if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.applyStoredSandboxToSelect === 'function') {
          global.AepGlobalSandbox.applyStoredSandboxToSelect(select);
        }
      }
    }
    try {
      global.dispatchEvent(new CustomEvent('aep-lab-env-bar-prefs-synced', { detail: { prefs: exportForSync() } }));
    } catch (_ev) {}
    return getDoc();
  }

  migrateOnce();

  global.AepLabEnvBarPrefs = {
    STORAGE_KEY: STORAGE_KEY,
    getDoc: getDoc,
    patchDoc: patchDoc,
    getSelectedSandbox: getSelectedSandbox,
    setSelectedSandbox: setSelectedSandbox,
    markSandboxUserPick: markSandboxUserPick,
    hasLocalSandboxUserPick: hasLocalSandboxUserPick,
    hasUserSandboxPref: hasUserSandboxPref,
    readMap: readMap,
    writeMap: writeMap,
    stripRemoteUserFields: stripRemoteUserFields,
    exportForSync: exportForSync,
    importFromSync: importFromSync,
    sandboxKey: sandboxKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
