#!/usr/bin/env node
/**
 * Smoke test: health check + MCP initialize + tools/list.
 * Usage: npm run smoke (server must be running, or script starts ephemeral server)
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.mcp') });

const PORT = Number(process.env.SMOKE_PORT || 18080);
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = String(process.env.AEP_LAB_MCP_API_KEY || 'local-smoke-test-key').trim();

async function mcpRequest(sessionId, body, endpoint = '/mcp') {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-AEP-Lab-Mcp-Key': API_KEY,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(`${BASE}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, sessionId: res.headers.get('mcp-session-id') || sessionId };
}

async function run() {
  process.env.AEP_LAB_MCP_API_KEY = API_KEY;
  process.env.PORT = String(PORT);
  process.env.HOST = '127.0.0.1';
  process.env.AEP_LAB_MCP_BATCH_STORE = 'memory';
  process.env.AEP_LAB_MCP_FIRESTORE = 'off';

  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: join(__dirname, '..'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  child.stdout.on('data', (buf) => {
    const line = buf.toString();
    if (line.includes('aep-lab-profile-mcp-start')) ready = true;
  });

  for (let i = 0; i < 30; i += 1) {
    if (ready) break;
    try {
      const h = await fetch(`${BASE}/health`);
      if (h.ok) {
        ready = true;
        break;
      }
    } catch {
      /* retry */
    }
    await sleep(200);
  }

  if (!ready) {
    child.kill();
    throw new Error('Server did not become ready');
  }

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error(`Health failed: ${health.status}`);
  const healthJson = await health.json();
  const healthPaths = healthJson.mcpEndpoints?.map((entry) => entry.path) || [];
  for (const path of ['/mcp', '/mcp/entry', '/mcp/profile', '/mcp/audiences', '/mcp/ajo-cleanup', '/mcp/decisioning', '/mcp/demo-prep', '/mcp/pdf', '/mcp/weather']) {
    if (!healthPaths.includes(path)) throw new Error(`Health is missing focused endpoint ${path}`);
  }

  const init = await mcpRequest(undefined, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    },
  });

  if (init.status !== 200) {
    throw new Error(`Initialize failed: ${init.status} ${JSON.stringify(init.json)}`);
  }

  const sessionId = init.sessionId;
  if (!sessionId) throw new Error('No mcp-session-id returned');

  await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });

  const toolsList = await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const names = toolsList.json?.result?.tools?.map((t) => t.name) || [];
  const listedTools = toolsList.json?.result?.tools || [];
  const expected = [
    'lab_get_execution_framework',
    'lab_get_industry_playbook',
    'lab_preflight_profile_generate',
    'lab_list_industries',
    'lab_list_sandboxes',
    'lab_mcp_access_info',
    'lab_mcp_contexts',
    'lab_mcp_recommend_context',
    'lab_mcp_workflow',
    'lab_demo_config_inspect',
    'lab_demo_config_preview',
    'lab_demo_config_apply',
    'lab_demo_config_restore',
    'lab_demo_assets_inspect',
    'lab_demo_assets_preview_from_scrape',
    'lab_demo_assets_apply',
    'lab_demo_assets_restore',
    'lab_profile_infra_status',
    'lab_generate_profile',
    'lab_lookup_profile',
    'lab_get_profile',
    'lab_live_activity_list_templates',
    'lab_live_activity_get_template',
    'lab_live_activity_profile_context',
    'lab_live_activity_get_execution_state',
    'lab_live_activity_save_execution_state',
    'lab_live_activity_preflight',
    'lab_live_activity_send',
    'lab_live_activity_upsert_template',
    'lab_live_activity_delete_template',
    'lab_live_activity_list_runs',
    'lab_audience_list',
    'lab_audience_audit',
    'lab_audience_delete',
    'lab_ajo_journey_list',
    'lab_ajo_journey_audit',
    'lab_ajo_journey_delete',
    'lab_ajo_campaign_list',
    'lab_ajo_campaign_audit',
    'lab_ajo_campaign_delete',
    'lab_update_profile',
    'lab_profile_activity',
    'lab_list_event_targets',
    'lab_setup_event_infra',
    'lab_get_event_config',
    'lab_save_event_datastream',
    'lab_preflight_profile_event',
    'lab_send_profile_event',
    'lab_send_retail_journey_events',
    'lab_send_edge_event',
    'lab_sandbox_profile_config',
    'lab_onboard_sandbox',
    'lab_generate_profiles_batch',
    'lab_batch_job_status',
    'lab_provision_profile_infra_step',
    'lab_enable_profile',
    'lab_brand_scrape',
    'lab_brand_scrape_brief',
    'lab_brand_scrape_upload',
    'lab_poll_brand_scrape',
    'lab_resolve_brand_scrape',
    'lab_cancel_brand_scrape',
    'lab_list_brand_scrapes',
    'lab_get_brand_scrape',
    'lab_build_demo_website',
    'lab_generate_profile_from_brand_scrape',
    'lab_pdf_capabilities',
    'lab_pdf_draft_list',
    'lab_pdf_draft_get',
    'lab_pdf_draft_save',
    'lab_pdf_extract_docx_data',
    'lab_pdf_html_preview',
    'lab_pdf_generate',
    'lab_pdf_job_list',
    'lab_pdf_job_status',
    'lab_pdf_server_template_list',
    'lab_pdf_server_template_analyse',
    'lab_pdf_server_template_publish',
    'lab_pdf_server_template_archive',
  ];
  for (const name of expected) {
    if (!names.includes(name)) {
      throw new Error(`Missing tool ${name}. Got: ${names.join(', ')}`);
    }
  }

  const richSingle = listedTools.find((tool) => tool.name === 'lab_send_profile_event');
  const richPreflight = listedTools.find((tool) => tool.name === 'lab_preflight_profile_event');
  const richBatch = listedTools.find((tool) => tool.name === 'lab_send_profile_events_batch');
  const audienceList = listedTools.find((tool) => tool.name === 'lab_audience_list');
  const audienceDelete = listedTools.find((tool) => tool.name === 'lab_audience_delete');
  const ajoJourneyList = listedTools.find((tool) => tool.name === 'lab_ajo_journey_list');
  const ajoCampaignDelete = listedTools.find((tool) => tool.name === 'lab_ajo_campaign_delete');
  const missingAnnotations = listedTools.filter((tool) =>
    !tool.annotations ||
    typeof tool.annotations.readOnlyHint !== 'boolean' ||
    typeof tool.annotations.destructiveHint !== 'boolean' ||
    typeof tool.annotations.idempotentHint !== 'boolean' ||
    typeof tool.annotations.openWorldHint !== 'boolean');
  if (!richSingle?.inputSchema?.properties?.industry_fields) {
    throw new Error('lab_send_profile_event is missing industry_fields schema');
  }
  if (!richPreflight?.inputSchema?.properties?.industry_fields) {
    throw new Error('lab_preflight_profile_event is missing industry_fields schema');
  }
  if (!richBatch?.inputSchema?.properties?.events?.items?.properties?.industry_fields) {
    throw new Error('lab_send_profile_events_batch events[] is missing industry_fields schema');
  }
  if (audienceList?.annotations?.readOnlyHint !== true || audienceList?.annotations?.destructiveHint !== false) {
    throw new Error('lab_audience_list safety annotations are incorrect');
  }
  if (audienceDelete?.annotations?.readOnlyHint !== false || audienceDelete?.annotations?.destructiveHint !== true) {
    throw new Error('lab_audience_delete safety annotations are incorrect');
  }
  if (ajoJourneyList?.annotations?.readOnlyHint !== true || ajoJourneyList?.annotations?.destructiveHint !== false) {
    throw new Error('lab_ajo_journey_list safety annotations are incorrect');
  }
  if (ajoCampaignDelete?.annotations?.readOnlyHint !== false || ajoCampaignDelete?.annotations?.destructiveHint !== true) {
    throw new Error('lab_ajo_campaign_delete safety annotations are incorrect');
  }
  if (missingAnnotations.length) {
    throw new Error(`Tools missing complete safety annotations: ${missingAnnotations.map((tool) => tool.name).join(', ')}`);
  }

  const call = await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'lab_mcp_access_info', arguments: {} },
  });

  if (call.status !== 200 || call.json.error) {
    throw new Error(`lab_mcp_access_info failed: ${JSON.stringify(call.json)}`);
  }

  const accessText = call.json.result?.content?.[0]?.text || '';
  if (!accessText.includes('keyId')) {
    throw new Error('lab_mcp_access_info missing keyId in response');
  }

  const recommendCall = await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    id: 31,
    method: 'tools/call',
    params: { name: 'lab_mcp_recommend_context', arguments: { goal: 'audit and delete an old audience', sandbox: 'apalmer' } },
  });
  const recommendText = recommendCall.json.result?.content?.[0]?.text || '';
  if (recommendCall.status !== 200 || recommendCall.json.error || !recommendText.includes('aep-lab-audiences')) {
    throw new Error(`lab_mcp_recommend_context failed: ${JSON.stringify(recommendCall.json)}`);
  }

  const resourcesList = await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    id: 32,
    method: 'resources/list',
    params: {},
  });
  const resourceUris = resourcesList.json?.result?.resources?.map((resource) => resource.uri) || [];
  if (!resourceUris.includes('lab://mcp/contexts')) {
    throw new Error(`Guide resource is missing: ${JSON.stringify(resourcesList.json)}`);
  }

  const listCall = await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'lab_list_industries', arguments: {} },
  });

  if (listCall.status !== 200 || listCall.json.error) {
    throw new Error(`tools/call failed: ${JSON.stringify(listCall.json)}`);
  }

  async function verifyFocusedEndpoint(endpoint, expectedNames) {
    const focusedInit = await mcpRequest(undefined, {
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'focused-smoke-test', version: '1.0.0' },
      },
    }, endpoint);
    if (focusedInit.status !== 200 || !focusedInit.sessionId) {
      throw new Error(`${endpoint} initialize failed: ${JSON.stringify(focusedInit.json)}`);
    }

    await mcpRequest(focusedInit.sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }, endpoint);

    const focusedList = await mcpRequest(focusedInit.sessionId, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/list',
      params: {},
    }, endpoint);
    const focusedNames = focusedList.json?.result?.tools?.map((tool) => tool.name) || [];
    if (JSON.stringify([...focusedNames].sort()) !== JSON.stringify([...expectedNames].sort())) {
      throw new Error(`${endpoint} tools mismatch: ${focusedNames.join(', ')}`);
    }

    const focusedCall = await mcpRequest(focusedInit.sessionId, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'lab_mcp_access_info', arguments: {} },
    }, endpoint);
    if (focusedCall.status !== 200 || focusedCall.json.error) {
      throw new Error(`${endpoint} tools/call failed: ${JSON.stringify(focusedCall.json)}`);
    }
    return focusedNames.length;
  }

  const focusedToolCounts = {
    entry: await verifyFocusedEndpoint('/mcp/entry', [
      'lab_mcp_access_info',
      'lab_mcp_contexts',
      'lab_mcp_recommend_context',
      'lab_mcp_workflow',
      'lab_load_toolset',
    ]),
    profile: await verifyFocusedEndpoint('/mcp/profile', [
      'lab_mcp_access_info',
      'lab_list_industries',
      'lab_profile_infra_status',
      'lab_preflight_profile_generate',
      'lab_confirm_profile_generation',
      'lab_generate_profile',
      'lab_lookup_profile',
      'lab_get_profile',
      'lab_update_profile',
      'lab_profile_activity',
      'lab_list_event_targets',
      'lab_preflight_profile_event',
      'lab_send_profile_event',
      'lab_send_profile_events_batch',
      'lab_send_retail_journey_events',
      'lab_snowflake_config',
      'lab_snowflake_test_connection',
      'lab_snowflake_get_profile_by_email',
      'lab_snowflake_enrich_profiles',
      'lab_snowflake_get_profile_bundle',
      'lab_run_playbook',
    ]),
    audiences: await verifyFocusedEndpoint('/mcp/audiences', [
      'lab_mcp_access_info',
      'lab_audience_list',
      'lab_audience_audit',
      'lab_audience_delete',
    ]),
    ajoCleanup: await verifyFocusedEndpoint('/mcp/ajo-cleanup', [
      'lab_mcp_access_info',
      'lab_ajo_journey_list',
      'lab_ajo_journey_audit',
      'lab_ajo_journey_delete',
      'lab_ajo_campaign_list',
      'lab_ajo_campaign_audit',
      'lab_ajo_campaign_delete',
    ]),
    decisioning: await verifyFocusedEndpoint('/mcp/decisioning', [
      'lab_mcp_access_info',
      'lab_decision_lab_config',
      'lab_decisioning_edge_evaluate',
      'lab_explain_decision_response',
      'lab_decisioning_resolve_treatment_name',
      'lab_decisioning_catalog_list',
      'lab_decisioning_catalog_get',
      'lab_decisioning_catalog_schema',
      'lab_decisioning_catalog_assess',
    ]),
    pdf: await verifyFocusedEndpoint('/mcp/pdf', [
      'lab_mcp_access_info',
      'lab_pdf_capabilities',
      'lab_pdf_draft_list',
      'lab_pdf_draft_get',
      'lab_pdf_draft_save',
      'lab_pdf_extract_docx_data',
      'lab_pdf_html_preview',
      'lab_pdf_generate',
      'lab_pdf_job_list',
      'lab_pdf_job_status',
      'lab_pdf_server_template_list',
      'lab_pdf_server_template_analyse',
      'lab_pdf_server_template_publish',
      'lab_pdf_server_template_archive',
    ]),
    weather: await verifyFocusedEndpoint('/mcp/weather', [
      'lab_mcp_access_info',
      'lab_weather_current',
      'lab_weather_forecast',
    ]),
  };

  console.log(JSON.stringify({
    ok: true,
    version: init.json?.result?.serverInfo?.version || null,
    toolCount: names.length,
    focusedToolCounts,
    richIndustrySchemas: true,
    tools: names,
    accessInfo: accessText.slice(0, 200),
    sample: listCall.json.result?.content?.[0]?.text?.slice(0, 120),
  }));
  child.kill();
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
