'use strict';

// Local fixture only: all Firebase authentication and demo APIs are intercepted.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../web');
const assets = [
  { id: 'asset_001', title: 'Airline decisioning', customer: 'Example Air', conversationType: 'Decisioning',
    originalFilename: 'airline.html', currentVersionId: 'version_current', status: 'ready', summary: 'An illustrative journey.',
    createdAt: '2026-10-09T07:00:00Z', sizes: { htmlBytes: 2048 } },
  { id: 'asset_002', title: 'Platform architecture', customer: 'Example Air', conversationType: 'Architecture',
    originalFilename: 'architecture.html', currentVersionId: 'version_second', status: 'ready', summary: 'Connect the story to platform capabilities.' },
];
const versions = [
  { id: 'version_current', current: true, note: 'Current upload', originalFilename: 'airline.html', createdAt: '2026-10-09T07:00:00Z' },
  { id: 'version_old', current: false, note: 'Original', originalFilename: 'airline-v1.html', createdAt: '2026-10-08T07:00:00Z' },
];
const flows = [{ id: 'flow_001', title: 'Customer meeting', customer: 'Example Air', stepCount: 1, totalMinutes: 5,
  steps: [{ assetId: 'asset_001', versionId: 'version_old', currentVersionAtSave: 'version_current',
    title: 'Opening', talkTrack: 'Start with the customer problem.', durationMin: 5 }] }];
const trace = [];
const tokens = [];
let counter = 0;

function respond(url, method, body) {
  const parsed = new URL(url, 'http://fixture');
  const route = parsed.pathname.replace(/^.*?(?:\/api\/demo-assets|\/demoAssetsApi)/, '');
  trace.push({ route, method, body });
  if (route === '/usage') return { usage: { used: 2, limit: 80, remaining: 78 } };
  if (route === '/audit') return { entries: [{ action: 'asset.create', email: 'fixture@adobe.com', at: '2026-10-09T07:00:00Z' }] };
  if (route === '') return { assets: assets.filter((a) => !!a.deletedAt === (parsed.searchParams.get('deleted') === 'true')), nextCursor: null, conversationTypes: ['Decisioning', 'Architecture'] };
  if (route === '/flows' && method === 'GET') return { flows, nextCursor: null };
  if (route === '/flows/suggest') return { suggestion: { title: 'Suggested meeting', rationale: 'Lead with outcomes, then explain the platform.',
    steps: body.steps.map((s) => ({ ...s, talkTrack: 'Suggested: ' + s.talkTrack })), omitted: [] } };
  if (route === '/flows' && method === 'POST') {
    const flow = { ...body, id: 'flow_002', stepCount: body.steps.length, totalMinutes: 10 };
    flows.push(flow);
    return { flow };
  }
  const flow = flows.find((f) => route.startsWith('/flows/' + f.id));
  if (flow) {
    if (route.endsWith('/check')) return { check: { ready: true, issues: [], steps: flow.steps } };
    if (route.endsWith('/present')) return { flow: { ...flow, steps: flow.steps.map((s) => ({ ...s, asset: assets.find((a) => a.id === s.assetId),
      renderUrl: '/render/fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() })) } };
    if (method === 'PATCH') Object.assign(flow, body);
    return { flow };
  }
  const asset = assets.find((a) => route.startsWith('/' + a.id));
  if (!asset) throw new Error('Unhandled fixture request: ' + route);
  if (route.endsWith('/versions')) return { versions, nextCursor: null };
  if (/\/versions\/.+\/restore$/.test(route)) return { asset, versionId: asset.currentVersionId };
  if (route.endsWith('/render-token')) {
    const token = { id: 'fixture_' + ++counter, versionId: body.versionId || asset.currentVersionId,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), revoked: false };
    token.url = '/render/fixture-' + counter;
    tokens.push(token);
    return { ...token, url: '/render/fixture-' + counter, tokenId: token.id };
  }
  if (route.endsWith('/render-tokens')) return { tokens };
  if (/\/render-tokens\/[^/]+$/.test(route) && method === 'DELETE') {
    const token = tokens.find((t) => route.endsWith('/' + t.id));
    if (!token) throw new Error('Token not found');
    token.revoked = true;
    return { token };
  }
  if (route.endsWith('/undelete')) { delete asset.deletedAt; return { asset }; }
  if (route.endsWith('/derive')) {
    const copy = { ...asset, id: 'asset_copy', customer: body.customer, title: body.customer + ' demo',
      adaptationBrief: { audience: body.audience, objective: body.objective, brandNotes: body.brandNotes },
      derivedFrom: { assetId: asset.id, title: asset.title } };
    assets.push(copy);
    return { asset: copy };
  }
  if (route.endsWith('/studio/conversations')) return { conversations: [{ id: 'conversation_001', title: 'Customer preparation' }] };
  if (route.endsWith('/studio/conversations/conversation_001')) return { conversation: { id: 'conversation_001', messages: [{ role: 'assistant', text: 'Previous review.' }] } };
  if (route.endsWith('/studio/chat')) return { conversationId: 'conversation_001', reply: 'Adaptation prepared for review.',
    proposalId: 'proposal_001', baseVersionId: asset.currentVersionId, ops: [{ op: 'replaceText', ok: true, summary: 'Adapt customer name' }],
    checklist: [{ label: 'Old customer names', passed: true, detail: 'None remain in visible text.' }] };
  if (route.endsWith('/studio/apply')) return { asset, versionId: asset.currentVersionId };
  if (route.endsWith('/studio/discard')) return { proposal: { status: 'discarded' } };
  if (method === 'DELETE') { asset.deletedAt = new Date().toISOString(); return { id: asset.id, ok: true }; }
  return { asset };
}

async function main() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture');
      if (url.pathname.startsWith('/api/demo-assets')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, ...respond(req.url, req.method, raw ? JSON.parse(raw) : {}) }));
        return;
      }
      if (url.pathname.startsWith('/render/')) {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html><body><h1>Local demo preview</h1></body></html>');
        return;
      }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
      res.end(await fs.readFile(file));
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: e.message })); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/profile-viewer/';
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (/\/demoAssetsApi(?:\/|$)/.test(url)) {
        try {
          await route.fulfill({ json: { ok: true, ...respond(url, route.request().method(), route.request().postDataJSON() || {}) } });
        } catch (e) { await route.fulfill({ status: 500, json: { ok: false, error: e.message } }); }
      } else if (!url.startsWith('http://127.0.0.1:') || /\/(?:aep-lab-nav|aep-global-sandbox|aep-lab-sandbox-sync)\.js/.test(url)) {
        await route.fulfill({ body: '', contentType: 'text/javascript' });
      } else await route.continue();
    });
    await context.addInitScript(() => {
      window.firebase = { apps: [{}], auth: () => ({ onAuthStateChanged(callback) {
        callback({ email: 'fixture@adobe.com', uid: 'fixture-user', getIdToken: async () => 'fixture-auth' });
      } }) };
      window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__ = location.origin;
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(base + 'demo-flows.html?flow=flow_001');
    await page.getByRole('button', { name: 'Load version choices' }).click();
    await page.getByLabel('Version for step 1').selectOption('version_old');
    await page.getByRole('button', { name: 'Suggest with Gemini' }).click();
    await page.getByLabel('Goal / audience').fill('Explain real-time decisioning to a CMO');
    await page.getByRole('button', { name: 'Suggest', exact: true }).click();
    await page.locator('#flowSuggestionReview').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#flowSteps textarea').inputValue(), 'Start with the customer problem.');
    await page.getByRole('button', { name: 'Use these steps' }).click();
    assert.equal(await page.getByLabel('Version for step 1').inputValue(), 'version_old');
    await page.getByRole('button', { name: 'Save flow', exact: true }).click();
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await page.getByRole('button', { name: 'Present checked flow' }).click();
    await page.locator('#presenter').waitFor({ state: 'visible' });
    const notesPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Presenter window' }).click();
    const notes = await notesPromise;
    await notes.getByRole('heading', { name: 'Opening' }).waitFor();
    await page.locator('#presenterClose').click();
    await page.goto(base + 'demo-studio.html?asset=asset_001');
    await page.locator('#studioVersionsBox').click();
    await page.locator('#studioVersions li').filter({ hasText: 'Original' }).getByRole('button', { name: 'Preview' }).click();
    await page.getByRole('button', { name: 'Back to current' }).waitFor();
    assert.match(await page.locator('#studioSelectedVersion').textContent(), /Historical/);
    await page.getByRole('button', { name: 'Back to current' }).click();
    await page.getByRole('button', { name: 'Adapt for another customer' }).click();
    await page.locator('#studioDeriveForm [name=customer]').fill('Example Retail');
    await page.getByLabel('Audience', { exact: true }).fill('Retail CMO');
    await page.getByLabel('Conversation objective').fill('Explain personalisation');
    await page.getByLabel('Approved brand material and facts').fill('Use illustrative sample data only.');
    await page.getByRole('button', { name: 'Create copy and prepare adaptation' }).click();
    await page.waitForURL((url) => url.searchParams.get('asset') === 'asset_copy');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.locator('#studioChecklist').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Apply as new version' }).click();
    await page.locator('#studioConversation').selectOption('conversation_001');
    await page.getByText('Previous review.', { exact: true }).waitFor();
    await page.goto(base + 'demo-asset-library.html');
    await page.locator('#demoAssetsGrid').getByText('Airline decisioning', { exact: true }).waitFor();
    await page.locator('details.demo-assets-more-actions summary').first().click();
    await page.locator('#demoAssetsGrid').getByRole('button', { name: /Share/ }).first().click();
    await page.getByRole('button', { name: 'Create expiring link' }).click();
    await page.locator('#demoAssetsShareCreated').waitFor({ state: 'visible' });
    assert.match(await page.locator('#demoAssetsShareExpiry').textContent(), /expire/i);
    await page.locator('#demoAssetsShareList').getByRole('button', { name: /Revoke/ }).last().click();
    await page.locator('#demoAssetsShareClose').click();
    await page.getByLabel('Select Airline decisioning', { exact: true }).check();
    await page.getByLabel('Select Platform architecture', { exact: true }).check();
    assert.match(await page.locator('#demoAssetsCreateBrief').getAttribute('href'), /demo-flows\.html\?assets=/);
    await page.locator('#demoAssetsAddToFlow').click();
    await page.locator('#demoAssetsFlowSelect').selectOption('flow_001');
    await page.locator('#demoAssetsFlowExisting').click();
    await page.locator('#demoAssetsFlowStatus').getByText(/Added selected assets/).waitFor();
    await page.locator('#demoAssetsFlowCancel').click();
    assert.ok(flows[0].steps.some((step) => step.assetId === 'asset_002'));
    await page.locator('article.demo-assets-card').filter({ hasText: 'Airline decisioning' })
      .getByRole('button', { name: /Move.*Trash/i }).click();
    await page.getByRole('button', { name: 'Trash', exact: true }).click();
    await page.locator('article.demo-assets-card').filter({ hasText: 'Airline decisioning' })
      .getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Active', exact: true }).click();
    await page.locator('#demoAssetsGrid').getByText('Airline decisioning', { exact: true }).waitFor();
    for (const [width, theme] of [[1440, 'light'], [390, 'dark']]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((mode) => {
        localStorage.setItem('aepTheme', mode);
        if (mode === 'dark') document.documentElement.setAttribute('data-aep-theme', 'dark');
        else document.documentElement.removeAttribute('data-aep-theme');
      }, theme);
      for (const name of ['demo-asset-library.html', 'demo-studio.html?asset=asset_001', 'demo-flows.html?flow=flow_001']) {
        await page.goto(base + name);
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Overflow: ' + name + ' ' + width);
        if (process.env.DEMO_TEST_SCREENSHOTS) {
          await fs.mkdir(process.env.DEMO_TEST_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.DEMO_TEST_SCREENSHOTS, name.split('?')[0] + '-' + theme + '.png'), fullPage: true });
        }
      }
    }
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    assert.ok(trace.some((r) => r.route.endsWith('/derive') && r.body.audience === 'Retail CMO'));
    assert.ok(trace.some((r) => r.route === '/flows/suggest' && r.body.steps[0].versionId === 'version_old'));
    console.log('PASS: local browser adaptation, history, conversations, pinned suggestions, readiness, presenter window and desktop/mobile themes');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
