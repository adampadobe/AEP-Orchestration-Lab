import * as z from 'zod';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { getMcpWorkflow, listMcpContexts, MCP_WORKFLOWS, recommendMcpContexts } from '../framework/mcpContextGuide.mjs';
import { jsonResult } from './helpers.mjs';

function audit(tool) {
  writeAuditLog({ keyId: getRequestKeyId(), tool, result: 'ok' });
}
export function registerMcpGuideTools(mcpServer) {
  mcpServer.registerTool('lab_mcp_contexts', {
    title: 'List AEP Lab MCP contexts (read-only)',
    description: 'Returns the canonical Lab and Adobe Coworker MCP capability directory with copy-ready names, URLs, access method, scope, and safety posture. Use this when deciding which configured MCP context should handle a task.',
    inputSchema: { include_adobe: z.boolean().optional().default(true) },
  }, async ({ include_adobe = true }) => {
    audit('lab_mcp_contexts');
    return jsonResult({
      ok: true,
      contexts: listMcpContexts({ includeAdobe: include_adobe }),
      note: 'All aep-lab-* contexts are views of one Cloud Run service and reuse the same sandbox-scoped X-AEP-Lab-Mcp-Key. Adobe-hosted contexts use Adobe sign-in.',
    });
  });

  mcpServer.registerTool('lab_mcp_recommend_context', {
    title: 'Recommend an MCP context (read-only)',
    description: 'Maps a natural-language goal to the smallest useful configured AEP Lab or Adobe MCP context. Returns copy-ready configuration guidance and clearly states that the host must already have that server connected.',
    inputSchema: {
      goal: z.string().min(3).max(1000).describe('The task the colleague wants to complete.'),
      sandbox: z.string().trim().min(1).max(80).optional().describe('Optional sandbox to include in the recommended prompt.'),
    },
  }, async ({ goal, sandbox }) => {
    audit('lab_mcp_recommend_context');
    const recommendation = recommendMcpContexts(goal);
    if (sandbox) recommendation.suggestedPrompt += ` Use sandbox ${sandbox}.`;
    return jsonResult({ ok: true, ...recommendation });
  });

  mcpServer.registerTool('lab_mcp_workflow', {
    title: 'Get a cross-context MCP workflow (read-only)',
    description: 'Returns a read-only handoff plan across focused MCP contexts. It never proxies or executes tools. Call without workflow_id to list available workflow IDs.',
    inputSchema: {
      workflow_id: z.enum(Object.keys(MCP_WORKFLOWS)).optional(),
      sandbox: z.string().trim().min(1).max(80).optional(),
    },
  }, async ({ workflow_id, sandbox }) => {
    audit('lab_mcp_workflow');
    if (!workflow_id) {
      return jsonResult({ ok: true, workflows: Object.entries(MCP_WORKFLOWS).map(([id, workflow]) => ({ id, title: workflow.title, contexts: workflow.contexts })) });
    }
    const workflow = getMcpWorkflow(workflow_id);
    return jsonResult({
      ok: true,
      workflowId: workflow_id,
      ...workflow,
      ...(sandbox ? { sandbox } : {}),
      contextDetails: workflow.contexts.map((id) => listMcpContexts().find((context) => context.id === id)),
      hostLimitation: 'The Coworker host must have each context configured; this guide provides the plan and does not invoke tools across MCP servers.',
    });
  });
}
