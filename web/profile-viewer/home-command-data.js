/**
 * Command Centre data layer — customers, tasks, calendar, activity (localStorage-backed).
 */
(function attachHomeCommandData(global) {
  'use strict';

  var store = global.HomeCommandStore;
  var products = global.HomeCommandProducts;
  if (!store) return;

  var state = store.loadState();
  var seeded = false;

  function persist() {
    state = store.saveState(state);
  }

  function subscribe(fn) {
    return store.subscribe(function (next) {
      state = next;
      fn(state);
    });
  }

  function normalizeCustomer(c) {
    if (!c) return c;
    var row = Object.assign({}, c);
    row.productIds = products ? products.normalizeProductIds(row) : row.productIds || [];
    if (!Array.isArray(row.nextSteps)) row.nextSteps = [];
    if (!Array.isArray(row.stakeholders)) row.stakeholders = [];
    if (!Array.isArray(row.milestones)) row.milestones = [];
    if (!Array.isArray(row.meetingHistory)) row.meetingHistory = [];
    return row;
  }

  function normalizeCustomers(list) {
    return (list || []).map(normalizeCustomer);
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
        }
        persist();
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
        }
        persist();
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

  function useCalendar() {
    return {
      getAll: function () {
        return (state.meetings || []).slice();
      },
      getUpcoming: function (limit) {
        var now = Date.now();
        return (state.meetings || [])
          .filter(function (m) {
            return new Date(m.at).getTime() >= now - 3600000;
          })
          .sort(function (a, b) {
            return new Date(a.at) - new Date(b.at);
          })
          .slice(0, limit || 4);
      },
      add: function (meeting) {
        var row = Object.assign({ id: store.generateId('mtg'), tags: [] }, meeting);
        state.meetings = (state.meetings || []).concat([row]);
        logActivity({
          icon: '🗓️',
          text: '<strong>' + (row.customerName || row.title) + '</strong> meeting scheduled',
        });
        persist();
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
        return (state.pocs || []).slice();
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
    state = store.loadState();
    seeded = !!(state.customers && state.customers.length);
    if (!seeded) {
      seedIfEmpty();
    } else {
      state.customers = normalizeCustomers(state.customers);
      store.saveState(state);
    }
  }

  function init() {
    seedIfEmpty();
    state.customers = normalizeCustomers(state.customers);
    global.addEventListener('aep-global-sandbox-change', reloadForScope);
    global.addEventListener('aep-lab-email-session-updated', reloadForScope);
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
  };

  init();
})(window);
