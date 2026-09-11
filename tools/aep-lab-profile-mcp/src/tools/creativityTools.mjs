import { createHash } from 'node:crypto';
import * as z from 'zod';

import { writeAuditLog } from '../auditLog.mjs';
import { createCreativityApiClient } from '../creativityApiClient.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult, toolError } from './helpers.mjs';

const STORAGE_HOSTS = ['amazonaws.com', 'windows.net', 'dropboxusercontent.com', 'storage.googleapis.com'];
const mediaUrl = z.string().url().max(4096).refine((raw) => {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && STORAGE_HOSTS.some((suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`));
  } catch { return false; }
}, 'URL must use HTTPS on AWS S3, Azure Blob, Dropbox, or Google Cloud Storage');
const expressMediaUrl = z.string().url().max(4096).refine((raw) => {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && ['amazonaws.com', 'windows.net', 'dropboxusercontent.com'].some((suffix) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`));
  } catch { return false; }
}, 'Express media URL must use HTTPS on AWS S3, Azure Blob, or Dropbox');
const fileName = z.string().trim().min(1).max(180).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const jobProfile = z.enum(['photoshop', 'indesign', 'substance', 'express', 'illustrator']);

const photoshopSchema = {
  source_url: mediaUrl,
  output_url: mediaUrl,
  output_media_type: z.enum(['image/jpeg', 'image/png', 'image/tiff', 'image/vnd.adobe.photoshop']),
  auto_tone: z.boolean().optional(),
  auto_straighten: z.boolean().optional(),
  exposure: z.number().min(-5).max(5).optional(),
  contrast: z.number().min(-100).max(100).optional(),
  saturation: z.number().min(-100).max(100).optional(),
};
const indesignSchema = {
  template_url: mediaUrl,
  template_filename: fileName.refine((name) => /\.indd$/i.test(name), 'Template must be INDD'),
  csv_url: mediaUrl,
  csv_filename: fileName.refine((name) => /\.csv$/i.test(name), 'Data source must be CSV'),
  output_url: mediaUrl,
  output_basename: fileName.default('merged'),
};
const substanceSchema = {
  model_url: mediaUrl,
  model_filename: fileName.refine((name) => /\.glb$/i.test(name), 'Basic render input must be a self-contained GLB'),
};
const illustratorSchema = {
  source_url: mediaUrl,
  media_type: z.enum(['image/png', 'image/jpeg']),
  preset: z.enum(['enhanced_general', 'high_fidelity_photo']).optional(),
};
const expressSchema = {
  document_id: z.string().trim().min(8).max(500),
  variation_request_id: z.string().trim().min(1).max(100),
  text_mappings: z.array(z.object({ tag_name: z.string().trim().min(1).max(200), text: z.string().max(10000) })).max(100).optional(),
  image_mappings: z.array(z.object({ tag_name: z.string().trim().min(1).max(200), source_url: expressMediaUrl })).max(50).optional(),
  video_mappings: z.array(z.object({ tag_name: z.string().trim().min(1).max(200), source_url: expressMediaUrl })).max(20).optional(),
  output_type: z.enum(['image', 'pdf', 'video', 'document']),
  output_media_type: z.enum(['image/jpeg', 'image/png', 'video/mp4']).optional(),
  pages: z.string().regex(/^\d+(?:-\d*)?(?:,\d+(?:-\d*)?)*$/).optional(),
  preferred_document_name: z.string().trim().min(1).max(200).optional(),
};

function canonical(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

function preflight(operation, phrase, params) {
  const request = canonical(params);
  const preflightId = createHash('sha256').update(JSON.stringify({ version: 1, operation, ...request })).digest('hex');
  return { request, preflight_id: preflightId, confirmation: `${phrase} ${preflightId.slice(0, 12).toUpperCase()}` };
}

function checkConfirmation(expected, params) {
  return params.preflight_id === expected.preflight_id && params.confirmation === expected.confirmation;
}

function apiError(error) { return toolError(error?.message || 'Adobe creative API request failed'); }

function photoshopBody(request) {
  const edits = {};
  if (request.auto_tone !== undefined) edits.autoTone = request.auto_tone;
  if (request.auto_straighten !== undefined) edits.autoStraighten = { enabled: request.auto_straighten };
  const light = canonical({ exposure: request.exposure, contrast: request.contrast });
  if (Object.keys(light).length) edits.light = light;
  if (request.saturation !== undefined) edits.color = { saturation: request.saturation };
  if (!Object.keys(edits).length) throw new Error('Select at least one Photoshop/Lightroom-style edit');
  return {
    image: { source: { url: request.source_url } }, edits,
    outputs: [{ destination: { url: request.output_url }, mediaType: request.output_media_type }],
  };
}

function inDesignBody(request) {
  return {
    assets: [
      { source: { url: request.template_url }, destination: request.template_filename },
      { source: { url: request.csv_url }, destination: request.csv_filename },
    ],
    params: {
      targetDocument: request.template_filename, dataSource: request.csv_filename,
      outputMediaType: 'application/pdf', outputFolderPath: 'result', outputFileBaseString: request.output_basename,
    },
    outputs: [{ destination: { url: request.output_url }, source: `result/range1/${request.output_basename}.pdf` }],
  };
}

function expressBody(request) {
  const mappings = {};
  if (request.text_mappings?.length) mappings.textMappings = request.text_mappings.map(({ tag_name, text }) => ({ tagName: tag_name, text }));
  if (request.image_mappings?.length) mappings.imageMappings = request.image_mappings.map(({ tag_name, source_url }) => ({ tagName: tag_name, source: { url: source_url } }));
  if (request.video_mappings?.length) mappings.videoMappings = request.video_mappings.map(({ tag_name, source_url }) => ({ tagName: tag_name, source: { url: source_url } }));
  if (!Object.keys(mappings).length) throw new Error('Provide at least one Express text, image, or video mapping');
  let output;
  if (request.output_type === 'image') output = { type: 'image', mediaType: request.output_media_type || 'image/png', ...(request.pages ? { pages: request.pages } : {}) };
  else if (request.output_type === 'video') output = { type: 'video', mediaType: 'video/mp4', ...(request.pages ? { pages: request.pages } : {}) };
  else if (request.output_type === 'pdf') output = { type: 'pdf', pdfType: 'standard', ...(request.pages ? { pages: request.pages } : {}) };
  else output = { type: 'document', preferredDocumentName: request.preferred_document_name || 'AEP Lab variation' };
  return {
    templateOrDocument: { creativeCloudFileId: request.document_id },
    input: { mappings, variationRequestId: request.variation_request_id }, outputs: [output],
  };
}

function safeExpressDocument(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const pages = Array.isArray(doc.documentPages) ? doc.documentPages : [];
  const taggedElements = pages.flatMap((page) => (Array.isArray(page.taggedElements) ? page.taggedElements : []).map((element) => ({
    page_number: page.pageNumber,
    name: element.name,
    type: element.type,
  }))).filter((element) => element.name && element.type);
  return canonical({
    id: doc.id,
    name: doc.name || doc.title,
    page_count: (doc.pageCount ?? pages.length) || undefined,
    modified_at: doc.modifiedAt,
    ...(taggedElements.length ? { tagged_elements: taggedElements } : {}),
  });
}

/** Register governed Photoshop, InDesign, Substance 3D, Express, and Illustrator tools. */
export function registerCreativityTools(mcpServer, { client = createCreativityApiClient(), audit = writeAuditLog } = {}) {
  mcpServer.registerTool('lab_creativity_capabilities', {
    title: 'Inspect Adobe creativity capabilities',
    description: 'Shows the implemented creative production surfaces, ownership boundaries, and credential readiness without making an Adobe API call.', inputSchema: {},
  }, async () => jsonResult({ ok: true, creativity: client.capabilities() }));

  mcpServer.registerTool('lab_creativity_access_probe', {
    title: 'Probe creative API token issuance',
    description: 'Requests only an Adobe IMS token for one product scope profile. This consumes no creative-operation credits and does not claim tenant or operation access.',
    inputSchema: { product: jobProfile },
  }, async ({ product }) => { try { return jsonResult({ ok: true, ...(await client.probeToken(product)) }); } catch (error) { return apiError(error); } });

  mcpServer.registerTool('lab_creativity_photoshop_edit_preview', {
    title: 'Preview Photoshop and Lightroom-style edits',
    description: 'Validates one Photoshop v2 combined edit without submitting or consuming creative-operation credits.', inputSchema: photoshopSchema,
  }, async (params) => {
    try { photoshopBody(params); return jsonResult({ ok: true, operation: 'photoshop_v2_edit', ...preflight('photoshop_v2_edit', 'RUN PHOTOSHOP EDIT', params), submitted: false }); }
    catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_photoshop_edit_apply', {
    title: 'Submit Photoshop and Lightroom-style edits',
    description: 'Submits one unchanged Photoshop v2 edit after exact confirmation; never automatically retries.',
    inputSchema: { ...photoshopSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    const expected = preflight('photoshop_v2_edit', 'RUN PHOTOSHOP EDIT', canonical(Object.fromEntries(Object.entries(params).filter(([key]) => !['preflight_id', 'confirmation'].includes(key)))));
    if (!checkConfirmation(expected, params)) return toolError('Photoshop edit confirmation did not match the unchanged preview', expected);
    audit({ keyId: getRequestKeyId(), tool: 'lab_creativity_photoshop_edit_apply', preflightId: expected.preflight_id });
    try { return jsonResult({ ok: true, submitted: true, job: await client.submitPhotoshopEdit(photoshopBody(expected.request)) }); } catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_indesign_merge_preview', {
    title: 'Preview an InDesign data merge', description: 'Validates a CSV-to-InDesign-template PDF merge without submission.', inputSchema: indesignSchema,
  }, async (params) => jsonResult({ ok: true, operation: 'indesign_v3_data_merge', ...preflight('indesign_v3_data_merge', 'RUN INDESIGN MERGE', params), submitted: false }));

  mcpServer.registerTool('lab_creativity_indesign_merge_apply', {
    title: 'Submit an InDesign data merge', description: 'Submits one unchanged InDesign CSV data merge after exact confirmation; never automatically retries.',
    inputSchema: { ...indesignSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    const request = canonical(Object.fromEntries(Object.entries(params).filter(([key]) => !['preflight_id', 'confirmation'].includes(key))));
    const expected = preflight('indesign_v3_data_merge', 'RUN INDESIGN MERGE', request);
    if (!checkConfirmation(expected, params)) return toolError('InDesign merge confirmation did not match the unchanged preview', expected);
    audit({ keyId: getRequestKeyId(), tool: 'lab_creativity_indesign_merge_apply', preflightId: expected.preflight_id });
    try { return jsonResult({ ok: true, submitted: true, job: await client.submitInDesignMerge(inDesignBody(request)) }); } catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_substance_render_preview', {
    title: 'Preview a Substance 3D render', description: 'Validates one basic 3D model render without submission.', inputSchema: substanceSchema,
  }, async (params) => jsonResult({ ok: true, operation: 'substance_3d_render_basic', ...preflight('substance_3d_render_basic', 'RUN SUBSTANCE RENDER', params), submitted: false }));

  mcpServer.registerTool('lab_creativity_substance_render_apply', {
    title: 'Submit a Substance 3D render', description: 'Submits one unchanged Substance 3D basic render after exact confirmation; never automatically retries.',
    inputSchema: { ...substanceSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    const request = canonical(Object.fromEntries(Object.entries(params).filter(([key]) => !['preflight_id', 'confirmation'].includes(key))));
    const expected = preflight('substance_3d_render_basic', 'RUN SUBSTANCE RENDER', request);
    if (!checkConfirmation(expected, params)) return toolError('Substance render confirmation did not match the unchanged preview', expected);
    audit({ keyId: getRequestKeyId(), tool: 'lab_creativity_substance_render_apply', preflightId: expected.preflight_id });
    try { return jsonResult({ ok: true, submitted: true, job: await client.submitSubstanceRender({ scene: { modelFile: request.model_filename }, sources: [{ url: { url: request.model_url } }] }) }); } catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_express_documents', {
    title: 'List tagged Adobe Express documents', description: 'Lists a bounded set of owned tagged Express documents. No variation is created.',
    inputSchema: { start: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(25).optional() },
  }, async (params) => {
    try {
      const data = await client.listExpressDocuments(params);
      const docs = data.documents || data.items || data.data || [];
      return jsonResult({ ok: true, total: data.paging?.totalRecords ?? data.total ?? data.totalCount ?? docs.length, documents: Array.isArray(docs) ? docs.map(safeExpressDocument).filter(Boolean) : [] });
    } catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_express_document_get', {
    title: 'Inspect a tagged Adobe Express document', description: 'Reads tag names and types for one owned Express document; no variation is created.',
    inputSchema: { document_id: z.string().trim().min(8).max(500) },
  }, async ({ document_id }) => { try { return jsonResult({ ok: true, document: safeExpressDocument(await client.getExpressDocument(document_id)) }); } catch (error) { return apiError(error); } });

  mcpServer.registerTool('lab_creativity_express_variation_preview', {
    title: 'Preview an Adobe Express variation', description: 'Validates and binds one tagged-template variation without creating outputs.', inputSchema: expressSchema,
  }, async (params) => { try { expressBody(params); return jsonResult({ ok: true, operation: 'express_beta_create_variation', ...preflight('express_beta_create_variation', 'CREATE EXPRESS VARIATION', params), submitted: false }); } catch (error) { return apiError(error); } });

  mcpServer.registerTool('lab_creativity_express_variation_apply', {
    title: 'Create an Adobe Express variation', description: 'Creates one unchanged tagged-template variation after exact confirmation; beta limit is five requests per minute and no automatic retry is performed.',
    inputSchema: { ...expressSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    const request = canonical(Object.fromEntries(Object.entries(params).filter(([key]) => !['preflight_id', 'confirmation'].includes(key))));
    const expected = preflight('express_beta_create_variation', 'CREATE EXPRESS VARIATION', request);
    if (!checkConfirmation(expected, params)) return toolError('Express variation confirmation did not match the unchanged preview', expected);
    audit({ keyId: getRequestKeyId(), tool: 'lab_creativity_express_variation_apply', preflightId: expected.preflight_id });
    try { return jsonResult({ ok: true, submitted: true, job: await client.submitExpressVariation(expressBody(request)) }); } catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_illustrator_trace_preview', {
    title: 'Preview Illustrator Image Trace', description: 'Validates a PNG/JPEG-to-SVG trace without submission.', inputSchema: illustratorSchema,
  }, async (params) => jsonResult({ ok: true, operation: 'illustrator_v1_image_trace', ...preflight('illustrator_v1_image_trace', 'RUN ILLUSTRATOR TRACE', params), output_media_type: 'image/svg+xml', submitted: false }));

  mcpServer.registerTool('lab_creativity_illustrator_trace_apply', {
    title: 'Submit Illustrator Image Trace', description: 'Submits one unchanged raster-to-SVG trace after exact confirmation; never automatically retries.',
    inputSchema: { ...illustratorSchema, preflight_id: z.string().length(64), confirmation: z.string().min(1) },
  }, async (params) => {
    const request = canonical(Object.fromEntries(Object.entries(params).filter(([key]) => !['preflight_id', 'confirmation'].includes(key))));
    const expected = preflight('illustrator_v1_image_trace', 'RUN ILLUSTRATOR TRACE', request);
    if (!checkConfirmation(expected, params)) return toolError('Illustrator trace confirmation did not match the unchanged preview', expected);
    audit({ keyId: getRequestKeyId(), tool: 'lab_creativity_illustrator_trace_apply', preflightId: expected.preflight_id });
    try { return jsonResult({ ok: true, submitted: true, job: await client.submitIllustratorTrace({ input: { source: { url: request.source_url }, mediaType: request.media_type }, ...(request.preset ? { settings: { preset: request.preset } } : {}) }) }); } catch (error) { return apiError(error); }
  });

  mcpServer.registerTool('lab_creativity_job_status', {
    title: 'Check an Adobe creativity job', description: 'Reads one trusted Adobe creative job URL returned by a submit tool. No new creative job is created.',
    inputSchema: { product: jobProfile, status_url: z.string().url().max(4096) },
  }, async ({ product, status_url }) => { try { return jsonResult({ ok: true, job: await client.getJobStatus(product, status_url) }); } catch (error) { return apiError(error); } });
}
