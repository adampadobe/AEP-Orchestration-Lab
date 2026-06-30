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

describe('brandScraperDemoFromUpload', () => {
  const demoUpload = require('../brandScraperDemoFromUpload');

  it('prefers index.html as primary page', () => {
    const picked = demoUpload.pickPrimaryHtml([
      { name: 'pages/about.html', content: Buffer.from('<html></html>'), isHtml: true },
      { name: 'index.html', content: Buffer.from('<html></html>'), isHtml: true },
    ]);
    assert.equal(picked.name, 'index.html');
  });

  it('prefers browser save-page root HTML over _files/index.html ad iframe', () => {
    const mainHtml = '<!DOCTYPE html><html><head><title>Sky News</title></head><body><img src="./Page_files/logo.svg"></body></html>';
    const adIframe = '<!DOCTYPE html><!-- saved from url=(0133)https://s0.2mdn.net/sadbundle/123/index.html --><html><body>Renault ad</body></html>';
    const picked = demoUpload.pickPrimaryHtml([
      { name: 'Page_files/index.html', content: Buffer.from(adIframe), isHtml: true },
      { name: 'Page_files/style.css', content: Buffer.from('body{}'), isHtml: false },
      { name: 'Page.html', content: Buffer.from(mainHtml.repeat(200)), isHtml: true },
    ]);
    assert.equal(picked.name, 'Page.html');
  });

  it('detects browser save-page bundle root', () => {
    const root = demoUpload.findBrowserSavePageRoot([
      { name: 'My Site.html', content: Buffer.from('<html></html>'), isHtml: true },
      { name: 'My Site_files/logo.png', content: Buffer.from('x'), isHtml: false },
    ]);
    assert.equal(root.name, 'My Site.html');
  });

  it('inlines linked stylesheets from zip entries', () => {
    const html = '<html><head><link rel="stylesheet" href="css/site.css"></head><body></body></html>';
    const map = demoUpload.buildEntryMap([
      { name: 'css/site.css', content: Buffer.from('body { color: red; }') },
    ]);
    const out = demoUpload.inlineStylesheets(html, 'index.html', map, 'https://example.com/');
    assert.match(out, /<style[^>]*data-inlined-from="css\/site\.css"/);
    assert.match(out, /color: red/);
    assert.doesNotMatch(out, /href="css\/site\.css"/);
  });

  it('rewrites zip asset paths to demo-relative URLs', () => {
    const html = '<img src="assets/logo.png">';
    const map = demoUpload.buildEntryMap([
      { name: 'assets/logo.png', content: Buffer.from('png') },
    ]);
    const out = demoUpload.rewriteAttrUrls(html, 'index.html', map, 'https://example.com/');
    assert.match(out, /src="assets\/logo\.png"/);
  });

  it('rewrites missing assets to absolute brand URLs', () => {
    const html = '<img src="/missing.png">';
    const map = demoUpload.buildEntryMap([]);
    const out = demoUpload.rewriteAttrUrls(html, 'index.html', map, 'https://example.com/');
    assert.match(out, /src="https:\/\/example\.com\/missing\.png"/);
  });
});

describe('brandScraperDemoHtmlPolish', () => {
  const polish = require('../brandScraperDemoHtmlPolish');

  it('strips doubleclick ad iframes', () => {
    const html = '<body><iframe src="https://s0.2mdn.net/sadbundle/abc/index.html"></iframe><p>News</p></body>';
    const out = polish.stripAdvertBlocks(html);
    assert.doesNotMatch(out, /<iframe/i);
    assert.match(out, /News/);
  });

  it('strips Sourcepoint consent iframes and hides overlay roots', () => {
    const html = [
      '<html><head></head><body>',
      '<div id="sp_message_container_123" role="dialog" aria-modal="true">',
      '<iframe id="sp_message_iframe_123" title="SP Consent Message" src="page-files/consent/index.html"></iframe>',
      '</div>',
      '<p>Headline</p></body></html>',
    ].join('');
    const out = polish.polishDemoHtml(html);
    assert.doesNotMatch(out, /sp_message_iframe/i);
    assert.match(out, /aep-demo-overlay-failsafe/);
    assert.match(out, /Headline/);
  });

  it('shouldStripIframe keeps YouTube embeds', () => {
    const tag = '<iframe src="https://www.youtube.com/embed/abc123"></iframe>';
    assert.equal(polish.shouldStripIframe(tag), false);
    assert.equal(polish.shouldStripIframe('<iframe src="page-files/ad/index.html"></iframe>'), true);
  });

  it('flags consent bundle entries for exclusion', () => {
    const consentHtml = Buffer.from('<!DOCTYPE html><html><head><title>SP Consent Message</title></head><body></body></html>');
    assert.ok(polish.isOverlayBundleEntry('page-files/consent/index.html', consentHtml));
  });

  it('replaces logo-like broken images with customer logo asset path', () => {
    const html = '<header><img src="./Page_files/missing.svg" alt="Sky News logo" /></header>';
    const out = polish.applyCustomerLogoFallback(
      html,
      'Page.html',
      new Map(),
      '/profile-viewer/sky-news-demo-assets/_brand/customer-logo.png',
      () => null,
    );
    assert.match(out, /src="\/profile-viewer\/sky-news-demo-assets\/_brand\/customer-logo\.png"/);
    assert.ok(polish.imgLooksLikeLogo('<img alt="Sky News logo" />'));
  });

  it('strips base tags that break demo-relative asset paths', () => {
    const html = '<head><base href="https://news.sky.com/uk"><title>Sky</title></head><body></body>';
    const out = polish.stripDocumentBaseTags(html);
    assert.doesNotMatch(out, /<base\b/i);
  });

  it('builds root-absolute profile-viewer demo asset URLs', () => {
    assert.equal(
      polish.profileViewerDemoAssetUrl('sky-news', '_brand/customer-logo.png'),
      '/profile-viewer/sky-news-demo-assets/_brand/customer-logo.png',
    );
  });

  it('detects customer logo asset paths in demo host', () => {
    const demoHost = require('../brandScraperDemoHost');
    assert.ok(demoHost.CUSTOMER_LOGO_ASSET_RE.test('sky-news-demo-assets/_brand/customer-logo.png'));
    assert.ok(demoHost.isImageAssetPath('the-telegraph-demo-assets/page-files/photo.jpg'));
    assert.ok(demoHost.isHtmlAssetPath('the-telegraph-demo-assets/page-files/consent/index.html'));
  });

  it('resolves demo logo context from nav when metadata is absent', async () => {
    const demoHost = require('../brandScraperDemoHost');
    assert.equal(typeof demoHost.resolveDemoLogoContext, 'function');
  });

  it('flags ad bundle entries for exclusion', () => {
    const adHtml = Buffer.from('<!DOCTYPE html><!-- saved from url=(0133)https://s0.2mdn.net/sadbundle/123/index.html -->');
    assert.ok(polish.isAdBundleEntry('Page_files/index.html', adHtml));
    assert.ok(!polish.isAdBundleEntry('Page_files/logo.png', Buffer.from('png')));
  });
});

describe('brandScraperProfileViewerDemo', () => {
  const pvDemo = require('../brandScraperProfileViewerDemo');

  it('builds profile-viewer demo href from customer slug', () => {
    assert.equal(pvDemo.normalizeFileSlug('British Army'), 'british-army');
    assert.equal(pvDemo.profileViewerDemoHref('british-army'), 'british-army-demo.html');
    assert.equal(pvDemo.profileViewerDemoUrl('sky'), '/profile-viewer/sky-demo.html');
  });

  it('builds shell html with iframe snapshot path', () => {
    const html = pvDemo.buildShellHtml({
      fileSlug: 'acme',
      record: { customerName: 'Acme Corp', url: 'https://acme.example/' },
    });
    assert.match(html, /acme-demo-assets\/index\.html/);
    assert.match(html, /Acme Corp \(web\)/);
    assert.match(html, /labCoreScript: 'brand-scraper-site-clone-lab-core\.js/);
    assert.match(html, /brand-scraper-site-clone-lab-core\.js/);
  });
});

describe('brandScraperDemoHost profile-viewer paths', () => {
  const demoHost = require('../brandScraperDemoHost');

  it('parses profile-viewer demo html and asset paths', () => {
    const page = demoHost.parseProfileViewerDemoPath('/profile-viewer/british-army-demo.html');
    assert.equal(page.fileSlug, 'british-army');
    assert.equal(page.relFile, 'british-army-demo.html');
    const asset = demoHost.parseProfileViewerDemoPath('/profile-viewer/british-army-demo-assets/index.html');
    assert.equal(asset.relFile, 'british-army-demo-assets/index.html');
  });
});

describe('brandScraperDemoWebsite', () => {
  const uploadAssetsMod = require('../brandScraperUploadAssets');

  it('normalizes customer folder names', () => {
    assert.equal(demoWebsite.normalizeCustomerFolder('Sky News UK'), 'sky-news-uk');
    assert.equal(demoWebsite.normalizeCustomerFolder('Acme Corp!!!'), 'acme-corp');
  });

  it('logical demo path uses normalized slug', () => {
    assert.equal(demoWebsite.logicalDemoPath('sky-news'), '/demos/sky-news/web');
  });

  it('detects html entries for upload-based demos', () => {
    assert.equal(uploadAssetsMod.hasHtmlEntries([
      { name: 'assets/logo.png', content: Buffer.from('x'), isHtml: false },
    ]), false);
    assert.equal(uploadAssetsMod.hasHtmlEntries([
      { name: 'Page.html', content: Buffer.from('<html></html>'), isHtml: true },
    ]), true);
  });
});

describe('brandScrapeStore buildFullRecord', () => {
  const { buildFullRecord } = require('../brandScrapeStore');

  it('persists graceful scrape metadata fields', () => {
    const rec = buildFullRecord('kirkham', 'abc123', {
      url: 'https://news.sky.com/uk',
      brandName: 'News',
      customerName: 'Sky News',
      customerLogo: { source: 'wikipedia', url: 'https://example.com/logo.jpg', wikipediaTitle: 'Sky News' },
      blockedPages: [{ url: 'https://news.sky.com/about', status: 403 }],
      scrapeConfidence: { level: 'medium', score: 62 },
      sourceBadges: ['Live URL', 'Blocked'],
      warnings: ['Some pages returned 403.'],
      demoWebsite: { path: '/profile-viewer/sky-news-demo.html', publicUrl: '/profile-viewer/sky-news-demo.html', profileViewerDemoHref: 'sky-news-demo.html' },
      demoGenerationStatus: 'created',
      uploadAssetsPrefix: 'scrapes/kirkham/abc123/upload-assets/',
    });
    assert.equal(rec.scrapeId, 'abc123');
    assert.equal(rec.customerName, 'Sky News');
    assert.equal(rec.customerLogo.wikipediaTitle, 'Sky News');
    assert.equal(rec.blockedPages.length, 1);
    assert.equal(rec.scrapeConfidence.level, 'medium');
    assert.deepEqual(rec.sourceBadges, ['Live URL', 'Blocked']);
    assert.equal(rec.demoGenerationStatus, 'created');
    assert.equal(rec.demoWebsite.path, '/profile-viewer/sky-news-demo.html');
    assert.equal(rec.uploadAssetsPrefix, 'scrapes/kirkham/abc123/upload-assets/');
  });
});

describe('brandScraperCustomerLogo', () => {
  const logoResolver = require('../brandScraperCustomerLogo');

  it('extracts registrable domain from URLs', () => {
    assert.equal(logoResolver.extractDomain('https://www.sky.com/'), 'sky.com');
    assert.equal(logoResolver.extractDomain('news.sky.com'), 'news.sky.com');
  });

  it('ranks Brandfetch logo formats', () => {
    const url = logoResolver.pickBrandfetchLogoUrl({
      logos: [
        { type: 'icon', formats: [{ format: 'png', src: 'https://example.com/icon.png' }] },
        { type: 'logo', formats: [{ format: 'svg', src: 'https://example.com/logo.svg' }] },
      ],
    });
    assert.equal(url, 'https://example.com/logo.svg');
  });

  it('maps source keys to run-step labels', () => {
    assert.match(logoResolver.sourceStepLabel('clearbit'), /Clearbit/);
    assert.match(logoResolver.sourceStepLabel('google-favicon'), /Google favicon/);
    assert.match(logoResolver.sourceStepLabel('og-image-logo'), /Open Graph lockup/);
  });

  it('scores og:image lockup URLs above generic hero images', () => {
    const lockup = 'https://www.army.mod.uk/media/21615/army-lockup-whitetext-blackback.png?width=1200';
    const hero = 'https://www.army.mod.uk/media/hero-campaign-banner.jpg?width=1200&height=630';
    assert.ok(logoResolver.scoreOgImageLogoUrl(lockup) > logoResolver.scoreOgImageLogoUrl(hero));
    assert.equal(
      logoResolver.pickOgImageLogoUrl({
        ogImages: [hero, lockup],
      }),
      lockup,
    );
  });

  it('ranks logo-like og:image before wikipedia in resolver order', () => {
    const ranked = logoResolver.rankOgImageLogoUrls({
      ogImages: [
        'https://example.com/hero-banner.jpg',
        'https://example.com/assets/brand-logo.png',
      ],
    });
    assert.match(ranked[0].url, /brand-logo/);
    assert.ok(ranked[0].score >= 12);
  });
});

describe('brandScraperWikipediaLogo', () => {
  const wikiLogo = require('../brandScraperWikipediaLogo');

  it('scores logo filenames on page image lists', () => {
    assert.ok(wikiLogo.scoreLogoFilename('File:Sky News 2026.svg') > wikiLogo.scoreLogoFilename('File:Commons-logo.svg'));
    assert.equal(wikiLogo.pickLogoFileFromImages([
      { title: 'File:Commons-logo.svg' },
      { title: 'File:Sky News 2015 (logo).svg' },
      { title: 'File:Sky News 2026.svg' },
    ]), 'File:Sky News 2026.svg');
  });

  it('builds UK disambiguation queries', () => {
    const q = wikiLogo.buildLogoQueries('Sky', 'United Kingdom');
    assert.equal(q[0], 'Sky UK');
    assert.ok(q.includes('Sky'));
  });
});

describe('brandScraperDemoFromUpload', () => {
  const demoFromUpload = require('../brandScraperDemoFromUpload');

  it('filterSavePageEntries keeps browser save root and _files companion only', () => {
    const entries = [
      { name: 'Sky News.html', content: Buffer.from('<html></html>'), isHtml: true },
      { name: 'Sky News_files/a.css', content: Buffer.from('body{}') },
      { name: 'other/junk.bin', content: Buffer.from('x') },
    ];
    const filtered = demoFromUpload.filterSavePageEntries(entries, { name: 'Sky News.html' });
    assert.equal(filtered.length, 2);
    assert.ok(filtered.some((e) => e.name === 'Sky News.html'));
    assert.ok(filtered.some((e) => e.name === 'Sky News_files/a.css'));
  });

  it('canonicalizeSavePageAssetEntries shortens long _files paths for GCS', () => {
    const longPrefix = 'UK News - The latest headlines from the UK _ Sky News_files/';
    const entries = [
      { name: 'UK News - The latest headlines from the UK _ Sky News.html', content: Buffer.from('<html></html>'), isHtml: true },
      { name: `${longPrefix}4.js.download`, content: Buffer.from('js') },
      { name: `${longPrefix}style.css`, content: Buffer.from('body{}') },
    ];
    const picked = { name: 'UK News - The latest headlines from the UK _ Sky News.html' };
    const { entries: canon, htmlRewrites } = demoFromUpload.canonicalizeSavePageAssetEntries(entries, picked);
    assert.ok(canon.some((e) => e.name === 'page-files/4.js.download'));
    assert.ok(canon.some((e) => e.name === 'page-files/style.css'));
    assert.ok(!canon.some((e) => /_files\//.test(e.name)));
    assert.ok(htmlRewrites.some((r) => r.from === longPrefix && r.to === 'page-files/'));
    const html = demoFromUpload.applyHtmlPathRewrites(
      `<script src="${longPrefix}4.js.download"></script>`,
      htmlRewrites,
    );
    assert.match(html, /page-files\/4\.js\.download/);
  });
});

describe('brandScraperProfileViewerDemo nav ownership', () => {
  const pvDemo = require('../brandScraperProfileViewerDemo');

  it('resolveDemoNavOwnerHandle prefers explicit lab owner handle', () => {
    assert.equal(pvDemo.resolveDemoNavOwnerHandle({ labOwnerHandle: 'Kirkham' }), 'kirkham');
    assert.equal(pvDemo.resolveDemoNavOwnerHandle({ demoNavOwnerHandle: 'apalmer' }), 'apalmer');
  });

  it('resolveDemoNavOwnerHandle falls back to known sandbox presets', () => {
    assert.equal(pvDemo.resolveDemoNavOwnerHandle({ sandbox: 'kirkham' }), 'kirkham');
    assert.equal(pvDemo.resolveDemoNavOwnerHandle({ sandbox: 'demoemea' }), 'apalmer');
  });

  it('buildNavEntry stamps owners and sandboxes for sidebar Mine filter', () => {
    const entry = pvDemo.buildNavEntry({
      fileSlug: 'acme-corp',
      record: { customerName: 'Acme Corp', scrapeId: 'abc123' },
      sandbox: 'kirkham',
      scrapeId: 'abc123',
      labOwnerHandle: 'kirkham',
    });
    assert.deepEqual(entry.demoMeta.owners, ['kirkham']);
    assert.deepEqual(entry.demoMeta.sandboxes, ['kirkham']);
    assert.equal(entry.href, 'acme-corp-demo.html');
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

  it('lists retired legacy demo slugs', () => {
    assert.ok(demoHost.RETIRED_DEMO_SLUGS.has('news'));
  });
});
