/**
 * Rich seed dataset for Command Centre (first visit per user+sandbox).
 */
(function attachHomeCommandSeedData(global) {
  'use strict';

  function buildSeed(store, now) {
    function daysFromNow(n) {
      var d = new Date(now);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    }
    function daysAgo(n) {
      return daysFromNow(-n);
    }

    var customers = [
      {
        name: 'Aviva',
        productIds: ['ajoJ', 'cdp'],
        tags: ['Journey Arb', 'Phase 2'],
        notes: 'Profile merge strategy confirmed. Edge decisioning scope agreed.',
        drLink: 'DR-2024-0441',
        status: 'On track',
        statusStrip: 'green',
        eta: daysFromNow(20),
        lastMeeting: daysAgo(7),
        nextAction: 'Share updated journey schema with Aviva dev team',
        nextSteps: [
          { text: 'Profile schema review', done: true },
          { text: 'Sandbox provisioned', done: true },
          { text: 'Share journey schema v3.2', done: false },
          { text: 'Edge config workshop', done: false },
        ],
        arr: 380000,
        pipelineStage: 'Implementation',
        pipelineRisk: 'Low',
        stakeholders: [
          { initials: 'SR', name: 'Sarah Rawlings', role: 'CX Director · Champion', sentiment: 'Positive', color: '#3b82f6' },
        ],
        milestones: [
          { label: 'Discovery & scoping', status: 'done', date: '15 May' },
          { label: 'Schema sign-off', status: 'active', date: 'due 24 Jun' },
        ],
        meetingHistory: [
          { date: '17 Jun', text: 'Schema v3.2 walkthrough — decision: approved with minor amendments' },
        ],
        scNotes: 'OneTrust consent integration not yet scoped — could add 2 weeks.',
        scrapeBrand: 'Aviva',
      },
      {
        name: 'Sky',
        productIds: ['ajoJ', 'campaign'],
        tags: ['Broadband Upsell', 'At Risk'],
        notes: 'Governance blocker — data residency sign-off stalled.',
        drLink: 'DR-2024-0388',
        status: 'At risk',
        statusStrip: 'red',
        eta: daysAgo(2),
        lastMeeting: daysAgo(14),
        nextAction: 'Escalate governance blocker — book exec call with CPO',
        nextSteps: [
          { text: 'Journey design workshop', done: true },
          { text: 'Resolve governance blocker', done: false },
        ],
        arr: 620000,
        pipelineStage: 'Blocked',
        pipelineRisk: 'High',
        competitiveThreat: { vendor: 'Salesforce MC', level: 'High', detail: 'Evaluated as fallback if governance blocker persists.', counter: 'EU data residency confirmation letter from Adobe Legal' },
      },
      {
        name: 'Lloyds Banking',
        productIds: ['cdp', 'cja'],
        tags: ['Audience Activation'],
        notes: 'IT provisioning delayed. Analytics dashboard review scheduled.',
        drLink: 'DR-2025-0112',
        status: 'Delayed',
        statusStrip: 'amber',
        eta: daysFromNow(37),
        lastMeeting: daysAgo(4),
        nextAction: 'Chase IT provisioning ETA with Lloyds PM',
        arr: 290000,
        pipelineStage: 'Delivery',
        pipelineRisk: 'Med',
      },
      {
        name: 'BT Group',
        productIds: ['ajoDecisioning', 'ajoJ'],
        tags: ['Next Best Offer', 'Discovery'],
        notes: 'Early discovery. Use case mapping workshop booked 30 Jun.',
        drLink: 'DR-2025-0219',
        status: 'Discovery',
        statusStrip: 'blue',
        eta: daysFromNow(90),
        lastMeeting: daysAgo(6),
        nextAction: 'Prepare use case canvas for workshop',
        arr: 500000,
        pipelineStage: 'Discovery',
        pipelineRisk: 'Low',
        competitiveThreat: { vendor: 'Braze', level: 'Watch', detail: 'Parallel mobile engagement conversations.', counter: 'Show arbitration sandbox demo' },
      },
      {
        name: 'Marks & Spencer',
        productIds: ['ajoJ', 'target'],
        tags: ['Personalisation', 'UAT'],
        notes: 'UAT in progress. Go-live approval pending brand team sign-off.',
        drLink: 'DR-2024-0501',
        status: 'UAT',
        statusStrip: 'green',
        eta: daysFromNow(11),
        lastMeeting: daysAgo(1),
        nextAction: 'Review UAT results doc and flag blockers',
        arr: 220000,
        pipelineStage: 'UAT',
        pipelineRisk: 'Low',
      },
      {
        name: 'Virgin Media O2',
        productIds: ['campaign', 'cdp'],
        tags: ['Churn Prevention', 'Stalled'],
        notes: 'Model scoring pipeline stalled. No response from data team in 2+ weeks.',
        drLink: 'DR-2025-0077',
        status: 'Stalled',
        statusStrip: 'red',
        eta: daysAgo(10),
        lastMeeting: daysAgo(21),
        nextAction: 'Send follow-up to data team + escalate to CSM',
        arr: 580000,
        pipelineStage: 'Stalled',
        pipelineRisk: 'High',
        competitiveThreat: { vendor: 'Salesforce', level: 'Watch', detail: 'Historical incumbent if programme deprioritised.', counter: 'Re-engage champion Tom Nguyen' },
      },
      {
        name: 'Barclays',
        productIds: ['cja', 'brandVisibility'],
        tags: ['Reporting', 'New'],
        notes: 'Kick-off complete. Data connections being configured.',
        drLink: 'DR-2026-0003',
        status: 'Onboarding',
        statusStrip: 'purple',
        eta: daysFromNow(100),
        lastMeeting: daysAgo(0),
        nextAction: 'Send sandbox access credentials and onboarding guide',
        arr: 160000,
        pipelineStage: 'Onboarding',
        pipelineRisk: 'Low',
      },
    ].map(function (c) {
      return Object.assign({ id: store.generateId('cust'), tags: [], demoLink: '', drUrl: '' }, c);
    });

    var pocs = [
      { customerId: customers[0].id, name: 'Aviva · Edge Decisioning PoC', productIds: ['ajoJ', 'ajoDecisioning'], target: customers[0].eta, status: 'In build', statusStrip: 'amber', progress: 65 },
      { customerId: customers[3].id, name: 'BT Group · NBO Sandbox Demo', productIds: ['ajoDecisioning'], target: '15 Aug', status: 'Scoping', statusStrip: 'blue', progress: 15 },
      { customerId: customers[4].id, name: 'M&S · Personalisation Go-live', productIds: ['ajoJ', 'target'], target: customers[4].eta, status: 'UAT', statusStrip: 'green', progress: 90 },
      { customerId: customers[2].id, name: 'Lloyds · Audience Activation Demo', productIds: ['cdp'], target: 'Blocked on IT', status: 'Blocked', statusStrip: 'red', progress: 40 },
    ].map(function (p) {
      return Object.assign({ id: store.generateId('poc') }, p);
    });

    var knowledgeBase = [
      { icon: '📄', title: 'Journey Arbitration — Reference Architecture', meta: 'Updated 10 Jun · PPTX', usage: 'Used 12×', bg: 'blue' },
      { icon: '🎯', title: 'NBO Decisioning Sandbox — FS Template', meta: 'Updated 5 Jun · AEP Config', usage: 'Used 8×', bg: 'green' },
      { icon: '⚔️', title: 'Battlecard: AJO vs Salesforce MC', meta: 'Updated 1 Jun · PDF', usage: 'Used 14×', bg: 'amber' },
      { icon: '🔒', title: 'EU Data Residency — Adobe Legal FAQ', meta: 'Updated 15 Jun · PDF', usage: 'Used 3×', bg: 'teal' },
    ];

    return {
      customers: customers,
      pocs: pocs,
      knowledgeBase: knowledgeBase,
      tasks: [
        { title: 'Sky — send exec escalation email re governance', customerId: customers[1].id, customerName: 'Sky', due: daysAgo(4), completed: false, priority: 'high' },
        { title: 'VMO2 — find new data lead contact + re-kick-off', customerId: customers[5].id, customerName: 'Virgin Media O2', due: daysAgo(7), completed: false, priority: 'high' },
        { title: 'Aviva — share journey schema v3.2', customerId: customers[0].id, customerName: 'Aviva', due: daysFromNow(0), completed: false, priority: 'high' },
        { title: 'Barclays — send sandbox credentials + onboarding doc', customerId: customers[6].id, customerName: 'Barclays', due: daysFromNow(3), completed: false, priority: 'med' },
        { title: 'BT — prepare NBO use case canvas for workshop', customerId: customers[3].id, customerName: 'BT Group', due: daysFromNow(4), completed: false, priority: 'med' },
        { title: 'Lloyds — chase IT provisioning ETA from David Trent', customerId: customers[2].id, customerName: 'Lloyds Banking', due: daysFromNow(2), completed: false, priority: 'low' },
      ].map(function (t) {
        return Object.assign({ id: store.generateId('task') }, t);
      }),
      meetings: [
        { at: daysFromNow(0) + 'T14:00:00', title: 'Barclays — Kick-off debrief', context: 'CJA onboarding · MS Teams', prep: 'Prep: onboarding guide ready?', tags: ['CJA', 'New'], customerName: 'Barclays' },
        { at: daysFromNow(1) + 'T10:30:00', title: 'Sky — Governance Escalation', context: 'CPO + Legal · Zoom', prep: 'Prep: Adobe EU residency doc', tags: ['At Risk'], customerName: 'Sky' },
        { at: daysFromNow(2) + 'T09:00:00', title: 'M&S — UAT Debrief', context: 'AJO go-live readiness', tags: ['UAT'], customerName: 'Marks & Spencer' },
        { at: daysFromNow(6) + 'T11:00:00', title: 'BT Group — Use Case Workshop', context: 'Discovery · on-site London', prep: 'Prep: NBO canvas + Vodafone ref', tags: ['Discovery'], customerName: 'BT Group' },
      ].map(function (m) {
        return Object.assign({ id: store.generateId('mtg'), tags: [] }, m);
      }),
      activity: [
        { icon: '📋', text: '<strong>Barclays</strong> kick-off complete — notes logged', at: new Date(now.getTime() - 3600000).toISOString() },
        { icon: '🔴', text: '<strong>Virgin Media O2</strong> status changed to <span class="cc-feed-accent">Stalled</span>', at: new Date(now.getTime() - 86400000).toISOString() },
        { icon: '✅', text: '<strong>M&S</strong> UAT milestone marked complete', at: new Date(now.getTime() - 86400000 * 2).toISOString() },
      ].map(function (a) {
        return Object.assign({ id: store.generateId('act') }, a);
      }),
      capacity: [
        { label: 'Sky — escalation', pct: 30, color: 'red' },
        { label: 'BT — workshop prep', pct: 25, color: 'blue' },
        { label: 'Aviva — schema / PoC', pct: 20, color: 'green' },
        { label: 'M&S — UAT review', pct: 12, color: 'amber' },
        { label: 'Barclays — onboarding', pct: 8, color: 'purple' },
        { label: 'Admin / other', pct: 5, color: 'dim' },
      ],
    };
  }

  global.HomeCommandSeedData = { buildSeed: buildSeed };
})(window);
