/**
 * Stdio MCP server — fronts IMS-authenticated Adobe calls using the same service
 * modules as Firebase functions (joLookups, tagsReactorService, eventEdgeService,
 * sandboxesList) plus a thin AEP platform fetch (same shape as /api/aep).
 *
 * Env: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES
 * Optional: ADOBE_SANDBOX_NAME (default sandbox when a tool omits sandbox)
 *
 * Local file (gitignored): tools/aep-lab-adobe-mcp/.env.mcp — loaded automatically.
 */

import dotenv from 'dotenv';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.mcp') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

import { getAdobeAccessToken, loadAdobeCredentials } from './imsAuth.mjs';

const require = createRequire(import.meta.url);
const functionsDir = join(__dirname, '../../../functions');

const sandboxesList = require(join(functionsDir, 'sandboxesList.js'));
const joLookups = require(join(functionsDir, 'joLookups.js'));
const tagsReactorService = require(join(functionsDir, 'tagsReactorService.js'));
const eventEdgeService = require(join(functionsDir, 'eventEdgeService.js'));

const BASE_PLATFORM = 'https://platform.adobe.io';

let credsCache = null;
function creds() {
  if (!credsCache) credsCache = loadAdobeCredentials();
  return credsCache;
}

async function authBundle() {
  const c = creds();
  const token = await getAdobeAccessToken(c);
  return { token, clientId: c.clientId, orgId: c.orgId, defaultSandbox: c.defaultSandbox };
}

function sandboxOf(input) {
  const s = input?.sandbox;
  if (s != null && String(s).trim()) return String(s).trim();
  return creds().defaultSandbox;
}

/** Generic platform.adobe.io request — mirrors functions aepProxy core behavior. */
async function aepPlatformRequest({
  method,
  path,
  params,
  json,
  sandbox,
  platform_headers: platformHeaders,
}) {
  const { token, clientId, orgId } = await authBundle();
  const m = String(method || 'GET').toUpperCase();
  const p = String(path || '');
  if (!p.startsWith('/')) {
    throw new Error('path must start with /');
  }

  const qs = new URLSearchParams();
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
      else qs.append(k, String(v));
    }
  }
  let url = `${BASE_PLATFORM.replace(/\/$/, '')}${p}`;
  const q = qs.toString();
  if (q) url += (url.includes('?') ? '&' : '?') + q;

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    Accept: 'application/json',
  };
  const sb = sandbox != null && String(sandbox).trim()
    ? String(sandbox).trim()
    : creds().defaultSandbox;
  headers['x-sandbox-name'] = sb;

  const allowed = new Set(['x-schema-id', 'accept', 'content-type', 'if-match', 'if-none-match']);
  if (platformHeaders && typeof platformHeaders === 'object') {
    for (const [k, v] of Object.entries(platformHeaders)) {
      if (v == null || String(v).trim() === '') continue;
      if (!allowed.has(k.toLowerCase())) continue;
      headers[k] = String(v);
    }
  }

  if (['POST', 'PUT', 'PATCH'].includes(m)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const init = { method: m, headers };
  if (['POST', 'PUT', 'PATCH'].includes(m) && json !== undefined && json !== null) {
    init.body = JSON.stringify(json);
  }

  const upstream = await fetch(url, init);
  const ct = upstream.headers.get('Content-Type') || '';
  let platformResponse;
  if (ct.toLowerCase().includes('json')) {
    try {
      platformResponse = await upstream.json();
    } catch {
      platformResponse = { raw: await upstream.text() };
    }
  } else {
    const text = await upstream.text();
    platformResponse = { raw: text.slice(0, 50000) };
  }

  return {
    status: upstream.status,
    request_url: url,
    platform_response: platformResponse,
  };
}

function jsonResult(obj) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
  };
}

function toolError(message, detail) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, detail }, null, 2) }],
    isError: true,
  };
}

const mcpServer = new McpServer({
  name: 'aep-lab-adobe',
  version: '1.0.0',
});

mcpServer.registerTool(
  'aep_platform_request',
  {
    title: 'AEP platform request',
    description:
      'Authenticated GET/POST/PATCH/PUT/DELETE to platform.adobe.io. Pass path (e.g. /data/foundation/sandbox-management/sandboxes). Same pattern as the lab /api/aep proxy.',
    inputSchema: {
      method: z.string().optional().describe('HTTP method (default GET)'),
      path: z.string().describe('Path starting with /'),
      params: z.record(z.unknown()).optional().describe('Query string key/value map'),
      json: z.unknown().optional().describe('JSON body for POST/PUT/PATCH'),
      sandbox: z.string().optional().describe('x-sandbox-name override'),
      platform_headers: z.record(z.string()).optional().describe('Allowlisted: x-schema-id, accept, content-type, if-match, if-none-match'),
    },
  },
  async (input) => {
    try {
      const out = await aepPlatformRequest(input);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'sandboxes_list',
  {
    title: 'List active sandboxes',
    description: 'Returns active sandboxes (name, title, type) via sandbox-management API.',
    inputSchema: {},
  },
  async () => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const list = await sandboxesList.listActiveSandboxes(token, clientId, orgId);
      return jsonResult({ ok: true, sandboxes: list });
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'journey_resolve_name',
  {
    title: 'Resolve AJO journey display name',
    description: 'Looks up journey id/version via joLookups.getJourneyNameById.',
    inputSchema: {
      id: z.string().describe('Journey id or version id'),
      sandbox: z.string().optional(),
    },
  },
  async ({ id, sandbox }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const name = await joLookups.getJourneyNameById(id, sandboxOf({ sandbox }), token, clientId, orgId);
      return jsonResult({ ok: true, id, name });
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'campaign_resolve_name',
  {
    title: 'Resolve campaign display name',
    description: 'Looks up campaign id via joLookups.getCampaignNameById (journey.adobe.io campaign API).',
    inputSchema: {
      id: z.string().describe('Campaign id'),
      sandbox: z.string().optional(),
    },
  },
  async ({ id, sandbox }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const name = await joLookups.getCampaignNameById(id, sandboxOf({ sandbox }), token, clientId, orgId);
      return jsonResult({ ok: true, id, name });
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'decisioning_resolve_treatment_name',
  {
    title: 'Resolve decisioning offer-item name',
    description: 'Looks up DPS offer-item / treatment id via joLookups.getTreatmentNameById.',
    inputSchema: {
      id: z.string().describe('Offer item / decision item id'),
      sandbox: z.string().optional(),
    },
  },
  async ({ id, sandbox }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const name = await joLookups.getTreatmentNameById(id, sandboxOf({ sandbox }), token, clientId, orgId);
      return jsonResult({ ok: true, id, name });
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'tags_probe_access',
  {
    title: 'Probe Tags (Reactor) API access',
    description: 'Calls tagsReactorService.probeTagsApiAccess — verifies Launch/Reactor scopes.',
    inputSchema: {},
  },
  async () => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await tagsReactorService.probeTagsApiAccess(token, clientId, orgId);
      return jsonResult(result);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'tags_list_companies',
  {
    title: 'Tags: list companies',
    description: 'reactor.adobe.io companies list.',
    inputSchema: {},
  },
  async () => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await tagsReactorService.listCompanies(token, clientId, orgId);
      return jsonResult(result);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'tags_list_properties',
  {
    title: 'Tags: list properties for company',
    description: 'reactor.adobe.io properties under a company.',
    inputSchema: {
      company_id: z.string().describe('Tags company id'),
    },
  },
  async ({ company_id }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await tagsReactorService.listProperties(token, clientId, orgId, company_id);
      return jsonResult(result);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'tags_list_rules',
  {
    title: 'Tags: list rules',
    description: 'Rules for a property.',
    inputSchema: {
      property_id: z.string(),
    },
  },
  async ({ property_id }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await tagsReactorService.listRules(token, clientId, orgId, property_id);
      return jsonResult(result);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'tags_list_environments',
  {
    title: 'Tags: list environments',
    description: 'Environments for a property (dev/staging hosts, library bindings).',
    inputSchema: {
      property_id: z.string(),
    },
  },
  async ({ property_id }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await tagsReactorService.listEnvironments(token, clientId, orgId, property_id);
      return jsonResult(result);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'tags_list_extensions',
  {
    title: 'Tags: list extensions',
    description: 'Extensions installed on a property.',
    inputSchema: {
      property_id: z.string(),
    },
  },
  async ({ property_id }) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await tagsReactorService.listExtensions(token, clientId, orgId, property_id);
      return jsonResult(result);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'edge_list_datastreams',
  {
    title: 'Edge: list datastreams',
    description: 'Lists datastreams via edge.adobe.io discovery (eventEdgeService.listDatastreams).',
    inputSchema: {},
  },
  async () => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const result = await eventEdgeService.listDatastreams(token, clientId, orgId);
      return jsonResult(
        Array.isArray(result) ? { ok: true, items: result } : { ok: true, ...result },
      );
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'edge_send_experience_event',
  {
    title: 'Edge: send interact experience event',
    description:
      'POST to Edge interact (server.adobedc.net/ee/v2/interact). Pass datastream_id and fields consumed by eventEdgeService.buildXdm (email, ecid, eventType, viewName, viewUrl, channel, public, …) or raw_payload for full body.',
    inputSchema: {
      datastream_id: z.string(),
      sandbox: z.string().optional().describe('Not sent to interact; reserved for future use'),
      email: z.string().optional(),
      ecid: z.string().optional(),
      event_type: z.string().optional(),
      view_name: z.string().optional(),
      view_url: z.string().optional(),
      channel: z.string().optional(),
      public: z.record(z.unknown()).optional(),
      orchestration_event_id: z.string().optional(),
      raw_payload: z.unknown().optional().describe('If set, sent as POST body as-is (skip buildXdm)'),
    },
  },
  async (input) => {
    try {
      const { token, clientId, orgId } = await authBundle();
      const datastreamId = String(input.datastream_id || '').trim();
      if (!datastreamId) throw new Error('datastream_id is required');

      let payload;
      if (input.raw_payload != null && typeof input.raw_payload === 'object') {
        payload = input.raw_payload;
      } else {
        const body = {
          email: input.email,
          ecid: input.ecid,
          eventType: input.event_type,
          viewName: input.view_name,
          viewUrl: input.view_url,
          channel: input.channel,
          public: input.public,
          eventID: input.orchestration_event_id,
        };
        const xdm = eventEdgeService.buildXdm(body);
        payload = { event: { xdm } };
      }

      const result = await eventEdgeService.sendEdgeEvent(token, clientId, orgId, datastreamId, payload);
      return jsonResult({ ok: true, ...result, sent_payload: payload });
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

async function main() {
  try {
    loadAdobeCredentials();
  } catch (e) {
    console.error('[aep-lab-adobe-mcp]', e.message || e);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error('[aep-lab-adobe-mcp]', error);
  process.exit(1);
});
