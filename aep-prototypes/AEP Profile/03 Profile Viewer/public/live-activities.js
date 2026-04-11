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
    el.className = 'consent-message consent-message--below-btn' + (type ? ' ' + type : '');
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

    var sandboxSelect = $('sandboxSelect');
    if (sandboxSelect && typeof AepGlobalSandbox !== 'undefined') {
      AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      AepGlobalSandbox.attachStorageSync(sandboxSelect);
    }

    if (typeof attachEmailDatalist === 'function') {
      attachEmailDatalist('laProfileIdentifier');
    }
    if (typeof AepIdentityPicker !== 'undefined') {
      AepIdentityPicker.init('laProfileIdentifier', 'laProfileNs');
    }

    var profileQueryMsg = $('laProfileQueryMsg');
    var queryBtn = $('laQueryProfileBtn');
    if (queryBtn && profileQueryMsg) {
      queryBtn.addEventListener('click', async function () {
        var id =
          typeof AepIdentityPicker !== 'undefined'
            ? AepIdentityPicker.getIdentifier('laProfileIdentifier')
            : String(($('laProfileIdentifier') && $('laProfileIdentifier').value) || '').trim();
        if (!id) {
          setProfileQueryMsg(profileQueryMsg, 'Enter an identifier.', 'error');
          return;
        }
        var ns =
          typeof AepIdentityPicker !== 'undefined'
            ? AepIdentityPicker.getNamespace('laProfileIdentifier')
            : String(($('laProfileNs') && $('laProfileNs').value) || 'email').trim();
        setProfileQueryMsg(profileQueryMsg, 'Loading…', '');
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
