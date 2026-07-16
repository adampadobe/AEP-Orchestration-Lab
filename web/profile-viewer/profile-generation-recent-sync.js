/**
 * Firestore sync for recently generated profiles (GET/POST /api/lab/recent-profiles).
 * Portal + MCP share the same per-uid, per-sandbox list in Firestore.
 */
(function attachProfileGenerationRecentSync(global) {
  'use strict';

  var API = '/api/lab/recent-profiles';
  var MIGRATION_DONE_KEY = 'profileGenRecentServerMigration:v1';
  var pullInFlight = null;
  var serverItems = [];
  var syncState = { status: 'idle', sandbox: '', error: null, lastPulledAt: null };

  function authHeaders() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getAuthHeaders === 'function') {
      return global.AepLabSandboxSync.getAuthHeaders();
    }
    return Promise.resolve({});
  }

  function getSandboxName() {
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      return String(global.AepLabSandboxSync.getSandbox() || '').trim();
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_e) { return null; }
  }

  function migrationDoneForSandbox(sb) {
    try {
      var raw = safeGet(MIGRATION_DONE_KEY);
      if (!raw) return false;
      var map = JSON.parse(raw);
      return !!(map && map[sb]);
    } catch (_e2) {
      return false;
    }
  }

  function markMigrationDone(sb) {
    try {
      var map = {};
      var raw = safeGet(MIGRATION_DONE_KEY);
      if (raw) map = JSON.parse(raw) || {};
      map[sb] = new Date().toISOString();
      localStorage.setItem(MIGRATION_DONE_KEY, JSON.stringify(map));
    } catch (_e) {}
  }

  function notifyState(patch) {
    syncState = Object.assign({}, syncState, patch || {});
    try {
      global.dispatchEvent(new CustomEvent('aep-profile-gen-recent-sync-state', {
        detail: Object.assign({}, syncState),
      }));
    } catch (_e) {}
  }

  function collectLocalEntriesForSandbox(sandbox) {
    var Shared = global.AepProfileGenShared;
    if (!Shared) return [];
    var sb = String(sandbox || '').trim();
    if (!sb) return [];
    var prefix = Shared.PREFIX_NEW + 'Recent:' + sb + ':';
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf(prefix) !== 0) continue;
        var raw = safeGet(key);
        if (!raw) continue;
        try {
          var arr = JSON.parse(raw);
          if (!Array.isArray(arr)) continue;
          arr.forEach(function (entry) {
            if (!entry || !entry.scaledEmail) return;
            out.push({
              email: entry.scaledEmail,
              scaledEmail: entry.scaledEmail,
              n: entry.n,
              generatedAt: entry.ts ? new Date(entry.ts).toISOString() : new Date().toISOString(),
              ts: entry.ts || Date.now(),
              snapshot: entry.snapshot,
              industry: entry.industryKey || entry.industry || null,
              industryDisplayName: entry.industryDisplayName || null,
              source: 'portal',
              sandbox: sb,
            });
          });
        } catch (_e2) {}
      }
    } catch (_e3) {}
    return out;
  }

  function serverItemToLocalEntry(item) {
    if (!item || !item.email) return null;
    return {
      scaledEmail: item.email,
      email: item.email,
      n: item.n != null ? item.n : null,
      ts: item.ts || Date.parse(item.generatedAt) || Date.now(),
      snapshot: item.snapshot || null,
      ecid: item.ecid || null,
      industry: item.industry || null,
      industryKey: item.industry || null,
      industryDisplayName: item.industryDisplayName
        || (global.AepProfileGenShared && item.industry
          ? global.AepProfileGenShared.industryDisplayNameForKey(item.industry)
          : null),
      summaryLabel: item.summaryLabel || '',
      source: item.source || 'portal',
    };
  }

  function dedupeByEmail(entries) {
    var by = new Map();
    entries.forEach(function (entry) {
      if (!entry || !entry.scaledEmail) return;
      var key = String(entry.scaledEmail).trim().toLowerCase();
      var prev = by.get(key);
      if (!prev || (entry.ts || 0) > (prev.ts || 0)) by.set(key, entry);
    });
    return Array.from(by.values()).sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  function getMergedList(sandbox, baseEmail) {
    var Shared = global.AepProfileGenShared;
    var sb = String(sandbox || getSandboxName() || '').trim();
    var local = Shared ? Shared.readRecent(sb, baseEmail) : [];
    var fromServer = serverItems.map(serverItemToLocalEntry).filter(Boolean);
    var merged = dedupeByEmail(fromServer.concat(local));
    var limit = Shared && Shared.RECENT_LIMIT ? Shared.RECENT_LIMIT : 20;
    return merged.slice(0, limit);
  }

  function summariseEntry(entry) {
    if (!entry) return '';
    if (entry.summaryLabel) {
      var label = String(entry.summaryLabel);
      var email = String(entry.scaledEmail || entry.email || '');
      if (email && label.indexOf(email) === 0) {
        var tail = label.slice(email.length).replace(/^\s*[—-]\s*/, '');
        return tail.trim();
      }
      if (label.indexOf(' — ') >= 0) return label.split(' — ').slice(1).join(' — ');
      return label;
    }
    return '';
  }

  function maybeMigrateLocal(sb, serverList) {
    if (migrationDoneForSandbox(sb)) return Promise.resolve(serverList);
    var localAll = collectLocalEntriesForSandbox(sb);
    if (!localAll.length) {
      markMigrationDone(sb);
      return Promise.resolve(serverList);
    }
    var serverEmails = new Set((serverList || []).map(function (row) {
      return String(row.email || '').trim().toLowerCase();
    }));
    var toUpload = localAll.filter(function (row) {
      return !serverEmails.has(String(row.email || '').trim().toLowerCase());
    });
    if (!toUpload.length) {
      markMigrationDone(sb);
      return Promise.resolve(serverList);
    }
    return authHeaders()
      .then(function (headers) {
        return fetch(API, {
          method: 'POST',
          headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify({ sandbox: sb, source: 'portal', items: toUpload }),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        markMigrationDone(sb);
        if (out.res.ok && out.data && out.data.ok !== false && Array.isArray(out.data.items)) {
          return out.data.items;
        }
        return serverList;
      })
      .catch(function () {
        markMigrationDone(sb);
        return serverList;
      });
  }

  function pull(sandbox) {
    var sb = String(sandbox || getSandboxName() || '').trim();
    if (!sb) return Promise.resolve([]);
    if (pullInFlight) return pullInFlight;

    notifyState({ status: 'pulling', sandbox: sb, error: null });

    pullInFlight = authHeaders()
      .then(function (headers) {
        return fetch(API + '?sandbox=' + encodeURIComponent(sb), {
          method: 'GET',
          headers: Object.assign({ Accept: 'application/json' }, headers || {}),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (!out.res.ok || !out.data || out.data.ok === false) {
          notifyState({
            status: 'error',
            sandbox: sb,
            error: (out.data && out.data.error) || ('HTTP ' + out.res.status),
          });
          return [];
        }
        return Array.isArray(out.data.items) ? out.data.items : [];
      })
      .then(function (items) {
        return maybeMigrateLocal(sb, items);
      })
      .then(function (items) {
        serverItems = Array.isArray(items) ? items : [];
        notifyState({
          status: 'pulled',
          sandbox: sb,
          error: null,
          lastPulledAt: new Date().toISOString(),
        });
        try {
          document.dispatchEvent(new CustomEvent('aep-profile-gen-recent-pulled', {
            detail: { sandbox: sb, items: serverItems },
          }));
        } catch (_e) {}
        return serverItems;
      })
      .catch(function (err) {
        notifyState({
          status: 'error',
          sandbox: sb,
          error: String((err && err.message) || err || 'Network error'),
        });
        return [];
      })
      .finally(function () {
        pullInFlight = null;
      });

    return pullInFlight;
  }

  function appendEntry(opts) {
    var sb = String((opts && opts.sandbox) || getSandboxName() || '').trim();
    var Shared = global.AepProfileGenShared;
    var email = String((opts && opts.email) || (opts && opts.scaledEmail) || '').trim();
    if (!email || !sb) return Promise.resolve({ ok: false });

    if (Shared && opts && opts.writeLocal !== false) {
      var industryKey = opts.industry || opts.industryKey || null;
      var industryDisplayName = opts.industryDisplayName
        || (industryKey ? Shared.industryDisplayNameForKey(industryKey) : null);
      Shared.pushRecent(sb, (opts && opts.baseEmail) || '', {
        scaledEmail: email,
        n: opts.n,
        ts: opts.ts || Date.now(),
        snapshot: opts.snapshot,
        industryKey: industryKey,
        industryDisplayName: industryDisplayName || null,
      });
    }

    var body = {
      sandbox: sb,
      email: email,
      ecid: opts && opts.ecid,
      industry: opts && opts.industry,
      summaryLabel: opts && opts.summaryLabel,
      generatedAt: opts && opts.generatedAt,
      source: (opts && opts.source) || 'portal',
      personName: opts && opts.personName,
      mobilePhone: opts && opts.mobilePhone,
      snapshot: opts && opts.snapshot,
      n: opts && opts.n,
    };

    return authHeaders()
      .then(function (headers) {
        return fetch(API, {
          method: 'POST',
          headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, headers || {}),
          body: JSON.stringify(body),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (out.res.ok && out.data && out.data.ok !== false && Array.isArray(out.data.items)) {
          serverItems = out.data.items;
          try {
            document.dispatchEvent(new CustomEvent('aep-profile-gen-recent-pulled', {
              detail: { sandbox: sb, items: serverItems },
            }));
          } catch (_e2) {}
          return { ok: true, item: out.data.item, items: out.data.items };
        }
        return { ok: false, error: (out.data && out.data.error) || ('HTTP ' + out.res.status) };
      })
      .catch(function (err) {
        return { ok: false, error: String((err && err.message) || err || 'Network error') };
      });
  }

  function onSandboxChange() {
    pull(getSandboxName());
  }

  function bootPull() {
    var authReady = global.AepLabSandboxSync && global.AepLabSandboxSync.whenReady
      ? global.AepLabSandboxSync.whenReady.catch(function () {})
      : Promise.resolve();
    authReady.then(function () {
      pull(getSandboxName());
    });
  }

  global.addEventListener('aep-global-sandbox-change', onSandboxChange);

  global.AepProfileGenRecentSync = {
    pull: pull,
    appendEntry: appendEntry,
    getMergedList: getMergedList,
    summariseEntry: summariseEntry,
    getServerItems: function () { return serverItems.slice(); },
    getSyncState: function () { return Object.assign({}, syncState); },
  };

  setTimeout(bootPull, 400);
})(window);
