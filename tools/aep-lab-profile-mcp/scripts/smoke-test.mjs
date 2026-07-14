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

async function mcpRequest(sessionId, body) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-AEP-Lab-Mcp-Key': API_KEY,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
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
  const expected = [
    'lab_get_execution_framework',
    'lab_get_industry_playbook',
    'lab_preflight_profile_generate',
    'lab_list_industries',
    'lab_list_sandboxes',
    'lab_mcp_access_info',
    'lab_profile_infra_status',
    'lab_generate_profile',
    'lab_lookup_profile',
    'lab_get_profile',
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
    'lab_poll_brand_scrape',
    'lab_resolve_brand_scrape',
    'lab_cancel_brand_scrape',
    'lab_list_brand_scrapes',
    'lab_get_brand_scrape',
    'lab_build_demo_website',
    'lab_generate_profile_from_brand_scrape',
  ];
  for (const name of expected) {
    if (!names.includes(name)) {
      throw new Error(`Missing tool ${name}. Got: ${names.join(', ')}`);
    }
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

  const listCall = await mcpRequest(sessionId, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'lab_list_industries', arguments: {} },
  });

  if (listCall.status !== 200 || listCall.json.error) {
    throw new Error(`tools/call failed: ${JSON.stringify(listCall.json)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    toolCount: names.length,
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
