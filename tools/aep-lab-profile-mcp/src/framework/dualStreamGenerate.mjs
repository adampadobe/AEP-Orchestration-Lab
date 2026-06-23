/**
 * Dual-stream profile generate — generic base + industry overlay.
 * Mirrors Profile Viewer path ownership (industryAttributeMap) and the
 * per-industry fan-out on POST /api/profile/update.
 */

import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { generateProfile } from '../labApiClient.mjs';
import { resolveIndustryForPath } from './attributeOwnership.mjs';

const DUAL_STREAM_INDUSTRIES = LAB_INDUSTRY_KEYS.filter((key) => key !== 'generic');

/**
 * @param {string} industry
 */
export function industryNeedsDualStream(industry) {
  return DUAL_STREAM_INDUSTRIES.includes(industry);
}

/**
 * @param {Record<string, unknown>} attributes
 * @param {string} targetIndustry
 */
export function splitAttributesByIndustry(attributes, targetIndustry) {
  const genericAttrs = {};
  const industryAttrs = {};

  for (const [path, value] of Object.entries(attributes || {})) {
    if (value === undefined) continue;
    const { industry } = resolveIndustryForPath(path);
    const owner = industry || 'generic';
    if (owner === targetIndustry) {
      industryAttrs[path] = value;
    } else {
      genericAttrs[path] = value;
    }
  }

  return { genericAttrs, industryAttrs };
}

/**
 * Ensure generic step carries email identity when callers pass industry-only attrs.
 * @param {Record<string, unknown>} genericAttrs
 * @param {string} email
 */
export function ensureGenericIdentityBase(genericAttrs, email) {
  const out = { ...(genericAttrs || {}) };
  const trimmed = String(email || '').trim();
  if (trimmed && out['personalEmail.address'] == null) {
    out['personalEmail.address'] = trimmed;
  }
  return out;
}

/**
 * Build ordered generate steps for lab_generate_profile / batch worker.
 * @param {{ industry: string, attributes?: Record<string, unknown>, email?: string }} params
 */
export function planDualStreamGenerate({ industry, attributes, email }) {
  const attrs = attributes && typeof attributes === 'object' ? attributes : {};

  if (!industryNeedsDualStream(industry)) {
    return {
      dualStream: false,
      steps: [
        {
          step: 1,
          industry,
          attributes: attrs,
          appendIfExisting: false,
          role: 'single',
        },
      ],
    };
  }

  const { genericAttrs, industryAttrs } = splitAttributesByIndustry(attrs, industry);
  const genericWithIdentity = ensureGenericIdentityBase(genericAttrs, email);
  const steps = [];
  let stepNum = 0;

  if (Object.keys(genericWithIdentity).length > 0) {
    stepNum += 1;
    steps.push({
      step: stepNum,
      industry: 'generic',
      attributes: genericWithIdentity,
      appendIfExisting: false,
      role: 'generic_base',
    });
  }

  if (Object.keys(industryAttrs).length > 0) {
    stepNum += 1;
    steps.push({
      step: stepNum,
      industry,
      attributes: industryAttrs,
      appendIfExisting: true,
      role: 'industry_overlay',
    });
  }

  if (steps.length === 0) {
    steps.push({
      step: 1,
      industry,
      attributes: attrs,
      appendIfExisting: false,
      role: 'single',
    });
  }

  return {
    dualStream: steps.length > 1,
    steps,
  };
}

/**
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.sandbox
 * @param {ReturnType<typeof planDualStreamGenerate>} params.plan
 * @param {boolean} [params.test_profile]
 * @param {boolean} [params.append_if_existing]
 */
export async function executeGeneratePlan({
  email,
  sandbox,
  plan,
  test_profile,
  append_if_existing,
}) {
  /** @type {Array<Record<string, unknown>>} */
  const stepResults = [];
  let lastOk = null;
  let ecid = null;

  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    const appendForStep =
      step.appendIfExisting != null
        ? step.appendIfExisting
        : i > 0
          ? true
          : append_if_existing ?? false;

    const apiResult = await generateProfile({
      email,
      sandbox,
      industry: step.industry,
      attributes: step.attributes,
      append_if_existing: appendForStep,
      test_profile,
    });

    stepResults.push({
      step: step.step,
      industry: step.industry,
      role: step.role,
      appendIfExisting: appendForStep,
      ok: apiResult.ok,
      attributeCount: Object.keys(step.attributes || {}).length,
      samplePaths: Object.keys(step.attributes || {}).slice(0, 8),
      ecid: apiResult.data?.ecid || null,
      error: apiResult.ok ? undefined : apiResult.error,
    });

    if (!apiResult.ok) {
      return {
        ok: false,
        dualStream: plan.dualStream,
        stepResults,
        failedStep: step.step,
        error: apiResult.error,
        data: apiResult.data,
        ecid,
      };
    }

    lastOk = apiResult;
    ecid = apiResult.data?.ecid || ecid;
  }

  return {
    ok: true,
    dualStream: plan.dualStream,
    stepResults,
    data: lastOk?.data,
    ecid: lastOk?.data?.ecid || ecid,
  };
}
