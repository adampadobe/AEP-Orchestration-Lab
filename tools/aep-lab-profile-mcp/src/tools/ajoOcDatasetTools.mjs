import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  ajoOcDatasetApply,
  ajoOcDatasetJobStatus,
  ajoOcDatasetPreview,
  ajoOcDatasetStatus,
  ajoOcDatasetValidate,
} from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const selectorSchema = {
  sandbox: z.string().min(1).describe('AEP sandbox; must match the authenticated key or IMS enrollment.'),
  dataset_ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(100).optional()
    .describe('Exact Catalog dataset IDs. Omit to use the rel_ dataset name prefix.'),
  name_prefix: z.literal('rel_').optional().describe('Only the rel_ dataset prefix is supported.'),
};

function assertAllowed(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  return allowed.ok
    ? { sandbox: allowed.sandbox }
    : { error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }) };
}

function writeToolAudit(name, sandbox, result, params, started) {
  writeAuditLog({
    keyId: getRequestKeyId(),
    tool: name,
    sandbox,
    identifier: params.dataset_ids?.join(',') || params.batch_job_id || null,
    result: result.ok && result.data?.ok !== false ? 'ok' : 'error',
    durationMs: Date.now() - started,
  });
}

async function invokeRead(name, params, invoke) {
  const started = Date.now();
  const check = assertAllowed(params.sandbox);
  if (check.error) return check.error;
  const result = await invoke({ ...params, sandbox: check.sandbox });
  writeToolAudit(name, check.sandbox, result, params, started);
  if (result.ok && result.data?.ok === false) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      isError: true,
    };
  }
  return fromLabApi(result, { sandbox: check.sandbox });
}

export function registerAjoOcDatasetTools(server, { readOnlyOnly = false } = {}) {
  server.registerTool('lab_ajo_oc_dataset_status', {
    title: 'Read Orchestrated Campaign dataset status',
    description:
      'Read Catalog metadata and Orchestrated Campaign extension/job state for rel_ datasets. Defaults to the rel_ name prefix; exact IDs can be provided. This tool is read-only.',
    inputSchema: selectorSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invokeRead('lab_ajo_oc_dataset_status', params, ajoOcDatasetStatus));

  server.registerTool('lab_ajo_oc_dataset_validate', {
    title: 'Validate Orchestrated Campaign dataset eligibility',
    description:
      'Calls Adobe’s read-only dataset extension validation. Validate exact rel_ dataset IDs before previewing. A 401/403 is returned unchanged and must stop enablement work.',
    inputSchema: selectorSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invokeRead('lab_ajo_oc_dataset_validate', params, ajoOcDatasetValidate));

  if (readOnlyOnly) {
    server.registerTool('lab_ajo_oc_dataset_job_status', {
      title: 'Read Orchestrated Campaign enablement job status',
      description:
        'Read job and current dataset extension status for an owned batch_job_id or Adobe job_ids. Jobs are scoped to this principal, organization, and sandbox. This tool is read-only.',
      inputSchema: {
        sandbox: selectorSchema.sandbox,
        batch_job_id: z.string().uuid().optional(),
        job_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    }, (params) => invokeRead('lab_ajo_oc_dataset_job_status', params, ajoOcDatasetJobStatus));
    return;
  }

  server.registerTool('lab_ajo_oc_dataset_preview', {
    title: 'Preview Orchestrated Campaign dataset enablement',
    description:
      'Read-only Adobe eligibility checks plus a principal-scoped, 15-minute single-use preview ticket. Shows exact selected and eligible dataset IDs/names, data-ingested warnings, and the required confirmation phrase. Does not enable anything.',
    inputSchema: selectorSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invokeRead('lab_ajo_oc_dataset_preview', params, ajoOcDatasetPreview));

  server.registerTool('lab_ajo_oc_dataset_apply', {
    title: 'Enable Orchestrated Campaign dataset extension',
    description:
      'MUTATING AEP OPERATION. Only after showing the exact preview and receiving explicit colleague confirmation of its exact scope and phrase. Requires the unchanged dataset_ids, single-use preflight_id, exact confirmation_phrase, and confirmed=true. The server re-reads and revalidates each dataset, submits one dataset at a time, records each Adobe job ID, stops on the first failure/uncertain result, and never retries a write. Never call this tool for enablement unless the colleague explicitly asks.',
    inputSchema: {
      sandbox: selectorSchema.sandbox,
      dataset_ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(100)
        .describe('Exact planned_dataset_ids from the preview, unchanged and in the same order.'),
      preflight_id: z.string().uuid().describe('Single-use preflight_id returned by preview.'),
      confirmation_phrase: z.string().min(1)
        .describe('Exact confirmation phrase returned by preview and explicitly confirmed by the colleague.'),
      confirmed: z.literal(true).describe('True only after explicit confirmation of the exact sandbox and dataset scope.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  }, async (params) => {
    const started = Date.now();
    const check = assertAllowed(params.sandbox);
    if (check.error) return check.error;
    const result = await ajoOcDatasetApply({ ...params, sandbox: check.sandbox });
    writeToolAudit('lab_ajo_oc_dataset_apply', check.sandbox, result, params, started);
    if (result.ok && result.data?.ok === false) {
      return {
        content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        isError: true,
      };
    }
    return fromLabApi(result, { sandbox: check.sandbox });
  });

  server.registerTool('lab_ajo_oc_dataset_job_status', {
    title: 'Read Orchestrated Campaign enablement job status',
    description:
      'Read job and current dataset extension status for an owned batch_job_id or Adobe job_ids. Jobs are scoped to this principal, organization, and sandbox. This tool is read-only.',
    inputSchema: {
      sandbox: selectorSchema.sandbox,
      batch_job_id: z.string().uuid().optional(),
      job_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invokeRead('lab_ajo_oc_dataset_job_status', params, ajoOcDatasetJobStatus));
}
