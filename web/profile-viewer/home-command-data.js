/**
 * Command Centre data layer — RTDB-backed with localStorage cache.
 */
(function attachHomeCommandData(global) {
  'use strict';

  var store = global.HomeCommandStore;
  var products = global.HomeCommandProducts;
  var rtdb = global.HomeCommandRtdb;
  if (!store) return;

  var state = store.loadState();
  var seeded = false;
  var initPromise = null;
  var initDone = false;
  var dataListeners = [];

  function notifyListeners() {
    dataListeners.forEach(function (fn) {
      try {
        fn(state);
      } catch (_e) {}
    });
  }

  function persist() {
    state = store.saveState(state);
    if (rtdb) rtdb.scheduleSave(state);
    notifyListeners();
  }

  function applyRemoteState(remote) {
    if (!remote || typeof remote !== 'object') return;
    state = Object.assign({}, remote);
    state.customers = normalizeCustomers(state.customers);
    state.pocs = normalizePocs(state.pocs);
    seeded = !!(state.customers && state.customers.length);
    store.saveLocalCache(state);
    notifyListeners();
  }

  function subscribe(fn) {
    if (typeof fn === 'function') dataListeners.push(fn);
    return function unsubscribe() {
      dataListeners = dataListeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function normalizeCustomer(c) {
    if (!c) return c;
    var row = Object.assign({}, c);
    row.productIds = products ? products.normalizeProductIds(row) : row.productIds || [];
    if (!Array.isArray(row.nextSteps)) row.nextSteps = [];
    if (!Array.isArray(row.stakeholders)) row.stakeholders = [];
    if (!Array.isArray(row.milestones)) row.milestones = [];
    if (!Array.isArray(row.meetingHistory)) row.meetingHistory = [];
    row.scrapeId = row.scrapeId || '';
    row.scrapeLogoUrl = row.scrapeLogoUrl || '';
    row.scrapeBrand = row.scrapeBrand || '';
    return row;
  }

  function normalizeCustomers(list) {
    return (list || []).map(normalizeCustomer);
  }

  function normalizePoc(p) {
    if (!p) return p;
    var row = Object.assign({}, p);
    row.productIds = products ? products.normalizeProductIds(row) : row.productIds || [];
    return row;
  }

  function normalizePocs(list) {
    return (list || []).map(normalizePoc);
  }

  function logActivity(entry) {
    var item = {
      id: store.generateId('act'),
      icon: entry.icon || '📋',
      text: entry.text || '',
      customerId: entry.customerId || null,
      customerName: entry.customerName || '',
      at: entry.at || new Date().toISOString(),
    };
    state.activity = [item].concat(state.activity || []).slice(0, 50);
    persist();
    return item;
  }

  function seedIfEmpty() {
    if (seeded || (state.customers && state.customers.length)) {
      seeded = true;
      return;
    }
    var seedBuilder = global.HomeCommandSeedData;
    if (!seedBuilder || typeof seedBuilder.buildSeed !== 'function') {
      seeded = true;
      return;
    }
    var seed = seedBuilder.buildSeed(store, new Date());
    state.customers = seed.customers || [];
    state.tasks = seed.tasks || [];
    state.meetings = seed.meetings || [];
    state.activity = seed.activity || [];
    state.pocs = seed.pocs || [];
    state.knowledgeBase = seed.knowledgeBase || [];
    state.capacity = seed.capacity || [];
    seeded = true;
    persist();
  }

  function waitForAuth(timeoutMs) {
    return new Promise(function (resolve) {
      if (rtdb && rtdb.isAuthenticated()) {
        resolve(true);
        return;
      }
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(!!ok);
      }
      function check() {
        if (rtdb && rtdb.isAuthenticated()) finish(true);
      }
      global.addEventListener('aep-lab-email-session-updated', check);
      global.addEventListener('aep-lab-google-session-updated', check);
      setTimeout(function () {
        finish(rtdb && rtdb.isAuthenticated());
      }, timeoutMs || 6000);
    });
  }

  function connectRtdb() {
    if (!rtdb) return Promise.resolve();
    return waitForAuth().then(function () {
      if (!rtdb.isAuthenticated()) return null;
      return rtdb.connect(function (remote) {
        if (!remote) return;
        var localUpdated = state.updatedAt || '';
        var remoteUpdated = remote.updatedAt || '';
        if (!localUpdated || remoteUpdated >= localUpdated) {
          applyRemoteState(remote);
        }
      });
    });
  }

  function useCustomers() {
    return {
      getAll: function () {
        return normalizeCustomers(state.customers);
      },
      getById: function (id) {
        var c = (state.customers || []).find(function (row) {
          return row.id === id;
        });
        return c ? normalizeCustomer(c) : null;
      },
      add: function (customer) {
        var row = normalizeCustomer(
          Object.assign(
            {
              id: store.generateId('cust'),
              tags: [],
              productIds: [],
              statusStrip: 'blue',
              status: 'Discovery',
            },
            customer
          )
        );
        state.customers = (state.customers || []).concat([row]);
        logActivity({
          icon: '➕',
          text: '<strong>' + row.name + '</strong> added to engagements',
          customerId: row.id,
          customerName: row.name,
        });
        persist();
        return row;
      },
      update: function (id, patch) {
        var prev = null;
        state.customers = (state.customers || []).map(function (c) {
          if (c.id !== id) return c;
          prev = c;
          return normalizeCustomer(Object.assign({}, c, patch));
        });
        if (prev && patch.status && patch.status !== prev.status) {
          logActivity({
            icon: '🔴',
            text:
              '<strong>' +
              prev.name +
              '</strong> status changed to <span class="cc-feed-accent">' +
              patch.status +
              '</span>',
            customerId: id,
            customerName: prev.name,
          });
        } else {
          persist();
        }
        return useCustomers().getById(id);
      },
      remove: function (id) {
        state.customers = (state.customers || []).filter(function (c) {
          return c.id !== id;
        });
        persist();
      },
    };
  }

  function useTasks() {
    return {
      getAll: function () {
        return (state.tasks || []).slice();
      },
      getOpen: function () {
        return (state.tasks || []).filter(function (t) {
          return !t.completed;
        });
      },
      add: function (task) {
        var row = Object.assign({ id: store.generateId('task'), completed: false }, task);
        state.tasks = (state.tasks || []).concat([row]);
        persist();
        return row;
      },
      toggle: function (id, completed) {
        var task = null;
        state.tasks = (state.tasks || []).map(function (t) {
          if (t.id !== id) return t;
          task = Object.assign({}, t, { completed: completed !== false });
          return task;
        });
        if (task && task.completed) {
          logActivity({
            icon: '✅',
            text: 'Task completed: <strong>' + task.title + '</strong>',
            customerName: task.customerName || '',
          });
        } else {
          persist();
        }
        return task;
      },
      update: function (id, patch) {
        state.tasks = (state.tasks || []).map(function (t) {
          return t.id === id ? Object.assign({}, t, patch) : t;
        });
        persist();
      },
    };
  }

  function normalizeMeetingAt(raw) {
    var at = String(raw || '').trim();
    if (!at) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at + 'T10:00:00';
    return at;
  }

  function meetingDateKey(at) {
    var day = String(at || '').slice(0, 10);
    return parseDateOnly(day) ? day : '';
  }

  function truncateText(text, max) {
    var s = String(text || '').trim();
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + '…';
  }

  function buildMeetingFromCustomer(c) {
    if (!c || !c.eta) return null;
    var at = normalizeMeetingAt(c.eta);
    if (!at) return null;
    var tags = Array.isArray(c.tags) ? c.tags.slice(0, 4) : [];
    if (c.status && tags.indexOf(c.status) === -1) tags.unshift(c.status);
    var productLine = products ? products.formatProductIds(c.productIds) : '';
    var contextParts = [];
    if (productLine) contextParts.push(productLine);
    if (c.status) contextParts.push(c.status);
    if (c.drLink) contextParts.push(c.drLink);
    var nextAction = String(c.nextAction || '').trim();
    var titleSuffix = nextAction || c.status || 'Engagement check-in';
    return {
      id: 'customer-eta-' + c.id,
      source: 'customer',
      customerId: c.id,
      customerName: c.name,
      at: at,
      title: c.name + ' — ' + truncateText(titleSuffix, 52),
      context: contextParts.join(' · '),
      prep: nextAction ? 'Next action: ' + nextAction : '',
      tags: tags,
    };
  }

  function mergeMeetings(explicit, fromCustomers) {
    var out = explicit.slice();
    var seen = {};
    explicit.forEach(function (m) {
      if (m.customerId) seen[m.customerId + '|' + meetingDateKey(m.at)] = true;
    });
    fromCustomers.forEach(function (m) {
      var key = m.customerId + '|' + meetingDateKey(m.at);
      if (seen[key]) return;
      seen[key] = true;
      out.push(m);
    });
    return out;
  }

  function isUpcomingMeeting(m, nowMs) {
    var atMs = new Date(m.at).getTime();
    if (m.source === 'customer') {
      var etaDay = String(m.at).slice(0, 10);
      if (isOverdue(etaDay)) return true;
    }
    return atMs >= nowMs - 3600000;
  }

  function sortMeetings(list) {
    return list.slice().sort(function (a, b) {
      return new Date(a.at) - new Date(b.at);
    });
  }

  function getMergedMeetings() {
    var explicit = (state.meetings || []).slice();
    var fromCustomers = useCustomers()
      .getAll()
      .map(buildMeetingFromCustomer)
      .filter(Boolean);
    return mergeMeetings(explicit, fromCustomers);
  }

  function useCalendar() {
    return {
      getAll: function () {
        return getMergedMeetings();
      },
      getUpcoming: function (limit) {
        var now = Date.now();
        return sortMeetings(
          getMergedMeetings().filter(function (m) {
            return isUpcomingMeeting(m, now);
          })
        ).slice(0, limit || 4);
      },
      add: function (meeting) {
        var row = Object.assign({ id: store.generateId('mtg'), tags: [] }, meeting);
        state.meetings = (state.meetings || []).concat([row]);
        logActivity({
          icon: '🗓️',
          text: '<strong>' + (row.customerName || row.title) + '</strong> meeting scheduled',
        });
        return row;
      },
    };
  }

  function useActivity() {
    return {
      getRecent: function (limit) {
        return (state.activity || []).slice(0, limit || 8);
      },
      log: logActivity,
    };
  }

  function usePocs() {
    return {
      getAll: function () {
        return normalizePocs(state.pocs || []);
      },
      getById: function (id) {
        var p = (state.pocs || []).find(function (row) {
          return row.id === id;
        });
        return p ? normalizePoc(p) : null;
      },
      add: function (poc) {
        var row = normalizePoc(
          Object.assign(
            {
              id: store.generateId('poc'),
              statusStrip: 'blue',
              progress: 0,
              productIds: [],
            },
            poc
          )
        );
        state.pocs = (state.pocs || []).concat([row]);
        persist();
        return row;
      },
      update: function (id, patch) {
        state.pocs = (state.pocs || []).map(function (p) {
          return p.id === id ? normalizePoc(Object.assign({}, p, patch)) : p;
        });
        persist();
        return usePocs().getById(id);
      },
      remove: function (id) {
        state.pocs = (state.pocs || []).filter(function (p) {
          return p.id !== id;
        });
        persist();
      },
    };
  }

  function useKnowledgeBase() {
    return {
      getAll: function () {
        return (state.knowledgeBase || []).slice();
      },
    };
  }

  function getCapacity() {
    return (state.capacity || []).slice();
  }

  function parseDateOnly(iso) {
    if (!iso) return null;
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function isOverdue(dateStr) {
    var d = parseDateOnly(dateStr);
    if (!d) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
  }

  function isDueSoon(dateStr, days) {
    var d = parseDateOnly(dateStr);
    if (!d) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    var diff = (d - today) / 86400000;
    return diff >= 0 && diff <= (days || 7);
  }

  function formatArr(amount) {
    var n = Number(amount) || 0;
    if (n >= 1000000) return '£' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return '£' + Math.round(n / 1000) + 'k';
    return '£' + n;
  }

  function computeMetrics() {
    var customers = useCustomers().getAll();
    var openTasks = useTasks().getOpen();
    var overdueTasks = openTasks.filter(function (t) {
      return isOverdue(t.due);
    });
    var meetings = useCalendar().getAll();
    var pocs = usePocs().getAll();
    var now = new Date();
    var weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    var meetingsThisWeek = meetings.filter(function (m) {
      var d = new Date(m.at);
      return d >= now && d <= weekEnd;
    });
    var todayMeetings = meetings.filter(function (m) {
      var d = new Date(m.at);
      return d.toDateString() === now.toDateString();
    });

    var healthScores = customers.map(function (c) {
      if (c.statusStrip === 'green') return 100;
      if (c.statusStrip === 'blue' || c.statusStrip === 'purple') return 85;
      if (c.statusStrip === 'amber') return 55;
      if (c.statusStrip === 'red') return 25;
      return 70;
    });
    var avgHealth = healthScores.length
      ? Math.round(
          healthScores.reduce(function (a, b) {
            return a + b;
          }, 0) / healthScores.length
        )
      : 0;
    var atRisk = customers.filter(function (c) {
      return c.statusStrip === 'red' || c.statusStrip === 'amber';
    }).length;

    var pocsInFlight = pocs.filter(function (p) {
      return p.status !== 'Complete';
    }).length;

    var totalPipeline = customers.reduce(function (sum, c) {
      return sum + (Number(c.arr) || 0);
    }, 0);
    var arrAtRisk = customers
      .filter(function (c) {
        return c.pipelineRisk === 'High' || c.statusStrip === 'red';
      })
      .reduce(function (sum, c) {
        return sum + (Number(c.arr) || 0);
      }, 0);
    var atRiskNames = customers
      .filter(function (c) {
        return c.pipelineRisk === 'High' || c.statusStrip === 'red';
      })
      .map(function (c) {
        return c.name.split(' ')[0];
      })
      .slice(0, 2)
      .join(' + ');

    return {
      activeCustomers: customers.length,
      overdueActions: overdueTasks.length,
      meetingsThisWeek: meetingsThisWeek.length,
      meetingsToday: todayMeetings.length,
      avgEtaHealth: avgHealth,
      atRiskCount: atRisk,
      openEngagements: customers.length,
      pocsInFlight: pocsInFlight,
      totalPipeline: totalPipeline,
      arrAtRisk: arrAtRisk,
      arrAtRiskLabel: atRiskNames || 'None',
    };
  }

  function reloadForScope() {
    if (rtdb) rtdb.resetScope();
    initPromise = null;
    initDone = false;
    init().then(notifyListeners);
  }

  function init() {
    if (initDone) return Promise.resolve(state);
    if (initPromise) return initPromise;

    initPromise = connectRtdb()
      .then(function (remote) {
        var local = store.loadState();
        if (remote && remote.customers && remote.customers.length) {
          state = remote;
          state.customers = normalizeCustomers(state.customers);
          state.pocs = normalizePocs(state.pocs);
          seeded = true;
          store.saveLocalCache(state);
        } else if (local.customers && local.customers.length) {
          state = local;
          state.customers = normalizeCustomers(state.customers);
          state.pocs = normalizePocs(state.pocs);
          seeded = true;
          if (rtdb && rtdb.isAuthenticated()) rtdb.saveState(state);
        } else {
          state = local;
          seedIfEmpty();
        }
        initDone = true;
        return state;
      })
      .catch(function () {
        state = store.loadState();
        state.customers = normalizeCustomers(state.customers);
        state.pocs = normalizePocs(state.pocs);
        seedIfEmpty();
        initDone = true;
        return state;
      })
      .then(function (s) {
        var scrapesMod = global.HomeCommandScrapes;
        if (!scrapesMod || typeof scrapesMod.loadCatalog !== 'function') return s;
        return scrapesMod.loadCatalog().then(function () {
          return s;
        });
      });

    if (!global.__aepCommandCentreScopeBound) {
      global.__aepCommandCentreScopeBound = true;
      global.addEventListener('aep-global-sandbox-change', reloadForScope);
      global.addEventListener('aep-lab-email-session-updated', reloadForScope);
      // Google-authenticated session switches dispatch a separate event
      // (aep-access-onboarding.js) — without this, an SPA-level identity
      // switch via Google sign-in never resets the cached workspace slug,
      // so the previous user's Command Centre data can keep showing.
      global.addEventListener('aep-lab-google-session-updated', reloadForScope);
    }

    return initPromise;
  }

  global.HomeCommandData = {
    init: init,
    subscribe: subscribe,
    useCustomers: useCustomers,
    useTasks: useTasks,
    useCalendar: useCalendar,
    useActivity: useActivity,
    usePocs: usePocs,
    useKnowledgeBase: useKnowledgeBase,
    getCapacity: getCapacity,
    computeMetrics: computeMetrics,
    formatArr: formatArr,
    isOverdue: isOverdue,
    isDueSoon: isDueSoon,
    parseDateOnly: parseDateOnly,
    reloadForScope: reloadForScope,
    getState: function () {
      return state;
    },
    getSyncStatus: function () {
      return rtdb ? rtdb.getSyncStatus() : 'local-only';
    },
  };
})(window);
