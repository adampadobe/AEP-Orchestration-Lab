'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const htmlParse = require('../brandScraperHtmlParse');
const uploadedHtml = require('../brandScraperUploadedHtml');
const scrapeConfidence = require('../brandScraperConfidence');
const demoWebsite = require('../brandScraperDemoWebsite');

describe('brandScraperHtmlParse', () => {
  it('parses uploaded HTML into a page row', () => {
    const html = '<html><head><title>Sky News UK</title><meta name="description" content="News site"></head><body><h1>Hello</h1><img src="/logo.png" alt="logo"></body></html>';
    const page = htmlParse.parseHtmlToPage(html, {
      url: 'https://news.sky.com/uk',
      sourceType: 'uploaded_html',
      fileName: 'homepage.html',
      runTagAudit: false,
    });
    assert.equal(page.title, 'Sky News UK');
    assert.equal(page.sourceType, 'uploaded_html');
    assert.ok(page.textLength > 0);
    assert.ok(page.contentHash);
  });
});

describe('brandScraperUploadedHtml merge', () => {
  it('merges live and uploaded pages without duplicates', () => {
    const live = {
      brandName: 'Sky',
      baseUrl: 'https://news.sky.com',
      pages: [{
        url: 'https://news.sky.com/uk',
        title: 'UK News',
        text: 'live content',
        textLength: 12,
        sourceType: 'live_url',
        contentHash: 'abc',
      }],
      failures: [{ url: 'https://news.sky.com/about', status: 403, reason: 'http_error' }],
      assets: {},
    };
    const uploaded = [{
      url: 'https://news.sky.com/uk',
      title: 'UK News',
      text: 'live content',
      textLength: 12,
      sourceType: 'uploaded_html',
      contentHash: 'abc',
    }, {
      url: 'uploaded://about.html',
      title: 'About',
      text: 'about page from upload',
      textLength: 22,
      sourceType: 'uploaded_html',
      contentHash: 'def',
    }];
    const merged = uploadedHtml.mergeCrawlSources(live, uploaded, {
      aggregateAssets: () => ({ images: [] }),
    });
    assert.equal(merged.pages.length, 2);
    assert.equal(merged._livePageCount, 1);
    assert.equal(merged._uploadedPageCount, 2);
  });

  it('builds blocked pages from 403 failures', () => {
    const blocked = uploadedHtml.buildBlockedPages([
      { url: 'https://example.com/', status: 403, reason: 'http_error' },
    ], { fallbackUsed: true });
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].status, 403);
    assert.equal(blocked[0].reason, 'forbidden');
    assert.equal(blocked[0].fallbackUsed, true);
  });

  it('parses base64 HTML files', async () => {
    const html = '<html><head><title>Test</title></head><body>Content</body></html>';
    const b64 = Buffer.from(html).toString('base64');
    const result = await uploadedHtml.parseUploadedPayload({
      files: [{ name: 'page.html', contentBase64: b64 }],
    }, { baseUrl: 'https://brand.example', runTagAudit: false });
    assert.equal(result.summary.validHtmlFiles, 1);
    assert.equal(result.pages[0].title, 'Test');
  });

  it('skips empty HTML files', async () => {
    const result = await uploadedHtml.parseUploadedPayload({
      files: [{ name: 'empty.html', contentBase64: Buffer.from('   ').toString('base64') }],
    }, { runTagAudit: false });
    assert.equal(result.summary.validHtmlFiles, 0);
    assert.ok(result.summary.emptyFiles >= 1 || result.summary.invalidFiles >= 1);
  });
});

describe('brandScraperConfidence', () => {
  it('scores high when enough live content exists', () => {
    const conf = scrapeConfidence.computeScrapeConfidence({
      pages: [
        { textLength: 5000, sourceType: 'live_url' },
        { textLength: 4000, sourceType: 'live_url' },
      ],
      blockedPages: [],
      assets: { images: [{}, {}, {}, {}] },
      competitorMode: 'full',
      livePageCount: 2,
    });
    assert.equal(conf.level, 'high');
  });

  it('scores medium with blocked pages and upload fallback', () => {
    const conf = scrapeConfidence.computeScrapeConfidence({
      pages: [{ textLength: 2500, sourceType: 'uploaded_html' }],
      blockedPages: [{ url: 'https://x.com', status: 403 }],
      uploadedHtmlSummary: { validHtmlFiles: 1 },
      competitorMode: 'partial',
      uploadedPageCount: 1,
    });
    assert.ok(['medium', 'low'].includes(conf.level));
    assert.ok(conf.reasons.some((r) => /uploaded html/i.test(r)));
  });

  it('emits source badges', () => {
    const badges = scrapeConfidence.computeSourceBadges({
      pages: [{ sourceType: 'live_url' }, { sourceType: 'uploaded_html' }],
      blockedPages: [{ status: 403 }],
      scrapeConfidence: { level: 'medium' },
      competitorMode: 'partial',
    });
    assert.ok(badges.includes('Live URL'));
    assert.ok(badges.includes('Uploaded HTML'));
    assert.ok(badges.includes('Blocked'));
  });
});

describe('brandScraperDemoWebsite', () => {
  it('normalizes customer folder names', () => {
    assert.equal(demoWebsite.normalizeCustomerFolder('Sky News UK'), 'sky-news-uk');
    assert.equal(demoWebsite.normalizeCustomerFolder('Acme Corp!!!'), 'acme-corp');
  });

  it('logical demo path uses normalized slug', () => {
    assert.equal(demoWebsite.logicalDemoPath('sky-news'), '/demos/sky-news/web');
  });
});

describe('brandScrapeStore buildFullRecord', () => {
  const { buildFullRecord } = require('../brandScrapeStore');

  it('persists graceful scrape metadata fields', () => {
    const rec = buildFullRecord('kirkham', 'abc123', {
      url: 'https://news.sky.com/uk',
      brandName: 'Sky News',
      blockedPages: [{ url: 'https://news.sky.com/about', status: 403 }],
      scrapeConfidence: { level: 'medium', score: 62 },
      sourceBadges: ['Live URL', 'Blocked'],
      warnings: ['Some pages returned 403.'],
      demoWebsite: { path: '/demos/sky-news/web', publicUrl: '/demos/sky-news/web/index.html' },
      demoGenerationStatus: 'created',
    });
    assert.equal(rec.scrapeId, 'abc123');
    assert.equal(rec.blockedPages.length, 1);
    assert.equal(rec.scrapeConfidence.level, 'medium');
    assert.deepEqual(rec.sourceBadges, ['Live URL', 'Blocked']);
    assert.equal(rec.demoGenerationStatus, 'created');
    assert.equal(rec.demoWebsite.path, '/demos/sky-news/web');
  });
});

describe('brandScraperDemoHost', () => {
  const demoHost = require('../brandScraperDemoHost');

  it('parses demo hosting paths', () => {
    const parsed = demoHost.parseDemoRequestPath('/demos/sky-news/web/index.html');
    assert.equal(parsed.slug, 'sky-news');
    assert.equal(parsed.relFile, 'index.html');
    assert.equal(
      demoHost.gcsObjectKey('sky-news', 'styles.css'),
      'demo-websites/sky-news/web/styles.css',
    );
  });

  it('rejects path traversal in file segment', () => {
    const parsed = demoHost.parseDemoRequestPath('/demos/acme/web/../secret.txt');
    assert.equal(parsed.relFile, 'secret.txt');
  });
});
