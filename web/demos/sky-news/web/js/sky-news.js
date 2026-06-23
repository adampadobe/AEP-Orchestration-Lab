/**
 * Sky News UK demo — routing, rendering, and AEP-style web interaction events.
 */
(function () {
  'use strict';

  var data = window.SkyNewsData;
  var scrollMarks = { 25: false, 50: false, 75: false, 90: false };
  var eventLog = [];

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function placeholderSvg(tone) {
    var palettes = {
      politics: ['#1e3a5f', '#4a6fa5'],
      world: ['#2d4a3e', '#5a8f7b'],
      tech: ['#1a2a44', '#3d5a80'],
      money: ['#3d3520', '#8a7a4a'],
      analysis: ['#3a2a4a', '#7a5a9a'],
      ents: ['#4a2040', '#9a4a7a'],
      offbeat: ['#2a4a4a', '#5a9a9a'],
      weather: ['#1a3a5a', '#4a8aba']
    };
    var p = palettes[tone] || ['#333', '#666'];
    return (
      '<svg class="sky-card__thumb-inner" viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="' + p[0] + '"/><stop offset="100%" stop-color="' + p[1] + '"/>' +
      '</linearGradient></defs><rect width="640" height="400" fill="url(#g)"/>' +
      '<rect x="40" y="280" width="360" height="12" fill="rgba(255,255,255,.25)" rx="2"/>' +
      '<rect x="40" y="305" width="280" height="12" fill="rgba(255,255,255,.18)" rx="2"/>' +
      '</svg>'
    );
  }

  function emit(eventType, payload) {
    var evt = {
      eventType: eventType,
      timestamp: new Date().toISOString(),
      scrape_id: data.scrape_id,
      web: payload || {}
    };
    eventLog.push(evt);
    window.SkyNewsEventLog = eventLog;
    document.dispatchEvent(new CustomEvent('skynews:telemetry', { detail: evt }));
    if (window.console && console.debug) console.debug('[SkyNews]', eventType, evt);
  }

  function pageView(name, section, url) {
    emit('web.pageView', {
      webPageDetails: {
        name: name,
        URL: url || ('https://news.sky.com/' + (section || 'uk')),
        siteSection: section || 'UK'
      }
    });
  }

  function getSection() {
    var hash = (location.hash || '#uk').replace(/^#/, '');
    return hash.split('/')[0] || 'uk';
  }

  function getArticleId() {
    var parts = (location.hash || '').replace(/^#/, '').split('/');
    return parts[1] || '';
  }

  function findStory(id) {
    var all = [];
    Object.keys(data.sections).forEach(function (key) {
      var sec = data.sections[key];
      if (sec.hero) all.push(sec.hero);
      if (sec.secondary) all = all.concat(sec.secondary);
      if (sec.stories) all = all.concat(sec.stories);
    });
    return all.find(function (s) { return s.id === id; });
  }

  function renderNav(active) {
    var nav = document.getElementById('skyNav');
    if (!nav) return;
    nav.innerHTML = data.navLinks.map(function (link) {
      var cls = 'sky-nav__link';
      if (link.section === active) cls += ' is-active';
      if (link.section === 'live') cls += ' sky-nav__link--live';
      return '<a class="' + cls + '" href="#' + link.section + '" data-section="' + link.section + '">' + esc(link.text) + '</a>';
    }).join('');
  }

  function bindNav() {
    document.getElementById('skyNav').addEventListener('click', function (e) {
      var a = e.target.closest('[data-section]');
      if (!a) return;
      e.preventDefault();
      var section = a.getAttribute('data-section');
      emit('web.navigation', {
        webPageDetails: { name: section },
        webInteraction: { name: a.textContent.trim(), type: 'other', URL: 'https://news.sky.com/' + section }
      });
      location.hash = section;
    });
  }

  function renderUkHome(main) {
    var sec = data.sections.uk;
    var hero = sec.hero;
    var html = '';
    html += '<div class="sky-hero-grid">';
    html += '<article class="sky-hero" data-article-id="' + hero.id + '" role="link" tabindex="0">';
    html += '<div class="sky-hero__media tone-politics"></div>';
    html += '<div class="sky-hero__body">';
    html += '<span class="sky-kicker sky-kicker--live">Live · ' + esc(hero.category) + '</span>';
    html += '<h1 class="sky-hero__headline">' + esc(hero.headline) + '</h1>';
    html += '<p class="sky-hero__standfirst">' + esc(hero.standfirst) + '</p>';
    html += '<p class="sky-meta">' + esc(hero.timestamp) + (hero.author ? ' · ' + esc(hero.author) : '') + '</p>';
    html += '</div></article>';
    html += '<div class="sky-secondary-stack">';
    sec.secondary.forEach(function (story, i) {
      html += '<article class="sky-secondary-card" data-article-id="' + story.id + '" role="link" tabindex="0">';
      html += '<div class="sky-secondary-card__media tone-' + (i === 0 ? 'world' : 'money') + '"></div>';
      html += '<div class="sky-secondary-card__body">';
      html += '<span class="sky-kicker">' + esc(story.category) + '</span>';
      html += '<h2 class="sky-secondary-card__headline">' + esc(story.headline) + '</h2>';
      html += '<p class="sky-meta">' + esc(story.timestamp) + '</p>';
      html += '</div></article>';
    });
    html += '</div></div>';

    html += '<h2 class="sky-section-title">Top Stories</h2>';
    html += '<div class="sky-card-grid">';
    sec.stories.forEach(function (story) {
      html += cardHtml(story);
    });
    html += '</div>';

    html += '<div class="sky-feature-row" id="live">';
    html += '<section class="sky-live-panel" aria-label="Politics Hub Live">';
    html += '<div class="sky-live-panel__header"><span class="sky-kicker sky-kicker--live">Live</span>';
    html += '<h2 class="sky-live-panel__title">' + esc(data.liveSection.title) + '</h2></div>';
    html += '<ul class="sky-live-updates">';
    data.liveSection.updates.forEach(function (u) {
      html += '<li><span class="sky-live-updates__time">' + esc(u.time) + '</span><span>' + esc(u.text) + '</span></li>';
    });
    html += '</ul></section>';

    html += '<section aria-label="Must Watch">';
    html += '<h2 class="sky-section-title">Must Watch</h2>';
    html += '<div class="sky-video-grid">';
    data.videos.forEach(function (v) {
      html += '<article class="sky-video-card" data-video-id="' + v.id + '" role="button" tabindex="0">';
      html += '<div class="sky-video-card__thumb tone-politics"><span class="sky-video-card__play" aria-hidden="true">▶</span></div>';
      html += '<div class="sky-video-card__body">';
      html += '<h3 class="sky-video-card__title">' + esc(v.title) + '</h3>';
      html += '<span class="sky-video-card__duration">' + esc(v.duration) + '</span>';
      html += '</div></article>';
    });
    html += '</div></section></div>';

    main.innerHTML = html;
  }

  function cardHtml(story) {
    var tone = story.tone || 'politics';
    return (
      '<article class="sky-card" data-article-id="' + story.id + '" role="link" tabindex="0">' +
      '<div class="sky-card__thumb">' + placeholderSvg(tone) + '</div>' +
      (story.isLive ? '<span class="sky-kicker sky-kicker--live" style="display:inline-block;margin-bottom:.2rem">Live</span>' : '') +
      '<span class="sky-card__category">' + esc(story.category) + '</span>' +
      '<h3 class="sky-card__headline">' + esc(story.headline) + '</h3>' +
      '<time class="sky-card__time">' + esc(story.timestamp) + '</time>' +
      '</article>'
    );
  }

  function renderSection(sectionKey) {
    var main = document.getElementById('skyMain');
    var sec = data.sections[sectionKey];
    if (!sec) { location.hash = 'uk'; return; }
    if (sec.redirect) { location.hash = sec.redirect; return; }

    if (sectionKey === 'uk') {
      renderUkHome(main);
      pageView('Sky News UK', 'UK');
      return;
    }

    if (sec.isLiveHub) {
      main.innerHTML =
        '<h1 class="sky-section-title">Watch Live</h1>' +
        '<div class="sky-video-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">' +
        data.videos.map(function (v) {
          return '<article class="sky-video-card" data-video-id="' + v.id + '" role="button" tabindex="0">' +
            '<div class="sky-video-card__thumb tone-politics"><span class="sky-video-card__play">▶</span></div>' +
            '<div class="sky-video-card__body"><h3 class="sky-video-card__title">' + esc(v.title) + '</h3>' +
            '<span class="sky-video-card__duration">' + esc(v.duration) + '</span></div></article>';
        }).join('') + '</div>';
      pageView('Watch Live', 'Live');
      bindInteractions();
      return;
    }

    var stories = sec.stories || [];
    main.innerHTML =
      '<h1 class="sky-section-title">' + esc(sec.title) + '</h1>' +
      '<div class="sky-section-grid">' + stories.map(cardHtml).join('') + '</div>';
    pageView(sec.title, sec.title);
    bindInteractions();
  }

  function renderArticle(id) {
    var story = findStory(id);
    var main = document.getElementById('skyMain');
    if (!story) { location.hash = 'uk'; return; }
    var body = (data.articleBodies[id] || 'Article body placeholder for demo purposes.').split('\n\n').map(function (p) {
      return '<p>' + esc(p) + '</p>';
    }).join('');

    main.innerHTML =
      '<button type="button" class="sky-back-link" id="skyBack">← Back</button>' +
      '<article class="sky-article">' +
      '<span class="sky-card__category">' + esc(story.category) + '</span>' +
      '<h1 class="sky-article__headline">' + esc(story.headline) + '</h1>' +
      '<p class="sky-meta" style="color:#666;margin-bottom:1.25rem">' + esc(story.timestamp) + '</p>' +
      '<div class="sky-card__thumb" style="margin-bottom:1.25rem">' + placeholderSvg(story.tone || 'politics') + '</div>' +
      '<div class="sky-article__body">' + body + '</div></article>';

    document.getElementById('skyBack').addEventListener('click', function () {
      history.back();
    });

    pageView(story.headline, story.category, 'https://news.sky.com/story/' + id);
    bindArticleScroll();
  }

  function bindInteractions() {
    document.querySelectorAll('[data-article-id]').forEach(function (el) {
      function open() {
        var id = el.getAttribute('data-article-id');
        emit('web.articleClick', {
          webPageDetails: { name: document.title },
          webInteraction: {
            linkClicks: { value: 1 },
            name: el.querySelector('h1,h2,h3') ? el.querySelector('h1,h2,h3').textContent.trim() : id,
            type: 'other',
            URL: 'https://news.sky.com/story/' + id
          }
        });
        location.hash = getSection() + '/' + id;
      }
      el.addEventListener('click', open);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });

    document.querySelectorAll('[data-video-id]').forEach(function (el) {
      function play() {
        var id = el.getAttribute('data-video-id');
        var title = el.querySelector('.sky-video-card__title').textContent.trim();
        emit('web.videoStart', {
          webInteraction: { name: title, type: 'other', URL: 'https://news.sky.com/video/' + id },
          mediaInteraction: { name: title, action: 'start' }
        });
        el.classList.add('is-playing');
      }
      el.addEventListener('click', play);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
      });
    });
  }

  function bindArticleScroll() {
    scrollMarks = { 25: false, 50: false, 75: false, 90: false };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function onScroll() {
    var doc = document.documentElement;
    var pct = Math.round((doc.scrollTop / (doc.scrollHeight - doc.clientHeight)) * 100);
    [25, 50, 75, 90].forEach(function (mark) {
      if (pct >= mark && !scrollMarks[mark]) {
        scrollMarks[mark] = true;
        emit('web.scrollDepth', {
          webPageDetails: { name: document.title },
          webInteraction: { scrollDepth: mark }
        });
      }
    });
  }

  function route() {
    scrollMarks = { 25: false, 50: false, 75: false, 90: false };
    window.removeEventListener('scroll', onScroll);
    var section = getSection();
    var articleId = getArticleId();
    renderNav(section === 'home' ? 'uk' : section);
    if (articleId) {
      renderArticle(articleId);
    } else {
      renderSection(section === 'home' ? 'uk' : section);
    }
    bindInteractions();
    if (!articleId) window.addEventListener('scroll', onScroll, { passive: true });
  }

  function renderFooter() {
    var footer = document.getElementById('skyFooterLinks');
    if (!footer) return;
    footer.innerHTML = data.footerLinks.map(function (t) {
      return '<a href="#">' + esc(t) + '</a>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderFooter();
    bindNav();
    if (!location.hash) location.hash = 'uk';
    window.addEventListener('hashchange', route);
    route();
  });
})();
