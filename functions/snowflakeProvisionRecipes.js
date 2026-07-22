/**
 * Governed Snowflake table provision recipes (Phase C).
 * Only recipes in this registry may be executed — CREATE TABLE IF NOT EXISTS or preinstalled checks.
 */

'use strict';

const { COLUMN_DDL } = require('./snowflakeBaseProfileSchema');
const { PHASE_TABLES, TRAVEL_MANIFEST } = require('./snowflakeIndustryManifest');
const { getIndustryProfileConfig } = require('./snowflakeIndustryProfileRegistry');

/** @typedef {'preinstalled' | 'create_if_not_exists'} ProvisionMode */

/**
 * @type {Record<string, object>}
 */
const PROVISION_RECIPES = {
  'travel.base_profiles.v1': {
    id: 'travel.base_profiles.v1',
    industry: 'travel',
    label: 'Legacy BASE_PROFILES table (38-column batch generator shape)',
    provisionMode: 'create_if_not_exists',
    table: 'BASE_PROFILES',
    ddlKind: 'base_profiles',
    description:
      'Same shape as AgenticAI Demo batch generator / lab_snowflake_generate_base_profiles default target.',
  },
  'travel.agentic_phase1.preinstalled.v1': {
    id: 'travel.agentic_phase1.preinstalled.v1',
    industry: 'travel',
    label: 'Agentic travel Phase 1 tables (typically preinstalled in Snowflake share)',
    provisionMode: 'preinstalled',
    tables: PHASE_TABLES.phase1,
    note:
      'Install via AgenticAI Demo Snowflake share or Python agentic-travel-runner generate-full. ' +
      'Lab provision verifies existence only — no CREATE DDL for these tables yet.',
  },
  'travel.agentic_all.preinstalled.v1': {
    id: 'travel.agentic_all.preinstalled.v1',
    industry: 'travel',
    label: 'All Agentic travel manifest tables (preinstalled)',
    provisionMode: 'preinstalled',
    tables: TRAVEL_MANIFEST.allTables,
    note:
      'Full phased Agentic travel schema (phase1–3). Use lab_snowflake_industry_catalog tableCheck ' +
      'or this preinstalled recipe to confirm readiness before generate-full / enrich.',
  },
  ...Object.fromEntries(
    ['fsi', 'retail', 'telecom', 'media', 'sports'].map((industry) => {
      const profile = getIndustryProfileConfig(industry);
      const id = `${industry}.profile_customer.v1`;
      return [id, {
        id,
        industry,
        label: `Agentic ${industry.toUpperCase()} CRM profile customer table`,
        provisionMode: 'create_if_not_exists',
        table: profile.table,
        ddlKind: 'industry_profile_customer',
        columnDdl: profile.columnDdl,
        description: `Operational CRM profile table for ${industry} dual-load generation.`,
      }];
    }),
  ),
};

/**
 * @param {string} recipeId
 * @returns {object | null}
 */
function getProvisionRecipe(recipeId) {
  const key = String(recipeId || '').trim();
  if (!key) return null;
  return PROVISION_RECIPES[key] || null;
}

/**
 * @returns {string[]}
 */
function listProvisionRecipeIds() {
  return Object.keys(PROVISION_RECIPES);
}

/**
 * @param {string} [industry]
 * @returns {object[]}
 */
function listProvisionRecipes(industry) {
  const filter = String(industry || '').trim().toLowerCase();
  return Object.values(PROVISION_RECIPES).filter((r) => !filter || r.industry === filter);
}

/**
 * @param {string} name
 * @param {string} fallback
 */
function safeIdentifier(name, fallback) {
  const v = String(name == null ? '' : name).trim();
  if (!v) return fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(v)) {
    throw new Error(
      `invalid identifier "${name}" — only [A-Za-z_][A-Za-z0-9_] up to 255 chars allowed`,
    );
  }
  return v;
}

function fullyQualified(database, schema, table) {
  const parts = [];
  if (database) parts.push(safeIdentifier(database, ''));
  if (schema) parts.push(safeIdentifier(schema, ''));
  parts.push(safeIdentifier(table, ''));
  return parts.filter(Boolean).join('.');
}

/**
 * Build CREATE TABLE IF NOT EXISTS for allowlisted create_if_not_exists recipes.
 * @param {object} recipe
 * @param {string} database
 * @param {string} schema
 * @returns {{ sql: string, table: string, fqTable: string }}
 */
function buildCreateTableStatement(recipe, database, schema) {
  if (recipe.provisionMode !== 'create_if_not_exists') {
    throw new Error(`Recipe "${recipe.id}" is not create_if_not_exists`);
  }
  if (!['base_profiles', 'industry_profile_customer'].includes(recipe.ddlKind)) {
    throw new Error(`Unsupported ddlKind "${recipe.ddlKind}" for recipe "${recipe.id}"`);
  }
  const table = safeIdentifier(recipe.table, '');
  const fqTable = fullyQualified(database, schema, table);
  const ddl = recipe.ddlKind === 'industry_profile_customer' ? recipe.columnDdl : COLUMN_DDL;
  if (!Array.isArray(ddl) || !ddl.length) throw new Error(`Recipe "${recipe.id}" has no column DDL`);
  const sql = `CREATE TABLE IF NOT EXISTS ${fqTable} (\n  ${ddl.join(',\n  ')}\n)`;
  return { sql, table, fqTable };
}

/**
 * Validate recipe_id / proposed_tables before provision or validate-proposal API.
 * @param {object} input
 */
function validateProvisionProposal(input) {
  const errors = [];
  const warnings = [];
  const recipeId = String(input.recipe_id || input.recipeId || '').trim();
  const industry = String(input.industry || 'travel').trim().toLowerCase();
  const proposedTables = Array.isArray(input.proposed_tables || input.proposedTables)
    ? (input.proposed_tables || input.proposedTables)
    : [];

  /** @type {object | null} */
  let recipe = null;
  if (recipeId) {
    recipe = getProvisionRecipe(recipeId);
    if (!recipe) {
      errors.push(
        `Unknown recipe_id "${recipeId}". Allowlisted: ${listProvisionRecipeIds().join(', ')}`,
      );
    } else if (recipe.industry !== industry) {
      errors.push(
        `Recipe "${recipeId}" belongs to industry "${recipe.industry}", not "${industry}"`,
      );
    }
  }

  if (proposedTables.length) {
    warnings.push(
      'proposed_tables is read-only legacy input; use an allowlisted recipe_id to provision tables.',
    );
  }

  if (!recipeId && !proposedTables.length) {
    warnings.push('No recipe_id or proposed_tables — use phases/eventTypes for enrich/generate validation.');
  }

  return {
    ok: errors.length === 0,
    valid: errors.length === 0,
    industry,
    errors,
    warnings,
    resolved: {
      recipe_id: recipe ? recipe.id : null,
      provisionMode: recipe ? recipe.provisionMode : null,
      proposed_tables: proposedTables
        .map((t) => String(t).trim().toUpperCase())
        .filter(Boolean),
    },
    allowlistedRecipeIds: listProvisionRecipeIds(),
    recipesForIndustry: listProvisionRecipes(industry).map((r) => ({
      id: r.id,
      label: r.label,
      provisionMode: r.provisionMode,
    })),
  };
}

module.exports = {
  PROVISION_RECIPES,
  getProvisionRecipe,
  listProvisionRecipeIds,
  listProvisionRecipes,
  buildCreateTableStatement,
  validateProvisionProposal,
  safeIdentifier,
  fullyQualified,
};
