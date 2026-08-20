/**
 * Stdio MCP server — read/update the caller's own AEP Orchestration Lab
 * Solutions Consultant Command Centre (customer engagements, tasks,
 * meetings) from any MCP-compatible LLM client, without opening the browser.
 *
 * Calls the deployed lab's /api/home-command/mcp/* Cloud Function, which is
 * dual-authed: this server sends the MCP API key header, so requests
 * resolve to whichever user generated that key (functions/homeCommandMcpAuth.js).
 *
 * Env (tools/aep-lab-command-centre-mcp/.env.mcp, gitignored):
 *   AEP_LAB_MCP_API_KEY   — required. Generate/rotate at Profile Viewer → MCP servers,
 *                           or via POST https://aep-orchestration-lab.web.app/api/lab/mcp-keys
 *                           (requires signing in first).
 *   AEP_LAB_API_ORIGIN    — optional. Defaults to the deployed lab's origin.
 */

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.mcp') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

const MCP_KEY_HEADER = 'x-aep-lab-mcp-key';
const DEFAULT_ORIGIN = 'https://aep-orchestration-lab.web.app';

function apiKey() {
  const key = String(process.env.AEP_LAB_MCP_API_KEY || '').trim();
  if (!key) {
    throw new Error(
      'AEP_LAB_MCP_API_KEY is not set. Generate one at Profile Viewer → MCP servers, then add it to ' +
        'tools/aep-lab-command-centre-mcp/.env.mcp',
    );
  }
  return key;
}

function apiOrigin() {
  return String(process.env.AEP_LAB_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
}

async function callHomeCommand(method, path, body) {
  const url = `${apiOrigin()}/api/home-command/mcp/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      [MCP_KEY_HEADER]: apiKey(),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

function jsonResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function toolError(message, detail) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, detail }, null, 2) }],
    isError: true,
  };
}

const CUSTOMER_STATUSES = ['On track', 'At risk', 'Delayed', 'Discovery', 'UAT', 'Stalled', 'Onboarding'];

const mcpServer = new McpServer({
  name: 'aep-lab-command-centre',
  version: '1.0.0',
});

mcpServer.registerTool(
  'list_command_centre',
  {
    title: 'List Command Centre engagements',
    description:
      'Returns all of your current customer engagements, open/completed tasks, and meetings from your AEP Orchestration Lab Command Centre.',
    inputSchema: {},
  },
  async () => {
    try {
      const out = await callHomeCommand('GET', 'state');
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'add_customer_engagement',
  {
    title: 'Add a customer engagement',
    description: 'Adds a new customer/deal engagement to your Command Centre.',
    inputSchema: {
      name: z.string().describe('Customer/account name'),
      notes: z.string().optional().describe('Free-text notes'),
      status: z.enum(CUSTOMER_STATUSES).optional().describe('Defaults to Discovery'),
      nextAction: z.string().optional().describe('What needs to happen next'),
      eta: z.string().optional().describe('YYYY-MM-DD'),
      drLink: z.string().optional().describe('Deal registration / DR id'),
    },
  },
  async (input) => {
    try {
      const out = await callHomeCommand('POST', 'customers', input);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'update_customer_engagement',
  {
    title: 'Update a customer engagement',
    description: 'Updates fields on an existing customer engagement by id (from list_command_centre).',
    inputSchema: {
      id: z.string().describe('Customer id, e.g. cust-xxxxx'),
      notes: z.string().optional(),
      status: z.enum(CUSTOMER_STATUSES).optional(),
      nextAction: z.string().optional(),
      eta: z.string().optional().describe('YYYY-MM-DD'),
      drLink: z.string().optional(),
    },
  },
  async ({ id, ...patch }) => {
    try {
      const out = await callHomeCommand('PATCH', `customers/${encodeURIComponent(id)}`, patch);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'delete_customer_engagement',
  {
    title: 'Remove a customer engagement',
    description: 'Deletes a customer engagement by id.',
    inputSchema: { id: z.string().describe('Customer id, e.g. cust-xxxxx') },
  },
  async ({ id }) => {
    try {
      const out = await callHomeCommand('DELETE', `customers/${encodeURIComponent(id)}`);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'add_task',
  {
    title: 'Add a task',
    description: 'Adds a task to your Command Centre, optionally linked to a customer by name.',
    inputSchema: {
      title: z.string().describe('Task title'),
      customerName: z.string().optional(),
      due: z.string().optional().describe('YYYY-MM-DD'),
    },
  },
  async (input) => {
    try {
      const out = await callHomeCommand('POST', 'tasks', input);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'update_task',
  {
    title: 'Update a task',
    description: 'Updates a task by id — e.g. mark it completed, change its title or due date.',
    inputSchema: {
      id: z.string().describe('Task id, e.g. task-xxxxx'),
      title: z.string().optional(),
      customerName: z.string().optional(),
      due: z.string().optional().describe('YYYY-MM-DD'),
      completed: z.boolean().optional(),
    },
  },
  async ({ id, ...patch }) => {
    try {
      const out = await callHomeCommand('PATCH', `tasks/${encodeURIComponent(id)}`, patch);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'delete_task',
  {
    title: 'Remove a task',
    description: 'Deletes a task by id.',
    inputSchema: { id: z.string().describe('Task id, e.g. task-xxxxx') },
  },
  async ({ id }) => {
    try {
      const out = await callHomeCommand('DELETE', `tasks/${encodeURIComponent(id)}`);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'add_meeting',
  {
    title: 'Add a meeting',
    description: 'Adds an upcoming meeting to your Command Centre, optionally linked to a customer by name.',
    inputSchema: {
      title: z.string().describe('Meeting title'),
      customerName: z.string().optional(),
      at: z.string().optional().describe('YYYY-MM-DDTHH:MM:SS'),
      context: z.string().optional().describe('e.g. "CPO + Legal · Zoom"'),
    },
  },
  async (input) => {
    try {
      const out = await callHomeCommand('POST', 'meetings', input);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'update_meeting',
  {
    title: 'Update a meeting',
    description: 'Updates a meeting by id.',
    inputSchema: {
      id: z.string().describe('Meeting id, e.g. mtg-xxxxx'),
      title: z.string().optional(),
      customerName: z.string().optional(),
      at: z.string().optional().describe('YYYY-MM-DDTHH:MM:SS'),
      context: z.string().optional(),
    },
  },
  async ({ id, ...patch }) => {
    try {
      const out = await callHomeCommand('PATCH', `meetings/${encodeURIComponent(id)}`, patch);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

mcpServer.registerTool(
  'delete_meeting',
  {
    title: 'Remove a meeting',
    description: 'Deletes a meeting by id.',
    inputSchema: { id: z.string().describe('Meeting id, e.g. mtg-xxxxx') },
  },
  async ({ id }) => {
    try {
      const out = await callHomeCommand('DELETE', `meetings/${encodeURIComponent(id)}`);
      return jsonResult(out);
    } catch (e) {
      return toolError(String(e.message || e), null);
    }
  },
);

async function main() {
  try {
    apiKey();
  } catch (e) {
    console.error('[aep-lab-command-centre-mcp]', e.message || e);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error('[aep-lab-command-centre-mcp]', error);
  process.exit(1);
});
