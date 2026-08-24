import * as z from 'zod';
import {
  homeCommandGetState,
  homeCommandAddCustomer,
  homeCommandUpdateCustomer,
  homeCommandDeleteCustomer,
  homeCommandAddTask,
  homeCommandUpdateTask,
  homeCommandDeleteTask,
  homeCommandAddMeeting,
  homeCommandUpdateMeeting,
  homeCommandDeleteMeeting,
} from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId, getPrincipalAccess } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

const USER_KEY_REQUIRED =
  'Command Centre tools require a user-generated MCP API key (Profile Viewer → MCP servers) that maps to your Firebase uid. ' +
  'Shared ops keys cannot resolve per-user Command Centre data.';

/**
 * Command Centre data is scoped per Firebase uid (like Snowflake credentials),
 * not per AEP sandbox — an ops env key has no uid mapping to resolve.
 */
function requireUserMcpKeyForCommandCentre() {
  const access = getPrincipalAccess();
  if (!access || access.source === 'env') {
    return {
      ok: false,
      message: USER_KEY_REQUIRED,
      coworkerPrompt:
        'Generate an MCP key in Profile Viewer → MCP servers, connect Coworker with that key, then retry this Command Centre tool.',
      code: 'MCP_USER_KEY_REQUIRED',
    };
  }
  return { ok: true };
}

const CUSTOMER_STATUSES = ['On track', 'At risk', 'Delayed', 'Discovery', 'UAT', 'Stalled', 'Onboarding'];

function audit(tool, result, extra = {}) {
  writeAuditLog({
    keyId: getRequestKeyId(),
    tool,
    result: result.ok ? 'ok' : 'error',
    ...extra,
  });
}

export function registerCommandCentreTools(server) {
  server.registerTool('lab_command_centre_list', {
    title: 'List your Command Centre engagements',
    description:
      'Returns all of your current customer/deal engagements, open and completed tasks, and meetings from your own ' +
      'AEP Orchestration Lab Solutions Consultant Command Centre home page. Read-only.',
    inputSchema: {},
  }, async () => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandGetState();
    audit('lab_command_centre_list', result, { durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_add_customer', {
    title: 'Add a customer engagement to your Command Centre',
    description: 'Adds a new customer/deal engagement to your own Command Centre home page.',
    inputSchema: {
      name: z.string().min(1).describe('Customer/account name'),
      notes: z.string().max(4000).optional().describe('Free-text notes'),
      status: z.enum(CUSTOMER_STATUSES).optional().describe('Defaults to Discovery'),
      nextAction: z.string().max(500).optional().describe('What needs to happen next'),
      eta: z.string().optional().describe('YYYY-MM-DD'),
      drLink: z.string().optional().describe('Deal registration / DR id'),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandAddCustomer(params);
    audit('lab_command_centre_add_customer', result, { durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_update_customer', {
    title: 'Update a Command Centre customer engagement',
    description: 'Updates fields on an existing customer engagement by id (from lab_command_centre_list).',
    inputSchema: {
      id: z.string().min(1).describe('Customer id, e.g. cust-xxxxx, from lab_command_centre_list'),
      notes: z.string().max(4000).optional(),
      status: z.enum(CUSTOMER_STATUSES).optional(),
      nextAction: z.string().max(500).optional(),
      eta: z.string().optional().describe('YYYY-MM-DD'),
      drLink: z.string().optional(),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandUpdateCustomer(params);
    audit('lab_command_centre_update_customer', result, { identifier: params.id, durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_delete_customer', {
    title: 'Remove a Command Centre customer engagement',
    description: 'Deletes a customer engagement by id. Irreversible.',
    inputSchema: {
      id: z.string().min(1).describe('Customer id, e.g. cust-xxxxx, from lab_command_centre_list'),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandDeleteCustomer(params);
    audit('lab_command_centre_delete_customer', result, { identifier: params.id, durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_add_task', {
    title: 'Add a task to your Command Centre',
    description: 'Adds a task, optionally linked to a customer by name.',
    inputSchema: {
      title: z.string().min(1).describe('Task title'),
      customerName: z.string().optional(),
      due: z.string().optional().describe('YYYY-MM-DD'),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandAddTask(params);
    audit('lab_command_centre_add_task', result, { durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_update_task', {
    title: 'Update a Command Centre task',
    description: 'Updates a task by id — e.g. mark it completed, change its title or due date.',
    inputSchema: {
      id: z.string().min(1).describe('Task id, e.g. task-xxxxx, from lab_command_centre_list'),
      title: z.string().optional(),
      customerName: z.string().optional(),
      due: z.string().optional().describe('YYYY-MM-DD'),
      completed: z.boolean().optional(),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandUpdateTask(params);
    audit('lab_command_centre_update_task', result, { identifier: params.id, durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_delete_task', {
    title: 'Remove a Command Centre task',
    description: 'Deletes a task by id. Irreversible.',
    inputSchema: {
      id: z.string().min(1).describe('Task id, e.g. task-xxxxx, from lab_command_centre_list'),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandDeleteTask(params);
    audit('lab_command_centre_delete_task', result, { identifier: params.id, durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_add_meeting', {
    title: 'Add a meeting to your Command Centre',
    description: 'Adds an upcoming meeting, optionally linked to a customer by name.',
    inputSchema: {
      title: z.string().min(1).describe('Meeting title'),
      customerName: z.string().optional(),
      at: z.string().optional().describe('YYYY-MM-DDTHH:MM:SS'),
      context: z.string().optional().describe('e.g. "CPO + Legal · Zoom"'),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandAddMeeting(params);
    audit('lab_command_centre_add_meeting', result, { durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_update_meeting', {
    title: 'Update a Command Centre meeting',
    description: 'Updates a meeting by id.',
    inputSchema: {
      id: z.string().min(1).describe('Meeting id, e.g. mtg-xxxxx, from lab_command_centre_list'),
      title: z.string().optional(),
      customerName: z.string().optional(),
      at: z.string().optional().describe('YYYY-MM-DDTHH:MM:SS'),
      context: z.string().optional(),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandUpdateMeeting(params);
    audit('lab_command_centre_update_meeting', result, { identifier: params.id, durationMs: Date.now() - started });
    return fromLabApi(result);
  });

  server.registerTool('lab_command_centre_delete_meeting', {
    title: 'Remove a Command Centre meeting',
    description: 'Deletes a meeting by id. Irreversible.',
    inputSchema: {
      id: z.string().min(1).describe('Meeting id, e.g. mtg-xxxxx, from lab_command_centre_list'),
    },
  }, async (params) => {
    const started = Date.now();
    const userKey = requireUserMcpKeyForCommandCentre();
    if (!userKey.ok) return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
    const result = await homeCommandDeleteMeeting(params);
    audit('lab_command_centre_delete_meeting', result, { identifier: params.id, durationMs: Date.now() - started });
    return fromLabApi(result);
  });
}
