'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const normalize = require('../brandScraperHtmlNormalize');
const demoFromUpload = require('../brandScraperDemoFromUpload');
const demoWebsite = require('../brandScraperDemoWebsite');

const CAPTURE = `<!doctype html>
<html><head><script src="/_next/app.js"></script></head>
<body onload="hydrate()">
  <header><nav>Primary</nav></header>
  <main>
    <section class="hero promo"><h1>Welcome Home</h1><p>Intro copy</p><img src="hero.jpg" width="1200"></section>
    <section><h2>Latest offers</h2><div class="cards">
      <article class="card">One</article><article class="card">Two</article><article class="card">Three</article>
    </div></section>
  </main>
  <noscript><img src="tracking.gif"></noscript>
</body></html>`;

describe('brandScraperHtmlNormalize', () => {
  it('ports the destaticize pass without removing CSS or static markup', () => {
    const html = normalize.destaticizeHtml(`${CAPTURE}<script async src="stray.js" />`);
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /<noscript\b/i);
    assert.doesNotMatch(html, /\sonload=/i);
    assert.match(html, /class="hero promo"/);
    assert.match(html, /hero\.jpg/);
  });

  it('adds stable AJO anchors, a hero mount, a card-container id, and the glue script', () => {
    const html = normalize.normalizeCapturedHtml(CAPTURE);
    const ribbonAt = html.indexOf('id="TopRibbon"');
    const mainAt = html.indexOf('<main>');
    assert.ok(ribbonAt > html.indexOf('</header>') && ribbonAt < mainAt);
    assert.match(html, /data-ajo-insert-section="welcome-home"/);
    assert.match(html, /data-ajo-insert-section="latest-offers"/);
    assert.match(html, /id="hero-banner" data-hero-mount/);
    assert.match(html, /class="cards" id="ContentCardContainer"/);
    assert.match(html, /<script src="generic-site-glue\.js"><\/script><\/body>/);
  });

  it('is byte-for-byte idempotent and preserves existing annotations and ids', () => {
    const source = CAPTURE
      .replace('class="hero promo"', 'class="hero promo" id="brand-hero" data-hero-mount')
      .replace('<section><h2>Latest offers', '<section data-ajo-insert-section="offers"><h2>Latest offers');
    const once = normalize.normalizeCapturedHtml(source);
    const twice = normalize.normalizeCapturedHtml(once);
    assert.equal(twice, once);
    assert.match(once, /id="brand-hero" data-hero-mount/);
    assert.match(once, /data-ajo-insert-section="offers"/);
    assert.doesNotMatch(once, /id="hero-banner"/);
    assert.equal((once.match(/id="TopRibbon"/g) || []).length, 1);
    assert.equal((once.match(/generic-site-glue\.js/g) || []).length, 1);
  });

  it('ships the glue shim as a generated output asset', () => {
    const file = normalize.genericSiteGlueFile();
    assert.equal(file.name, 'generic-site-glue.js');
    assert.equal(file.contentType, 'application/javascript; charset=utf-8');
    assert.match(file.content.toString('utf8'), /__genericSiteGlueRan/);
  });

  it('normalizes ZIP-upload HTML before injecting the existing site-clone scripts', async () => {
    const result = await demoFromUpload.buildDemoFromUpload({
      entries: [
        { name: 'Saved Page.html', isHtml: true, content: Buffer.from(CAPTURE) },
        { name: 'Saved Page_files/site.css', content: Buffer.from('.hero{display:block}') },
      ],
      baseUrl: 'https://example.com/',
      record: { brandName: 'Example', assets: {} },
      slug: 'example',
      prefix: 'example',
      skipLabChrome: true,
    });
    const html = result.files.find((file) => file.name === 'index.html').content.toString('utf8');
    assert.ok(html.indexOf('generic-site-glue.js') < html.indexOf('site-clone-login.js'));
    assert.equal(result.files.filter((file) => file.name === 'generic-site-glue.js').length, 1);
    assert.doesNotMatch(html, /\/_next\/app\.js/);
    assert.match(html, /id="TopRibbon"/);
    assert.ok(result.assetSummary);
    assert.match(result.assetSummary.message, /^1\/1 local, \d+ fetched live, \d+ skipped$/);
  });

  it('applies the same normalization to the generated live-scrape fallback', async () => {
    const result = await demoWebsite.buildInnerSnapshotFiles({
      brandName: 'Example',
      baseUrl: 'https://example.com/',
      crawlSummary: {
        pages: [{ url: 'https://example.com/', title: 'Home' }],
        assets: {},
      },
      campaigns: [
        { name: 'One', objective: 'First' },
        { name: 'Two', objective: 'Second' },
        { name: 'Three', objective: 'Third' },
      ],
    }, 'example', 'example', [], {});
    const htmlFile = result.files.find((file) => file.name === 'example-demo-assets/index.html');
    const html = htmlFile.content.toString('utf8');
    assert.ok(html.indexOf('generic-site-glue.js') < html.indexOf('site-clone-login.js'));
    assert.ok(result.files.some((file) => file.name === 'example-demo-assets/generic-site-glue.js'));
    assert.match(html, /id="TopRibbon"/);
    assert.match(html, /data-hero-mount/);
  });

  it('routes a retained live rendered DOM through the captured-page builder', async () => {
    const result = await demoWebsite.buildInnerSnapshotFiles({
      brandName: 'Example',
      baseUrl: 'https://example.com/',
      captureSource: 'live_capture',
      crawlSummary: { pages: [], assets: {} },
    }, 'example', 'example', [
      { name: 'index.html', isHtml: true, sourceType: 'live_capture', content: Buffer.from(CAPTURE) },
    ], {});
    const html = result.files.find((file) => file.name === 'example-demo-assets/index.html').content.toString('utf8');
    assert.equal(result.source, 'live_capture');
    assert.doesNotMatch(html, /\/_next\/app\.js/);
    assert.match(html, /id="TopRibbon"/);
    assert.ok(result.files.some((file) => file.name === 'example-demo-assets/generic-site-glue.js'));
  });

  it('prefers a logo bundled in uploaded HTML over the separately scraped logo', async () => {
    const htmlWithLogo = CAPTURE.replace(
      '<header><nav>Primary</nav></header>',
      '<header><a href="/"><img class="site-logo" alt="Example logo" src="Saved Page_files/example-logo.svg"></a><nav>Primary</nav></header>',
    );
    const result = await demoFromUpload.buildDemoFromUpload({
      entries: [
        { name: 'Saved Page.html', isHtml: true, content: Buffer.from(htmlWithLogo) },
        { name: 'Saved Page_files/example-logo.svg', content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
      ],
      baseUrl: 'https://example.com/',
      record: {
        brandName: 'Example',
        customerLogo: { url: 'https://upload.wikimedia.org/wrong-logo.png', source: 'wikipedia' },
        assets: {},
      },
      slug: 'example',
      prefix: 'example',
      skipLabChrome: true,
    });
    const outputHtml = result.files.find((file) => file.name === 'index.html').content.toString('utf8');
    assert.equal(result.usesUploadedLogo, true);
    assert.equal(result.uploadedLogoPath, 'page-files/example-logo.svg');
    assert.match(outputHtml, /"logoSrc":"page-files\/example-logo\.svg"/);
    assert.doesNotMatch(outputHtml, /wrong-logo|_brand\/customer-logo/);
  });
});
