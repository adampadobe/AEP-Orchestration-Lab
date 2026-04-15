/**
 * Experimentation visualiser — winner highlight + replay (allocation flow animation).
 */
(function () {
  var WIN_MS = 6500;
  var root = document.querySelector('.exp-flow-viz');
  var replayBtn = document.getElementById('expFlowReplay');
  var winnerGroup = document.getElementById('exp-treatment-b');
  var live = document.getElementById('expFlowLive');

  function announce(msg) {
    if (live) {
      live.textContent = msg;
    }
  }

  function setWinner(on) {
    if (!winnerGroup) return;
    winnerGroup.classList.toggle('exp-flow-treatment--winner', !!on);
    if (on) {
      announce('Treatment B has the leading allocation for this experiment.');
    }
  }

  function scheduleWinner() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setWinner(true);
      return;
    }
    setWinner(false);
    window.clearTimeout(window.__expFlowWinnerT);
    window.__expFlowWinnerT = window.setTimeout(function () {
      setWinner(true);
    }, WIN_MS);
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      scheduleWinner();
      announce('Animation replayed. Watch profiles flow toward treatments.');
    });
  }

  if (root && winnerGroup) {
    scheduleWinner();
  }
})();
