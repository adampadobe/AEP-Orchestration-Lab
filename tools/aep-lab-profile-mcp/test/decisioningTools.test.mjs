import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// assertSandboxAllowed (auth.mjs) requires this even for the allowlist-only path our
// tests exercise — mirrors imsAuth.test.mjs's setup.
process.env.AEP_LAB_MCP_API_KEY = process.env.AEP_LAB_MCP_API_KEY || 'server-held-test-key';

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
      'lab_decisioning_capabilities',
      'lab_decisioning_catalog_list',
      'lab_decisioning_catalog_get',
      'lab_decisioning_catalog_change_preview',
      'lab_decisioning_catalog_change_apply',
      'lab_decisioning_catalog_delete_audit',
      'lab_decisioning_catalog_delete_apply',
      'lab_decisioning_catalog_bulk_apply',
      'lab_decisioning_catalog_clone_preview',
      'lab_decisioning_ranking_formula_preview',
      'lab_decisioning_selection_strategy_preview',
      'lab_decisioning_attach_offer_eligibility_preview',
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

  it('bulk_apply items accept a JSON Patch array for update rows', () => {
    const tools = registerAll();
    const schema = tools.get('lab_decisioning_catalog_bulk_apply').definition.inputSchema;
    assert.doesNotThrow(() => schema.items.parse([{ id: 'x', patches: [{ op: 'replace', path: '/name', value: 'y' }] }]));
    assert.throws(() => schema.items.parse([{ id: 'x', patches: [{ op: 'bogus', path: '/name' }] }]));
  });

  it('change_preview/change_apply take item for create and patches for update, and accept a display name for id', async () => {
    const tools = registerAll();
    for (const name of ['lab_decisioning_catalog_change_preview', 'lab_decisioning_catalog_change_apply']) {
      const schema = tools.get(name).definition.inputSchema;
      assert.doesNotThrow(() => schema.item.parse({ name: 'a' }));
      assert.doesNotThrow(() => schema.patches.parse([{ op: 'add', path: '/tags', value: [] }]));
      assert.doesNotThrow(() => schema.id.parse('My Weather Formula'));
    }

    const previewHandler = tools.get('lab_decisioning_catalog_change_preview').handler;
    const missingItem = await previewHandler({ entity_type: 'ranking-formulas', action: 'create' });
    assert.match(JSON.stringify(missingItem), /item is required/);
    const missingPatches = await previewHandler({ entity_type: 'ranking-formulas', action: 'update', id: 'x' });
    assert.match(JSON.stringify(missingPatches), /patches is required/);
  });

  it('get/delete_audit/delete_apply accept a display name, not just an exact id', () => {
    const tools = registerAll();
    for (const name of ['lab_decisioning_catalog_get', 'lab_decisioning_catalog_delete_audit', 'lab_decisioning_catalog_delete_apply']) {
      assert.doesNotThrow(() => tools.get(name).definition.inputSchema.id.parse('My Weather Formula'));
    }
  });

  it('lab_decisioning_capabilities is a local, no-Adobe-call inventory of every entity type and guardrail', async () => {
    const tools = registerAll();
    const result = await tools.get('lab_decisioning_capabilities').handler({});
    const text = JSON.stringify(result);
    for (const entityType of ['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements']) {
      assert.match(text, new RegExp(entityType));
    }
    assert.match(text, /lab_decisioning_catalog_bulk_apply/);
    assert.match(text, /JSON Patch/);
    assert.match(text, /id_or_name_resolution/);
    assert.match(text, /tags/);
    assert.match(text, /known_gaps/);
  });

  it('list/get/change_preview accept tags as a seventh entity type', () => {
    const tools = registerAll();
    for (const name of ['lab_decisioning_catalog_list', 'lab_decisioning_catalog_get', 'lab_decisioning_catalog_change_preview']) {
      assert.doesNotThrow(() => tools.get(name).definition.inputSchema.entity_type.parse('tags'));
    }
  });

  it('selection_strategy_preview refuses to set strategy-level eligibility without explicit user choice', async () => {
    const tools = registerAll();
    const handler = tools.get('lab_decisioning_selection_strategy_preview').handler;
    const refused = await handler({
      sandbox: 'apalmer', name: 'x', collection_id_or_name: 'c1', eligibility_rule_id_or_name: 'r1',
    });
    assert.match(JSON.stringify(refused), /OFFER level.*STRATEGY level/s);
  });

  it('attach_offer_eligibility_preview refuses to set offer-level eligibility without explicit user choice', async () => {
    const tools = registerAll();
    const handler = tools.get('lab_decisioning_attach_offer_eligibility_preview').handler;
    const refused = await handler({
      sandbox: 'apalmer', offer_id_or_name: 'o1', eligibility_rule_id_or_name: 'r1',
    });
    assert.match(JSON.stringify(refused), /OFFER level.*STRATEGY level/s);
  });

  it('attach_offer_eligibility_preview and selection_strategy_preview allow detach/no-eligibility without the guard', () => {
    const tools = registerAll();
    // Omitting eligibility_rule_id_or_name never requires the guard — only setting one does.
    assert.equal(tools.get('lab_decisioning_attach_offer_eligibility_preview').definition.inputSchema.eligibility_rule_id_or_name.isOptional(), true);
    assert.equal(tools.get('lab_decisioning_selection_strategy_preview').definition.inputSchema.eligibility_rule_id_or_name.isOptional(), true);
  });

  it('audience_id_or_name triggers the same offer-vs-strategy ask-first guard as eligibility_rule_id_or_name', async () => {
    const tools = registerAll();
    const offerHandler = tools.get('lab_decisioning_attach_offer_eligibility_preview').handler;
    const offerRefused = await offerHandler({ sandbox: 'apalmer', offer_id_or_name: 'o1', audience_id_or_name: 'VIP' });
    assert.match(JSON.stringify(offerRefused), /OFFER level.*STRATEGY level/s);

    const strategyHandler = tools.get('lab_decisioning_selection_strategy_preview').handler;
    const strategyRefused = await strategyHandler({ sandbox: 'apalmer', name: 'x', collection_id_or_name: 'c1', audience_id_or_name: 'VIP' });
    assert.match(JSON.stringify(strategyRefused), /OFFER level.*STRATEGY level/s);
  });

  it('attach_offer_eligibility_preview and selection_strategy_preview refuse both eligibility_rule_id_or_name and audience_id_or_name at once', async () => {
    const tools = registerAll();
    const offerHandler = tools.get('lab_decisioning_attach_offer_eligibility_preview').handler;
    const offerRefused = await offerHandler({
      sandbox: 'apalmer', offer_id_or_name: 'o1', eligibility_rule_id_or_name: 'r1', audience_id_or_name: 'VIP',
      user_explicitly_chose_offer_level: true,
    });
    assert.match(JSON.stringify(offerRefused), /Specify only one/);

    const strategyHandler = tools.get('lab_decisioning_selection_strategy_preview').handler;
    const strategyRefused = await strategyHandler({
      sandbox: 'apalmer', name: 'x', collection_id_or_name: 'c1', eligibility_rule_id_or_name: 'r1', audience_id_or_name: 'VIP',
      user_explicitly_chose_strategy_level: true,
    });
    assert.match(JSON.stringify(strategyRefused), /Specify only one/);
  });

  it('ranking_formula_preview validates the field required by each formula_type', async () => {
    const tools = registerAll();
    const handler = tools.get('lab_decisioning_ranking_formula_preview').handler;
    const missingField = await handler({ name: 'x', formula_type: 'custom_field' });
    assert.match(JSON.stringify(missingField), /custom_field_name is required/);
    const missingPql = await handler({ name: 'x', formula_type: 'custom_pql' });
    assert.match(JSON.stringify(missingPql), /custom_pql is required/);
  });

  it('clone_preview accepts substitutions as a string record across all seven entity types', () => {
    const tools = registerAll();
    const schema = tools.get('lab_decisioning_catalog_clone_preview').definition.inputSchema;
    for (const entityType of ['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements', 'tags']) {
      assert.doesNotThrow(() => schema.entity_type.parse(entityType));
    }
    assert.doesNotThrow(() => schema.substitutions.parse({ C3: 'C4' }));
  });

  it('registers the schema-extend and tag-bulk tool pairs', () => {
    const tools = registerAll();
    for (const name of [
      'lab_decisioning_schema_extend_preview',
      'lab_decisioning_schema_extend_apply',
      'lab_decisioning_tag_bulk_preview',
      'lab_decisioning_tag_bulk_apply',
    ]) {
      assert.ok(tools.has(name), `expected ${name} to be registered`);
    }
  });

  it('schema_extend_preview/apply accept 1-50 fields of the documented types and reject unknown types', () => {
    const tools = registerAll();
    for (const name of ['lab_decisioning_schema_extend_preview', 'lab_decisioning_schema_extend_apply']) {
      const schema = tools.get(name).definition.inputSchema.fields;
      for (const type of ['string', 'number', 'integer', 'boolean', 'date', 'date-time', 'string-array', 'number-array']) {
        assert.doesNotThrow(() => schema.parse([{ name: 'discountPct', type }]), `${name} should accept type=${type}`);
      }
      assert.throws(() => schema.parse([{ name: 'x', type: 'object' }]));
      assert.throws(() => schema.parse([]));
      assert.throws(() => schema.parse(new Array(51).fill({ name: 'x', type: 'string' })));
    }
  });

  it('schema_extend_apply requires a 64-char preview_hash and confirmed:true, never a phrase', () => {
    const tools = registerAll();
    const schema = tools.get('lab_decisioning_schema_extend_apply').definition.inputSchema;
    assert.throws(() => schema.preview_hash.parse('too-short'));
    assert.doesNotThrow(() => schema.preview_hash.parse('a'.repeat(64)));
    assert.throws(() => schema.confirmed.parse(false));
    assert.doesNotThrow(() => schema.confirmed.parse(true));
    assert.equal(schema.confirmation, undefined);
  });

  it('tag_bulk_preview caps tags at 1-20 and accepts each offer_selector shape', () => {
    const tools = registerAll();
    const schema = tools.get('lab_decisioning_tag_bulk_preview').definition.inputSchema;
    assert.throws(() => schema.tags.parse([]));
    assert.throws(() => schema.tags.parse(new Array(21).fill('t')));
    assert.doesNotThrow(() => schema.tags.parse(['VIP']));
    assert.doesNotThrow(() => schema.offer_selector.parse({ ids: ['o1', 'o2'] }));
    assert.doesNotThrow(() => schema.offer_selector.parse({ name_prefix: 'BlackFriday-' }));
    assert.doesNotThrow(() => schema.offer_selector.parse({ collection: 'c1' }));
    assert.doesNotThrow(() => schema.action.parse('attach'));
    assert.doesNotThrow(() => schema.action.parse('detach'));
    assert.doesNotThrow(() => schema.action.parse('replace'));
    assert.throws(() => schema.action.parse('delete'));
  });

  it('tag_bulk_apply requires a 64-char preview_hash and confirmed:true, and takes an optional resume_token job id', () => {
    const tools = registerAll();
    const schema = tools.get('lab_decisioning_tag_bulk_apply').definition.inputSchema;
    assert.throws(() => schema.preview_hash.parse('too-short'));
    assert.doesNotThrow(() => schema.preview_hash.parse('a'.repeat(64)));
    assert.throws(() => schema.confirmed.parse(false));
    assert.doesNotThrow(() => schema.confirmed.parse(true));
    assert.equal(schema.resume_token.isOptional(), true);
    assert.throws(() => schema.resume_token.parse('not-a-uuid'));
    // No tags/offer_selector/action on apply — the preview_hash-keyed cached plan carries them.
    assert.equal(schema.tags, undefined);
    assert.equal(schema.offer_selector, undefined);
  });
});
