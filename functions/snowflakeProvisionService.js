/**
 * Governed Snowflake table provisioning (Phase C).
 * Executes only allowlisted recipes — CREATE TABLE IF NOT EXISTS or preinstalled existence checks.
 */

'use strict';

const admin = require('firebase-admin');
const {
  getProvisionRecipe,
  listProvisionRecipes,
  buildCreateTableStatements,
  validateProvisionProposal,
} = require('./snowflakeProvisionRecipes');
const {
  withSnowflakeConnection,
  checkTableExistence,
} = require('./snowflakeIndustryCatalogService');

const AUDIT_COLLECTION = 'snowflakeProvisionAuditLog';

function execAsync(conn, options) {
  return new Promise((resolve, reject) => {
    conn.execute({
      ...options,
      complete(err, _stmt, rows) {
        if (err) reject(err);
        else resolve(rows || []);
      },
    });
  });
}

/**
 * @param {object} entry
 */
async function writeProvisionAuditLog(entry) {
  try {
    const db = admin.firestore();
    await db.collection(AUDIT_COLLECTION).add({
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[snowflakeProvision] audit log write failed', String(err && err.message || err));
  }
}

/**
 * @param {object} input
 * @param {string} input.labUser
 * @param {string} input.sandbox
 * @param {string} input.industry
 * @param {string} input.recipe_id
 * @param {boolean} [input.dry_run]
 * @param {string} [input.approval_id]
 */
async function handleProvision(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const industry = String(input.industry || 'travel').trim().toLowerCase();
  const recipeId = String(input.recipe_id || input.recipeId || '').trim();
  const dryRun = input.dry_run === true || input.dryRun === true;
  const approvalId = String(input.approval_id || input.approvalId || '').trim() || null;

  if (!sandbox) throw new Error('sandbox is required');
  if (!recipeId) {
    return {
      ok: false,
      error: {
        message: 'recipe_id is required',
        code: 'MISSING_RECIPE_ID',
        sqlState: null,
        hints: [`Allowlisted: ${listProvisionRecipes(industry).map((r) => r.id).join(', ')}`],
      },
    };
  }

  const proposal = validateProvisionProposal({ recipe_id: recipeId, industry });
  if (!proposal.ok) {
    return {
      ok: false,
      sandbox,
      industry,
      recipe_id: recipeId,
      validation: proposal,
      error: {
        message: proposal.errors.join('; '),
        code: 'PROPOSAL_INVALID',
        sqlState: null,
        hints: [],
      },
    };
  }

  const recipe = getProvisionRecipe(recipeId);
  if (!recipe) {
    return {
      ok: false,
      error: {
        message: `Recipe "${recipeId}" is not allowlisted`,
        code: 'RECIPE_NOT_ALLOWLISTED',
        sqlState: null,
        hints: [],
      },
    };
  }

  if (recipe.provisionMode === 'create_if_not_exists') {
    return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
      const statements = buildCreateTableStatements(
        recipe,
        cfg.database,
        cfg.schema,
      );

      if (dryRun) {
        await writeProvisionAuditLog({
          labUser,
          sandbox,
          industry,
          recipe_id: recipeId,
          provisionMode: recipe.provisionMode,
          dry_run: true,
          approval_id: approvalId,
          sqlPreview: statements.map((entry) => entry.sql.slice(0, 500)),
          tables: statements.map((entry) => entry.fqTable),
        });
        return {
          ok: true,
          sandbox,
          industry,
          recipe_id: recipeId,
          dry_run: true,
          provisionMode: recipe.provisionMode,
          plannedStatements: statements.map((entry) => ({
            table: entry.fqTable,
            sql: entry.sql,
          })),
          tables: statements.map((entry) => entry.fqTable),
          executed: false,
        };
      }

      const tableResults = [];
      for (const statement of statements) {
        try {
          await execAsync(conn, { sqlText: statement.sql });
          tableResults.push({ table: statement.fqTable, ok: true, executed: true });
        } catch (error) {
          tableResults.push({
            table: statement.fqTable,
            ok: false,
            executed: false,
            error: String(error && error.message || error),
          });
          break;
        }
      }
      const allSucceeded = tableResults.length === statements.length
        && tableResults.every((result) => result.ok);
      await writeProvisionAuditLog({
        labUser,
        sandbox,
        industry,
        recipe_id: recipeId,
        provisionMode: recipe.provisionMode,
        dry_run: false,
        approval_id: approvalId,
        tables: statements.map((entry) => entry.fqTable),
        tableResults,
        executed: allSucceeded,
      });

      return {
        ok: allSucceeded,
        sandbox,
        industry,
        recipe_id: recipeId,
        dry_run: false,
        provisionMode: recipe.provisionMode,
        tables: statements.map((entry) => entry.fqTable),
        tableResults,
        executed: allSucceeded,
        sqlExecuted: 'CREATE TABLE IF NOT EXISTS',
        error: allSucceeded
          ? null
          : {
              message: 'Provisioning stopped after a table creation failed',
              code: 'TABLE_CREATE_FAILED',
              sqlState: null,
              hints: ['Retrying the same recipe is safe because every statement uses IF NOT EXISTS.'],
            },
      };
    });
  }

  if (recipe.provisionMode === 'preinstalled') {
    const tables = Array.isArray(recipe.tables) ? recipe.tables : [];
    return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
      const tableCheck = await checkTableExistence(conn, cfg, tables);

      if (dryRun) {
        await writeProvisionAuditLog({
          labUser,
          sandbox,
          industry,
          recipe_id: recipeId,
          provisionMode: recipe.provisionMode,
          dry_run: true,
          approval_id: approvalId,
          tableCount: tables.length,
          existingCount: tableCheck.existingCount,
          missingCount: tableCheck.missingCount,
        });
        return {
          ok: true,
          sandbox,
          industry,
          recipe_id: recipeId,
          dry_run: true,
          provisionMode: recipe.provisionMode,
          note: recipe.note || null,
          tableCheck,
          executed: false,
        };
      }

      await writeProvisionAuditLog({
        labUser,
        sandbox,
        industry,
        recipe_id: recipeId,
        provisionMode: recipe.provisionMode,
        dry_run: false,
        approval_id: approvalId,
        existingCount: tableCheck.existingCount,
        missingCount: tableCheck.missingCount,
        executed: false,
      });

      return {
        ok: tableCheck.missingCount === 0,
        sandbox,
        industry,
        recipe_id: recipeId,
        dry_run: false,
        provisionMode: recipe.provisionMode,
        note: recipe.note || null,
        tableCheck,
        executed: false,
        error:
          tableCheck.missingCount > 0
            ? {
                message: `${tableCheck.missingCount} manifest table(s) missing in Snowflake`,
                code: 'PREINSTALLED_TABLES_MISSING',
                sqlState: null,
                hints: [
                  'Install Agentic travel tables via Snowflake share or agentic-travel-runner generate-full.',
                  'Use travel.base_profiles.v1 to CREATE TABLE IF NOT EXISTS BASE_PROFILES only.',
                ],
              }
            : null,
      };
    });
  }

  return {
    ok: false,
    error: {
      message: `Unsupported provisionMode "${recipe.provisionMode}"`,
      code: 'UNSUPPORTED_PROVISION_MODE',
      sqlState: null,
      hints: [],
    },
  };
}

module.exports = {
  AUDIT_COLLECTION,
  handleProvision,
  validateProvisionProposal,
  writeProvisionAuditLog,
};
