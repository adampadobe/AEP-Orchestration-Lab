/**
 * Channel preview emulators (Decisioning lab Edge) — web + mobile in main stage;
 * icon toolbar stays in the hero rail.
 * Depends on CdEdgeMounts (content-decision-edge-mounts.js). Loads after content-decision-live-edge-inline.js.
 * Mobile frames: iPhone 17 Pro (402×874 CSS viewport); Android: Google Pixel 9 Pro (412×915).
 */
(function (global) {
  'use strict';

  var PREFIX_WEB = 'em-web-';
  var PREFIX_MOB = 'em-mob-';
  var cachedPropositions = [];
  var openKind = null;
  var webBuilt = false;
  var mobBuilt = false;
  var mobScaleObserver = null;
  var mobScaleRaf = null;
  var mobWinResizeHandler = null;
  var USER_PHONE_SCALE_KEY = 'cdEdgePhoneUserScale';
  var PHONE_BEZEL_DARK_KEY = 'cdEdgePhoneBezelDark';

  function readPhoneBezelDark() {
    try {
      return !!(global.sessionStorage && global.sessionStorage.getItem(PHONE_BEZEL_DARK_KEY) === '1');
    } catch (e) {
      return false;
    }
  }

  function writePhoneBezelDark(on) {
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(PHONE_BEZEL_DARK_KEY, on ? '1' : '0');
      }
    } catch (e2) {}
  }

  function applyPhoneBezelDarkShell(shellEl, isDark) {
    if (!shellEl) return;
    shellEl.classList.toggle('cd-ch-em-phone-shell--bezel-dark', !!isDark);
  }

  function syncPhoneBezelRadios(defaultBtn, blackBtn, isDark) {
    if (!defaultBtn || !blackBtn) return;
    defaultBtn.setAttribute('aria-checked', isDark ? 'false' : 'true');
    blackBtn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    defaultBtn.setAttribute('tabindex', isDark ? '-1' : '0');
    blackBtn.setAttribute('tabindex', isDark ? '0' : '-1');
  }

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

  function clearMainPipelineMountBodies() {
    var wrap = document.getElementById('cdEdgeMounts');
    if (!wrap) return;
    var bodies = wrap.querySelectorAll('.cd-edge-mount-body');
    var i;
    for (i = 0; i < bodies.length; i++) {
      bodies[i].innerHTML = '';
      bodies[i].classList.remove('cd-banner-wrap');
    }
  }

  function clearAllEmulatorMountBodies() {
    var webVp = document.getElementById('cdChEmWebViewport');
    var mobVp = document.getElementById('cdChEmMobViewport');
    if (webVp) clearBodiesInViewport(webVp, PREFIX_WEB);
    if (mobVp) clearBodiesInViewport(mobVp, PREFIX_MOB);
  }

  function dispatchChannelChanged() {
    try {
      global.dispatchEvent(
        new CustomEvent('cd-edge-channel-preview-changed', {
          detail: { channel: openKind },
        })
      );
    } catch (e) {}
  }

  function setMainStageChannelUi(active) {
    var stage = document.getElementById('cdEdgeMainStage');
    var host = document.getElementById('cdChannelEmulatorHost');
    if (stage) {
      stage.classList.toggle('cd-edge-main-stage--channel-on', !!active);
    }
    if (host) {
      if (active) host.removeAttribute('hidden');
      else host.setAttribute('hidden', '');
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
    if (mobScaleObserver) {
      try {
        mobScaleObserver.disconnect();
      } catch (e) {}
      mobScaleObserver = null;
    }
    if (mobWinResizeHandler) {
      try {
        global.removeEventListener('resize', mobWinResizeHandler);
      } catch (e) {}
      mobWinResizeHandler = null;
    }

    var wrap = document.createElement('div');
    wrap.className = 'cd-ch-em-mob-wrap';

    function readUserPhoneScale() {
      try {
        var v = global.sessionStorage ? global.sessionStorage.getItem(USER_PHONE_SCALE_KEY) : null;
        var n = v != null ? parseFloat(v, 10) : 1;
        if (!isFinite(n) || n <= 0) return 1;
        return Math.min(2, Math.max(0.5, n));
      } catch (e) {
        return 1;
      }
    }

    function writeUserPhoneScale(v) {
      try {
        if (global.sessionStorage) {
          global.sessionStorage.setItem(USER_PHONE_SCALE_KEY, String(Math.round(v * 1000) / 1000));
        }
      } catch (e) {}
    }

    var userPhoneScale = readUserPhoneScale();
    var dragResizeState = null;
    var bezelDark = readPhoneBezelDark();

    var toolbarRow = document.createElement('div');
    toolbarRow.className = 'cd-ch-em-mob-toolbar-row';

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
    toolbarRow.appendChild(toggle);

    var bezelLab = document.createElement('span');
    bezelLab.className = 'cd-ch-em-mob-bezel-prefix';
    bezelLab.textContent = 'Bezel';
    toolbarRow.appendChild(bezelLab);

    var bezelRg = document.createElement('div');
    bezelRg.className = 'cd-ch-em-mob-bezel-toggle';
    bezelRg.setAttribute('role', 'radiogroup');
    bezelRg.setAttribute('aria-label', 'Phone bezel color');
    var bBezDef = document.createElement('button');
    bBezDef.type = 'button';
    bBezDef.id = 'cdChEmMobBezelDefault';
    bBezDef.setAttribute('role', 'radio');
    bBezDef.textContent = 'Default';
    var bBezBlk = document.createElement('button');
    bBezBlk.type = 'button';
    bBezBlk.id = 'cdChEmMobBezelBlack';
    bBezBlk.setAttribute('role', 'radio');
    bBezBlk.textContent = 'Black';
    bezelRg.appendChild(bBezDef);
    bezelRg.appendChild(bBezBlk);
    toolbarRow.appendChild(bezelRg);
    wrap.appendChild(toolbarRow);

    syncPhoneBezelRadios(bBezDef, bBezBlk, bezelDark);

    var shell = document.createElement('div');
    shell.className = 'cd-ch-em-phone-shell';
    shell.id = 'cdChEmPhoneShell';
    applyPhoneBezelDarkShell(shell, bezelDark);

    var scaleOuter = document.createElement('div');
    scaleOuter.className = 'cd-ch-em-phone-scale-outer';
    scaleOuter.id = 'cdChEmPhoneScaleOuter';

    var scaleInner = document.createElement('div');
    scaleInner.className = 'cd-ch-em-phone-scale-inner';
    scaleInner.id = 'cdChEmPhoneScaleInner';

    var phone = document.createElement('div');
    phone.className = 'cd-ch-em-phone cd-ch-em-phone--ios';
    phone.id = 'cdChEmPhoneFrame';

    var display = document.createElement('div');
    display.className = 'cd-ch-em-phone-display';

    var punch = document.createElement('div');
    punch.className = 'cd-ch-em-android-punch';
    punch.setAttribute('aria-hidden', 'true');

    var iosStatus = document.createElement('div');
    iosStatus.className = 'cd-ch-em-ios-status';
    iosStatus.setAttribute('aria-hidden', 'true');
    var iosTime = document.createElement('span');
    iosTime.className = 'cd-ch-em-ios-time';
    iosTime.textContent = '9:41';
    var iosTrail = document.createElement('div');
    iosTrail.className = 'cd-ch-em-ios-status-trail';
    var sig = document.createElement('div');
    sig.className = 'cd-ch-em-ios-signal';
    var si;
    for (si = 0; si < 4; si++) {
      sig.appendChild(document.createElement('span'));
    }
    iosTrail.appendChild(sig);
    var wifi = document.createElement('div');
    wifi.className = 'cd-ch-em-ios-wifi';
    wifi.setAttribute('aria-hidden', 'true');
    iosTrail.appendChild(wifi);
    var batt = document.createElement('div');
    batt.className = 'cd-ch-em-ios-battery';
    batt.setAttribute('aria-hidden', 'true');
    var battFill = document.createElement('span');
    battFill.className = 'cd-ch-em-ios-battery-fill';
    batt.appendChild(battFill);
    iosTrail.appendChild(batt);
    iosStatus.appendChild(iosTime);
    iosStatus.appendChild(iosTrail);

    var island = document.createElement('div');
    island.className = 'cd-ch-em-dynamic-island';
    island.setAttribute('aria-hidden', 'true');

    var androidStatus = document.createElement('div');
    androidStatus.className = 'cd-ch-em-android-status';
    androidStatus.setAttribute('aria-hidden', 'true');
    var andClock = document.createElement('span');
    andClock.className = 'cd-ch-em-android-clock';
    andClock.textContent = '10:00';
    var andIcons = document.createElement('div');
    andIcons.className = 'cd-ch-em-android-icons';
    andIcons.appendChild(iconAndroidCellular());
    andIcons.appendChild(iconAndroidWifi());
    andIcons.appendChild(iconAndroidBattery());
    androidStatus.appendChild(andClock);
    androidStatus.appendChild(andIcons);

    var vp = document.createElement('div');
    vp.className = 'cd-ch-em-mob-viewport';
    vp.id = 'cdChEmMobViewport';

    var iosHome = document.createElement('div');
    iosHome.className = 'cd-ch-em-ios-home';
    iosHome.setAttribute('aria-hidden', 'true');
    var iosHomeBar = document.createElement('div');
    iosHomeBar.className = 'cd-ch-em-ios-home-bar';
    iosHome.appendChild(iosHomeBar);

    var androidBottom = document.createElement('div');
    androidBottom.className = 'cd-ch-em-android-bottom';
    androidBottom.setAttribute('aria-hidden', 'true');
    var gesture = document.createElement('div');
    gesture.className = 'cd-ch-em-android-gesture';
    androidBottom.appendChild(gesture);
    var hintRow = document.createElement('div');
    hintRow.className = 'cd-ch-em-android-hint-row';
    hintRow.appendChild(document.createElement('span'));
    hintRow.appendChild(document.createElement('span'));
    hintRow.appendChild(document.createElement('span'));
    androidBottom.appendChild(hintRow);

    display.appendChild(punch);
    display.appendChild(iosStatus);
    display.appendChild(island);
    display.appendChild(androidStatus);
    display.appendChild(vp);
    display.appendChild(iosHome);
    display.appendChild(androidBottom);
    phone.appendChild(display);

    scaleInner.appendChild(phone);
    scaleOuter.appendChild(scaleInner);

    var resizeHandle = document.createElement('button');
    resizeHandle.type = 'button';
    resizeHandle.className = 'cd-ch-em-phone-resize-handle';
    resizeHandle.id = 'cdChEmPhoneResizeHandle';
    resizeHandle.setAttribute('aria-label', 'Resize mobile preview');
    var gripNs = 'http://www.w3.org/2000/svg';
    var gripSvg = document.createElementNS(gripNs, 'svg');
    gripSvg.setAttribute('viewBox', '0 0 16 16');
    gripSvg.setAttribute('aria-hidden', 'true');
    var gripPath = document.createElementNS(gripNs, 'path');
    gripPath.setAttribute('fill', 'none');
    gripPath.setAttribute('stroke', 'currentColor');
    gripPath.setAttribute('stroke-width', '1.65');
    gripPath.setAttribute('stroke-linecap', 'round');
    gripPath.setAttribute('d', 'M14 10v4h-4M10 14l4-4M14 6V2h-4M10 2l4 4');
    gripSvg.appendChild(gripPath);
    resizeHandle.appendChild(gripSvg);

    resizeHandle.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      dragResizeState = {
        pid: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startUser: userPhoneScale,
      };
      try {
        resizeHandle.setPointerCapture(e.pointerId);
      } catch (err) {}
    });

    resizeHandle.addEventListener('pointermove', function (e) {
      if (!dragResizeState || e.pointerId !== dragResizeState.pid) return;
      var delta = (e.clientX - dragResizeState.startX) + (e.clientY - dragResizeState.startY);
      var next = dragResizeState.startUser * (1 + delta / 150);
      userPhoneScale = Math.min(2, Math.max(0.5, next));
      schedulePhoneScale();
    });

    function endResizeDrag(e) {
      if (!dragResizeState || (e && e.pointerId !== dragResizeState.pid)) return;
      try {
        if (e) resizeHandle.releasePointerCapture(e.pointerId);
      } catch (err2) {}
      dragResizeState = null;
      writeUserPhoneScale(userPhoneScale);
    }

    resizeHandle.addEventListener('pointerup', endResizeDrag);
    resizeHandle.addEventListener('pointercancel', endResizeDrag);

    scaleOuter.appendChild(resizeHandle);
    shell.appendChild(scaleOuter);
    wrap.appendChild(shell);

    function updatePhoneScale() {
      var phoneEl = document.getElementById('cdChEmPhoneFrame');
      var sh = document.getElementById('cdChEmPhoneShell');
      var outer = document.getElementById('cdChEmPhoneScaleOuter');
      var inner = document.getElementById('cdChEmPhoneScaleInner');
      if (!phoneEl || !sh || !outer || !inner) return;

      var W = phoneEl.offsetWidth;
      var H = phoneEl.offsetHeight;
      if (!W || !H) return;

      var stage = document.getElementById('cdEdgeMainStage');
      var shellRect = sh.getBoundingClientRect();
      var stageRect = stage ? stage.getBoundingClientRect() : null;

      var availW = Math.max(96, sh.clientWidth - 8);
      var availH = Math.max(120, sh.clientHeight - 8);

      if (stageRect && stageRect.height > 140) {
        availH = Math.max(availH, Math.floor(stageRect.height) - 56);
        availW = Math.max(availW, Math.floor(stageRect.width) - 12);
      }

      var vCap = global.innerHeight - shellRect.top - 16;
      if (isFinite(vCap) && vCap > 100) {
        availH = Math.min(availH, Math.floor(vCap));
      }
      var hCap = global.innerWidth - shellRect.left - 16;
      if (isFinite(hCap) && hCap > 96) {
        availW = Math.min(availW, Math.floor(hCap));
      }

      if (availH < 160) {
        availH = Math.max(availH, Math.floor(global.innerHeight * 0.5));
      }
      if (availW < 120) {
        availW = Math.max(availW, Math.floor(global.innerWidth * 0.88));
      }

      var fit = Math.min(availW / W, availH / H, 1);
      if (!(fit > 0) || !isFinite(fit)) fit = 1;

      var legibilityFloor = Math.min(0.76, Math.max(0.52, 304 / W));
      var autoScale = Math.min(1, Math.max(fit, legibilityFloor));

      var us = Math.min(2, Math.max(0.5, userPhoneScale));
      var finalScale = autoScale * us;
      if (!(finalScale > 0) || !isFinite(finalScale)) finalScale = autoScale;

      inner.style.transform = 'scale(' + finalScale + ')';
      outer.style.width = Math.round(W * finalScale) + 'px';
      outer.style.height = Math.round(H * finalScale) + 'px';
    }

    function schedulePhoneScale() {
      if (mobScaleRaf) cancelAnimationFrame(mobScaleRaf);
      mobScaleRaf = requestAnimationFrame(function () {
        mobScaleRaf = null;
        updatePhoneScale();
      });
    }

    mobWinResizeHandler = schedulePhoneScale;
    global.addEventListener('resize', mobWinResizeHandler);

    mobScaleObserver = new ResizeObserver(schedulePhoneScale);
    mobScaleObserver.observe(shell);
    var stageObs = document.getElementById('cdEdgeMainStage');
    if (stageObs) {
      try {
        mobScaleObserver.observe(stageObs);
      } catch (e2) {}
    }

    function setOs(isAndroid) {
      phone.classList.toggle('cd-ch-em-phone--ios', !isAndroid);
      phone.classList.toggle('cd-ch-em-phone--android', !!isAndroid);
      bIos.setAttribute('aria-pressed', isAndroid ? 'false' : 'true');
      bAnd.setAttribute('aria-pressed', isAndroid ? 'true' : 'false');
      schedulePhoneScale();
    }
    bIos.addEventListener('click', function () {
      setOs(false);
    });
    bAnd.addEventListener('click', function () {
      setOs(true);
    });

    bBezDef.addEventListener('click', function () {
      writePhoneBezelDark(false);
      applyPhoneBezelDarkShell(shell, false);
      syncPhoneBezelRadios(bBezDef, bBezBlk, false);
    });
    bBezBlk.addEventListener('click', function () {
      writePhoneBezelDark(true);
      applyPhoneBezelDarkShell(shell, true);
      syncPhoneBezelRadios(bBezDef, bBezBlk, true);
    });

    panelMob.appendChild(wrap);
    buildMountTree(vp, PREFIX_MOB);
    mobBuilt = true;
    schedulePhoneScale();
    setTimeout(schedulePhoneScale, 50);
  }

  function iconAndroidCellular() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 18 12');
    svg.setAttribute('aria-hidden', 'true');
    var i;
    for (i = 0; i < 4; i++) {
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(2 + i * 4));
      r.setAttribute('y', String(10 - (i + 1) * 2));
      r.setAttribute('width', '3');
      r.setAttribute('height', String((i + 1) * 2));
      r.setAttribute('rx', '0.5');
      r.setAttribute('fill', 'currentColor');
      svg.appendChild(r);
    }
    return svg;
  }

  function iconAndroidWifi() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 12');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.4');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute(
      'd',
      'M2 9c2.5-2.5 9.5-2.5 12 0M4.5 6.5C6.8 4.5 9.2 4.5 11.5 6.5M7 4c1-0.8 1.8-0.8 2.8 0'
    );
    svg.appendChild(p);
    return svg;
  }

  function iconAndroidBattery() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 22 11');
    svg.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', '1');
    r.setAttribute('y', '1.5');
    r.setAttribute('width', '17');
    r.setAttribute('height', '8');
    r.setAttribute('rx', '1.5');
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', 'currentColor');
    r.setAttribute('stroke-width', '1.2');
    svg.appendChild(r);
    var tip = document.createElementNS(ns, 'rect');
    tip.setAttribute('x', '18.5');
    tip.setAttribute('y', '4');
    tip.setAttribute('width', '1.5');
    tip.setAttribute('height', '3');
    tip.setAttribute('rx', '0.3');
    tip.setAttribute('fill', 'currentColor');
    svg.appendChild(tip);
    var fill = document.createElementNS(ns, 'rect');
    fill.setAttribute('x', '3');
    fill.setAttribute('y', '3.5');
    fill.setAttribute('width', '11');
    fill.setAttribute('height', '4');
    fill.setAttribute('rx', '0.5');
    fill.setAttribute('fill', 'currentColor');
    fill.setAttribute('opacity', '0.85');
    svg.appendChild(fill);
    return svg;
  }

  function applyToViewport(viewport, prefix) {
    if (!viewport || typeof CdEdgeMounts === 'undefined' || !CdEdgeMounts.applyPropositionsManually) return;
    if (!cachedPropositions.length) {
      clearBodiesInViewport(viewport, prefix);
      return;
    }
    CdEdgeMounts.applyPropositionsManually(cachedPropositions, { root: viewport, mountIdPrefix: prefix });
  }

  function applyToMainMounts() {
    var mainWrap = document.getElementById('cdEdgeMounts');
    if (!mainWrap || typeof CdEdgeMounts === 'undefined' || !CdEdgeMounts.applyPropositionsManually) return;
    if (!cachedPropositions.length) {
      clearMainPipelineMountBodies();
      return;
    }
    CdEdgeMounts.applyPropositionsManually(cachedPropositions, { root: mainWrap, mountIdPrefix: '' });
  }

  /**
   * Single place to route proposition HTML into either the main pipeline mounts
   * or the active channel emulator — never both visible at once.
   */
  function sync(propositions) {
    cachedPropositions = Array.isArray(propositions) ? propositions.slice() : [];
    var webVp = document.getElementById('cdChEmWebViewport');
    var mobVp = document.getElementById('cdChEmMobViewport');

    if (!cachedPropositions.length) {
      clearMainPipelineMountBodies();
      if (webVp) clearBodiesInViewport(webVp, PREFIX_WEB);
      if (mobVp) clearBodiesInViewport(mobVp, PREFIX_MOB);
      return;
    }

    if (!openKind) {
      if (webVp) clearBodiesInViewport(webVp, PREFIX_WEB);
      if (mobVp) clearBodiesInViewport(mobVp, PREFIX_MOB);
      applyToMainMounts();
      return;
    }

    if (openKind === 'web') {
      clearMainPipelineMountBodies();
      if (mobVp) clearBodiesInViewport(mobVp, PREFIX_MOB);
      applyToViewport(webVp, PREFIX_WEB);
      return;
    }

    if (openKind === 'mobile') {
      clearMainPipelineMountBodies();
      if (webVp) clearBodiesInViewport(webVp, PREFIX_WEB);
      applyToViewport(mobVp, PREFIX_MOB);
    }
  }

  function setToolbarPressed(btnWeb, btnMob, kind) {
    if (btnWeb) btnWeb.setAttribute('aria-pressed', kind === 'web' ? 'true' : 'false');
    if (btnMob) btnMob.setAttribute('aria-pressed', kind === 'mobile' ? 'true' : 'false');
  }

  function getActiveChannel() {
    return openKind;
  }

  function getMountIdPrefix() {
    if (openKind === 'web') return PREFIX_WEB;
    if (openKind === 'mobile') return PREFIX_MOB;
    return '';
  }

  function init() {
    var hostRail = document.getElementById('cdChannelPreviewShell');
    var hostCenter = document.getElementById('cdChannelEmulatorHost');
    if (!hostRail || hostRail.getAttribute('data-cd-ch-em-init') === '1') return;
    hostRail.setAttribute('data-cd-ch-em-init', '1');

    var shell = document.createElement('div');
    shell.className = 'cd-ch-em-shell cd-ch-em-shell--rail';

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
    hostRail.appendChild(shell);

    if (hostCenter) {
      hostCenter.appendChild(panel);
    } else {
      shell.appendChild(panel);
    }

    function showPanel(kind) {
      if (!hostCenter) {
        panel.hidden = false;
      }
      if (openKind === kind) {
        openKind = null;
        panel.hidden = true;
        panelWeb.hidden = true;
        panelMob.hidden = true;
        setToolbarPressed(btnWeb, btnMob, null);
        setMainStageChannelUi(false);
        dispatchChannelChanged();
        sync(cachedPropositions);
        return;
      }
      openKind = kind;
      if (hostCenter) {
        panel.hidden = false;
        setMainStageChannelUi(true);
      } else {
        panel.hidden = false;
      }
      if (kind === 'web') {
        ensureWebPanel(panelWeb);
        panelWeb.hidden = false;
        panelMob.hidden = true;
      } else {
        ensureMobPanel(panelMob);
        panelWeb.hidden = true;
        panelMob.hidden = false;
      }
      setToolbarPressed(btnWeb, btnMob, kind);
      sync(cachedPropositions);
      dispatchChannelChanged();
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
      sync(Array.isArray(g) ? g : []);
    }

    window.addEventListener('cd-edge-placements-changed', function () {
      if (mobScaleObserver) {
        try {
          mobScaleObserver.disconnect();
        } catch (e) {}
        mobScaleObserver = null;
      }
      if (mobWinResizeHandler) {
        try {
          global.removeEventListener('resize', mobWinResizeHandler);
        } catch (e) {}
        mobWinResizeHandler = null;
      }
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
    getActiveChannel: getActiveChannel,
    getMountIdPrefix: getMountIdPrefix,
    clearAllEmulatorMountBodies: clearAllEmulatorMountBodies,
    clearMainPipelineMountBodies: clearMainPipelineMountBodies,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
