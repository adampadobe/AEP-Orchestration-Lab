/**
 * Generate demo-ready static websites from brand scrape records.
 * Files are stored in GCS (production) and optionally on local repo paths for dev.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const demoFromUpload = require('./brandScraperDemoFromUpload');
const demoPolish = require('./brandScraperDemoHtmlPolish');
const pvDemo = require('./brandScraperProfileViewerDemo');
const siteCloneLogin = require('./brandScraperSiteCloneLogin');
const uploadAssets = require('./brandScraperUploadAssets');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const DEMO_GCS_PREFIX = 'demo-websites';
const PV_REL = '../../../profile-viewer';

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

/** Customer-safe folder slug: lowercase, hyphens, no unsafe chars. */
function normalizeCustomerFolder(raw) {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base.slice(0, 80) || 'brand-demo';
}

function repoRoot() {
  return String(process.env.LAB_REPO_ROOT || process.env.BRAND_SCRAPER_REPO_ROOT || '').trim();
}

function logicalDemoPath(slug) {
  return `/demos/${slug}/web`;
}

function localDemoDirs(slug) {
  const root = repoRoot();
  if (!root) return null;
  return {
    demos: path.join(root, 'demos', slug, 'web'),
    hosted: path.join(root, 'web', 'demos', slug, 'web'),
  };
}

function gcsDemoPrefix(slug, versionSuffix = '') {
  const folder = versionSuffix ? `${slug}${versionSuffix}` : slug;
  return `${DEMO_GCS_PREFIX}/${folder}/web`;
}

async function gcsObjectExists(prefix, name) {
  try {
    const [exists] = await getBucket().file(`${prefix}/${name}`).exists();
    return exists;
  } catch (_e) {
    return false;
  }
}

function localIndexExists(dir) {
  try {
    return fs.existsSync(path.join(dir, 'index.html'));
  } catch (_e) {
    return false;
  }
}

async function detectExistingDemo(slug) {
  const checks = [];
  const local = localDemoDirs(slug);
  if (local) {
    if (localIndexExists(local.demos)) checks.push({ kind: 'local', path: logicalDemoPath(slug), dir: local.demos });
    else if (localIndexExists(local.hosted)) checks.push({ kind: 'local-hosted', path: logicalDemoPath(slug), dir: local.hosted });
  }
  const gcsPrefix = gcsDemoPrefix(slug);
  if (await gcsObjectExists(gcsPrefix, 'index.html')) {
    checks.push({ kind: 'gcs', path: logicalDemoPath(slug), prefix: gcsPrefix });
  }
  return checks[0] || null;
}

function pickBrandColours(assets) {
  const colours = (assets && Array.isArray(assets.colours)) ? assets.colours : [];
  const vals = colours.map((c) => (typeof c === 'string' ? c : c.value)).filter(Boolean);
  return {
    primary: vals[0] || 'var(--dash-blue)',
    secondary: vals[1] || 'var(--dash-text-secondary)',
    accent: vals[2] || 'var(--dash-blue)',
  };
}

function pickFonts(assets) {
  const fonts = (assets && Array.isArray(assets.fonts)) ? assets.fonts : [];
  const vals = fonts.map((f) => (typeof f === 'string' ? f : f.value)).filter(Boolean);
  return vals[0] || 'system-ui, sans-serif';
}

function navFromPages(pages, baseUrl) {
  const links = [];
  const seen = new Set();
  for (const p of pages || []) {
    const title = String(p.title || '').trim();
    let href = '#';
    try {
      if (p.url) href = new URL(p.url, baseUrl).pathname || '#';
    } catch (_e) { /* ignore */ }
    const label = title.split(/[|\-–—]/)[0].trim().slice(0, 40) || href;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ label, href });
    if (links.length >= 8) break;
  }
  if (!links.length) {
    return [
      { label: 'Home', href: '#' },
      { label: 'About', href: '#about' },
      { label: 'Products', href: '#products' },
      { label: 'Contact', href: '#contact' },
    ];
  }
  return links;
}

function heroCopy(record) {
  const about = (record.analysis && !record.analysis.skipped && record.analysis.about) || '';
  const brand = record.brandName || 'Brand';
  const page = (record.crawlSummary && record.crawlSummary.pages && record.crawlSummary.pages[0]) || {};
  return {
    headline: page.title || `${brand} — demo experience`,
    subhead: about || page.description || `A demo-ready visual approximation based on authorised scraped or uploaded content for ${brand}.`,
  };
}

function campaignBlocks(record) {
  const camps = (record.campaigns && Array.isArray(record.campaigns.campaigns))
    ? record.campaigns.campaigns
    : [];
  return camps.slice(0, 4).map((c) => ({
    title: c.name || c.headline || 'Campaign',
    body: c.description || c.headline || '',
    cta: c.cta || 'Learn more',
  }));
}

function buildStylesCss(record, colours, fontFamily, slug) {
  const partial = (record.scrapeConfidence && record.scrapeConfidence.level !== 'high');
  return `/* Generated demo styles — ${slug} */
:root {
  --brand-primary: ${colours.primary};
  --brand-secondary: ${colours.secondary};
  --brand-accent: ${colours.accent};
  --brand-font: ${fontFamily};
}
*, *::before, *::after { box-sizing: border-box; }
body.${slug}-demo-page {
  margin: 0;
  font-family: var(--brand-font);
  color: var(--dash-text, #1e293b);
  background: var(--dash-bg, #f8fafc);
}
.${slug}-demo-banner {
  background: var(--dash-surface-alt, #f1f5f9);
  border-bottom: 1px solid var(--dash-border, #e2e8f0);
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  color: var(--dash-text-secondary, #64748b);
}
.${slug}-demo-main { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
.${slug}-hero {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-accent));
  color: #fff;
  border-radius: var(--dash-radius, 16px);
  padding: 2.5rem 2rem;
  margin-bottom: 2rem;
}
.${slug}-hero h1 { margin: 0 0 0.75rem; font-size: clamp(1.6rem, 4vw, 2.4rem); }
.${slug}-hero p { margin: 0 0 1.25rem; opacity: 0.95; max-width: 52ch; }
.${slug}-cta {
  display: inline-block;
  background: #fff;
  color: var(--brand-primary);
  padding: 0.65rem 1.25rem;
  border-radius: var(--dash-radius-sm, 12px);
  text-decoration: none;
  font-weight: 600;
}
.${slug}-nav { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-bottom: 2rem; }
.${slug}-nav a { color: var(--brand-primary); text-decoration: none; font-weight: 500; }
.${slug}-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
.${slug}-card {
  background: var(--dash-surface, #fff);
  border: 1px solid var(--dash-border, #e2e8f0);
  border-radius: var(--dash-radius-sm, 12px);
  padding: 1.25rem;
  box-shadow: var(--dash-shadow, 0 1px 3px rgba(15,23,42,0.08));
}
.${slug}-card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.${slug}-partial-tag {
  display: inline-block;
  margin-left: 0.5rem;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--dash-warning-bg, #fef3c7);
  color: var(--dash-warning-text, #92400e);
}
.${slug}-profile-zone {
  margin: 2rem auto;
  max-width: 1100px;
  padding: 0 1rem;
}
.${slug}-footer {
  border-top: 1px solid var(--dash-border, #e2e8f0);
  padding: 1.5rem 1rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--dash-muted, #94a3b8);
}
@media (max-width: 768px) {
  .${slug}-hero { padding: 1.75rem 1.25rem; }
}
${partial ? `/* Partial demo — limited source content */` : ''}
`;
}

function buildIndexHtml(record, slug, prefix, nav, hero, campaigns, partial) {
  const brand = record.brandName || 'Brand';
  const scrapeId = record.scrapeId || '';
  const navHtml = nav.map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`).join('\n      ');
  const campHtml = campaigns.length
    ? campaigns.map((c) => (
      `<article class="${slug}-card"><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.body)}</p><a class="${slug}-cta" href="#">${escapeHtml(c.cta)}</a></article>`
    )).join('\n        ')
    : `<article class="${slug}-card"><h3>Products &amp; services</h3><p>Representative content blocks generated from available brand messaging.</p><a class="${slug}-cta" href="#">Explore</a></article>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brand)} — demo</title>
  <meta name="description" content="Demo-ready visual approximation for ${escapeHtml(brand)}. Linked to brand scrape ${escapeHtml(scrapeId)}.">
  <script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');}catch(e){}})();</script>
  <link rel="stylesheet" href="${PV_REL}/style.css">
  <link rel="stylesheet" href="${PV_REL}/home.css">
  <link rel="stylesheet" href="${PV_REL}/aep-demo-env-bar.css">
  <link rel="stylesheet" href="${PV_REL}/aep-profile-drawer.css">
  <link rel="stylesheet" href="${PV_REL}/aep-theme.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body class="${slug}-demo-page home-dashboard-concierge">
  <div hidden data-demo-env-strip-mount="site-clone-minimal" data-demo-env-strip-prefix="${prefix}"></div>

  <p class="${slug}-demo-banner" role="note">
    AEP Orchestration Lab demo — visual approximation based on authorised scraped or uploaded content.
    Not an exact copy. Scrape: <code>${escapeHtml(scrapeId)}</code>
    ${partial ? `<span class="${slug}-partial-tag">Partial demo</span>` : ''}
  </p>

  <main class="${slug}-demo-main">
    <nav class="${slug}-nav" aria-label="Primary">${navHtml}</nav>
    <section class="${slug}-hero" id="hero">
      <h1>${escapeHtml(hero.headline)}</h1>
      <p>${escapeHtml(hero.subhead)}</p>
      <a class="${slug}-cta" href="#">Get started</a>
    </section>
    <section class="${slug}-grid" id="campaigns" aria-label="Campaigns and services">
        ${campHtml}
    </section>
  </main>

  <div class="${slug}-profile-zone" id="aepDemoProfileSection" aria-label="Profile lookup"></div>

  <div class="aep-profile-drawer-hover-zone" id="profileHoverZone" aria-hidden="true"></div>
  <aside class="aep-profile-drawer" id="profileDrawer" aria-label="Profile viewer" hidden></aside>

  <footer class="${slug}-footer">
  <p>Generated demo website · ${escapeHtml(brand)} · <a href="${PV_REL}/brand-scraper.html">Brand Scraper</a></p>
  </footer>

  <script src="${PV_REL}/firebase-database-config.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script src="${PV_REL}/aep-global-sandbox.js"></script>
  <script src="${PV_REL}/aep-lab-sandbox-sync.js"></script>
  <script src="${PV_REL}/email-cache.js"></script>
  <script src="${PV_REL}/identity-picker.js"></script>
  <script src="${PV_REL}/aep-profile-drawer.js"></script>
  <script src="${PV_REL}/demo-tags-injection.js"></script>
  <script src="${PV_REL}/aep-demo-env-bar.js"></script>
  <script src="${PV_REL}/shared/env-bar.js"></script>
  <script src="script.js"></script>
</body>
</html>`;
}

function buildScriptJs(slug, prefix) {
  return `(function () {
  'use strict';
  var PREFIX = '${prefix}';
  window.envBarConfig = window.envBarConfig || {
    prefix: PREFIX,
    mode: 'minimal',
    mountLayout: 'site-clone-minimal',
  };
  if (typeof window.envBar !== 'undefined' && typeof window.envBar.init === 'function') {
    window.envBar.init(window.envBarConfig);
  }
  if (typeof DemoProfileDrawer !== 'undefined' && DemoProfileDrawer.init) {
    DemoProfileDrawer.init({
      emailInputId: 'customerEmail',
      profileOpenClass: '${slug}-demo-page--profile-open',
      viewName: '${slug} demo',
      fetchBrowserEcidOnInit: true,
    });
  }
})();`;
}

function buildDemoMetadata(record, slug, status, extra = {}) {
  const logo = record && record.customerLogo;
  return {
    scrapeId: record.scrapeId || null,
    sandbox: extra.sandbox || record.sandbox || null,
    brandName: record.brandName || null,
    url: record.url || record.baseUrl || null,
    customerLogoStoredPath: (logo && logo.storedPath) || null,
    logicalPath: logicalDemoPath(slug),
    generatedAt: new Date().toISOString(),
    status,
    partial: (record.scrapeConfidence && record.scrapeConfidence.level !== 'high') || false,
    sourceBadges: record.sourceBadges || [],
    scrapeConfidence: record.scrapeConfidence || null,
    ...extra,
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function uploadFilesToGcs(prefix, files) {
  const bucket = getBucket();
  for (const f of files) {
    await bucket.file(`${prefix}/${f.name}`).save(f.content, {
      contentType: f.contentType || 'application/octet-stream',
      resumable: false,
      metadata: { cacheControl: 'public, max-age=300' },
    });
  }
}

function writeLocalFiles(dirs, files) {
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const dest = path.join(dir, f.name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content);
    }
  }
}

function buildIframeSnapshotHtml(record, slug, nav, hero, campaigns, partial, logoRelPath) {
  const brand = record.brandName || 'Brand';
  const navHtml = nav.map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`).join('\n      ');
  const campHtml = campaigns.length
    ? campaigns.map((c) => (
      `<article class="${slug}-card"><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.body)}</p><a class="${slug}-cta" href="#">${escapeHtml(c.cta)}</a></article>`
    )).join('\n        ')
    : `<article class="${slug}-card"><h3>Products &amp; services</h3><p>Representative content from the brand scrape.</p><a class="${slug}-cta" href="#">Explore</a></article>`;
  const logoHtml = logoRelPath
    ? `<header class="${slug}-header"><img class="${slug}-logo aep-demo-customer-logo-fallback" src="${escapeHtml(logoRelPath)}" alt="${escapeHtml(brand)} logo" decoding="async" /></header>`
    : '';
  const loginConfig = siteCloneLogin.buildSiteCloneLoginConfig({
    fileSlug: slug,
    record,
    logoSrc: logoRelPath || '',
    accentColor: pickBrandColours((record && record.assets) || {}).primary,
  });
  const loginSnippet = siteCloneLogin.buildLoginInjectionSnippet(loginConfig);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brand)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="${slug}-snapshot">
  ${logoHtml}
  <nav class="${slug}-nav" aria-label="Primary">${navHtml}</nav>
  <section class="${slug}-hero"><h1>${escapeHtml(hero.headline)}</h1><p>${escapeHtml(hero.subhead)}</p></section>
  <section class="${slug}-grid">${campHtml}</section>
  ${partial ? `<p class="${slug}-partial-tag">Partial demo — limited source content</p>` : ''}
  ${loginSnippet}
</body>
</html>`;
}

async function buildInnerSnapshotFiles(record, fileSlug, prefix, uploadEntries, opts = {}) {
  let entries = uploadEntries || [];
  if (!uploadAssets.hasHtmlEntries(entries)) {
    entries = await uploadAssets.resolveDemoUploadEntries(record, opts);
  }

  const hadUploadedHtml = !!(record.uploadedHtmlSummary && record.uploadedHtmlSummary.validHtmlFiles > 0)
    || !!(record.uploadAssetsPrefix)
    || (Array.isArray(record.fallbackSources) && record.fallbackSources.some((s) => s && s.type === 'uploaded_html'));

  const hasUploadHtml = uploadAssets.hasHtmlEntries(entries);
  if (hasUploadHtml) {
    const uploadBuilt = await demoFromUpload.buildDemoFromUpload({
      entries,
      baseUrl: record.baseUrl || record.url,
      record,
      slug: fileSlug,
      prefix,
      skipLabChrome: true,
      sandbox: opts.sandbox,
      scrapeId: opts.scrapeId || record.scrapeId,
    });
    if (uploadBuilt && uploadBuilt.files && uploadBuilt.files.length) {
      return {
        files: pvDemo.mapInnerFilesToAssetPaths(fileSlug, uploadBuilt.files),
        source: 'uploaded_html',
        sourceHtmlPath: uploadBuilt.sourceHtmlPath,
      };
    }
    if (hadUploadedHtml) {
      throw new Error('Uploaded HTML was saved for this scrape but the demo builder could not produce a snapshot from it.');
    }
  }

  if (hadUploadedHtml && opts.enabled !== false) {
    throw new Error('This scrape included uploaded HTML for site clone, but no upload bundle was found in storage. Re-run the scrape with the same ZIP attached, or use Regenerate demo after a fresh scrape with uploads.');
  }

  const pages = (record.crawlSummary && record.crawlSummary.pages) || [];
  const assets = (record.crawlSummary && record.crawlSummary.assets) || record.assets || {};
  const colours = pickBrandColours(assets);
  const fontFamily = pickFonts(assets);
  const nav = navFromPages(pages, record.baseUrl || record.url);
  const hero = heroCopy(record);
  const campaigns = campaignBlocks(record);
  const partial = (record.scrapeConfidence && record.scrapeConfidence.level === 'low')
    || (record.warnings && record.warnings.length > 0);
  const assetsDir = pvDemo.demoAssetsDirName(fileSlug);

  const logoAsset = await demoPolish.resolveCustomerLogoAsset(record, {
    sandbox: opts.sandbox,
    scrapeId: opts.scrapeId || record.scrapeId,
  });
  const logoFileRel = logoAsset ? `${demoPolish.LOGO_REL_PREFIX}${logoAsset.ext}` : null;
  const logoRelPath = logoFileRel
    ? demoPolish.profileViewerDemoAssetUrl(fileSlug, logoFileRel)
    : null;
  const templateFiles = [
    {
      name: `${assetsDir}/index.html`,
      content: Buffer.from(buildIframeSnapshotHtml(record, fileSlug, nav, hero, campaigns, partial, logoRelPath), 'utf8'),
      contentType: 'text/html; charset=utf-8',
    },
    {
      name: `${assetsDir}/styles.css`,
      content: Buffer.from(buildStylesCss(record, colours, fontFamily, fileSlug), 'utf8'),
      contentType: 'text/css; charset=utf-8',
    },
  ];
  if (logoAsset && logoFileRel) {
    templateFiles.push({
      name: `${assetsDir}/${logoFileRel}`,
      content: logoAsset.buffer,
      contentType: logoAsset.contentType,
    });
  }

  return {
    files: templateFiles,
    source: 'scrape_template',
    sourceHtmlPath: `${assetsDir}/index.html`,
  };
}

async function finalizeProfileViewerDemo(record, opts, innerResult, statusFlags) {
  const fileSlug = statusFlags.fileSlug;
  const sandbox = opts.sandbox || null;
  const scrapeId = record.scrapeId || opts.scrapeId || null;
  const shellHtml = pvDemo.buildShellHtml({
    fileSlug,
    record,
    snapshotRelPath: `${pvDemo.demoAssetsDirName(fileSlug)}/index.html`,
  });

  const files = [
    {
      name: pvDemo.demoHtmlName(fileSlug),
      content: Buffer.from(shellHtml, 'utf8'),
      contentType: 'text/html; charset=utf-8',
    },
    ...(innerResult.files || []),
    {
      name: 'demo-metadata.json',
      content: Buffer.from(JSON.stringify(buildDemoMetadata(record, fileSlug, statusFlags.status, {
        fileSlug,
        source: innerResult.source,
        sourceHtmlPath: innerResult.sourceHtmlPath,
        profileViewerDemo: true,
        sandbox,
        scrapeId,
      }), null, 2), 'utf8'),
      contentType: 'application/json',
    },
  ];

  await demoPolish.ensureCustomerLogoDemoFile({
    record,
    fileSlug,
    sandbox,
    scrapeId,
    files,
  });

  await pvDemo.uploadProfileViewerDemoFiles(fileSlug, files);
  const wroteLocal = pvDemo.writeLocalProfileViewerDemoFiles(fileSlug, files);

  const navEntry = pvDemo.buildNavEntry({
    fileSlug,
    record,
    sandbox,
    scrapeId,
    labOwnerHandle: opts.labOwnerHandle,
  });
  await pvDemo.upsertNavManifestEntry(navEntry);

  const publicPath = pvDemo.profileViewerDemoUrl(fileSlug);
  return {
    enabled: true,
    status: statusFlags.partial ? 'partial' : statusFlags.status,
    demoGenerationStatus: statusFlags.partial ? 'partial' : statusFlags.demoGenerationStatus,
    path: publicPath,
    publicUrl: publicPath,
    profileViewerDemoHref: pvDemo.profileViewerDemoHref(fileSlug),
    fileSlug,
    navEntry,
    alreadyExisted: !!statusFlags.existing,
    regenerated: !!statusFlags.regenerated,
    generatedFiles: files.map((f) => f.name),
    source: innerResult.source,
    sourceHtmlPath: innerResult.sourceHtmlPath,
    requiredModules: {
      profileEnvironmentPanel: true,
      profileViewerModule: true,
    },
    notes: [
      `Profile Viewer demo at ${publicPath} (same pattern as sky-demo.html).`,
      innerResult.source === 'uploaded_html'
        ? `Iframe snapshot from uploaded HTML (${innerResult.sourceHtmlPath}).`
        : 'Iframe snapshot generated from scrape content.',
      'Demos sidebar entry added via brand-scraper demo nav manifest.',
      wroteLocal
        ? `Also written under web/profile-viewer/${pvDemo.demoHtmlName(fileSlug)} when LAB_REPO_ROOT is set.`
        : 'Served from GCS when not committed under web/profile-viewer/.',
    ],
    gcsPrefix: `profile-viewer-demos/${fileSlug}`,
  };
}

/**
 * @param {object} record — scrape record with crawlSummary, analysis, etc.
 * @param {{ customerName?: string, overwrite?: boolean, regenerate?: boolean, versionOnCollision?: boolean, uploadEntries?: Array, sandbox?: string, scrapeId?: string }} opts
 */
async function generateDemoWebsite(record, opts = {}) {
  const fileSlug = pvDemo.normalizeFileSlug(
    opts.customerName || record.customerName || record.brandName || record.url || 'brand',
  );
  const prefix = fileSlug.replace(/-/g, '').slice(0, 12) || 'brand';
  const enabled = opts.enabled !== false;
  if (!enabled) {
    return {
      enabled: false,
      status: 'not_requested',
      path: pvDemo.profileViewerDemoUrl(fileSlug),
      demoGenerationStatus: 'not_requested',
    };
  }

  if (pvDemo.RESERVED_DEMO_SLUGS.has(fileSlug)) {
    const reservedHref = `${fileSlug}-demo.html`;
    return {
      enabled: true,
      status: 'reused',
      demoGenerationStatus: 'reused',
      path: `/profile-viewer/${reservedHref}`,
      publicUrl: `/profile-viewer/${reservedHref}`,
      profileViewerDemoHref: reservedHref,
      fileSlug,
      alreadyExisted: true,
      regenerated: false,
      notes: [`Reserved lab demo slug "${fileSlug}" — using committed ${reservedHref} instead of generating a scraper copy.`],
    };
  }

  const overwrite = !!(opts.overwrite || opts.regenerate);
  const existing = await pvDemo.detectExistingProfileViewerDemo(fileSlug);
  if (existing && !overwrite) {
    const href = pvDemo.profileViewerDemoHref(fileSlug);
    try {
      await demoPolish.syncCustomerLogoToExistingDemo({
        fileSlug,
        record,
        sandbox: opts.sandbox || null,
        scrapeId: opts.scrapeId || record.scrapeId || null,
      });
      await pvDemo.upsertNavManifestEntry(pvDemo.buildNavEntry({
        fileSlug,
        record,
        sandbox: opts.sandbox || null,
        scrapeId: opts.scrapeId || record.scrapeId || null,
        labOwnerHandle: opts.labOwnerHandle,
      }));
    } catch (e) {
      console.warn('[generateDemoWebsite] nav/logo sync on reuse failed', fileSlug, String((e && e.message) || e));
    }
    return {
      enabled: true,
      status: 'reused',
      demoGenerationStatus: 'reused',
      path: pvDemo.profileViewerDemoUrl(fileSlug),
      publicUrl: pvDemo.profileViewerDemoUrl(fileSlug),
      profileViewerDemoHref: href,
      fileSlug,
      alreadyExisted: true,
      regenerated: false,
      generatedFiles: [href, `${pvDemo.demoAssetsDirName(fileSlug)}/index.html`],
      requiredModules: { profileEnvironmentPanel: true, profileViewerModule: true },
      notes: [
        'Profile Viewer demo already existed, so re-analyse did not recreate it.',
        `Open at /profile-viewer/${href}`,
      ],
    };
  }

  const status = existing && overwrite ? 'regenerated' : 'created';
  const partial = (record.scrapeConfidence && record.scrapeConfidence.level === 'low')
    || (record.warnings && record.warnings.length > 0);

  try {
    if (existing && overwrite) {
      await pvDemo.deleteProfileViewerDemo(fileSlug);
    }
    const resolvedUploadEntries = await uploadAssets.resolveDemoUploadEntries(record, {
      uploadEntries: opts.uploadEntries || [],
      sandbox: opts.sandbox,
      scrapeId: opts.scrapeId || record.scrapeId,
    });
    const innerResult = await buildInnerSnapshotFiles(
      record,
      fileSlug,
      prefix,
      resolvedUploadEntries,
      {
        enabled: opts.enabled,
        sandbox: opts.sandbox,
        scrapeId: opts.scrapeId || record.scrapeId,
      },
    );
    return await finalizeProfileViewerDemo(record, opts, innerResult, {
      fileSlug,
      status,
      partial,
      existing: !!existing,
      regenerated: !!(existing && overwrite),
      demoGenerationStatus: existing && overwrite ? 'regenerated' : 'created',
    });
  } catch (e) {
    return {
      enabled: true,
      status: 'failed',
      demoGenerationStatus: 'failed',
      path: pvDemo.profileViewerDemoUrl(fileSlug),
      error: String((e && e.message) || e).slice(0, 400),
      requiredModules: { profileEnvironmentPanel: false, profileViewerModule: false },
    };
  }
}

module.exports = {
  normalizeCustomerFolder,
  logicalDemoPath,
  detectExistingDemo,
  generateDemoWebsite,
  buildInnerSnapshotFiles,
};
