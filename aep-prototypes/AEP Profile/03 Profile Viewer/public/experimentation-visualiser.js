/**
 * Experimentation visualiser — count-up for path pills + click counters; Winner above B’s total when all targets reached.
 */
(function () {
  var DURATION_MS = 4800;
  var TARGETS = {
    pillTotal: 108089,
    pillA: 10618,
    pillB: 62453,
    pillC: 35018,
    counterA: 5000,
    counterB: 25000,
    counterC: 15000,
  };

  var els = {
    pillTotal: document.getElementById('exp-pill-total'),
    pillA: document.getElementById('exp-pill-a'),
    pillB: document.getElementById('exp-pill-b'),
    pillC: document.getElementById('exp-pill-c'),
    counterA: document.getElementById('exp-counter-a'),
    counterB: document.getElementById('exp-counter-b'),
    counterC: document.getElementById('exp-counter-c'),
    badge: document.getElementById('exp-flow-b-badge'),
    winnerGroup: document.getElementById('exp-treatment-b'),
    live: document.getElementById('expFlowLive'),
    replay: document.getElementById('expFlowReplay'),
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rafId = null;
  var startTs = 0;

  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function announce(msg) {
    if (els.live) els.live.textContent = msg;
  }

  function setWinnerState(on) {
    if (els.winnerGroup) els.winnerGroup.classList.toggle('exp-flow-treatment--winner', !!on);
    if (els.badge) {
      els.badge.textContent = on ? 'Winner' : '';
      els.badge.classList.toggle('exp-flow-winner-badge--visible', !!on);
    }
    if (on) announce('All click targets reached. Treatment B is the Winner.');
  }

  function setFinalNumbers() {
    if (els.pillTotal) els.pillTotal.textContent = fmt(TARGETS.pillTotal);
    if (els.pillA) els.pillA.textContent = fmt(TARGETS.pillA);
    if (els.pillB) els.pillB.textContent = fmt(TARGETS.pillB);
    if (els.pillC) els.pillC.textContent = fmt(TARGETS.pillC);
    if (els.counterA) els.counterA.textContent = fmt(TARGETS.counterA);
    if (els.counterB) els.counterB.textContent = fmt(TARGETS.counterB);
    if (els.counterC) els.counterC.textContent = fmt(TARGETS.counterC);
  }

  function resetNumbers() {
    ['pillTotal', 'pillA', 'pillB', 'pillC', 'counterA', 'counterB', 'counterC'].forEach(function (k) {
      if (els[k]) els[k].textContent = '0';
    });
    setWinnerState(false);
  }

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function tick(now) {
    if (!startTs) startTs = now;
    var t = Math.min(1, (now - startTs) / DURATION_MS);
    var e = easeOutQuad(t);

    if (els.pillTotal) els.pillTotal.textContent = fmt(TARGETS.pillTotal * e);
    if (els.pillA) els.pillA.textContent = fmt(TARGETS.pillA * e);
    if (els.pillB) els.pillB.textContent = fmt(TARGETS.pillB * e);
    if (els.pillC) els.pillC.textContent = fmt(TARGETS.pillC * e);
    if (els.counterA) els.counterA.textContent = fmt(TARGETS.counterA * e);
    if (els.counterB) els.counterB.textContent = fmt(TARGETS.counterB * e);
    if (els.counterC) els.counterC.textContent = fmt(TARGETS.counterC * e);

    if (t < 1) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      setFinalNumbers();
      setWinnerState(true);
      rafId = null;
      startTs = 0;
    }
  }

  function run() {
    window.cancelAnimationFrame(rafId);
    rafId = null;
    startTs = 0;
    resetNumbers();
    if (reduceMotion) {
      setFinalNumbers();
      setWinnerState(true);
      return;
    }
    announce('Counting up allocations and clicks.');
    rafId = window.requestAnimationFrame(tick);
  }

  if (els.replay) {
    els.replay.addEventListener('click', function () {
      run();
      announce('Replay: counters reset.');
    });
  }

  if (document.querySelector('.exp-flow-viz')) {
    run();
  }
})();

/**
 * Email A/B subject demo — donut click % to 80 / 20; Subject A marked Winner.
 */
(function () {
  var DURATION_MS = 4200;
  var TARGET_PCT_A = 80;
  var TARGET_PCT_B = 20;

  var els = {
    arcA: document.getElementById('expEmailDonutArcA'),
    arcB: document.getElementById('expEmailDonutArcB'),
    pctA: document.getElementById('expEmailPctA'),
    pctB: document.getElementById('expEmailPctB'),
    colA: document.getElementById('expEmailDonutColA'),
    subjectA: document.getElementById('expEmailSubjectBlockA'),
    pill: document.getElementById('expEmailWinnerPill'),
    live: document.getElementById('expEmailLive'),
    replay: document.getElementById('expEmailReplay'),
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rafId = null;
  var startTs = 0;

  function announce(msg) {
    if (els.live) els.live.textContent = msg;
  }

  function setArcPct(el, pct) {
    if (!el) return;
    var p = Math.max(0, Math.min(100, pct));
    el.setAttribute('stroke-dasharray', p + ' 100');
  }

  function setWinner(on) {
    if (els.colA) els.colA.classList.toggle('exp-email-donut-col--winner', !!on);
    if (els.subjectA) els.subjectA.classList.toggle('exp-email-subject-field--winner', !!on);
    if (els.pill) els.pill.classList.toggle('exp-email-winner-pill--visible', !!on);
    if (on) announce('Click shares updated. Subject A is the Winner.');
  }

  function setFinal() {
    setArcPct(els.arcA, TARGET_PCT_A);
    setArcPct(els.arcB, TARGET_PCT_B);
    if (els.pctA) els.pctA.textContent = TARGET_PCT_A + '%';
    if (els.pctB) els.pctB.textContent = TARGET_PCT_B + '%';
  }

  function reset() {
    setArcPct(els.arcA, 0);
    setArcPct(els.arcB, 0);
    if (els.pctA) els.pctA.textContent = '0%';
    if (els.pctB) els.pctB.textContent = '0%';
    setWinner(false);
  }

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function tick(now) {
    if (!startTs) startTs = now;
    var t = Math.min(1, (now - startTs) / DURATION_MS);
    var e = easeOutQuad(t);
    var a = TARGET_PCT_A * e;
    var b = TARGET_PCT_B * e;
    setArcPct(els.arcA, a);
    setArcPct(els.arcB, b);
    if (els.pctA) els.pctA.textContent = Math.round(a) + '%';
    if (els.pctB) els.pctB.textContent = Math.round(b) + '%';

    if (t < 1) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      setFinal();
      setWinner(true);
      rafId = null;
      startTs = 0;
    }
  }

  function run() {
    window.cancelAnimationFrame(rafId);
    rafId = null;
    startTs = 0;
    reset();
    if (reduceMotion) {
      setFinal();
      setWinner(true);
      return;
    }
    announce('Animating click share for Email A and Email B.');
    rafId = window.requestAnimationFrame(tick);
  }

  if (els.replay) {
    els.replay.addEventListener('click', function () {
      run();
      announce('Replay: email chart reset.');
    });
  }

  document.querySelectorAll('.exp-email-preview-img').forEach(function (img) {
    img.addEventListener('error', function () {
      var frame = img.closest('.exp-email-preview-frame');
      if (frame) frame.classList.add('exp-email-preview-frame--fallback');
    });
  });

  if (document.querySelector('.exp-email-viz')) {
    run();
  }
})();
