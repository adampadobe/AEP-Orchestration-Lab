/**
 * Decisioning lab (Edge): apply AJO/Web SDK propositions to three DOM mounts (top ribbon, hero, content card).
 * Adapted from race-for-life-ajo.js — same item parsing; extended scope routing for TopRibbon + travel-hero-banner.
 */
(function (global) {
  'use strict';

  var SCHEMAS = [
    'https://ns.adobe.com/personalization/default-content-item',
    'https://ns.adobe.com/personalization/html-content-item',
    'https://ns.adobe.com/personalization/json-content-item',
    'https://ns.adobe.com/personalization/dom-action',
  ];

  var DEFAULT_PLACEMENTS = [
    { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
    { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
    { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card' },
  ];

  var _placements = DEFAULT_PLACEMENTS.slice();

  /**
   * @param {Array<{ key: string, fragment: string, label?: string }>} arr
   */
  function setPlacements(arr) {
    if (!arr || !Array.isArray(arr) || !arr.length) return;
    var next = [];
    for (var i = 0; i < Math.min(arr.length, 8); i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      var key = String(p.key || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '');
      if (!key) key = 'slot' + i;
      var fragment = String(p.fragment || '')
        .trim()
        .replace(/^#/, '');
      if (!fragment) continue;
      next.push({
        key: key,
        fragment: fragment,
        label: String(p.label || fragment).trim().slice(0, 128),
      });
    }
    if (next.length) _placements = next;
  }

  function getPlacements() {
    return _placements.slice();
  }

  function buildSurfacesForEdgeLabPage() {
    var loc = global.location || {};
    var host = loc.host || '';
    var path = (loc.pathname || '/').split('?')[0];
    if (!host) {
      return _placements.map(function (p) {
        return '#' + String(p.fragment).replace(/^#/, '');
      });
    }
    var base = 'web://' + host + path;
    var out = [];
    var i;
    for (i = 0; i < _placements.length; i++) {
      out.push(base + '#' + String(_placements[i].fragment).replace(/^#/, ''));
    }
    for (i = 0; i < _placements.length; i++) {
      if (/contentcard/i.test(_placements[i].fragment)) {
        out.push('#' + String(_placements[i].fragment).replace(/^#/, ''));
        break;
      }
    }
    return out;
  }

  function namespaceToIdentityKey(ns) {
    var map = { email: 'Email', ecid: 'ECID', phone: 'Phone', crmId: 'CRMId', loyaltyId: 'LoyaltyId' };
    return map[ns] || ns;
  }

  /**
   * @param {{ ecid?: string|null } | null} profile
   * @param {string} identifierRaw
   * @param {string} namespace - email | ecid | …
   */
  function buildIdentityMap(profile, identifierRaw, namespace) {
    var map = {};
    var ns = namespace || 'email';
    var idVal = String(identifierRaw || '').trim();
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

  function resolveTargetForProposition(p, mountByKey) {
    var scopes = collectScopeStrings(p);
    var pi;
    var si;
    for (pi = 0; pi < _placements.length; pi++) {
      var frag = _placements[pi].fragment;
      var k = _placements[pi].key;
      for (si = 0; si < scopes.length; si++) {
        if (scopeMatchesFragment(scopes[si], frag)) {
          return mountByKey[k] || null;
        }
      }
    }
    return null;
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

  function isFlatContentCardShape(raw) {
    if (!raw || typeof raw !== 'object') return false;
    if (raw.imageURL != null || raw.imageUrl != null || raw.fullDescription != null) return true;
    if (raw.title != null && raw.fullDescription != null) return true;
    return false;
  }

  function isLaunchNestedContentCardShape(content) {
    if (!content || typeof content !== 'object') return false;
    var img = content.image;
    var hasImg = img && typeof img === 'object' && (img.url != null || img.src != null);
    var t = content.title;
    var b = content.body;
    var hasNestedPair =
      t && typeof t === 'object' && t.content != null && b && typeof b === 'object' && b.content != null;
    return hasImg || hasNestedPair;
  }

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

  function normalizeContentCardPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (isFlatContentCardShape(raw)) {
      return {
        imageURL: raw.imageURL != null ? raw.imageURL : raw.imageUrl,
        title: raw.title,
        fullDescription: raw.fullDescription,
      };
    }
    if (raw.content != null && typeof raw.content === 'object') {
      var cObj = raw.content;
      if (isFlatContentCardShape(cObj)) {
        return {
          imageURL: cObj.imageURL != null ? cObj.imageURL : cObj.imageUrl,
          title: cObj.title,
          fullDescription: cObj.fullDescription,
        };
      }
      if (isLaunchNestedContentCardShape(cObj)) {
        return normalizeFromNestedContentShape(cObj);
      }
    }
    if (typeof raw.content === 'string') {
      if (raw.content === 'undefined') return null;
      var parsedObj = parseJsonStringMaybe(raw.content);
      if (parsedObj && typeof parsedObj === 'object') {
        if (isFlatContentCardShape(parsedObj)) {
          return {
            imageURL: parsedObj.imageURL != null ? parsedObj.imageURL : parsedObj.imageUrl,
            title: parsedObj.title,
            fullDescription: parsedObj.fullDescription,
          };
        }
        if (isLaunchNestedContentCardShape(parsedObj)) {
          return normalizeFromNestedContentShape(parsedObj);
        }
      }
    }
    return null;
  }

  function getItemData(item) {
    if (!item) return null;
    return item.data || item.characteristics || item;
  }

  function renderContentCardPayload(el, payload) {
    if (!el || !payload) return false;
    var imgUrl = payload.imageURL != null ? String(payload.imageURL).trim() : '';
    var title = payload.title != null ? String(payload.title) : '';
    var desc = payload.fullDescription != null ? String(payload.fullDescription) : '';
    el.textContent = '';
    el.classList.add('cd-edge-ajo-card');
    var inner = document.createElement('div');
    inner.className = 'cd-edge-ajo-card-inner';
    if (imgUrl) {
      var img = document.createElement('img');
      img.className = 'cd-edge-ajo-card-img';
      img.src = imgUrl;
      img.alt = title || 'Personalized offer';
      img.loading = 'lazy';
      img.decoding = 'async';
      inner.appendChild(img);
    }
    var body = document.createElement('div');
    body.className = 'cd-edge-ajo-card-body';
    if (title) {
      var h = document.createElement('h3');
      h.className = 'cd-edge-ajo-card-title';
      h.textContent = title;
      body.appendChild(h);
    }
    if (desc) {
      var p = document.createElement('p');
      p.className = 'cd-edge-ajo-card-desc';
      p.textContent = desc;
      body.appendChild(p);
    }
    inner.appendChild(body);
    el.appendChild(inner);
    return !!(imgUrl || title || desc);
  }

  function looksLikeHtmlString(s) {
    if (typeof s !== 'string') return false;
    var t = s.trim();
    return t.length > 0 && t.charAt(0) === '<';
  }

  function applyItemToElement(el, item) {
    if (!el || !item) return false;
    var data = getItemData(item);
    if (!data) return false;

    var preferHtml =
      el.id === 'cd-edge-hero' ||
      el.id === 'cd-edge-topRibbon' ||
      (el.id && String(el.id).indexOf('cd-edge-topRibbon') === 0);
    if (preferHtml) {
      if (looksLikeHtmlString(data)) {
        el.innerHTML = data;
        return true;
      }
      if (typeof data.content === 'string' && looksLikeHtmlString(data.content)) {
        el.innerHTML = data.content;
        return true;
      }
      if (data && data.deliveryURL) {
        el.innerHTML =
          '<iframe class="cd-edge-ajo-iframe" title="Personalized content" src="' +
          String(data.deliveryURL).replace(/"/g, '') +
          '"></iframe>';
        return true;
      }
    }

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
        '<iframe class="cd-edge-ajo-iframe" title="Personalized content" src="' +
        String(data.deliveryURL).replace(/"/g, '') +
        '"></iframe>';
      return true;
    }
    return false;
  }

  function surfaceNotYetRendered(el) {
    return el && !el.querySelector('.cd-edge-ajo-card-inner, .cd-banner, iframe');
  }

  function buildMountByKey() {
    var mountByKey = {};
    var i;
    for (i = 0; i < _placements.length; i++) {
      var k = _placements[i].key;
      mountByKey[k] = document.getElementById('cd-edge-' + k);
    }
    return mountByKey;
  }

  function firstContentCardMount(mountByKey) {
    var i;
    for (i = 0; i < _placements.length; i++) {
      if (/contentcard|content.card/i.test(_placements[i].fragment)) {
        return mountByKey[_placements[i].key] || null;
      }
    }
    return mountByKey.contentCard || null;
  }

  function applyPropositionsManually(propositions) {
    if (!propositions || !propositions.length) return;
    var mountByKey = buildMountByKey();
    var cards = firstContentCardMount(mountByKey);
    var i;
    var j;
    var p;
    var items;
    var target;
    for (i = 0; i < propositions.length; i++) {
      p = propositions[i];
      items = p.items || [];
      target = resolveTargetForProposition(p, mountByKey);
      if (!target) continue;
      for (j = 0; j < items.length; j++) {
        if (applyItemToElement(target, items[j])) break;
      }
    }
    for (i = 0; i < propositions.length; i++) {
      p = propositions[i];
      if (resolveTargetForProposition(p, mountByKey)) continue;
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

  global.CdEdgeMounts = {
    PERSONALIZATION_SCHEMAS: SCHEMAS,
    DEFAULT_PLACEMENTS: DEFAULT_PLACEMENTS,
    setPlacements: setPlacements,
    getPlacements: getPlacements,
    buildSurfacesForEdgeLabPage: buildSurfacesForEdgeLabPage,
    buildIdentityMap: buildIdentityMap,
    applyPropositionsManually: applyPropositionsManually,
  };
})(typeof window !== 'undefined' ? window : globalThis);
