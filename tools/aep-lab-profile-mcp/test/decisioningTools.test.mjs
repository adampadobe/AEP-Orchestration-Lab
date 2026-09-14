import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerDecisioningTools } from '../src/tools/decisioningTools.mjs';

function registerAll() {
  const tools = new Map();
  registerDecisioningTools({
    registerTool(name, definition, handler) {
      tools.set(name, { definition, handler });
    },
  });
  return tools;
}

describe('decisioning MCP tools', () => {
  it('registers the write, delete, and bulk tools alongside the existing read-only ones', () => {
    const tools = registerAll();
    for (const name of [
      'lab_decisioning_catalog_list',
      'lab_decisioning_catalog_get',
      'lab_decisioning_catalog_change_preview',
      'lab_decisioning_catalog_change_apply',
      'lab_decisioning_catalog_delete_audit',
      'lab_decisioning_catalog_delete_apply',
      'lab_decisioning_catalog_bulk_apply',
    ]) {
      assert.ok(tools.has(name), `expected ${name} to be registered`);
    }
  });

  it('list and get accept the three new DPS resource types', () => {
    const tools = registerAll();
    for (const name of ['lab_decisioning_catalog_list', 'lab_decisioning_catalog_get']) {
      const entityType = tools.get(name).definition.inputSchema.entity_type;
      for (const value of ['offer-rules', 'ranking-formulas', 'placements']) {
        assert.doesNotThrow(() => entityType.parse(value), `${name} should accept entity_type=${value}`);
      }
    }
  });

  it('frames delete_apply as destructive and irreversible, matching lab_audience_delete tone', () => {
    const tools = registerAll();
    assert.match(tools.get('lab_decisioning_catalog_delete_audit').definition.description, /explicit confirmation/i);
    assert.match(tools.get('lab_decisioning_catalog_delete_apply').definition.description, /irreversible/i);
    assert.match(tools.get('lab_decisioning_catalog_delete_apply').definition.description, /never infer confirmation/i);
  });

  it('change_apply and delete_apply require a 64-char preflight_id and non-empty confirmation', () => {
    const tools = registerAll();
    for (const name of ['lab_decisioning_catalog_change_apply', 'lab_decisioning_catalog_delete_apply']) {
      const schema = tools.get(name).definition.inputSchema;
      assert.throws(() => schema.preflight_id.parse('too-short'));
      assert.doesNotThrow(() => schema.preflight_id.parse('a'.repeat(64)));
      assert.throws(() => schema.confirmation.parse(''));
    }
  });

  it('bulk_apply caps items at 200 and requires explicit confirmed:true', () => {
    const tools = registerAll();
    const schema = tools.get('lab_decisioning_catalog_bulk_apply').definition.inputSchema;
    assert.throws(() => schema.items.parse([]));
    assert.doesNotThrow(() => schema.items.parse([{ item: { name: 'a' } }]));
    assert.throws(() => schema.items.parse(new Array(201).fill({ item: { name: 'a' } })));
    assert.throws(() => schema.confirmed.parse(false));
    assert.doesNotThrow(() => schema.confirmed.parse(true));
  });
});
