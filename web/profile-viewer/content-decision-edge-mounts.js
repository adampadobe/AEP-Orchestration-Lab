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
    { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon', type: 'exd' },
    { key: 'hero', fragment: 'hero-banner', label: 'Hero banner', type: 'exd' },
    { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card', type: 'contentCard' },
  ];
  var PLACEMENT_TYPES = { exd: 1, contentCard: 1 };

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
      var type = p.type && PLACEMENT_TYPES[p.type] ? p.type : null;
      if (!type) {
        type = /content\s*card|message\s*feed|cardcontainer/i.test(fragment) ? 'contentCard' : 'exd';
      }
      next.push({
        key: key,
        fragment: fragment,
        label: String(p.label || fragment).trim().slice(0, 128),
        type: type,
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
    // AJO json-content-item shape: { title, image, text, url }.
    if (raw.image != null || raw.text != null) return true;
    return false;
  }

  function pickImageUrl(raw) {
    if (!raw || typeof raw !== 'object') return '';
    if (raw.imageURL != null) return String(raw.imageURL);
    if (raw.imageUrl != null) return String(raw.imageUrl);
    // AJO JSON often uses `image` as a string URL.
    if (raw.image != null) {
      if (typeof raw.image === 'string') return raw.image;
      if (typeof raw.image === 'object') return String(raw.image.url || raw.image.src || '');
    }
    return '';
  }

  function pickDescription(raw) {
    if (!raw || typeof raw !== 'object') return '';
    if (raw.fullDescription != null) return String(raw.fullDescription);
    if (raw.text != null) return String(raw.text);
    if (raw.description != null) return String(raw.description);
    return '';
  }

  function pickUrl(raw) {
    if (!raw || typeof raw !== 'object') return '';
    if (raw.url != null) return String(raw.url);
    if (raw.link != null) return String(raw.link);
    if (raw.actionUrl != null) return String(raw.actionUrl);
    return '';
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

  function flattenFlatShape(raw) {
    return {
      imageURL: pickImageUrl(raw),
      title: raw.title != null ? String(raw.title) : '',
      fullDescription: pickDescription(raw),
      url: pickUrl(raw),
    };
  }

  function normalizeContentCardPayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (isFlatContentCardShape(raw)) return flattenFlatShape(raw);
    if (raw.content != null && typeof raw.content === 'object') {
      var cObj = raw.content;
      if (isFlatContentCardShape(cObj)) return flattenFlatShape(cObj);
      if (isLaunchNestedContentCardShape(cObj)) return normalizeFromNestedContentShape(cObj);
    }
    if (typeof raw.content === 'string') {
      if (raw.content === 'undefined') return null;
      var parsedObj = parseJsonStringMaybe(raw.content);
      if (parsedObj && typeof parsedObj === 'object') {
        if (isFlatContentCardShape(parsedObj)) return flattenFlatShape(parsedObj);
        if (isLaunchNestedContentCardShape(parsedObj)) return normalizeFromNestedContentShape(parsedObj);
      }
    }
    return null;
  }

  function getItemData(item) {
    if (!item) return null;
    return item.data || item.characteristics || item;
  }

  /**
   * Render a content-card payload as a slot-based banner. The mount gets
   * `.cd-banner` + `.cd-banner--overlay` so the per-surface style form's
   * CSS custom properties (--cd-title-color, --cd-block-justify, etc.)
   * take effect. Each slot (.cd-slot--title / --desc / --cta) is its own
   * flex cell so horizontal+vertical alignment controls are independent.
   */
  function renderContentCardPayload(el, payload) {
    if (!el || !payload) return false;
    var imgUrl = payload.imageURL != null ? String(payload.imageURL).trim() : '';
    var title = payload.title != null ? String(payload.title) : '';
    var desc = payload.fullDescription != null ? String(payload.fullDescription) : '';
    var url = payload.url != null ? String(payload.url) : '';
    if (!imgUrl && !title && !desc) return false;

    el.textContent = '';
    el.classList.add('cd-edge-rendered-banner');
    var banner = document.createElement('div');
    banner.className = 'cd-banner cd-banner--overlay';
    if (imgUrl) {
      var img = document.createElement('img');
      img.className = 'cd-banner-image';
      img.src = imgUrl;
      img.alt = title || 'Personalized offer';
      img.loading = 'lazy';
      img.decoding = 'async';
      banner.appendChild(img);
    }
    var copy = document.createElement('div');
    copy.className = 'cd-banner-copy';
    if (title) {
      var titleSlot = document.createElement('div');
      titleSlot.className = 'cd-slot cd-slot--title';
      var h = document.createElement('h3');
      h.className = 'cd-slot-title';
      h.textContent = title;
      titleSlot.appendChild(h);
      copy.appendChild(titleSlot);
    }
    if (desc) {
      var descSlot = document.createElement('div');
      descSlot.className = 'cd-slot cd-slot--desc';
      var p = document.createElement('p');
      p.className = 'cd-slot-desc';
      p.textContent = desc;
      descSlot.appendChild(p);
      copy.appendChild(descSlot);
    }
    // Always render a CTA slot so users can style it even if AJO doesn't
    // ship a URL. Label is a sensible default.
    var ctaSlot = document.createElement('div');
    ctaSlot.className = 'cd-slot cd-slot--cta';
    var cta = document.createElement(url ? 'a' : 'span');
    cta.className = 'cd-slot-cta';
    cta.textContent = 'Learn more';
    if (url) { cta.href = url; cta.target = '_blank'; cta.rel = 'noopener'; }
    ctaSlot.appendChild(cta);
    copy.appendChild(ctaSlot);
    banner.appendChild(copy);
    el.appendChild(banner);
    return true;
  }

  // ── AJO message / content-card renderer ─────────────────────────────
  //
  // Separate from the slot-based EXD banner renderer because content
  // cards ship a richer payload: nested title/body objects, an image
  // with alt, an array of buttons, and an optional dismiss control.
  // Flattening them into the EXD 4-field shape lost the buttons and
  // collapsed the dismiss affordance.

  var CARD_SCHEMA = 'https://ns.adobe.com/personalization/message/content-card';
  var RULESET_SCHEMA = 'https://ns.adobe.com/personalization/ruleset-item';

  /** Pull the content-card `data.content` block out of any legal shape. */
  function extractContentCardDetail(item) {
    if (!item) return null;
    if (item.schema === CARD_SCHEMA) return item.data || null;
    if (item.schema === RULESET_SCHEMA) {
      var rules = item.data && item.data.rules;
      if (!Array.isArray(rules)) return null;
      for (var i = 0; i < rules.length; i++) {
        var cs = rules[i] && rules[i].consequences;
        if (!Array.isArray(cs)) continue;
        for (var j = 0; j < cs.length; j++) {
          var detail = cs[j] && cs[j].detail;
          if (detail && detail.schema === CARD_SCHEMA) return detail.data || null;
        }
      }
    }
    return null;
  }

  function renderMessageContentCard(el, cardData) {
    if (!el || !cardData) return false;
    var content = cardData.content;
    if (!content || typeof content !== 'object') return false;

    var titleText = (content.title && typeof content.title === 'object')
      ? (content.title.content || '')
      : (content.title || '');
    var bodyText = (content.body && typeof content.body === 'object')
      ? (content.body.content || '')
      : (content.body || '');
    var imgUrl = '';
    var imgAlt = '';
    if (content.image && typeof content.image === 'object') {
      imgUrl = content.image.url || content.image.src || '';
      imgAlt = content.image.alt || '';
    } else if (typeof content.image === 'string') {
      imgUrl = content.image;
    }
    var buttons = Array.isArray(content.buttons) ? content.buttons : [];
    var dismissStyle = content.dismissBtn && content.dismissBtn.style;

    // Mark the mount so CSS can style content cards distinctly from EXD banners.
    el.classList.add('cd-banner-wrap');
    el.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'cd-banner cd-banner--overlay cd-banner--card';
    card.setAttribute('data-cd-kind', 'contentCard');

    if (imgUrl) {
      var fig = document.createElement('div');
      fig.className = 'cd-banner-figure';
      var img = document.createElement('img');
      img.className = 'cd-banner-image';
      img.src = imgUrl;
      img.alt = imgAlt;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      fig.appendChild(img);
      card.appendChild(fig);
    }

    var copy = document.createElement('div');
    copy.className = 'cd-banner-copy';

    if (titleText) {
      var titleSlot = document.createElement('div');
      titleSlot.className = 'cd-slot cd-slot--title';
      var tEl = document.createElement('div');
      tEl.className = 'cd-slot-title';
      tEl.textContent = String(titleText);
      titleSlot.appendChild(tEl);
      copy.appendChild(titleSlot);
    }
    if (bodyText) {
      var descSlot = document.createElement('div');
      descSlot.className = 'cd-slot cd-slot--desc';
      var dEl = document.createElement('div');
      dEl.className = 'cd-slot-desc';
      dEl.textContent = String(bodyText);
      descSlot.appendChild(dEl);
      copy.appendChild(descSlot);
    }

    if (buttons.length) {
      var btnSlot = document.createElement('div');
      btnSlot.className = 'cd-slot cd-slot--cta cd-slot--cta-group';
      for (var b = 0; b < buttons.length; b++) {
        var btnDef = buttons[b] || {};
        var actionUrl = btnDef.actionUrl || '';
        var btnText = (btnDef.text && typeof btnDef.text === 'object')
          ? (btnDef.text.content || '')
          : (btnDef.text || '');
        if (!btnText) continue;
        var ctaEl = document.createElement(actionUrl ? 'a' : 'span');
        ctaEl.className = 'cd-slot-cta';
        ctaEl.textContent = String(btnText);
        if (actionUrl) { ctaEl.href = actionUrl; ctaEl.target = '_blank'; ctaEl.rel = 'noopener'; }
        btnSlot.appendChild(ctaEl);
      }
      if (btnSlot.children.length) copy.appendChild(btnSlot);
    } else if (content.actionUrl) {
      var only = document.createElement('div');
      only.className = 'cd-slot cd-slot--cta';
      var a = document.createElement('a');
      a.className = 'cd-slot-cta';
      a.href = content.actionUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Learn more';
      only.appendChild(a);
      copy.appendChild(only);
    }

    card.appendChild(copy);

    if (dismissStyle) {
      var dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'cd-card-dismiss cd-card-dismiss--' + String(dismissStyle).replace(/[^a-z0-9_-]/gi, '');
      dismiss.setAttribute('aria-label', 'Dismiss');
      dismiss.textContent = '×';
      dismiss.addEventListener('click', function () {
        try { el.setAttribute('hidden', ''); } catch (_e) {}
      });
      card.appendChild(dismiss);
    }

    el.appendChild(card);
    return true;
  }

  function looksLikeHtmlString(s) {
    if (typeof s !== 'string') return false;
    var t = s.trim();
    return t.length > 0 && t.charAt(0) === '<';
  }

  function applyItemToElement(el, item) {
    if (!el || !item) return false;

    // 1. Schema-first branch: AJO message/content-card (maybe wrapped in
    //    a ruleset-item) gets the rich renderer with buttons + dismiss.
    var cardDetail = extractContentCardDetail(item);
    if (cardDetail) {
      return renderMessageContentCard(el, cardDetail);
    }

    var data = getItemData(item);
    if (!data) return false;

    // 2. Slot-based EXD banner renderer for flat json-content-item.
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
    // Prefer placements explicitly typed as contentCard; fall back to
    // the legacy fragment-name regex for configs saved before the type
    // field existed.
    for (i = 0; i < _placements.length; i++) {
      if (_placements[i].type === 'contentCard') {
        return mountByKey[_placements[i].key] || null;
      }
    }
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
        var itm = items[j];
        // An unrouted proposition goes to the first content-card mount
        // if EITHER the item is an AJO message/content-card OR the
        // payload smells like a card.
        var looksLikeCard =
          extractContentCardDetail(itm) ||
          normalizeContentCardPayload(getItemData(itm));
        if (!looksLikeCard) continue;
        if (cards && surfaceNotYetRendered(cards)) {
          applyItemToElement(cards, itm);
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
