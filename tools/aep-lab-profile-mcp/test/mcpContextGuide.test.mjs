import assert from 'node:assert/strict';
import test from 'node:test';

import { getMcpWorkflow, listMcpContexts, recommendMcpContexts } from '../src/framework/mcpContextGuide.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';

test('context directory exposes copy-ready unique names and URLs', () => {
  const contexts = listMcpContexts();
  assert.equal(new Set(contexts.map((context) => context.id)).size, contexts.length);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-guide').url.endsWith('/mcp/guide'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-general').toolCount, 111);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-pdf-prep').url.endsWith('/mcp/pdf'), true);
  assert.equal(contexts.find((context) => context.id === 'adobe-cx-coworker-gateway').access.includes('Adobe'), true);
});

test('recommender selects narrow contexts and reports cross-context work', () => {
  assert.equal(recommendMcpContexts('delete an old audience').primary.id, 'aep-lab-audiences');
  assert.equal(recommendMcpContexts('generate a profile and evaluate decisioning').crossContext, true);
  assert.equal(recommendMcpContexts('something broad').primary.id, 'aep-lab-general');
  assert.match(recommendMcpContexts('delete a campaign').hostLimitation, /cannot connect/i);
  assert.equal(recommendMcpContexts('upload a DOCX and generate a PDF').primary.id, 'aep-lab-pdf-prep');
});

test('workflow plans retain confirmation gates', () => {
  const audience = getMcpWorkflow('audience_cleanup');
  assert.deepEqual(audience.contexts, ['aep-lab-audiences']);
  assert.equal(audience.steps.some((step) => /exact confirmation/i.test(step)), true);
  assert.equal(getMcpWorkflow('missing'), null);
  assert.deepEqual(getMcpWorkflow('pdf_preparation').contexts, ['aep-lab-pdf-prep']);
});

test('guide tools are closed-world and read-only', () => {
  for (const name of ['lab_mcp_contexts', 'lab_mcp_recommend_context', 'lab_mcp_workflow']) {
    assert.deepEqual(annotationsForTool(name), {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  }
});
