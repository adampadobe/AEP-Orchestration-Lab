#!/usr/bin/env node
/**
 * Verifies Snowflake industry manifest + governed provision recipe registry stay aligned.
 */

import {
  PHASE_TABLES,
  TRAVEL_MANIFEST,
  listSupportedIndustries,
  getIndustryManifest,
} from '../functions/snowflakeIndustryManifest.js';
import {
  PROVISION_RECIPES,
  listProvisionRecipeIds,
  listProvisionRecipes,
  getProvisionRecipe,
  buildCreateTableStatements,
} from '../functions/snowflakeProvisionRecipes.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  assert(listSupportedIndustries().includes('travel'), 'travel industry registered');
  const nonTravelIndustries = ['fsi', 'retail', 'telecom', 'media', 'sports'];
  assert(nonTravelIndustries.every((industry) => listSupportedIndustries().includes(industry)), 'all non-travel industries registered');

  const travel = getIndustryManifest('travel');
  assert(travel.allTables.length === 14, 'travel allTables count');
  assert(
    travel.allTables.every((t) => /^[A-Z][A-Z0-9_]+$/.test(t)),
    'travel table names uppercase identifiers',
  );

  for (const phase of ['phase1', 'phase2', 'phase3']) {
    assert(Array.isArray(PHASE_TABLES[phase]) && PHASE_TABLES[phase].length > 0, `${phase} tables`);
  }

  const recipeIds = listProvisionRecipeIds();
  assert(recipeIds.length >= 3, 'minimum provision recipes');

  for (const id of recipeIds) {
    assert(/^[a-z0-9_.]+$/.test(id), `recipe id slug ${id}`);
    const recipe = getProvisionRecipe(id);
    assert(recipe, `recipe exists ${id}`);
    assert(['preinstalled', 'create_if_not_exists'].includes(recipe.provisionMode), `${id} mode`);
    assert(listSupportedIndustries().includes(recipe.industry), `${id} industry registered`);
    if (recipe.provisionMode === 'create_if_not_exists') {
      const statements = buildCreateTableStatements(recipe, 'DEMO_DB', 'AEP_SCHEMA');
      assert(statements.length > 0, `${id} CREATE statements`);
      assert(statements.every((entry) => /^CREATE TABLE IF NOT EXISTS /.test(entry.sql)), `${id} idempotent DDL`);
    }
    if (recipe.provisionMode === 'preinstalled') {
      assert(Array.isArray(recipe.tables) && recipe.tables.length > 0, `${id} tables`);
    }
  }

  const phase1Recipe = getProvisionRecipe('travel.agentic_phase1.preinstalled.v1');
  const phase1Sorted = [...phase1Recipe.tables].sort().join(',');
  const manifestPhase1Sorted = [...PHASE_TABLES.phase1].sort().join(',');
  assert(phase1Sorted === manifestPhase1Sorted, 'phase1 preinstalled recipe matches manifest');

  const allRecipe = getProvisionRecipe('travel.agentic_all.preinstalled.v1');
  const allSorted = [...allRecipe.tables].sort().join(',');
  const manifestAllSorted = [...TRAVEL_MANIFEST.allTables].sort().join(',');
  assert(allSorted === manifestAllSorted, 'all preinstalled recipe matches manifest');

  assert(listProvisionRecipes('travel').length === 3, 'travel recipe list');
  for (const industry of nonTravelIndustries) {
    const manifest = getIndustryManifest(industry);
    assert(manifest.allTables.length === 6, `${industry} manifest has six tables`);
    assert(manifest.phaseTables.events.length === 4, `${industry} has four event tables`);
    assert(manifest.phaseTables.enrichment.length === 1, `${industry} has one enrichment table`);
    assert(manifest.enrichEventTypes.length === 5, `${industry} has five enrichment types`);
    const recipe = getProvisionRecipe(`${industry}.all.v1`);
    assert(recipe, `${industry}.all.v1 registered`);
    assert(
      buildCreateTableStatements(recipe, 'DEMO_DB', 'AEP_SCHEMA').length === 6,
      `${industry}.all.v1 creates six tables`,
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      suite: 'verify-snowflake-industry-manifest',
      industries: listSupportedIndustries(),
      recipeIds,
      travelTableCount: travel.allTables.length,
    }),
  );
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
