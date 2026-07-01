/**
 * Site-clone login injection for brand-scraper iframe snapshots.
 */
'use strict';

const LOGIN_CSS = '/profile-viewer/site-clone-login.css?v=20260702-site-clone-login';
const LOGIN_JS = '/profile-viewer/site-clone-login.js?v=20260702-site-clone-login';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsString(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function displayBrandName(record, fileSlug) {
  return String(
    (record && record.customerName)
    || (record && record.brandName)
    || String(fileSlug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  ).trim();
}

function loginSourcesForSlug(fileSlug) {
  const slug = String(fileSlug || '').trim().toLowerCase();
  return {
    labSource: slug ? `${slug}-lab` : 'site-clone-lab',
    shellSource: slug ? `${slug}-demo-shell` : 'site-clone-demo-shell',
  };
}

function pickAccentColour(record) {
  const assets = (record && record.assets) || {};
  const colours = Array.isArray(assets.colours) ? assets.colours : [];
  const vals = colours.map((c) => (typeof c === 'string' ? c : c && c.value)).filter(Boolean);
  const hex = vals.find((v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v)));
  return hex || '#1470cc';
}

/**
 * @param {{ fileSlug: string, record?: object, logoSrc?: string, subtitle?: string, accentColor?: string }} opts
 */
function buildSiteCloneLoginConfig(opts = {}) {
  const fileSlug = String(opts.fileSlug || '').trim().toLowerCase();
  const brand = displayBrandName(opts.record, fileSlug);
  const sources = loginSourcesForSlug(fileSlug);
  const accent = opts.accentColor || pickAccentColour(opts.record);
  return {
    labSource: sources.labSource,
    shellSource: sources.shellSource,
    brandName: brand,
    title: `Sign in to ${brand}`,
    subtitle: opts.subtitle
      || `Access your profile, preferences, and personalised offers from ${brand}.`,
    logoSrc: opts.logoSrc || '',
    logoWidth: opts.logoWidth || 120,
    logoHeight: opts.logoHeight || 42,
    accentColor: accent,
    accentHoverColor: opts.accentHoverColor || accent,
    btnTop: opts.btnTop || '16px',
    profileNotFoundMessage: `No ${brand} profile found for that email. Check the address and try again.`,
  };
}

function buildLoginInjectionSnippet(config) {
  const cfgJson = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e');
  const headLink = `<link rel="stylesheet" href="${LOGIN_CSS}">`;
  const bodyScripts = [
    `<script>window.SiteCloneLoginConfig=${cfgJson};</script>`,
    `<script src="${LOGIN_JS}"></script>`,
  ].join('\n');
  return { headLink, bodyScripts };
}

function stripExistingSiteCloneLogin(html) {
  return String(html || '')
    .replace(/<link[^>]+site-clone-login\.css[^>]*>\s*/gi, '')
    .replace(/<script>window\.SiteCloneLoginConfig=[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<script[^>]+site-clone-login\.js[^>]*>\s*<\/script>\s*/gi, '');
}

function alreadyInjected(html) {
  return /site-clone-login\.js/i.test(String(html || ''));
}

/**
 * Inject login chrome into iframe snapshot HTML (head link + body scripts).
 * @param {string} html
 * @param {ReturnType<typeof buildSiteCloneLoginConfig>} config
 */
function injectSiteCloneLogin(html, config) {
  let out = stripExistingSiteCloneLogin(String(html || ''));
  if (!out) return out;
  const { headLink, bodyScripts } = buildLoginInjectionSnippet(config);
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${headLink}\n</head>`);
  } else {
    out = `${headLink}\n${out}`;
  }
  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${bodyScripts}\n</body>`);
  }
  return `${out}\n${bodyScripts}`;
}

module.exports = {
  LOGIN_CSS,
  LOGIN_JS,
  loginSourcesForSlug,
  buildSiteCloneLoginConfig,
  buildLoginInjectionSnippet,
  injectSiteCloneLogin,
  displayBrandName,
};
