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
  assert.equal(contexts.find((context) => context.id === 'aep-lab-general').toolCount, 181);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-profiles').toolCount, 21);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-pdf-prep').url.endsWith('/mcp/pdf'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-command-centre').url.endsWith('/mcp/command-centre'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-weather').url.endsWith('/mcp/weather'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-commerce').url.endsWith('/mcp/commerce'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-commerce').toolCount, 19);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-commerce-optimizer').url.endsWith('/mcp/commerce-optimizer'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-commerce-optimizer').toolCount, 15);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-firefly').url.endsWith('/mcp/firefly'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-firefly').toolCount, 15);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-adobe-capabilities').url.endsWith('/mcp/adobe-capabilities'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-adobe-capabilities').toolCount, 4);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-measurement-quality').url.endsWith('/mcp/measurement-quality'), true);
  assert.equal(contexts.find((context) => context.id === 'aep-lab-measurement-quality').toolCount, 6);
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
  assert.equal(recommendMcpContexts('inspect ACCS product inventory').primary.id, 'aep-lab-commerce');
  assert.equal(recommendMcpContexts('inspect ACO catalog view recommendations').primary.id, 'aep-lab-commerce-optimizer');
  assert.equal(recommendMcpContexts('generate a Firefly image').primary.id, 'aep-lab-firefly');
  assert.equal(recommendMcpContexts('inspect the Adobe API scope inventory').primary.id, 'aep-lab-adobe-capabilities');
});

test('workflow plans retain confirmation gates', () => {
  const audience = getMcpWorkflow('audience_cleanup');
  assert.deepEqual(audience.contexts, ['aep-lab-audiences']);
  assert.equal(audience.steps.some((step) => /exact confirmation/i.test(step)), true);
  assert.equal(getMcpWorkflow('missing'), null);
  assert.deepEqual(getMcpWorkflow('pdf_preparation').contexts, ['aep-lab-pdf-prep']);
  assert.deepEqual(getMcpWorkflow('commerce_demo_preparation').contexts, ['aep-lab-commerce']);
  assert.deepEqual(getMcpWorkflow('commerce_optimizer_demo_preparation').contexts, ['aep-lab-commerce-optimizer']);
  assert.deepEqual(getMcpWorkflow('firefly_image_generation').contexts, ['aep-lab-firefly']);
  assert.deepEqual(getMcpWorkflow('adobe_api_discovery').contexts, ['aep-lab-adobe-capabilities']);
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

test('Adobe capability inventory and operational probes are read-only', () => {
  for (const name of ['adobe_api_catalog', 'ajo_suppression_addresses', 'genstudio_experience_list']) {
    const annotations = annotationsForTool(name);
    assert.equal(annotations.readOnlyHint, true);
    assert.equal(annotations.destructiveHint, false);
    assert.equal(annotations.idempotentHint, true);
  }
});

test('Commerce inspection and preview tools are read-only and apply/delete tools are governed', () => {
  for (const name of [
    'commerce_access_info',
    'commerce_capabilities',
    'commerce_store_configs',
    'commerce_catalog_summary',
    'commerce_product_search',
    'commerce_product_get',
    'commerce_category_tree',
    'commerce_category_products',
    'commerce_graphql_schema',
    'commerce_inventory_status',
    'commerce_inventory_sources',
    'commerce_product_attributes',
    'commerce_product_media',
    'commerce_graphql_query',
    'commerce_admin_change_preview',
    'commerce_admin_delete_audit',
  ]) {
    const annotations = annotationsForTool(name);
    assert.equal(annotations.readOnlyHint, true);
    assert.equal(annotations.destructiveHint, false);
    assert.equal(annotations.idempotentHint, true);
  }
  assert.equal(annotationsForTool('commerce_admin_change_apply').readOnlyHint, false);
  assert.equal(annotationsForTool('commerce_admin_change_apply').destructiveHint, false);
  assert.equal(annotationsForTool('commerce_admin_delete_apply').readOnlyHint, false);
  assert.equal(annotationsForTool('commerce_admin_delete_apply').destructiveHint, true);
});

test('Commerce Optimizer reads and previews are read-only while applies are governed', () => {
  for (const name of [
    'commerce_optimizer_access_info', 'commerce_optimizer_capabilities', 'commerce_optimizer_view_check',
    'commerce_optimizer_attribute_metadata', 'commerce_optimizer_product_search', 'commerce_optimizer_product_get',
    'commerce_optimizer_category_tree', 'commerce_optimizer_navigation', 'commerce_optimizer_recommendations',
    'commerce_optimizer_graphql_query', 'commerce_optimizer_ingestion_change_preview',
    'commerce_optimizer_ingestion_delete_audit',
  ]) {
    const annotations = annotationsForTool(name);
    assert.equal(annotations.readOnlyHint, true);
    assert.equal(annotations.destructiveHint, false);
    assert.equal(annotations.idempotentHint, true);
  }
  assert.equal(annotationsForTool('commerce_optimizer_ingestion_change_apply').readOnlyHint, false);
  assert.equal(annotationsForTool('commerce_optimizer_ingestion_change_apply').destructiveHint, false);
  assert.equal(annotationsForTool('commerce_optimizer_ingestion_delete_apply').readOnlyHint, false);
  assert.equal(annotationsForTool('commerce_optimizer_ingestion_delete_apply').destructiveHint, true);
});

test('Profile Viewer MCP page matches the deployed catalog and separates Coworker from key-based setup', () => {
  const html = readFileSync(new URL('../../../web/profile-viewer/mcp-servers.html', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../../../web/profile-viewer/mcp-servers.js', import.meta.url), 'utf8');
  const keys = readFileSync(new URL('../../../web/profile-viewer/mcp-servers-keys.js', import.meta.url), 'utf8');

  assert.match(html, /v3\.48\.0/);
  assert.match(html, /installs General plus fourteen focused integrations/i);
  assert.match(html, /Add the same repository directly to Claude/i);
  assert.match(html, /Claude stores it as sensitive plugin configuration/i);
  assert.doesNotMatch(html, /First Coworker session: call <code>lab_mcp_first_run_setup/);
  assert.match(catalog, /Complete Lab MCP · 181 tools/);
  assert.match(catalog, /id: 'aep-lab-commerce'/);
  assert.match(catalog, /\/mcp\/commerce/);
  assert.match(catalog, /id: 'aep-lab-commerce-optimizer'/);
  assert.match(catalog, /\/mcp\/commerce-optimizer/);
  assert.match(catalog, /id: 'aep-lab-firefly'/);
  assert.match(catalog, /\/mcp\/firefly/);
  assert.match(catalog, /id: 'aep-lab-adobe-capabilities'/);
  assert.match(catalog, /\/mcp\/adobe-capabilities/);
  assert.match(catalog, /id: 'aep-lab-measurement-quality'/);
  assert.match(catalog, /\/mcp\/measurement-quality/);
  assert.match(catalog, /Focused Lab MCP · 21 tools/);
  assert.doesNotMatch(catalog, /recommended single connection/i);
  assert.match(catalog, /id: 'adobe-commerce-extensibility'/);
  assert.match(catalog, /Adobe Commerce Extensibility MCP/);
  assert.match(catalog, /@adobe-commerce\/commerce-extensibility-tools\/index\.js/);
  assert.match(catalog, /not a hosted catalog\/order operations endpoint/i);
  assert.doesNotMatch(keys, /Copy Coworker config/);
  assert.match(keys, /Copy key-based config/);
});
