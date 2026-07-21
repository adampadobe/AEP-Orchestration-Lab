/**
 * Streamable HTTP MCP server for AEP Orchestration Lab profile tools.
 *
 * Env: see tools/aep-lab-profile-mcp/.env.mcp.example
 * Local: copy to .env.mcp (gitignored).
 *
 * Endpoint: POST /mcp (Streamable HTTP, JSON response mode)
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
import { registerProfileTools } from './tools/index.mjs';

const MCP_VERSION = '3.21.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.mcp') });

/** @type {Record<string, StreamableHTTPServerTransport>} */
const transports = {};

function createMcpServer() {
  const server = new McpServer({
    name: 'aep-orchestration-lab-mcp',
    version: MCP_VERSION,
  });
  registerFrameworkResources(server);
  registerProfileTools(server);
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
      note: 'Per-principal allowlist may override via Firestore mcpSandboxAllowlist/{keyId}',
    });
  });

  app.post('/mcp', async (req, res) => {
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

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (id) => {
              transports[id] = transport;
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              delete transports[sid];
            }
          };

          const server = createMcpServer();
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
        if (!res.headersSent) {
          jsonRpcError(res, 500, 'Internal server error');
        }
      }
    });
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'Use POST /mcp for Streamable HTTP (JSON mode).' });
  });

  app.delete('/mcp', async (req, res) => {
    const auth = await validateMcpApiKey(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.message });
      return;
    }
    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId ? transports[sessionId] : undefined;
    if (transport) {
      await transport.close();
      delete transports[sessionId];
      res.status(200).json({ ok: true });
      return;
    }
    res.status(404).json({ error: 'Session not found' });
  });

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
        mcpEndpoint: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/mcp`,
      }),
    );
  });
}

main().catch((err) => {
  console.error('[aep-lab-profile-mcp]', err);
  process.exit(1);
});
