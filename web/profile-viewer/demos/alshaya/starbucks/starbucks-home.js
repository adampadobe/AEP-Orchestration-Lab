/**
 * Starbucks UAE home — hero carousel (KSIA-style pattern).
 */
(function () {
  'use strict';

  function initCarousel() {
    var slides = document.querySelectorAll('.sb-hero-slide');
    var textSlides = document.querySelectorAll('.sb-hero-text-slide');
    var indicators = document.querySelectorAll('.sb-hero-ind');
    var prevBtn = document.getElementById('sbHeroPrev');
    var nextBtn = document.getElementById('sbHeroNext');
    if (!slides.length) return;

    var idx = 0;
    var timer = null;
    var INTERVAL = 6000;

    function show(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) {
        s.classList.toggle('active', n === idx);
      });
      textSlides.forEach(function (s, n) {
        s.classList.toggle('active', n === idx);
      });
      indicators.forEach(function (ind, n) {
        ind.classList.toggle('sb-hero-ind-active', n === idx);
      });
    }

    function next() {
      show(idx + 1);
    }
    function prev() {
      show(idx - 1);
    }

    function resetTimer() {
      if (timer) clearInterval(timer);
      timer = setInterval(next, INTERVAL);
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { prev(); resetTimer(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { next(); resetTimer(); });
    indicators.forEach(function (ind, n) {
      ind.addEventListener('click', function () { show(n); resetTimer(); });
    });

    show(0);
    resetTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarousel);
  } else {
    initCarousel();
  }
})();
