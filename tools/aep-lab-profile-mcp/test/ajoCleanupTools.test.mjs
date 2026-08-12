import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerAjoCleanupTools } from '../src/tools/ajoCleanupTools.mjs';

describe('AJO cleanup MCP tools', () => {
  it('registers separate governed journey and campaign workflows', () => {
    const tools = new Map();
    registerAjoCleanupTools({ registerTool(name, definition, handler) { tools.set(name, { definition, handler }); } });
    assert.deepEqual([...tools.keys()], [
      'lab_ajo_journey_list', 'lab_ajo_journey_audit', 'lab_ajo_journey_delete',
      'lab_ajo_campaign_list', 'lab_ajo_campaign_audit', 'lab_ajo_campaign_delete',
    ]);
    assert.match(tools.get('lab_ajo_journey_list').definition.description, /never changes or deletes/i);
    assert.match(tools.get('lab_ajo_campaign_audit').definition.description, /explicit confirmation/i);
    assert.match(tools.get('lab_ajo_journey_delete').definition.description, /irreversible/i);
  });
});
