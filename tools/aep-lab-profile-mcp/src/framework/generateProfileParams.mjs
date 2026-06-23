/**
 * Fail-safe defaults for lab_generate_profile / batch — mirrors Profile Viewer + profileGenerateService.
 */

import { LAB_DEFAULT_MOBILE_PHONE, LAB_DEFAULT_PREFERRED_LANGUAGE } from './labFramework.mjs';

export { LAB_DEFAULT_PREFERRED_LANGUAGE };

const LANGUAGE_PATHS = {
  root: 'preferredLanguage',
  preferences: 'preferences.preferredLanguage',
  personalEmail: 'personalEmail.language',
};

/**
 * @param {Record<string, unknown> | null | undefined} attrs
 * @returns {string | null}
 */
export function readPreferredLanguageFromAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return null;
  for (const path of Object.values(LANGUAGE_PATHS)) {
    const v = attrs[path];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Ensure BCP-47 language on flat dot-path attributes (personaBuilder shape).
 * Sets root + preferences + personalEmail mirrors — profileStreamingCore.mirrorPreferredLanguageDemoSchema
 * dual-writes root + tenant at stream time.
 *
 * @param {Record<string, unknown> | null | undefined} attrs
 * @param {object} [opts]
 * @param {string} [opts.defaultLang]
 * @param {boolean} [opts.force]
 * @returns {{ attributes: Record<string, unknown>, language: string, appliedDefault: boolean }}
 */
export function ensurePreferredLanguageOnAttributes(attrs, opts = {}) {
  const defaultLang = String(opts.defaultLang || LAB_DEFAULT_PREFERRED_LANGUAGE).trim();
  const out = attrs && typeof attrs === 'object' ? { ...attrs } : {};
  const existing = readPreferredLanguageFromAttributes(out);
  const lang = existing || defaultLang;
  const appliedDefault = !existing;

  if (appliedDefault || opts.force) {
    out[LANGUAGE_PATHS.root] = lang;
    out[LANGUAGE_PATHS.preferences] = lang;
    out[LANGUAGE_PATHS.personalEmail] = lang;
  }

  return { attributes: out, language: lang, appliedDefault };
}

/**
 * @param {object} params
 * @param {boolean | undefined} params.test_profile
 * @param {string | undefined} params.test_profile_override_reason
 * @returns {{ ok: true, test_profile: boolean, overrideReason?: string } | { ok: false, error: string }}
 */
export function resolveTestProfileParam({ test_profile, test_profile_override_reason }) {
  if (test_profile === false) {
    const reason = String(test_profile_override_reason || '').trim();
    if (!reason) {
      return {
        ok: false,
        error:
          'test_profile:false is blocked for lab demos. Every generated profile must be marked as an AEP test profile. ' +
          'Omit test_profile (defaults true) or pass test_profile_override_reason with an explicit non-demo justification.',
      };
    }
    return { ok: true, test_profile: false, overrideReason: reason };
  }
  return { ok: true, test_profile: true };
}

/**
 * Normalize generate params before POST /api/profile/generate.
 *
 * @param {object} params
 * @param {boolean | undefined} params.test_profile
 * @param {string | undefined} params.test_profile_override_reason
 * @param {Record<string, unknown> | undefined} params.attributes
 * @param {boolean} [params.ensureLanguage]
 * @returns {{ ok: true, test_profile: boolean, attributes?: Record<string, unknown>, language?: string, languageAppliedDefault?: boolean, testProfileOverrideReason?: string } | { ok: false, error: string }}
 */
export function normalizeGenerateProfileParams(params) {
  const testResolved = resolveTestProfileParam({
    test_profile: params.test_profile,
    test_profile_override_reason: params.test_profile_override_reason,
  });
  if (!testResolved.ok) return testResolved;

  let attributes = params.attributes;
  let language;
  let languageAppliedDefault = false;

  if (params.ensureLanguage !== false && attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
    const langResult = ensurePreferredLanguageOnAttributes(attributes);
    attributes = langResult.attributes;
    language = langResult.language;
    languageAppliedDefault = langResult.appliedDefault;
  }

  return {
    ok: true,
    test_profile: testResolved.test_profile,
    attributes,
    language,
    languageAppliedDefault,
    testProfileOverrideReason: testResolved.overrideReason,
  };
}

/**
 * Summary of what will be streamed (for preflight / Coworker narration).
 *
 * @param {object} opts
 * @param {string} opts.industry
 * @param {string} opts.email
 * @param {boolean} opts.test_profile
 * @param {string} [opts.language]
 * @param {boolean} [opts.randomize]
 * @param {string | null} [opts.segment_hint]
 * @param {object} [opts.connectionManifest]
 */
export function buildGeneratePreflightSummary(opts) {
  const manifest = opts.connectionManifest || {};
  const streaming = manifest.streaming || {};

  return {
    industry: opts.industry,
    email: opts.email,
    randomize: !!opts.randomize,
    segment_hint: opts.segment_hint || null,
    testProfile: {
      value: opts.test_profile !== false,
      payloadKeys: ['testProfile', 'xdm:testProfile'],
      setBy:
        'MCP defaults test_profile:true → POST body.testProfile → profileGenerateService rootExtras.testProfile → ' +
        'profileStreamingCore.mirrorRootTestProfileFields adds xdm:testProfile for OOTB test-details mixin.',
      optOut: 'test_profile:false + test_profile_override_reason (non-demo only)',
    },
    language: {
      value: opts.language || LAB_DEFAULT_PREFERRED_LANGUAGE,
      uiPaths: {
        generic_travel: ['preferences.preferredLanguage', 'personalEmail.language'],
        industry_runtime: ['preferredLanguage', 'personalEmail.language'],
      },
      streamingPaths: [
        'preferredLanguage (root + tenant mirror)',
        'preferences.preferredLanguage',
        'personalEmail.language',
      ],
      mirror:
        'profileStreamingCore.mirrorPreferredLanguageDemoSchema — precedence: root preferredLanguage → preferences.preferredLanguage → personalEmail.language',
    },
    mobilePhone: LAB_DEFAULT_MOBILE_PHONE,
    connectionManifest: {
      firestoreCollection: manifest.firestoreCollection || null,
      firestoreDocId: manifest.firestoreDocId || null,
      ready: manifest.connectionReady ?? null,
      complete: manifest.connectionComplete ?? null,
      missingStreaming: manifest.missingStreaming || [],
      streaming: {
        url: streaming.url || null,
        flowId: streaming.flowId || null,
        datasetId: streaming.datasetId || null,
        schemaId: streaming.schemaId || null,
        xdmKey: streaming.xdmKey || null,
      },
    },
    api: 'POST /api/profile/generate',
  };
}
