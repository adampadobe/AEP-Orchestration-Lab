/**
 * End-to-end Adobe flow — hub: AEM ↔ WF ↔ GenStudio; WF → AJO; AJO forks to Email & Decision; CJA → WF (last).
 */
(function () {
  'use strict';

  try {
    if (localStorage.getItem('aepNavHideInDev_architectureEndToEnd') === '1') return;
  } catch (e) {}

  var NS = 'http://www.w3.org/2000/svg';
  var coordRoot = document.getElementById('e2eBoard');
  var svg = document.getElementById('e2eArrowLayer');
  var playBtn = document.getElementById('e2ePlayBtn');
  var resetBtn = document.getElementById('e2eResetBtn');
  var delayInput = document.getElementById('e2eDelayMs');
  var delayLabel = document.getElementById('e2eDelayLabel');

  if (!coordRoot || !svg) return;

  /** Reveal order — CJA and its arrow are last */
  var STEP_NODE_IDS = [
    'e2e-wf-hub',
    'e2e-aem',
    'e2e-genstudio',
    'e2e-ajo',
    'e2e-email',
    'e2e-decision',
    'e2e-cja',
  ];

  var EDGE_PAD = 40;
  var BIDIR_Y = 9;
  var FLOW = '#2d9d6c';
  var FLOW_ALT = '#3d9d72';
  var PATH_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
  var PAIR_STAGGER_MS = 110;

  var timerId = null;
  var stepIndex = 0;

  function getDelayMs() {
    return delayInput ? parseInt(delayInput.value, 10) || 620 : 620;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  if (delayInput && delayLabel) {
    delayInput.addEventListener('input', function () {
      delayLabel.textContent = delayInput.value + ' ms';
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function relRect(el) {
    var e = el.getBoundingClientRect();
    var c = coordRoot.getBoundingClientRect();
    return {
      left: e.left - c.left,
      top: e.top - c.top,
      right: e.right - c.left,
      bottom: e.bottom - c.top,
      width: e.width,
      height: e.height,
      cx: e.left - c.left + e.width / 2,
      cy: e.top - c.top + e.height / 2,
    };
  }

  function horizontalBidirPaths(leftEl, rightEl) {
    var L = relRect(leftEl);
    var R = relRect(rightEl);
    var mid = (L.cy + R.cy) / 2;
    var yUp = mid - BIDIR_Y;
    var yDn = mid + BIDIR_Y;
    var xL = L.right + EDGE_PAD;
    var xR = R.left - EDGE_PAD;
    return {
      towardRight: 'M ' + xL + ' ' + yDn + ' L ' + xR + ' ' + yDn,
      towardLeft: 'M ' + xR + ' ' + yUp + ' L ' + xL + ' ' + yUp,
    };
  }

  /** Straight tie from hub Workfront down to AJO */
  function pathWfToAjo(wfEl, ajoEl) {
    var w = relRect(wfEl);
    var a = relRect(ajoEl);
    return (
      'M ' +
      w.cx +
      ' ' +
      (w.bottom + EDGE_PAD) +
      ' L ' +
      a.cx +
      ' ' +
      (a.top - EDGE_PAD)
    );
  }

  /** Straight segment CJA → Workfront (arrowhead at Workfront) */
  function pathCjaToWf(cjaEl, wfEl) {
    var c = relRect(cjaEl);
    var w = relRect(wfEl);
    var x0 = c.cx;
    var y0 = c.top - EDGE_PAD;
    var x1 = w.cx;
    var y1 = w.bottom + EDGE_PAD;
    return 'M ' + x0 + ' ' + y0 + ' L ' + x1 + ' ' + y1;
  }

  /** One segment: bottom of AJO → top of Email (arrowhead at Email; flows downward) */
  function pathAjoToEmail(ajoEl, emailEl) {
    var a = relRect(ajoEl);
    var e = relRect(emailEl);
    return (
      'M ' +
      a.cx +
      ' ' +
      (a.bottom + EDGE_PAD) +
      ' L ' +
      e.cx +
      ' ' +
      (e.top - EDGE_PAD)
    );
  }

  /** One segment: bottom of AJO → top of Decision */
  function pathAjoToDecision(ajoEl, decisionEl) {
    var a = relRect(ajoEl);
    var d = relRect(decisionEl);
    return (
      'M ' +
      a.cx +
      ' ' +
      (a.bottom + EDGE_PAD) +
      ' L ' +
      d.cx +
      ' ' +
      (d.top - EDGE_PAD)
    );
  }

  function ensureDefs() {
    if (svg.querySelector('defs')) return;
    var defs = document.createElementNS(NS, 'defs');
    var mk = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', 'e2e-arr-flow');
    mk.setAttribute('markerWidth', '9');
    mk.setAttribute('markerHeight', '9');
    mk.setAttribute('refX', '8');
    mk.setAttribute('refY', '4.5');
    mk.setAttribute('orient', 'auto');
    var poly = document.createElementNS(NS, 'path');
    poly.setAttribute('d', 'M0,0 L9,4.5 L0,9 z');
    poly.setAttribute('fill', '#0f172a');
    mk.appendChild(poly);
    defs.appendChild(mk);

    svg.insertBefore(defs, svg.firstChild);
  }

  function addPath(d, durationMs, delayMs, strokeColor, extraClass, markerId) {
    delayMs = delayMs || 0;
    strokeColor = strokeColor || FLOW;
    markerId = markerId || 'e2e-arr-flow';
    function run() {
      ensureDefs();
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', '2.35');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('class', 'e2e-arrow-path' + (extraClass ? ' ' + extraClass : ''));
      path.setAttribute('marker-end', 'url(#' + markerId + ')');
      svg.appendChild(path);
      try {
        var len = path.getTotalLength();
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        path.getBoundingClientRect();
        var dur = prefersReducedMotion() ? 0 : durationMs || 520;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            path.style.transition = 'stroke-dashoffset ' + dur + 'ms ' + PATH_EASE;
            path.style.strokeDashoffset = '0';
          });
        });
      } catch (e2) {
        path.style.strokeDasharray = 'none';
      }
    }
    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      run();
    }
  }

  function drawBidirPair(leftEl, rightEl) {
    if (!leftEl || !rightEl) return;
    syncSvgSize();
    var p = horizontalBidirPaths(leftEl, rightEl);
    addPath(p.towardRight, 440, 0, FLOW, 'e2e-arrow-bidir');
    addPath(p.towardLeft, 440, prefersReducedMotion() ? 0 : PAIR_STAGGER_MS, FLOW_ALT, 'e2e-arrow-bidir');
  }

  function clearArrows() {
    var paths = svg.querySelectorAll('path.e2e-arrow-path');
    for (var i = 0; i < paths.length; i++) {
      paths[i].parentNode.removeChild(paths[i]);
    }
  }

  function syncSvgSize() {
    var r = coordRoot.getBoundingClientRect();
    var w = Math.max(1, Math.ceil(r.width));
    var h = Math.max(1, Math.ceil(r.height));
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  }

  function drawConnector(justFinishedIndex) {
    if (justFinishedIndex < 1) return;
    syncSvgSize();

    var wf = $('e2e-wf-hub');
    var aem = $('e2e-aem');
    var gs = $('e2e-genstudio');
    var ajo = $('e2e-ajo');
    var cja = $('e2e-cja');
    var em = $('e2e-email');
    var de = $('e2e-decision');

    if (justFinishedIndex === 1) {
      drawBidirPair(aem, wf);
      return;
    }
    if (justFinishedIndex === 2) {
      drawBidirPair(wf, gs);
      return;
    }
    if (justFinishedIndex === 3) {
      if (wf && ajo) {
        addPath(pathWfToAjo(wf, ajo), 520);
      }
      return;
    }
    if (justFinishedIndex === 4) {
      if (ajo && em) {
        addPath(pathAjoToEmail(ajo, em), 520);
      }
      return;
    }
    if (justFinishedIndex === 5) {
      if (ajo && de) {
        addPath(pathAjoToDecision(ajo, de), 520);
      }
      return;
    }
    if (justFinishedIndex === 6) {
      if (cja && wf) {
        addPath(pathCjaToWf(cja, wf), 520, 0, FLOW, 'e2e-arrow-cja-wf');
      }
      return;
    }
  }

  function setAllNodesVisible(flag) {
    STEP_NODE_IDS.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (flag) el.classList.add('is-visible');
      else el.classList.remove('is-visible');
    });
  }

  function resetDiagram() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    stepIndex = 0;
    setAllNodesVisible(false);
    clearArrows();
    if (playBtn) playBtn.disabled = false;
  }

  function runStep() {
    if (stepIndex >= STEP_NODE_IDS.length) {
      timerId = null;
      if (playBtn) playBtn.disabled = false;
      return;
    }
    var id = STEP_NODE_IDS[stepIndex];
    var el = $(id);
    if (el) el.classList.add('is-visible');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        drawConnector(stepIndex);
        stepIndex += 1;
        timerId = setTimeout(runStep, getDelayMs());
      });
    });
  }

  function play() {
    resetDiagram();
    if (prefersReducedMotion()) {
      setAllNodesVisible(true);
      syncSvgSize();
      clearArrows();
      for (var j = 1; j < STEP_NODE_IDS.length; j++) {
        drawConnector(j);
      }
      stepIndex = STEP_NODE_IDS.length;
      return;
    }
    if (playBtn) playBtn.disabled = true;
    stepIndex = 0;
    runStep();
  }

  if (playBtn) playBtn.addEventListener('click', play);
  if (resetBtn) resetBtn.addEventListener('click', resetDiagram);

  window.addEventListener(
    'resize',
    function () {
      if (stepIndex <= 0) return;
      syncSvgSize();
      clearArrows();
      for (var i = 1; i < stepIndex; i++) {
        drawConnector(i);
      }
    },
    { passive: true }
  );

  syncSvgSize();

  if (prefersReducedMotion()) {
    setAllNodesVisible(true);
    syncSvgSize();
    clearArrows();
    for (var k = 1; k < STEP_NODE_IDS.length; k++) {
      drawConnector(k);
    }
    stepIndex = STEP_NODE_IDS.length;
  } else {
    play();
  }
})();
