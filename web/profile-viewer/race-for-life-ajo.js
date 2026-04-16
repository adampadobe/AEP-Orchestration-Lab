/**
 * After profile lookup, requests Journey Optimizer / Edge personalization for the Race for Life
 * surfaces and applies results to #hero-banner and #ContentCardContainer.
 *
 * Requires the Adobe Web SDK (alloy) from your Launch property on the same page. The datastream
 * (Edge configuration) ID is set in the Launch Web SDK extension — for this lab:
 * 46677fd7-9db0-4f16-898c-b424d0245c38 — not in this file.
 *
 * AJO channel surfaces must match the URIs built in buildSurfaces() (typically web://host/path#fragment).
 */
(function (global) {
  'use strict';

  var SCHEMAS = [
    'https://ns.adobe.com/personalization/default-content-item',
    'https://ns.adobe.com/personalization/html-content-item',
    'https://ns.adobe.com/personalization/json-content-item',
    'https://ns.adobe.com/personalization/dom-action',
  ];

  function buildSurfaces() {
    var loc = global.location || {};
    var host = loc.host || '';
    var path = loc.pathname || '/';
    if (!host) return ['#hero-banner', '#ContentCardContainer'];
    var base = 'web://' + host + path;
    return [base + '#hero-banner', base + '#ContentCardContainer'];
  }

  function namespaceToIdentityKey(ns) {
    var map = {
      email: 'Email',
      ecid: 'ECID',
      phone: 'Phone',
      crmId: 'CRMId',
      loyaltyId: 'LoyaltyId',
    };
    return map[ns] || ns;
  }

  /**
   * @param {{ ecid?: string|null, email?: string|null } | null} profile
   * @param {string} identifierRaw - value from identifier input
   * @param {string} namespace - from AepIdentityPicker (email, ecid, …)
   */
  function buildIdentityMap(profile, identifierRaw, namespace) {
    var map = {};
    var ns = namespace || 'email';
    var idVal = String(identifierRaw || '').trim();
    var email = profile && profile.email ? String(profile.email).trim() : '';

    if (ns === 'email' && idVal) {
      map.Email = [{ id: idVal, authenticatedState: 'authenticated', primary: true }];
    } else if (idVal) {
      var key = namespaceToIdentityKey(ns);
      map[key] = [{ id: idVal, authenticatedState: 'authenticated', primary: true }];
    }

    var ecid =
      profile && profile.ecid != null && String(profile.ecid).replace(/\D/g, '').length >= 10
        ? String(profile.ecid).replace(/\s/g, '')
        : '';
    if (!ecid && ns === 'ecid' && idVal && /^\d{10,}$/.test(idVal)) ecid = idVal;
    if (ecid && /^\d{10,}$/.test(ecid)) {
      if (!map.ECID) {
        var hasOtherId = Object.keys(map).length > 0;
        map.ECID = [{ id: ecid, authenticatedState: 'ambiguous', primary: !hasOtherId }];
      } else if (map.ECID[0]) {
        map.ECID[0].id = ecid;
      }
    }

    return map;
  }

  function mountsEl() {
    return document.querySelector('.race-ajo-mounts');
  }

  function setLoading(on) {
    var el = mountsEl();
    if (!el) return;
    el.classList.toggle('race-ajo--loading', !!on);
  }

  function setStatusMessage(text, isError) {
    var el = mountsEl();
    if (!el) return;
    var hint = el.querySelector('.race-ajo-sdk-hint');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'race-ajo-sdk-hint';
      hint.setAttribute('role', 'status');
      el.insertBefore(hint, el.firstChild);
    }
    hint.textContent = text || '';
    hint.hidden = !text;
    hint.classList.toggle('race-ajo-sdk-hint--error', !!isError);
  }

  function clearStatusMessage() {
    setStatusMessage('', false);
  }

  function whenAlloyReady(timeoutMs) {
    var max = timeoutMs || 20000;
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      function tick() {
        if (typeof global.alloy === 'function') {
          resolve(global.alloy);
          return;
        }
        if (Date.now() - start > max) {
          reject(new Error('Adobe Web SDK (alloy) not loaded — check Launch rule loads Web SDK on this page.'));
          return;
        }
        global.setTimeout(tick, 40);
      }
      tick();
    });
  }

  function scopeMatchesSurface(scope, fragment) {
    if (!scope) return false;
    var s = String(scope);
    return s.indexOf('#' + fragment) !== -1 || s.indexOf(fragment) !== -1;
  }

  function applyItemToElement(el, item) {
    if (!el || !item) return false;
    var data = item.data || item;
    if (typeof data === 'string') {
      el.innerHTML = data;
      return true;
    }
    if (data && typeof data.content === 'string') {
      el.innerHTML = data.content;
      return true;
    }
    if (data && data.deliveryURL) {
      el.innerHTML = '<iframe class="race-ajo-iframe" title="Personalized content" src="' + String(data.deliveryURL).replace(/"/g, '') + '"></iframe>';
      return true;
    }
    return false;
  }

  /** Fallback when renderDecisions does not populate our sections (code-based JSON/HTML items). */
  function applyPropositionsManually(propositions) {
    if (!propositions || !propositions.length) return;
    var hero = document.getElementById('hero-banner');
    var cards = document.getElementById('ContentCardContainer');
    for (var i = 0; i < propositions.length; i++) {
      var p = propositions[i];
      var scope = p.scope || p.id || '';
      var items = p.items || [];
      var target = scopeMatchesSurface(scope, 'hero-banner') ? hero : scopeMatchesSurface(scope, 'ContentCardContainer') ? cards : null;
      if (!target) continue;
      for (var j = 0; j < items.length; j++) {
        if (applyItemToElement(target, items[j])) break;
      }
    }
  }

  /**
   * @param {{ ecid?: string|null, email?: string|null } | null} profile - from DemoProfileDrawer.getLastLookedUpProfile()
   * @param {string} identifierRaw
   * @param {string} namespace
   */
  function refreshFromProfile(profile, identifierRaw, namespace) {
    clearStatusMessage();
    setLoading(true);

    return whenAlloyReady()
      .then(function (alloy) {
        var identityMap = buildIdentityMap(profile, identifierRaw, namespace);
        var surfaces = buildSurfaces();
        var href = global.location && global.location.href ? global.location.href.split('?')[0] : '';

        return alloy('sendEvent', {
          renderDecisions: true,
          personalization: {
            surfaces: surfaces,
            schemas: SCHEMAS,
          },
          xdm: {
            identityMap: identityMap,
            web: {
              webPageDetails: {
                URL: href,
                name: 'Race for Life',
                viewName: 'Race for Life',
              },
            },
          },
        }).then(function (result) {
          var propositions = (result && (result.propositions || result.decisions)) || [];
          if (typeof alloy === 'function' && propositions.length) {
            try {
              return alloy('applyPropositions', { propositions: propositions }).then(function () {
                applyPropositionsManually(propositions);
                return result;
              });
            } catch (e) {
              applyPropositionsManually(propositions);
              return result;
            }
          }
          applyPropositionsManually(propositions);
          return result;
        });
      })
      .then(function () {
        mountsEl() && mountsEl().classList.add('race-ajo--requested');
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        setStatusMessage(msg, true);
      })
      .finally(function () {
        setLoading(false);
      });
  }

  global.RaceForLifeAjo = {
    refreshFromProfile: refreshFromProfile,
    buildSurfaces: buildSurfaces,
  };
})(typeof window !== 'undefined' ? window : globalThis);
