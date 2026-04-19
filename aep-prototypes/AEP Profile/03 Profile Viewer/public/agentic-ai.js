/**
 * Animated Agentic AI architecture: reveal nodes in order, draw connectors.
 */
(function () {
  'use strict';

  try {
    if (localStorage.getItem('aepNavHideInDev_agenticLayerArchitecture') === '1') return;
  } catch (e) {}

  var NS = 'http://www.w3.org/2000/svg';
  var wrap = document.getElementById('diagramWrap');
  var board = document.getElementById('diagramBoard');
  var svg = document.getElementById('arrowLayer');
  var playBtn = document.getElementById('agenticPlayBtn');
  var resetBtn = document.getElementById('agenticResetBtn');
  var delayInput = document.getElementById('agenticDelayMs');
  var delayLabel = document.getElementById('agenticDelayLabel');

  if (!wrap || !board || !svg) return;

  var STEP_NODE_IDS = [
    'node-orch',
    'node-chat',
    'node-assistant',
    'node-prompt',
    'node-coordinator',
    'node-nonAgent',
    'node-agentExecutor',
    'node-planGenerator',
    'node-planExecutor',
    'node-agentExecution',
    'node-agent-brand',
    'node-agent-product',
    'node-agent-operational',
    'node-agent-field',
    'node-agent-audience',
    'node-agent-journey',
    'node-agent-data',
    'node-agent-support'
  ];

  var timerId = null;
  var stepIndex = 0;

  function getDelayMs() {
    return delayInput ? parseInt(delayInput.value, 10) || 550 : 550;
  }

  if (delayInput && delayLabel) {
    delayInput.addEventListener('input', function () {
      delayLabel.textContent = delayInput.value + ' ms';
    });
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
      cy: e.top - c.top + e.height / 2
    };
  }

  function manhattanDown(from, to) {
    var x1 = from.cx;
    var y1 = from.bottom;
    var x2 = to.cx;
    var y2 = to.top;
    if (Math.abs(x1 - x2) < 3) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  function manhattanUp(from, to) {
    var x1 = from.cx;
    var y1 = from.top;
    var x2 = to.cx;
    var y2 = to.bottom;
    if (Math.abs(x1 - x2) < 3) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  /** Lower box top edge up into higher box bottom (e.g. prompt reply to chat). */
  function upIntoAbove(lowerEl, higherEl) {
    var lo = relRect(lowerEl);
    var hi = relRect(higherEl);
    var x1 = lo.cx;
    var y1 = lo.top;
    var x2 = hi.cx;
    var y2 = hi.bottom;
    if (Math.abs(x1 - x2) < 3) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  /** From lower module up into coordinator (return path). */
  function upIntoCoordinator(lowerEl, coordEl) {
    return upIntoAbove(lowerEl, coordEl);
  }

  /** Prompt right edge → down → coordinator top (reference diagram). */
  function promptToCoordinator(promptEl, coordEl) {
    var p = relRect(promptEl);
    var k = relRect(coordEl);
    var x0 = p.right;
    var y0 = p.cy;
    var xTurn = Math.min(x0 + 28, k.cx - 8);
    var yEnd = k.top;
    return 'M ' + x0 + ' ' + y0 + ' L ' + xTurn + ' ' + y0 + ' L ' + xTurn + ' ' + yEnd;
  }

  function coordBottomToTop(coordEl, targetEl) {
    var c = relRect(coordEl);
    var t = relRect(targetEl);
    var x1 = c.cx;
    var y1 = c.bottom;
    var x2 = t.cx;
    var y2 = t.top;
    if (Math.abs(x1 - x2) < 4) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var mid = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + mid + ' L ' + x2 + ' ' + mid + ' L ' + x2 + ' ' + y2;
  }

  function leftToRight(fromEl, toEl) {
    var a = relRect(fromEl);
    var b = relRect(toEl);
    var x1 = a.right;
    var y1 = a.cy;
    var x2 = b.left;
    var y2 = b.cy;
    var mid = (x1 + x2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + mid + ' ' + y1 + ' L ' + mid + ' ' + y2 + ' L ' + x2 + ' ' + y2;
  }

  function zoneToAgent(zoneEl, agentEl) {
    var z = relRect(zoneEl);
    var a = relRect(agentEl);
    var x1 = z.cx;
    var y1 = z.bottom;
    var x2 = a.cx;
    var y2 = a.top;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
  }

  function ensureDefs() {
    if (svg.querySelector('defs')) return;
    var defs = document.createElementNS(NS, 'defs');
    var mk = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', 'agentic-arr');
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
    path.setAttribute('class', 'agentic-arrow-path');
    path.style.color = color;
    path.setAttribute('marker-end', 'url(#agentic-arr)');
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
    var paths = svg.querySelectorAll('path.agentic-arrow-path');
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

  function $(id) {
    return document.getElementById(id);
  }

  /**
   * After step index (0-based) completes, draw arrows that unlock at this step.
   * Step indices align with STEP_NODE_IDS: e.g. index 2 = assistant just revealed.
   */
  function drawArrowsForStep(justFinishedIndex) {
    syncSvgSize();
    var assistant = $('node-assistant');
    var chat = $('node-chat');
    var prompt = $('node-prompt');
    var coord = $('node-coordinator');
    var nonA = $('node-nonAgent');
    var aex = $('node-agentExecutor');
    var planG = $('node-planGenerator');
    var planE = $('node-planExecutor');
    var zone = $('node-agentExecution');

    var white = 'rgba(255,255,255,0.88)';
    var red = '#f87171';
    var yellow = '#facc15';

    if (justFinishedIndex === 2 && assistant && chat) {
      addPath(manhattanDown(relRect(assistant), relRect(chat)), white, 480);
      addPath(manhattanUp(relRect(assistant), relRect(chat)), white, 480);
    }
    if (justFinishedIndex === 3 && chat && prompt) {
      addPath(manhattanDown(relRect(chat), relRect(prompt)), white, 500);
      addPath(upIntoAbove(prompt, chat), white, 500);
    }
    if (justFinishedIndex === 4 && prompt && coord) {
      addPath(promptToCoordinator(prompt, coord), white, 550);
    }
    if (justFinishedIndex === 5 && coord && nonA) {
      addPath(coordBottomToTop(coord, nonA), white, 450);
      addPath(upIntoCoordinator(nonA, coord), red, 450);
    }
    if (justFinishedIndex === 6 && coord && aex) {
      addPath(coordBottomToTop(coord, aex), white, 450);
    }
    if (justFinishedIndex === 7 && coord && planG) {
      addPath(coordBottomToTop(coord, planG), white, 450);
    }
    if (justFinishedIndex === 8 && planG && planE) {
      addPath(leftToRight(planG, planE), yellow, 420);
    }
    if (justFinishedIndex === 9 && zone) {
      if (aex) addPath(coordBottomToTop(aex, zone), white, 500);
      if (planE) addPath(coordBottomToTop(planE, zone), white, 500);
    }
    if (justFinishedIndex >= 10 && zone) {
      var agentIds = [
        'node-agent-brand',
        'node-agent-product',
        'node-agent-operational',
        'node-agent-field',
        'node-agent-audience',
        'node-agent-journey',
        'node-agent-data',
        'node-agent-support'
      ];
      var ai = justFinishedIndex - 10;
      if (ai >= 0 && ai < agentIds.length) {
        var ag = $(agentIds[ai]);
        if (ag) addPath(zoneToAgent(zone, ag), '#e879f9', 400);
      }
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
        drawArrowsForStep(stepIndex);
        stepIndex += 1;
        timerId = setTimeout(runStep, getDelayMs());
      });
    });
  }

  function play() {
    resetDiagram();
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
      var max = stepIndex > 0 ? stepIndex - 1 : -1;
      clearArrows();
      for (var i = 0; i <= max; i++) {
        drawArrowsForStep(i);
      }
    },
    { passive: true }
  );

  syncSvgSize();
})();
