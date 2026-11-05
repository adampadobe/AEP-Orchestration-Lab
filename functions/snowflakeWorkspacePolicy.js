'use strict';

const crypto = require('node:crypto');
const CONTEXT_FIELDS = ['account', 'user', 'role', 'warehouse', 'database', 'schema'];
const ACTIONS = Object.freeze(['capabilities', 'objects_list', 'object_describe', 'query_submit',
  'query_status', 'query_results', 'query_cancel', 'data_check', 'change_preview',
  'change_approve', 'change_apply', 'grants_inspect', 'agents_list', 'agent_run']);
class WorkspaceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function assert(value, code, message) {
  if (!value) throw new WorkspaceError(code, message);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(stable(value))).digest('hex');
const scopeId = (uid, sandbox) => hash(`${uid}\0${sandbox}`);
function identifier(value) {
  assert(typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_$]{0,254}$/.test(value), 'INVALID_INPUT', 'Expected a simple Snowflake identifier.');
  return value;
}
const quote = value => `"${identifier(value)}"`;
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function fields(value, allowed, required = []) {
  assert(object(value) && Object.keys(value).every(k => allowed.includes(k)) &&
    required.every(k => Object.hasOwn(value, k)), 'INVALID_INPUT', 'Missing or unexpected request fields.');
}
function scalar(value) {
  assert(value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && Buffer.byteLength(value) <= 65536), 'INVALID_INPUT', 'Bindings must be bounded scalar values or null.');
  return value;
}
function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  assert(Number.isSafeInteger(value) && value >= min && value <= max, 'INVALID_INPUT', `Expected integer between ${min} and ${max}.`);
  return value;
}
function uuid(value) {
  assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    'INVALID_INPUT', 'request_id must be a UUID.');
  return value.toLowerCase();
}
function validatePolicy(policy) {
  assert(policy && policy.enabled === true, 'POLICY_DISABLED', 'Workspace is not enabled by an administrator.');
  for (const key of CONTEXT_FIELDS) {
    assert(typeof policy[key] === 'string' && policy[key].length > 0, 'POLICY_INVALID', `Policy must pin ${key}.`);
    if (key !== 'account') identifier(policy[key]);
  }
  assert(/^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9_-]*){0,3}$/.test(policy.account),
    'POLICY_INVALID', 'Policy account must be a Snowflake account identifier, not a URL.');
  assert(['read', 'write', 'grants'].every(k => typeof policy[k] === 'boolean'), 'POLICY_INVALID', 'Policy permission booleans are required.');
  assert(Array.isArray(policy.grantRoles) && policy.grantRoles.length <= 100 &&
    Array.isArray(policy.agents) && policy.agents.length <= 100, 'POLICY_INVALID', 'Policy allowlists are required.');
  policy.grantRoles.forEach(identifier);
  policy.agents.forEach(agentParts);
  return {...policy, timeoutSeconds: integer(policy.timeoutSeconds, 60, 1, 600),
    maxRows: integer(policy.maxRows, 500, 1, 5000)};
}
function context(policy, resolved) {
  assert(resolved && resolved.config && resolved.credential, 'CONNECTION_REQUIRED', 'Save a Snowflake connection first.');
  assert(['user', 'sandbox_shared'].includes(resolved.config.credentialScope), 'CONNECTION_SCOPE', 'Connection credential scope must be explicit.');
  assert(resolved.config.credentialScope !== 'sandbox_shared' || policy.allowSharedCredential === true,
    'SHARED_CREDENTIAL_DENIED', 'Administrator has not enabled shared credentials.');
  for (const key of CONTEXT_FIELDS) {
    assert(resolved.config[key] === policy[key], 'CONTEXT_MISMATCH', `Saved ${key} does not match administrator policy.`);
  }
  return hash({context: Object.fromEntries(CONTEXT_FIELDS.map(k => [k, policy[k]])),
    credentialVersion: hash(resolved.credential), passphraseVersion: hash(resolved.passphrase || ''),
    authMethod: resolved.config.authMethod, credentialScope: resolved.config.credentialScope,
    read: policy.read, write: policy.write, grants: policy.grants,
    grantRoles: policy.grantRoles, agents: policy.agents, timeoutSeconds: policy.timeoutSeconds, maxRows: policy.maxRows});
}
function publicContext(policy) {
  // Never publish the internal credential-rotation fingerprint as a password
  // guessing oracle. The portal displays only this non-secret context digest.
  return hash(Object.fromEntries(CONTEXT_FIELDS.map(k => [k, policy[k]])));
}
function tableName(table, policy) {
  assert(typeof table === 'string', 'INVALID_INPUT', 'table is required.');
  const parts = table.split('.');
  assert(parts.length === 1 || parts.length === 3, 'INVALID_INPUT', 'Use a simple or fully qualified table name.');
  parts.forEach(identifier);
  if (parts.length === 3) assert(parts[0] === policy.database && parts[1] === policy.schema,
    'SCOPE_DENIED', 'Typed operations must target the policy database and schema.');
  return [policy.database, policy.schema, parts.at(-1)].map(quote).join('.');
}
function agentParts(agent) {
  assert(typeof agent === 'string' && agent.split('.').length === 3, 'INVALID_INPUT', 'agent must be DATABASE.SCHEMA.NAME.');
  return agent.split('.').map(identifier);
}
// This lexer is deliberately conservative, not a SQL sandbox. The irreversible
// CORTEX_CLIENT_READ_ONLY session parameter and least-privilege role are the boundary.
function readSql(sql) {
  assert(typeof sql === 'string' && Buffer.byteLength(sql) <= 65536 && sql.trim(), 'INVALID_SQL', 'SQL must be nonempty and at most 64 KiB.');
  let tokens = '', i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const end = c; i++; let closed = false;
      while (i < sql.length) {
        if (sql[i++] === end) {
          if (sql[i] === end) i++;
          else { closed = true; break; }
        }
      }
      assert(closed, 'INVALID_SQL', 'Unterminated SQL literal or identifier.');
      tokens += ' LITERAL ';
    } else {
      assert(c !== ';' && c !== '$' && !(c === '-' && sql[i + 1] === '-') &&
        !(c === '/' && sql[i + 1] === '*') && c !== '\0' && c !== '\\',
      'INVALID_SQL', 'Comments, dollar syntax, escapes and statement separators are not supported.');
      tokens += c; i++;
    }
  }
  const words = tokens.toUpperCase().match(/[A-Z_][A-Z_0-9]*/g) || [];
  assert(['SELECT', 'WITH'].includes(words[0]) && words.includes('SELECT'), 'INVALID_SQL', 'Only a single SELECT or WITH query is allowed.');
  const forbidden = new Set(['CALL', 'USE', 'COPY', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER',
    'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'PUT', 'GET', 'REMOVE', 'EXECUTE', 'BEGIN', 'COMMIT',
    'ROLLBACK', 'SET', 'UNSET', 'INTO']);
  assert(!words.some(word => forbidden.has(word)), 'INVALID_SQL', 'SQL contains a prohibited statement token.');
  return sql;
}
function compileOperation(op, policy) {
  assert(object(op), 'INVALID_INPUT', 'operation is required.');
  const grant = ['grant', 'revoke'].includes(op.kind);
  assert(grant ? policy.grants : policy.write, 'PERMISSION_DENIED', grant ? 'Grants are disabled.' : 'Writes are disabled.');
  const table = tableName(op.table, policy), binds = [];
  const pairs = value => {
    assert(object(value) && Object.keys(value).length > 0 && Object.keys(value).length <= 100,
      'INVALID_INPUT', 'Expected a nonempty bounded equality/value object.');
    return Object.entries(value).map(([k, v]) => [quote(k), scalar(v)]);
  };
  const column = value => {
    fields(value, ['name', 'type', 'nullable'], ['name', 'type']);
    assert(value.nullable === undefined || typeof value.nullable === 'boolean', 'INVALID_INPUT', 'nullable must be boolean.');
    assert(typeof value.type === 'string' &&
      /^(?:BOOLEAN|DATE|TIMESTAMP_NTZ|TIMESTAMP_LTZ|TIMESTAMP_TZ|INT|INTEGER|BIGINT|FLOAT|DOUBLE|VARCHAR(?:\([1-9][0-9]{0,6}\))?|NUMBER(?:\((?:[1-9]|[12][0-9]|3[0-8])(?:,(?:[0-9]|[12][0-9]|3[0-7]))?\))?)$/.test(value.type),
    'INVALID_INPUT', 'Unsupported column type.');
    return `${quote(value.name)} ${value.type}${value.nullable === false ? ' NOT NULL' : ''}`;
  };
  let sql, readbackSql, readbackBindings = [], readbackKind = 'object_metadata';
  const countReadback = value => {
    const where = pairs(value).map(([k, v]) => {
      if (v === null) return `${k} IS NULL`;
      readbackBindings.push(v); return `${k} = ?`;
    }).join(' AND ');
    readbackSql = `SELECT COUNT(*) AS "matching_rows" FROM ${table} WHERE ${where}`;
    readbackKind = 'matching_rows';
  };
  switch (op.kind) {
    case 'create_table':
      fields(op, ['kind', 'table', 'columns'], ['kind', 'table', 'columns']);
      assert(Array.isArray(op.columns) && op.columns.length > 0 && op.columns.length <= 100 &&
        new Set(op.columns.map(c => c?.name?.toUpperCase())).size === op.columns.length, 'INVALID_INPUT', 'Provide 1–100 distinct columns.');
      sql = `CREATE TABLE ${table} (${op.columns.map(column).join(', ')})`; break;
    case 'add_column':
      fields(op, ['kind', 'table', 'column'], ['kind', 'table', 'column']);
      sql = `ALTER TABLE ${table} ADD COLUMN ${column(op.column)}`; break;
    case 'insert': {
      fields(op, ['kind', 'table', 'values'], ['kind', 'table', 'values']);
      const values = pairs(op.values);
      binds.push(...values.map(x => x[1]));
      countReadback(op.values);
      sql = `INSERT INTO ${table} (${values.map(x => x[0]).join(', ')}) VALUES (${values.map(() => '?').join(', ')})`; break;
    }
    case 'update':
    case 'delete': {
      fields(op, op.kind === 'update' ? ['kind', 'table', 'values', 'where'] : ['kind', 'table', 'where'],
        op.kind === 'update' ? ['kind', 'table', 'values', 'where'] : ['kind', 'table', 'where']);
      let set = '';
      if (op.kind === 'update') set = ' SET ' + pairs(op.values).map(([k, v]) => { binds.push(v); return `${k} = ?`; }).join(', ');
      const where = pairs(op.where).map(([k, v]) => {
        if (v === null) return `${k} IS NULL`;
        binds.push(v); return `${k} = ?`;
      }).join(' AND ');
      countReadback(op.kind === 'update' ? {...op.where, ...op.values} : op.where);
      sql = `${op.kind === 'update' ? 'UPDATE' : 'DELETE FROM'} ${table}${set} WHERE ${where}`; break;
    }
    case 'grant':
    case 'revoke':
      fields(op, ['kind', 'table', 'role', 'privileges'], ['kind', 'table', 'role', 'privileges']);
      assert(policy.grantRoles.includes(op.role), 'PERMISSION_DENIED', 'Target role is not allowlisted.');
      assert(Array.isArray(op.privileges) && op.privileges.length > 0 && op.privileges.length <= 5 &&
        op.privileges.every(p => ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES'].includes(p)),
      'INVALID_INPUT', 'Unsupported table privileges.');
      sql = `${op.kind.toUpperCase()} ${[...new Set(op.privileges)].join(', ')} ON TABLE ${table} ${grant && op.kind === 'grant' ? 'TO' : 'FROM'} ROLE ${quote(op.role)}`; break;
    default: throw new WorkspaceError('INVALID_INPUT', 'Unsupported typed operation.');
  }
  assert(Buffer.byteLength(JSON.stringify(binds)) <= 131072, 'INVALID_INPUT', 'Bound values exceed 128 KiB.');
  return {sql, bindings: binds, targets: [table], operation: op, permission: grant ? 'grants' : 'write',
    readbackSql: readbackSql || (grant ? `SHOW GRANTS ON TABLE ${table}` : `DESCRIBE TABLE ${table}`),
    readbackBindings, readbackKind: grant ? 'grants' : readbackKind,
    warning: 'Single-use approval; DDL auto-commits. No rollback is promised. NOT NULL additions can fail on existing data.'};
}
module.exports = {ACTIONS, WorkspaceError, assert, fields, scalar, integer, uuid, hash, scopeId,
  identifier, quote, validatePolicy, context, publicContext, tableName, agentParts, readSql, compileOperation};
