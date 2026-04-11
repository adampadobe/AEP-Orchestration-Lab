/**
 * AJO unitary execution — Live Activity push (sandbox + payload; IMS auth server-side).
 */
(function () {
  'use strict';

  var API = '/api/ajo/live-activity';

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
          out[key] = JSON.parse(raw);
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

  function setBlockMode(block, mode) {
    var ta = block.querySelector('.la-json--panel');
    var kvPanel = block.querySelector('.la-kv-panel');
    if (!ta || !kvPanel) return;
    block.querySelectorAll('.la-mode-btn').forEach(function (b) {
      var active = b.getAttribute('data-mode') === mode;
      b.classList.toggle('la-mode-btn--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    block.setAttribute('data-mode', mode);
    if (mode === 'simple') {
      kvPanel.hidden = false;
      ta.classList.add('la-json--hidden');
      ta.setAttribute('aria-hidden', 'true');
    } else {
      kvPanel.hidden = true;
      ta.classList.remove('la-json--hidden');
      ta.setAttribute('aria-hidden', 'false');
    }
  }

  function showKvMsg(block, text) {
    var el = block.querySelector('.la-kv-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function syncFormToTextarea(block) {
    var ta = block.querySelector('.la-json--panel');
    var rows = block.querySelector('[data-kv-rows]');
    if (!ta || !rows) return;
    var obj = collectObjectFromRows(rows, ta.id);
    ta.value = formatJsonTextarea(obj);
    showKvMsg(block, '');
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
      parsed = JSON.parse(raw);
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
      return JSON.parse(t);
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
    var event = String($('laEvent').value || 'start').trim().toLowerCase();
    var attributesType = String($('laAttributesType').value || '').trim();

    if (!campaignId || !userId) {
      throw new Error('campaign ID and ECID are required.');
    }
    if (event !== 'start' && event !== 'update' && event !== 'end') {
      throw new Error('event must be start, update, or end.');
    }
    if (!Number.isFinite(contentAvailable)) {
      throw new Error('content-available must be a number.');
    }

    var contentState = parseJsonLabel('content-state', $('laContentState').value);
    var attributes = parseJsonLabel('attributes', $('laAttributes').value);
    var alert = parseJsonLabel('alert', $('laAlert').value);

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

  function setMessage(el, text, isErr) {
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('la-response--err', !!isErr);
  }

  function init() {
    var msg = $('laResponse');
    var preview = $('laPreview');

    $('laContentState').value = DEFAULT_CONTENT_STATE;
    $('laAttributes').value = DEFAULT_ATTRIBUTES;
    $('laAlert').value = DEFAULT_ALERT;

    document.querySelectorAll('[data-json-editor]').forEach(initJsonBlock);

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
          if (typeof addEmail === 'function') addEmail(id);
          var ecidVal = Array.isArray(data.ecid) ? data.ecid[0] || '' : data.ecid || '';
          ecidVal = String(ecidVal || '').trim();
          if (data.found && ecidVal) {
            $('laUserId').value = ecidVal;
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
      try {
        var p = buildPayload();
        preview.textContent = JSON.stringify(p, null, 2);
        preview.hidden = false;
        setMessage(msg, '', false);
      } catch (e) {
        preview.hidden = true;
        setMessage(msg, String(e.message || e), true);
      }
    });

    $('laSendBtn').addEventListener('click', async function () {
      var sandbox = getSandboxForRequest();

      var payload;
      try {
        payload = buildPayload();
      } catch (e) {
        setMessage(msg, String(e.message || e), true);
        return;
      }

      setMessage(msg, 'Sending…', false);
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
        setMessage(msg, out, !res.ok);
      } catch (e) {
        setMessage(msg, 'Request failed: ' + String(e.message || e), true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
