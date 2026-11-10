import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { buildSpecification, renderHandoff } from './prepare-cp-coworker-handoff.mjs';

const require = createRequire(import.meta.url);
const model = require('../web/profile-viewer/cp-decisioning-model.js');
const spec = buildSpecification();

test('handoff preserves all exact source offers, content, priorities and seven collection predicates', () => {
  assert.equal(spec.objectives.length, 7);
  assert.equal(spec.objectives.flatMap(objective => objective.offers).length, 21);
  for (const [index, objective] of spec.objectives.entries()) {
    const source = model.objectives[index];
    assert.equal(objective.key, source.key);
    assert.equal(objective.strategyCreateCandidate.rank.priority, index + 1);
    assert.deepEqual(objective.strategyCreateCandidate.profileConstraint, { profileConstraintType: 'none' });
    const [constraint] = objective.collectionCreateCandidate.constraints;
    assert.ok(!Object.hasOwn(constraint, 'constraint'), 'Do not export legacy SQL as an API field.');
    assert.equal(JSON.parse(constraint.uiModel).operator, 'in');
    assert.deepEqual(JSON.parse(constraint.uiModel).value.right, objective.tagMembershipPredicate.uuids);
    for (const [offerIndex, offer] of objective.offers.entries()) {
      const sourceOffer = source.offers[offerIndex];
      assert.equal(offer.name, sourceOffer.name);
      assert.deepEqual(offer.sourceContent, sourceOffer.content);
      assert.equal(offer.itemPriority, sourceOffer.priority);
      assert.equal(offer.sourceImage.localPreviewPath, 'web/profile-viewer/' + sourceOffer.image);
      assert.equal(offer.lifecycleStatus, 'draft');
      assert.equal(offer.sourceImage.verifiedPublicUrl, null);
      assert.equal(offer.destinationUrl, null);
      for (const [key, value] of Object.entries(sourceOffer.content)) {
        const apiPath = offer.customAttributeApiMapping[key];
        assert.equal(apiPath, '_demoemea.content.textContent.' + key);
        assert.equal(spec.offerSchemaEvidence.textLeafTypes[apiPath], 'string');
        assert.equal(offer.offerCreateCandidate._demoemea.content.textContent[key], value);
      }
      const item = offer.offerCreateCandidate._experience.decisioning.decisionitem;
      assert.equal(item.itemName, sourceOffer.name);
      assert.equal(item.itemPriority, sourceOffer.priority);
      assert.deepEqual(item.itemConstraints, offer.itemConstraints);
      assert.deepEqual(item.itemTags, offer.itemTags);
      assert.equal(offer.offerCreateCandidate._experience.decisioning.offeritem.lifecycleStatus, 'draft');
      assert.ok(!Object.hasOwn(offer.offerCreateCandidate._demoemea.content, 'mediaAssets'));
    }
  }
});

test('each offer has the approved combined rule and full visual attribute model', () => {
  assert.equal(spec.eligibilityDesign.attachment, 'combined-per-offer');
  for (const [index, objective] of spec.objectives.entries()) {
    for (const [offerIndex, offer] of objective.offers.entries()) {
      const ast = offer.combinedEligibilityAst;
      assert.equal(ast.operator, 'and');
      assert.deepEqual(ast.conditions[1], model.objectives[index].rule);
      const sourceItemRule = model.objectives[index].offers[offerIndex].rule;
      assert.equal(ast.conditions.length, sourceItemRule ? 3 : 2);
      if (sourceItemRule) assert.deepEqual(ast.conditions[2], sourceItemRule);
      assert.deepEqual(ast.conditions[0].conditions.map(condition => condition.path),
        ['consents.marketing.email.val', 'consents.personalize.content.val']);
      const rule = offer.combinedEligibilityRuleCreateCandidate;
      assert.deepEqual(rule, model.rulePayload(offer.name + ' eligibility', ast));
      assert.equal(rule.exdRule, true);
      assert.equal(rule.condition.format, 'pql/text');
      assert.equal(rule.segmentModel.expression.profileAttributesContainer.items.length, ast.conditions.length);
      assert.equal(offer.itemConstraints.eligibilityRule, '{{OFFER_RULE_ID:' + offer.key + '}}');
      assert.ok(rule.name.startsWith('CP - '));
    }
  }
});

test('the portable prompt embeds its full specification and every result dependency', () => {
  const document = renderHandoff(spec);
  const embedded = JSON.parse(document.match(/```json\n(.+)\n```/)[1]);
  assert.deepEqual(embedded, spec);
  assert.equal(spec.resultMappingTemplate.objectives.flatMap(objective => objective.offers).length, 21);
  assert.deepEqual(spec.scenarios.map(scenario => scenario.rank), [7, 6, 5, 4, 3, 2, 1]);
  assert.equal(spec.scope.liveMutationsAuthorizedByThisDocument, false);
  assert.equal(spec.resultMappingTemplate.catalogComplete, false);
  assert.equal(spec.resultMappingTemplate.edgeReady, false);
  for (const fragment of ['at least 120 seconds', 'not a readiness guarantee', 'Do not activate',
    'PQL AND the full matching', 'last successful live decision', 'custom-attribute']) {
    assert.ok(document.includes(fragment), fragment);
  }
  assert.equal(readFileSync(new URL('../docs/CP_COWORKER_HANDOFF.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), document);
});
