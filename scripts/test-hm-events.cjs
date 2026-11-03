const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const events = require('../web/profile-viewer/hm-events.js');
const { buildGeneratorEdgeInteractXdm } = require('../functions/eventEdgeService');
const { EVENT_INDUSTRY_FIELD_GROUP_SPECS } = require('../functions/eventIndustryFieldGroups');
const ctx = { sandbox: 'test', ecid: '12345678901234567890123456789012345678', known: false,
  page: 'product', target: { id: 'lab-event-tool-edge', transport: 'edge', dataStreamId: 'test-stream', xdmStyle: 'minimal' } };
const payload = { items: [{ sku: 'hm-1', name: 'Cotton shirt', price: 99.95, qty: 2, size: 'M', color: 'White' }], total: 199.90 };

function schemaFixture() {
  const schema = { properties: {} };
  for (const required of events.REQUIRED_PATHS) {
    let node = schema;
    for (const key of required.split('.')) {
      node.properties ||= {};
      node.properties[key] ||= {};
      node = node.properties[key];
      if (key === 'productListItems') { node.type = 'array'; node.items ||= {}; node = node.items; }
    }
    node.type = /quantity|priceTotal|orderValue$/.test(required) ? 'number' : 'string';
  }
  return schema;
}

test('all shopping events use the existing full Lab transport and exact AED quantities', () => {
  for (const type of Object.keys(events.TYPES)) {
    const body = events.build(type, { ...payload, orderId: 'HM-demo-123' }, ctx);
    assert.equal(body.eventType, events.TYPES[type]);
    assert.equal(body.xdmStyle, 'full');
    assert.equal(body.public.retail.orderValue, 199.9);
    assert.deepEqual(body.message.productListItems, [{ SKU: 'hm-1', name: 'Cotton shirt', quantity: 2, priceTotal: 199.9 }]);
    assert.equal(body.message.currencyCode, 'AED');
    assert.equal(body.email, undefined);
    assert.equal(body.public.retail.cartId, type === 'purchase' ? 'HM-demo-123' : 'hm-demo-bag');
    const xdm = buildGeneratorEdgeInteractXdm(body, ctx.target);
    assert.equal(xdm.eventType, events.TYPES[type]);
    assert.equal(xdm.identityMap.ECID[0].id, ctx.ecid);
    assert.equal(xdm.identityMap.ECID[0].primary, true);
    assert.equal(xdm.identityMap.Email, undefined);
    assert.deepEqual(xdm._demoemea.message.productListItems, body.message.productListItems);
    assert.equal(xdm._demoemea.message.currencyCode, 'AED');
    for (const slice of ['retail', 'generic']) {
      const allowed = EVENT_INDUSTRY_FIELD_GROUP_SPECS.find((spec) => spec.industryId === slice).properties;
      assert(Object.keys(xdm._demoemea.public[slice]).every((key) => Object.hasOwn(allowed, key)));
    }
  }
});
test('invalid actions, identities, prices, totals and quantities cannot masquerade as success', () => {
  assert.throws(() => events.build('login', payload, ctx));
  assert.throws(() => events.build('add', payload, { ...ctx, ecid: '' }));
  assert.throws(() => events.build('add', payload, { ...ctx, known: true, email: 'bad' }));
  assert.throws(() => events.build('add', payload, { ...ctx, target: { ...ctx.target, transport: 'streaming' } }));
  for (const change of [{ qty: 0 }, { qty: 1.5 }, { qty: 100 }, { price: NaN }, { price: -1 }, { price: 0.001 }, { sku: '<script>' }]) {
    assert.throws(() => events.build('add', { items: [{ ...payload.items[0], ...change }] }, ctx));
  }
  assert.throws(() => events.build('add', { ...payload, total: 200 }, ctx));
  assert.throws(() => events.build('purchase', payload, ctx));
  const known = events.build('add', payload, { ...ctx, known: true, email: 'synthetic@example.test' });
  assert.equal(known.email, 'synthetic@example.test');
  assert.equal(events.redact(known).email, '(hidden)');
  assert.equal(events.redact(known).ecid, '(hidden)');
});
test('schema preflight requires every measurement leaf, including array items and currency', () => {
  assert.deepEqual(events.missingSchemaPaths(schemaFixture()), []);
  const schema = schemaFixture();
  delete schema.properties._demoemea.properties.message.properties.currencyCode;
  assert.deepEqual(events.missingSchemaPaths(schema), ['_demoemea.message.currencyCode']);
  assert.deepEqual(events.missingSchemaPaths({ allOf: [schemaFixture()] }), []);
  assert.equal(events.missingSchemaPaths({}).length, events.REQUIRED_PATHS.length);
  const invalidType = schemaFixture();
  invalidType.properties._demoemea.properties.public.properties.retail.properties.orderValue.type = 'string';
  assert.deepEqual(events.missingSchemaPaths(invalidType), ['_demoemea.public.retail.orderValue']);
});

function labHarness() {
  const listeners = new Map(), elements = new Map(), requests = [], sdkCalls = [];
  const storage = () => {
    const map = new Map();
    return { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
  };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'generatorTarget' ? 'lab-event-tool-edge' : id === 'hmNs' ? 'email' : '',
      checked: false, textContent: '', hidden: false, dataset: {}, children: [],
      addEventListener(name, fn) { this[name] = fn; },
      setAttribute() {}, focus() {}, showModal() {}, close() {},
      dispatchEvent(event) { this[event.type]?.(event); },
      prepend(row) { this.children.unshift(row); },
    });
    return elements.get(id);
  }
  let sandbox = 'test', fail = '', blocked = false, changeAfter = false, schema = schemaFixture(), adapter, badLookup = false;
  const target = ctx.target;
  const window = {
    HmEvents: events, sessionStorage: storage(), localStorage: storage(), crypto: { randomUUID: () => 'request-1' },
    addEventListener(name, fn) { listeners.set(name, fn); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
    requestAnimationFrame: (fn) => fn(),
    envBar: { ready: async () => {}, registerTagsInjection() {} },
    AepIdentityPicker: { init() {}, getNamespace: () => element('hmNs').value },
    attachEmailDatalist() {},
    DemoLabEdgeConfig: { edgeConfigOverrides: () => ({ edgeConfigOverrides: { datastreamId: 'test-stream' } }) },
    DemoTagsInjection: {
      isAlloyReady: () => true,
      init(options) { window.resolveEcid = options.onEcidResolved; return { stitchAfterProfileLookup: async () => true }; },
    },
    DemoProfileDrawer: {
      init() {}, refreshDrawerEventsForIdentity: async () => {},
      loadProfileDataForDrawer: async () => {
        window.dispatchEvent({ type: 'aep-profile-drawer-loaded', detail: { found: !badLookup, identifier: element('customerEmail').value, namespace: 'email' } });
        return !badLookup;
      },
    },
    AepDemoVisitorReset: { isBlocked: () => blocked, registerAdapter: (value) => { adapter = value; } },
    AepDemoGeneratorTargets: {
      getSandboxName: () => sandbox, bindGeneratorTargetLifecycle() {},
      loadGeneratorTargetsIntoSelect: async () => [target],
      labAuthFetch: async (url, options) => {
        requests.push({ url, options });
        if (url === '/api/events/generator') {
          if (fail === 'network') throw new Error('Network failed');
          if (changeAfter) { sandbox = 'changed'; window.dispatchEvent({ type: 'aep-global-sandbox-change' }); }
          return { ok: !fail, status: fail === 'reject' ? 400 : fail ? 503 : 200,
            json: async () => fail === 'malformed' ? null : ({ ok: !fail, error: fail || undefined }) };
        }
        const data = url.includes('/generator-targets') ? { sandbox, targets: [target] } :
          url.includes('/events/config') ? { record: { schemaId: 'schema-1', datastreamId: 'test-stream' } } :
          url.includes('/profile/consent') ? { found: true, email: element('customerEmail').value } : { schema };
        return { ok: true, status: 200, json: async () => data };
      },
    },
    alloy: async (...args) => { sdkCalls.push(args); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/profile-viewer/hm-demo.js'), 'utf8'), {
    window, document: { getElementById: element, createElement: () => ({ textContent: '' }) },
    CustomEvent: class { constructor(type, detail) { this.type = type; Object.assign(this, detail); } },
    Event: class { constructor(type) { this.type = type; } }, URLSearchParams, console,
  });
  return {
    window, requests, sdkCalls, element,
    setFailure: (value) => { fail = value; }, setBadLookup: (value) => { badLookup = value; },
    setBlocked: () => { blocked = true; }, changeAfter: () => { changeAfter = true; },
    badSchema: () => { schema = {}; }, adapter: () => adapter,
    async enable() {
      await window.HmLab.ready;
      window.resolveEcid(ctx.ecid);
      element('hmConnected').checked = true;
      await element('hmConnected').change({ target: element('hmConnected') });
    },
    posts() { return requests.filter((request) => request.url === '/api/events/generator'); },
  };
}
test('preview shopping performs no event calls; connected success is acknowledged', async () => {
  const h = labHarness();
  await h.window.HmLab.ready;
  assert.equal((await h.window.HmLab.interact('add', payload)).preview, true);
  await h.window.HmLab.pageView({ page: 'bag', title: 'Bag' });
  assert.equal(h.posts().length, 0);
  assert.equal(h.sdkCalls.length, 0);
  assert.match(h.element('hmPayloadPreview').textContent, /PREVIEW ONLY/);
  await h.enable();
  assert.equal(h.window.HmLab.connected(), true);
  assert.equal((await h.window.HmLab.interact('add', payload)).ok, true);
  assert.equal(h.posts().length, 1);
  await h.window.HmLab.pageView({ page: 'checkout', title: 'Checkout' });
  assert.equal(h.sdkCalls.length, 1);
  assert.equal(h.sdkCalls[0][1].xdm.web.webPageDetails.URL, 'https://ae.hm.com/en/checkout');
});
test('simultaneous business actions cannot duplicate submissions', async () => {
  const h = labHarness();
  await h.enable();
  const outcomes = await Promise.allSettled([
    h.window.HmLab.interact('add', payload), h.window.HmLab.interact('add', payload),
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(h.posts().length, 1);
});
test('an incompatible schema blocks recording without provisioning', async () => {
  const h = labHarness();
  h.badSchema();
  await h.enable();
  assert.equal(h.window.HmLab.connected(), false);
  assert.match(h.element('hmPresenterStatus').textContent, /missing H&M measurement/);
  assert.equal(h.posts().length, 0);
});
test('4xx permits a deliberate retry but network/5xx/malformed delivery blocks replay', async () => {
  for (const fail of ['reject', 'network', 'server', 'malformed']) {
    const h = labHarness();
    await h.enable();
    h.setFailure(fail);
    await assert.rejects(h.window.HmLab.interact('add', payload));
    h.setFailure('');
    if (fail === 'reject') assert.equal((await h.window.HmLab.interact('add', payload)).ok, true);
    else {
      assert.equal(h.element('hmUncertainDelivery').hidden, false);
      await assert.rejects(h.window.HmLab.interact('add', payload), /uncertain/);
      assert.equal(h.posts().length, 1);
      await assert.rejects(Promise.resolve().then(() => h.adapter().beforeReset()), /uncertain/);
      h.element('hmAllowRetry').click();
      assert.equal((await h.window.HmLab.interact('add', payload)).ok, true);
    }
  }
});
test('context changes after submission are uncertain and disable recording', async () => {
  const h = labHarness();
  await h.enable();
  h.changeAfter();
  await assert.rejects(h.window.HmLab.interact('purchase', { ...payload, orderId: 'HM-demo-1' }));
  assert.equal(h.window.HmLab.connected(), false);
  assert.equal(h.element('hmUncertainDelivery').hidden, false);
  assert.equal(h.posts().length, 1);
});
test('lookup requires real verification, binds current browser and prevents switching people', async () => {
  const h = labHarness();
  await h.enable();
  await h.window.HmLab.connect('synthetic@example.test');
  assert.equal(h.window.HmLab.profile().ecid, ctx.ecid);
  await assert.rejects(h.window.HmLab.connect('another@example.test'), /another customer/);
  assert.equal(h.posts().length, 0);
  h.setBlocked();
  await assert.rejects(h.window.HmLab.interact('add', payload), /reset/);
});
