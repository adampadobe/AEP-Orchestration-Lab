/**
 * Channel preview emulators (Decisioning lab Edge) — M1 web + mobile.
 * Depends on CdEdgeMounts (content-decision-edge-mounts.js). Loads after content-decision-live-edge-inline.js.
 */
(function (global) {
  'use strict';

  var PREFIX_WEB = 'em-web-';
  var PREFIX_MOB = 'em-mob-';
  var cachedPropositions = [];
  var openKind = null;
  var webBuilt = false;
  var mobBuilt = false;

  function escAttrId(id) {
    return String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function queryById(scope, id) {
    if (!scope || id == null) return null;
    var idStr = String(id);
    if (scope.nodeType === 9) return scope.getElementById(idStr);
    try {
      return scope.querySelector('[id="' + escAttrId(idStr) + '"]');
    } catch (e) {
      return null;
    }
  }

  function getPlacementsForBuild() {
    if (typeof CdEdgeMounts !== 'undefined' && CdEdgeMounts.getPlacements) {
      var rows = CdEdgeMounts.getPlacements();
      if (rows && rows.length) return rows;
    }
    return typeof CdEdgeMounts !== 'undefined' && CdEdgeMounts.DEFAULT_PLACEMENTS
      ? CdEdgeMounts.DEFAULT_PLACEMENTS.slice()
      : [];
  }

  function clearBodiesInViewport(viewport, prefix) {
    if (!viewport || !prefix) return;
    var rows = getPlacementsForBuild();
    var i;
    for (i = 0; i < rows.length; i++) {
      var k = rows[i].key;
      var body = queryById(viewport, 'cd-edge-' + prefix + k);
      if (!body) continue;
      body.innerHTML = '';
      body.classList.remove('cd-banner-wrap');
      try {
        body.removeAttribute('hidden');
      } catch (e) {}
    }
  }

  function buildMountTree(wrapEl, idPrefix) {
    if (!wrapEl) return;
    var placements = getPlacementsForBuild();
    wrapEl.textContent = '';
    var mountsRoot = document.createElement('div');
    mountsRoot.className = 'cd-edge-mounts';
    mountsRoot.setAttribute('aria-label', 'Emulator personalization mounts');
    var i;
    for (i = 0; i < placements.length; i++) {
      var p = placements[i];
      var key = p.key;
      var fragment = p.fragment || '';
      var lab = p.label || key;
      var outer = document.createElement('div');
      outer.className = 'cd-edge-mount';
      var labEl = document.createElement('span');
      labEl.className = 'cd-edge-mount-label';
      labEl.textContent = lab + (fragment ? ' — #' + fragment : '');
      var body = document.createElement('div');
      body.id = 'cd-edge-' + idPrefix + key;
      body.className = 'cd-edge-mount-body';
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', lab);
      var lk = String(key).toLowerCase();
      if (lk === 'hero') body.classList.add('cd-edge-mount-body--hero');
      var isCardSlot = lk === 'contentcard' || /contentcard|content-card/i.test(fragment);
      if (!isCardSlot) body.classList.add('cd-edge-prefer-html');
      outer.appendChild(labEl);
      outer.appendChild(body);
      mountsRoot.appendChild(outer);
    }
    wrapEl.appendChild(mountsRoot);
  }

  function iconWeb() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', '3');
    r.setAttribute('y', '4');
    r.setAttribute('width', '18');
    r.setAttribute('height', '13');
    r.setAttribute('rx', '1.5');
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', 'currentColor');
    r.setAttribute('stroke-width', '1.5');
    svg.appendChild(r);
    var l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', '3');
    l.setAttribute('y1', '8');
    l.setAttribute('x2', '21');
    l.setAttribute('y2', '8');
    l.setAttribute('stroke', 'currentColor');
    l.setAttribute('stroke-width', '1.2');
    svg.appendChild(l);
    var b = document.createElementNS(ns, 'rect');
    b.setAttribute('x', '8');
    b.setAttribute('y', '17');
    b.setAttribute('width', '8');
    b.setAttribute('height', '2.5');
    b.setAttribute('rx', '0.5');
    b.setAttribute('fill', 'currentColor');
    svg.appendChild(b);
    return svg;
  }

  function iconMobile() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', '7');
    r.setAttribute('y', '2');
    r.setAttribute('width', '10');
    r.setAttribute('height', '20');
    r.setAttribute('rx', '2');
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', 'currentColor');
    r.setAttribute('stroke-width', '1.5');
    svg.appendChild(r);
    var c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '18');
    c.setAttribute('r', '0.9');
    c.setAttribute('fill', 'currentColor');
    svg.appendChild(c);
    return svg;
  }

  function iconEmail() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', '3');
    r.setAttribute('y', '5');
    r.setAttribute('width', '18');
    r.setAttribute('height', '14');
    r.setAttribute('rx', '1.5');
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', 'currentColor');
    r.setAttribute('stroke-width', '1.5');
    svg.appendChild(r);
    var p = document.createElementNS(ns, 'polyline');
    p.setAttribute('points', '3,7 12,13 21,7');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.2');
    svg.appendChild(p);
    return svg;
  }

  function iconHeadset() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M6 14v3a2 2 0 002 2h1M18 14v3a2 2 0 01-2 2h-1M6 14a6 6 0 0112 0');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
    return svg;
  }

  function iconKiosk() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', '5');
    r.setAttribute('y', '3');
    r.setAttribute('width', '14');
    r.setAttribute('height', '16');
    r.setAttribute('rx', '1');
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', 'currentColor');
    r.setAttribute('stroke-width', '1.5');
    svg.appendChild(r);
    var b = document.createElementNS(ns, 'rect');
    b.setAttribute('x', '8');
    b.setAttribute('y', '19');
    b.setAttribute('width', '8');
    b.setAttribute('height', '2');
    b.setAttribute('rx', '0.5');
    b.setAttribute('fill', 'currentColor');
    svg.appendChild(b);
    return svg;
  }

  function toolbarBtn(kind, label, title, iconFn, disabled) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cd-ch-em-toolbar-btn';
    btn.id = 'cdChEmBtn' + kind;
    btn.setAttribute('aria-label', label);
    btn.title = title;
    if (disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'Coming soon';
    } else {
      btn.setAttribute('aria-pressed', 'false');
    }
    btn.appendChild(iconFn());
    return btn;
  }

  function ensureWebPanel(panelWeb) {
    if (webBuilt) return;
    var frame = document.createElement('div');
    frame.className = 'cd-ch-em-web-frame';
    var chrome = document.createElement('div');
    chrome.className = 'cd-ch-em-web-chrome';
    chrome.setAttribute('aria-hidden', 'true');
    var dots = document.createElement('div');
    dots.className = 'cd-ch-em-web-dots';
    dots.appendChild(document.createElement('span')).className = 'cd-ch-em-web-dot';
    dots.appendChild(document.createElement('span')).className = 'cd-ch-em-web-dot';
    dots.appendChild(document.createElement('span')).className = 'cd-ch-em-web-dot';
    chrome.appendChild(dots);
    var urlBar = document.createElement('div');
    urlBar.className = 'cd-ch-em-web-url';
    var pageUrl = '';
    try {
      pageUrl = global.location && global.location.href ? global.location.href.split('?')[0] : '';
    } catch (e) {}
    urlBar.textContent = pageUrl || 'https://…';
    chrome.appendChild(urlBar);
    frame.appendChild(chrome);
    var vp = document.createElement('div');
    vp.className = 'cd-ch-em-web-viewport';
    vp.id = 'cdChEmWebViewport';
    frame.appendChild(vp);
    panelWeb.appendChild(frame);
    buildMountTree(vp, PREFIX_WEB);
    webBuilt = true;
  }

  function ensureMobPanel(panelMob) {
    if (mobBuilt) return;
    var wrap = document.createElement('div');
    wrap.className = 'cd-ch-em-mob-wrap';

    var toggle = document.createElement('div');
    toggle.className = 'cd-ch-em-mob-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Mobile OS preview');
    var bIos = document.createElement('button');
    bIos.type = 'button';
    bIos.id = 'cdChEmMobIos';
    bIos.textContent = 'iOS';
    bIos.setAttribute('aria-pressed', 'true');
    var bAnd = document.createElement('button');
    bAnd.type = 'button';
    bAnd.id = 'cdChEmMobAndroid';
    bAnd.textContent = 'Android';
    bAnd.setAttribute('aria-pressed', 'false');
    toggle.appendChild(bIos);
    toggle.appendChild(bAnd);
    wrap.appendChild(toggle);

    var phone = document.createElement('div');
    phone.className = 'cd-ch-em-phone cd-ch-em-phone--ios';
    phone.id = 'cdChEmPhoneFrame';

    var notch = document.createElement('div');
    notch.className = 'cd-ch-em-phone-notch';
    notch.setAttribute('aria-hidden', 'true');
    phone.appendChild(notch);

    var vp = document.createElement('div');
    vp.className = 'cd-ch-em-mob-viewport';
    vp.id = 'cdChEmMobViewport';
    phone.appendChild(vp);

    var nav = document.createElement('div');
    nav.className = 'cd-ch-em-android-nav';
    nav.setAttribute('aria-hidden', 'true');
    phone.appendChild(nav);
    var three = document.createElement('div');
    three.className = 'cd-ch-em-android-buttons';
    three.appendChild(document.createElement('span'));
    three.appendChild(document.createElement('span'));
    three.appendChild(document.createElement('span'));
    phone.appendChild(three);

    wrap.appendChild(phone);

    function setOs(isAndroid) {
      phone.classList.toggle('cd-ch-em-phone--ios', !isAndroid);
      phone.classList.toggle('cd-ch-em-phone--android', !!isAndroid);
      bIos.setAttribute('aria-pressed', isAndroid ? 'false' : 'true');
      bAnd.setAttribute('aria-pressed', isAndroid ? 'true' : 'false');
    }
    bIos.addEventListener('click', function () {
      setOs(false);
    });
    bAnd.addEventListener('click', function () {
      setOs(true);
    });

    panelMob.appendChild(wrap);
    buildMountTree(vp, PREFIX_MOB);
    mobBuilt = true;
  }

  function applyToViewport(viewport, prefix) {
    if (!viewport || typeof CdEdgeMounts === 'undefined' || !CdEdgeMounts.applyPropositionsManually) return;
    if (!cachedPropositions.length) {
      clearBodiesInViewport(viewport, prefix);
      return;
    }
    CdEdgeMounts.applyPropositionsManually(cachedPropositions, { root: viewport, mountIdPrefix: prefix });
  }

  function sync(propositions) {
    cachedPropositions = Array.isArray(propositions) ? propositions.slice() : [];
    var webVp = document.getElementById('cdChEmWebViewport');
    var mobVp = document.getElementById('cdChEmMobViewport');
    if (!cachedPropositions.length) {
      if (webVp) clearBodiesInViewport(webVp, PREFIX_WEB);
      if (mobVp) clearBodiesInViewport(mobVp, PREFIX_MOB);
      return;
    }
    if (webVp) applyToViewport(webVp, PREFIX_WEB);
    if (mobVp) applyToViewport(mobVp, PREFIX_MOB);
  }

  function setToolbarPressed(btnWeb, btnMob, kind) {
    if (btnWeb) btnWeb.setAttribute('aria-pressed', kind === 'web' ? 'true' : 'false');
    if (btnMob) btnMob.setAttribute('aria-pressed', kind === 'mobile' ? 'true' : 'false');
  }

  function init() {
    var host = document.getElementById('cdChannelPreviewShell');
    if (!host || host.getAttribute('data-cd-ch-em-init') === '1') return;
    host.setAttribute('data-cd-ch-em-init', '1');

    var shell = document.createElement('div');
    shell.className = 'cd-ch-em-shell';

    var tb = document.createElement('div');
    tb.className = 'cd-ch-em-toolbar';
    tb.setAttribute('role', 'toolbar');
    tb.setAttribute('aria-label', 'Channel preview emulators');

    var btnWeb = toolbarBtn('Web', 'Web', 'Web channel preview', iconWeb, false);
    var btnMob = toolbarBtn('Mobile', 'Mobile', 'Mobile channel preview (iOS / Android)', iconMobile, false);
    var btnEmail = toolbarBtn('Email', 'Email', 'Coming soon', iconEmail, true);
    var btnCall = toolbarBtn('Call', 'Call centre', 'Coming soon', iconHeadset, true);
    var btnKiosk = toolbarBtn('Kiosk', 'Kiosk', 'Coming soon', iconKiosk, true);

    tb.appendChild(btnWeb);
    tb.appendChild(btnMob);
    tb.appendChild(btnEmail);
    tb.appendChild(btnCall);
    tb.appendChild(btnKiosk);

    var panel = document.createElement('div');
    panel.className = 'cd-ch-em-panel';
    panel.id = 'cdChEmPanel';
    panel.hidden = true;

    var panelWeb = document.createElement('div');
    panelWeb.className = 'cd-ch-em-panel-inner';
    panelWeb.id = 'cdChEmPanelWeb';
    panelWeb.hidden = true;

    var panelMob = document.createElement('div');
    panelMob.className = 'cd-ch-em-panel-inner';
    panelMob.id = 'cdChEmPanelMob';
    panelMob.hidden = true;

    panel.appendChild(panelWeb);
    panel.appendChild(panelMob);

    shell.appendChild(tb);
    shell.appendChild(panel);
    host.appendChild(shell);

    function showPanel(kind) {
      if (openKind === kind) {
        openKind = null;
        panel.hidden = true;
        panelWeb.hidden = true;
        panelMob.hidden = true;
        setToolbarPressed(btnWeb, btnMob, null);
        return;
      }
      openKind = kind;
      panel.hidden = false;
      if (kind === 'web') {
        ensureWebPanel(panelWeb);
        panelWeb.hidden = false;
        panelMob.hidden = true;
        applyToViewport(document.getElementById('cdChEmWebViewport'), PREFIX_WEB);
      } else {
        ensureMobPanel(panelMob);
        panelWeb.hidden = true;
        panelMob.hidden = false;
        applyToViewport(document.getElementById('cdChEmMobViewport'), PREFIX_MOB);
      }
      setToolbarPressed(btnWeb, btnMob, kind);
    }

    btnWeb.addEventListener('click', function () {
      showPanel('web');
    });
    btnMob.addEventListener('click', function () {
      showPanel('mobile');
    });

    function rehydrateFromLive() {
      var g =
        typeof window.CdEdgeLive !== 'undefined' && typeof window.CdEdgeLive.getLastPropositions === 'function'
          ? window.CdEdgeLive.getLastPropositions()
          : null;
      if (Array.isArray(g) && g.length) sync(g);
    }

    window.addEventListener('cd-edge-placements-changed', function () {
      webBuilt = false;
      mobBuilt = false;
      panelWeb.textContent = '';
      panelMob.textContent = '';
      if (openKind === 'web') ensureWebPanel(panelWeb);
      else if (openKind === 'mobile') ensureMobPanel(panelMob);
      rehydrateFromLive();
    });
  }

  global.CdChannelPreview = {
    sync: sync,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
