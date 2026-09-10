import { createHash } from 'node:crypto';
import * as z from 'zod';

import { writeAuditLog } from '../auditLog.mjs';
import { createFireflyApiClient } from '../fireflyApiClient.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const ASPECT_RATIOS = ['auto', '1:1', '4:3', '3:4', '16:9', '9:16'];
const generateSchema = {
  prompt: z.string().trim().min(1).max(1024).describe('The image prompt. Do not include credentials or personal data.'),
  aspect_ratio: z.enum(ASPECT_RATIOS).optional().describe('Output aspect ratio; default auto.'),
};

function canonicalRequest({ prompt, aspect_ratio = 'auto' }) {
  return { prompt: String(prompt).trim(), aspect_ratio };
}
function preflight(request) {
  const canonical = canonicalRequest(request);
  const preflightId = createHash('sha256')
    .update(JSON.stringify({ version: 1, operation: 'firefly_image5_generate', ...canonical }))
    .digest('hex');
  return {
    request: canonical,
    preflight_id: preflightId,
    confirmation: `GENERATE FIREFLY IMAGE ${preflightId.slice(0, 12).toUpperCase()}`,
  };
}

function jobIdFromUrl(rawUrl) {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname.split('/').filter(Boolean).at(-1) || 'unknown');
  } catch {
    return 'unknown';
  }
}

function fireflyError(error) {
  return toolError(error?.message || 'Adobe Firefly request failed');
}

/** Register the governed Firefly Image 5 asynchronous generation lifecycle. */
export function registerFireflyTools(mcpServer, { client = createFireflyApiClient() } = {}) {
  mcpServer.registerTool('lab_firefly_capabilities', {
    title: 'Inspect Adobe Firefly capabilities',
    description: 'Shows the enabled Firefly Image 5 operation, supported aspect ratios, async workflow, and server configuration readiness without exposing credentials.',
    inputSchema: {},
  }, async () => jsonResult({ ok: true, firefly: client.capabilities() }));

  mcpServer.registerTool('lab_firefly_generate_preview', {
    title: 'Preview a Firefly Image 5 generation',
    description: 'Validates one text-to-image request without consuming Firefly credits. Returns a SHA-256 preflight ID and exact confirmation phrase.',
    inputSchema: generateSchema,
  }, async (params) => jsonResult({ ok: true, operation: 'firefly_image5_generate', ...preflight(params), billable: false }));

  mcpServer.registerTool('lab_firefly_generate_apply', {
    title: 'Submit a previewed Firefly Image 5 generation',
    description: 'Submits exactly one unchanged previewed request. This is billable and non-idempotent, is never retried automatically, and requires the preflight ID plus exact confirmation.',
    inputSchema: {
      ...generateSchema,
      preflight_id: z.string().length(64),
      confirmation: z.string().min(1),
    },
  }, async (params) => {
    const expected = preflight(params);
    if (params.preflight_id !== expected.preflight_id || params.confirmation !== expected.confirmation) {
      return toolError('Firefly generation confirmation did not match the unchanged preview', {
        expected_preflight_id: expected.preflight_id,
        expected_confirmation: expected.confirmation,
      });
    }
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_generate_apply', preflightId: expected.preflight_id });
    try {
      const job = await client.submitGenerate(expected.request);
      return jsonResult({
        ok: true,
        submitted: true,
        billable: true,
        job,
        next_step: 'Call lab_firefly_job_status with job.status_url until the status is succeeded or failed.',
      });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_job_status', {
    title: 'Check a Firefly generation job',
    description: 'Checks one Adobe-provided Firefly status URL. Returns current status, generated output URLs when complete, and the exact cancellation phrase.',
    inputSchema: { status_url: z.string().url().max(2048) },
  }, async ({ status_url }) => {
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_job_status' });
    try {
      const job = await client.getJobStatus(status_url);
      return jsonResult({
        ok: true,
        job,
        cancel_confirmation: `CANCEL FIREFLY JOB ${job.job_id}`,
      });
    } catch (error) { return fireflyError(error); }
  });

  mcpServer.registerTool('lab_firefly_job_cancel', {
    title: 'Cancel a Firefly generation job',
    description: 'Cancels one submitted Firefly job through its Adobe-provided cancel URL. Requires exact confirmation: CANCEL FIREFLY JOB <job-id>.',
    inputSchema: {
      cancel_url: z.string().url().max(2048),
      confirmation: z.string().min(1).max(500),
    },
  }, async ({ cancel_url, confirmation }) => {
    const jobId = jobIdFromUrl(cancel_url);
    const expected = `CANCEL FIREFLY JOB ${jobId}`;
    if (confirmation !== expected) return toolError('Firefly cancellation confirmation did not match', { expected_confirmation: expected });
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_firefly_job_cancel', jobId });
    try {
      const result = await client.cancelJob(cancel_url);
      return jsonResult({ ok: true, ...result });
    } catch (error) { return fireflyError(error); }
  });
}
