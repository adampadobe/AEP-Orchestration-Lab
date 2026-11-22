/**
 * Home page "Lab pulse": What's new (shipped / in progress), usage heat map,
 * and the collapsed-by-default Industry radar (agent-curated feeds).
 * Contracts: docs/LAB_HOME_DATA.md and docs/LAB_FEEDS.md.
 */
(function attachHomeNewPulse(global) {
  'use strict';

  var WN_LIMIT = 8;
  var HM_LIMIT = 12;
  var RADAR_POLL_MS = 15 * 60 * 1000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(u) {
    var s = String(u || '');
    return /^(https?:\/\/|\/|[a-z0-9-]+\.html)/i.test(s) ? s : '';
  }

  function httpError(res) {
    var e = new Error('HTTP ' + res.status);
    e.status = res.status;
    return e;
  }

  function getJson(url, headers) {
    return fetch(url, { headers: headers || {}, credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw httpError(res);
      return res.json();
    });
  }

  // Month-only dates ("YYYY-MM") render without inventing a day.
  function formatDate(value) {
    var s = String(value || '');
    var m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m) return MONTHS[Number(m[2]) - 1] + ' ' + m[1];
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function relTime(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.round(hrs / 24);
    if (days < 30) return days + 'd ago';
    return formatDate(value);
  }

  function pageHref(route) {
    var r = String(route || '');
    return r.indexOf('/profile-viewer/') === 0 ? r.slice('/profile-viewer/'.length) : r;
  }

  function setActive(buttons, attr, value) {
    buttons.forEach(function (b) {
      var on = b.getAttribute(attr) === value;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function emptyLi(text) {
    return '<li class="home-pulse__empty" role="status">' + esc(text) + '</li>';
  }

  /* ---------------- What's new ---------------- */

  var wnCache = {};

  function renderShipped(list, meta, data) {
    var items = (data && Array.isArray(data.items) ? data.items : []).slice(0, WN_LIMIT);
    if (!items.length) {
      list.innerHTML = emptyLi('Nothing shipped in the last ' + ((data && data.windowDays) || 90) + ' days.');
    } else {
      var mine = myVotes();
      list.innerHTML = items
        .map(function (it) {
          var kind = it.kind === 'new' ? 'new' : 'updated';
          var pages = (it.pages || [])
            .slice(0, 3)
            .map(function (p) {
              return '<a class="home-wn-chip" href="' + esc(pageHref(p.route)) + '">' + esc(p.label || p.route) + '</a>';
            })
            .join('');
          return (
            '<li class="home-wn-item">' +
            '<span class="home-wn-badge home-wn-badge--' + kind + '">' + (kind === 'new' ? 'New' : 'Updated') + '</span>' +
            '<div class="home-wn-item__body">' +
            '<div class="home-wn-item__title">' + esc(it.title) + '</div>' +
            '<div class="home-wn-item__meta">' +
            esc(relTime(it.mergedAt)) +
            (it.author ? ' · @' + esc(it.author) : '') +
            (it.prNumber ? ' · #' + esc(it.prNumber) : '') +
            '</div>' +
            (pages ? '<div class="home-wn-item__pages">' + pages + '</div>' : '') +
            '</div></li>'
          );
        })
        .join('');
    }
    meta.textContent = data && data.generatedAt ? 'Built from merged pull requests · updated ' + relTime(data.generatedAt) : '';
  }

  function renderProgress(list, meta, data) {
    var items = (data && Array.isArray(data.items) ? data.items : []).slice(0, WN_LIMIT);
    if (!items.length) {
      list.innerHTML = emptyLi('No open pull requests right now.');
    } else {
      var mine = myVotes();
      list.innerHTML = items
        .map(function (it) {
          var url = safeUrl(it.url);
          var title = url
            ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(it.title) + '</a>'
            : esc(it.title);
          return (
            '<li class="home-wn-item">' +
            '<span class="home-wn-badge home-wn-badge--' + (it.draft ? 'draft' : 'review') + '">' + (it.draft ? 'Draft' : 'In review') + '</span>' +
            '<div class="home-wn-item__body">' +
            '<div class="home-wn-item__title">' + title + '</div>' +
            '<div class="home-wn-item__meta">' +
            (it.number ? '#' + esc(it.number) + ' · ' : '') +
            (it.author ? '@' + esc(it.author) + ' · ' : '') +
            'updated ' + esc(relTime(it.updatedAt)) +
            '</div></div></li>'
          );
        })
        .join('');
    }
    meta.textContent = data
      ? 'Open pull requests' + (data.stale ? ' · cached, GitHub unavailable' : '') + (data.fetchedAt ? ' · checked ' + relTime(data.fetchedAt) : '')
      : '';
  }

  function loadWhatsNew(view) {
    var list = document.getElementById('homeWhatsNewList');
    var meta = document.getElementById('homeWhatsNewMeta');
    if (!list || !meta) return;
    var url = view === 'progress' ? '/api/lab/whats-new/in-progress' : '/whats-new.json';
    var render = view === 'progress' ? renderProgress : renderShipped;
    if (wnCache[view]) {
      render(list, meta, wnCache[view]);
      return;
    }
    list.innerHTML = emptyLi('Loading…');
    meta.textContent = '';
    getJson(url)
      .then(function (data) {
        wnCache[view] = data;
        if (currentWnView === view) render(list, meta, data);
      })
      .catch(function () {
        if (currentWnView !== view) return;
        list.innerHTML = emptyLi(view === 'progress' ? 'In-progress work is unavailable right now.' : 'Release history is unavailable right now.');
      });
  }

  var currentWnView = 'shipped';

  function initWhatsNew() {
    var root = document.getElementById('homeWhatsNew');
    if (!root) return;
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-wn-view]'));
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        currentWnView = b.getAttribute('data-wn-view');
        setActive(buttons, 'data-wn-view', currentWnView);
        loadWhatsNew(currentWnView);
      });
    });
    loadWhatsNew(currentWnView);
  }

  /* ---------------- Heat map ---------------- */

  var hmWindow = '7d';
  var hmSeq = 0;

  function hmMessage(grid, text) {
    grid.innerHTML = '<p class="home-pulse__empty" role="status">' + esc(text) + '</p>';
  }

  function renderHeatmap(grid, data) {
    var items = (data && Array.isArray(data.items) ? data.items : []).slice(0, HM_LIMIT);
    if (!data || data.collectionEnabled === false) {
      hmMessage(grid, 'Usage collection is not switched on yet. The heat map appears once page views are recorded.');
      return;
    }
    if (!items.length) {
      hmMessage(grid, 'Not enough page views in this window yet.');
      return;
    }
    var max = items.reduce(function (m, it) { return Math.max(m, Number(it.views) || 0); }, 1);
    grid.innerHTML = items
      .map(function (it) {
        var views = Number(it.views) || 0;
        var heat = Math.round(12 + (views / max) * 58);
        var trend = '';
        if (typeof it.trendPct === 'number') {
          var dir = it.trendPct > 0 ? 'up' : it.trendPct < 0 ? 'down' : 'flat';
          var arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
          trend = '<span class="home-heat__trend home-heat__trend--' + dir + '" title="vs previous window">' + arrow + ' ' + Math.abs(it.trendPct) + '%</span>';
        }
        return (
          '<a class="home-heat__tile" style="--heat:' + heat + '%" href="' + esc(pageHref(it.route)) + '">' +
          '<span class="home-heat__label">' + esc(it.label || it.route) + '</span>' +
          (it.navGroup ? '<span class="home-heat__group">' + esc(it.navGroup) + '</span>' : '') +
          '<span class="home-heat__stats"><span class="home-heat__views">' + views.toLocaleString() + ' views</span>' +
          '<span class="home-heat__users">' + esc(it.uniqueUsersBucket || '') + ' users</span>' + trend + '</span>' +
          '</a>'
        );
      })
      .join('');
  }

  function authHeaders() {
    var sync = global.AepLabSandboxSync;
    if (!sync || typeof sync.getAuthHeaders !== 'function') return Promise.resolve({});
    var ready = sync.whenReady && typeof sync.whenReady.then === 'function' ? sync.whenReady : Promise.resolve();
    return ready.catch(function () {}).then(function () { return sync.getAuthHeaders(); });
  }

  function loadHeatmap() {
    var grid = document.getElementById('homeHeatmapGrid');
    if (!grid) return;
    var seq = ++hmSeq;
    var win = hmWindow;
    hmMessage(grid, 'Loading…');
    authHeaders()
      .then(function (headers) {
        if (!headers || !headers.Authorization) {
          var e = new Error('signed-out');
          e.status = 401;
          throw e;
        }
        return getJson('/api/lab/usage/heatmap?window=' + encodeURIComponent(win), headers);
      })
      .then(function (data) {
        if (seq === hmSeq) renderHeatmap(grid, data);
      })
      .catch(function (err) {
        if (seq !== hmSeq) return;
        var status = err && err.status;
        if (status === 401 || status === 403) hmMessage(grid, 'Sign in with an approved lab account to see usage.');
        else hmMessage(grid, 'Usage data is unavailable right now.');
      });
  }

  function initHeatmap() {
    var root = document.getElementById('homeHeatmap');
    if (!root) return;
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-hm-window]'));
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        hmWindow = b.getAttribute('data-hm-window');
        setActive(buttons, 'data-hm-window', hmWindow);
        loadHeatmap();
      });
    });
    loadHeatmap();
    ['aep-lab-email-session-updated', 'aep-lab-google-session-updated'].forEach(function (evt) {
      global.addEventListener(evt, loadHeatmap);
    });
  }

  /* ---------------- Industry radar ---------------- */

  var radarFeed = 'tech-news';
  var radarState = {};
  var radarTimer = null;

  var SOURCE_LABEL = { live: 'Live', stale: 'Stale', fallback: 'Awaiting first run' };
  var VOTES_KEY = 'aepLabFeedVotes';

  function myVotes() {
    try { return JSON.parse(global.localStorage.getItem(VOTES_KEY)) || {}; } catch (e) { return {}; }
  }

  function saveMyVote(id, vote) {
    var all = myVotes();
    if (vote === 'none') delete all[id];
    else all[id] = vote;
    try { global.localStorage.setItem(VOTES_KEY, JSON.stringify(all)); } catch (e) {}
  }

  function voteButtons(it, mine) {
    if (!/^[0-9a-f]{64}$/.test(String(it.id || ''))) return '';
    var v = it.votes || {};
    function btn(kind, glyph, label, count) {
      return '<button type="button" class="home-radar__vote' + (mine === kind ? ' is-active' : '') +
        '" data-vote="' + kind + '" data-id="' + esc(it.id) + '" aria-pressed="' + (mine === kind) +
        '" title="' + label + '">' + glyph + ' <span>' + esc(count || 0) + '</span></button>';
    }
    return '<div class="home-radar__votes" role="group" aria-label="Rate this signal">' +
      btn('up', '\uD83D\uDC4D', 'Useful: show more like this', v.up) +
      btn('down', '\uD83D\uDC4E', 'Not useful: show less like this', v.down) +
      '</div>';
  }

  function renderRadar(feedId) {
    var list = document.getElementById('homeRadarList');
    var meta = document.getElementById('homeRadarMeta');
    if (!list || !meta || feedId !== radarFeed) return;
    var st = radarState[feedId];
    if (!st || (!st.data && !st.error)) {
      list.innerHTML = emptyLi('Loading…');
      meta.textContent = '';
      return;
    }
    if (!st.data) {
      list.innerHTML = emptyLi('This feed is unavailable right now.');
      meta.textContent = '';
      return;
    }
    var data = st.data;
    var items = Array.isArray(data.items) ? data.items : [];
    var m = data.meta || {};
    if (!items.length) {
      list.innerHTML = emptyLi(m.source === 'fallback' ? 'The curation agent has not run yet. Check back soon.' : 'No signals right now.');
    } else {
      var mine = myVotes();
      list.innerHTML = items
        .map(function (it) {
          var url = safeUrl(it.sourceUrl);
          var headline = url
            ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(it.headline) + '</a>'
            : esc(it.headline);
          var tags = []
            .concat((it.competitors || []).map(function (c) { return '<span class="home-radar__chip home-radar__chip--comp">' + esc(c) + '</span>'; }))
            .concat((it.products || []).map(function (p) { return '<span class="home-radar__chip">' + esc(p) + '</span>'; }));
          if (it.demoableInLab) tags.push('<span class="home-radar__chip home-radar__chip--demo">Demoable in Lab</span>');
          var rel = Number(it.relevance);
          return (
            '<li class="home-radar__item">' +
            '<div class="home-radar__head">' +
            (it.category ? '<span class="home-radar__cat">' + esc(it.category) + '</span>' : '') +
            '<span class="home-radar__date">' + esc(formatDate(it.publishedAt)) + '</span>' +
            (isFinite(rel) ? '<span class="home-radar__rel" title="Relevance score">' + esc(rel) + '</span>' : '') +
            '</div>' +
            '<div class="home-radar__headline">' + headline + '</div>' +
            (it.soWhat ? '<p class="home-radar__sowhat">' + esc(it.soWhat) + '</p>' : '') +
            (tags.length ? '<div class="home-radar__tags">' + tags.join('') + '</div>' : '') +
            voteButtons(it, mine[it.id]) +
            '</li>'
          );
        })
        .join('');
    }
    var parts = [SOURCE_LABEL[m.source] || 'Unknown'];
    if (m.fetchedAt) parts.push('updated ' + relTime(m.fetchedAt));
    if (m.lastRunStatus === 'partial') parts.push('some sources failed');
    else if (m.lastRunStatus === 'failed') parts.push('last run failed');
    meta.innerHTML = '<span class="home-radar__source home-radar__source--' + esc(m.source || 'unknown') + '">' + esc(parts[0]) + '</span> ' + esc(parts.slice(1).join(' · '));
  }

  function loadRadar(feedId) {
    var st = radarState[feedId] || (radarState[feedId] = {});
    var headers = st.etag ? { 'If-None-Match': st.etag } : {};
    renderRadar(feedId);
    return fetch('/api/lab/feeds/' + encodeURIComponent(feedId), { headers: headers, credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 304 && st.data) return st.data;
        if (!res.ok) throw httpError(res);
        st.etag = res.headers.get('ETag') || '';
        return res.json();
      })
      .then(function (data) {
        st.data = data;
        st.error = null;
      })
      .catch(function (err) {
        st.error = err;
      })
      .then(function () {
        renderRadar(feedId);
      });
  }

  function sendVote(button) {
    var feedId = radarFeed;
    var id = button.getAttribute('data-id');
    var st = radarState[feedId];
    var item = st && st.data && (st.data.items || []).filter(function (it) { return it.id === id; })[0];
    if (!item) return;
    var previous = myVotes()[id] || 'none';
    var vote = button.getAttribute('data-vote') === previous ? 'none' : button.getAttribute('data-vote');
    var before = { up: (item.votes || {}).up || 0, down: (item.votes || {}).down || 0 };
    var after = { up: before.up, down: before.down };
    if (previous !== 'none') after[previous] = Math.max(0, after[previous] - 1);
    if (vote !== 'none') after[vote] += 1;
    item.votes = after;
    saveMyVote(id, vote);
    renderRadar(feedId);
    function revert(message) {
      item.votes = before;
      saveMyVote(id, previous);
      renderRadar(feedId);
      var meta = document.getElementById('homeRadarMeta');
      if (meta && message) meta.textContent = message;
    }
    authHeaders().then(function (headers) {
      if (!headers || !headers.Authorization) return revert('Sign in to rate signals.');
      return fetch('/api/lab/feeds/' + encodeURIComponent(feedId) + '/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({ id: id, vote: vote }),
      }).then(function (res) {
        if (!res.ok) throw httpError(res);
        return res.json();
      }).then(function (body) {
        item.votes = body.votes;
        st.etag = '';
        renderRadar(feedId);
      });
    }).catch(function () {
      revert('Your rating could not be saved. Try again.');
    });
  }

  function stopRadarPoll() {
    if (radarTimer) global.clearInterval(radarTimer);
    radarTimer = null;
  }

  function startRadarPoll() {
    stopRadarPoll();
    radarTimer = global.setInterval(function () {
      if (document.visibilityState === 'visible') loadRadar(radarFeed);
    }, RADAR_POLL_MS);
  }

  function initRadar() {
    var root = document.getElementById('homeRadar');
    if (!root) return;
    // Closed by default and never persisted, so demos never open on news.
    root.open = false;
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-radar-feed]'));
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        radarFeed = b.getAttribute('data-radar-feed');
        setActive(buttons, 'data-radar-feed', radarFeed);
        loadRadar(radarFeed);
      });
    });
    var list = document.getElementById('homeRadarList');
    if (list) {
      list.addEventListener('click', function (e) {
        var button = e.target.closest && e.target.closest('[data-vote]');
        if (button) sendVote(button);
      });
    }
    root.addEventListener('toggle', function () {
      if (root.open) {
        loadRadar(radarFeed);
        startRadarPoll();
      } else {
        stopRadarPoll();
      }
    });
  }

  /* ---------------- Boot ---------------- */

  var started = false;

  function init() {
    if (started || !document.getElementById('homeWhatsNew')) return;
    started = true;
    initWhatsNew();
    initHeatmap();
    initRadar();
  }

  function boot() {
    if (document.getElementById('homeWhatsNew')) {
      init();
      return;
    }
    global.addEventListener('aep-deferred-dashboard-mounted', init, { once: true });
  }

  global.HomeNewPulse = { init: init, formatDate: formatDate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
