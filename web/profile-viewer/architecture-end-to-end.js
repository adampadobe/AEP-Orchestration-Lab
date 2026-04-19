/**
 * End-to-end Adobe flow — light cards (Agentic v2–style geometry + green connectors).
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

  var STEP_NODE_IDS = [
    'e2e-wf1',
    'e2e-aem',
    'e2e-wf2',
    'e2e-genstudio',
    'e2e-wf3',
    'e2e-split',
    'e2e-email',
    'e2e-decision',
  ];

  var EDGE_PAD = 15;
  var FLOW = '#2d9d6c';
  var PATH_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

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

  function leftToRightPath(a, b) {
    var x1 = a.right + EDGE_PAD;
    var x2 = b.left - EDGE_PAD;
    var y = (a.cy + b.cy) / 2;
    return 'M ' + x1 + ' ' + y + ' L ' + x2 + ' ' + y;
  }

  function verticalDownPath(from, to) {
    var x1 = from.cx;
    var y1 = from.bottom + EDGE_PAD;
    var x2 = to.cx;
    var y2 = to.top - EDGE_PAD;
    if (Math.abs(x1 - x2) < 4) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  function connectorBetween(fromEl, toEl) {
    var a = relRect(fromEl);
    var b = relRect(toEl);
    if (b.top > a.bottom + 3) {
      return verticalDownPath(a, b);
    }
    return leftToRightPath(a, b);
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

  function addPath(d, durationMs) {
    ensureDefs();
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', FLOW);
    path.setAttribute('stroke-width', '2.35');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('class', 'e2e-arrow-path');
    path.setAttribute('marker-end', 'url(#e2e-arr-flow)');
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
    var fromEl = $(STEP_NODE_IDS[justFinishedIndex - 1]);
    var toEl = $(STEP_NODE_IDS[justFinishedIndex]);
    if (!fromEl || !toEl) return;
    addPath(connectorBetween(fromEl, toEl), 480);
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
