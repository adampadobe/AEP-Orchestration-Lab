/**
 * Shared profile drawer module for donate-demo and race-for-life-demo pages.
 * Identity graph, avatar, event timeline, audience list, Messages Sent panel.
 *
 * Requires: identity-picker.js, aep-global-sandbox.js, email-engagement-metrics.js
 * Exposes: window.DemoProfileDrawer
 */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XHTML_NS = 'http://www.w3.org/1999/xhtml';

  const AVATAR_DEFAULT =
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80';
  const AVATAR_FEMALE =
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80';
  const AVATAR_MALE = 'images/avatar-male.png';

  const IDENTITY_GRAPH_PALETTE = [
    ['#8b5cf6', 'rgba(139, 92, 246, 0.22)'],
    ['#ca8a04', 'rgba(202, 138, 4, 0.22)'],
    ['#db2777', 'rgba(219, 39, 119, 0.2)'],
    ['#0d9488', 'rgba(13, 148, 136, 0.22)'],
    ['#ea580c', 'rgba(234, 88, 12, 0.2)'],
    ['#3b82f6', 'rgba(59, 130, 246, 0.22)'],
  ];

  let identityGraphScale = 1;
  let lastIdentityGraphKeys = new Set();
  let lastLookedUpProfile = null;

  let profileHoverZone, profileDrawer, profileDrawerAvatar, profileDrawerName;
  let profileDrawerGender, profileDrawerAge, profileDrawerEmail, profileDrawerPhone;
  let profileDrawerAddress, profileDrawerCity, profileDrawerLtv;
  let profileDrawerDesktopId, profileDrawerMobileId, profileDrawerIdentityEmail;
  let profileDrawerAppUuid, profileDrawerCrm, profileDrawerLoyalty;
  let profileDrawerPropensityScore, profileDrawerChurnScore;
  let profileDrawerAudiences, profileDrawerEvents;
  let identityGraphSvg, identityGraphZoomIn, identityGraphZoomOut;
  let profileDrawerMessageSentValue, profileDrawerMessageSentUnit;
  let profileDrawerPushSentValue, profileDrawerPushSentUnit, profileDrawerPushSendsRow;

  let _config = null;

  function cacheDomRefs() {
    profileHoverZone = document.getElementById('profileHoverZone');
    profileDrawer = document.getElementById('profileDrawer');
    profileDrawerAvatar = document.getElementById('profileDrawerAvatar');
    profileDrawerName = document.getElementById('profileDrawerName');
    profileDrawerGender = document.getElementById('profileDrawerGender');
    profileDrawerAge = document.getElementById('profileDrawerAge');
    profileDrawerEmail = document.getElementById('profileDrawerEmail');
    profileDrawerPhone = document.getElementById('profileDrawerPhone');
    profileDrawerAddress = document.getElementById('profileDrawerAddress');
    profileDrawerCity = document.getElementById('profileDrawerCity');
    profileDrawerLtv = document.getElementById('profileDrawerLtv');
    profileDrawerDesktopId = document.getElementById('profileDrawerDesktopId');
    profileDrawerMobileId = document.getElementById('profileDrawerMobileId');
    profileDrawerIdentityEmail = document.getElementById('profileDrawerIdentityEmail');
    profileDrawerAppUuid = document.getElementById('profileDrawerAppUuid');
    profileDrawerCrm = document.getElementById('profileDrawerCrm');
    profileDrawerLoyalty = document.getElementById('profileDrawerLoyalty');
    profileDrawerPropensityScore = document.getElementById('profileDrawerPropensityScore');
    profileDrawerChurnScore = document.getElementById('profileDrawerChurnScore');
    profileDrawerAudiences = document.getElementById('profileDrawerAudiences');
    profileDrawerEvents = document.getElementById('profileDrawerEvents');
    identityGraphSvg = document.getElementById('identityGraphSvg');
    identityGraphZoomIn = document.getElementById('identityGraphZoomIn');
    identityGraphZoomOut = document.getElementById('identityGraphZoomOut');
    profileDrawerMessageSentValue = document.getElementById('profileDrawerMessageSentValue');
    profileDrawerMessageSentUnit = document.getElementById('profileDrawerMessageSentUnit');
    profileDrawerPushSentValue = document.getElementById('profileDrawerPushSentValue');
    profileDrawerPushSentUnit = document.getElementById('profileDrawerPushSentUnit');
    profileDrawerPushSendsRow = document.getElementById('profileDrawerPushSendsRow');
  }

  function getSandboxParam() {
    if (typeof global.AepGlobalSandbox !== 'undefined' && typeof global.AepGlobalSandbox.getSandboxParam === 'function') {
      return global.AepGlobalSandbox.getSandboxParam();
    }
    return '';
  }

  function setDrawerValue(el, value, fallback) {
    if (!el) return;
    el.textContent = value == null || value === '' ? fallback : String(value);
  }

  function formatDrawerGenderDisplay(g) {
    if (g === undefined || g === null) return '—';
    if (g === '') return '(empty)';
    if (typeof g === 'string') return g.trim() || '(empty)';
    if (typeof g === 'number' && Number.isFinite(g)) return String(g);
    if (typeof g === 'object' && !Array.isArray(g)) {
      try { return JSON.stringify(g); } catch { return String(g); }
    }
    return String(g);
  }

  function coalesceGenderForAvatar(g) {
    if (g == null || g === '') return '';
    if (typeof g === 'string') return g.trim();
    if (typeof g === 'number' && Number.isFinite(g)) return String(g);
    if (typeof g === 'object' && !Array.isArray(g)) {
      const id = g['@id'];
      if (id != null && typeof id === 'string') return id;
      for (const k of ['code', 'value', 'name', 'gender', 'type', 'key']) {
        const inner = g[k];
        if (inner != null && typeof inner === 'string') return inner.trim();
      }
    }
    return '';
  }

  function avatarSrcForProfile(source) {
    const raw = coalesceGenderForAvatar(source && source.gender);
    const g = raw.toLowerCase();
    if (g === 'female' || g === 'f' || g === 'woman' || g === 'w') return AVATAR_FEMALE;
    if (g === 'male' || g === 'm' || g === 'man') return AVATAR_MALE;
    if (g.includes('female') || g.includes('woman')) return AVATAR_FEMALE;
    if (g.includes('male') && !g.includes('female')) return AVATAR_MALE;
    if (source && source.avatarUrl) return String(source.avatarUrl);
    return AVATAR_DEFAULT;
  }

  function updateProfileDrawer(profile) {
    const source = profile || null;
    const first = source && source.firstName ? String(source.firstName).trim() : '';
    const last = source && source.lastName ? String(source.lastName).trim() : '';
    const fullName = `${first} ${last}`.trim() || 'No profile loaded';
    setDrawerValue(profileDrawerName, fullName, 'No profile loaded');
    if (profileDrawerGender) {
      profileDrawerGender.textContent = source ? formatDrawerGenderDisplay(source.gender) : '—';
    }
    setDrawerValue(profileDrawerAge, source ? source.age : null, '—');
    setDrawerValue(profileDrawerEmail, source ? source.email : null, '—');
    setDrawerValue(profileDrawerPhone, source ? source.phone : null, 'Unknown');
    setDrawerValue(profileDrawerAddress, source ? source.address : null, 'Unknown');
    setDrawerValue(profileDrawerCity, source ? source.city : null, '—');
    setDrawerValue(profileDrawerLtv, source ? source.customerLifetimeValue : null, '$500');
    setDrawerValue(profileDrawerDesktopId, source ? source.ecid : null, '—');
    setDrawerValue(profileDrawerMobileId, source ? source.mobileId : null, 'Unknown');
    setDrawerValue(profileDrawerIdentityEmail, source ? source.email : null, 'Unknown');
    setDrawerValue(profileDrawerAppUuid, source ? source.appUuid : null, 'Unknown');
    setDrawerValue(profileDrawerCrm, source ? source.crm : null, 'Unknown');
    setDrawerValue(profileDrawerLoyalty, source ? source.loyaltyStatus : null, 'Unknown');
    setDrawerValue(profileDrawerPropensityScore, source ? source.propensityScore : null, '—');
    setDrawerValue(profileDrawerChurnScore, source ? source.churnPrediction : null, '—');
    if (profileDrawerAvatar) {
      profileDrawerAvatar.src = avatarSrcForProfile(source);
    }
    renderAudienceList(source ? source.audiences : null);
    renderEventTimeline(source ? source.events : null);
    renderIdentityGraph(source);
    renderMessagesSent(source ? source.events : null);
  }

  function renderMessagesSent(events) {
    if (!profileDrawerMessageSentValue) return;
    if (!events || !Array.isArray(events) || events.length === 0) {
      profileDrawerMessageSentValue.textContent = '—';
      if (profileDrawerMessageSentUnit) profileDrawerMessageSentUnit.textContent = '';
      if (profileDrawerPushSendsRow) profileDrawerPushSendsRow.hidden = true;
      return;
    }
    if (typeof global.EmailEngagementMetrics !== 'undefined') {
      var n = global.EmailEngagementMetrics.getEmailSendsLastHours(events, 24);
      if (typeof n === 'number' && n > 0) {
        profileDrawerMessageSentValue.textContent = n.toLocaleString();
        if (profileDrawerMessageSentUnit) {
          profileDrawerMessageSentUnit.textContent = n === 1 ? 'email' : 'emails';
        }
      } else {
        profileDrawerMessageSentValue.textContent = '—';
        if (profileDrawerMessageSentUnit) profileDrawerMessageSentUnit.textContent = '';
      }
      var pn = global.EmailEngagementMetrics.getPushSendsLastHours(events, 24);
      if (typeof pn === 'number' && pn > 0 && profileDrawerPushSendsRow) {
        profileDrawerPushSendsRow.hidden = false;
        if (profileDrawerPushSentValue) profileDrawerPushSentValue.textContent = pn.toLocaleString();
        if (profileDrawerPushSentUnit) {
          profileDrawerPushSentUnit.textContent = pn === 1 ? 'push message' : 'push messages';
        }
      } else if (profileDrawerPushSendsRow) {
        profileDrawerPushSendsRow.hidden = true;
      }
    } else {
      profileDrawerMessageSentValue.textContent = '—';
      if (profileDrawerMessageSentUnit) profileDrawerMessageSentUnit.textContent = '';
      if (profileDrawerPushSendsRow) profileDrawerPushSendsRow.hidden = true;
    }
  }

  /* ---- Identity graph ---- */

  function identityGraphLabel(ns) {
    var s = String(ns || '');
    var u = s.toUpperCase();
    if (u.includes('ECID')) return 'ECID';
    if (u.includes('EMAIL')) return 'Email';
    if (u.includes('PHONE') || u.includes('SMS')) return 'Phone';
    if (u.includes('CRM')) return 'CRM';
    if (u.includes('LOYAL')) return 'Loyalty';
    if (u.includes('GAID') || u.includes('IDFA')) return 'Device';
    return s.length > 11 ? s.slice(0, 9) + '…' : s || 'ID';
  }

  function mergeIdentitiesFromConsent(data, ecidVal, canonicalEmail) {
    var list = Array.isArray(data.identities) ? data.identities.slice() : [];
    function hasMatch(re) { return list.some(function (x) { return re.test(String(x.namespace || '')); }); }
    var ecidStr = ecidVal && String(ecidVal).length >= 10 ? String(ecidVal) : '';
    if (ecidStr && !hasMatch(/ecid/i)) list.push({ namespace: 'ECID', value: ecidStr });
    var em = String(canonicalEmail || '').trim();
    if (em && !hasMatch(/email/i)) list.push({ namespace: 'Email', value: em });
    return list.slice(0, 40);
  }

  function realIdentitiesForGraph(identities) {
    if (!Array.isArray(identities)) return [];
    return identities.filter(function (x) { return x && !x.placeholder && String(x.value || '').trim(); }).slice(0, 16);
  }

  function identityStableKey(entry) {
    return String(entry.namespace || '') + ':' + String(entry.value || '').slice(0, 160);
  }

  function layoutIdentityGraphPositions(n, cx, cy) {
    if (n === 0) return [];
    var singleRing = n <= 10;
    var R1 = 92, R2 = 124;
    if (singleRing) {
      var R = n <= 4 ? 88 : n <= 7 ? 102 : 114;
      return Array.from({ length: n }, function (_, i) {
        var a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), i: i, ring: 0 };
      });
    }
    var nInner = Math.ceil(n / 2), nOuter = n - nInner, pos = [];
    for (var i = 0; i < nInner; i++) {
      var a = -Math.PI / 2 + (2 * Math.PI * i) / nInner;
      pos.push({ x: cx + R1 * Math.cos(a), y: cy + R1 * Math.sin(a), i: pos.length, ring: 0 });
    }
    for (var j = 0; j < nOuter; j++) {
      var a2 = -Math.PI / 2 + Math.PI / nOuter + (2 * Math.PI * j) / nOuter;
      pos.push({ x: cx + R2 * Math.cos(a2), y: cy + R2 * Math.sin(a2), i: pos.length, ring: 1 });
    }
    return pos;
  }

  function setIdentityGraphZoom(k) {
    identityGraphScale = Math.min(1.5, Math.max(0.55, k));
    var g = identityGraphSvg && identityGraphSvg.querySelector('[data-identity-scene]');
    if (g) g.setAttribute('transform', 'translate(160,160) scale(' + identityGraphScale + ') translate(-160,-160)');
  }

  function renderIdentityGraph(source) {
    if (!identityGraphSvg) return;
    while (identityGraphSvg.firstChild) identityGraphSvg.removeChild(identityGraphSvg.firstChild);

    var rawIdentities = source && Array.isArray(source.identities) ? source.identities : [];
    var identities = realIdentitiesForGraph(rawIdentities);
    var first = source && source.firstName ? String(source.firstName).trim() : '';
    var last = source && source.lastName ? String(source.lastName).trim() : '';
    var displayName = source ? (first + ' ' + last).trim() || 'Profile' : 'Look up profile';
    var avatarSrc = profileDrawerAvatar ? profileDrawerAvatar.src : AVATAR_DEFAULT;

    var scene = document.createElementNS(SVG_NS, 'g');
    scene.setAttribute('data-identity-scene', '1');
    scene.setAttribute('transform', 'translate(160,160) scale(' + identityGraphScale + ') translate(-160,-160)');
    identityGraphSvg.appendChild(scene);

    var cx = 160, cy = 160, n = identities.length;
    var positions = layoutIdentityGraphPositions(n, cx, cy);
    var prevKeys = lastIdentityGraphKeys;
    var currentKeys = new Set(identities.map(function (e) { return identityStableKey(e); }));

    var edges = document.createElementNS(SVG_NS, 'g');
    edges.setAttribute('class', 'ig-edges');

    if (n > 1 && n <= 14) {
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(positions[i].x));
          line.setAttribute('y1', String(positions[i].y));
          line.setAttribute('x2', String(positions[j].x));
          line.setAttribute('y2', String(positions[j].y));
          line.setAttribute('stroke', 'rgba(255,255,255,0.1)');
          line.setAttribute('stroke-width', '1');
          var ijNew = !prevKeys.has(identityStableKey(identities[i])) || !prevKeys.has(identityStableKey(identities[j]));
          if (ijNew && prevKeys.size > 0) line.setAttribute('class', 'donate-ig-edge-new');
          edges.appendChild(line);
        }
      }
    }

    for (var idx = 0; idx < n; idx++) {
      var p = positions[idx];
      var pair = IDENTITY_GRAPH_PALETTE[idx % IDENTITY_GRAPH_PALETTE.length];
      var stroke = pair[0];
      var key = identityStableKey(identities[idx]);
      var isNew = prevKeys.size > 0 && !prevKeys.has(key);
      var lineN = document.createElementNS(SVG_NS, 'line');
      lineN.setAttribute('x1', String(cx));
      lineN.setAttribute('y1', String(cy));
      lineN.setAttribute('x2', String(p.x));
      lineN.setAttribute('y2', String(p.y));
      lineN.setAttribute('stroke', stroke);
      lineN.setAttribute('stroke-opacity', '0.5');
      lineN.setAttribute('stroke-width', '1.5');
      if (isNew) lineN.setAttribute('class', 'donate-ig-edge-new');
      edges.appendChild(lineN);
    }
    scene.appendChild(edges);

    var outerG = document.createElementNS(SVG_NS, 'g');
    for (var idx2 = 0; idx2 < n; idx2++) {
      var p2 = positions[idx2];
      var pair2 = IDENTITY_GRAPH_PALETTE[idx2 % IDENTITY_GRAPH_PALETTE.length];
      var entry = identities[idx2];
      var label = identityGraphLabel(entry.namespace);
      var val = String(entry.value || '');
      var shortVal = val.length > 16 ? val.slice(0, 14) + '…' : val;
      var key2 = identityStableKey(entry);
      var isNew2 = prevKeys.size > 0 && !prevKeys.has(key2);

      var gOuter = document.createElementNS(SVG_NS, 'g');
      gOuter.setAttribute('transform', 'translate(' + p2.x + ', ' + p2.y + ')');
      var gScale = document.createElementNS(SVG_NS, 'g');
      gScale.setAttribute('class', 'donate-ig-node-scale');
      if (isNew2) gScale.classList.add('donate-ig-node-new');

      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '-42'); rect.setAttribute('y', '-19');
      rect.setAttribute('width', '84'); rect.setAttribute('height', '38');
      rect.setAttribute('rx', '19');
      rect.setAttribute('fill', pair2[1]); rect.setAttribute('stroke', pair2[0]);
      rect.setAttribute('stroke-width', '1.5');
      var t1 = document.createElementNS(SVG_NS, 'text');
      t1.setAttribute('text-anchor', 'middle'); t1.setAttribute('y', '-1');
      t1.setAttribute('fill', '#f8fafc'); t1.setAttribute('font-size', '10');
      t1.setAttribute('font-weight', '700'); t1.textContent = label;
      var t2 = document.createElementNS(SVG_NS, 'text');
      t2.setAttribute('text-anchor', 'middle'); t2.setAttribute('y', '12');
      t2.setAttribute('fill', 'rgba(248,250,252,0.78)'); t2.setAttribute('font-size', '8');
      t2.textContent = shortVal;
      gScale.appendChild(rect); gScale.appendChild(t1); gScale.appendChild(t2);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = entry.namespace + ': ' + val;
      gScale.appendChild(title);
      gOuter.appendChild(gScale);
      outerG.appendChild(gOuter);
    }
    scene.appendChild(outerG);

    var hub = document.createElementNS(SVG_NS, 'g');
    hub.setAttribute('transform', 'translate(' + cx + ', ' + cy + ')');
    var hubScale = document.createElementNS(SVG_NS, 'g');
    hubScale.setAttribute('class', 'donate-ig-hub-scale');
    var fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', '-40'); fo.setAttribute('y', '-48');
    fo.setAttribute('width', '80'); fo.setAttribute('height', '80');
    var wrap = document.createElementNS(XHTML_NS, 'div');
    wrap.setAttribute('xmlns', XHTML_NS);
    wrap.style.cssText = 'width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto;box-sizing:border-box;box-shadow:0 4px 20px rgba(0,0,0,0.35), 0 0 0 3px rgba(147,197,253,0.85);';
    var img = document.createElementNS(XHTML_NS, 'img');
    img.setAttribute('src', avatarSrc); img.setAttribute('width', '80'); img.setAttribute('height', '80');
    img.setAttribute('alt', '');
    img.style.cssText = 'display:block;width:80px;height:80px;object-fit:cover;';
    wrap.appendChild(img); fo.appendChild(wrap); hubScale.appendChild(fo);
    var nameEl = document.createElementNS(SVG_NS, 'text');
    nameEl.setAttribute('text-anchor', 'middle'); nameEl.setAttribute('y', '52');
    nameEl.setAttribute('fill', '#e2e8f0'); nameEl.setAttribute('font-size', '11');
    nameEl.setAttribute('font-weight', '600');
    nameEl.textContent = displayName.length > 22 ? displayName.slice(0, 20) + '…' : displayName;
    hubScale.appendChild(nameEl);
    hub.appendChild(hubScale);
    scene.appendChild(hub);

    if (n === 0) {
      var hint = document.createElementNS(SVG_NS, 'text');
      hint.setAttribute('x', String(cx)); hint.setAttribute('y', String(cy + 72));
      hint.setAttribute('text-anchor', 'middle');
      hint.setAttribute('fill', 'rgba(255,255,255,0.45)'); hint.setAttribute('font-size', '11');
      hint.textContent = 'Linked identifiers appear as you capture email, ECID, phone, …';
      scene.appendChild(hint);
    }

    lastIdentityGraphKeys = currentKeys;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        identityGraphSvg.querySelectorAll('.donate-ig-node-new').forEach(function (el, i) {
          el.style.transitionDelay = Math.min(i, 14) * 0.05 + 's';
          el.classList.add('donate-ig-node-in');
        });
        identityGraphSvg.querySelectorAll('.donate-ig-edge-new').forEach(function (el, i) {
          el.style.transitionDelay = (0.04 + Math.min(i, 20) * 0.025) + 's';
          el.classList.add('donate-ig-edge-in');
        });
        if (prevKeys.size === 0) {
          identityGraphSvg.querySelectorAll('.donate-ig-hub-scale').forEach(function (el) {
            el.classList.add('donate-ig-hub-in');
          });
        }
      });
    });
  }

  /* ---- Audience list ---- */

  function renderAudienceList(audiences) {
    if (!profileDrawerAudiences) return;
    profileDrawerAudiences.innerHTML = '';
    var current = audiences && Array.isArray(audiences.realized) ? audiences.realized : [];
    var exited = audiences && Array.isArray(audiences.exited) ? audiences.exited : [];
    if (current.length === 0 && exited.length === 0) {
      var li = document.createElement('li');
      li.textContent = 'No audience membership found';
      profileDrawerAudiences.appendChild(li);
      return;
    }
    current.slice(0, 4).forEach(function (row) {
      var li = document.createElement('li');
      li.textContent = row && row.name ? String(row.name) : 'Unnamed audience';
      profileDrawerAudiences.appendChild(li);
    });
    exited.slice(0, 2).forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'donate-profile-audience-exited';
      var label = row && row.name ? String(row.name) : 'Unnamed audience';
      li.textContent = label + ' (exited)';
      profileDrawerAudiences.appendChild(li);
    });
  }

  function fetchAudienceMembership(email) {
    if (!email) return Promise.resolve(null);
    var dNs = typeof AepIdentityPicker !== 'undefined' ? AepIdentityPicker.getNamespace(_config.emailInputId || 'customerEmail') : 'email';
    return fetch('/api/profile/audiences?identifier=' + encodeURIComponent(email) + '&namespace=' + encodeURIComponent(dNs) + getSandboxParam())
      .then(function (res) { return res.ok ? res.json().catch(function () { return {}; }) : null; })
      .catch(function () { return null; });
  }

  /* ---- Event timeline ---- */

  function normalizeEventName(name) {
    var raw = String(name || '').trim();
    if (!raw) return 'Experience Event';
    if (!raw.includes('.') && !raw.includes('_')) return raw;
    return raw.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function formatEventTimelineDate(value) {
    var ts = typeof value === 'number' ? value : Number(value);
    var d = Number.isFinite(ts) ? new Date(ts) : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
  }

  function eventThumbForName(eventName) {
    var key = String(eventName || '').toLowerCase().replace(/\s+/g, '');
    if (key.includes('message.feedback') || key === 'messagefeedback')
      return { url: "url('images/message-feedback-icon.png')", variant: 'message-feedback' };
    if (key.includes('message.tracking') || key === 'messagetracking')
      return { url: "url('images/message-tracking-icon.png')", variant: 'message-tracking' };
    var keyLoose = String(eventName || '').toLowerCase();
    if (keyLoose.includes('login'))
      return { url: "url('images/event-login-icon.png')", variant: 'event-login' };
    if (keyLoose.includes('launch'))
      return { url: "url('images/application-launch-icon.png')", variant: 'application-launch' };
    if (keyLoose.includes('donation'))
      return { url: "url('https://www.cancerresearchuk.org/_next/image?url=https%3A%2F%2Fdownloads.ctfassets.net%2Fu7vsjnoopqo5%2FrvcPK0YbxqEl9Gt41Azzq%2Fac926460962e2c75c0a0038ca8bfa45c%2F230613_CR_Trampoline187.jpg&w=256&q=65')" };
    if (keyLoose.includes('register'))
      return { url: "url('https://images.ctfassets.net/u7vsjnoopqo5/6uvR1AnyLivuw4FgIvCIcw/d633484906952732a873c2d355d7aaff/Cervical_Cancer_HPV_Vaccine_2_RGB_400px.png?w=200&q=75')" };
    if (keyLoose.includes('abandon'))
      return { url: "url('https://images.ctfassets.net/u7vsjnoopqo5/3vMd1m9QJUdgZ1jMpzgmoU/657e350658a59d5f37a8a8a6ab3e47e1/Icon_microscope_navy.png?w=200&q=75')" };
    return { url: "url('https://www.cancerresearchuk.org/_next/image?url=https%3A%2F%2Fdownloads.ctfassets.net%2Fu7vsjnoopqo5%2FrvcPK0YbxqEl9Gt41Azzq%2Fac926460962e2c75c0a0038ca8bfa45c%2F230613_CR_Trampoline187.jpg&w=200&q=65')" };
  }

  function renderEventTimeline(events) {
    if (!profileDrawerEvents) return;
    profileDrawerEvents.innerHTML = '';
    var list = Array.isArray(events) ? events.slice(0, 5) : [];
    if (!list.length) {
      var p = document.createElement('p');
      p.textContent = 'No events found for this profile';
      profileDrawerEvents.appendChild(p);
      return;
    }
    list.forEach(function (ev) {
      var item = document.createElement('article');
      item.className = 'donate-profile-event-item';
      var thumb = document.createElement('div');
      thumb.className = 'donate-profile-event-thumb';
      var thumbSpec = eventThumbForName(ev && ev.eventName);
      thumb.style.backgroundImage = thumbSpec.url;
      if (thumbSpec.variant === 'message-feedback') thumb.classList.add('donate-profile-event-thumb--message-feedback');
      if (thumbSpec.variant === 'message-tracking') thumb.classList.add('donate-profile-event-thumb--message-tracking');
      var textWrap = document.createElement('div');
      var timeEl = document.createElement('span');
      timeEl.className = 'donate-profile-event-time';
      timeEl.textContent = formatEventTimelineDate(ev && ev.timestamp);
      var titleEl = document.createElement('strong');
      titleEl.className = 'donate-profile-event-title';
      titleEl.textContent = normalizeEventName(ev && ev.eventName);
      var subEl = document.createElement('span');
      subEl.className = 'donate-profile-event-sub';
      subEl.textContent = normalizeEventName(ev && ev.eventName).toUpperCase() + ' - WEB';
      textWrap.appendChild(timeEl);
      textWrap.appendChild(titleEl);
      textWrap.appendChild(subEl);
      item.appendChild(thumb);
      item.appendChild(textWrap);
      profileDrawerEvents.appendChild(item);
    });
  }

  function fetchRecentEvents(email) {
    if (!email) return Promise.resolve([]);
    var eNs = typeof AepIdentityPicker !== 'undefined' ? AepIdentityPicker.getNamespace(_config.emailInputId || 'customerEmail') : 'email';
    return fetch('/api/profile/events?identifier=' + encodeURIComponent(email) + '&namespace=' + encodeURIComponent(eNs) + getSandboxParam())
      .then(function (res) { return res.ok ? res.json().catch(function () { return {}; }) : {}; })
      .then(function (data) {
        var events = Array.isArray(data.events) ? data.events : [];
        events.sort(function (a, b) {
          var at = a && a.timestamp != null ? Number(a.timestamp) : 0;
          var bt = b && b.timestamp != null ? Number(b.timestamp) : 0;
          return bt - at;
        });
        return events.slice(0, 5);
      })
      .catch(function () { return []; });
  }

  /* ---- application.login event ---- */

  function sendApplicationLoginExperienceEvent(email, getSelectedGeneratorTarget) {
    var ecidEl = document.getElementById('infoEcid');
    var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
    var ecid = ecidText && ecidText !== '—' && ecidText !== '-' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;
    var target = typeof getSelectedGeneratorTarget === 'function' ? getSelectedGeneratorTarget() : null;
    var body = {
      targetId: target ? target.id : undefined,
      email: String(email || '').trim(),
      eventType: 'application.login',
      viewName: _config.viewName || 'Demo',
      viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
      channel: 'Web',
    };
    if (ecid) body.ecid = ecid;
    return fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed.');
        return data;
      });
    });
  }

  /* ---- Main data loader ---- */

  function loadProfileDataForDrawer(email, options) {
    var opts = options || {};
    var emailTrim = String(email || '').trim();
    if (!emailTrim) return Promise.resolve(false);

    var cNs = typeof AepIdentityPicker !== 'undefined' ? AepIdentityPicker.getNamespace(_config.emailInputId || 'customerEmail') : 'email';
    return fetch('/api/profile/consent?identifier=' + encodeURIComponent(emailTrim) + '&namespace=' + encodeURIComponent(cNs) + getSandboxParam())
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            if (opts.updateMessage && _config.messageSetter) _config.messageSetter(data.error || 'Profile request failed.', 'error');
            return false;
          }
          if (typeof addEmail === 'function' && opts.updateMessage) addEmail(emailTrim);
          var ecidVal = data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
          var infoEcid = document.getElementById('infoEcid');
          if (infoEcid) infoEcid.textContent = ecidVal && ecidVal.length >= 10 ? ecidVal : '—';

          var canonicalEmail = data.email || emailTrim;
          return Promise.all([
            fetchAudienceMembership(canonicalEmail),
            fetchRecentEvents(canonicalEmail),
          ]).then(function (results) {
            var audiences = results[0];
            var events = results[1];
            var identities = mergeIdentitiesFromConsent(data, ecidVal, canonicalEmail);
            var prev = lastLookedUpProfile || {};
            lastLookedUpProfile = Object.assign({}, prev, {
              firstName: data.firstName || null,
              lastName: data.lastName || null,
              gender: data.gender != null && data.gender !== '' ? data.gender : null,
              age: data.age != null && data.age !== '' ? data.age : null,
              city: data.city != null && data.city !== '' ? data.city : null,
              propensityScore: data.propensityScore != null && data.propensityScore !== '' ? data.propensityScore : null,
              churnPrediction: data.churnPrediction != null && data.churnPrediction !== '' ? data.churnPrediction : null,
              loyaltyStatus: data.loyaltyStatus != null && data.loyaltyStatus !== '' ? data.loyaltyStatus : null,
              email: canonicalEmail,
              ecid: ecidVal || null,
              marketingConsent: data.marketingConsent || null,
              preferredMarketingChannel: data.preferredMarketingChannel || null,
              dataCollection: data.dataCollection || null,
              lastModifiedAt: data.lastModifiedAt || null,
              identities: identities,
              audiences: audiences,
              events: events,
            });
            updateProfileDrawer(lastLookedUpProfile);

            if (data.found && _config.getSelectedGeneratorTarget) {
              sendApplicationLoginExperienceEvent(emailTrim, _config.getSelectedGeneratorTarget).catch(function () {});
            }

            if (opts.updateMessage && _config.messageSetter) {
              _config.messageSetter(
                data.found
                  ? 'Profile found. ECID will be sent with the event if valid.'
                  : 'No profile found; event can still be sent (no ECID).',
                'success'
              );
            }
            return true;
          });
        });
      })
      .catch(function (err) {
        if (opts.updateMessage && _config.messageSetter) _config.messageSetter(err.message || 'Network error', 'error');
        return false;
      });
  }

  /* ---- Hover drawer init ---- */

  function initHoverDrawer() {
    var body = document.body;
    if (!profileHoverZone || !profileDrawer) return;

    var closeTimer = null;
    var drawerOpenState = false;
    var openClass = _config.profileOpenClass || 'donate-demo-page--profile-open';

    function clearCloseTimer() {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    }

    function setDrawerOpen(open) {
      var next = !!open;
      body.classList.toggle(openClass, next);
      if (next && !drawerOpenState) {
        var email = _config.emailGetter ? _config.emailGetter() : '';
        if (email) loadProfileDataForDrawer(email, { updateMessage: false });
      }
      drawerOpenState = next;
    }

    function scheduleClose() {
      clearCloseTimer();
      closeTimer = setTimeout(function () { setDrawerOpen(false); closeTimer = null; }, 260);
    }

    profileHoverZone.addEventListener('mouseenter', function () { clearCloseTimer(); setDrawerOpen(true); });
    profileHoverZone.addEventListener('mouseleave', scheduleClose);
    profileDrawer.addEventListener('mouseenter', function () { clearCloseTimer(); setDrawerOpen(true); });
    profileDrawer.addEventListener('mouseleave', scheduleClose);

    updateProfileDrawer(null);
    setDrawerOpen(false);
  }

  /* ---- Public API ---- */

  function init(config) {
    _config = config || {};
    cacheDomRefs();

    if (identityGraphZoomIn) {
      identityGraphZoomIn.addEventListener('click', function () { setIdentityGraphZoom(identityGraphScale + 0.12); });
    }
    if (identityGraphZoomOut) {
      identityGraphZoomOut.addEventListener('click', function () { setIdentityGraphZoom(identityGraphScale - 0.12); });
    }

    initHoverDrawer();
  }

  global.DemoProfileDrawer = {
    init: init,
    loadProfileDataForDrawer: loadProfileDataForDrawer,
    updateProfileDrawer: updateProfileDrawer,
    getLastProfile: function () { return lastLookedUpProfile; },
    patchLastProfileOrUpdate: function (fields) {
      if (lastLookedUpProfile) {
        Object.assign(lastLookedUpProfile, fields);
        updateProfileDrawer(lastLookedUpProfile);
      } else {
        updateProfileDrawer(fields);
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
