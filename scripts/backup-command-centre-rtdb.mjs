#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export async function collectCommandCentres({ listWorkspaces, readCommandCentre }) {
  const slugs = await listWorkspaces();
  const userWorkspaces = Object.create(null);
  for (const slug of slugs) {
    const commandCentre = await readCommandCentre(`userWorkspaces/${slug}/commandCentre`);
    if (commandCentre !== null) userWorkspaces[slug] = { commandCentre };
  }
  return { userWorkspaces };
}

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      'database-url': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log('Usage: node scripts/backup-command-centre-rtdb.mjs --project <project-id> --database-url <RTDB URL>');
    return;
  }
  if (!values.project || !values['database-url']) {
    throw new Error('Explicit --project and --database-url are required; authenticate ADC for the approved project first.');
  }
  const databaseUrl = new URL(values['database-url']);
  if (databaseUrl.protocol !== 'https:' || databaseUrl.username || databaseUrl.password ||
      databaseUrl.search || databaseUrl.hash || databaseUrl.pathname !== '/' ||
      !/^[a-z0-9-]+\.(?:firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/.test(databaseUrl.hostname)) {
    throw new Error('--database-url must be a Firebase RTDB HTTPS origin without credentials or query parameters.');
  }
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const admin = require('firebase-admin');
  const credential = admin.credential.applicationDefault();
  const app = admin.initializeApp({
    credential, projectId: values.project, databaseURL: databaseUrl.origin,
  }, 'command-centre-backup');
  try {
    const backup = await collectCommandCentres({
      listWorkspaces: async () => {
        const { access_token: accessToken } = await credential.getAccessToken();
        const url = new URL('/userWorkspaces.json', databaseUrl);
        url.searchParams.set('shallow', 'true');
        const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw new Error(`Workspace enumeration failed (HTTP ${response.status}); no backup written.`);
        const keys = await response.json();
        if (keys === null) return [];
        if (typeof keys !== 'object' || Array.isArray(keys) || Object.values(keys).some((value) => value !== true)) {
          throw new Error('Unexpected shallow workspace response; no backup written.');
        }
        return Object.keys(keys).sort();
      },
      readCommandCentre: async (path) => (await app.database().ref(path).once('value')).val(),
    });
    const directory = new URL('./data/', import.meta.url);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const exportedAt = new Date().toISOString();
    const output = new URL(`command-centre-backup-${exportedAt.replace(/[:.]/g, '-')}.local.json`, directory);
    await writeFile(output, JSON.stringify({
      project: values.project, databaseUrl: databaseUrl.origin, exportedAt,
      ...backup,
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Saved ${Object.keys(backup.userWorkspaces).length} Command Centre workspaces to ${fileURLToPath(output)}. RTDB was not modified.`);
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[backup-command-centre-rtdb] ${error.message}`);
    process.exitCode = 1;
  });
}
