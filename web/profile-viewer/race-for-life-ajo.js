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
    /* Full web:// URIs match most AJO code-based surfaces; hash-only #ContentCardContainer covers some Content Card configs that do not use the web:// prefix. */
    return [base + '#hero-banner', base + '#ContentCardContainer', '#ContentCardContainer'];
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

  /**
   * Edge/AJO may return scopes with different casing (#contentCardContainer vs #ContentCardContainer)
   * or put the surface on scopeDetails instead of scope.
   */
  function scopeMatchesFragment(scopeStr, fragment) {
    if (!scopeStr || !fragment) return false;
    var s = String(scopeStr).toLowerCase();
    var f = String(fragment).toLowerCase();
    return s.indexOf('#' + f) !== -1 || s.indexOf(f) !== -1;
  }

  function collectScopeStrings(p) {
    var out = [];
    if (!p) return out;
    if (p.scope) out.push(String(p.scope));
    var sd = p.scopeDetails;
    if (sd && typeof sd === 'object') {
      if (sd.scope) out.push(String(sd.scope));
      if (sd.name) out.push(String(sd.name));
      if (sd.activity && sd.activity.id) out.push(String(sd.activity.id));
      if (sd.characteristics && sd.characteristics.surface) out.push(String(sd.characteristics.surface));
    }
    return out;
  }

  /**
   * Prefer content-card surface over hero so similar paths don't mis-route.
   */
  function resolveTargetForProposition(p, heroEl, cardsEl) {
    var scopes = collectScopeStrings(p);
    var i;
    for (i = 0; i < scopes.length; i++) {
      if (scopeMatchesFragment(scopes[i], 'ContentCardContainer')) return cardsEl;
    }
    for (i = 0; i < scopes.length; i++) {
      if (scopeMatchesFragment(scopes[i], 'hero-banner')) return heroEl;
    }
    return null;
  }

  function debugLogPropositions(propositions) {
    try {
      if (!global.localStorage || global.localStorage.getItem('aepRaceAjoDebug') !== '1') return;
      if (!global.console || !global.console.debug) return;
      global.console.debug('[RaceForLifeAjo] propositions', propositions);
    } catch (e) {
      /* noop */
    }
  }

  function surfaceNotYetRendered(el) {
    return el && !el.querySelector('.race-ajo-content-card-inner');
  }

  function parseJsonStringMaybe(val) {
    if (typeof val !== 'string') return null;
    var t = val.trim();
    if (t.length < 2 || (t[0] !== '{' && t[0] !== '[')) return null;
    try {
      return JSON.parse(t);
    } catch (e) {
      return null;
    }
  }

  /**
   * Launch / AJO nested template: item.data.content = { title: { content }, body: { content }, image: { url } }.
   */
  function normalizeFromNestedContentShape(content) {
    if (!content || typeof content !== 'object') return null;
    var titleNode = content.title;
    var bodyNode = content.body;
    var imageNode = content.image;
    if (titleNode == null && bodyNode == null && imageNode == null) return null;
    var titleVal =
      titleNode && typeof titleNode === 'object' && titleNode.content != null
        ? titleNode.content
        : titleNode != null
          ? titleNode
          : null;
    var bodyVal =
      bodyNode && typeof bodyNode === 'object' && bodyNode.content != null
        ? bodyNode.content
        : bodyNode != null
          ? bodyNode
          : null;
    var imageUrl = null;
    if (imageNode && typeof imageNode === 'object') {
      imageUrl = imageNode.url != null ? imageNode.url : imageNode.src;
    } else if (typeof imageNode === 'string') {
      imageUrl = imageNode;
    }
    if (titleVal == null && bodyVal == null && imageUrl == null) return null;
    return {
      imageURL: imageUrl != null ? String(imageUrl) : '',
      title: titleVal != null ? String(titleVal) : '',
      fullDescription: bodyVal != null ? String(bodyVal) : '',
    };
  }

  /**
   * AJO JSON / content-card payloads: flat { imageURL, title, fullDescription } or nested under data.content.
   */
  function normalizeContentCardPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.imageURL != null || raw.imageUrl != null || raw.title != null || raw.fullDescription != null) {
      return {
        imageURL: raw.imageURL != null ? raw.imageURL : raw.imageUrl,
        title: raw.title,
        fullDescription: raw.fullDescription,
      };
    }
    if (raw.content != null && typeof raw.content === 'object') {
      var cObj = raw.content;
      var nested = normalizeFromNestedContentShape(cObj);
      if (nested) return nested;
      if (cObj.imageURL != null || cObj.imageUrl != null || cObj.title != null || cObj.fullDescription != null) {
        return {
          imageURL: cObj.imageURL != null ? cObj.imageURL : cObj.imageUrl,
          title: cObj.title,
          fullDescription: cObj.fullDescription,
        };
      }
    }
    if (typeof raw.content === 'string') {
      if (raw.content === 'undefined') return null;
      var parsedObj = parseJsonStringMaybe(raw.content);
      if (parsedObj && typeof parsedObj === 'object') {
        var fromNestedStr = normalizeFromNestedContentShape(parsedObj);
        if (fromNestedStr) return fromNestedStr;
        if (parsedObj.imageURL != null || parsedObj.title != null || parsedObj.fullDescription != null) {
          return {
            imageURL: parsedObj.imageURL != null ? parsedObj.imageURL : parsedObj.imageUrl,
            title: parsedObj.title,
            fullDescription: parsedObj.fullDescription,
          };
        }
      }
    }
    return null;
  }

  function getItemData(item) {
    if (!item) return null;
    return item.data || item.characteristics || item;
  }

  /**
   * Renders image + title + body text for AJO content-card JSON (no innerHTML for user text).
   */
  function renderContentCardPayload(el, payload) {
    if (!el || !payload) return false;
    var imgUrl = payload.imageURL != null ? String(payload.imageURL).trim() : '';
    var title = payload.title != null ? String(payload.title) : '';
    var desc = payload.fullDescription != null ? String(payload.fullDescription) : '';

    el.textContent = '';
    el.classList.add('race-ajo-content-card');
    if (el.id === 'hero-banner') el.classList.add('race-ajo-content-card--hero');

    var inner = document.createElement('div');
    inner.className = 'race-ajo-content-card-inner';

    if (imgUrl) {
      var img = document.createElement('img');
      img.className = 'race-ajo-content-card-img';
      img.src = imgUrl;
      img.alt = title || 'Personalized offer';
      img.loading = 'lazy';
      img.decoding = 'async';
      inner.appendChild(img);
    }

    var body = document.createElement('div');
    body.className = 'race-ajo-content-card-body';
    if (title) {
      var h = document.createElement('h3');
      h.className = 'race-ajo-content-card-title';
      h.textContent = title;
      body.appendChild(h);
    }
    if (desc) {
      var p = document.createElement('p');
      p.className = 'race-ajo-content-card-desc';
      p.textContent = desc;
      body.appendChild(p);
    }
    inner.appendChild(body);
    el.appendChild(inner);
    return !!(imgUrl || title || desc);
  }

  function applyItemToElement(el, item) {
    if (!el || !item) return false;
    var data = getItemData(item);
    if (!data) return false;

    var cardPayload = normalizeContentCardPayload(data);
    if (cardPayload) {
      return renderContentCardPayload(el, cardPayload);
    }

    if (typeof data === 'string') {
      el.innerHTML = data;
      return true;
    }
    if (typeof data.content === 'string') {
      var parsedCard = parseJsonStringMaybe(data.content);
      if (parsedCard && typeof parsedCard === 'object') {
        var again = normalizeContentCardPayload(parsedCard);
        if (again) return renderContentCardPayload(el, again);
      }
      el.innerHTML = data.content;
      return true;
    }
    if (data && data.deliveryURL) {
      el.innerHTML =
        '<iframe class="race-ajo-iframe" title="Personalized content" src="' +
        String(data.deliveryURL).replace(/"/g, '') +
        '"></iframe>';
      return true;
    }
    return false;
  }

  /** Fallback when renderDecisions does not populate our sections (code-based JSON/HTML items). */
  function applyPropositionsManually(propositions) {
    if (!propositions || !propositions.length) return;
    debugLogPropositions(propositions);
    var hero = document.getElementById('hero-banner');
    var cards = document.getElementById('ContentCardContainer');
    var i;
    var j;
    var p;
    var items;
    var target;
    for (i = 0; i < propositions.length; i++) {
      p = propositions[i];
      items = p.items || [];
      target = resolveTargetForProposition(p, hero, cards);
      if (!target) continue;
      for (j = 0; j < items.length; j++) {
        if (applyItemToElement(target, items[j])) break;
      }
    }
    /* Content Card journeys sometimes return scopes that omit or alter the #ContentCardContainer fragment; if the payload is card-shaped JSON and the card mount is still empty, place it there. */
    for (i = 0; i < propositions.length; i++) {
      p = propositions[i];
      if (resolveTargetForProposition(p, hero, cards)) continue;
      items = p.items || [];
      for (j = 0; j < items.length; j++) {
        var data = getItemData(items[j]);
        if (!normalizeContentCardPayload(data)) continue;
        if (cards && surfaceNotYetRendered(cards)) {
          applyItemToElement(cards, items[j]);
          break;
        }
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
    /** Exposed for QA: e.g. RaceForLifeAjo.renderContentCardPayload(document.getElementById('ContentCardContainer'), { imageURL, title, fullDescription }) */
    renderContentCardPayload: renderContentCardPayload,
  };
})(typeof window !== 'undefined' ? window : globalThis);
