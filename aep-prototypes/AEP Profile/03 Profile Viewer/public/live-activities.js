/**
 * AJO unitary execution — Live Activity push (user-supplied IMS headers + token).
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
    var requestId = String($('laRequestId').value || '').trim();
    var campaignId = String($('laCampaignId').value || '').trim();
    var recType = String($('laRecipientType').value || '').trim() || 'aep';
    var userId = String($('laUserId').value || '').trim();
    var namespace = String($('laNamespace').value || '').trim();
    var contentAvailable = parseInt(String($('laContentAvailable').value || '0'), 10);
    var timestamp = parseInt(String($('laTimestamp').value || '0'), 10);
    var event = String($('laEvent').value || 'start').trim().toLowerCase();
    var attributesType = String($('laAttributesType').value || '').trim();

    if (!requestId || !campaignId || !userId || !namespace) {
      throw new Error('request ID, campaign ID, user ID, and namespace are required.');
    }
    if (event !== 'start' && event !== 'update' && event !== 'end') {
      throw new Error('event must be start, update, or end.');
    }
    if (!Number.isFinite(contentAvailable)) {
      throw new Error('content-available must be a number.');
    }
    if (!Number.isFinite(timestamp)) {
      throw new Error('timestamp must be a number (Unix seconds).');
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

    $('laNewRequestId').addEventListener('click', function () {
      if (window.crypto && crypto.randomUUID) {
        $('laRequestId').value = crypto.randomUUID();
      } else {
        $('laRequestId').value = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0;
          var v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
    });

    $('laNowTimestamp').addEventListener('click', function () {
      $('laTimestamp').value = String(Math.floor(Date.now() / 1000));
    });

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
      var sandbox = String($('laSandbox').value || '').trim();

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
