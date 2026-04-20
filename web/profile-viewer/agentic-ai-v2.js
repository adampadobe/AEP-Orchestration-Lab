/**
 * Agentic AI v2 — same animation flow as v1, unique DOM ids.
 * Connectors stay in gutters: endpoints inset from box edges; bidirectional pairs use parallel X offsets.
 */
(function () {
  'use strict';

  try {
    if (localStorage.getItem('aepNavHideInDev_agenticLayerArchitectureV2') === '1') return;
  } catch (e) {}

  var NS = 'http://www.w3.org/2000/svg';
  /** Coordinate system for nodes + SVG (must match where #arrowLayerV2 lives) */
  var coordRoot = document.getElementById('diagramBoardV2');
  var svg = document.getElementById('arrowLayerV2');
  var playBtn = document.getElementById('agenticV2PlayBtn');
  var stepBtn = document.getElementById('agenticV2StepBtn');
  var resetBtn = document.getElementById('agenticV2ResetBtn');
  var delayInput = document.getElementById('agenticV2DelayMs');
  var delayLabel = document.getElementById('agenticV2DelayLabel');
  var diagramWrap = document.getElementById('diagramWrapV2');
  var diagramScale = document.getElementById('diagramScaleV2');
  var mainPageEl = document.querySelector('main.dashboard-main.app-page');

  /** Inset from rect edges so strokes and markers sit in the gap, not on card faces */
  var EDGE_PAD = 15;
  /** Horizontal separation between two parallel bidirectional paths (left=down, right=up) */
  var BIDIR_OFFSET = 14;
  /** Offset so Non Agent return (orange) does not paint on top of the green coord→Non Agent down stroke */
  var RETURN_OFFSET_X = 12;

  if (!coordRoot || !svg) return;

  /**
   * Narrative reveal order (matches v1 / product story).
   * 1 Orchestrator → 2 Chat → 3 Assistant → 4 Prompt → 5 Coordinator → 6 Non Agent → 7–9 executors/plan
   * → 10 Agent Execution → 11–18 specialist agents. drawArrowsForStep(justFinishedIndex) follows this array.
   */
  var STEP_NODE_IDS = [
    'node-orch-v2',
    'node-chat-v2',
    'node-assistant-v2',
    'node-prompt-v2',
    'node-coordinator-v2',
    'node-nonAgent-v2',
    'node-agentExecutor-v2',
    'node-planGenerator-v2',
    'node-planExecutor-v2',
    'node-agentExecution-v2',
    'node-agent-brand-v2',
    'node-agent-product-v2',
    'node-agent-operational-v2',
    'node-agent-field-v2',
    'node-agent-audience-v2',
    'node-agent-journey-v2',
    'node-agent-data-v2',
    'node-agent-support-v2'
  ];

  var timerId = null;
  var stepIndex = 0;

  function getDelayMs() {
    return delayInput ? parseInt(delayInput.value, 10) || 700 : 700;
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
      cy: e.top - c.top + e.height / 2
    };
  }

  /** Shared X in the horizontal overlap of two rects (fallback: average cx) */
  function anchorXBetweenRects(a, b) {
    var lo = Math.max(a.left, b.left);
    var hi = Math.min(a.right, b.right);
    if (hi > lo + 4) return (lo + hi) / 2;
    return (a.cx + b.cx) / 2;
  }

  /**
   * Straight vertical bidirectional pair (no horizontal jog).
   * Left stroke: down (toward lower box). Right stroke: up (toward upper box).
   */
  /** Order by screen position so callers are not sensitive to DOM order. */
  function verticalBidirStraight(rectA, rectB, xCenter) {
    var upper = rectA.top <= rectB.top ? rectA : rectB;
    var lower = rectA.top <= rectB.top ? rectB : rectA;
    var half = BIDIR_OFFSET / 2;
    var xL = xCenter - half;
    var xR = xCenter + half;
    var y1 = upper.bottom + EDGE_PAD;
    var y2 = lower.top - EDGE_PAD;
    if (!(y2 > y1 + 2)) return null;
    return {
      down: 'M ' + xL + ' ' + y1 + ' L ' + xL + ' ' + y2,
      up: 'M ' + xR + ' ' + y2 + ' L ' + xR + ' ' + y1
    };
  }

  /** Chat ↔ Prompt: vertical lines hugging the left side of the Prompt box */
  function verticalBidirChatPromptLeft(chatRect, promptRect) {
    var upper = chatRect.top <= promptRect.top ? chatRect : promptRect;
    var lower = chatRect.top <= promptRect.top ? promptRect : chatRect;
    var xL = promptRect.left + 10;
    var xR = xL + BIDIR_OFFSET;
    var y1 = upper.bottom + EDGE_PAD;
    var y2 = lower.top - EDGE_PAD;
    if (!(y2 > y1 + 2)) return null;
    return {
      down: 'M ' + xL + ' ' + y1 + ' L ' + xL + ' ' + y2,
      up: 'M ' + xR + ' ' + y2 + ' L ' + xR + ' ' + y1
    };
  }

  /** Plan Generator → Plan Executor: single horizontal segment (reference sketch). */
  function leftToRight(fromEl, toEl) {
    var a = relRect(fromEl);
    var b = relRect(toEl);
    var x1 = a.right + EDGE_PAD;
    var x2 = b.left - EDGE_PAD;
    var y = (a.cy + b.cy) / 2;
    return 'M ' + x1 + ' ' + y + ' L ' + x2 + ' ' + y;
  }

  function zoneToAgent(zoneEl, agentEl) {
    var z = relRect(zoneEl);
    var a = relRect(agentEl);
    var x1 = z.cx;
    var y1 = z.bottom + EDGE_PAD;
    var x2 = a.cx;
    var y2 = a.top - EDGE_PAD;
    if (Math.abs(x1 - x2) < 3) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = (y1 + y2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  /** Single downward vertical, centered between Prompt and Coordinator */
  function promptVerticalDownCentered(promptEl, coordEl) {
    var p = relRect(promptEl);
    var k = relRect(coordEl);
    var x = (p.cx + k.cx) / 2;
    var y1 = p.bottom + EDGE_PAD;
    var y2 = k.top - EDGE_PAD;
    if (y2 <= y1 + 2) return null;
    return 'M ' + x + ' ' + y1 + ' L ' + x + ' ' + y2;
  }

  /**
   * Coordinator → each mid cell: one vertical down per column (reference: four separate drops).
   */
  function coordinatorToMidRowVerticals(coordEl, nonEl, aexEl, planGEl, planEEl) {
    var c = relRect(coordEl);
    var cells = [nonEl, aexEl, planGEl, planEEl];
    var y0 = c.bottom + EDGE_PAD;
    var paths = [];
    for (var i = 0; i < cells.length; i++) {
      var r = relRect(cells[i]);
      var y1 = r.top - EDGE_PAD;
      if (y1 > y0 + 2) {
        paths.push('M ' + r.cx + ' ' + y0 + ' L ' + r.cx + ' ' + y1);
      }
    }
    return paths;
  }

  /**
   * Agent Executor & Plan Executor → Agent Execution: one vertical down each (reference sketch).
   */
  function planExecutorsToZoneVerticals(aexEl, planEEl, zoneEl) {
    var z = relRect(zoneEl);
    var yZ = z.top - EDGE_PAD;
    var paths = [];
    [aexEl, planEEl].forEach(function (el) {
      var r = relRect(el);
      var y0 = r.bottom + EDGE_PAD;
      if (yZ > y0 + 2) {
        paths.push('M ' + r.cx + ' ' + y0 + ' L ' + r.cx + ' ' + yZ);
      }
    });
    return paths;
  }

  /** Non Agent Query → Coordinator: straight up, offset so it does not cover the green coord→Non Agent down stroke */
  function nonAgentReturnUp(nonEl, coordEl) {
    var lo = relRect(nonEl);
    var co = relRect(coordEl);
    var x = lo.cx + RETURN_OFFSET_X;
    var yLo = lo.top - EDGE_PAD;
    var yHi = co.bottom + EDGE_PAD;
    if (!(yLo > yHi + 2)) return null;
    return 'M ' + x + ' ' + yLo + ' L ' + x + ' ' + yHi;
  }

  function ensureDefs() {
    if (svg.querySelector('defs')) return;
    var defs = document.createElementNS(NS, 'defs');
    var mk = document.createElementNS(NS, 'marker');
    mk.setAttribute('id', 'agentic-arr-v2-dark');
    mk.setAttribute('markerWidth', '5');
    mk.setAttribute('markerHeight', '5');
    mk.setAttribute('refX', '4.5');
    mk.setAttribute('refY', '2.5');
    mk.setAttribute('orient', 'auto');
    var poly = document.createElementNS(NS, 'path');
    poly.setAttribute('d', 'M0,0 L5,2.5 L0,5 z');
    poly.setAttribute('fill', '#0f172a');
    mk.appendChild(poly);
    defs.appendChild(mk);
    svg.insertBefore(defs, svg.firstChild);
  }

  var PATH_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
  /** Tighter stagger so paired bidirectional traces feel like one gesture */
  var PAIR_STAGGER_MS = 100;
  /** Extra ms after each step so path draw can finish before the next card appears (slider is the base pause). */
  var STEP_AFTER_DRAW_MS = 140;

  function addPath(d, color, durationMs, delayMs, markerId, omitMarkerEnd, extraClass) {
    delayMs = delayMs || 0;
    markerId = markerId || 'agentic-arr-v2-dark';
    function run() {
      ensureDefs();
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '2.35');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute(
        'class',
        extraClass ? 'agentic-v2-arrow-path ' + extraClass : 'agentic-v2-arrow-path'
      );
      if (!omitMarkerEnd) {
        path.setAttribute('marker-end', 'url(#' + markerId + ')');
      }
      svg.appendChild(path);
      try {
        var len = path.getTotalLength();
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        path.getBoundingClientRect();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var dur = prefersReducedMotion() ? 0 : durationMs || 520;
            path.style.transition = 'stroke-dashoffset ' + dur + 'ms ' + PATH_EASE;
            path.style.strokeDashoffset = '0';
          });
        });
      } catch (e) {
        path.style.strokeDasharray = 'none';
      }
    }
    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      run();
    }
  }

  function clearArrows() {
    var paths = svg.querySelectorAll('path.agentic-v2-arrow-path');
    for (var i = 0; i < paths.length; i++) {
      paths[i].parentNode.removeChild(paths[i]);
    }
  }

  function removeAssistantChatArrows() {
    var paths = svg.querySelectorAll('path.agentic-v2-arrow-assistant-chat');
    for (var i = 0; i < paths.length; i++) {
      paths[i].parentNode.removeChild(paths[i]);
    }
  }

  /**
   * Chat moves when the orchestrator body grows; refresh this pair without redrawing everything.
   */
  function redrawAssistantChatArrows(animated) {
    var assistant = $('node-assistant-v2');
    var chat = $('node-chat-v2');
    if (!assistant || !chat || !assistant.classList.contains('is-visible') || !chat.classList.contains('is-visible')) {
      return;
    }
    var flow = '#2d9d6c';
    var flowAlt = '#3d9d72';
    var dur = animated ? 560 : 0;
    var stagger = animated ? PAIR_STAGGER_MS : 0;
    removeAssistantChatArrows();
    syncSvgSize();
    var ra = relRect(assistant);
    var rc = relRect(chat);
    var ax = anchorXBetweenRects(ra, rc);
    var pairA = verticalBidirStraight(ra, rc, ax);
    if (pairA) {
      addPath(pairA.down, flow, dur, 0, 'agentic-arr-v2-dark', false, 'agentic-v2-arrow-assistant-chat');
      addPath(pairA.up, flowAlt, dur, stagger, 'agentic-arr-v2-dark', false, 'agentic-v2-arrow-assistant-chat');
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

  var fsScaleTimer = null;
  function debouncedScaleAndRedrawArrows() {
    if (fsScaleTimer) clearTimeout(fsScaleTimer);
    fsScaleTimer = setTimeout(function () {
      fsScaleTimer = null;
      syncAgenticFullscreenScale();
      if (stepIndex <= 0) return;
      var max = stepIndex > 0 ? stepIndex - 1 : -1;
      clearArrows();
      for (var i = 0; i <= max; i++) {
        drawArrowsForStep(i);
      }
    }, 50);
  }

  function clearAgenticFsBoardStyles() {
    var board = coordRoot;
    if (!board) return;
    board.style.zoom = '';
    board.style.transform = '';
    board.style.transformOrigin = '';
    if (diagramScale) {
      diagramScale.style.height = '';
      diagramScale.style.minHeight = '';
      diagramScale.style.overflow = '';
    }
  }

  /**
   * In presentation fullscreen, shrink the diagram (zoom / scale) so it fits the viewport without scrolling.
   * Runs synchronously — call after layout (e.g. double rAF after toggling nodes) so arrow geometry matches the scaled board.
   */
  function syncAgenticFullscreenScale() {
    var board = coordRoot;
    if (!board || !diagramWrap) return;
    var fs = mainPageEl && mainPageEl.classList.contains('arch-main--presentation-fs');
    if (!fs) {
      clearAgenticFsBoardStyles();
      syncSvgSize();
      return;
    }

    clearAgenticFsBoardStyles();
    void board.offsetHeight;
    var nh = board.offsetHeight;
    var nw = board.offsetWidth;
    if (nh < 2 || nw < 2) {
      syncSvgSize();
      return;
    }
    var pad = 16;
    var availBox = diagramScale || diagramWrap;
    var availH = Math.max(80, availBox.clientHeight - pad);
    var availW = Math.max(80, availBox.clientWidth - pad);
    var s = Math.min(1, availH / nh, availW / nw);
    /* Chromium supports CSS zoom; Firefox/Safari fall back to transform (layout height adjusted on #diagramScaleV2). */
    if ('zoom' in board.style) {
      board.style.zoom = s === 1 ? '' : String(s);
      board.style.transform = '';
    } else {
      board.style.zoom = '';
      board.style.transform = s === 1 ? '' : 'scale(' + s + ')';
      board.style.transformOrigin = 'top center';
      if (diagramScale && s < 1) {
        diagramScale.style.height = nh * s + 'px';
        diagramScale.style.overflow = 'hidden';
      }
    }
    syncSvgSize();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function initTalkTrackTooltips() {
    var tooltip = document.createElement('div');
    var activeTarget = null;
    var margin = 10;
    var gap = 10;

    tooltip.className = 'agentic-v2-talk-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);

    function targetFrom(node) {
      if (!node || typeof node.closest !== 'function') return null;
      return node.closest('.agentic-v2-talk-target[data-talk-track]');
    }

    function positionTooltip(target) {
      if (!target) return;
      var rect = target.getBoundingClientRect();
      var tRect = tooltip.getBoundingClientRect();
      var left = rect.left + (rect.width - tRect.width) / 2;
      var top = rect.top - tRect.height - gap;

      if (left < margin) left = margin;
      if (left + tRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tRect.width - margin;
      }
      if (top < margin) {
        top = rect.bottom + gap;
      }
      if (top + tRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - tRect.height - margin);
      }

      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }

    function showTooltip(target) {
      var message = target ? target.getAttribute('data-talk-track') : '';
      if (!message) return;
      activeTarget = target;
      tooltip.textContent = message;
      tooltip.classList.add('is-visible');
      positionTooltip(target);
    }

    function hideTooltip() {
      activeTarget = null;
      tooltip.classList.remove('is-visible');
    }

    document.addEventListener('mouseover', function (e) {
      var target = targetFrom(e.target);
      if (!target) return;
      showTooltip(target);
    });

    document.addEventListener('mouseout', function (e) {
      var fromTarget = targetFrom(e.target);
      if (!fromTarget) return;
      var toTarget = targetFrom(e.relatedTarget);
      if (toTarget === fromTarget) return;
      hideTooltip();
    });

    document.addEventListener('focusin', function (e) {
      var target = targetFrom(e.target);
      if (target) showTooltip(target);
    });

    document.addEventListener('focusout', function (e) {
      var fromTarget = targetFrom(e.target);
      if (!fromTarget) return;
      var toTarget = targetFrom(e.relatedTarget);
      if (toTarget === fromTarget) return;
      hideTooltip();
    });

    window.addEventListener('resize', function () {
      if (activeTarget) positionTooltip(activeTarget);
    });

    window.addEventListener(
      'scroll',
      function () {
        if (activeTarget) positionTooltip(activeTarget);
      },
      true
    );
  }

  function drawArrowsForStep(justFinishedIndex) {
    syncSvgSize();
    var assistant = $('node-assistant-v2');
    var chat = $('node-chat-v2');
    var prompt = $('node-prompt-v2');
    var coord = $('node-coordinator-v2');
    var nonA = $('node-nonAgent-v2');
    var aex = $('node-agentExecutor-v2');
    var planG = $('node-planGenerator-v2');
    var planE = $('node-planExecutor-v2');
    var zone = $('node-agentExecution-v2');

    var flow = '#2d9d6c';
    var flowAlt = '#3d9d72';
    /* Ochre / violet accents align with mid-row banner palette */
    var accentReturn = '#ea580c';
    var planLink = '#ca8a04';
    var zoneAgentColor = '#7c3aed';

    var ra = assistant ? relRect(assistant) : null;
    var rc = chat ? relRect(chat) : null;
    var rp = prompt ? relRect(prompt) : null;

    /* AI Assistant ↔ CHAT SERVICE: parallel verticals (after Assistant is revealed, index 2) */
    if (justFinishedIndex === 2 && assistant && chat) {
      var ax = anchorXBetweenRects(ra, rc);
      var pairA = verticalBidirStraight(ra, rc, ax);
      if (pairA) {
        addPath(pairA.down, flow, 560, 0, 'agentic-arr-v2-dark', false, 'agentic-v2-arrow-assistant-chat');
        addPath(pairA.up, flowAlt, 560, PAIR_STAGGER_MS, 'agentic-arr-v2-dark', false, 'agentic-v2-arrow-assistant-chat');
      }
    }
    /* CHAT SERVICE ↔ Prompt: straight verticals along left side of Prompt */
    if (justFinishedIndex === 3 && chat && prompt) {
      var pairC = verticalBidirChatPromptLeft(rc, rp);
      if (pairC) {
        addPath(pairC.down, flow, 580, 0);
        addPath(pairC.up, flowAlt, 580, PAIR_STAGGER_MS);
      }
    }
    /* Prompt → Coordinator: single downward arrow, centered */
    if (justFinishedIndex === 4 && prompt && coord) {
      var pr = promptVerticalDownCentered(prompt, coord);
      if (pr) addPath(pr, flow, 580, 0);
    }
    /* Non Agent Query → Coordinator: single upward return (offset from green down stroke) */
    if (justFinishedIndex === 5 && coord && nonA) {
      var retUp = nonAgentReturnUp(nonA, coord);
      if (retUp) addPath(retUp, accentReturn, 500, 0);
    }
    /* Coordinator → four mid cells: one vertical per column; then Plan Generator → Plan Executor */
    if (justFinishedIndex === 8 && coord && nonA && aex && planG && planE) {
      var downs = coordinatorToMidRowVerticals(coord, nonA, aex, planG, planE);
      for (var bi = 0; bi < downs.length; bi++) {
        addPath(downs[bi], flow, 480, bi * 75);
      }
      addPath(leftToRight(planG, planE), planLink, 450, downs.length * 75 + 60);
    }
    /* Agent Executor & Plan Executor → Agent Execution: one vertical each */
    if (justFinishedIndex === 9 && zone && aex && planE) {
      var dz = planExecutorsToZoneVerticals(aex, planE, zone);
      for (var zi = 0; zi < dz.length; zi++) {
        addPath(dz[zi], flow, 520, zi * 80);
      }
    }
    if (justFinishedIndex >= 10 && zone) {
      var agentIds = [
        'node-agent-brand-v2',
        'node-agent-product-v2',
        'node-agent-operational-v2',
        'node-agent-field-v2',
        'node-agent-audience-v2',
        'node-agent-journey-v2',
        'node-agent-data-v2',
        'node-agent-support-v2'
      ];
      var ai = justFinishedIndex - 10;
      if (ai >= 0 && ai < agentIds.length) {
        var ag = $(agentIds[ai]);
        if (ag) addPath(zoneToAgent(zone, ag), zoneAgentColor, 440);
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

  function cancelAutoAdvance() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (playBtn) playBtn.disabled = false;
  }

  function syncStepControls() {
    var atEnd = stepIndex >= STEP_NODE_IDS.length;
    if (stepBtn) stepBtn.disabled = atEnd;
  }

  function resetDiagram() {
    cancelAutoAdvance();
    stepIndex = 0;
    setAllNodesVisible(false);
    clearArrows();
    syncStepControls();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        syncAgenticFullscreenScale();
      });
    });
  }

  /**
   * @param {boolean} autoContinue - if true, schedule next step after delay (Play); if false, one step only (Step)
   */
  function runStep(autoContinue) {
    if (stepIndex >= STEP_NODE_IDS.length) {
      cancelAutoAdvance();
      syncStepControls();
      return;
    }
    var current = stepIndex;
    var id = STEP_NODE_IDS[current];
    var el = $(id);
    if (el) el.classList.add('is-visible');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        syncAgenticFullscreenScale();
        drawArrowsForStep(current);
        if (current > 2) {
          setTimeout(function () {
            redrawAssistantChatArrows(false);
          }, 48);
        }
        stepIndex = current + 1;
        syncStepControls();
        if (autoContinue && stepIndex < STEP_NODE_IDS.length) {
          timerId = setTimeout(function () {
            runStep(true);
          }, getDelayMs() + STEP_AFTER_DRAW_MS);
        } else {
          cancelAutoAdvance();
        }
      });
    });
  }

  function play() {
    resetDiagram();
    if (playBtn) playBtn.disabled = true;
    runStep(true);
  }

  function stepOnce() {
    cancelAutoAdvance();
    if (stepIndex >= STEP_NODE_IDS.length) return;
    runStep(false);
  }

  if (playBtn) playBtn.addEventListener('click', play);
  if (stepBtn) stepBtn.addEventListener('click', stepOnce);
  if (resetBtn) resetBtn.addEventListener('click', resetDiagram);
  initTalkTrackTooltips();

  window.addEventListener('resize', debouncedScaleAndRedrawArrows, { passive: true });

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
    document.addEventListener(ev, debouncedScaleAndRedrawArrows);
  });

  syncSvgSize();
  syncStepControls();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      syncAgenticFullscreenScale();
    });
  });
})();
