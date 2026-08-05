import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerAudienceTools } from '../src/tools/audienceTools.mjs';

describe('audience MCP tools', () => {
  it('registers separate list, audit, and destructive delete tools', () => {
    const tools = new Map();
    registerAudienceTools({
      registerTool(name, definition, handler) {
        tools.set(name, { definition, handler });
      },
    });
    assert.deepEqual([...tools.keys()], ['lab_audience_list', 'lab_audience_audit', 'lab_audience_delete']);
    assert.match(tools.get('lab_audience_list').definition.description, /never deletes/i);
    assert.match(tools.get('lab_audience_audit').definition.description, /explicit confirmation/i);
    assert.match(tools.get('lab_audience_delete').definition.description, /irreversible/i);
    assert.equal(typeof tools.get('lab_audience_delete').handler, 'function');
  });
});
