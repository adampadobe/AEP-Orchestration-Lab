/**
 * Governed Snowflake table provisioning (Phase C).
 * Executes only allowlisted recipes — CREATE TABLE IF NOT EXISTS or preinstalled existence checks.
 */

'use strict';

const admin = require('firebase-admin');
const { createHash } = require('node:crypto');
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
 * @param {boolean} [input.confirmed]
 * @param {string} [input.preview_fingerprint]
 */
async function handleProvision(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const industry = String(input.industry || 'travel').trim().toLowerCase();
  const recipeId = String(input.recipe_id || input.recipeId || '').trim();
  let dryRun = input.dry_run === true || input.dryRun === true;
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
    if (recipe.requiresConfirmation) {
      if (input.dry_run === undefined && input.dryRun === undefined) dryRun = true;
      if (!dryRun && input.confirmed !== true) {
        return {
          ok: false,
          sandbox,
          industry,
          recipe_id: recipeId,
          executed: false,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'Preview this recipe with dry_run:true, then confirm the target database/schema and pass dry_run:false, confirmed:true.',
            sqlState: null,
            hints: ['Only missing tables are created; no schema creation, grants, or changes to existing tables.'],
          },
        };
      }
    }
    return withSnowflakeConnection(labUser, sandbox, async (conn, cfg) => {
      if (recipe.requiresConfirmation && (!cfg.database || !cfg.schema)) {
        return {
          ok: false,
          executed: false,
          error: {
            code: 'TARGET_REQUIRED',
            message: 'Save an explicit Snowflake database and schema before provisioning travel tables.',
            sqlState: null,
            hints: [],
          },
        };
      }
      const statements = buildCreateTableStatements(
        recipe,
        cfg.database,
        cfg.schema,
      );
      const previewFingerprint = createHash('sha256').update(JSON.stringify({
        labUser, sandbox, recipeId,
        account: cfg.account, user: cfg.user, role: cfg.role, warehouse: cfg.warehouse,
        database: cfg.database, schema: cfg.schema,
        sql: statements.map((entry) => entry.sql),
      })).digest('hex');
      if (!dryRun && recipe.requiresConfirmation && input.preview_fingerprint !== previewFingerprint) {
        return {
          ok: false,
          executed: false,
          error: {
            code: 'PREVIEW_REQUIRED',
            message: 'Preview this recipe again and pass its preview_fingerprint unchanged. The saved connection or table definitions may have changed.',
            sqlState: null,
            hints: [],
          },
        };
      }

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
          requiresConfirmation: recipe.requiresConfirmation === true,
          preview_fingerprint: previewFingerprint,
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
        confirmed: input.confirmed === true,
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
                  'Preview travel.all.v1 with dry_run:true, then confirm to create missing tables in your saved database/schema.',
                  'Your Snowflake role needs database/schema USAGE and schema CREATE TABLE; the lab does not grant privileges.',
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
