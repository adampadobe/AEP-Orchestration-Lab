const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const model = require('../web/profile-viewer/cp-decisioning-model.js');

async function main() {
  const { createPreviewServer } = await import('./preview-cp-decisioning.mjs');
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    await page.goto(origin + '/profile-viewer/cp-decisioning-visualiser.html');
    assert.equal(await page.locator('.signal-group[open]').count(), 0);
    assert.equal(await page.locator('#scenario-pills button').count(), 7);
    for (let i = 0; i < model.demoScenarios.length; i++) {
      const scenario = model.demoScenarios[i];
      await page.locator('#scenario-pills button').nth(i).click();
      assert.equal(await page.locator('.objective[data-winner="true"]').getAttribute('data-key'), scenario.expectedObjective);
      const selected = model.objectives.find(o => o.key === scenario.expectedObjective).offers.find(o => o.key === scenario.expectedOffer);
      assert.equal(await page.locator('.email-heading').textContent(), selected.content.title);
      const expectedGroups = [...new Set(scenario.signalKeys.map(key => model.fields.find(f => f.key === key).group))].sort();
      assert.deepEqual((await page.locator('.signal-group[open]').evaluateAll(nodes => nodes.map(node => node.dataset.group))).sort(), expectedGroups);
    }
    await page.getByRole('tab', { name: 'Mobile App', exact: true }).click();
    assert.ok(await page.locator('#panel-mobile').isVisible());
    await page.getByRole('tab', { name: 'Web', exact: true }).click();
    const webWidth = await page.locator('.website-preview').evaluate(node => node.getBoundingClientRect().width);
    assert.ok(webWidth > 1400, 'Web must be full-width, not a narrow emulator: ' + webWidth);
    await page.evaluate(() => document.documentElement.setAttribute('data-aep-theme', 'dark'));
    assert.ok(await page.locator('.web-hero img').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(async () => {
      const api = window.TuiDecisioningVisualiser;
      api.setEmbedded();
      api.setProfile({ contextKey: 'fixture', firstName: 'Alex', state: window.DecisioningDemoModel.defaults });
      await api.setDecision({ url: location.origin + '/profile-viewer/cp-decisioning-assets/forest.webp',
        title: 'Verified live fixture', description: 'Browser-test fixture, not real AJO content.' });
    });
    await page.locator('#scenario-pills button').nth(0).click();
    assert.equal(await page.locator('.web-hero h3').textContent(), 'Verified live fixture');
    await page.evaluate(() => window.TuiDecisioningVisualiser.hold('Consent hold / retain last successful live response'));
    assert.equal(await page.locator('.web-hero h3').textContent(), 'Verified live fixture');
    const failure = await page.evaluate(async () => {
      try { await window.TuiDecisioningVisualiser.setDecision({ url: location.origin + '/missing-image.webp' }); }
      catch (error) { return error.message; }
    });
    assert.match(failure, /could not load/);
    assert.equal(await page.locator('.web-hero h3').textContent(), 'Verified live fixture');
    await page.evaluate(() => window.TuiDecisioningVisualiser.setProfile({ contextKey: 'different-person', state: window.DecisioningDemoModel.defaults }));
    assert.notEqual(await page.locator('.web-hero h3').textContent(), 'Verified live fixture');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile layout must not overflow');
    assert.deepEqual(errors, []);

    const write = await fetch(origin + '/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(write.status, 403);
    const otherSandbox = await fetch(origin + '/api/profile/table?sandbox=apalmer');
    assert.equal(otherSandbox.status, 403);
    const shell = await context.newPage();
    await shell.addInitScript(() => {
      localStorage.setItem('aepDemoNavOwnerHandle', 'kirkham');
      localStorage.setItem('aepShowInDevCapabilities_kirkham', '0');
      localStorage.setItem('aepShowInDevCapabilities___default__', '0');
    });
    await shell.setViewportSize({ width: 1600, height: 1000 });
    const writes = [];
    const outboundUpdates = [];
    let fixtureEvents = [];
    let fixtureAudiences = { realized: [], exited: [] };
    const schema = { version: '1.12', 'meta:tenantNamespace': '_demoemea', properties: {} };
    for (const field of model.fields) {
      let node = schema;
      for (const part of field.path.split('.')) { node.properties ||= {}; node.properties[part] ||= {}; node = node.properties[part]; }
      node.type = field.schemaType || field.type;
      if (field.format) node.format = field.format;
    }
    const stored = model.attributes(model.defaults);
    const rows = model.fields.map(field => ({ path: field.path, value: stored[field.path],
      valueType: field.schemaType || field.type, industry: field.group === 'Consent' || ['score', 'points', 'case'].includes(field.key) ? 'generic' : 'travel', writable: true }));
    rows.push({ path: 'testProfile', value: true, valueType: 'boolean', industry: 'generic', writable: true });
    rows.push({ path: 'person.name.firstName', value: 'Alex', valueType: 'string', industry: 'generic', writable: true });
    await shell.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { await route.fulfill({ body: '', contentType: 'text/javascript' }); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      let data = { ok: true };
      if (url.pathname === '/api/aep') {
        const body = request.postDataJSON();
        data = { status: 200, platform_response: body.path.includes('schemaregistry') ? schema :
          { sandboxes: [{ name: 'kirkham', title: 'Kirkham', type: 'development', state: 'active' }] } };
      } else if (url.pathname === '/api/profile/table') data = { found: true, rows, profileEmail: 'fixture@example.invalid',
        ecid: '12345678901234567890123456789012345678',
        industries: { generic: { writable: true, schemaId: 'fixture', xdmKey: '_demoemea' }, travel: { writable: true, schemaId: 'fixture', xdmKey: '_demoemea' } } };
      else if (url.pathname === '/api/profile/consent') data = { found: true, firstName: 'Alex', email: 'fixture@example.invalid',
        ecid: '12345678901234567890123456789012345678', channels: { email: 'in', sms: 'not_provided', push: 'not_provided' } };
      else if (url.pathname === '/api/profile/events') data = { events: fixtureEvents };
      else if (url.pathname === '/api/profile/audiences') data = fixtureAudiences;
      else if (url.pathname === '/api/env-bar-config') data = { config: null };
      else if (url.pathname === '/api/tags/reactor') data = { data: [] };
      else if (url.pathname === '/api/events/generator-targets') data = { targets: [] };
      else if (url.pathname === '/api/image-hosting/library') data = { items: [] };
      else if (url.pathname === '/api/events/datastreams') data = { data: [] };
      else if (['/api/profile/update', '/api/events/generator'].includes(url.pathname)) {
        writes.push(url.pathname);
        if (url.pathname === '/api/profile/update') {
          const body = request.postDataJSON();
          outboundUpdates.push(body);
          for (const update of body.updates) {
            const row = rows.find(row => row.path.replace(/^_demoemea\./, '') === update.path);
            if (row) { row.value = update.value; row.valueType = update.valueType; }
          }
        }
      }
      await route.fulfill({ json: data });
    });
    await shell.goto(origin + '/profile-viewer/cp-decisioning-demo.html');
    await shell.waitForFunction(() => window.TuiDecisioningDrawer && document.getElementById('cpDecisioningNs') &&
      document.getElementById('sandboxSelect').value === 'kirkham' && document.getElementById('sandboxSelect').disabled);
    assert.equal(await shell.locator('#sandboxSelect').inputValue(), 'kirkham');
    assert.ok(await shell.locator('#sandboxSelect').isDisabled());
    const cpNav = shell.locator('[data-subgroup="demoCp"]');
    await cpNav.waitFor();
    assert.equal(await cpNav.getByRole('link', { name: 'Decisioning', exact: true }).getAttribute('href'), 'cp-decisioning-demo.html');
    assert.equal(await cpNav.getByText('in development', { exact: false }).count(), 0);
    await shell.locator('#customerEmail').fill('fixture@example.invalid');
    await shell.locator('#queryProfileBtn').click();
    await shell.waitForFunction(() => !!window.TuiDecisioningDrawer.getSignals() &&
      document.getElementById('tuiPhSignal-booking').textContent === 'Dreaming');
    assert.equal(await shell.locator('#tuiPhSignal-booking').textContent(), 'Dreaming');
    const proposition = '_experience.decisioning.propositions.0.';
    fixtureEvents = [
      { eventType: 'decisioning.propositionDisplay', timestamp: Date.now(), rows: [
        { path: proposition + 'scope', value: 'web://fixture.invalid/profile-viewer/cp-decisioning-visualiser.html#hero-banner' },
        { path: proposition + 'scopeDetails.activity.id', value: 'fixture-campaign' },
        { path: proposition + 'scopeDetails.activity.name', value: 'CP fixture campaign' },
        { path: proposition + 'scopeDetails.decisionProvider', value: 'CJM' },
        { path: proposition + 'items.0.name', value: 'CP - Guest care' },
        { path: proposition + 'items.0.itemSelection.selectionDetail.strategyName', value: 'CP - Protect / Recover strategy' },
        { path: 'web.webPageDetails.URL', value: origin + '/profile-viewer/cp-decisioning-demo.html?channel=email' },
      ] },
      { eventType: 'message.feedback', eventName: 'message.feedback', timestamp: Date.now() - 1, rows: [
        { path: '_experience.customerJourneyManagement.emailChannelContext.namespace', value: 'Email' },
        { path: '_experience.customerJourneyManagement.messageDeliveryfeedback.feedbackStatus', value: 'sent' },
      ] },
    ];
    fixtureAudiences = { realized: [{ segmentId: 'fixture-audience', name: 'CP fixture audience' }], exited: [] };
    await shell.waitForFunction(() => {
      const profile = window.DemoProfileDrawer.getLastLookedUpProfile();
      return profile?.emailSendsLast24h === 1 && profile?.audiences?.realized?.[0]?.name === 'CP fixture audience';
    }, null, { timeout: 15000 });
    const decisionCard = shell.locator('.aep-event-decision').filter({ hasText: 'CP - Guest care' });
    assert.match(await decisionCard.textContent(), /Won via CP - Protect \/ Recover strategy/);
    assert.match(await decisionCard.textContent(), /Campaign: CP fixture campaign/);
    assert.match(await decisionCard.textContent(), /Delivery: Code-based experience/);
    assert.match(await decisionCard.textContent(), /Preview: Email/);
    assert.ok(await decisionCard.locator('svg').count() > 0, 'Decision card must use the shared TUI event icon');
    assert.equal(await shell.locator('#profileDrawerMessageSentValue').textContent(), '1', 'Email count must refresh from ingested events');
    const frame = shell.frames().find(frame => frame.url().includes('cp-decisioning-visualiser.html'));
    await frame.locator('#scenario-pills button').nth(4).click();
    assert.ok(await shell.locator('#tuiApplyProfile').isEnabled());
    const dialogs = [];
    shell.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    assert.deepEqual(writes, [], 'Staging signals must not send profile updates');
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => /Profile changes confirmed|cancelled/.test(document.getElementById('tuiLiveStatus').textContent));
    assert.deepEqual(dialogs, [], 'Apply must not require a separate approval dialog');
    assert.ok(outboundUpdates.length > 0);
    const arrival = outboundUpdates.flatMap(body => body.updates).find(row => row.path === 'hotel.bookingDetails.checkInDate');
    assert.equal(arrival.valueType, 'string');
    assert.equal(arrival.value, model.arrivalDate(1));
    assert.ok(!JSON.stringify(outboundUpdates).includes('airlineCustomer'));
    assert.equal(await shell.locator('#tuiPhSignal-days').textContent(), '1');
    assert.equal(await shell.locator('#tuiPhSignal-booking').textContent(), 'Booked');
    const acceptedWrites = writes.length;
    delete schema.properties._demoemea.properties.hotel.properties.customerContext.properties.journeyStage;
    await frame.locator('#scenario-pills button').nth(0).click();
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Write schema missing/incompatible field'));
    assert.equal(writes.length, acceptedWrites, 'Missing ingestion fields must block before any new profile or event writes');
    rows.find(row => row.path === 'testProfile').value = false;
    await shell.locator('#tuiApplyProfile').click();
    await shell.waitForFunction(() => document.getElementById('tuiLiveStatus').textContent.includes('Only AEP test profiles can be updated'));
    assert.equal(writes.length, acceptedWrites, 'Non-test profiles must still be blocked');
    assert.deepEqual(dialogs, []);
    assert.deepEqual(errors, []);
    console.log('CP browser checks passed: all seven scenarios, three channels, full-width Web, themes, retained live result, identity reset and read-only boundary.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
