import assert from 'node:assert/strict';
import test from 'node:test';

import { registerCreativityTools } from '../src/tools/creativityTools.mjs';

function setup() {
  const tools = new Map();
  const calls = [];
  const client = {
    capabilities: () => ({ configured: true }),
    probeToken: async (profile) => ({ profile, token_issued: true, operation_access_verified: false }),
    submitPhotoshopEdit: async (body) => (calls.push(['photoshop', body]), { job_id: 'ps-1', status_url: 'https://photoshop-api.adobe.io/v2/status/ps-1' }),
    submitInDesignMerge: async (body) => (calls.push(['indesign', body]), { job_id: 'id-1', status_url: 'https://indesign.adobe.io/v3/status/id-1' }),
    submitSubstanceRender: async (body) => (calls.push(['substance', body]), { job_id: 's3d-1', status_url: 'https://s3d.adobe.io/v1/jobs/s3d-1' }),
    listExpressDocuments: async () => ({ total: 1, documents: [{ id: 'urn:doc:1', name: 'Template', thumbnailUrl: 'https://signed.example/secret' }] }),
    getExpressDocument: async () => ({ id: 'urn:doc:1', name: 'Template', documentPages: [{ pageNumber: 1, thumbnailUrl: 'https://signed.example/secret', taggedElements: [{ name: 'headline', type: 'text', position: { x: 1, y: 2 } }] }] }),
    submitExpressVariation: async (body) => (calls.push(['express', body]), { job_id: 'ex-1', status_url: 'https://express-api.adobe.io/status/ex-1' }),
    submitIllustratorTrace: async (body) => (calls.push(['illustrator', body]), { job_id: 'ai-1', status_url: 'https://illustrator-api.adobe.io/v1/status/ai-1' }),
    getJobStatus: async (profile, url) => ({ profile, url, status: 'running' }),
  };
  registerCreativityTools({ registerTool(name, definition, handler) { tools.set(name, { definition, handler }); } }, { client, audit: () => {} });
  return { tools, calls };
}

function body(result) { return JSON.parse(result.content[0].text); }
const getUrl = 'https://assets.s3.amazonaws.com/input/file?signature=test';
const putUrl = 'https://assets.s3.amazonaws.com/output/file?signature=test';

async function previewApply(tools, prefix, request) {
  const preview = body(await tools.get(`${prefix}_preview`).handler(request));
  assert.equal(preview.submitted, false);
  const rejected = await tools.get(`${prefix}_apply`).handler({ ...request, preflight_id: preview.preflight_id, confirmation: 'wrong' });
  assert.equal(rejected.isError, true);
  const accepted = body(await tools.get(`${prefix}_apply`).handler({ ...request, preflight_id: preview.preflight_id, confirmation: preview.confirmation }));
  assert.equal(accepted.submitted, true);
}

test('creativity toolset registers fifteen domain tools', () => {
  const { tools } = setup();
  assert.equal(tools.size, 15);
  assert.equal(tools.has('lab_creativity_job_status'), true);
});

test('Photoshop v2 combines Lightroom-style edits behind an unchanged confirmation', async () => {
  const { tools, calls } = setup();
  await previewApply(tools, 'lab_creativity_photoshop_edit', {
    source_url: getUrl, output_url: putUrl, output_media_type: 'image/jpeg',
    auto_tone: true, auto_straighten: true, exposure: 0.5, contrast: 10, saturation: 5,
  });
  assert.deepEqual(calls[0][1].edits, {
    autoTone: true, autoStraighten: { enabled: true }, light: { exposure: 0.5, contrast: 10 }, color: { saturation: 5 },
  });
});

test('InDesign, Substance, Express, and Illustrator previews bind documented request shapes', async () => {
  const { tools, calls } = setup();
  await previewApply(tools, 'lab_creativity_indesign_merge', {
    template_url: getUrl, template_filename: 'template.indd', csv_url: getUrl,
    csv_filename: 'records.csv', output_url: putUrl, output_basename: 'personalised',
  });
  await previewApply(tools, 'lab_creativity_substance_render', { model_url: getUrl, model_filename: 'product.glb' });
  await previewApply(tools, 'lab_creativity_express_variation', {
    document_id: 'urn:aaid:sc:test:document', variation_request_id: 'demo-001',
    text_mappings: [{ tag_name: 'headline', text: 'Summer Sale' }], output_type: 'image', output_media_type: 'image/png', pages: '1',
  });
  await previewApply(tools, 'lab_creativity_illustrator_trace', { source_url: getUrl, media_type: 'image/png', preset: 'enhanced_general' });
  assert.equal(calls[0][1].params.outputMediaType, 'application/pdf');
  assert.equal(calls[1][1].scene.modelFile, 'product.glb');
  assert.equal(calls[2][1].input.mappings.textMappings[0].tagName, 'headline');
  assert.equal(calls[3][1].input.mediaType, 'image/png');
});

test('Express discovery strips transient thumbnail URLs', async () => {
  const { tools } = setup();
  const list = body(await tools.get('lab_creativity_express_documents').handler({ limit: 1 }));
  assert.deepEqual(list.documents, [{ id: 'urn:doc:1', name: 'Template' }]);
  const detail = body(await tools.get('lab_creativity_express_document_get').handler({ document_id: 'urn:doc:1' }));
  assert.deepEqual(detail.document.tagged_elements, [{ page_number: 1, name: 'headline', type: 'text' }]);
  assert.doesNotMatch(JSON.stringify(detail), /signed\.example/);
});
