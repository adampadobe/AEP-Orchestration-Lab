/**
 * Streamable HTTP MCP server for AEP Orchestration Lab profile tools.
 *
 * Env: see tools/aep-lab-profile-mcp/.env.mcp.example
 * Local: copy to .env.mcp (gitignored).
 *
 * Endpoints: POST /mcp and focused /mcp/{profile,audiences,decisioning}
 * Health:   GET /health
 */

import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { loadAuthConfig, validateMcpApiKey } from './auth.mjs';
import { getLabApiOrigin } from './labApiClient.mjs';
import { requestContext } from './requestContext.mjs';
import { resolvePrincipalAccess } from './sandboxAllowlist.mjs';
import { registerFrameworkResources } from './resources/frameworkResources.mjs';
import { installToolAnnotations } from './toolAnnotations.mjs';
import {
  registerFocusedAudienceTools,
  registerFocusedDecisioningTools,
  registerFocusedDemoPrepTools,
  registerFocusedProfileTools,
  registerProfileTools,
} from './tools/index.mjs';

const MCP_VERSION = '3.35.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.mcp') });

/** @type {Map<string, { transport: StreamableHTTPServerTransport, endpoint: string }>} */
const transports = new Map();

const ENDPOINTS = [
  {
    path: '/mcp',
    toolset: 'full',
    register: registerProfileTools,
    instructions: 'Complete AEP Orchestration Lab catalog. Prefer a focused endpoint when the client cannot invoke deferred tools.',
  },
  {
    path: '/mcp/profile',
    toolset: 'profile',
    register: registerFocusedProfileTools,
    instructions:
      'Focused profile lifecycle: readiness, create/update/read, governed AEP industry events, and Snowflake dual-load readiness, enrichment, and readback.',
  },
  {
    path: '/mcp/audiences',
    toolset: 'audiences',
    register: registerFocusedAudienceTools,
    instructions: 'Governed audience cleanup: list, audit, exact confirmation, then delete one audience.',
  },
  {
    path: '/mcp/decisioning',
    toolset: 'decisioning',
    register: registerFocusedDecisioningTools,
    instructions: 'Focused decisioning evaluation, response explanation, treatment resolution, and catalog assessment.',
  },
  {
    path: '/mcp/demo-prep',
    toolset: 'demo-prep',
    register: registerFocusedDemoPrepTools,
    instructions:
      'Focused customer demo preparation: resolve or run one brand scrape, preview stable image-hosting slots and governed RTDB changes, obtain explicit confirmation, activate with automatic customer backup, and restore named customers.',
  },
];

export function createMcpServer(endpoint = ENDPOINTS[0]) {
  const server = new McpServer({
    name: 'aep-orchestration-lab-mcp',
    version: MCP_VERSION,
  }, {
    instructions: endpoint.instructions,
  });
  installToolAnnotations(server);
  if (endpoint.toolset === 'full') registerFrameworkResources(server);
  endpoint.register(server);
  return server;
}

function jsonRpcError(res, status, message) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

async function main() {
  let cfg;
  try {
    cfg = loadAuthConfig();
  } catch (err) {
    console.error('[aep-lab-profile-mcp]', err.message || err);
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'aep-lab-profile-mcp',
      version: MCP_VERSION,
      labOrigin: getLabApiOrigin(),
      allowedSandboxes: cfg.allowedSandboxes,
      mcpEndpoints: ENDPOINTS.map(({ path, toolset }) => ({ path, toolset })),
      note: 'Per-principal allowlist may override via Firestore mcpSandboxAllowlist/{keyId}',
    });
  });

  function registerEndpoint(endpoint) {
    app.post(endpoint.path, async (req, res) => {
      const startedAt = Date.now();
      const rpcMethod = String(req.body?.method || 'unknown');
      const toolName = rpcMethod === 'tools/call' ? String(req.body?.params?.name || '') : undefined;
      res.once('finish', () => {
        console.log(JSON.stringify({
          type: 'aep-lab-mcp-request',
          endpoint: endpoint.path,
          toolset: endpoint.toolset,
          method: rpcMethod,
          ...(toolName ? { tool: toolName } : {}),
          httpStatus: res.statusCode,
          durationMs: Date.now() - startedAt,
        }));
      });

      const auth = await validateMcpApiKey(req);
      if (!auth.ok) {
        jsonRpcError(res, auth.status, auth.message);
        return;
      }

      const mcpKey = String(req.headers['x-aep-lab-mcp-key'] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
      const principalAccess = await resolvePrincipalAccess(auth.keyId, { source: auth.source });

      await requestContext.run({ keyId: auth.keyId, principalAccess, mcpApiKey: mcpKey }, async () => {
        try {
          const sessionId = req.headers['mcp-session-id'];
          let transport;

          if (sessionId && transports.has(sessionId)) {
            const active = transports.get(sessionId);
            if (active.endpoint !== endpoint.path) {
              jsonRpcError(res, 400, `MCP session belongs to ${active.endpoint}, not ${endpoint.path}.`);
              return;
            }
            transport = active.transport;
          } else if (!sessionId && isInitializeRequest(req.body)) {
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              enableJsonResponse: true,
              onsessioninitialized: (id) => {
                transports.set(id, { transport, endpoint: endpoint.path });
              },
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid) transports.delete(sid);
            };

            const server = createMcpServer(endpoint);
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
          } else {
            jsonRpcError(res, 400, 'Bad Request: no valid MCP session. Send initialize without mcp-session-id.');
            return;
          }

          await transport.handleRequest(req, res, req.body);
        } catch (err) {
          console.error('[aep-lab-profile-mcp] MCP handler error:', err);
          if (!res.headersSent) jsonRpcError(res, 500, 'Internal server error');
        }
      });
    });

    app.get(endpoint.path, (_req, res) => {
      res.status(405).set('Allow', 'POST').json({
        error: `Use POST ${endpoint.path} for Streamable HTTP (JSON mode).`,
      });
    });

    app.delete(endpoint.path, async (req, res) => {
      const auth = await validateMcpApiKey(req);
      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.message });
        return;
      }
      const sessionId = req.headers['mcp-session-id'];
      const active = sessionId ? transports.get(sessionId) : undefined;
      if (active?.endpoint === endpoint.path) {
        await active.transport.close();
        transports.delete(sessionId);
        res.status(200).json({ ok: true });
        return;
      }
      res.status(404).json({ error: 'Session not found' });
    });
  }

  for (const endpoint of ENDPOINTS) registerEndpoint(endpoint);

  const host = String(process.env.HOST || '0.0.0.0').trim();
  const port = Number(process.env.PORT || 8080);

  app.listen(port, host, () => {
    console.log(
      JSON.stringify({
        type: 'aep-lab-profile-mcp-start',
        version: MCP_VERSION,
        host,
        port,
        labOrigin: getLabApiOrigin(),
        allowedSandboxes: cfg.allowedSandboxes,
        mcpEndpoints: ENDPOINTS.map(({ path, toolset }) => ({
          toolset,
          url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${path}`,
        })),
      }),
    );
  });
}

main().catch((err) => {
  console.error('[aep-lab-profile-mcp]', err);
  process.exit(1);
});
