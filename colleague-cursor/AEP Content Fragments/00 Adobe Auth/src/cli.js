#!/usr/bin/env node
/**
 * CLI: print current bearer token or run a quick auth test.
 * Usage: npm run token   OR   node src/cli.js
 *        npm run test-auth   OR   node src/cli.js --test
 */

import { getAccessToken } from './token.js';
import { getConfig } from './config.js';

const isTest = process.argv.includes('--test');

async function main() {
  try {
    if (isTest) {
      const config = getConfig();
      console.error('Config loaded: IMS=%s, orgId=%s, sandbox=%s', config.imsHost, config.orgId ?? '(not set)', config.sandboxName ?? '(not set)');
      const token = await getAccessToken();
      console.error('Token acquired (length %d)', token.length);
      console.log(JSON.stringify({ ok: true, tokenLength: token.length, orgId: config.orgId, sandboxName: config.sandboxName }));
    } else {
      const token = await getAccessToken();
      console.log(token);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
