import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { getProfileConnection, profileInfraStatusAll } from '../labApiClient.mjs';
import { buildPersonaAttributes, normalizeSegmentHint } from '../personaBuilder.mjs';
import {
  buildGeneratePreflightSummary,
  ensurePreferredLanguageOnAttributes,
  normalizeGenerateProfileParams,
  readPreferredLanguageFromAttributes,
} from '../framework/generateProfileParams.mjs';
import { assessIndustrySandboxConfig, connectionApiPathForIndustry } from '../sandboxConfig.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { jsonResult, toolError } from './helpers.mjs';
import { buildEmailFormatRules } from '../framework/emailFormatGuardrails.mjs';
import { getGenerationPrefs } from '../labApiClient.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerPreflightProfileGenerateTool(mcpServer) {
  mcpServer.registerTool(
    'lab_preflight_profile_generate',
    {
      title: 'Preflight profile generate (no stream)',
      description:
        'Dry-run before lab_generate_profile: checks lab_sandbox_profile_config readiness for sandbox+industry, ' +
        'lists connection manifest (url, flowId, datasetId, schemaId, xdmKey), and shows what would be sent ' +
        '(testProfile:true, preferredLanguage paths, sample persona paths when randomize). Does NOT POST to AEP. ' +
        'Includes email/mobile FORMAT RULES and Firestore generation prefs preview when available.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: z
          .string()
          .optional()
          .describe('Industry key or alias (default generic)'),
        email: z
          .string()
          .email()
          .optional()
          .describe('Sample scaled email for persona preview — omit to use nextScaledEmail from generation prefs'),
        randomize: z.boolean().optional().describe('Preview randomize persona attribute keys (default true)'),
        segment_hint: z.string().optional(),
        test_profile: z.boolean().optional(),
        test_profile_override_reason: z.string().optional(),
      },
    },
    async ({
      sandbox,
      industry,
      email,
      randomize,
      segment_hint,
      test_profile,
      test_profile_override_reason,
    }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const norm = normalizeIndustry(industry);
      if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
        return toolError(`Unknown industry "${industry}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
      }

      const segmentNorm = segment_hint ? normalizeSegmentHint(segment_hint, norm.industry) : null;
      if (segment_hint && segmentNorm && (segmentNorm.includes('Unknown') || segmentNorm.includes('not supported'))) {
        return toolError(segmentNorm);
      }

      const normalizedTest = normalizeGenerateProfileParams({
        test_profile,
        test_profile_override_reason,
        ensureLanguage: false,
      });
      if (!normalizedTest.ok) {
        return toolError(normalizedTest.error);
      }

      const sampleEmail = email || 'preflight.demo+001@adobetest.com';
      const useRandomize = randomize !== false;

      const prefsResult = await getGenerationPrefs({ sandbox: allowed.sandbox });
      const generationPrefs = prefsResult.ok ? prefsResult.data?.prefs : null;
      const formatRules = buildEmailFormatRules();
      const previewEmail =
        email ||
        (generationPrefs?.nextScaledEmail && String(generationPrefs.nextScaledEmail).trim()) ||
        sampleEmail;

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_preflight_profile_generate',
        sandbox: allowed.sandbox,
        industry: norm.industry,
        email: previewEmail,
      });

      const statusResult = await profileInfraStatusAll({ sandbox: allowed.sandbox, refresh: true });
      if (!statusResult.ok) {
        return toolError(statusResult.error || 'Failed to fetch profile infra status', {
          status: statusResult.status,
        });
      }

      const path = connectionApiPathForIndustry(norm.industry);
      let connectionResponse = null;
      let connectionError = null;
      if (path) {
        const connResult = await getProfileConnection({ path, sandbox: allowed.sandbox });
        if (connResult.ok) {
          connectionResponse = connResult.data;
        } else {
          connectionError = { error: connResult.error, status: connResult.status, path };
        }
      }

      const assessment = assessIndustrySandboxConfig({
        industry: norm.industry,
        sandbox: allowed.sandbox,
        infraStatus: statusResult.data?.industries?.[norm.industry],
        connectionResponse,
      });

      let sampleAttributes = null;
      let attributeKeys = [];
      if (useRandomize) {
        sampleAttributes = buildPersonaAttributes(
          norm.industry,
          previewEmail,
          typeof segmentNorm === 'string' ? segmentNorm : null,
        );
        sampleAttributes = ensurePreferredLanguageOnAttributes(sampleAttributes).attributes;
        attributeKeys = Object.keys(sampleAttributes).sort();
      }

      const language = sampleAttributes
        ? readPreferredLanguageFromAttributes(sampleAttributes)
        : null;

      const summary = buildGeneratePreflightSummary({
        industry: norm.industry,
        email: previewEmail,
        test_profile: normalizedTest.test_profile,
        language,
        randomize: useRandomize,
        segment_hint: typeof segmentNorm === 'string' ? segmentNorm : null,
        connectionManifest: {
          ...assessment.connection,
          firestoreCollection: assessment.firestore.collection,
          firestoreDocId: assessment.firestore.documentId,
        },
      });

      if (generationPrefs?.mobilePhone) {
        summary.mobilePhone = generationPrefs.mobilePhone;
      }

      return jsonResult({
        ok: assessment.ready,
        ready: assessment.ready,
        sandbox: allowed.sandbox,
        industry: norm.industry,
        canGenerate: assessment.ready && normalizedTest.test_profile !== false,
        config: assessment,
        connectionError: connectionError || undefined,
        preflight: summary,
        formatRules,
        generationPrefs: generationPrefs
          ? {
              baseEmail: generationPrefs.baseEmail,
              nextScaledEmail: generationPrefs.nextScaledEmail,
              counterN: generationPrefs.counterN,
              mobilePhone: generationPrefs.mobilePhone,
              prefsReady: !!String(generationPrefs.baseEmail || '').trim(),
            }
          : null,
        confirmTool: 'lab_confirm_profile_generation',
        samplePersona: useRandomize
          ? {
              attributeCount: attributeKeys.length,
              attributeKeys,
              preferredLanguage: language,
              testProfile: normalizedTest.test_profile,
            }
          : null,
        nextAction: assessment.ready
          ? `Ready — lab_generate_profile sandbox ${allowed.sandbox} industry ${norm.industry} (omit email for stored prefs) randomize true`
          : assessment.nextAction,
        blockedReason: assessment.ready
          ? null
          : 'lab_sandbox_profile_config reports not ready — run lab_onboard_sandbox before generate',
      });
    },
  );
}
