'use strict';

const brandScrapeStore = require('./brandScrapeStore');

const KNOWN_PLATFORM_PATTERNS = [
  { label: 'Adobe Experience Platform', re: /\badobe experience platform\b|\baep\b/i },
  { label: 'Adobe Journey Optimizer', re: /\badobe journey optimizer\b|\bajo\b/i },
  { label: 'Adobe Real-Time CDP', re: /\breal[- ]?time cdp\b|\brtcdp\b/i },
  { label: 'Adobe Customer Journey Analytics', re: /\bcustomer journey analytics\b|\bcja\b/i },
  { label: 'Adobe Experience Manager', re: /\bexperience manager\b|\baem\b/i },
  { label: 'Salesforce CRM', re: /\bsalesforce\b/i },
  { label: 'HubSpot', re: /\bhubspot\b/i },
  { label: 'Braze', re: /\bbraze\b/i },
  { label: 'Marketo', re: /\bmarketo\b/i },
  { label: 'Eloqua', re: /\beloqua\b/i },
  { label: 'Mailchimp', re: /\bmailchimp\b/i },
  { label: 'Klaviyo', re: /\bklaviyo\b/i },
  { label: 'Shopify', re: /\bshopify\b/i },
  { label: 'Magento Commerce', re: /\bmagento\b|\badobe commerce\b/i },
  { label: 'WooCommerce', re: /\bwoocommerce\b/i },
  { label: 'WordPress', re: /\bwordpress\b/i },
  { label: 'Google Analytics', re: /\bgoogle analytics\b|\bga4\b/i },
  { label: 'Google Tag Manager', re: /\bgoogle tag manager\b|\bgtm\b/i },
  { label: 'Meta Ads', re: /\bmeta ads\b|\bfacebook ads\b|\bmeta pixel\b/i },
  { label: 'Google Ads', re: /\bgoogle ads\b|\bdoubleclick\b/i },
  { label: 'LinkedIn Ads', re: /\blinkedin\b/i },
  { label: 'TikTok Ads', re: /\btiktok\b/i },
  { label: 'Tealium', re: /\btealium\b/i },
  { label: 'Segment', re: /\bsegment\b/i },
];

const VENDOR_FLAG_MAP = {
  adobe_launch: 'Adobe Launch',
  adobe_launch_inline: 'Adobe Launch',
  adobe_experience_edge: 'Adobe Experience Edge',
  adobe_experience_web_sdk: 'Adobe Web SDK',
  adobe_analytics_collect: 'Adobe Analytics',
  adobe_ecid: 'Adobe ECID Service',
  adobe_target: 'Adobe Target',
  google_gtm: 'Google Tag Manager',
  gtm_inline_hint: 'Google Tag Manager',
  google_gtag: 'Google Global Site Tag',
  google_ga4: 'Google Analytics 4',
  google_ga4_collect: 'Google Analytics 4',
  google_ua: 'Google Universal Analytics',
  google_ua_collect: 'Google Universal Analytics',
  tealium: 'Tealium',
  tealium_inline: 'Tealium',
  segment: 'Segment',
  rudderstack: 'RudderStack',
  hotjar: 'Hotjar',
  microsoft_clarity: 'Microsoft Clarity',
  fullstory: 'FullStory',
  matomo: 'Matomo',
  google_ads: 'Google Ads',
  meta_pixel: 'Meta Pixel',
  linkedin: 'LinkedIn Ads',
  tiktok: 'TikTok Ads',
};

function safeString(value) {
  return String(value == null ? '' : value).trim();
}

function resolveSandbox(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const fromBody = safeString(body.sandbox);
  if (fromBody) return fromBody;
  return safeString(req.query && req.query.sandbox);
}

function parseOrigin(rawUrl) {
  const value = safeString(rawUrl);
  if (!value) return '';
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : ('https://' + value);
    return new URL(withScheme).origin;
  } catch (_e) {
    return '';
  }
}

function titleCaseHost(rawUrl) {
  try {
    const origin = parseOrigin(rawUrl);
    if (!origin) return '';
    const host = new URL(origin).hostname.replace(/^www\./i, '');
    const left = host.split('.')[0] || host;
    return left
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  } catch (_e) {
    return '';
  }
}

function normaliseHex(raw) {
  const cleaned = safeString(raw).replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(cleaned)) return cleaned.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    return cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toUpperCase();
  }
  return '';
}

/**
 * Frequency-ranked palette from crawl (same order as Brand scraper UI).
 * @returns {Array<{ hex: string, count?: number }>}
 */
function buildBrandColorOptions(record) {
  const assets = record && record.crawlSummary && record.crawlSummary.assets;
  const colours = assets && Array.isArray(assets.colours) ? assets.colours : [];
  const out = [];
  const seen = new Set();
  for (const entry of colours) {
    const raw = typeof entry === 'string'
      ? entry
      : (entry && (entry.value || entry.hex || entry.color || ''));
    const hex = normaliseHex(raw);
    if (!hex) continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const row = { hex };
    if (entry && typeof entry === 'object' && typeof entry.count === 'number' && entry.count > 0) {
      row.count = entry.count;
    }
    out.push(row);
    if (out.length >= 16) break;
  }
  return out;
}

function pickPersonaName(record) {
  const list = record && record.personas && Array.isArray(record.personas.personas)
    ? record.personas.personas
    : [];
  for (const persona of list) {
    const name = safeString(persona && persona.name);
    if (name) return name;
  }
  return '';
}

function inferPersonaGender(record) {
  const list = record && record.personas && Array.isArray(record.personas.personas)
    ? record.personas.personas
    : [];
  const first = list[0] && typeof list[0] === 'object' ? list[0] : null;
  const explicit = safeString(first && (first.gender || first.personaGender || first.sex)).toLowerCase();
  if (explicit === 'male' || explicit === 'm') return 'male';
  if (explicit === 'female' || explicit === 'f') return 'female';
  return 'female';
}

function firstDetectedCampaign(record) {
  const campaigns = record && record.campaigns && Array.isArray(record.campaigns.campaigns)
    ? record.campaigns.campaigns
    : [];
  for (const campaign of campaigns) {
    const isRecommendation = !!(campaign && campaign.is_recommendation);
    const name = safeString(campaign && campaign.name);
    if (!isRecommendation && name) return name;
  }
  return '';
}

function uniqueStrings(values, max = 40) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const v = safeString(raw);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function buildPersonaNameOptions(record) {
  const list = record && record.personas && Array.isArray(record.personas.personas)
    ? record.personas.personas
    : [];
  const names = [];
  for (const persona of list) {
    names.push(safeString(persona && persona.name));
  }
  return uniqueStrings(names, 30);
}

function buildJourneyTypeOptions(record) {
  const out = [];
  const campaigns = record && record.campaigns && Array.isArray(record.campaigns.campaigns)
    ? record.campaigns.campaigns
    : [];
  for (const campaign of campaigns) {
    out.push(safeString(campaign && campaign.name));
  }
  const segments = record && record.segments && Array.isArray(record.segments.segments)
    ? record.segments.segments
    : [];
  for (const seg of segments) {
    out.push(safeString(seg && seg.name));
  }
  const industry = safeString(record && (record.industry || (record.industryInfo && record.industryInfo.industry)));
  if (industry) out.push(industry + ' customer journey');
  const about = safeString(record && record.analysis && record.analysis.about);
  if (about) {
    const short = about
      .split(/[.!?]/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    if (short) out.push(short);
  }
  return uniqueStrings(out, 40).map((v) => v.slice(0, 80));
}

function deriveJourneyType(record) {
  const campaignName = firstDetectedCampaign(record);
  if (campaignName) return campaignName.slice(0, 80);
  const industry = safeString(record && (record.industry || (record.industryInfo && record.industryInfo.industry)));
  if (industry) return (industry + ' customer journey').slice(0, 80);
  const about = safeString(record && record.analysis && record.analysis.about);
  if (!about) return '';
  const short = about
    .split(/[.!?]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return short.slice(0, 80);
}

function addTechLine(targetMap, label, certainty) {
  const name = safeString(label);
  if (!name) return;
  const key = name.toLowerCase();
  const existing = targetMap.get(key);
  if (!existing) {
    targetMap.set(key, { label: name, certainty });
    return;
  }
  if (existing.certainty !== 'confirmed' && certainty === 'confirmed') {
    existing.certainty = 'confirmed';
  }
}

function deriveTechStack(record) {
  const lines = new Map();
  const tagAudit = record && record.crawlSummary && record.crawlSummary.tagAuditSummary;
  const vendors = tagAudit && tagAudit.vendorsDetected && typeof tagAudit.vendorsDetected === 'object'
    ? tagAudit.vendorsDetected
    : {};

  for (const flag of Object.keys(vendors)) {
    if (!vendors[flag]) continue;
    const label = VENDOR_FLAG_MAP[flag];
    if (!label) continue;
    addTechLine(lines, label, 'confirmed');
  }

  const corpus = [
    safeString(record && record.analysis && record.analysis.about),
    safeString(record && record.industry),
    safeString(record && record.industryInfo && record.industryInfo.rationale),
    safeString(record && record.businessType),
  ];
  const campaigns = record && record.campaigns && Array.isArray(record.campaigns.campaigns)
    ? record.campaigns.campaigns
    : [];
  for (const campaign of campaigns.slice(0, 8)) {
    corpus.push(safeString(campaign && campaign.summary));
    corpus.push(safeString(campaign && campaign.type));
  }
  const blob = corpus.join('\n');
  for (const platform of KNOWN_PLATFORM_PATTERNS) {
    if (!platform.re.test(blob)) continue;
    addTechLine(lines, platform.label, 'assumed');
  }

  const confirmed = [];
  const assumed = [];
  for (const item of lines.values()) {
    const line = item.label + ' [' + item.certainty + ']';
    if (item.certainty === 'confirmed') confirmed.push(line);
    else assumed.push(line);
  }
  confirmed.sort((a, b) => a.localeCompare(b));
  assumed.sort((a, b) => a.localeCompare(b));
  return confirmed.concat(assumed).join('\n');
}

function deriveAdditionalContext(record) {
  const parts = [];
  const about = safeString(record && record.analysis && record.analysis.about);
  if (about) parts.push(about);
  const industry = safeString(record && (record.industry || (record.industryInfo && record.industryInfo.industry)));
  if (industry) parts.push('Industry focus: ' + industry + '.');
  const segments = record && record.segments && Array.isArray(record.segments.segments)
    ? record.segments.segments
    : [];
  const segmentNames = segments.map((s) => safeString(s && s.name)).filter(Boolean).slice(0, 2);
  if (segmentNames.length) parts.push('Priority segments: ' + segmentNames.join(', ') + '.');
  const campaignHints = [];
  const campaigns = record && record.campaigns && Array.isArray(record.campaigns.campaigns)
    ? record.campaigns.campaigns
    : [];
  for (const campaign of campaigns) {
    const name = safeString(campaign && campaign.name);
    if (!name) continue;
    campaignHints.push(name);
    if (campaignHints.length >= 2) break;
  }
  if (campaignHints.length) parts.push('Campaign signals: ' + campaignHints.join(', ') + '.');
  const combined = parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return combined.slice(0, 500);
}

function mapScrapeToCjv2Profile(record, sandbox) {
  const clientFromBrand = safeString(record && record.brandName);
  const clientFallback = titleCaseHost((record && (record.baseUrl || record.url)) || '');
  const client = clientFromBrand || clientFallback;
  const clientDomain = parseOrigin((record && record.baseUrl) || '') || parseOrigin((record && record.url) || '');
  const brandColorOptions = buildBrandColorOptions(record);
  const brandColor = brandColorOptions.length ? brandColorOptions[0].hex : '';
  const personaNameOptions = buildPersonaNameOptions(record);
  const journeyTypeOptions = buildJourneyTypeOptions(record);
  const journeyType = deriveJourneyType(record);
  const personaName = pickPersonaName(record);
  const personaGender = inferPersonaGender(record);
  const techStack = deriveTechStack(record);
  const additionalContext = deriveAdditionalContext(record);
  const scrapeVersion = safeString(record && (record.viewingVersion || record.updatedAt || record.createdAt));

  return {
    client,
    clientDomain,
    brandColor,
    brandColorOptions,
    journeyType,
    journeyTypeOptions,
    personaName,
    personaNameOptions,
    personaGender,
    marketerPersonaName: '',
    tier: 'Foundation',
    techStack,
    additionalContext,
    metadata: {
      scrapeId: safeString(record && record.scrapeId),
      sandbox,
      scrapeVersion,
    },
    provenance: {
      client: { source: clientFromBrand ? 'brandName' : 'baseUrl/url hostname', confidence: clientFromBrand ? 'high' : 'medium' },
      clientDomain: { source: safeString(record && record.baseUrl) ? 'baseUrl origin' : 'url origin', confidence: clientDomain ? 'high' : 'low' },
      brandColor: {
        source: brandColor ? 'crawlSummary.assets.colours (frequency-ranked primary)' : 'none',
        confidence: brandColor ? 'medium' : 'low',
      },
      journeyType: { source: firstDetectedCampaign(record) ? 'campaigns.detected[0].name' : (safeString(record && record.industry) ? 'industry fallback' : 'analysis.about fallback'), confidence: journeyType ? 'medium' : 'low' },
      personaName: { source: personaName ? 'personas.personas[0].name' : 'none', confidence: personaName ? 'medium' : 'low' },
      personaGender: { source: 'persona.gender fallback', confidence: 'low' },
      marketerPersonaName: { source: 'default empty', confidence: 'high' },
      tier: { source: 'default Foundation', confidence: 'high' },
      techStack: { source: 'tagAuditSummary.vendorsDetected + inferred platform mentions', confidence: techStack ? 'medium' : 'low' },
      additionalContext: { source: 'analysis/about/segments/campaign synthesis', confidence: additionalContext ? 'medium' : 'low' },
    },
  };
}

async function handleImportScrapeList(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }
  try {
    const items = await brandScrapeStore.listScrapes(sandbox, { limit: 50 });
    const slim = items.map((item) => ({
      id: safeString(item && item.scrapeId),
      scrapeId: safeString(item && item.scrapeId),
      brandName: safeString(item && item.brandName),
      url: safeString(item && (item.baseUrl || item.url)),
      updatedAt: safeString(item && item.updatedAt),
      scrapeVersion: safeString(item && item.updatedAt),
      analysisPresent: !!(item && item.analysisPresent),
      personasPresent: !!(item && item.personasPresent),
      campaignsPresent: !!(item && item.campaignsPresent),
      segmentsPresent: !!(item && item.segmentsPresent),
      stakeholdersPresent: !!(item && item.stakeholdersPresent),
    }));
    res.status(200).json({ ok: true, sandbox, items: slim });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

async function handleImportMappedProfile(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }
  const scrapeId = safeString(req.query && req.query.scrapeId);
  if (!scrapeId) { res.status(400).json({ error: 'scrapeId is required' }); return; }
  try {
    const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
    if (!record) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const mapped = mapScrapeToCjv2Profile(record, sandbox);
    res.status(200).json({ ok: true, sandbox, scrapeId, mapped });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

module.exports = {
  mapScrapeToCjv2Profile,
  handleImportScrapeList,
  handleImportMappedProfile,
};
