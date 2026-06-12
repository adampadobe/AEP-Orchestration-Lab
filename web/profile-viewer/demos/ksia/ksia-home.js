/**
 * KSIA home page — hero carousel, gallery coverflow (Etihad-style), flight search.
 */
(function () {
  'use strict';

  function resolveImageSrc(path) {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    if (window.KsiaChrome && typeof window.KsiaChrome.resolveHref === 'function') {
      return window.KsiaChrome.resolveHref(path);
    }
    return path;
  }

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

  function initGalleryCarousel() {
    var track = document.getElementById('ksiaDestTrack');
    var dotsRoot = document.getElementById('ksiaDestDots');
    var prevBtn = document.getElementById('ksiaDestPrev');
    var nextBtn = document.getElementById('ksiaDestNext');
    var slides = (window.KsiaMockData && window.KsiaMockData.GALLERY_CAROUSEL) || [];
    if (!track || !slides.length) return;

    var CLONE_COUNT = 2;
    var destN = 0;
    var destVirtual = 0;
    var destSnapping = false;
    var destDots = [];

    slides.forEach(function (slide, i) {
      var card = document.createElement('article');
      card.className = 'ksia-dest-card';
      card.setAttribute('data-index', String(i));
      card.innerHTML =
        '<img src="' + resolveImageSrc(slide.image) + '" alt="' + (slide.alt || slide.title || '') + '">' +
        '<div class="ksia-dest-card-gradient" aria-hidden="true"></div>' +
        '<div class="ksia-dest-card-tag">' + (slide.tag || '') + '</div>' +
        '<div class="ksia-dest-card-body">' +
          '<h3 class="ksia-dest-card-title">' + (slide.title || '') + '</h3>' +
          '<p class="ksia-dest-card-meta">' + (slide.meta || '') + '</p>' +
        '</div>';
      track.appendChild(card);
    });

    function destGetCards() {
      return Array.prototype.slice.call(track.querySelectorAll('.ksia-dest-card'));
    }

    function destComputePositions() {
      var W = track.offsetWidth;
      var H = track.offsetHeight;
      var cx = W / 2;
      var AW = Math.round(W * 0.52);
      var AH = H;
      var SW = Math.round(W * 0.38);
      var SH = Math.round(H * 0.83);
      var FW = Math.round(W * 0.28);
      var FH = Math.round(H * 0.67);
      var SO = Math.round(W * 0.19);
      var FO = Math.round(W * 0.33);
      return [
        { l: -FW - 40, t: Math.round((H - FH) / 2), w: FW, h: FH, z: 0, op: 0 },
        { l: Math.round(cx - FO - FW / 2), t: Math.round((H - FH) / 2), w: FW, h: FH, z: 2, op: 1 },
        { l: Math.round(cx - SO - SW / 2), t: Math.round((H - SH) / 2), w: SW, h: SH, z: 5, op: 1 },
        { l: Math.round(cx - AW / 2), t: 0, w: AW, h: AH, z: 10, op: 1 },
        { l: Math.round(cx + SO - SW / 2), t: Math.round((H - SH) / 2), w: SW, h: SH, z: 5, op: 1 },
        { l: Math.round(cx + FO - FW / 2), t: Math.round((H - FH) / 2), w: FW, h: FH, z: 2, op: 1 },
        { l: W + 40, t: Math.round((H - FH) / 2), w: FW, h: FH, z: 0, op: 0 },
      ];
    }

    function destUpdate() {
      var cards = destGetCards();
      var pos = destComputePositions();
      cards.forEach(function (card, i) {
        var diff = i - destVirtual;
        var clamped = Math.max(-3, Math.min(3, diff));
        var p = pos[clamped + 3];
        card.style.left = p.l + 'px';
        card.style.top = p.t + 'px';
        card.style.width = p.w + 'px';
        card.style.height = p.h + 'px';
        card.style.zIndex = String(p.z);
        card.style.opacity = String(p.op);
        card.className = 'ksia-dest-card' + (diff === 0 ? ' active' : '');
      });
      var realIdx = ((destVirtual - CLONE_COUNT) % destN + destN) % destN;
      destDots.forEach(function (dot, i) {
        dot.classList.toggle('active', i === realIdx);
        dot.setAttribute('aria-selected', i === realIdx ? 'true' : 'false');
        dot.tabIndex = i === realIdx ? 0 : -1;
      });
    }

    function destDisableTransitions() {
      destGetCards().forEach(function (c) { c.style.transition = 'none'; });
    }
    function destEnableTransitions() {
      destGetCards().forEach(function (c) { c.style.transition = ''; });
    }

    function destSnapIfNeeded() {
      var inRight = destVirtual >= CLONE_COUNT + destN;
      var inLeft = destVirtual < CLONE_COUNT;
      if (!inRight && !inLeft) { destSnapping = false; return; }
      destSnapping = true;
      setTimeout(function () {
        destDisableTransitions();
        destVirtual = inRight ? destVirtual - destN : destVirtual + destN;
        destUpdate();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            destEnableTransitions();
            destSnapping = false;
          });
        });
      }, 450);
    }

    function destNext() {
      if (destSnapping) return;
      destVirtual++;
      destUpdate();
      destSnapIfNeeded();
    }
    function destPrev() {
      if (destSnapping) return;
      destVirtual--;
      destUpdate();
      destSnapIfNeeded();
    }
    function destGoTo(i) {
      destVirtual = CLONE_COUNT + i;
      destUpdate();
    }

    function destInit() {
      var orig = destGetCards();
      destN = orig.length;
      for (var i = destN - CLONE_COUNT; i < destN; i++) {
        track.insertBefore(orig[i].cloneNode(true), orig[0]);
      }
      for (var j = 0; j < CLONE_COUNT; j++) {
        track.appendChild(orig[j].cloneNode(true));
      }
      destVirtual = CLONE_COUNT + 2;
      destDisableTransitions();
      destUpdate();
      requestAnimationFrame(function () {
        requestAnimationFrame(destEnableTransitions);
      });
    }

    if (dotsRoot) {
      slides.forEach(function (_slide, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'ksia-carousel-dot' + (i === 2 ? ' active' : '');
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Gallery slide ' + (i + 1));
        dot.setAttribute('aria-selected', i === 2 ? 'true' : 'false');
        dot.tabIndex = i === 2 ? 0 : -1;
        dot.addEventListener('click', function () { destGoTo(i); });
        dotsRoot.appendChild(dot);
        destDots.push(dot);
      });
    }

    if (prevBtn) prevBtn.addEventListener('click', destPrev);
    if (nextBtn) nextBtn.addEventListener('click', destNext);

    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); destPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); destNext(); }
    });

    destInit();
    window.addEventListener('resize', function () {
      destDisableTransitions();
      destUpdate();
      requestAnimationFrame(function () {
        requestAnimationFrame(destEnableTransitions);
      });
    });
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

  function initFaq() {
    var list = document.getElementById('ksiaFaqList');
    if (!list) return;
    list.querySelectorAll('.ksia-faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.ksia-faq-item');
        if (!item) return;
        var isOpen = item.classList.contains('open');
        list.querySelectorAll('.ksia-faq-item').forEach(function (el) {
          el.classList.remove('open');
          var q = el.querySelector('.ksia-faq-q');
          if (q) q.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function initScrollHeader() {
    var threshold = 80;
    function onScroll() {
      document.body.classList.toggle('ksia-scrolled', window.scrollY > threshold);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function boot() {
    initCarousel();
    initGalleryCarousel();
    initFlightSearch();
    initQuickLinks();
    initFaq();
    initScrollHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
