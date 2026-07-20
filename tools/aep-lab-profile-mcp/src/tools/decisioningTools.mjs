import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  decisioningEdgeEvaluate,
  explainDecisionResponse,
  getCatalogConfig,
  getDecisionLabConfig,
  lookupProfile,
  resolveDecisioningTreatmentName,
} from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  extractEcidFromProfileTable,
  resolveEventIdentities,
} from '../framework/eventIdentity.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerDecisioningTools(mcpServer) {
  mcpServer.registerTool(
    'lab_decision_lab_config',
    {
      title: 'Get Decision lab + catalog config',
      description:
        'Reads per-sandbox Decisioning lab Edge setup (GET /api/decision-lab/config) and decisioning catalog schema id ' +
        '(GET /api/catalog/config). Use before lab_decisioning_edge_evaluate to confirm datastream, targetPageUrl, placements, and personalization mode.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decision_lab_config',
        sandbox: allowed.sandbox,
      });

      const [decisionResult, catalogResult] = await Promise.all([
        getDecisionLabConfig({ sandbox: allowed.sandbox }),
        getCatalogConfig({ sandbox: allowed.sandbox }),
      ]);

      return jsonResult({
        ok: decisionResult.ok && catalogResult.ok,
        sandbox: allowed.sandbox,
        decisionLab: decisionResult.ok ? decisionResult.data : { error: decisionResult.error, data: decisionResult.data },
        catalog: catalogResult.ok ? catalogResult.data : { error: catalogResult.error, data: catalogResult.data },
        routes: ['/api/decision-lab/config', '/api/catalog/config'],
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_edge_evaluate',
    {
      title: 'Evaluate Edge decisioning (Decision lab)',
      description:
        'POST /api/decisioning/edge-evaluate — server-side Edge interact with personalization (surfaces or decisionScopes) ' +
        'using Decision lab Firestore config. Pass email + ecid from lab_generate_profile; ECID is primary when both present. ' +
        'Does not expose /api/aep. Sandbox is allowlist-gated.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().optional(),
        ecid: z.string().optional().describe('10+ digit ECID from lab_generate_profile'),
        namespace: z.string().optional().describe('Identifier namespace when email omitted — default email'),
        mode: z.enum(['surfaces', 'decisionScopes']).optional().describe('Override edgePersonalizationMode from Decision lab config'),
        datastream_id: z.string().optional().describe('Override datastream id from Decision lab config'),
        target_page_url: z.string().optional().describe('Override targetPageUrl for surface URI building'),
        decision_scopes: z.array(z.string()).optional().describe('Explicit decisionScopes (decisionScopes mode)'),
        view_url: z.string().optional(),
        view_name: z.string().optional(),
        auto_fetch_ecid: z.boolean().optional().describe('When true (default), lookup UPS ecid by email if ecid omitted'),
      },
    },
    async (params) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let email = params.email != null ? String(params.email).trim() : '';
      let ecid = params.ecid != null ? String(params.ecid).trim() : '';
      let warnings = [];

      if (params.auto_fetch_ecid !== false && email && !ecid) {
        const profileResult = await lookupProfile({
          sandbox: allowed.sandbox,
          namespace: 'email',
          identifier: email,
        });
        if (profileResult.ok) {
          const fetched = extractEcidFromProfileTable(profileResult.data);
          if (fetched) {
            ecid = fetched;
            warnings.push('ecid auto-fetched from profile table.');
          }
        }
      }

      const identityResult = resolveEventIdentities({ email, ecid });
      if (!identityResult.ok) {
        return toolError(identityResult.error);
      }
      email = identityResult.email;
      ecid = identityResult.ecid;
      if (identityResult.warnings?.length) warnings.push(...identityResult.warnings);

      const apiResult = await decisioningEdgeEvaluate({
        sandbox: allowed.sandbox,
        email: email || undefined,
        ecid: ecid || undefined,
        namespace: params.namespace,
        mode: params.mode,
        datastream_id: params.datastream_id,
        target_page_url: params.target_page_url,
        decision_scopes: params.decision_scopes,
        view_url: params.view_url,
        view_name: params.view_name,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_decisioning_edge_evaluate',
        sandbox: allowed.sandbox,
        email: email || null,
        identifier: ecid || null,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox, warnings: warnings.length ? warnings : undefined });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        warnings: warnings.length ? warnings : undefined,
        evaluate: apiResult.data,
        next_step: 'Call lab_explain_decision_response with propositions from evaluate.propositions (or pass email/ecid to re-evaluate).',
      });
    },
  );

  mcpServer.registerTool(
    'lab_explain_decision_response',
    {
      title: 'Explain Edge decision propositions',
      description:
        'POST /api/decisioning/explain — maps proposition scopes to Decision lab placement mounts, summarizes item content, ' +
        'batch-resolves offer-item ids via GET /api/decisioning/treatment-name, and returns a zero-proposition checklist. ' +
        'Pass propositions from lab_decisioning_edge_evaluate, or provide email/ecid to evaluate first.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        propositions: z.array(z.record(z.unknown())).optional().describe('Propositions from edge evaluate — omit to evaluate first'),
        email: z.string().email().optional(),
        ecid: z.string().optional(),
        mode: z.enum(['surfaces', 'decisionScopes']).optional(),
        datastream_id: z.string().optional(),
        target_page_url: z.string().optional(),
        decision_scopes: z.array(z.string()).optional(),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_explain_decision_response',
        sandbox: allowed.sandbox,
      });

      let propositions = Array.isArray(params.propositions) ? params.propositions : null;
      /** @type {Record<string, unknown> | null} */
      let evaluateData = null;

      if (!propositions || !propositions.length) {
        if (!params.email && !params.ecid) {
          return toolError('Provide propositions from lab_decisioning_edge_evaluate, or email/ecid to evaluate first.');
        }
        const evalResult = await decisioningEdgeEvaluate({
          sandbox: allowed.sandbox,
          email: params.email,
          ecid: params.ecid,
          mode: params.mode,
          datastream_id: params.datastream_id,
          target_page_url: params.target_page_url,
          decision_scopes: params.decision_scopes,
        });
        if (!evalResult.ok) {
          return fromLabApi(evalResult, { sandbox: allowed.sandbox, phase: 'edge-evaluate' });
        }
        evaluateData = evalResult.data;
        propositions = Array.isArray(evalResult.data?.propositions) ? evalResult.data.propositions : [];
      }

      const explainResult = await explainDecisionResponse({
        sandbox: allowed.sandbox,
        propositions,
        evaluate_context: evaluateData
          ? {
              mode: evaluateData.mode,
              surfaces: evaluateData.surfaces,
              decisionScopes: evaluateData.decisionScopes,
              datastreamId: evaluateData.datastreamId,
              identityMap: evaluateData.identityMap,
            }
          : {
              mode: params.mode,
              datastreamId: params.datastream_id,
            },
      });

      if (!explainResult.ok) {
        return fromLabApi(explainResult, { sandbox: allowed.sandbox });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        evaluate: evaluateData,
        explain: explainResult.data,
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_resolve_treatment_name',
    {
      title: 'Resolve AJO offer-item / treatment name',
      description: 'GET /api/decisioning/treatment-name?id= — resolves DPS offer-item id to human-readable itemName for a sandbox.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        id: z.string().describe('Offer-item / treatment UUID from proposition scopeDetails or items'),
      },
    },
    async ({ sandbox, id }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const treatmentId = String(id || '').trim();
      if (!treatmentId) {
        return toolError('id is required.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_resolve_treatment_name',
        sandbox: allowed.sandbox,
      });

      const apiResult = await resolveDecisioningTreatmentName({
        sandbox: allowed.sandbox,
        id: treatmentId,
      });

      return fromLabApi(apiResult, { sandbox: allowed.sandbox, id: treatmentId });
    },
  );
}
