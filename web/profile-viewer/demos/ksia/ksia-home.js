/**
 * KSIA home page — hero carousel (Etihad-style) and flight search.
 */
(function () {
  'use strict';

  function initCarousel() {
    var slides = document.querySelectorAll('.ksia-hero-slide');
    var textSlides = document.querySelectorAll('.ksia-hero-text-slide');
    var indicators = document.querySelectorAll('.ksia-hero-ind');
    var prevBtn = document.getElementById('ksiaHeroPrev');
    var nextBtn = document.getElementById('ksiaHeroNext');
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
        ind.classList.toggle('ksia-hero-ind-active', n === idx);
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

  function initFlightSearch() {
    var form = document.getElementById('ksiaFlightSearch');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var origin = (document.getElementById('ksiaOrigin') && document.getElementById('ksiaOrigin').value) || '';
      var dest = (document.getElementById('ksiaDestination') && document.getElementById('ksiaDestination').value) || '';
      var date = (document.getElementById('ksiaTravelDate') && document.getElementById('ksiaTravelDate').value) || '';
      if (window.KsiaLabEvents && typeof window.KsiaLabEvents.emitFlightSearch === 'function') {
        window.KsiaLabEvents.emitFlightSearch(origin, dest, date);
      }
      window.location.href = (window.KsiaChrome ? window.KsiaChrome.resolveHref('flights/departures.html') : 'flights/departures.html');
    });
  }

  function initQuickLinks() {
    document.querySelectorAll('[data-ksia-quick-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.quicklink.click', { label: el.textContent.trim() });
        }
      });
    });
  }

  function boot() {
    initCarousel();
    initFlightSearch();
    initQuickLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
