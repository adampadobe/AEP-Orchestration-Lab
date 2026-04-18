/**
 * End-to-end Adobe integration: reveal nodes in order; draw connectors (Agentic-style stroke draw).
 */
(function () {
  'use strict';

  try {
    if (localStorage.getItem('aepNavHideInDev_architectureEndToEnd') === '1') return;
  } catch (e) {}

  var NS = 'http://www.w3.org/2000/svg';
  var wrap = document.getElementById('e2eDiagramWrap');
  var svg = document.getElementById('e2eArrowLayer');
  var playBtn = document.getElementById('e2ePlayBtn');
  var resetBtn = document.getElementById('e2eResetBtn');
  var delayInput = document.getElementById('e2eDelayMs');
  var delayLabel = document.getElementById('e2eDelayLabel');

  if (!wrap || !svg) return;

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

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e2) {}

  var timerId = null;
  var stepIndex = 0;

  function getDelayMs() {
    return delayInput ? parseInt(delayInput.value, 10) || 520 : 520;
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
    var c = wrap.getBoundingClientRect();
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

  function leftToRight(from, to) {
    var x1 = from.right;
    var y1 = from.cy;
    var x2 = to.left;
    var y2 = to.cy;
    var mid = (x1 + x2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + mid + ' ' + y1 + ' L ' + mid + ' ' + y2 + ' L ' + x2 + ' ' + y2;
  }

  function manhattanDown(from, to) {
    var x1 = from.cx;
    var y1 = from.bottom;
    var x2 = to.cx;
    var y2 = to.top;
    if (Math.abs(x1 - x2) < 4) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  function connectorPath(aEl, bEl) {
    var a = relRect(aEl);
    var b = relRect(bEl);
    if (b.top > a.bottom + 2) {
      return manhattanDown(a, b);
    }
    if (b.left > a.right + 2 || a.left > b.right + 2) {
      return leftToRight(a, b);
    }
    return manhattanDown(a, b);
  }

  function ensureDefs() {
    if (svg.querySelector('defs')) return;
    var defs = document.createElementNS(NS, 'defs');
    var mk = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', 'e2e-arr');
    mk.setAttribute('markerWidth', '8');
    mk.setAttribute('markerHeight', '8');
    mk.setAttribute('refX', '7');
    mk.setAttribute('refY', '4');
    mk.setAttribute('orient', 'auto');
    var poly = document.createElementNS(NS, 'path');
    poly.setAttribute('d', 'M0,0 L8,4 L0,8 z');
    poly.setAttribute('fill', 'currentColor');
    mk.appendChild(poly);
    defs.appendChild(mk);
    svg.insertBefore(defs, svg.firstChild);
  }

  function addPath(d, color, durationMs) {
    ensureDefs();
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('class', 'e2e-arrow-path');
    path.style.color = color;
    path.setAttribute('marker-end', 'url(#e2e-arr)');
    svg.appendChild(path);
    try {
      var len = path.getTotalLength();
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      path.getBoundingClientRect();
      requestAnimationFrame(function () {
        path.style.transition = 'stroke-dashoffset ' + (durationMs || 520) + 'ms ease';
        path.style.strokeDashoffset = '0';
      });
    } catch (e) {
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
    var r = wrap.getBoundingClientRect();
    svg.setAttribute('width', String(Math.ceil(r.width)));
    svg.setAttribute('height', String(Math.ceil(r.height)));
    svg.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height);
  }

  var EDGE_COLORS = ['#a5f3fc', '#fdba74', '#a5f3fc', '#d8b4fe', '#a5f3fc', '#fcd34d', '#6ee7b7'];

  function drawConnector(justFinishedIndex) {
    if (justFinishedIndex < 1) return;
    syncSvgSize();
    var fromEl = $(STEP_NODE_IDS[justFinishedIndex - 1]);
    var toEl = $(STEP_NODE_IDS[justFinishedIndex]);
    if (!fromEl || !toEl) return;
    var col = EDGE_COLORS[Math.min(justFinishedIndex - 1, EDGE_COLORS.length - 1)] || 'rgba(255,255,255,0.88)';
    addPath(connectorPath(fromEl, toEl), col, 480);
  }

  function setAllNodesVisible(flag) {
    STEP_NODE_IDS.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (flag) el.classList.add('is-visible');
      else el.classList.remove('is-visible');
    });
  }

  function redrawAllConnectors(maxStepIndexExclusive) {
    clearArrows();
    var max = Math.min(maxStepIndexExclusive - 1, STEP_NODE_IDS.length - 1);
    for (var j = 1; j <= max; j++) {
      drawConnector(j);
    }
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
    if (reduceMotion) {
      setAllNodesVisible(true);
      syncSvgSize();
      redrawAllConnectors(STEP_NODE_IDS.length);
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

  if (reduceMotion) {
    setAllNodesVisible(true);
    syncSvgSize();
    redrawAllConnectors(STEP_NODE_IDS.length);
    stepIndex = STEP_NODE_IDS.length;
  } else {
    play();
  }
})();
