import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  pdfDraftGet,
  pdfDraftList,
  pdfDraftSave,
  pdfExtractDocxData,
  pdfGenerate,
  pdfHtmlPreview,
  pdfJobList,
  pdfJobStatus,
  pdfServerTemplateAnalyse,
  pdfServerTemplateArchive,
  pdfServerTemplateList,
  pdfServerTemplatePublish,
} from '../labApiClient.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const sourceFileSchema = z.object({
  file_name: z.string().min(1).max(180),
  mime_type: z.string().max(180).optional(),
  base64: z.string().min(4).max(14_100_000).describe('Base64 file content; decoded source must not exceed 10 MB'),
});
const dataSchema = z.record(z.any()).optional();

function sourceFile(value) {
  return value ? { fileName: value.file_name, mimeType: value.mime_type, base64: value.base64 } : undefined;
}

function allowedSandbox(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  return allowed.ok ? allowed.sandbox : null;
}

async function callPdf(tool, sandbox, operation, identifier) {
  const scoped = allowedSandbox(sandbox);
  if (!scoped) return toolError(`Sandbox "${sandbox}" is not allowed for this MCP key.`);
  const started = Date.now();
  const result = await operation(scoped);
  writeAuditLog({
    keyId: getRequestKeyId(), tool, sandbox: scoped, identifier,
    result: result.ok ? 'ok' : 'error', durationMs: Date.now() - started,
  });
  const response = fromLabApi(result, { sandbox: scoped });
  const lab = result.ok && result.data;
  const previewUrl = lab && lab.previewUrl;
  if (previewUrl) {
    response.content.push({
      type: 'resource_link',
      uri: previewUrl,
      name: lab.documentName || 'Generated PDF preview',
      description: `Private, expiring preview for PDF job ${lab.jobId}`,
      mimeType: 'application/pdf',
    });
  }
  return response;
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer */
export function registerPdfTools(mcpServer) {
  mcpServer.registerTool('lab_pdf_capabilities', {
    title: 'Inspect PDF preparation capabilities and limits',
    description: 'Read-only contract for HTML, DOCX merge, Office/image conversion, storage, preview, and retention before uploading a source file.',
    inputSchema: { sandbox: z.string() },
  }, async ({ sandbox }) => {
    const scoped = allowedSandbox(sandbox);
    if (!scoped) return toolError(`Sandbox "${sandbox}" is not allowed for this MCP key.`);
    return jsonResult({
      ok: true, sandbox: scoped,
      modes: ['html', 'document'],
      operations: ['HTMLToPDFJob', 'DocumentMergeJob', 'CreatePDFJob'],
      sourceExtensions: ['html', 'htm', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'rtf', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'tif', 'tiff'],
      limits: { htmlTemplateBytes: 1_500_000, htmlDataBytes: 1_500_000, documentBytes: 10_485_760, documentMergeDataBytes: 8_388_608, pdfBytes: 5_242_880 },
      storage: { generatedPdfRetentionDays: 14, primary: 'Adobe AJO email-attachment DLZ', backups: ['Amazon S3', 'Google Cloud Storage'] },
      guidance: 'Use lab_pdf_html_preview before HTML generation. Document preview is the generated PDF preview URL. Use a fresh idempotency_key for a new document and reuse it only for an exact retry.',
    });
  });

  mcpServer.registerTool('lab_pdf_draft_list', {
    title: 'List private HTML PDF drafts', description: 'Lists active HTML template drafts owned by this MCP user and sandbox.',
    inputSchema: { sandbox: z.string() },
  }, ({ sandbox }) => callPdf('lab_pdf_draft_list', sandbox, (scoped) => pdfDraftList({ sandbox: scoped })));

  mcpServer.registerTool('lab_pdf_draft_get', {
    title: 'Get a private HTML PDF draft', description: 'Returns one owned HTML draft, its editable HTML, and default JSON data.',
    inputSchema: { sandbox: z.string(), template_id: z.string().min(1).max(100) },
  }, ({ sandbox, template_id }) => callPdf('lab_pdf_draft_get', sandbox, (scoped) => pdfDraftGet({ sandbox: scoped, template_id }), template_id));

  mcpServer.registerTool('lab_pdf_draft_save', {
    title: 'Save a private HTML PDF draft', description: 'Stores an owned HTML template plus default JSON for later preview and PDF generation. It does not generate a PDF.',
    inputSchema: {
      sandbox: z.string(), name: z.string().min(1).max(120),
      html_template: z.string().min(1).max(1_500_000), default_data: dataSchema,
      source_file_name: z.string().max(180).optional(),
    },
  }, (params) => callPdf('lab_pdf_draft_save', params.sandbox, (scoped) => pdfDraftSave({ ...params, sandbox: scoped }), params.name));

  mcpServer.registerTool('lab_pdf_extract_docx_data', {
    title: 'Extract editable JSON from a Word data document',
    description: 'Converts an uploaded DOCX data document into editable JSON for a later merge. This does not create or store a PDF.',
    inputSchema: { sandbox: z.string(), source_file: sourceFileSchema },
  }, (params) => callPdf('lab_pdf_extract_docx_data', params.sandbox, (scoped) => pdfExtractDocxData({ sandbox: scoped, source_file: sourceFile(params.source_file) }), params.source_file.file_name));

  mcpServer.registerTool('lab_pdf_html_preview', {
    title: 'Render an HTML PDF draft without generating a PDF',
    description: 'Merges escaped JSON data into either an inline HTML template or an owned draft. By default returns hashes, byte size, and a short HTML sample to protect Coworker context.',
    inputSchema: {
      sandbox: z.string(), template_id: z.string().max(100).optional(),
      html_template: z.string().max(1_500_000).optional(), data: dataSchema,
      options: z.record(z.any()).optional(), include_rendered_html: z.boolean().optional(),
    },
  }, async (params) => {
    const scoped = allowedSandbox(params.sandbox);
    if (!scoped) return toolError(`Sandbox "${params.sandbox}" is not allowed for this MCP key.`);
    if (!params.template_id && !params.html_template) return toolError('Provide template_id or html_template.');
    const result = await pdfHtmlPreview({ ...params, sandbox: scoped });
    if (result.ok && result.data && !params.include_rendered_html) {
      const html = String(result.data.renderedHtml || '');
      result.data = { ...result.data, renderedHtml: undefined, renderedHtmlSample: html.slice(0, 4_000), renderedHtmlOmitted: html.length > 4_000 };
    }
    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_pdf_html_preview', sandbox: scoped, result: result.ok ? 'ok' : 'error' });
    return fromLabApi(result, { sandbox: scoped });
  });

  mcpServer.registerTool('lab_pdf_generate', {
    title: 'Generate, store, and preview a PDF',
    description: 'Generates an HTML or document PDF through Adobe PDF Services, stores it in the Lab private storage route, and returns expiring preview/download URLs. New documents require a fresh idempotency key; exact retries reuse it.',
    inputSchema: {
      sandbox: z.string(), conversion_mode: z.enum(['html', 'document']),
      document_name: z.string().min(1).max(160), idempotency_key: z.string().min(8).max(200),
      template_id: z.string().max(100).optional(), html_template: z.string().max(1_500_000).optional(),
      source_file: sourceFileSchema.optional(), data: dataSchema, options: z.record(z.any()).optional(),
    },
  }, async (params) => {
    if (params.conversion_mode === 'html' && !params.template_id && !params.html_template) return toolError('HTML mode requires template_id or html_template.');
    if (params.conversion_mode === 'document' && !params.source_file) return toolError('Document mode requires source_file.');
    return callPdf('lab_pdf_generate', params.sandbox, (scoped) => pdfGenerate({ ...params, sandbox: scoped, source_file: sourceFile(params.source_file) }), params.document_name);
  });

  mcpServer.registerTool('lab_pdf_job_list', {
    title: 'List recent stored PDFs', description: 'Lists unexpired PDFs owned by this MCP user and sandbox, with fresh preview and download URLs.',
    inputSchema: { sandbox: z.string(), limit: z.number().int().min(1).max(25).optional() },
  }, ({ sandbox, limit }) => callPdf('lab_pdf_job_list', sandbox, (scoped) => pdfJobList({ sandbox: scoped, limit })));

  mcpServer.registerTool('lab_pdf_job_status', {
    title: 'Get a stored PDF and fresh links', description: 'Reads one owned PDF job and issues fresh private preview and download URLs when it is still retained.',
    inputSchema: { sandbox: z.string(), job_id: z.string().min(16).max(50) },
  }, ({ sandbox, job_id }) => callPdf('lab_pdf_job_status', sandbox, (scoped) => pdfJobStatus({ sandbox: scoped, job_id }), job_id));

  mcpServer.registerTool('lab_pdf_server_template_list', {
    title: 'List published server PDF templates', description: 'Lists built-in templates and user-owned published templates available to the server-side AJO PDF workflow.',
    inputSchema: { sandbox: z.string() },
  }, ({ sandbox }) => callPdf('lab_pdf_server_template_list', sandbox, (scoped) => pdfServerTemplateList({ sandbox: scoped })));

  mcpServer.registerTool('lab_pdf_server_template_analyse', {
    title: 'Analyse a PDF server template before publishing', description: 'Inspects HTML or document merge fields and suggests mappings without publishing the template.',
    inputSchema: { sandbox: z.string(), source_file: sourceFileSchema },
  }, (params) => callPdf('lab_pdf_server_template_analyse', params.sandbox, (scoped) => pdfServerTemplateAnalyse({ sandbox: scoped, source_file: sourceFile(params.source_file) }), params.source_file.file_name));

  mcpServer.registerTool('lab_pdf_server_template_publish', {
    title: 'Validate and publish a PDF server template',
    description: 'Runs Adobe conversion and page-count validation, then publishes an immutable source version for server-side use. Requires explicit confirmation because it consumes PDF Services quota and stores a template.',
    inputSchema: {
      sandbox: z.string(), template_name: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
      source_file: sourceFileSchema, sample_payload: dataSchema,
      field_mappings: z.array(z.record(z.any())).optional(), expected_page_count: z.number().int().min(1).max(20).optional(),
      label: z.string().max(120).optional(), subject: z.string().max(180).optional(), document_name: z.string().max(160).optional(),
      replace: z.boolean().optional(), confirmed: z.boolean(),
    },
  }, (params) => {
    if (params.confirmed !== true) return toolError('Explicit confirmation is required before validating and publishing a server template.');
    return callPdf('lab_pdf_server_template_publish', params.sandbox, (scoped) => pdfServerTemplatePublish({ ...params, sandbox: scoped, source_file: sourceFile(params.source_file) }), params.template_name);
  });

  mcpServer.registerTool('lab_pdf_server_template_archive', {
    title: 'Archive one published PDF server template',
    description: 'Archives one exact user-owned published template. Built-in templates cannot be archived. Requires exact name and explicit confirmation.',
    inputSchema: { sandbox: z.string(), template_name: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/), expected_name: z.string(), confirmed: z.boolean() },
  }, (params) => {
    if (params.confirmed !== true || params.expected_name !== params.template_name) return toolError('Confirm the exact template name before archiving.');
    return callPdf('lab_pdf_server_template_archive', params.sandbox, (scoped) => pdfServerTemplateArchive({ sandbox: scoped, template_name: params.template_name }), params.template_name);
  });
}
