/**
 * Orchestration helpers: brand scrape → golden profiles, events, Client Journey v2.
 */

import { assessScrapeGenerateIndustryReadiness } from './brandScrapeIndustryReadiness.mjs';
import {
  buildAttributesFromBrandScrapePersona,
  extractBrandScrapePersonas,
  extractScrapeIndustryTaxonomy,
  inferLabIndustryFromRecord,
} from './brandScrapePersonaMap.mjs';
import {
  resolveStoredPrefsEmail,
  shouldUseStoredGenerationPrefs,
  STORED_PREFS_MISSING_HINT,
} from './tools/generationPrefs.mjs';
import {
  clientJourneyV2Generate,
  clientJourneyV2ImportProfile,
  getBrandScrape,
} from './labApiClient.mjs';
import { resolveDemoEventSequence } from './framework/demoEventPacks.mjs';
import { sendProfileEventSequence } from './framework/sendProfileEventSequence.mjs';
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
  const inferred = inferLabIndustryFromRecord(record);
  const scrapeIndustry = extractScrapeIndustryTaxonomy(record) || null;

  return {
    scrapeId: record?.scrapeId || null,
    brandName: record?.brandName || null,
    url: record?.url || record?.baseUrl || null,
    scrapeStatus: record?.scrapeStatus || null,
    scrapeIndustry,
    scrape_industry: scrapeIndustry,
    inferred_industry: inferred.scrape_industry,
    lab_industry: inferred.industry,
    industry: inferred.industry,
    industrySource: inferred.source,
    industry_source: inferred.source,
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
  use_stored_prefs,
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
    const inferred = inferLabIndustryFromRecord(record);
    canonicalIndustry = inferred.industry;
    industrySource = inferred.source;
  }

  const scrapeIndustry = extractScrapeIndustryTaxonomy(record) || null;
  const readiness = await assessScrapeGenerateIndustryReadiness({
    sandbox,
    industry: canonicalIndustry,
  });

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
    const useStored = shouldUseStoredGenerationPrefs(use_stored_prefs, undefined);
    /** @type {string} */
    let email;
    /** @type {string | null} */
    let storedMobile = null;
    /** @type {Record<string, unknown>} */
    let storedPrefsMeta = {};

    if (useStored) {
      const reserved = await resolveStoredPrefsEmail(sandbox);
      if (!reserved.ok) {
        results.push({
          personaIndex: idx,
          personaName: persona.name || null,
          email: '',
          ok: false,
          error: reserved.error,
          hint: reserved.hint || STORED_PREFS_MISSING_HINT,
        });
        failed += 1;
        continue;
      }
      email = reserved.email;
      storedMobile = reserved.mobilePhone ? String(reserved.mobilePhone) : null;
      storedPrefsMeta = {
        use_stored_prefs: true,
        counterN: reserved.counterN,
        nextCounterN: reserved.nextCounterN,
        baseEmail: reserved.baseEmail,
        mobilePhone: storedMobile,
      };
    } else {
      results.push({
        personaIndex: idx,
        personaName: persona.name || null,
        email: '',
        ok: false,
        error: 'email is required when use_stored_prefs is false.',
        hint: STORED_PREFS_MISSING_HINT,
      });
      failed += 1;
      continue;
    }

    const built = buildAttributesFromBrandScrapePersona({
      persona,
      email,
      industry: canonicalIndustry,
      segmentHint: segment_hint || null,
      loyalty_member,
      last_order_details,
      mobilePhone: storedMobile,
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
      ...storedPrefsMeta,
    });
  }

  return {
    ok: failed === 0,
    sandbox,
    scrape_industry: scrapeIndustry,
    inferred_industry: scrapeIndustry,
    lab_industry: canonicalIndustry,
    industry: canonicalIndustry,
    industrySource,
    industry_source: industrySource,
    industry_readiness: readiness,
    warnings: readiness.ready ? [] : readiness.warnings,
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
 * Send Portal Event tool–aligned experience events for golden profiles from brand scrape prep.
 *
 * @param {object} params
 * @param {string} params.sandbox
 * @param {Array<Record<string, unknown>>} [params.profileResults]
 * @param {string} [params.industry] — lab industry; retail defaults to retail_journey sequence
 * @param {string} [params.event_sequence] — retail_journey | single_page_view
 * @param {string[]} [params.event_types] — any custom eventType strings (portal free-text)
 * @param {boolean} [params.realistic_events] — retail: use retail_journey pack when no event_types
 * @param {string} [params.view_name]
 * @param {string} [params.brand_name]
 * @param {string} [params.base_url]
 * @param {string} [params.target_id]
 * @param {number} [params.delay_ms] — delay between events per profile (default 800)
 * @param {number} [params.profile_delay_ms] — delay between profiles (default 400)
 * @param {boolean} [params.preflight] — lab_preflight_profile_event logic before first send per profile
 */
export async function sendDemoEventsForProfiles({
  sandbox,
  profileResults,
  industry,
  event_sequence,
  event_types,
  realistic_events,
  event_type,
  view_name,
  brand_name,
  base_url,
  target_id,
  delay_ms = 800,
  profile_delay_ms = 400,
  preflight = true,
}) {
  const resolvedSequence = resolveDemoEventSequence({
    event_types,
    event_sequence:
      realistic_events && String(industry || '').trim().toLowerCase() === 'retail'
        ? 'retail_journey'
        : event_sequence,
    industry,
    event_type,
    view_name,
    brandName: brand_name,
    baseUrl: base_url,
  });

  /** @type {Array<Record<string, unknown>>} */
  const eventResults = [];
  let totalSent = 0;
  let totalFailed = 0;
  let profileIndex = 0;

  for (const row of profileResults || []) {
    if (!row.ok || !row.email) continue;
    if (profileIndex > 0 && profile_delay_ms > 0) {
      await new Promise((r) => setTimeout(r, profile_delay_ms));
    }
    profileIndex += 1;

    const outcome = await sendProfileEventSequence({
      sandbox,
      email: String(row.email),
      ecid: row.ecid ? String(row.ecid) : undefined,
      events: resolvedSequence.events,
      target_id,
      delay_ms,
      preflight,
    });

    totalSent += outcome.sent || 0;
    totalFailed += outcome.failed || 0;

    eventResults.push({
      email: row.email,
      personaName: row.personaName || null,
      ecid: outcome.ecid || row.ecid || null,
      ok: outcome.ok,
      sent: outcome.sent,
      failed: outcome.failed,
      sequence: resolvedSequence.sequence,
      warnings: outcome.warnings,
      preflight: outcome.preflight,
      step_results: outcome.results,
      error: outcome.ok ? undefined : outcome.error || 'One or more events failed',
    });
  }

  const profilesOk = eventResults.filter((r) => r.ok).length;
  return {
    ok: profilesOk === eventResults.length && totalFailed === 0,
    sequence: resolvedSequence.sequence,
    event_types: resolvedSequence.events.map((e) => e.event_type),
    profiles_processed: eventResults.length,
    profiles_succeeded: profilesOk,
    sent: totalSent,
    failed: totalFailed,
    results: eventResults,
    verify_hint: 'lab_profile_activity per email — allow 30–60s UPS lag after last event.',
    event_type_policy:
      'event_type accepts any string — same as Event tool free-text input. Datalist / retail_journey pack are optional suggestions.',
  };
}
