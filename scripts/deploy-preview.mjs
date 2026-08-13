#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const rawChannel = process.argv[2] || '';
const channel = rawChannel.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

if (!channel) {
  console.error('Usage: npm run deploy:preview -- <channel-name>');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['-y', 'firebase-tools@latest', 'hosting:channel:deploy', channel, '--expires', '7d', '--project', 'aep-orchestration-lab'],
  {
    stdio: 'inherit',
    env: { ...process.env, AEP_DEPLOY_MODE: 'preview' },
  },
);

process.exit(result.status ?? 1);
