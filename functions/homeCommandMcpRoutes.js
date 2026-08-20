/**
 * /api/home-command/mcp/** — lets an external MCP client (any LLM, via the
 * standalone tools/aep-lab-command-centre-mcp server) read and fully manage
 * the caller's own Command Centre data (customers, tasks, meetings) outside
 * the browser. Dual-authed (Bearer Firebase ID token OR X-AEP-Lab-Mcp-Key),
 * same pattern as functions/snowflakePrincipalAuth.js.
 */

function pathAfterPrefix(req) {
  const full = String(req.originalUrl || req.url || req.path || '').split('?')[0].replace(/\/+$/, '');
  const idx = full.indexOf('/mcp/');
  return idx === -1 ? '' : full.slice(idx + '/mcp/'.length);
}

/**
 * @param {object} deps
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerHomeCommandMcpRoutes(deps) {
  const { onRequest, HOME_COMMAND_MCP_FN_OPTS, setCors, homeCommandMcpAuth, mcpApiKeyStore, homeCommandMcpStore } = deps;

  async function resolvePrincipal(req, res) {
    const principal = await homeCommandMcpAuth.resolveHomeCommandPrincipal(req, { mcpApiKeyStore });
    if (!principal.ok) {
      res.status(principal.status).json(principal.body);
      return null;
    }
    return principal;
  }

  async function handler(req, res) {
    setCors(res, 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const principal = await resolvePrincipal(req, res);
    if (!principal) return;
    const slug = principal.workspaceSlug;
    if (!slug) {
      res.status(422).json({ ok: false, error: 'Could not resolve your Command Centre workspace.' });
      return;
    }

    const sub = pathAfterPrefix(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
      if (sub === 'state' && req.method === 'GET') {
        const state = await homeCommandMcpStore.getState(slug);
        res.status(200).json({ ok: true, workspaceSlug: slug, ...state });
        return;
      }

      if (sub === 'customers' && req.method === 'POST') {
        const row = await homeCommandMcpStore.addCustomer(slug, body);
        res.status(201).json({ ok: true, customer: row });
        return;
      }

      const customerMatch = /^customers\/([^/]+)$/.exec(sub);
      if (customerMatch && req.method === 'PATCH') {
        const row = await homeCommandMcpStore.updateCustomer(slug, decodeURIComponent(customerMatch[1]), body);
        if (!row) { res.status(404).json({ ok: false, error: 'Customer not found' }); return; }
        res.status(200).json({ ok: true, customer: row });
        return;
      }
      if (customerMatch && req.method === 'DELETE') {
        const deleted = await homeCommandMcpStore.deleteCustomer(slug, decodeURIComponent(customerMatch[1]));
        if (!deleted) { res.status(404).json({ ok: false, error: 'Customer not found' }); return; }
        res.status(200).json({ ok: true });
        return;
      }

      if (sub === 'tasks' && req.method === 'POST') {
        const row = await homeCommandMcpStore.addTask(slug, body);
        res.status(201).json({ ok: true, task: row });
        return;
      }
      const taskMatch = /^tasks\/([^/]+)$/.exec(sub);
      if (taskMatch && req.method === 'PATCH') {
        const row = await homeCommandMcpStore.updateTask(slug, decodeURIComponent(taskMatch[1]), body);
        if (!row) { res.status(404).json({ ok: false, error: 'Task not found' }); return; }
        res.status(200).json({ ok: true, task: row });
        return;
      }
      if (taskMatch && req.method === 'DELETE') {
        const deleted = await homeCommandMcpStore.deleteTask(slug, decodeURIComponent(taskMatch[1]));
        if (!deleted) { res.status(404).json({ ok: false, error: 'Task not found' }); return; }
        res.status(200).json({ ok: true });
        return;
      }

      if (sub === 'meetings' && req.method === 'POST') {
        const row = await homeCommandMcpStore.addMeeting(slug, body);
        res.status(201).json({ ok: true, meeting: row });
        return;
      }
      const meetingMatch = /^meetings\/([^/]+)$/.exec(sub);
      if (meetingMatch && req.method === 'PATCH') {
        const row = await homeCommandMcpStore.updateMeeting(slug, decodeURIComponent(meetingMatch[1]), body);
        if (!row) { res.status(404).json({ ok: false, error: 'Meeting not found' }); return; }
        res.status(200).json({ ok: true, meeting: row });
        return;
      }
      if (meetingMatch && req.method === 'DELETE') {
        const deleted = await homeCommandMcpStore.deleteMeeting(slug, decodeURIComponent(meetingMatch[1]));
        if (!deleted) { res.status(404).json({ ok: false, error: 'Meeting not found' }); return; }
        res.status(200).json({ ok: true });
        return;
      }

      res.status(404).json({ ok: false, error: 'Unknown Command Centre MCP route: ' + req.method + ' ' + sub });
    } catch (e) {
      console.error('[homeCommandMcp]', String((e && e.message) || e));
      res.status(400).json({ ok: false, error: String((e && e.message) || e) });
    }
  }

  return {
    homeCommandMcp: onRequest(HOME_COMMAND_MCP_FN_OPTS, handler),
  };
}

module.exports = { registerHomeCommandMcpRoutes };
