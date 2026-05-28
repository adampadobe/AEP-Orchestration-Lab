#!/usr/bin/env node
/**
 * Build functions/sandboxApiGatewayRoutes.json from firebase.sandbox.direct.json
 * (or firebase.sandbox.json) Hosting rewrites for /api/* → functionId.
 *
 * Usage:
 *   node scripts/generate-sandbox-gateway-routes.mjs
 *   node scripts/generate-sandbox-gateway-routes.mjs --config firebase.sandbox.direct.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG = path.join(REPO_ROOT, 'firebase.sandbox.direct.json');
const OUT = path.join(REPO_ROOT, 'functions', 'sandboxApiGatewayRoutes.json');

const configArg = process.argv.find((a) => a.startsWith('--config='));
const configPath = configArg
  ? path.resolve(REPO_ROOT, configArg.slice('--config='.length))
  : (fs.existsSync(DEFAULT_CONFIG)
    ? DEFAULT_CONFIG
    : path.join(REPO_ROOT, 'firebase.sandbox.json'));

const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const rewrites = raw?.hosting?.rewrites || [];

const routes = rewrites
  .filter((r) => r.source && String(r.source).startsWith('/api'))
  .map((r) => {
    const fn = r.function;
    if (!fn?.functionId) {
      throw new Error(`Rewrite ${r.source} has no function.functionId`);
    }
    return {
      source: r.source,
      functionId: fn.functionId,
      region: fn.region || 'us-east4',
    };
  });

routes.sort((a, b) => {
  const score = (s) => {
    const len = s.length;
    const bonus = s.endsWith('/**') ? 10000 : s.includes('*') ? 5000 : 0;
    return len + bonus;
  };
  return score(b.source) - score(a.source);
});

const payload = {
  generatedAt: new Date().toISOString(),
  sourceConfig: path.basename(configPath),
  projectId: 'adbe-gcp0819',
  defaultRegion: 'us-east4',
  routes,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${routes.length} route(s) → ${path.relative(REPO_ROOT, OUT)}`);
