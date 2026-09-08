import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getMcpWorkflow, listMcpContexts, recommendMcpContexts } from '../src/framework/mcpContextGuide.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';

test('context directory exposes copy-ready unique names and URLs', () => {
  const contexts = listMcpContexts();
  assert.equal(new Set(contexts.map((context) => context.id)).size, contexts.length);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-entry').url.endsWith('/mcp/entry'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-entry').toolCount, 5);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-general').toolCount, 127);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-profiles').toolCount, 21);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-pdf-prep').url.endsWith('/mcp/pdf'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-command-centre').url.endsWith('/mcp/command-centre'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-weather').url.endsWith('/mcp/weather'), true);
  assert.equal(contexts.find((context) => context.id === 'adobe-cx-coworker-gateway').access.includes('Adobe'), true);
});

test('recommender selects narrow contexts and reports cross-context work', () => {
  assert.equal(recommendMcpContexts('delete an old audience').primary.id, 'aep-lab-audiences');
  assert.equal(recommendMcpContexts('generate a profile and evaluate decisioning').crossContext, true);
  assert.equal(recommendMcpContexts('something broad').primary.id, 'aep-lab-general');
  assert.match(recommendMcpContexts('delete a campaign').hostLimitation, /cannot connect/i);
  assert.equal(recommendMcpContexts('upload a DOCX and generate a PDF').primary.id, 'aep-lab-pdf-prep');
  assert.equal(recommendMcpContexts('show the weather forecast').primary.id, 'aep-lab-weather');
  assert.equal(recommendMcpContexts('update my command centre task list').primary.id, 'aep-lab-command-centre');
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

test('Profile Viewer MCP page matches the deployed catalog and separates Coworker from key-based setup', () => {
  const html = readFileSync(new URL('../../../web/profile-viewer/mcp-servers.html', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../../../web/profile-viewer/mcp-servers.js', import.meta.url), 'utf8');
  const keys = readFileSync(new URL('../../../web/profile-viewer/mcp-servers-keys.js', import.meta.url), 'utf8');

  assert.match(html, /v3\.41\.3/);
  assert.match(html, /installs nine focused integrations/i);
  assert.doesNotMatch(html, /First Coworker session: call <code>lab_mcp_first_run_setup/);
  assert.match(catalog, /Complete Lab MCP · 127 tools/);
  assert.match(catalog, /Focused Lab MCP · 21 tools/);
  assert.doesNotMatch(catalog, /recommended single connection/i);
  assert.doesNotMatch(keys, /Copy Coworker config/);
  assert.match(keys, /Copy key-based config/);
});
