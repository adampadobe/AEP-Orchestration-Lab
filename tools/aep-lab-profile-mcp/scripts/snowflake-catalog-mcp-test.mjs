#!/usr/bin/env node
/**
 * Offline tests for Snowflake industry catalog MCP wiring (no live Snowflake).
 */

import { loadAuthConfig } from '../src/auth.mjs';
import { snowflakeIndustryCatalog, snowflakeTableStructure } from '../src/labApiClient.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.env.AEP_LAB_MCP_API_KEY = process.env.AEP_LAB_MCP_API_KEY || 'snowflake-catalog-test-key';

async function run() {
  loadAuthConfig();

  assert(typeof snowflakeIndustryCatalog === 'function', 'snowflakeIndustryCatalog export');
  assert(typeof snowflakeTableStructure === 'function', 'snowflakeTableStructure export');

  const catalogPath = '/api/snowflake/industry-catalog';
  const structurePath = '/api/snowflake/agentic/table-structure';

  const catalogFn = snowflakeIndustryCatalog.toString();
  assert(catalogFn.includes(catalogPath), 'industry catalog API path');

  const structureFn = snowflakeTableStructure.toString();
  assert(structureFn.includes(structurePath), 'table structure API path');

  console.log(JSON.stringify({
    ok: true,
    suite: 'snowflake-catalog-mcp-test',
    paths: { catalog: catalogPath, tableStructure: structurePath },
  }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
