/**
 * Orchestration helpers: brand scrape → golden profiles, events, Client Journey v2.
 */

import {
  buildAttributesFromBrandScrapePersona,
  extractBrandScrapePersonas,
  inferLabIndustryFromScrape,
  suggestEmailForScrapePersona,
} from './brandScrapePersonaMap.mjs';
import {
  clientJourneyV2Generate,
  clientJourneyV2ImportProfile,
  getBrandScrape,
  sendProfileEvent,
} from './labApiClient.mjs';
import { executeGeneratePlan, planDualStreamGenerate } from './framework/dualStreamGenerate.mjs';
import {
  ensurePreferredLanguageOnAttributes,
  normalizeGenerateProfileParams,
} from './framework/generateProfileParams.mjs';
import { personHintsFromAttributes, recordRecentProfileGenerated } from './framework/recordRecentProfile.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from './industries.mjs';

/**
 * @param {Record<string, unknown>} record
 */
export function summarizeScrapeForDemoPrep(record) {
  const personas = extractBrandScrapePersonas(record);
  const campaigns =
    record?.campaigns && Array.isArray(record.campaigns.campaigns) ? record.campaigns.campaigns : [];
  const segments =
    record?.segments && Array.isArray(record.segments.segments) ? record.segments.segments : [];
  const inferred = inferLabIndustryFromScrape(record.industry);

  return {
    scrapeId: record?.scrapeId || null,
    brandName: record?.brandName || null,
    url: record?.url || record?.baseUrl || null,
    scrapeStatus: record?.scrapeStatus || null,
    scrapeIndustry: record?.industry || null,
    industry: inferred.industry,
    industrySource: inferred.source,
    personasCount: personas.length,
    campaignsCount: campaigns.length,
    segmentsCount: segments.length,
    personaNames: personas.map((p) => String(p.name || '').trim()).filter(Boolean),
    campaignNames: campaigns.map((c) => String(c?.name || '').trim()).filter(Boolean).slice(0, 12),
    segmentNames: segments.map((s) => String(s?.name || '').trim()).filter(Boolean).slice(0, 12),
  };
}

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrapeId
 */
export async function loadBrandScrapeRecord({ sandbox, scrapeId }) {
  const apiResult = await getBrandScrape({ sandbox, scrapeId });
  if (!apiResult.ok) {
    return { ok: false, error: apiResult.error || 'getBrandScrape failed', apiResult };
  }
  const record = apiResult.data || {};
  if (String(record.scrapeStatus || '') !== 'complete') {
    return {
      ok: false,
      error: `Scrape is not complete (status=${record.scrapeStatus || 'unknown'}). Poll lab_get_brand_scrape.`,
      record,
      summary: summarizeScrapeForDemoPrep(record),
    };
  }
  if (!extractBrandScrapePersonas(record).length) {
    return {
      ok: false,
      error:
        'Brand scrape has no personas. Re-run lab_brand_scrape with include.personas:true or append personas in Portal.',
      record,
      summary: summarizeScrapeForDemoPrep(record),
    };
  }
  return { ok: true, record, summary: summarizeScrapeForDemoPrep(record) };
}

/**
 * @param {object} params
 */
export async function generateProfilesFromScrapePersonas({
  sandbox,
  record,
  industry,
  personaIndices,
  segment_hint,
  append_if_existing,
  test_profile,
  loyalty_member,
  last_order_details,
  delay_ms = 0,
}) {
  let canonicalIndustry = 'generic';
  let industrySource = 'default';
  if (industry) {
    const norm = normalizeIndustry(industry);
    if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
      return { ok: false, error: `Unknown industry "${industry}".` };
    }
    canonicalIndustry = norm.industry;
    industrySource = 'argument';
  } else {
    const inferred = inferLabIndustryFromScrape(record.industry);
    canonicalIndustry = inferred.industry;
    industrySource = inferred.source;
  }

  const personas = extractBrandScrapePersonas(record);
  const indices =
    Array.isArray(personaIndices) && personaIndices.length
      ? personaIndices.filter((i) => Number.isInteger(i) && i >= 0 && i < personas.length)
      : personas.map((_, i) => i);

  if (!indices.length) {
    return { ok: false, error: 'No valid persona indices to generate.' };
  }

  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let n = 0; n < indices.length; n += 1) {
    const idx = indices[n];
    if (n > 0 && delay_ms > 0) {
      await new Promise((r) => setTimeout(r, delay_ms));
    }

    const persona = personas[idx];
    const email = suggestEmailForScrapePersona({
      persona,
      brandName: record.brandName,
      personaIndex: idx,
    });

    const built = buildAttributesFromBrandScrapePersona({
      persona,
      email,
      industry: canonicalIndustry,
      segmentHint: segment_hint || null,
      loyalty_member,
      last_order_details,
    });

    const mergedAttributes = ensurePreferredLanguageOnAttributes(built.attributes).attributes;
    const normalized = normalizeGenerateProfileParams({
      test_profile,
      attributes: mergedAttributes,
      ensureLanguage: false,
    });
    if (!normalized.ok) {
      results.push({
        personaIndex: idx,
        personaName: persona.name || null,
        email,
        ok: false,
        error: normalized.error,
      });
      failed += 1;
      continue;
    }

    const plan = planDualStreamGenerate({
      industry: canonicalIndustry,
      attributes: normalized.attributes,
      email,
    });

    const apiResult = await executeGeneratePlan({
      email,
      sandbox,
      plan,
      append_if_existing,
      test_profile: normalized.test_profile,
    });

    let recentSync = null;
    if (apiResult.ok) {
      succeeded += 1;
      const hints = personHintsFromAttributes(normalized.attributes);
      recentSync = await recordRecentProfileGenerated({
        sandbox,
        email,
        ecid: apiResult.ecid || undefined,
        industry: canonicalIndustry,
        attributes: normalized.attributes,
        summaryLabel: persona.name ? `${persona.name} (scrape)` : undefined,
        ...hints,
      });
    } else {
      failed += 1;
    }

    results.push({
      personaIndex: idx,
      personaName: persona.name || null,
      email,
      ok: apiResult.ok,
      ecid: apiResult.ecid || null,
      segment_hint: built.segmentHint,
      scrapeOverlays: built.overlays,
      dual_stream: plan.dualStream,
      generate_step_results: apiResult.stepResults || null,
      error: apiResult.ok ? undefined : apiResult.error,
      recent_profiles_sync: recentSync,
    });
  }

  return {
    ok: failed === 0,
    sandbox,
    industry: canonicalIndustry,
    industrySource,
    succeeded,
    failed,
    results,
  };
}

/**
 * Client Journey Asset v2 — presentation HTML journey (NOT AJO platform journey).
 */
export async function createClientJourneyFromScrape({
  sandbox,
  scrapeId,
  record,
  persona_name,
  journey_type,
  tier,
  persona_gender,
  additional_context,
}) {
  let mapped = null;
  const importResult = await clientJourneyV2ImportProfile({ sandbox, scrapeId });
  if (importResult.ok && importResult.data?.mapped) {
    mapped = importResult.data.mapped;
  }

  const rec = record || {};
  const client =
    mapped?.client ||
    String(rec.brandName || '').trim() ||
    'Client';
  const brandColor = mapped?.brandColor || '';
  const clientDomain = mapped?.clientDomain || '';

  const body = {
    client,
    clientDomain,
    brandColor,
    journeyType: String(journey_type || mapped?.journeyType || '').trim(),
    personaName: String(persona_name || mapped?.personaName || '').trim(),
    personaGender:
      persona_gender === 'male'
        ? 'male'
        : persona_gender === 'female'
          ? 'female'
          : mapped?.personaGender || 'female',
    marketerPersonaName: mapped?.marketerPersonaName || '',
    tier: tier === 'Advanced' ? 'Advanced' : 'Foundation',
    techStack: mapped?.techStack || '',
    additionalContext: String(additional_context || mapped?.additionalContext || '').trim(),
  };

  if (!body.client) {
    return { ok: false, error: 'Could not derive client name from scrape.' };
  }
  if (!body.brandColor) {
    return { ok: false, error: 'Could not derive brandColor from scrape crawl palette.' };
  }

  const genResult = await clientJourneyV2Generate(body);
  if (!genResult.ok) {
    return {
      ok: false,
      error: genResult.error || 'clientJourneyV2Generate failed',
      cjv2Input: body,
      apiResult: genResult,
    };
  }

  const data = genResult.data || {};
  return {
    ok: true,
    scrapeId,
    sandbox,
    cjv2Input: body,
    meta: data.meta || null,
    journey: data.journey || null,
    htmlLength: typeof data.html === 'string' ? data.html.length : 0,
    sources: data.sources || null,
    portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/client-journey-asset-v2.html',
    ajoPlatformGap:
      'This creates a Client Journey Asset v2 HTML/PPTX presentation — not an Adobe Journey Optimizer platform journey. ' +
      'The lab has read-only AJO journey browse (/api/journeys/browse); no journey-create proxy exists.',
  };
}

/**
 * @param {object} params
 */
export async function sendDemoEventsForProfiles({ sandbox, profileResults, event_type, view_name }) {
  /** @type {Array<Record<string, unknown>>} */
  const eventResults = [];
  for (const row of profileResults || []) {
    if (!row.ok || !row.email) continue;
    const apiResult = await sendProfileEvent({
      sandbox,
      email: String(row.email),
      ecid: row.ecid ? String(row.ecid) : undefined,
      event_type: event_type || 'web.webPageViews',
      view_name: view_name || 'Brand demo landing',
      channel: 'web',
    });
    eventResults.push({
      email: row.email,
      ok: apiResult.ok,
      error: apiResult.ok ? undefined : apiResult.error,
    });
  }
  const okCount = eventResults.filter((r) => r.ok).length;
  return {
    ok: okCount === eventResults.length,
    sent: okCount,
    failed: eventResults.length - okCount,
    results: eventResults,
  };
}
