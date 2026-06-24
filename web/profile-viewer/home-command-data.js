/**
 * Command Centre data layer — customers, tasks, calendar, activity (localStorage-backed).
 */
(function attachHomeCommandData(global) {
  'use strict';

  var store = global.HomeCommandStore;
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
    var now = new Date();
    function daysFromNow(n) {
      var d = new Date(now);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    }
    function daysAgo(n) {
      return daysFromNow(-n);
    }

    state.customers = [
      {
        id: store.generateId('cust'),
        name: 'Aviva',
        products: 'AJO · Real-Time CDP',
        tags: ['Journey Arbitration', 'Phase 2'],
        notes: 'Profile merge strategy under review. Edge decisioning scope confirmed.',
        drLink: 'DR-2024-0441',
        drUrl: '',
        status: 'On track',
        statusStrip: 'green',
        eta: daysFromNow(20),
        lastMeeting: daysAgo(7),
        nextAction: 'Share updated journey schema with Aviva dev team',
        demoLink: '',
      },
      {
        id: store.generateId('cust'),
        name: 'Sky',
        products: 'AJO · Campaign v8',
        tags: ['Broadband Upsell', 'At Risk'],
        notes: 'Blockers on data governance sign-off. Stakeholder alignment needed.',
        drLink: 'DR-2024-0388',
        status: 'At risk',
        statusStrip: 'red',
        eta: daysAgo(2),
        lastMeeting: daysAgo(14),
        nextAction: 'Escalate governance blocker — book exec call',
      },
      {
        id: store.generateId('cust'),
        name: 'Lloyds Banking',
        products: 'Real-Time CDP · CJA',
        tags: ['Audience Activation'],
        notes: 'Awaiting IT environment provisioning. Analytics dashboard review scheduled.',
        drLink: 'DR-2025-0112',
        status: 'Delayed',
        statusStrip: 'amber',
        eta: daysFromNow(37),
        lastMeeting: daysAgo(4),
        nextAction: 'Chase IT provisioning ETA with Lloyds PM',
      },
      {
        id: store.generateId('cust'),
        name: 'BT Group',
        products: 'AJO · Decisioning',
        tags: ['Next Best Offer', 'Discovery'],
        notes: 'Early discovery phase. Use case mapping workshop booked for July.',
        drLink: 'DR-2025-0219',
        status: 'Discovery',
        statusStrip: 'blue',
        eta: daysFromNow(90),
        lastMeeting: daysAgo(6),
        nextAction: 'Prepare use case canvas for workshop',
      },
    ];

    state.tasks = [
      {
        id: store.generateId('task'),
        title: 'Send Sky exec escalation email',
        customerId: state.customers[1].id,
        customerName: 'Sky',
        due: daysAgo(4),
        completed: false,
      },
      {
        id: store.generateId('task'),
        title: 'Share Aviva journey schema',
        customerId: state.customers[0].id,
        customerName: 'Aviva',
        due: daysFromNow(0),
        completed: false,
      },
      {
        id: store.generateId('task'),
        title: 'Chase Lloyds IT provisioning ETA',
        customerId: state.customers[2].id,
        customerName: 'Lloyds Banking',
        due: daysFromNow(2),
        completed: false,
      },
    ];

    state.meetings = [
      {
        id: store.generateId('mtg'),
        at: daysFromNow(0) + 'T14:00:00',
        title: 'Barclays — Kick-off',
        context: 'CJA onboarding sync',
        tags: ['CJA', 'New'],
        customerName: 'Barclays',
      },
      {
        id: store.generateId('mtg'),
        at: daysFromNow(1) + 'T10:30:00',
        title: 'Sky — Governance Review',
        context: 'Stakeholder alignment',
        tags: ['At Risk'],
        customerName: 'Sky',
      },
      {
        id: store.generateId('mtg'),
        at: daysFromNow(2) + 'T09:00:00',
        title: 'M&S — UAT Debrief',
        context: 'AJO go-live readiness',
        tags: ['UAT'],
        customerName: 'M&S',
      },
    ];

    state.activity = [
      {
        id: store.generateId('act'),
        icon: '📋',
        text: '<strong>Aviva</strong> schema v3.2 doc linked to DR-2024-0441',
        at: new Date(now.getTime() - 86400000 * 2).toISOString(),
      },
      {
        id: store.generateId('act'),
        icon: '⚠️',
        text: '<strong>Sky</strong> ETA flagged as at-risk by PM',
        at: new Date(now.getTime() - 86400000 * 4).toISOString(),
      },
    ];

    seeded = true;
    persist();
  }

  function useCustomers() {
    return {
      getAll: function () {
        return (state.customers || []).slice();
      },
      getById: function (id) {
        return (state.customers || []).find(function (c) {
          return c.id === id;
        });
      },
      add: function (customer) {
        var row = Object.assign(
          {
            id: store.generateId('cust'),
            tags: [],
            statusStrip: 'blue',
            status: 'Discovery',
          },
          customer
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
          return Object.assign({}, c, patch);
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

  function computeMetrics() {
    var customers = useCustomers().getAll();
    var openTasks = useTasks().getOpen();
    var overdueTasks = openTasks.filter(function (t) {
      return isOverdue(t.due);
    });
    var meetings = useCalendar().getAll();
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
      ? Math.round(healthScores.reduce(function (a, b) {
          return a + b;
        }, 0) / healthScores.length)
      : 0;
    var atRisk = customers.filter(function (c) {
      return c.statusStrip === 'red' || c.statusStrip === 'amber';
    }).length;

    return {
      activeCustomers: customers.length,
      overdueActions: overdueTasks.length,
      meetingsThisWeek: meetingsThisWeek.length,
      meetingsToday: todayMeetings.length,
      avgEtaHealth: avgHealth,
      atRiskCount: atRisk,
      openEngagements: customers.length,
    };
  }

  function reloadForScope() {
    state = store.loadState();
    seeded = !!(state.customers && state.customers.length);
    if (!seeded) {
      seedIfEmpty();
    } else {
      store.saveState(state);
    }
  }

  function init() {
    seedIfEmpty();
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
    computeMetrics: computeMetrics,
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
