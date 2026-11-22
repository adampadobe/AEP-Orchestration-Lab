'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, parseRss, parseMarkdown, parseCaas, validateClassification, DEFAULTS, SOURCES } = require('../labFeedsService');

const fixed = new Date('2026-11-22T10:00:00.000Z');
const rss = `<rss><channel>
  <item><title>Salesforce news</title><link>https://example.com/news</link><pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate><description>New CRM feature.</description></item>
  <item><title>Duplicate</title><link>https://example.com/news</link><pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

function fakeDb() {
  const docs = new Map();
  const wrap = (value) => {
    if (value instanceof Date) return { toMillis: () => value.getTime() };
    if (Array.isArray(value)) return value.map(wrap);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wrap(v)]));
    return value;
  };
  const snap = (path) => ({ exists: docs.has(path), data: () => docs.has(path) ? wrap(docs.get(path)) : undefined });
  const doc = (path) => ({
    path, get: async () => snap(path),
    create: async (value) => { if (docs.has(path)) throw Error('Already exists'); docs.set(path, value); },
    set: async (value) => docs.set(path, value),
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path) => ({
    doc: (id) => doc(`${path}/${id}`),
    orderBy: () => ({ limit: () => ({ get: async () => ({
      docs: [...docs.keys()].filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(snap).sort((a, b) => b.data().publishedAt.localeCompare(a.data().publishedAt)).slice(0, 200),
    }) }) }),
  });
  return {
    docs, collection,
    getAll: async (...refs) => refs.map((ref) => snap(ref.path)),
    runTransaction: async (fn) => fn({
      get: async (ref) => snap(ref.path),
      create: (ref, value) => { if (docs.has(ref.path)) throw Error('Already exists'); docs.set(ref.path, value); },
      set: (ref, value, options) => docs.set(ref.path, options?.merge ? { ...docs.get(ref.path), ...value } : value),
    }),
  };
}

function response(body = rss) {
  return { ok: true, headers: new Headers(), text: async () => body };
}

function classifier(calls) {
  return async (_system, input, options) => {
    const item = JSON.parse(input).source;
    calls.push({ item, options });
    return JSON.stringify({ relevance: 0.9, category: 'CRM', competitors: ['Salesforce'], products: [],
      headline: item.title, soWhat: 'A new CRM feature.', sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt, demoableInLab: false });
  };
}

test('parses RSS and Atom and rejects unsafe or undated links', () => {
  assert.equal(parseRss(rss, 'https://example.com').length, 2);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>News</title><link href="/story"/><updated>2026-11-20T00:00:00Z</updated></entry></feed>`;
  assert.equal(parseRss(atom, 'https://example.com/feed')[0].sourceUrl, 'https://example.com/story');
  assert.equal(parseRss('<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>', 'https://example.com').length, 0);
  assert.equal(parseRss('<rss><channel><item><title>x</title><pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>', 'https://example.com').length, 0);
  assert.throws(() => parseRss('<!DOCTYPE rss><rss/>', 'https://example.com'), /DTD/);
});

test('uses source release date and real anchor without inventing a URL', () => {
  const [item] = parseMarkdown("## November '26 release notes {#nov-26-release-notes}\nFeature", { product: 'AJO', link: 'https://example.com/releases' });
  assert.equal(item.sourceUrl, 'https://example.com/releases#nov-26-release-notes');
  assert.equal(item.publishedAt, '2026-11');
  assert.throws(() => parseMarkdown('No date', { product: 'AJO', link: 'https://example.com' }), /date/);
});

test('parses Adobe CaaS cards in date order and rejects missing or non-Adobe links', () => {
  const card = (url, date) => ({ cardDate: date, contentArea: { title: 'Adobe update', description: 'Details', url } });
  const body = JSON.stringify({ cards: [
    card('https://blog.adobe.com/en/old', '2026-01-01T00:00:00Z'),
    card('https://blog.adobe.com/en/new', '2026-11-01T00:00:00Z'),
    card('https://other.example/unsafe', '2026-11-02T00:00:00Z'),
    card('', '2026-11-03T00:00:00Z'),
  ] });
  const items = parseCaas(body, SOURCES.adobeBlog);
  assert.deepEqual(items.map((item) => item.sourceUrl), ['https://blog.adobe.com/en/new', 'https://blog.adobe.com/en/old']);
  assert.throws(() => parseCaas('{"cards":{}}', SOURCES.adobeBlog), /Invalid/);
  assert.throws(() => parseCaas(JSON.stringify({ cards: Array(5000).fill({}) }), SOURCES.adobeBlog), /truncated/);
});

test('rejects invalid structured results and changed source metadata', () => {
  const item = { sourceUrl: 'https://example.com', publishedAt: fixed.toISOString() };
  const value = { relevance: 0.8, category: 'news', competitors: [], products: [], headline: 'x',
    soWhat: 'Relevant update', ...item, demoableInLab: false };
  assert.ok(validateClassification(item, value));
  assert.ok(!validateClassification(item, { ...value, soWhat: Array(26).fill('word').join(' ') }));
  assert.ok(!validateClassification(item, { ...value, relevance: 2 }));
  assert.ok(!validateClassification(item, { ...value, sourceUrl: 'https://other.example' }));
});

test('classifies only new URLs, enforces daily cap, and stores run metrics', async () => {
  const db = fakeDb();
  db.docs.set('labFeedConfig/tech-news', { ...DEFAULTS['tech-news'], sources: ['techcrunch'], dailyCap: 1 });
  const calls = [];
  const service = createService({ db, fetchFn: async () => response(), callGemini: classifier(calls), now: () => fixed });
  await service.refresh('tech-news');
  await service.refresh('tech-news');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.model, 'gemini-2.5-flash');
  const result = await service.read('tech-news');
  assert.equal(result.items.length, 1);
  assert.equal(result.meta.source, 'live');
  assert.equal(db.docs.get('labFeeds/tech-news').lastRun.fetched, 2);
  assert.equal(db.docs.get('labFeeds/tech-news').budgetUsed, 1);
});

test('daily cap defers remaining new URLs and marks the run partial', async () => {
  const db = fakeDb();
  db.docs.set('labFeedConfig/tech-news', { ...DEFAULTS['tech-news'], sources: ['techcrunch'], dailyCap: 1 });
  const calls = [];
  const twoItems = rss.replace('https://example.com/news</link><pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate></item>',
    'https://example.com/other</link><pubDate>Sat, 21 Nov 2026 10:00:00 GMT</pubDate></item>');
  const service = createService({ db, fetchFn: async () => response(twoItems), callGemini: classifier(calls), now: () => fixed });
  await service.refresh('tech-news');
  assert.equal(calls.length, 1);
  assert.equal(db.docs.get('labFeeds/tech-news').lastRun.status, 'partial');
  assert.match(db.docs.get('labFeeds/tech-news').lastRun.errors[0], /cap/);
});

test('release documents are classified before newer blog items under the cap', async () => {
  const db = fakeDb();
  db.docs.set('labFeedConfig/adobe-releases', { ...DEFAULTS['adobe-releases'], sources: ['adobeBlog', 'aep'], dailyCap: 1 });
  const calls = [];
  const blog = JSON.stringify({ cards: [{ cardDate: '2026-11-20T00:00:00Z',
    contentArea: { title: 'Recent blog', url: 'https://blog.adobe.com/en/recent' } }] });
  const service = createService({ db, fetchFn: async (url) =>
    response(url === SOURCES.aep.url ? '---\nlast-update: 2026-10-01T00:00:00.000Z\n---\nRelease' : blog),
  callGemini: classifier(calls), now: () => fixed });
  await service.refresh('adobe-releases');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].item.sourceUrl, SOURCES.aep.link);
});

test('invalid model output is not stored and its failure is recorded', async () => {
  const db = fakeDb();
  db.docs.set('labFeedConfig/tech-news', { ...DEFAULTS['tech-news'], sources: ['techcrunch'] });
  const service = createService({ db, fetchFn: async () => response(), callGemini: async () => '{"relevance":2}', now: () => fixed });
  await service.refresh('tech-news');
  const result = await service.read('tech-news');
  assert.equal(result.items.length, 0);
  assert.equal(result.meta.source, 'stale');
  assert.match(db.docs.get('labFeeds/tech-news').lastRun.errors[0], /Invalid classification/);
});

test('failed sources preserve cached items but are marked stale', async () => {
  const db = fakeDb();
  db.docs.set('labFeedConfig/tech-news', { ...DEFAULTS['tech-news'], sources: ['techcrunch'] });
  let fails = false;
  const service = createService({ db, fetchFn: async () => fails ? { ok: false, status: 503 } : response(), callGemini: classifier([]), now: () => fixed });
  assert.equal((await service.read('tech-news')).meta.source, 'fallback');
  await service.refresh('tech-news');
  fails = true;
  await assert.rejects(service.refresh('tech-news'), /refresh failed/);
  const result = await service.read('tech-news');
  assert.equal(result.meta.source, 'stale');
  assert.equal(result.meta.lastRunStatus, 'failed');
  assert.equal(result.items.length, 1);
});

test('HTTP handler supports ETag and rejects unknown feeds', async () => {
  const service = createService({ db: fakeDb(), callGemini: classifier([]), now: () => fixed });
  const res = () => ({ headers: {}, set(k, v) { this.headers[k] = v; return this; },
    status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; } });
  const first = res();
  await service.handle({ method: 'GET', path: '/api/lab/feeds/tech-news', headers: {} }, first);
  assert.equal(first.code, 200);
  const cached = res();
  await service.handle({ method: 'GET', path: '/api/lab/feeds/tech-news', headers: { 'if-none-match': first.headers.ETag } }, cached);
  assert.equal(cached.code, 304);
  const missing = res();
  await service.handle({ method: 'GET', path: '/api/lab/feeds/nope', headers: {} }, missing);
  assert.equal(missing.code, 404);
});

test('legacy live release summary never mixes in bundled fallback products', async () => {
  const service = require('../releaseNotesSummaryService');
  const originalFetch = global.fetch;
  global.fetch = async (url) => url === service.SOURCE_URLS.aep.raw
    ? { ok: true, text: async () => '---\ntitle: Adobe Experience Platform Release Notes June 2026\n---\n' }
    : { ok: false, status: 503 };
  try {
    const live = await service.fetchLiveSummary();
    assert.equal(live.source, 'experience-league');
    assert.deepEqual(live.products.cdp.highlights, []);
    assert.deepEqual(live.products.target.highlights, []);
    assert.equal(service.getFallbackPeriod().source, 'fallback');
  } finally {
    global.fetch = originalFetch;
  }
});
