/**
 * AJO unitary execution — Live Activity push (sandbox + payload; IMS auth server-side).
 */
(function () {
  'use strict';

  var API = '/api/ajo/live-activity';

  /** Expanded paths in Paste JSON → Tree view (same idea as Firebase RTDB tree). */
  var laTreeExpanded = new Set();

  /** Normalized path '' = root value; null = edit panel closed. */
  var laTreeEditPath = null;
  /** Last selected path for row highlight (normalized, '' = root). */
  var laTreeSelectedPathKey = null;

  var DEFAULT_CONTENT_STATE = [
    '{',
    '  "boardingStatus": "Check-in Complete",',
    '  "statusMessage": "Proceed to security",',
    '  "timeStatus": "On time",',
    '  "dwellTimeMessage": "Explore KSIA\'s dining & shopping"',
    '}',
  ].join('\n');

  var DEFAULT_ATTRIBUTES = [
    '{',
    '  "flightNumber": "RX 123",',
    '  "airline": "Riyadh Air",',
    '  "departureAirport": "RUH",',
    '  "arrivalAirport": "DXB",',
    '  "departureTime": "14:30",',
    '  "arrivalTime": "17:45",',
    '  "flightDuration": "3h 15m",',
    '  "terminal": "Terminal 1",',
    '  "gate": "A12",',
    '  "seatNumber": "12A",',
    '  "liveActivityData": {',
    '    "liveActivityID": "80085f973468e3e562568e937582397afbbfd9bc599c26c63643d14ff108303e6fe53f098b1168a023609478111fd806728b21384d82fb96bbdc4098c3d04547f38be12bd31397de8e544057b5f17364"',
    '  }',
    '}',
  ].join('\n');

  var DEFAULT_ALERT = [
    '{',
    '  "title": "Check-in Complete",',
    '  "body": "Proceed to security for RX 123"',
    '}',
  ].join('\n');

  /** localStorage for user-saved payload bodies (name + json string). */
  var LA_TEMPLATE_STORAGE_KEY = 'aepLaPayloadTemplatesV1';

  /**
   * Bundled Postman collection bodies (Etihad, KSIA, Travel generic, …) list first under “Saved in this sandbox”
   * for every AEP sandbox name. (Previously gated to `apalmer` only, which hid templates for most presenters.)
   */
  function laSandboxShowsPostmanBuiltins() {
    return true;
  }

  /** Per-sandbox unitary execution row (Campaign / ECID / Live Activity ID / Event) — synced via aep-lab-sandbox-sync. */
  var LA_EXEC_FIELDS_STORAGE_KEY = 'aepLaExecutionFieldsV1';
  var laExecFieldsSaveTimer = null;

  function laScheduleSaveExecutionFields() {
    clearTimeout(laExecFieldsSaveTimer);
    laExecFieldsSaveTimer = setTimeout(function () {
      var o = {
        campaignId: String($('laCampaignId') && $('laCampaignId').value || '').trim(),
        userId: String($('laUserId') && $('laUserId').value || '').trim(),
        liveActivityId: String($('laLiveActivityId') && $('laLiveActivityId').value || '').trim(),
        event: String($('laEvent') && $('laEvent').value || '').trim().toLowerCase(),
      };
      try {
        localStorage.setItem(LA_EXEC_FIELDS_STORAGE_KEY, JSON.stringify(o));
      } catch (e) {}
      if (
        typeof window !== 'undefined' &&
        window.AepLabSandboxSync &&
        typeof window.AepLabSandboxSync.notifyDirty === 'function'
      ) {
        window.AepLabSandboxSync.notifyDirty();
      }
    }, 450);
  }

  function laLoadExecutionFieldsFromStorage() {
    var c = $('laCampaignId');
    var u = $('laUserId');
    var l = $('laLiveActivityId');
    var ev = $('laEvent');
    if (!c || !u || !l || !ev) return;
    try {
      var raw = localStorage.getItem(LA_EXEC_FIELDS_STORAGE_KEY);
      if (!raw) {
        c.value = '';
        u.value = '';
        l.value = '';
        ev.value = '';
        return;
      }
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') {
        c.value = '';
        u.value = '';
        l.value = '';
        ev.value = '';
        return;
      }
      c.value = o.campaignId != null ? String(o.campaignId) : '';
      u.value = o.userId != null ? String(o.userId) : '';
      l.value = o.liveActivityId != null ? String(o.liveActivityId) : '';
      var e = o.event != null ? String(o.event).trim().toLowerCase() : '';
      ev.value = e === 'start' || e === 'update' || e === 'end' ? e : '';
    } catch (err2) {
      c.value = '';
      u.value = '';
      l.value = '';
      ev.value = '';
    }
  }

  function laWireExecutionFieldsPersistence() {
    ['laCampaignId', 'laUserId', 'laLiveActivityId', 'laEvent'].forEach(function (fid) {
      var el = $(fid);
      if (!el) return;
      el.addEventListener('input', laScheduleSaveExecutionFields);
      el.addEventListener('change', laScheduleSaveExecutionFields);
    });
  }

  /**
   * Built-in unitary bodies: raw request bodies from data/live-activities.postman_collection.json
   * (Postman collection v2.1). Loaded at init; duplicate bodies are skipped.
   */
  var LA_BUILTIN_TEMPLATES = [];

  /**
   * Global reference payloads (same in every sandbox) from data/live-activity-examples.json.
   * Shown under “Example”; ids use prefix la-example-.
   */
  var LA_GLOBAL_EXAMPLES = [];

  function laSlugForBuiltinId(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);
  }

  function laWalkPostmanItems(items, groupParts, out) {
    (items || []).forEach(function (node) {
      if (!node) return;
      if (node.item && Array.isArray(node.item)) {
        laWalkPostmanItems(node.item, groupParts.concat(node.name || ''), out);
        return;
      }
      var req = node.request;
      if (!req || !req.body || req.body.mode !== 'raw') return;
      var raw = req.body.raw;
      if (raw == null || !String(raw).trim()) return;
      var parts = (groupParts || []).filter(function (p) {
        return String(p || '').trim();
      });
      var label = parts.concat(node.name || 'Request').join(' — ');
      out.push({
        name: label,
        json: String(raw)
          .replace(/^\uFEFF/, '')
          .trim(),
      });
    });
  }

  function laBuiltinTemplatesFromCollection(coll) {
    var flat = [];
    laWalkPostmanItems(coll && coll.item, [], flat);
    var seenBodies = Object.create(null);
    var usedIds = Object.create(null);
    var result = [];
    flat.forEach(function (entry, idx) {
      var norm = entry.json.replace(/\s+/g, ' ').trim();
      if (seenBodies[norm]) return;
      seenBodies[norm] = true;
      var slug = laSlugForBuiltinId(entry.name.replace(/\s*—\s*/g, ' '));
      if (!slug) slug = 'request-' + idx;
      var id = 'la-builtin-' + slug;
      var orig = id;
      var n = 2;
      while (usedIds[id]) {
        id = orig + '-' + n;
        n++;
      }
      usedIds[id] = true;
      result.push({ id: id, name: entry.name, json: entry.json });
    });
    return result;
  }

  function laBuiltinCollectionUrl() {
    var sc = document.querySelector('script[src*="live-activities.js"]');
    if (sc && sc.getAttribute('src')) {
      try {
        var src = sc.getAttribute('src');
        var u = new URL(src, window.location.href);
        u.search = '';
        u.hash = '';
        var p = u.pathname;
        var slash = p.lastIndexOf('/');
        if (slash >= 0) {
          u.pathname = p.slice(0, slash + 1) + 'data/live-activities.postman_collection.json';
          return u.toString();
        }
      } catch (e) {}
    }
    try {
      return new URL('data/live-activities.postman_collection.json', window.location.href).toString();
    } catch (e2) {
      return 'data/live-activities.postman_collection.json';
    }
  }

  function laExamplesJsonUrl() {
    var sc = document.querySelector('script[src*="live-activities.js"]');
    if (sc && sc.getAttribute('src')) {
      try {
        var src = sc.getAttribute('src');
        var u = new URL(src, window.location.href);
        u.search = '';
        u.hash = '';
        var p = u.pathname;
        var slash = p.lastIndexOf('/');
        if (slash >= 0) {
          u.pathname = p.slice(0, slash + 1) + 'data/live-activity-examples.json';
          return u.toString();
        }
      } catch (e) {}
    }
    try {
      return new URL('data/live-activity-examples.json', window.location.href).toString();
    } catch (e2) {
      return 'data/live-activity-examples.json';
    }
  }

  function laNormalizeGlobalExampleEntry(entry, idx) {
    if (!entry || typeof entry !== 'object') return null;
    var rawId = String(entry.id || '').trim();
    var id =
      rawId.indexOf('la-example-') === 0
        ? rawId
        : 'la-example-' + (rawId ? laSlugForBuiltinId(rawId) : 'item-' + idx);
    var name = String(entry.name || id).trim() || id;
    var json = '';
    if (entry.body != null && typeof entry.body === 'object' && !Array.isArray(entry.body)) {
      try {
        json = JSON.stringify(entry.body, null, 2);
      } catch (e) {
        return null;
      }
    } else if (typeof entry.json === 'string' && String(entry.json).trim()) {
      json = String(entry.json)
        .replace(/^\uFEFF/, '')
        .trim();
    }
    if (!json) return null;
    return { id: id, name: name, json: json };
  }

  function laExamplesFromDoc(data) {
    var arr = data && data.examples;
    if (!Array.isArray(arr)) return [];
    var out = [];
    var usedIds = Object.create(null);
    arr.forEach(function (entry, idx) {
      var n = laNormalizeGlobalExampleEntry(entry, idx);
      if (!n) return;
      var orig = n.id;
      var n2 = 2;
      while (usedIds[n.id]) {
        n.id = orig + '-' + n2;
        n2++;
      }
      usedIds[n.id] = true;
      out.push(n);
    });
    return out;
  }

  function laFetchGlobalExampleTemplates() {
    return fetch(laExamplesJsonUrl(), { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        LA_GLOBAL_EXAMPLES = laExamplesFromDoc(data);
      })
      .catch(function (err) {
        console.warn('Live Activity global examples:', err);
        LA_GLOBAL_EXAMPLES = [];
      });
  }

  /** Canonical copy: Realtime Database `profileViewerConfig/liveActivitiesPostmanCollection` (public read). */
  var LA_RTDB_POSTMAN_PATH = '/profileViewerConfig/liveActivitiesPostmanCollection.json';

  function laIsPostmanCollectionV21(data) {
    return data && typeof data === 'object' && Array.isArray(data.item);
  }

  function laRtdbPostmanCollectionUrl() {
    var cfg = typeof window !== 'undefined' && window.firebaseDatabaseConfig;
    var base = cfg && String(cfg.databaseURL || '').replace(/\/$/, '');
    if (!base) return null;
    return base + LA_RTDB_POSTMAN_PATH;
  }

  function laFetchPostmanCollectionJson() {
    function loadBundled() {
      return fetch(laBuiltinCollectionUrl(), { credentials: 'same-origin' }).then(function (res) {
        if (!res.ok) throw new Error('bundled HTTP ' + res.status);
        return res.json();
      });
    }

    var rtdbUrl = laRtdbPostmanCollectionUrl();
    if (!rtdbUrl) {
      return loadBundled();
    }

    return fetch(rtdbUrl, { credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        if (!res.ok) throw new Error('RTDB HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!laIsPostmanCollectionV21(data)) {
          throw new Error('RTDB payload missing or not a Postman collection');
        }
        return data;
      })
      .catch(function (err) {
        console.warn('Live Activity templates: Firebase RTDB unavailable or empty; using bundled JSON.', err);
        return loadBundled();
      });
  }

  function laFetchBuiltinTemplates() {
    return laFetchPostmanCollectionJson().then(function (coll) {
      LA_BUILTIN_TEMPLATES = laBuiltinTemplatesFromCollection(coll);
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function getSandboxForRequest() {
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return String(AepGlobalSandbox.getSandboxName() || '').trim();
    }
    var el = $('sandboxSelect');
    return el && el.value != null ? String(el.value).trim() : '';
  }

  function sandboxQsAmp() {
    var n = getSandboxForRequest();
    return n ? '&sandbox=' + encodeURIComponent(n) : '';
  }

  function setProfileQueryMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'profile-status consent-message';
    if (type === 'success' || type === 'error' || type === 'loading') {
      el.classList.add(type);
    }
    el.hidden = !text;
  }

  function randomUuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Optional human labels for known API keys (shown under the field name). */
  var FRIENDLY_LABELS = {
    laContentState: {
      boardingStatus: 'Boarding status',
      statusMessage: 'Status line',
      timeStatus: 'On-time status',
      dwellTimeMessage: 'Dwell / shopping message',
    },
    laAttributes: {
      flightNumber: 'Flight number',
      airline: 'Airline',
      departureAirport: 'Departure airport',
      arrivalAirport: 'Arrival airport',
      departureTime: 'Departure time',
      arrivalTime: 'Arrival time',
      flightDuration: 'Duration',
      terminal: 'Terminal',
      gate: 'Gate',
      seatNumber: 'Seat',
      liveActivityData: 'Live Activity token (nested JSON)',
    },
    laAlert: {
      title: 'Notification title',
      body: 'Notification body',
    },
  };

  function isNestedJsonValue(v) {
    return v !== null && typeof v === 'object';
  }

  function primitiveCellValue(v) {
    if (v === undefined) return '';
    if (v === null || typeof v === 'boolean') return String(v);
    if (typeof v === 'number') return String(v);
    return String(v);
  }

  function parsePrimitiveInput(str) {
    var t = String(str).trim();
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    return t;
  }

  function clearKvRows(rowsEl) {
    rowsEl.innerHTML = '';
  }

  function createKvRow(rowsEl, key, value, textareaId) {
    var friendly = key ? (FRIENDLY_LABELS[textareaId] || {})[key] || '' : '';
    var row = document.createElement('div');
    row.className = 'la-kv-row';

    var colKey = document.createElement('div');
    colKey.className = 'la-kv-col la-kv-col--key';
    var lk = document.createElement('label');
    lk.className = 'la-kv-label';
    lk.innerHTML = 'Field name <span class="la-kv-optional">(API key)</span>';
    colKey.appendChild(lk);
    var keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'la-kv-key';
    keyInput.setAttribute('spellcheck', 'false');
    keyInput.setAttribute('autocomplete', 'off');
    keyInput.setAttribute('placeholder', 'e.g. title, gate, liveActivityData');
    keyInput.value = key;
    colKey.appendChild(keyInput);
    if (friendly) {
      var fr = document.createElement('span');
      fr.className = 'la-kv-friendly';
      fr.textContent = friendly;
      colKey.appendChild(fr);
    }

    var colVal = document.createElement('div');
    colVal.className = 'la-kv-col la-kv-col--val';
    var lv = document.createElement('label');
    lv.className = 'la-kv-label';
    lv.textContent = 'Value';
    colVal.appendChild(lv);

    var valForRow = value;
    if (key === '' && (valForRow === undefined || valForRow === '')) {
      valForRow = '';
    }

    if (isNestedJsonValue(valForRow)) {
      var hint = document.createElement('span');
      hint.className = 'la-kv-nested-hint';
      hint.textContent = 'Nested object or array — valid JSON.';
      colVal.appendChild(hint);
      var nta = document.createElement('textarea');
      nta.className = 'la-json la-kv-nested';
      nta.setAttribute('rows', '4');
      nta.setAttribute('spellcheck', 'false');
      nta.value = JSON.stringify(valForRow, null, 2);
      colVal.appendChild(nta);
    } else {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'la-kv-primitive';
      inp.setAttribute('spellcheck', 'false');
      inp.value = primitiveCellValue(valForRow);
      colVal.appendChild(inp);
    }

    var colAct = document.createElement('div');
    colAct.className = 'la-kv-col la-kv-col--actions';
    var rem = document.createElement('button');
    rem.type = 'button';
    rem.className = 'btn btn-secondary la-kv-remove';
    rem.setAttribute('aria-label', 'Remove field');
    rem.textContent = 'Remove';
    colAct.appendChild(rem);

    row.appendChild(colKey);
    row.appendChild(colVal);
    row.appendChild(colAct);
    rowsEl.appendChild(row);
  }

  function populateFormFromObject(rowsEl, obj, textareaId) {
    clearKvRows(rowsEl);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return;
    }
    Object.keys(obj).forEach(function (k) {
      createKvRow(rowsEl, k, obj[k], textareaId);
    });
  }

  function collectObjectFromRows(rowsEl, textareaId) {
    var out = {};
    var rows = rowsEl.querySelectorAll('.la-kv-row');
    rows.forEach(function (row) {
      var kEl = row.querySelector('.la-kv-key');
      var key = kEl && kEl.value != null ? String(kEl.value).trim() : '';
      if (!key) return;
      var nested = row.querySelector('.la-kv-nested');
      if (nested) {
        var raw = nested.value.trim();
        if (!raw) {
          throw new Error('Field "' + key + '" has empty nested JSON (' + textareaId + ').');
        }
        try {
          out[key] = parseUserJson(raw);
        } catch (e) {
          throw new Error(
            'Field "' + key + '" in ' + textareaId + ': invalid nested JSON — ' + (e.message || e)
          );
        }
      } else {
        var inp = row.querySelector('.la-kv-primitive');
        if (!inp) return;
        out[key] = parsePrimitiveInput(inp.value);
      }
    });
    return out;
  }

  function formatJsonTextarea(obj) {
    return JSON.stringify(obj, null, 2);
  }

  /**
   * Postman uses unquoted placeholders: "timestamp": {{$timestamp}} — invalid JSON.
   * Quote bare {{...}} values so JSON.parse succeeds; real sends still replace vars in Postman.
   */
  function sanitizePostmanJsonText(text) {
    return String(text || '').replace(/:(\s*)(\{\{[^{}]+\}\})(?=\s*[,}\]])/g, function (_, space, ph) {
      return ':' + space + JSON.stringify(ph);
    });
  }

  /** Parse user JSON; retry after quoting Postman-style {{tokens}}. */
  function parseUserJson(raw) {
    var s = String(raw || '').trim();
    if (!s) {
      throw new Error('Empty input.');
    }
    try {
      return JSON.parse(s);
    } catch (e0) {
      try {
        return JSON.parse(sanitizePostmanJsonText(s));
      } catch (e1) {
        throw e0;
      }
    }
  }

  function setBlockMode(block, mode) {
    var ta = block.querySelector('.la-json--panel');
    var kvPanel = block.querySelector('.la-kv-panel');
    if (!ta || !kvPanel) return;
    var wrap = ta.closest('.la-json-field-wrap');
    block.querySelectorAll('.la-mode-btn').forEach(function (b) {
      var active = b.getAttribute('data-mode') === mode;
      b.classList.toggle('la-mode-btn--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    block.setAttribute('data-mode', mode);
    if (mode === 'simple') {
      kvPanel.hidden = false;
      if (wrap) {
        wrap.setAttribute('hidden', '');
      } else {
        ta.classList.add('la-json--hidden');
      }
      ta.setAttribute('aria-hidden', 'true');
    } else {
      kvPanel.hidden = true;
      if (wrap) {
        wrap.removeAttribute('hidden');
      } else {
        ta.classList.remove('la-json--hidden');
      }
      ta.setAttribute('aria-hidden', 'false');
      bumpJsonMirror(ta);
    }
  }

  function showKvMsg(block, text) {
    var el = block.querySelector('.la-kv-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Lightweight JSON syntax coloring for the mirror layer (invalid JSON still gets partial styling). */
  function jsonHighlightHtml(s) {
    var i = 0;
    var n = s.length;
    var out = [];
    while (i < n) {
      var c = s.charAt(i);
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
        out.push(escapeHtml(c));
        i++;
        continue;
      }
      if (c === '"') {
        var start = i;
        i++;
        while (i < n) {
          var ch = s.charAt(i);
          if (ch === '\\' && i + 1 < n) {
            i += 2;
            continue;
          }
          if (ch === '"') {
            i++;
            break;
          }
          i++;
        }
        out.push('<span class="la-json-tok la-json-str">' + escapeHtml(s.slice(start, i)) + '</span>');
        continue;
      }
      if ('{[]},:'.indexOf(c) >= 0) {
        out.push('<span class="la-json-tok la-json-punc">' + escapeHtml(c) + '</span>');
        i++;
        continue;
      }
      if (c === '-' || (c >= '0' && c <= '9')) {
        var j = i;
        if (c === '-') i++;
        while (i < n && /[0-9.eE+\-]/.test(s.charAt(i))) i++;
        out.push('<span class="la-json-tok la-json-num">' + escapeHtml(s.slice(j, i)) + '</span>');
        continue;
      }
      if (s.substr(i, 4) === 'true') {
        out.push('<span class="la-json-tok la-json-kw">true</span>');
        i += 4;
        continue;
      }
      if (s.substr(i, 5) === 'false') {
        out.push('<span class="la-json-tok la-json-kw">false</span>');
        i += 5;
        continue;
      }
      if (s.substr(i, 4) === 'null') {
        out.push('<span class="la-json-tok la-json-kw">null</span>');
        i += 4;
        continue;
      }
      out.push(escapeHtml(c));
      i++;
    }
    return out.join('');
  }

  function ensureJsonMirror(ta) {
    if (!ta || ta.dataset.jsonMirror === '1') return;
    var wrap = document.createElement('div');
    wrap.className = 'la-json-field-wrap';
    var pre = document.createElement('pre');
    pre.className = 'la-json-backdrop';
    pre.setAttribute('aria-hidden', 'true');
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(pre);
    wrap.appendChild(ta);
    ta.classList.add('la-json--mirror-input');
    ta.dataset.jsonMirror = '1';
  }

  function refreshJsonMirror(ta) {
    var wrap = ta.closest('.la-json-field-wrap');
    if (!wrap) return;
    var pre = wrap.querySelector('.la-json-backdrop');
    if (!pre) return;
    var raw = ta.value;
    pre.innerHTML = raw ? jsonHighlightHtml(raw) : '';
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }

  function autoSizeJsonTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    var max = Math.min(720, Math.floor(window.innerHeight * 0.65));
    var next = Math.min(ta.scrollHeight + 2, max);
    if (next < 80) next = 80;
    ta.style.height = next + 'px';
    ta.style.maxHeight = max + 'px';
    var wrap = ta.closest('.la-json-field-wrap');
    if (wrap) {
      var pre = wrap.querySelector('.la-json-backdrop');
      if (pre) {
        pre.style.height = next + 'px';
        pre.style.maxHeight = max + 'px';
      }
    }
  }

  function bumpJsonMirror(ta) {
    if (!ta || ta.dataset.jsonMirror !== '1') return;
    refreshJsonMirror(ta);
    autoSizeJsonTextarea(ta);
  }

  function attachJsonMirror(ta) {
    ensureJsonMirror(ta);
    if (ta.dataset.jsonMirrorListeners === '1') return;
    ta.dataset.jsonMirrorListeners = '1';
    function syncBackdropScroll() {
      var wrap = ta.closest('.la-json-field-wrap');
      if (!wrap) return;
      var pre = wrap.querySelector('.la-json-backdrop');
      if (pre) {
        pre.scrollTop = ta.scrollTop;
        pre.scrollLeft = ta.scrollLeft;
      }
    }
    ta.addEventListener('input', function () {
      refreshJsonMirror(ta);
      autoSizeJsonTextarea(ta);
    });
    ta.addEventListener('scroll', syncBackdropScroll);
  }

  function setupJsonMirrors() {
    document.querySelectorAll('.la-json--panel, #laImportPaste').forEach(function (ta) {
      ensureJsonMirror(ta);
      attachJsonMirror(ta);
      ta.scrollTop = 0;
      bumpJsonMirror(ta);
    });
  }

  /** Parse and rewrite with JSON.stringify(…, null, 2); refresh form rows when in Form mode. */
  function beautifyJsonTextarea(ta, onErr) {
    if (!ta) return;
    var raw = String(ta.value || '').trim();
    if (!raw) {
      if (onErr) onErr('Nothing to format.');
      return;
    }
    var parsed;
    try {
      parsed = parseUserJson(raw);
    } catch (e) {
      if (onErr) onErr('Invalid JSON — ' + (e.message || e));
      return;
    }
    ta.value = JSON.stringify(parsed, null, 2);
    ta.scrollTop = 0;
    bumpJsonMirror(ta);
    if (ta.id === 'laImportPaste') {
      showImportMsg('', false);
      afterImportPasteMutation();
    }
    var block = ta.closest('[data-json-editor]');
    if (block && block.getAttribute('data-mode') === 'simple') {
      try {
        syncTextareaToForm(block);
        showKvMsg(block, '');
      } catch (err2) {
        if (onErr) onErr(String(err2.message || err2));
      }
    } else if (block) {
      showKvMsg(block, '');
    }
  }

  function syncFormToTextarea(block) {
    var ta = block.querySelector('.la-json--panel');
    var rows = block.querySelector('[data-kv-rows]');
    if (!ta || !rows) return;
    var obj = collectObjectFromRows(rows, ta.id);
    ta.value = formatJsonTextarea(obj);
    showKvMsg(block, '');
    bumpJsonMirror(ta);
  }

  function syncTextareaToForm(block) {
    var ta = block.querySelector('.la-json--panel');
    var rowsEl = block.querySelector('[data-kv-rows]');
    if (!ta || !rowsEl) return;
    var raw = String(ta.value || '').trim();
    if (!raw) {
      clearKvRows(rowsEl);
      return;
    }
    var parsed;
    try {
      parsed = parseUserJson(raw);
    } catch (e) {
      throw new Error('Invalid JSON — ' + (e.message || e));
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      populateFormFromObject(rowsEl, parsed, ta.id);
      showKvMsg(block, '');
    } else {
      throw new Error('Root value must be a JSON object { … } to use Form mode.');
    }
  }

  function insertAtTextareaCursor(ta, text) {
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var v = ta.value;
    ta.value = v.slice(0, start) + text + v.slice(end);
    var pos = start + text.length;
    ta.selectionStart = ta.selectionEnd = pos;
    ta.scrollTop = 0;
    bumpJsonMirror(ta);
    if (ta.id === 'laImportPaste') afterImportPasteMutation();
  }

  /** True if object looks like the APS block (not a random single-field snippet). */
  function isProbableApsEnvelope(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (obj['content-available'] !== undefined) return true;
    if (obj['content-state'] !== undefined) return true;
    if (obj['attributes-type'] !== undefined) return true;
    if (obj.attributes !== undefined && typeof obj.attributes === 'object') return true;
    if (obj.alert !== undefined && typeof obj.alert === 'object') return true;
    if (obj.event !== undefined) return true;
    if (obj.timestamp !== undefined) return true;
    return false;
  }

  /**
   * Accepts full unitary POST body, recipient wrapper, requestPayload, or raw aps object.
   */
  function extractUnitaryPayload(parsed) {
    if (parsed == null || typeof parsed !== 'object') return null;
    if (parsed.recipients && Array.isArray(parsed.recipients) && parsed.recipients.length) {
      var r0 = parsed.recipients[0];
      var aps = r0 && r0.context && r0.context.requestPayload && r0.context.requestPayload.aps;
      if (aps && typeof aps === 'object' && !Array.isArray(aps)) {
        return {
          campaignId: parsed.campaignId,
          userId: r0.userId,
          requestId: parsed.requestId,
          aps: aps,
        };
      }
    }
    if (parsed.context && parsed.context.requestPayload && parsed.context.requestPayload.aps) {
      var apsW = parsed.context.requestPayload.aps;
      if (apsW && typeof apsW === 'object' && !Array.isArray(apsW)) {
        return {
          campaignId: parsed.campaignId,
          userId: parsed.userId,
          aps: apsW,
        };
      }
    }
    if (parsed.requestPayload && parsed.requestPayload.aps) {
      var apsX = parsed.requestPayload.aps;
      if (apsX && typeof apsX === 'object' && !Array.isArray(apsX)) {
        return { aps: apsX };
      }
    }
    if (parsed.aps && typeof parsed.aps === 'object' && !Array.isArray(parsed.aps) && isProbableApsEnvelope(parsed.aps)) {
      return { aps: parsed.aps };
    }
    if (isProbableApsEnvelope(parsed)) {
      return { aps: parsed };
    }
    return null;
  }

  function applyExtracted(ext) {
    if (!ext || !ext.aps || typeof ext.aps !== 'object' || Array.isArray(ext.aps)) {
      return false;
    }
    if (ext.campaignId != null && ext.campaignId !== '' && $('laCampaignId')) {
      $('laCampaignId').value = String(ext.campaignId);
    }
    if (ext.userId != null && ext.userId !== '' && $('laUserId')) {
      $('laUserId').value = String(ext.userId);
    }
    var aps = ext.aps;
    if (aps['content-available'] !== undefined && $('laContentAvailable')) {
      $('laContentAvailable').value = String(aps['content-available']);
    }
    if (aps.event != null && $('laEvent')) {
      var ev = String(aps.event).toLowerCase().trim();
      if (ev === 'start' || ev === 'update' || ev === 'end') {
        $('laEvent').value = ev;
      }
    }
    if (aps['attributes-type'] != null && $('laAttributesType')) {
      $('laAttributesType').value = String(aps['attributes-type']);
    }

    function blockFor(textareaId) {
      var ta = $(textareaId);
      return ta ? ta.closest('[data-json-editor]') : null;
    }

    function setApsPart(key, textareaId) {
      var v = aps[key];
      var block = blockFor(textareaId);
      var ta = $(textareaId);
      if (!block || !ta) return;
      if (v === undefined) {
        ta.value = '{}';
      } else {
        ta.value = JSON.stringify(v, null, 2);
      }
      ta.scrollTop = 0;
      bumpJsonMirror(ta);
      try {
        syncTextareaToForm(block);
        setBlockMode(block, 'simple');
        showKvMsg(block, '');
      } catch (err) {
        showKvMsg(
          block,
          'Form view unavailable for this value — edit as JSON. ' + (err.message || err)
        );
        setBlockMode(block, 'json');
      }
    }

    setApsPart('content-state', 'laContentState');
    setApsPart('attributes', 'laAttributes');
    setApsPart('alert', 'laAlert');
    laScheduleSaveExecutionFields();
    return true;
  }

  function showImportMsg(text, isErr) {
    var el = $('laImportMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('la-import-msg--err', !!isErr);
  }

  /**
   * Locate the aps object inside pasted JSON (same shapes as extractUnitaryPayload).
   * Mutates the clone passed in — returns a reference into that object graph.
   */
  function findApsInParsedForMutation(root) {
    if (!root || typeof root !== 'object') return null;
    if (root.recipients && Array.isArray(root.recipients) && root.recipients.length) {
      var r0 = root.recipients[0];
      if (
        r0 &&
        r0.context &&
        r0.context.requestPayload &&
        r0.context.requestPayload.aps &&
        typeof r0.context.requestPayload.aps === 'object' &&
        !Array.isArray(r0.context.requestPayload.aps)
      ) {
        return r0.context.requestPayload.aps;
      }
    }
    if (
      root.context &&
      root.context.requestPayload &&
      root.context.requestPayload.aps &&
      typeof root.context.requestPayload.aps === 'object' &&
      !Array.isArray(root.context.requestPayload.aps)
    ) {
      return root.context.requestPayload.aps;
    }
    if (
      root.requestPayload &&
      root.requestPayload.aps &&
      typeof root.requestPayload.aps === 'object' &&
      !Array.isArray(root.requestPayload.aps)
    ) {
      return root.requestPayload.aps;
    }
    if (root.aps && typeof root.aps === 'object' && !Array.isArray(root.aps)) {
      return root.aps;
    }
    if (isProbableApsEnvelope(root)) {
      return root;
    }
    return null;
  }

  /** iOS generic Travel Live Activity (MessagingDemoAppSwiftUI). */
  var LA_TRAVEL_ATTR_TYPE = 'TravelLiveActivityAttributes';
  var LA_TRAVEL_DEFAULT_APP_GROUP = 'group.com.adampadobe.aep-messaging-demo';
  var LA_TRAVEL_LOGO_LAST_KEY = 'aepLaTravelLogoUrlLast';
  var LA_TRAVEL_LOGO_HISTORY_KEY = 'aepLaTravelLogoUrlHistoryV1';
  var LA_TRAVEL_LOGO_HISTORY_MAX = 20;
  var laTravelLogoRememberTimer = null;

  /**
   * True when the unitary (or compatible) payload uses TravelLiveActivityAttributes.
   * @param {object} payload — root JSON object (e.g. full unitary body)
   */
  function laIsTravelGeneric(payload) {
    try {
      if (!payload || typeof payload !== 'object') return false;
      var aps = findApsInParsedForMutation(payload);
      if (!aps) return false;
      return String(aps['attributes-type'] || '') === LA_TRAVEL_ATTR_TYPE;
    } catch (e) {
      return false;
    }
  }

  function laTravelDefaultTheme() {
    return { background: '#0F7D47', accent: '#69D444', onBackground: '#FFFFFF' };
  }

  function laTravelDefaultContentState(phase) {
    var t = laTravelDefaultTheme();
    if (phase === 'boarding') {
      return {
        phase: 'boarding',
        theme: JSON.parse(JSON.stringify(t)),
        flightNumber: 'AA 101',
        departureAirport: 'RUH',
        arrivalAirport: 'DXB',
        departureTime: '18:45',
        arrivalTime: '21:10',
        timeStatus: 'On time',
        boardingStatus: 'Boarding',
        terminal: 'Terminal 4',
        gate: 'A22',
        statusMessage: 'Please proceed to gate',
      };
    }
    if (phase === 'airport') {
      return {
        phase: 'airport',
        theme: JSON.parse(JSON.stringify(t)),
        flightNumber: 'AA 101',
        departureAirport: 'RUH',
        arrivalAirport: 'DXB',
        departureTime: '18:45',
        arrivalTime: '21:10',
        timeStatus: 'On time',
        boardingStatus: 'At airport',
        statusMessage: 'Explore concessions before security',
        dwellTimeMessage: 'Duty-free offers today',
      };
    }
    return {
      phase: 'flight',
      theme: JSON.parse(JSON.stringify(t)),
      flightNumber: 'AA 101',
      departureAirport: 'RUH',
      arrivalAirport: 'DXB',
      departureTime: '18:45',
      arrivalTime: '21:10',
      timeStatus: 'On time',
      status: 'Departed',
      journeyProgress: 25,
      wifiAvailable: true,
      currentLocation: 'Wi-Fi available onboard',
    };
  }

  function laTravelAllowedKeySet(phase) {
    var o = {
      phase: true,
      theme: true,
      flightNumber: true,
      departureAirport: true,
      arrivalAirport: true,
      departureTime: true,
      arrivalTime: true,
      timeStatus: true,
    };
    if (phase === 'flight') {
      o.status = true;
      o.journeyProgress = true;
      o.wifiAvailable = true;
      o.currentLocation = true;
    } else if (phase === 'boarding') {
      o.boardingStatus = true;
      o.terminal = true;
      o.gate = true;
      o.statusMessage = true;
    } else if (phase === 'airport') {
      o.boardingStatus = true;
      o.statusMessage = true;
      o.dwellTimeMessage = true;
    }
    return o;
  }

  function laTravelMergeContentStateForPhase(oldCs, newPhase) {
    var def = laTravelDefaultContentState(newPhase);
    var allowed = laTravelAllowedKeySet(newPhase);
    var old = oldCs && typeof oldCs === 'object' && !Array.isArray(oldCs) ? oldCs : {};
    var out = JSON.parse(JSON.stringify(def));
    Object.keys(old).forEach(function (k) {
      if (!allowed[k]) return;
      if (k === 'theme' && old.theme && typeof old.theme === 'object' && !Array.isArray(old.theme)) {
        out.theme = Object.assign({}, def.theme, old.theme);
      } else {
        out[k] = old[k];
      }
    });
    out.phase = newPhase;
    if (newPhase === 'flight' && out.journeyProgress != null) {
      var jp = Number(out.journeyProgress);
      if (!Number.isFinite(jp)) jp = def.journeyProgress;
      out.journeyProgress = Math.max(0, Math.min(100, Math.round(jp)));
    }
    return out;
  }

  /** Normalize hex to #RRGGBB; null if invalid. */
  function laParseHexColor6(input) {
    var s = String(input || '').trim();
    if (!s) return null;
    if (s.charAt(0) === '#') s = s.slice(1);
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return '#' + s.toLowerCase();
  }

  function laShowTravelBrandMsg(text, isErr) {
    var el = $('laTravelBrandMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('la-template-msg--err', !!isErr);
  }

  var LA_BRANDING_STORAGE_KEY = 'aepLaBrandingThemeV1';
  var laBrandingSaveTimer = null;
  var laBrandScrapesCache = [];

  function laScheduleSaveBrandingTheme() {
    clearTimeout(laBrandingSaveTimer);
    laBrandingSaveTimer = setTimeout(function () {
      try {
        localStorage.setItem(
          LA_BRANDING_STORAGE_KEY,
          JSON.stringify({
            bg: String(($('laBrandThemeBgHex') && $('laBrandThemeBgHex').value) || ''),
            accent: String(($('laBrandThemeAccentHex') && $('laBrandThemeAccentHex').value) || ''),
            text: String(($('laBrandThemeTextHex') && $('laBrandThemeTextHex').value) || ''),
          })
        );
      } catch (e) {}
    }, 400);
  }

  function laSyncBrandingColorRowFromHex(hexId, colorId) {
    var hexEl = $(hexId);
    var colorEl = $(colorId);
    if (!hexEl || !colorEl) return;
    var p = laParseHexColor6(hexEl.value);
    if (p) colorEl.value = p;
  }

  function laSyncBrandingColorRowFromPicker(hexId, colorId) {
    var hexEl = $(hexId);
    var colorEl = $(colorId);
    if (!hexEl || !colorEl) return;
    hexEl.value = colorEl.value;
    laScheduleSaveBrandingTheme();
  }

  function laSetHexAndSyncRow(hexId, colorId, hex) {
    var p = laParseHexColor6(hex);
    if (!p) return;
    var hexEl = $(hexId);
    var colorEl = $(colorId);
    if (hexEl) hexEl.value = p;
    if (colorEl) colorEl.value = p;
    laScheduleSaveBrandingTheme();
  }

  function laGetBrandingThemeFromInputs() {
    var bg = laParseHexColor6($('laBrandThemeBgHex') && $('laBrandThemeBgHex').value);
    var ac = laParseHexColor6($('laBrandThemeAccentHex') && $('laBrandThemeAccentHex').value);
    var ob = laParseHexColor6($('laBrandThemeTextHex') && $('laBrandThemeTextHex').value);
    var d = laTravelDefaultTheme();
    return {
      background: bg || d.background,
      accent: ac || d.accent,
      onBackground: ob || d.onBackground,
    };
  }

  function laSetBrandingInputsFromTheme(th) {
    var t = th && typeof th === 'object' && !Array.isArray(th) ? th : {};
    var d = laTravelDefaultTheme();
    laSetHexAndSyncRow('laBrandThemeBgHex', 'laBrandThemeBgColor', t.background || d.background);
    laSetHexAndSyncRow('laBrandThemeAccentHex', 'laBrandThemeAccentColor', t.accent || d.accent);
    laSetHexAndSyncRow('laBrandThemeTextHex', 'laBrandThemeTextColor', t.onBackground || d.onBackground);
  }

  function laApplyBrandingThemeToTravelAps(aps) {
    if (!aps) return;
    if (!aps['content-state'] || typeof aps['content-state'] !== 'object' || Array.isArray(aps['content-state'])) {
      aps['content-state'] = {};
    }
    aps['content-state'].theme = laGetBrandingThemeFromInputs();
  }

  function laLoadBrandingThemeFromStorage() {
    if (!$('laBrandThemeBgHex')) return;
    try {
      var raw = localStorage.getItem(LA_BRANDING_STORAGE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      if (o.bg) $('laBrandThemeBgHex').value = o.bg;
      if (o.accent && $('laBrandThemeAccentHex')) $('laBrandThemeAccentHex').value = o.accent;
      if (o.text && $('laBrandThemeTextHex')) $('laBrandThemeTextHex').value = o.text;
      laSyncBrandingColorRowFromHex('laBrandThemeBgHex', 'laBrandThemeBgColor');
      laSyncBrandingColorRowFromHex('laBrandThemeAccentHex', 'laBrandThemeAccentColor');
      laSyncBrandingColorRowFromHex('laBrandThemeTextHex', 'laBrandThemeTextColor');
    } catch (e2) {}
  }

  function laWireBrandingColorRow(hexId, colorId, dropperId) {
    var hexEl = $(hexId);
    var colorEl = $(colorId);
    var drop = $(dropperId);
    if (!hexEl || !colorEl) return;
    hexEl.addEventListener('input', function () {
      laSyncBrandingColorRowFromHex(hexId, colorId);
      laScheduleSaveBrandingTheme();
    });
    colorEl.addEventListener('input', function () {
      laSyncBrandingColorRowFromPicker(hexId, colorId);
    });
    if (drop && window.EyeDropper) {
      drop.addEventListener('click', function () {
        try {
          new EyeDropper()
            .open()
            .then(function (res) {
              if (res && res.sRGBHex) laSetHexAndSyncRow(hexId, colorId, res.sRGBHex);
            })
            .catch(function () {});
        } catch (e) {}
      });
    } else if (drop) {
      drop.hidden = true;
    }
  }

  function laShowBrandScrapeMsg(text, isErr) {
    var el = $('laBrandScrapeMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('la-template-msg--err', !!isErr);
  }

  function laGetBrandSwatchTarget() {
    var r = document.querySelector('input[name="laBrandSwatchTarget"]:checked');
    return r ? String(r.value || 'bg') : 'bg';
  }

  function laApplySwatchHexToTarget(hex) {
    var p = laParseHexColor6(hex);
    if (!p) return;
    var t = laGetBrandSwatchTarget();
    if (t === 'accent') laSetHexAndSyncRow('laBrandThemeAccentHex', 'laBrandThemeAccentColor', p);
    else if (t === 'text') laSetHexAndSyncRow('laBrandThemeTextHex', 'laBrandThemeTextColor', p);
    else laSetHexAndSyncRow('laBrandThemeBgHex', 'laBrandThemeBgColor', p);
  }

  function laExtractColoursFromScrapeRecord(rec) {
    var assets = rec && rec.crawlSummary && rec.crawlSummary.assets;
    var arr = assets && Array.isArray(assets.colours) ? assets.colours : [];
    return arr
      .filter(function (c) {
        return c && c.value;
      })
      .map(function (c) {
        return { value: String(c.value).trim(), count: c.count != null ? c.count : 0 };
      });
  }

  function laRenderBrandScrapePalette(colours) {
    var host = $('laBrandScrapePalette');
    if (!host) return;
    host.innerHTML = '';
    (colours || []).slice(0, 24).forEach(function (c) {
      var v = laParseHexColor6(c.value);
      if (!v) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'la-brand-scrape-swatch';
      btn.title = c.value + (c.count != null ? ' · ' + c.count + '×' : '');
      btn.setAttribute('data-hex', v);
      btn.style.background = v;
      var lab = document.createElement('span');
      lab.className = 'la-brand-scrape-swatch-code';
      lab.textContent = v;
      btn.appendChild(lab);
      btn.addEventListener('click', function () {
        laApplySwatchHexToTarget(v);
        laShowBrandScrapeMsg('Applied ' + v + ' to ' + laGetBrandSwatchTarget() + '.', false);
      });
      host.appendChild(btn);
    });
  }

  function laRefreshBrandScrapeSelect() {
    var sb = getSandboxForRequest();
    if (!sb) {
      laShowBrandScrapeMsg('Select a sandbox first.', true);
      return;
    }
    laShowBrandScrapeMsg('Loading scrapes…', false);
    fetch('/api/brand-scraper/scrapes?sandbox=' + encodeURIComponent(sb), { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (x) {
        if (!x.ok) throw new Error((x.data && x.data.error) || 'HTTP ' + x.status);
        laBrandScrapesCache = Array.isArray(x.data.items) ? x.data.items : [];
        var sel = $('laBrandScrapeSelect');
        if (!sel) return;
        var keep = sel.value;
        sel.innerHTML = '<option value="">Select a scrape…</option>';
        laBrandScrapesCache.forEach(function (it) {
          var id = String(it.scrapeId || it.id || '').trim();
          if (!id) return;
          var o = document.createElement('option');
          o.value = id;
          o.textContent =
            (it.brandName ? String(it.brandName) + ' — ' : '') +
            id.slice(0, 12) +
            (id.length > 12 ? '…' : '');
          sel.appendChild(o);
        });
        if (
          keep &&
          Array.prototype.some.call(sel.options, function (op) {
            return op.value === keep;
          })
        ) {
          sel.value = keep;
        }
        laShowBrandScrapeMsg('Loaded ' + laBrandScrapesCache.length + ' scrape(s). Pick one, then Load palette.', false);
      })
      .catch(function (e) {
        laBrandScrapesCache = [];
        laShowBrandScrapeMsg(String(e.message || e), true);
      });
  }

  function laLoadBrandScrapePalette() {
    var sb = getSandboxForRequest();
    var sel = $('laBrandScrapeSelect');
    var id = sel && String(sel.value || '').trim();
    if (!sb || !id) {
      laShowBrandScrapeMsg('Select a sandbox and a scrape first.', true);
      return;
    }
    laShowBrandScrapeMsg('Loading scrape…', false);
    fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(id) + '?sandbox=' + encodeURIComponent(sb), {
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (x) {
        if (!x.ok) throw new Error((x.data && x.data.error) || 'HTTP ' + x.status);
        var cols = laExtractColoursFromScrapeRecord(x.data);
        if (!cols.length) {
          laRenderBrandScrapePalette([]);
          laShowBrandScrapeMsg('No colours in this scrape yet — run a crawl that extracts CSS colours first.', true);
          return;
        }
        laRenderBrandScrapePalette(cols);
        laShowBrandScrapeMsg('Click a swatch to apply to the selected slot (background / accent / text).', false);
      })
      .catch(function (e) {
        laShowBrandScrapeMsg(String(e.message || e), true);
      });
  }

  function laBrandScrapeTop3() {
    var host = $('laBrandScrapePalette');
    if (!host || !host.children.length) {
      laShowBrandScrapeMsg('Load palette first.', true);
      return;
    }
    var nodes = Array.prototype.slice.call(host.querySelectorAll('.la-brand-scrape-swatch[data-hex]'), 0, 3);
    if (!nodes.length) {
      laShowBrandScrapeMsg('No swatches to use.', true);
      return;
    }
    var h0 = nodes[0] && nodes[0].getAttribute('data-hex');
    var h1 = nodes[1] && nodes[1].getAttribute('data-hex');
    var h2 = nodes[2] && nodes[2].getAttribute('data-hex');
    if (h0) laSetHexAndSyncRow('laBrandThemeBgHex', 'laBrandThemeBgColor', h0);
    if (h1) laSetHexAndSyncRow('laBrandThemeAccentHex', 'laBrandThemeAccentColor', h1);
    if (h2) laSetHexAndSyncRow('laBrandThemeTextHex', 'laBrandThemeTextColor', h2);
    laShowBrandScrapeMsg('Set background / accent / text from top ' + nodes.length + ' ranked colours.', false);
  }

  function laWireBrandingPanel() {
    laWireBrandingColorRow('laBrandThemeBgHex', 'laBrandThemeBgColor', 'laBrandBgDropper');
    laWireBrandingColorRow('laBrandThemeAccentHex', 'laBrandThemeAccentColor', 'laBrandAccentDropper');
    laWireBrandingColorRow('laBrandThemeTextHex', 'laBrandThemeTextColor', 'laBrandTextDropper');
    var rb = $('laBrandScrapeRefresh');
    if (rb) rb.addEventListener('click', laRefreshBrandScrapeSelect);
    var lp = $('laBrandScrapeLoadPalette');
    if (lp) lp.addEventListener('click', laLoadBrandScrapePalette);
    var t3 = $('laBrandScrapeTop3');
    if (t3) t3.addEventListener('click', laBrandScrapeTop3);
  }

  function laTravelLogoFullUrl(cdnUrl) {
    if (!cdnUrl) return '';
    var u = String(cdnUrl);
    if (/^https?:\/\//i.test(u)) return u;
    return String(typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '')
      .replace(/\/$/, '') + u;
  }

  function laGetTravelLogoHistory() {
    try {
      var raw = localStorage.getItem(LA_TRAVEL_LOGO_HISTORY_KEY);
      var o = raw ? JSON.parse(raw) : [];
      return Array.isArray(o) ? o.filter(function (x) { return typeof x === 'string' && String(x).trim(); }) : [];
    } catch (e) {
      return [];
    }
  }

  function laFillTravelLogoDatalist() {
    var dl = $('laTravelLogoUrlDatalist');
    if (!dl) return;
    dl.innerHTML = '';
    laGetTravelLogoHistory().forEach(function (url) {
      var o = document.createElement('option');
      o.value = String(url).trim();
      dl.appendChild(o);
    });
  }

  function laRememberTravelLogoUrl(url) {
    var s = String(url || '').trim();
    if (!s || !/^https?:\/\//i.test(s)) return;
    try {
      localStorage.setItem(LA_TRAVEL_LOGO_LAST_KEY, s);
      var hist = laGetTravelLogoHistory().filter(function (h) {
        return h !== s;
      });
      hist.unshift(s);
      while (hist.length > LA_TRAVEL_LOGO_HISTORY_MAX) hist.pop();
      localStorage.setItem(LA_TRAVEL_LOGO_HISTORY_KEY, JSON.stringify(hist));
    } catch (e2) {}
    laFillTravelLogoDatalist();
  }

  function laSyncTravelLogoLibrarySelectToInput() {
    var lib = $('laTravelLogoLibrary');
    var inp = $('laTravelLogoUrl');
    if (!lib || !inp) return;
    var v = String(lib.value || '').trim();
    if (v) {
      inp.value = v;
      laRememberTravelLogoUrl(v);
    }
  }

  function laSelectTravelLogoLibraryOptionForUrl(url) {
    var lib = $('laTravelLogoLibrary');
    if (!lib || !url) return;
    var want = String(url).trim();
    var found = '';
    Array.prototype.forEach.call(lib.options, function (op) {
      if (op.value && op.value === want) found = op.value;
    });
    lib.value = found || '';
  }

  function laIsLibraryImageItem(item) {
    if (!item) return false;
    var ct = String(item.contentType || '').toLowerCase();
    if (ct.indexOf('image/') === 0) return true;
    var f = String(item.file || item.relPath || '');
    return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(f);
  }

  function laPopulateTravelLogoLibrarySelect(items) {
    var lib = $('laTravelLogoLibrary');
    if (!lib) return;
    var keep = lib.value;
    lib.innerHTML = '<option value="">Hosted logos (Firebase library)…</option>';
    (items || []).filter(laIsLibraryImageItem).forEach(function (it) {
      var abs = laTravelLogoFullUrl(it.cdnUrl);
      if (!abs) return;
      var label = (it.relPath || it.file || abs).slice(0, 88);
      var o = document.createElement('option');
      o.value = abs;
      o.textContent = label;
      lib.appendChild(o);
    });
    if (
      keep &&
      Array.prototype.some.call(lib.options, function (op) {
        return op.value === keep;
      })
    ) {
      lib.value = keep;
    }
  }

  function laRefreshTravelLogoLibrarySelect(opts) {
    opts = opts || {};
    var sb = getSandboxForRequest();
    if (!sb) {
      laPopulateTravelLogoLibrarySelect([]);
      if (!opts.silent) laShowTravelBrandMsg('Select a sandbox to load hosted logos.', true);
      return Promise.resolve();
    }
    return fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sb), { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (x) {
        if (!x.ok) throw new Error((x.data && x.data.error) || 'HTTP ' + x.status);
        var items = Array.isArray(x.data.items) ? x.data.items : [];
        laPopulateTravelLogoLibrarySelect(items);
        var n = items.filter(laIsLibraryImageItem).length;
        if (!opts.silent) {
          laShowTravelBrandMsg('Loaded ' + n + ' hosted image(s) from Firebase library.', false);
        }
        var inp = $('laTravelLogoUrl');
        if (inp && String(inp.value || '').trim()) laSelectTravelLogoLibraryOptionForUrl(inp.value);
      })
      .catch(function (e) {
        if (!opts.silent) laShowTravelBrandMsg(String(e.message || e), true);
      });
  }

  function laFileToBase64Data(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(String(r.result || '').split(',')[1] || '');
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function laUploadTravelLogoLibraryFile(file) {
    var sb = getSandboxForRequest();
    if (!sb) {
      laShowTravelBrandMsg('Select a sandbox first.', true);
      return Promise.resolve();
    }
    var okType = file && file.type && /^image\//i.test(file.type);
    var okName = file && /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(file.name || '');
    if (!file || (!okType && !okName)) {
      laShowTravelBrandMsg('Choose an image file.', true);
      return Promise.resolve();
    }
    laShowTravelBrandMsg('Uploading to library…', false);
    return laFileToBase64Data(file)
      .then(function (b64) {
        var m = /\.([a-z0-9]+)$/i.exec(file.name || '');
        var ext = m && m[1] ? '.' + String(m[1]).toLowerCase() : '.png';
        if (!/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/.test(ext)) ext = '.png';
        var uploadName = 'live-activity-logo' + ext;
        return fetch('/api/image-hosting/library/upload?sandbox=' + encodeURIComponent(sb), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sandbox: sb,
            files: [{ name: uploadName, base64: b64, contentType: file.type || '' }],
            keepFilename: false,
            convertToPng: true,
          }),
        }).then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        });
      })
      .then(function (x) {
        if (!x.ok) throw new Error((x.data && x.data.error) || 'upload failed');
        var u = x.data.uploaded && x.data.uploaded[0];
        var url = u && u.cdnUrl ? laTravelLogoFullUrl(u.cdnUrl) : '';
        if (!url) throw new Error('No CDN URL returned');
        var inp = $('laTravelLogoUrl');
        if (inp) inp.value = url;
        laRememberTravelLogoUrl(url);
        return laRefreshTravelLogoLibrarySelect({ silent: true }).then(function () {
          laSelectTravelLogoLibraryOptionForUrl(url);
          laShowTravelBrandMsg('Uploaded to Firebase library — URL set. Apply to JSON when your Travel payload is in the editor.', false);
        });
      })
      .catch(function (e) {
        laShowTravelBrandMsg(String(e.message || e), true);
      });
  }

  function laScheduleRememberTravelLogoFromInput() {
    clearTimeout(laTravelLogoRememberTimer);
    laTravelLogoRememberTimer = setTimeout(function () {
      var inp = $('laTravelLogoUrl');
      var v = inp && String(inp.value || '').trim();
      if (v && /^https?:\/\//i.test(v)) laRememberTravelLogoUrl(v);
    }, 600);
  }

  function laRestoreTravelLogoUrlLast() {
    var inp = $('laTravelLogoUrl');
    if (!inp || String(inp.value || '').trim()) return;
    try {
      var last = localStorage.getItem(LA_TRAVEL_LOGO_LAST_KEY);
      if (last && /^https?:\/\//i.test(String(last).trim())) inp.value = String(last).trim();
    } catch (e) {}
    laFillTravelLogoDatalist();
  }

  function laWireTravelLogoControls() {
    laFillTravelLogoDatalist();
    laRestoreTravelLogoUrlLast();
    var lib = $('laTravelLogoLibrary');
    if (lib) lib.addEventListener('change', laSyncTravelLogoLibrarySelectToInput);
    var ref = $('laTravelLogoLibraryRefresh');
    if (ref) {
      ref.addEventListener('click', function () {
        laRefreshTravelLogoLibrarySelect();
      });
    }
    var up = $('laTravelLogoUploadBtn');
    var fin = $('laTravelLogoFile');
    if (up && fin) {
      up.addEventListener('click', function () {
        fin.click();
      });
      fin.addEventListener('change', function () {
        var f = fin.files && fin.files[0];
        fin.value = '';
        if (f) laUploadTravelLogoLibraryFile(f);
      });
    }
    var inp = $('laTravelLogoUrl');
    if (inp) {
      inp.addEventListener('input', laScheduleRememberTravelLogoFromInput);
      inp.addEventListener('blur', function () {
        var v = String(inp.value || '').trim();
        if (v && /^https?:\/\//i.test(v)) {
          laRememberTravelLogoUrl(v);
          laSelectTravelLogoLibraryOptionForUrl(v);
        }
      });
    }
    if (getSandboxForRequest()) {
      laRefreshTravelLogoLibrarySelect({ silent: true }).catch(function () {});
    }
  }

  function laSyncTravelJourneyProgressOutput() {
    var jp = $('laTravelJourneyProgress');
    var jpo = $('laTravelJourneyProgressOut');
    if (!jp) return;
    var v = String(jp.value != null && jp.value !== '' ? jp.value : '0');
    if (jpo) jpo.textContent = v + '%';
    jp.setAttribute('aria-valuenow', v);
  }

  function laSyncTravelBrandPanel() {
    var ta = $('laImportPaste');
    if (!ta) return;
    var raw = String(ta.value || '').trim();
    if (!raw) return;
    var parsed;
    try {
      parsed = parseUserJson(raw);
    } catch (e) {
      return;
    }
    if (!laIsTravelGeneric(parsed)) return;
    var aps = findApsInParsedForMutation(parsed);
    var attr = (aps && aps.attributes) || {};
    var cs = (aps && aps['content-state']) || {};
    var ag = $('laTravelAppGroupId');
    var bn = $('laTravelBrandName');
    var logo = $('laTravelLogoUrl');
    var ph = $('laTravelPhase');
    var jp = $('laTravelJourneyProgress');
    var hint = $('laTravelLogoHint');
    if (ag) ag.value = attr.appGroupID != null && String(attr.appGroupID) !== '' ? String(attr.appGroupID) : LA_TRAVEL_DEFAULT_APP_GROUP;
    if (bn) bn.value = attr.brandName != null && attr.brandName !== null ? String(attr.brandName) : '';
    if (logo) logo.value = '';
    var libSel = $('laTravelLogoLibrary');
    if (libSel) libSel.value = '';
    if (hint) {
      var lf = attr.logoFileName;
      hint.textContent =
        lf != null && String(lf).trim() !== ''
          ? 'Current attributes.logoFileName: ' + String(lf) + ' — paste a new logo URL to replace, or clear URL and Apply to set null.'
          : 'Host app prefetches this URL into the App Group. We set attributes.logoFileName to SHA-256(URL).png so it matches the cached filename (no logoURL in the push contract).';
    }
    var phv = String(cs.phase || 'flight').toLowerCase();
    if (ph) ph.value = phv === 'boarding' || phv === 'airport' ? phv : 'flight';
    var th = cs.theme && typeof cs.theme === 'object' && !Array.isArray(cs.theme) ? cs.theme : {};
    laSetBrandingInputsFromTheme(th);
    if (jp) {
      var jpv = cs.journeyProgress;
      jp.value =
        jpv != null && String(jpv) !== '' && Number.isFinite(Number(jpv)) ? String(Math.max(0, Math.min(100, Math.round(Number(jpv))))) : '25';
      laSyncTravelJourneyProgressOutput();
    }
  }

  function laTravelWriteParsedToPaste(parsed) {
    var ta = $('laImportPaste');
    if (!ta) return;
    try {
      ta.value = JSON.stringify(parsed, null, 2);
      ta.scrollTop = 0;
      bumpJsonMirror(ta);
      afterImportPasteMutation();
    } catch (e) {
      laShowTravelBrandMsg(String(e.message || e), true);
    }
  }

  function laTravelOnPhaseSelectChange() {
    var ta = $('laImportPaste');
    var ph = $('laTravelPhase');
    if (!ta || !ph) return;
    var raw = String(ta.value || '').trim();
    if (!raw) return;
    var parsed;
    try {
      parsed = parseUserJson(raw);
    } catch (e) {
      return;
    }
    if (!laIsTravelGeneric(parsed)) return;
    var aps = findApsInParsedForMutation(parsed);
    if (!aps) return;
    var newPhase = String(ph.value || 'flight').toLowerCase();
    if (newPhase !== 'flight' && newPhase !== 'boarding' && newPhase !== 'airport') newPhase = 'flight';
    var oldCs = aps['content-state'] && typeof aps['content-state'] === 'object' ? aps['content-state'] : {};
    aps['content-state'] = laTravelMergeContentStateForPhase(oldCs, newPhase);
    laTravelWriteParsedToPaste(parsed);
    laShowTravelBrandMsg('Phase set to ' + newPhase + ' — content-state keys updated.', false);
  }

  function laLogoFilenameFromUrl(url) {
    var u = String(url || '').trim();
    if (!u) return Promise.resolve(null);
    var enc = new TextEncoder();
    var buf = enc.encode(u);
    if (!crypto || !crypto.subtle || !crypto.subtle.digest) {
      return Promise.reject(new Error('SHA-256 not available — use HTTPS or a modern browser.'));
    }
    return crypto.subtle.digest('SHA-256', buf).then(function (hashBuf) {
      var hex = Array.from(new Uint8Array(hashBuf))
        .map(function (b) {
          return b.toString(16).padStart(2, '0');
        })
        .join('');
      return hex + '.png';
    });
  }

  function laApplyTravelBrandNameFromScrape() {
    var nameInput = $('laTravelBrandName');
    var scrapeSel = $('laBrandScrapeSelect');
    if (!nameInput) return;
    var id = scrapeSel && String(scrapeSel.value || '').trim();
    if (!id) {
      laShowTravelBrandMsg('Choose a brand scrape above (Refresh scrapes if the list is empty).', true);
      return;
    }
    var cachedName = '';
    for (var i = 0; i < laBrandScrapesCache.length; i++) {
      var it = laBrandScrapesCache[i];
      var sid = String((it && (it.scrapeId || it.id)) || '').trim();
      if (sid !== id) continue;
      cachedName = it.brandName != null ? String(it.brandName).trim() : '';
      break;
    }
    if (cachedName) {
      nameInput.value = cachedName;
      laShowTravelBrandMsg('Brand name set from scrape.', false);
      return;
    }
    var sb = getSandboxForRequest();
    if (!sb) {
      laShowTravelBrandMsg('Select a sandbox first.', true);
      return;
    }
    laShowTravelBrandMsg('Loading scrape…', false);
    fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(id) + '?sandbox=' + encodeURIComponent(sb), {
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (x) {
        if (!x.ok) throw new Error((x.data && x.data.error) || 'HTTP ' + x.status);
        var bn = x.data.brandName != null ? String(x.data.brandName).trim() : '';
        if (!bn) throw new Error('This scrape has no brand / customer name stored.');
        nameInput.value = bn;
        laShowTravelBrandMsg('Brand name set from scrape.', false);
      })
      .catch(function (e) {
        laShowTravelBrandMsg(String(e.message || e), true);
      });
  }

  function laTravelApplyBrandToPaste() {
    var ta = $('laImportPaste');
    if (!ta || !String(ta.value || '').trim()) {
      laShowTravelBrandMsg('Load or paste JSON first.', true);
      return;
    }
    var parsed;
    try {
      parsed = parseUserJson(ta.value);
    } catch (e) {
      laShowTravelBrandMsg('Invalid JSON — ' + (e.message || e), true);
      return;
    }
    if (!laIsTravelGeneric(parsed)) {
      laShowTravelBrandMsg('Not a Travel generic payload (attributes-type must be TravelLiveActivityAttributes).', true);
      return;
    }
    var aps = findApsInParsedForMutation(parsed);
    if (!aps) {
      laShowTravelBrandMsg('Could not find aps in JSON.', true);
      return;
    }
    var phase = String(($('laTravelPhase') && $('laTravelPhase').value) || 'flight').toLowerCase();
    if (phase !== 'flight' && phase !== 'boarding' && phase !== 'airport') phase = 'flight';
    var oldCs = aps['content-state'] && typeof aps['content-state'] === 'object' ? aps['content-state'] : {};
    var merged = laTravelMergeContentStateForPhase(oldCs, phase);
    merged.theme = laGetBrandingThemeFromInputs();
    if (phase === 'flight') {
      var jinp = $('laTravelJourneyProgress');
      var jv = jinp ? Number(String(jinp.value || '').trim()) : NaN;
      if (Number.isFinite(jv)) merged.journeyProgress = Math.max(0, Math.min(100, Math.round(jv)));
    }
    aps['content-state'] = merged;
    if (!aps.attributes || typeof aps.attributes !== 'object' || Array.isArray(aps.attributes)) aps.attributes = {};
    var agVal = String(($('laTravelAppGroupId') && $('laTravelAppGroupId').value) || '').trim();
    aps.attributes.appGroupID = agVal || LA_TRAVEL_DEFAULT_APP_GROUP;
    var brand = String(($('laTravelBrandName') && $('laTravelBrandName').value) || '').trim();
    aps.attributes.brandName = brand || null;
    var logoUrl = String(($('laTravelLogoUrl') && $('laTravelLogoUrl').value) || '').trim();
    laShowTravelBrandMsg('Updating…', false);
    var done = function (logoFile) {
      aps.attributes.logoFileName = logoFile;
      if (logoUrl) laRememberTravelLogoUrl(logoUrl);
      laTravelWriteParsedToPaste(parsed);
      laShowTravelBrandMsg('Applied to JSON.', false);
    };
    var fail = function (err) {
      laShowTravelBrandMsg(String(err && err.message ? err.message : err), true);
    };
    if (!logoUrl) {
      done(null);
      return;
    }
    laLogoFilenameFromUrl(logoUrl)
      .then(done)
      .catch(fail);
  }

  /**
   * Apply known keys from the execution fields into parsed JSON (structure-aware).
   * patch: { campaignId?, userId?, requestId?, timestamp?, liveActivityId?, event? } — omit keys to skip.
   */
  function mutateLaImportJson(parsed, patch) {
    var o = JSON.parse(JSON.stringify(parsed));
    var changes = [];
    var missed = [];

    if (o === null || typeof o !== 'object' || Array.isArray(o)) {
      return { obj: o, changes: changes, missed: ['root must be a JSON object { … }'] };
    }

    var hasRecip =
      o.recipients &&
      Array.isArray(o.recipients) &&
      o.recipients.length > 0 &&
      o.recipients[0] &&
      typeof o.recipients[0] === 'object';
    var hasTopCampaign = Object.prototype.hasOwnProperty.call(o, 'campaignId');
    var hasTopRequest = Object.prototype.hasOwnProperty.call(o, 'requestId');
    var unitaryScope = hasRecip || hasTopCampaign || hasTopRequest;

    if (patch.campaignId != null && String(patch.campaignId).trim() !== '') {
      if (hasRecip || hasTopCampaign) {
        o.campaignId = String(patch.campaignId).trim();
        changes.push('campaignId');
      } else {
        missed.push('campaignId (needs recipients[] or an existing campaignId key)');
      }
    }

    if (patch.requestId != null && String(patch.requestId).trim() !== '') {
      if (unitaryScope || hasTopRequest) {
        o.requestId = String(patch.requestId).trim();
        changes.push('requestId');
      } else {
        missed.push('requestId (needs unitary shape: recipients, campaignId, or requestId)');
      }
    }

    if (patch.userId != null && String(patch.userId).trim() !== '') {
      var uid = String(patch.userId).trim();
      if (hasRecip) {
        o.recipients[0].userId = uid;
        changes.push('recipients[0].userId');
      } else if (
        Object.prototype.hasOwnProperty.call(o, 'userId') &&
        o.context &&
        o.context.requestPayload
      ) {
        o.userId = uid;
        changes.push('userId');
      } else {
        missed.push('userId (needs recipients[0] or a recipient-shaped object with userId)');
      }
    }

    if (patch.timestamp != null && Number.isFinite(Number(patch.timestamp))) {
      var apsTs = findApsInParsedForMutation(o);
      if (apsTs) {
        apsTs.timestamp = Number(patch.timestamp);
        changes.push('aps.timestamp');
      } else {
        missed.push('timestamp (no aps block found — include requestPayload.aps or a full unitary body)');
      }
    }

    if (patch.liveActivityId != null && String(patch.liveActivityId).trim() !== '') {
      var lai = String(patch.liveActivityId).trim();
      var apsLa = findApsInParsedForMutation(o);
      if (apsLa) {
        if (!apsLa.attributes || typeof apsLa.attributes !== 'object' || Array.isArray(apsLa.attributes)) {
          apsLa.attributes = {};
        }
        if (
          !apsLa.attributes.liveActivityData ||
          typeof apsLa.attributes.liveActivityData !== 'object' ||
          Array.isArray(apsLa.attributes.liveActivityData)
        ) {
          apsLa.attributes.liveActivityData = {};
        }
        apsLa.attributes.liveActivityData.liveActivityID = lai;
        changes.push('attributes.liveActivityData.liveActivityID');
      } else {
        missed.push(
          'liveActivityID (no aps block — paste a unitary body or aps with attributes.liveActivityData)'
        );
      }
    }

    if (patch.event != null && String(patch.event).trim() !== '') {
      var evInj = String(patch.event).trim().toLowerCase();
      if (evInj === 'start' || evInj === 'update' || evInj === 'end') {
        var apsEv = findApsInParsedForMutation(o);
        if (apsEv) {
          apsEv.event = evInj;
          changes.push('aps.event');
        } else {
          missed.push('event (no aps block found)');
        }
      }
    }

    return { obj: o, changes: changes, missed: missed };
  }

  function afterImportPasteMutation() {
    var treeTab = $('laPayloadTabTree');
    if (treeTab && treeTab.getAttribute('aria-selected') === 'true') {
      renderPasteTree();
    }
    laSyncTravelBrandPanel();
  }

  /**
   * Writes formatted JSON back to #laImportPaste. Shows combined success / skip hints.
   * @returns {boolean} true if at least one field was updated
   */
  function injectLaImportPaste(patch, opts) {
    opts = opts || {};
    var ta = $('laImportPaste');
    if (!ta || !String(ta.value || '').trim()) {
      showImportMsg('Load a template or paste JSON in the unitary editor first.', true);
      return false;
    }
    var parsed;
    try {
      parsed = parseUserJson(ta.value);
    } catch (e) {
      showImportMsg('Invalid JSON — ' + (e.message || e), true);
      return false;
    }
    var result = mutateLaImportJson(parsed, patch);
    if (!result.changes.length) {
      var hint = result.missed && result.missed.length ? result.missed.join(' ') : 'Nothing matched this JSON shape.';
      showImportMsg(hint, true);
      return false;
    }
    if (opts.applyBrandingAfter && laIsTravelGeneric(result.obj)) {
      var apsB = findApsInParsedForMutation(result.obj);
      if (apsB) laApplyBrandingThemeToTravelAps(apsB);
    }
    ta.value = formatJsonTextarea(result.obj);
    bumpJsonMirror(ta);
    try {
      ta.focus();
    } catch (e) {}
    afterImportPasteMutation();
    var msg = 'Updated ' + result.changes.join(', ') + '.';
    if (result.missed && result.missed.length) {
      msg += ' Skipped: ' + result.missed.join('; ') + '.';
    }
    if (opts.applyBrandingAfter && laIsTravelGeneric(result.obj)) {
      msg += ' Travel theme from step 3 applied.';
    }
    showImportMsg(msg, false);
    return true;
  }

  /** Tree tab: large viewport (svh) so expanded JSON is readable; cleared when leaving Tree. */
  function setLaTreeViewportMaximized(on) {
    var panel = $('laPayloadTreePanel');
    var viewport = $('laPasteTreeViewport');
    if (panel) panel.classList.toggle('la-payload-panel--tree-max', !!on);
    if (viewport) viewport.classList.toggle('la-paste-tree-viewport--max', !!on);
  }

  /** Paste JSON vs Tree. Form editor is parked (hidden) — map legacy "form" to paste. */
  function setPayloadView(mode) {
    if (mode === 'form') mode = 'paste';
    var pasteTab = $('laPayloadTabPaste');
    var treeTab = $('laPayloadTabTree');
    var pastePanel = $('laPayloadPastePanel');
    var treePanel = $('laPayloadTreePanel');
    var formPanel = $('laPayloadFormPanel');
    if (!pastePanel) return;
    var showPaste = mode === 'paste';
    var showTree = mode === 'tree';
    pastePanel.hidden = !showPaste;
    if (treePanel) treePanel.hidden = !showTree;
    if (formPanel) {
      formPanel.hidden = true;
      formPanel.setAttribute('aria-hidden', 'true');
    }
    if (pasteTab) {
      pasteTab.classList.toggle('la-payload-tab--active', showPaste);
      pasteTab.setAttribute('aria-selected', showPaste ? 'true' : 'false');
    }
    if (treeTab) {
      treeTab.classList.toggle('la-payload-tab--active', showTree);
      treeTab.setAttribute('aria-selected', showTree ? 'true' : 'false');
    }
    if (treePanel) {
      if (showTree) {
        setLaTreeViewportMaximized(true);
        renderPasteTree();
      } else {
        setLaTreeViewportMaximized(false);
      }
    }
  }

  function joinLaPath(prefix, key) {
    if (!prefix) return key;
    return prefix + '/' + key;
  }

  function showTreeMsg(text, isErr) {
    var el = $('laPasteTreeMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('la-paste-tree-msg--err', !!isErr);
  }

  function normalizeLaTreePathAttr(attr) {
    if (attr == null || attr === '' || attr === '__root__') return '';
    return String(attr);
  }

  function getLaAtPath(root, pathKey) {
    if (pathKey === '') return root;
    var parts = pathKey.split('/').filter(Boolean);
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (cur == null || typeof cur !== 'object') return undefined;
      if (Array.isArray(cur)) {
        var idx = parseInt(p, 10);
        if (String(idx) !== p) return undefined;
        cur = cur[idx];
      } else {
        cur = cur[p];
      }
    }
    return cur;
  }

  function setLaAtPathMutate(root, pathKey, newValue) {
    var parts = pathKey.split('/').filter(Boolean);
    if (parts.length === 0) return;
    var cur = root;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      if (Array.isArray(cur)) cur = cur[parseInt(p, 10)];
      else cur = cur[p];
      if (cur == null) return;
    }
    var last = parts[parts.length - 1];
    if (Array.isArray(cur)) cur[parseInt(last, 10)] = newValue;
    else cur[last] = newValue;
  }

  function parseLaEditValue(raw, type) {
    var t = String(type || 'string');
    if (t === 'null') return null;
    if (t === 'boolean') {
      var sb = String(raw).trim().toLowerCase();
      if (sb === 'true') return true;
      if (sb === 'false') return false;
      throw new Error('Boolean must be true or false.');
    }
    if (t === 'number') {
      var n = parseFloat(String(raw).trim());
      if (Number.isNaN(n)) throw new Error('Invalid number.');
      return n;
    }
    if (t === 'json') {
      var j = String(raw || '').trim();
      if (!j) throw new Error('JSON value is empty.');
      return parseUserJson(j);
    }
    return String(raw);
  }

  function openLaTreeEdit(pathAttr, opts) {
    opts = opts || {};
    var pathKey = normalizeLaTreePathAttr(pathAttr);
    var ta = $('laImportPaste');
    var panel = $('laPasteTreeEdit');
    if (!ta || !panel) return;
    var raw = String(ta.value || '').trim();
    if (!raw) {
      showTreeMsg('Paste JSON in the Paste JSON tab first.', true);
      return;
    }
    var parsed;
    try {
      parsed = parseUserJson(raw);
    } catch (e) {
      showTreeMsg('Invalid JSON: ' + (e.message || e), true);
      return;
    }
    var val = getLaAtPath(parsed, pathKey);
    if (val === undefined) {
      showTreeMsg('That path is not in the document — try Refresh tree.', true);
      return;
    }
    var asJson = !!opts.jsonSubtree;
    if (asJson) {
      if (val === null || typeof val !== 'object') {
        showTreeMsg('Nothing to edit as JSON at this path.', true);
        return;
      }
    } else if (val !== null && typeof val === 'object') {
      showTreeMsg('Use the JSON button on this row to edit an object or array.', false);
      return;
    }
    laTreeEditPath = pathKey;
    laTreeSelectedPathKey = pathKey;
    var pathEl = $('laPasteTreeEditPath');
    var keyEl = $('laPasteTreeEditKey');
    var typeEl = $('laPasteTreeEditType');
    var valEl = $('laPasteTreeEditValue');
    if (pathEl) {
      pathEl.textContent =
        pathKey === '' ? 'Path: / (entire document)' : 'Path: /' + pathKey;
    }
    if (keyEl) {
      keyEl.value =
        pathKey === '' ? '(root)' : pathKey.split('/').filter(Boolean).pop() || '(root)';
    }
    if (typeEl && valEl) {
      if (asJson || (val !== null && typeof val === 'object')) {
        typeEl.value = 'json';
        valEl.value = JSON.stringify(val, null, 2);
      } else {
        var ty =
          val === null
            ? 'null'
            : typeof val === 'boolean'
              ? 'boolean'
              : typeof val === 'number'
                ? 'number'
                : 'string';
        typeEl.value = ty;
        if (val === null) valEl.value = '';
        else if (typeof val === 'boolean' || typeof val === 'number') valEl.value = String(val);
        else valEl.value = String(val);
      }
    }
    panel.hidden = false;
    renderPasteTree();
    if (valEl) {
      try {
        valEl.focus();
      } catch (fe) {}
    }
    showTreeMsg('Change the value and click Apply to JSON.', false);
  }

  function cancelLaTreeEdit() {
    laTreeEditPath = null;
    laTreeSelectedPathKey = null;
    var panel = $('laPasteTreeEdit');
    if (panel) panel.hidden = true;
    showTreeMsg('', false);
    renderPasteTree();
  }

  function closeLaTreeEditAfterSave() {
    laTreeEditPath = null;
    var panel = $('laPasteTreeEdit');
    if (panel) panel.hidden = true;
    showTreeMsg('', false);
  }

  function saveLaTreeEdit() {
    if (laTreeEditPath === null) return;
    var pathKey = laTreeEditPath;
    var ta = $('laImportPaste');
    var typeEl = $('laPasteTreeEditType');
    var valEl = $('laPasteTreeEditValue');
    if (!ta || !typeEl || !valEl) return;
    var rawIn = String(ta.value || '').trim();
    var parsed;
    try {
      parsed = parseUserJson(rawIn);
    } catch (e) {
      showTreeMsg('Invalid JSON in paste box: ' + (e.message || e), true);
      return;
    }
    var newVal;
    try {
      newVal = parseLaEditValue(valEl.value, typeEl.value);
    } catch (e2) {
      showTreeMsg(String(e2.message || e2), true);
      return;
    }
    var next;
    if (pathKey === '') {
      next = newVal;
    } else {
      next = JSON.parse(JSON.stringify(parsed));
      setLaAtPathMutate(next, pathKey, newVal);
    }
    try {
      ta.value = JSON.stringify(next, null, 2);
    } catch (e3) {
      showTreeMsg('Could not save: ' + (e3.message || e3), true);
      return;
    }
    bumpJsonMirror(ta);
    afterImportPasteMutation();
    laTreeSelectedPathKey = pathKey;
    closeLaTreeEditAfterSave();
    renderPasteTree();
    showTreeMsg('Updated paste JSON.', false);
  }

  function laPathKeySelected(pathKey) {
    return (
      laTreeSelectedPathKey != null &&
      laTreeSelectedPathKey === pathKey &&
      laTreeEditPath === null
    );
  }

  function formatLaLeafValue(value) {
    if (value === null) return 'null';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
      var s = value;
      if (s.length > 120) return s.slice(0, 120) + '…';
      return s;
    }
    return String(value);
  }

  function childCountLabel(val) {
    if (Array.isArray(val)) return val.length + ' items';
    return Object.keys(val).length + ' keys';
  }

  function renderLaValue(value, path, container) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      renderLaObject(value, path, container);
    } else if (Array.isArray(value)) {
      renderLaArray(value, path, container);
    } else {
      var row = document.createElement('div');
      row.className = 'la-paste-tree-row';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'la-paste-tree-leaf-btn';
      btn.setAttribute('data-la-tree-edit', path === '' ? '__root__' : path);
      if (laPathKeySelected(path === '' ? '' : path)) btn.classList.add('la-paste-tree-leaf-btn--selected');
      var kEl = document.createElement('span');
      kEl.className = 'la-paste-tree-leaf-key';
      kEl.textContent = 'value: ';
      var vEl = document.createElement('span');
      vEl.className = 'la-paste-tree-leaf-val';
      vEl.textContent = formatLaLeafValue(value);
      btn.appendChild(kEl);
      btn.appendChild(vEl);
      row.appendChild(btn);
      container.appendChild(row);
    }
  }

  function renderLaObject(obj, path, container) {
    var keys = Object.keys(obj);
    if (keys.length === 0) {
      var rowE = document.createElement('div');
      rowE.className = 'la-paste-tree-row';
      var em = document.createElement('span');
      em.className = 'la-paste-tree-empty-inline';
      em.textContent = (path || 'root') + ': { }';
      rowE.appendChild(em);
      container.appendChild(rowE);
      return;
    }
    keys.forEach(function (key) {
      var val = obj[key];
      var childPath = joinLaPath(path, key);
      var row = document.createElement('div');
      row.className = 'la-paste-tree-row';
      if (val !== null && typeof val === 'object') {
        var isOpen = laTreeExpanded.has(childPath);
        var line = document.createElement('div');
        line.className = 'la-paste-tree-folder-line';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'la-paste-tree-key la-paste-tree-folder';
        btn.setAttribute('data-la-tree-toggle', childPath);
        btn.textContent = (isOpen ? '▼ ' : '▶ ') + key + ' (' + childCountLabel(val) + ')';
        var ej = document.createElement('button');
        ej.type = 'button';
        ej.className = 'la-paste-tree-json-btn';
        ej.setAttribute('data-la-tree-json', childPath);
        ej.setAttribute('title', 'Edit this object or array as JSON');
        ej.textContent = 'JSON';
        if (laPathKeySelected(childPath)) ej.classList.add('la-paste-tree-json-btn--selected');
        line.appendChild(btn);
        line.appendChild(ej);
        row.appendChild(line);
        var childWrap = document.createElement('div');
        childWrap.className = 'la-paste-tree-children';
        childWrap.style.display = isOpen ? 'block' : 'none';
        renderLaValue(val, childPath, childWrap);
        row.appendChild(childWrap);
      } else {
        var leafBtn = document.createElement('button');
        leafBtn.type = 'button';
        leafBtn.className = 'la-paste-tree-leaf-btn';
        leafBtn.setAttribute('data-la-tree-edit', childPath);
        if (laPathKeySelected(childPath)) leafBtn.classList.add('la-paste-tree-leaf-btn--selected');
        var kEl = document.createElement('span');
        kEl.className = 'la-paste-tree-leaf-key';
        kEl.textContent = key + ': ';
        var vEl = document.createElement('span');
        vEl.className = 'la-paste-tree-leaf-val';
        vEl.textContent = formatLaLeafValue(val);
        leafBtn.appendChild(kEl);
        leafBtn.appendChild(vEl);
        row.appendChild(leafBtn);
      }
      container.appendChild(row);
    });
  }

  function renderLaArray(arr, path, container) {
    if (arr.length === 0) {
      var rowA = document.createElement('div');
      rowA.className = 'la-paste-tree-row';
      var em = document.createElement('span');
      em.className = 'la-paste-tree-empty-inline';
      em.textContent = '[ ] empty array';
      rowA.appendChild(em);
      container.appendChild(rowA);
      return;
    }
    arr.forEach(function (item, i) {
      var childPath = joinLaPath(path, String(i));
      var row = document.createElement('div');
      row.className = 'la-paste-tree-row';
      var label = '[' + i + ']';
      if (item !== null && typeof item === 'object') {
        var isOpen = laTreeExpanded.has(childPath);
        var line = document.createElement('div');
        line.className = 'la-paste-tree-folder-line';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'la-paste-tree-key la-paste-tree-folder';
        btn.setAttribute('data-la-tree-toggle', childPath);
        btn.textContent = (isOpen ? '▼ ' : '▶ ') + label + ' (' + childCountLabel(item) + ')';
        var ej = document.createElement('button');
        ej.type = 'button';
        ej.className = 'la-paste-tree-json-btn';
        ej.setAttribute('data-la-tree-json', childPath);
        ej.setAttribute('title', 'Edit this object or array as JSON');
        ej.textContent = 'JSON';
        if (laPathKeySelected(childPath)) ej.classList.add('la-paste-tree-json-btn--selected');
        line.appendChild(btn);
        line.appendChild(ej);
        row.appendChild(line);
        var childWrap = document.createElement('div');
        childWrap.className = 'la-paste-tree-children';
        childWrap.style.display = isOpen ? 'block' : 'none';
        renderLaValue(item, childPath, childWrap);
        row.appendChild(childWrap);
      } else {
        var leafBtn = document.createElement('button');
        leafBtn.type = 'button';
        leafBtn.className = 'la-paste-tree-leaf-btn';
        leafBtn.setAttribute('data-la-tree-edit', childPath);
        if (laPathKeySelected(childPath)) leafBtn.classList.add('la-paste-tree-leaf-btn--selected');
        var kEl = document.createElement('span');
        kEl.className = 'la-paste-tree-leaf-key';
        kEl.textContent = label + ': ';
        var vEl = document.createElement('span');
        vEl.className = 'la-paste-tree-leaf-val';
        vEl.textContent = formatLaLeafValue(item);
        leafBtn.appendChild(kEl);
        leafBtn.appendChild(vEl);
        row.appendChild(leafBtn);
      }
      container.appendChild(row);
    });
  }

  function renderLaRoot(value, container) {
    if (value !== null && typeof value === 'object') {
      var bar = document.createElement('div');
      bar.className = 'la-paste-tree-root-actions';
      var rootJson = document.createElement('button');
      rootJson.type = 'button';
      rootJson.className = 'btn btn-secondary la-paste-tree-json-btn la-paste-tree-json-btn--wide';
      rootJson.setAttribute('data-la-tree-json', '__root__');
      rootJson.textContent = 'Edit entire JSON';
      if (laPathKeySelected('')) rootJson.classList.add('la-paste-tree-json-btn--selected');
      bar.appendChild(rootJson);
      container.appendChild(bar);
      renderLaValue(value, '', container);
    } else {
      var row = document.createElement('div');
      row.className = 'la-paste-tree-row';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'la-paste-tree-leaf-btn';
      btn.setAttribute('data-la-tree-edit', '__root__');
      if (laPathKeySelected('')) btn.classList.add('la-paste-tree-leaf-btn--selected');
      var kEl = document.createElement('span');
      kEl.className = 'la-paste-tree-leaf-key';
      kEl.textContent = 'Root: ';
      var vEl = document.createElement('span');
      vEl.className = 'la-paste-tree-leaf-val';
      vEl.textContent = formatLaLeafValue(value);
      btn.appendChild(kEl);
      btn.appendChild(vEl);
      row.appendChild(btn);
      container.appendChild(row);
    }
  }

  function renderPasteTree() {
    var el = $('laPasteTree');
    if (!el) return;
    el.innerHTML = '';
    var ta = $('laImportPaste');
    var raw = ta && ta.value != null ? String(ta.value) : '';
    if (!raw.trim()) {
      el.innerHTML =
        '<div class="la-paste-tree-empty">Nothing to show — paste JSON in the <strong>Paste JSON</strong> tab first.</div>';
      return;
    }
    var parsed;
    try {
      parsed = parseUserJson(raw);
    } catch (e) {
      el.innerHTML =
        '<div class="la-paste-tree-empty la-paste-tree-empty--err">Invalid JSON — fix it in Paste JSON or click Beautify. ' +
        escapeHtml(String(e.message || e)) +
        '</div>';
      return;
    }
    renderLaRoot(parsed, el);
  }

  function onLaPasteTreeClick(e) {
    var jsonBtn = e.target.closest('[data-la-tree-json]');
    if (jsonBtn) {
      e.preventDefault();
      openLaTreeEdit(jsonBtn.getAttribute('data-la-tree-json'), { jsonSubtree: true });
      return;
    }
    var leafBtn = e.target.closest('[data-la-tree-edit]');
    if (leafBtn) {
      e.preventDefault();
      openLaTreeEdit(leafBtn.getAttribute('data-la-tree-edit'));
      return;
    }
    var t = e.target.closest('[data-la-tree-toggle]');
    if (!t) return;
    var path = t.getAttribute('data-la-tree-toggle') || '';
    if (laTreeExpanded.has(path)) laTreeExpanded.delete(path);
    else laTreeExpanded.add(path);
    renderPasteTree();
  }

  function collectLaExpandablePaths(val, path, out) {
    if (val === null || typeof val !== 'object') return;
    out.push(path);
    if (Array.isArray(val)) {
      val.forEach(function (item, i) {
        collectLaExpandablePaths(item, joinLaPath(path, String(i)), out);
      });
    } else {
      Object.keys(val).forEach(function (k) {
        collectLaExpandablePaths(val[k], joinLaPath(path, k), out);
      });
    }
  }

  function laPasteTreeExpandAll() {
    var ta = $('laImportPaste');
    if (!ta || !String(ta.value || '').trim()) {
      showTreeMsg('Paste JSON first.', true);
      return;
    }
    var parsed;
    try {
      parsed = parseUserJson(ta.value);
    } catch (e) {
      showTreeMsg('Invalid JSON — fix in Paste JSON tab. ' + (e.message || e), true);
      return;
    }
    laTreeExpanded.clear();
    var paths = [];
    collectLaExpandablePaths(parsed, '', paths);
    paths.forEach(function (p) {
      laTreeExpanded.add(p);
    });
    setLaTreeViewportMaximized(true);
    renderPasteTree();
    var vp = $('laPasteTreeViewport');
    if (vp) {
      vp.scrollTop = 0;
      requestAnimationFrame(function () {
        vp.scrollTop = 0;
      });
    }
    showTreeMsg('Expanded all branches.', false);
  }

  function laPasteTreeCollapseAll() {
    laTreeExpanded.clear();
    renderPasteTree();
    showTreeMsg('Collapsed all branches.', false);
  }

  function replaceTimestampInImportPaste() {
    injectLaImportPaste({ timestamp: Math.floor(Date.now() / 1000) });
  }

  function replaceRequestIdInImportPaste() {
    injectLaImportPaste({ requestId: randomUuid() });
  }

  function injectCampaignFromField() {
    var c = String($('laCampaignId') && $('laCampaignId').value || '').trim();
    if (!c) {
      showImportMsg('Enter campaignId in the field above.', true);
      return;
    }
    injectLaImportPaste({ campaignId: c });
  }

  function injectEcidFromField() {
    var u = String($('laUserId') && $('laUserId').value || '').trim();
    if (!u) {
      showImportMsg('Enter ECID (or use Get profile to resolve it).', true);
      return;
    }
    injectLaImportPaste({ userId: u });
  }

  function injectLiveActivityFromField() {
    var lid = String($('laLiveActivityId') && $('laLiveActivityId').value || '').trim();
    if (!lid) {
      showImportMsg('Enter Live Activity ID in the field above.', true);
      return;
    }
    injectLaImportPaste({ liveActivityId: lid });
  }

  function injectEventFromField() {
    var sel = $('laEvent');
    var ev = sel ? String(sel.value || '').trim().toLowerCase() : '';
    if (ev !== 'start' && ev !== 'update' && ev !== 'end') {
      showImportMsg('Choose start, update, or end in the Event field.', true);
      return;
    }
    injectLaImportPaste({ event: ev });
  }

  function injectAllFromExecutionFields() {
    var patch = {};
    var c = String($('laCampaignId') && $('laCampaignId').value || '').trim();
    var u = String($('laUserId') && $('laUserId').value || '').trim();
    var lid = String($('laLiveActivityId') && $('laLiveActivityId').value || '').trim();
    var ev = String($('laEvent') && $('laEvent').value || '').trim().toLowerCase();
    if (ev !== 'start' && ev !== 'update' && ev !== 'end') {
      showImportMsg('Choose start, update, or end in the Event field.', true);
      return;
    }
    if (c) patch.campaignId = c;
    if (u) patch.userId = u;
    if (lid) patch.liveActivityId = lid;
    patch.event = ev;
    patch.requestId = randomUuid();
    patch.timestamp = Math.floor(Date.now() / 1000);
    injectLaImportPaste(patch, { applyBrandingAfter: true });
  }

  function onLaJsonPanelPaste(e) {
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (text == null) return;
    var trimmed = String(text).trim();
    if (!trimmed) return;
    var parsed;
    try {
      parsed = parseUserJson(trimmed);
    } catch (err) {
      return;
    }
    var ext = extractUnitaryPayload(parsed);
    if (ext) {
      e.preventDefault();
      applyExtracted(ext);
      setPayloadView('paste');
      showImportMsg('Imported payload into the JSON editor — set step 2 fields, then Apply all from fields.', false);
      return;
    }
    e.preventDefault();
    insertAtTextareaCursor(e.target, JSON.stringify(parsed, null, 2));
  }

  function onImportAreaPaste(e) {
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (text == null) return;
    var trimmed = String(text).trim();
    if (!trimmed) return;
    var parsed;
    try {
      parsed = parseUserJson(trimmed);
    } catch (err) {
      return;
    }
    e.preventDefault();
    insertAtTextareaCursor(e.target, JSON.stringify(parsed, null, 2));
  }

  function initJsonBlock(block) {
    var ta = block.querySelector('.la-json--panel');
    var rowsEl = block.querySelector('[data-kv-rows]');
    if (!ta || !rowsEl) return;

    rowsEl.addEventListener(
      'blur',
      function (ev) {
        if (!ev.target.classList.contains('la-kv-key')) return;
        var key = String(ev.target.value || '').trim();
        var col = ev.target.closest('.la-kv-col--key');
        if (!col || !key) return;
        var hint = (FRIENDLY_LABELS[ta.id] || {})[key];
        var fr = col.querySelector('.la-kv-friendly');
        if (hint) {
          if (!fr) {
            fr = document.createElement('span');
            fr.className = 'la-kv-friendly';
            col.appendChild(fr);
          }
          fr.textContent = hint;
        } else if (fr) {
          fr.remove();
        }
      },
      true
    );

    block.querySelectorAll('.la-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-mode');
        if (!mode) return;
        var current = block.getAttribute('data-mode') || 'simple';
        try {
          if (current === 'simple' && mode === 'json') {
            syncFormToTextarea(block);
          } else if (current === 'json' && mode === 'simple') {
            syncTextareaToForm(block);
          }
          setBlockMode(block, mode);
        } catch (e) {
          showKvMsg(block, String(e.message || e));
          if (mode === 'simple') {
            setBlockMode(block, 'json');
          }
        }
      });
    });

    var addBtn = block.querySelector('.la-kv-add');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        createKvRow(rowsEl, '', '', ta.id);
        setBlockMode(block, 'simple');
      });
    }

    rowsEl.addEventListener('click', function (ev) {
      var rm = ev.target.closest('.la-kv-remove');
      if (!rm) return;
      var row = rm.closest('.la-kv-row');
      if (row) row.remove();
    });

    try {
      syncTextareaToForm(block);
      setBlockMode(block, 'simple');
    } catch (e) {
      showKvMsg(block, 'Opened in JSON mode: ' + (e.message || e));
      setBlockMode(block, 'json');
    }
  }

  function syncAllJsonEditorsToTextareas() {
    document.querySelectorAll('[data-json-editor]').forEach(function (block) {
      if (block.getAttribute('data-mode') === 'simple') {
        syncFormToTextarea(block);
      }
    });
  }

  function parseJsonLabel(name, raw) {
    var t = String(raw || '').trim();
    if (!t) {
      throw new Error(name + ' is empty (valid JSON required).');
    }
    try {
      return parseUserJson(t);
    } catch (e) {
      throw new Error(name + ': invalid JSON — ' + (e.message || String(e)));
    }
  }

  function buildPayload() {
    syncAllJsonEditorsToTextareas();
    var requestId = randomUuid();
    var campaignId = String($('laCampaignId').value || '').trim();
    var recType = 'aep';
    var userId = String($('laUserId').value || '').trim();
    var namespace = 'ECID';
    var contentAvailable = parseInt(String($('laContentAvailable').value || '0'), 10);
    var timestamp = Math.floor(Date.now() / 1000);
    var event = String($('laEvent').value || '').trim().toLowerCase();
    var attributesType = String($('laAttributesType').value || '').trim();

    if (!campaignId || !userId) {
      throw new Error('campaign ID and ECID are required.');
    }
    if (event !== 'start' && event !== 'update' && event !== 'end') {
      throw new Error('Choose start, update, or end in the Event field.');
    }
    if (!Number.isFinite(contentAvailable)) {
      throw new Error('content-available must be a number.');
    }

    var contentState = parseJsonLabel('content-state', $('laContentState').value);
    var attributes = parseJsonLabel('attributes', $('laAttributes').value);
    var alert = parseJsonLabel('alert', $('laAlert').value);

    var liveActivityFromField = String($('laLiveActivityId') && $('laLiveActivityId').value || '').trim();
    if (liveActivityFromField) {
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
        attributes = {};
      } else {
        attributes = JSON.parse(JSON.stringify(attributes));
      }
      if (
        !attributes.liveActivityData ||
        typeof attributes.liveActivityData !== 'object' ||
        Array.isArray(attributes.liveActivityData)
      ) {
        attributes.liveActivityData = {};
      }
      attributes.liveActivityData.liveActivityID = liveActivityFromField;
    }

    return {
      requestId: requestId,
      campaignId: campaignId,
      recipients: [
        {
          type: recType,
          userId: userId,
          namespace: namespace,
          context: {
            requestPayload: {
              aps: {
                'content-available': contentAvailable,
                timestamp: timestamp,
                event: event,
                'content-state': contentState,
                'attributes-type': attributesType,
                attributes: attributes,
                alert: alert,
              },
            },
          },
        },
      ],
    };
  }

  /**
   * Build the outbound unitary body from Paste JSON + execution fields (campaign, ECID, event, Live Activity ID).
   * Preserves pasted APS shape (content-state, attributes-type, attributes, alert). Does not apply parked #laAttributesType.
   */
  function buildPayloadFromImportPaste() {
    var ta = $('laImportPaste');
    var raw = ta && String(ta.value || '').trim();
    if (!raw) {
      throw new Error('Paste JSON is empty.');
    }
    var parsed = parseUserJson(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Pasted JSON must be a single object.');
    }
    var out = JSON.parse(JSON.stringify(parsed));
    var campaignId = String($('laCampaignId').value || '').trim();
    var userId = String($('laUserId').value || '').trim();
    var event = String($('laEvent').value || '').trim().toLowerCase();
    if (!campaignId || !userId) {
      throw new Error('campaign ID and ECID are required.');
    }
    if (event !== 'start' && event !== 'update' && event !== 'end') {
      throw new Error('Choose start, update, or end in the Event field.');
    }
    if (!out.recipients || !Array.isArray(out.recipients) || !out.recipients[0]) {
      throw new Error('Pasted JSON must include recipients[0].');
    }
    var r0 = out.recipients[0];
    if (!r0.context || !r0.context.requestPayload || !r0.context.requestPayload.aps) {
      throw new Error('Pasted JSON must include recipients[0].context.requestPayload.aps.');
    }
    var aps = r0.context.requestPayload.aps;
    out.requestId = randomUuid();
    out.campaignId = campaignId;
    r0.userId = userId;
    r0.type = r0.type || 'aep';
    r0.namespace = r0.namespace || 'ECID';
    aps.timestamp = Math.floor(Date.now() / 1000);
    aps.event = event;
    // Do not overwrite content-available or attributes-type from the parked advanced form (#laContentAvailable /
    // #laAttributesType). Those defaults (e.g. KSIAAirportAttributes) are not shown in the main flow and would
    // corrupt Etihad and other templates. Pasted JSON is the source of truth for APS shape.
    var liveActivityFromField = String($('laLiveActivityId') && $('laLiveActivityId').value || '').trim();
    if (liveActivityFromField) {
      if (!aps.attributes || typeof aps.attributes !== 'object' || Array.isArray(aps.attributes)) {
        aps.attributes = {};
      }
      if (
        !aps.attributes.liveActivityData ||
        typeof aps.attributes.liveActivityData !== 'object' ||
        Array.isArray(aps.attributes.liveActivityData)
      ) {
        aps.attributes.liveActivityData = {};
      }
      aps.attributes.liveActivityData.liveActivityID = liveActivityFromField;
    }
    return out;
  }

  function getOutgoingPayload() {
    var raw = String($('laImportPaste') && $('laImportPaste').value || '').trim();
    if (!raw) {
      throw new Error(
        'Load a template or paste JSON in the box (step 3), then use Apply all from fields before Preview or Send.'
      );
    }
    return buildPayloadFromImportPaste();
  }

  function laCurrentSandboxForTemplates() {
    return String(getSandboxForRequest() || '').trim().toLowerCase();
  }

  /** Full list from storage (may include multiple sandboxes if data was merged before sync fixes). */
  function laGetSavedTemplatesRaw() {
    try {
      var raw = localStorage.getItem(LA_TEMPLATE_STORAGE_KEY);
      if (!raw) return [];
      var a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Custom templates for the active technical sandbox only.
   * Entries include `savedInSandbox` (new); legacy entries without it still show (same stored blob after Firestore pull).
   */
  function laGetSavedTemplates() {
    var cur = laCurrentSandboxForTemplates();
    return laGetSavedTemplatesRaw().filter(function (t) {
      if (!t || typeof t !== 'object') return false;
      if (laIsGlobalExampleId(t.id)) return false;
      var tag = t.savedInSandbox != null ? String(t.savedInSandbox).trim().toLowerCase() : '';
      if (!tag) return true;
      return tag === cur;
    });
  }

  function laSetSavedTemplates(arr) {
    try {
      localStorage.setItem(LA_TEMPLATE_STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {}
    if (typeof window !== 'undefined' && window.AepLabSandboxSync && typeof window.AepLabSandboxSync.notifyDirty === 'function') {
      window.AepLabSandboxSync.notifyDirty();
    }
  }

  function laIsBuiltinTemplateId(id) {
    return String(id || '').indexOf('la-builtin-') === 0;
  }

  function laIsGlobalExampleId(id) {
    return String(id || '').indexOf('la-example-') === 0;
  }

  function laPopulateTemplateSelect() {
    var sel = $('laTemplateSelect');
    if (!sel) return;
    var preserved = sel.value;
    sel.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a template…';
    sel.appendChild(ph);
    if (LA_GLOBAL_EXAMPLES.length) {
      var ogEx = document.createElement('optgroup');
      ogEx.label = 'Example';
      LA_GLOBAL_EXAMPLES.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        ogEx.appendChild(o);
      });
      sel.appendChild(ogEx);
    }
    var showBuiltins = laSandboxShowsPostmanBuiltins() && LA_BUILTIN_TEMPLATES.length;
    var saved = laGetSavedTemplates();
    if (showBuiltins || saved.length) {
      var og = document.createElement('optgroup');
      og.label = 'Saved in this sandbox';
      if (showBuiltins) {
        LA_BUILTIN_TEMPLATES.forEach(function (t) {
          var o = document.createElement('option');
          o.value = t.id;
          o.textContent = t.name;
          og.appendChild(o);
        });
      }
      saved.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name || t.id;
        og.appendChild(o);
      });
      sel.appendChild(og);
    }
    if (
      preserved &&
      Array.prototype.some.call(sel.options, function (x) {
        return x.value === preserved;
      })
    ) {
      sel.value = preserved;
    }
    laUpdateTemplateDeleteState();
  }

  function laUpdateTemplateDeleteState() {
    var sel = $('laTemplateSelect');
    var del = $('laTemplateDelete');
    if (!sel || !del) return;
    var id = sel.value;
    del.disabled = !id || laIsBuiltinTemplateId(id) || laIsGlobalExampleId(id);
  }

  function laShowTemplateMsg(text, isErr) {
    var el = $('laTemplateMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('la-template-msg--err', !!isErr);
  }

  function laGetTemplateJsonById(id) {
    if (!id) return '';
    for (var g = 0; g < LA_GLOBAL_EXAMPLES.length; g++) {
      if (LA_GLOBAL_EXAMPLES[g].id === id) return LA_GLOBAL_EXAMPLES[g].json;
    }
    for (var i = 0; i < LA_BUILTIN_TEMPLATES.length; i++) {
      if (LA_BUILTIN_TEMPLATES[i].id === id) return LA_BUILTIN_TEMPLATES[i].json;
    }
    var saved = laGetSavedTemplates();
    for (var j = 0; j < saved.length; j++) {
      if (saved[j].id === id) return saved[j].json != null ? String(saved[j].json) : '';
    }
    return '';
  }

  function laLoadSelectedTemplate() {
    var sel = $('laTemplateSelect');
    if (!sel || !sel.value) {
      laShowTemplateMsg('Choose a template first.', true);
      return;
    }
    var json = laGetTemplateJsonById(sel.value);
    if (!json) {
      laShowTemplateMsg('Template not found.', true);
      return;
    }
    var ta = $('laImportPaste');
    if (!ta) return;
    ta.value = json;
    bumpJsonMirror(ta);
    afterImportPasteMutation();
    setPayloadView('paste');
    laShowTemplateMsg('Loaded — Beautify if needed, then Apply all from fields (next to Beautify) to merge step 2 into the JSON.', false);
  }

  function laSaveCurrentAsTemplate() {
    var ta = $('laImportPaste');
    if (!ta || !String(ta.value || '').trim()) {
      laShowTemplateMsg('Paste JSON is empty — nothing to save.', true);
      return;
    }
    var name = window.prompt('Template name', 'My unitary payload');
    if (name == null) return;
    name = String(name).trim();
    if (!name) {
      laShowTemplateMsg('Name required.', true);
      return;
    }
    var id = 'la-custom-' + Date.now();
    var list = laGetSavedTemplatesRaw();
    list.push({
      id: id,
      name: name,
      json: ta.value,
      savedInSandbox: getSandboxForRequest() || '',
    });
    laSetSavedTemplates(list);
    laPopulateTemplateSelect();
    var sel = $('laTemplateSelect');
    if (sel) sel.value = id;
    laUpdateTemplateDeleteState();
    laShowTemplateMsg('Saved for this sandbox.', false);
  }

  function laDeleteSelectedTemplate() {
    var sel = $('laTemplateSelect');
    if (!sel || !sel.value || laIsBuiltinTemplateId(sel.value) || laIsGlobalExampleId(sel.value)) return;
    if (!window.confirm('Delete this saved template?')) return;
    var next = laGetSavedTemplatesRaw().filter(function (t) {
      return t.id !== sel.value;
    });
    laSetSavedTemplates(next);
    laPopulateTemplateSelect();
    laShowTemplateMsg('Deleted.', false);
  }

  function laClearSendFeedback() {
    var box = $('laSendFeedback');
    if (!box) return;
    box.hidden = true;
    box.classList.remove('la-send-feedback--error', 'la-send-feedback--ok', 'la-send-feedback--loading');
    var st = $('laSendFeedbackStatus');
    var det = $('laSendFeedbackDetails');
    var raw = $('laResponseRaw');
    if (st) st.textContent = '';
    if (raw) raw.textContent = '';
    if (det) {
      det.hidden = true;
      det.open = false;
    }
  }

  /**
   * @param {{ statusText?: string, isError?: boolean, isOk?: boolean, loading?: boolean, rawText?: string, detailsOpen?: boolean }} options
   */
  function laShowSendFeedback(options) {
    options = options || {};
    var box = $('laSendFeedback');
    var st = $('laSendFeedbackStatus');
    var det = $('laSendFeedbackDetails');
    var raw = $('laResponseRaw');
    if (!box || !st) return;
    box.hidden = false;
    box.classList.remove('la-send-feedback--error', 'la-send-feedback--ok', 'la-send-feedback--loading');
    if (options.isError) box.classList.add('la-send-feedback--error');
    else if (options.isOk) box.classList.add('la-send-feedback--ok');
    else if (options.loading) box.classList.add('la-send-feedback--loading');
    st.textContent = options.statusText || '';
    var rawStr =
      options.rawText != null && String(options.rawText).length > 0 ? String(options.rawText) : '';
    if (raw) raw.textContent = rawStr;
    if (det) {
      if (rawStr.length) {
        det.hidden = false;
        det.open = !!options.detailsOpen;
      } else {
        det.hidden = true;
        det.open = false;
      }
    }
  }

  /** Fills #laPreview with getOutgoingPayload() — same bytes Send to Adobe uses. */
  function laRefreshOutgoingPreview() {
    var preview = $('laPreview');
    if (!preview) return;
    try {
      var p = getOutgoingPayload();
      preview.textContent = JSON.stringify(p, null, 2);
      preview.hidden = false;
      laClearSendFeedback();
    } catch (e) {
      preview.hidden = true;
      laShowSendFeedback({
        statusText: String(e.message || e),
        isError: true,
      });
    }
  }

  function init() {
    var preview = $('laPreview');

    $('laContentState').value = DEFAULT_CONTENT_STATE;
    $('laAttributes').value = DEFAULT_ATTRIBUTES;
    $('laAlert').value = DEFAULT_ALERT;

    laWireExecutionFieldsPersistence();
    laLoadExecutionFieldsFromStorage();
    laWireBrandingPanel();
    laLoadBrandingThemeFromStorage();
    laWireTravelLogoControls();

    setupJsonMirrors();

    document.querySelectorAll('[data-json-editor]').forEach(initJsonBlock);

    document.querySelectorAll('.la-json--panel').forEach(function (ta) {
      ta.addEventListener('paste', onLaJsonPanelPaste);
    });
    var importPaste = $('laImportPaste');
    if (importPaste) {
      importPaste.addEventListener('paste', onImportAreaPaste);
      importPaste.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
          e.preventDefault();
          beautifyJsonTextarea($('laImportPaste'), function (msg) {
            showImportMsg(msg, true);
          });
        }
      });
    }
    var importBeautify = $('laImportBeautify');
    if (importBeautify) {
      importBeautify.addEventListener('click', function () {
        beautifyJsonTextarea($('laImportPaste'), function (msg) {
          showImportMsg(msg, true);
        });
      });
    }
    var pasteTab = $('laPayloadTabPaste');
    var treeTab = $('laPayloadTabTree');
    if (pasteTab) {
      pasteTab.addEventListener('click', function () {
        setPayloadView('paste');
      });
    }
    if (treeTab) {
      treeTab.addEventListener('click', function () {
        setPayloadView('tree');
      });
    }
    if ($('laPayloadPastePanel')) {
      setPayloadView('paste');
    }
    var pasteTreeRoot = $('laPasteTree');
    if (pasteTreeRoot) {
      pasteTreeRoot.addEventListener('click', onLaPasteTreeClick);
    }
    var ptr = $('laPasteTreeRefresh');
    if (ptr) ptr.addEventListener('click', renderPasteTree);
    var pex = $('laPasteTreeExpandAll');
    if (pex) pex.addEventListener('click', laPasteTreeExpandAll);
    var pcl = $('laPasteTreeCollapseAll');
    if (pcl) pcl.addEventListener('click', laPasteTreeCollapseAll);
    var pasteTreeSave = $('laPasteTreeEditSave');
    if (pasteTreeSave) pasteTreeSave.addEventListener('click', saveLaTreeEdit);
    var pasteTreeCancel = $('laPasteTreeEditCancel');
    if (pasteTreeCancel) pasteTreeCancel.addEventListener('click', cancelLaTreeEdit);
    var injCamp = $('laInjectCampaign');
    if (injCamp) injCamp.addEventListener('click', injectCampaignFromField);
    var injEcid = $('laInjectEcid');
    if (injEcid) injEcid.addEventListener('click', injectEcidFromField);
    var injTsSmart = $('laInjectTimestampSmart');
    if (injTsSmart) injTsSmart.addEventListener('click', replaceTimestampInImportPaste);
    var injUuidSmart = $('laInjectUuidSmart');
    if (injUuidSmart) injUuidSmart.addEventListener('click', replaceRequestIdInImportPaste);
    var injLai = $('laInjectLiveActivity');
    if (injLai) injLai.addEventListener('click', injectLiveActivityFromField);
    var injEv = $('laInjectEvent');
    if (injEv) injEv.addEventListener('click', injectEventFromField);
    var injAll = $('laInjectAllFromFields');
    if (injAll) injAll.addEventListener('click', injectAllFromExecutionFields);

    var laTravelApplyBtn = $('laTravelApplyBrand');
    if (laTravelApplyBtn) laTravelApplyBtn.addEventListener('click', laTravelApplyBrandToPaste);
    var laTravelBrandScrapeNameBtn = $('laTravelBrandNameFromScrape');
    if (laTravelBrandScrapeNameBtn) laTravelBrandScrapeNameBtn.addEventListener('click', laApplyTravelBrandNameFromScrape);
    var laTravelPhaseEl = $('laTravelPhase');
    if (laTravelPhaseEl) laTravelPhaseEl.addEventListener('change', laTravelOnPhaseSelectChange);
    var laJourney = $('laTravelJourneyProgress');
    if (laJourney) {
      laJourney.addEventListener('input', laSyncTravelJourneyProgressOutput);
      laJourney.addEventListener('change', laSyncTravelJourneyProgressOutput);
      laSyncTravelJourneyProgressOutput();
    }
    if (typeof window !== 'undefined') window.laIsTravelGeneric = laIsTravelGeneric;

    Promise.all([
      laFetchBuiltinTemplates().catch(function (err) {
        console.warn('Live Activity built-in templates:', err);
      }),
      laFetchGlobalExampleTemplates(),
    ]).then(function () {
      laPopulateTemplateSelect();
    });
    window.addEventListener('aep-global-sandbox-change', function () {
      laPopulateTemplateSelect();
      laLoadExecutionFieldsFromStorage();
      laRefreshTravelLogoLibrarySelect({ silent: true }).catch(function () {});
    });
    document.addEventListener('aep-lab-sandbox-keys-applied', function () {
      laPopulateTemplateSelect();
      laLoadExecutionFieldsFromStorage();
      laRefreshTravelLogoLibrarySelect({ silent: true }).catch(function () {});
    });
    var laTsel = $('laTemplateSelect');
    if (laTsel) laTsel.addEventListener('change', laUpdateTemplateDeleteState);
    var laTload = $('laTemplateLoad');
    if (laTload) laTload.addEventListener('click', laLoadSelectedTemplate);
    var laTsave = $('laTemplateSave');
    if (laTsave) laTsave.addEventListener('click', laSaveCurrentAsTemplate);
    var laTdel = $('laTemplateDelete');
    if (laTdel) laTdel.addEventListener('click', laDeleteSelectedTemplate);

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.la-json-beautify');
      if (!btn || btn.id === 'laImportBeautify') return;
      var block = btn.closest('[data-json-editor]');
      if (!block) return;
      var ta = block.querySelector('.la-json--panel');
      if (!ta) return;
      beautifyJsonTextarea(ta, function (msg) {
        showKvMsg(block, msg);
      });
    });

    var sandboxSelect = $('sandboxSelect');
    if (sandboxSelect && typeof AepGlobalSandbox !== 'undefined') {
      AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      AepGlobalSandbox.attachStorageSync(sandboxSelect);
    }

    if (typeof attachEmailDatalist === 'function') {
      attachEmailDatalist('email');
    }
    if (typeof AepIdentityPicker !== 'undefined') {
      AepIdentityPicker.init('email', 'identityNs');
    }

    var profileQueryMsg = $('laProfileQueryMsg');
    var fetchBtn = $('fetchBtn');
    if (fetchBtn && profileQueryMsg) {
      fetchBtn.addEventListener('click', async function () {
        var id =
          typeof AepIdentityPicker !== 'undefined'
            ? AepIdentityPicker.getIdentifier('email')
            : String(($('email') && $('email').value) || '').trim();
        if (!id) {
          setProfileQueryMsg(profileQueryMsg, 'Enter an identifier.', 'error');
          return;
        }
        var ns =
          typeof AepIdentityPicker !== 'undefined'
            ? AepIdentityPicker.getNamespace('email')
            : String(($('identityNs') && $('identityNs').value) || 'email').trim();
        setProfileQueryMsg(profileQueryMsg, 'Loading…', 'loading');
        try {
          var res = await fetch(
            '/api/profile/consent?identifier=' +
              encodeURIComponent(id) +
              '&namespace=' +
              encodeURIComponent(ns) +
              sandboxQsAmp()
          );
          var data = await res.json();
          if (!res.ok) {
            setProfileQueryMsg(profileQueryMsg, data.error || 'Request failed.', 'error');
            return;
          }
          if (typeof addRecentIdentifier === 'function') {
            addRecentIdentifier(id, ns);
          } else if (typeof addEmail === 'function') {
            addEmail(id);
          }
          var ecidVal = Array.isArray(data.ecid) ? data.ecid[0] || '' : data.ecid || '';
          ecidVal = String(ecidVal || '').trim();
          if (data.found && ecidVal) {
            $('laUserId').value = ecidVal;
            laScheduleSaveExecutionFields();
            setProfileQueryMsg(profileQueryMsg, 'Profile found — ECID filled in below.', 'success');
          } else if (data.found && !ecidVal) {
            setProfileQueryMsg(
              profileQueryMsg,
              'Profile found but no ECID on record — enter ECID manually.',
              'error'
            );
          } else {
            setProfileQueryMsg(
              profileQueryMsg,
              'No profile found — enter ECID manually or try another identity.',
              'error'
            );
          }
        } catch (e) {
          setProfileQueryMsg(profileQueryMsg, String(e.message || e), 'error');
        }
      });
    }

    $('laPreviewBtn').addEventListener('click', function () {
      laRefreshOutgoingPreview();
    });

    $('laSendBtn').addEventListener('click', async function () {
      var sandbox = getSandboxForRequest();

      var payload;
      try {
        payload = getOutgoingPayload();
      } catch (e) {
        laShowSendFeedback({ statusText: String(e.message || e), isError: true });
        return;
      }

      laShowSendFeedback({ statusText: 'Sending…', loading: true, rawText: '' });
      try {
        var res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sandboxName: sandbox,
            payload: payload,
          }),
        });
        var bodyText = await res.text();
        var parsed;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = { raw: bodyText };
        }
        var out = JSON.stringify(parsed, null, 2);
        if (res.ok) {
          laShowSendFeedback({
            statusText: 'OK — request sent successfully.',
            isOk: true,
            rawText: out,
            detailsOpen: false,
          });
        } else {
          var shortErr = 'Request failed (HTTP ' + res.status + '). Open “Show response body” below for details.';
          if (parsed && typeof parsed === 'object' && parsed.error != null) {
            shortErr = 'Error (HTTP ' + res.status + '): ' + String(parsed.error);
          }
          laShowSendFeedback({
            statusText: shortErr,
            isError: true,
            rawText: out,
            detailsOpen: true,
          });
        }
      } catch (e) {
        laShowSendFeedback({
          statusText: 'Request failed: ' + String(e.message || e),
          isError: true,
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
