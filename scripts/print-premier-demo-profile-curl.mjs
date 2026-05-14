#!/usr/bin/env node
/**
 * Prints a curl command for POST /api/profile/generate using
 * scripts/premier-inn-demo-profile-recipes.json.
 *
 * Usage:
 *   node scripts/print-premier-demo-profile-curl.mjs --sandbox apalmer --recipe hospitality-persona-primary
 *   node scripts/print-premier-demo-profile-curl.mjs --sandbox apalmer --recipe hospitality-persona-primary --email adamp.adobedemo+12052026-1@gmail.com
 *
 * Env:
 *   LAB_ORIGIN — default https://aep-orchestration-lab.web.app
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { sandbox: '', recipe: '', email: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox' && argv[i + 1]) {
      out.sandbox = String(argv[++i]).trim();
    } else if (a === '--recipe' && argv[i + 1]) {
      out.recipe = String(argv[++i]).trim();
    } else if (a === '--email' && argv[i + 1]) {
      out.email = String(argv[++i]).trim();
    }
  }
  return out;
}

function shellSingleQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

const { sandbox, recipe: recipeId, email: emailOverride } = parseArgs(process.argv);
if (!sandbox || !recipeId) {
  console.error(
    'Usage: node scripts/print-premier-demo-profile-curl.mjs --sandbox <technicalSandbox> --recipe <id> [--email override@example.com]',
  );
  process.exit(1);
}

const raw = readFileSync(join(__dirname, 'premier-inn-demo-profile-recipes.json'), 'utf8');
const pack = JSON.parse(raw);
const recipe = pack.recipes.find((r) => r.id === recipeId);
if (!recipe) {
  console.error(`Unknown recipe "${recipeId}". Known: ${pack.recipes.map((r) => r.id).join(', ')}`);
  process.exit(1);
}

const email = emailOverride || recipe.emailPlaceholder;
if (!email) {
  console.error('Recipe has no emailPlaceholder; pass --email');
  process.exit(1);
}

const body = {
  email,
  sandbox,
  industry: recipe.industry || 'travel',
  appendIfExisting: recipe.appendIfExisting === true,
  attributes: recipe.attributes || {},
};

const origin = (process.env.LAB_ORIGIN || 'https://aep-orchestration-lab.web.app').replace(/\/$/, '');
const json = JSON.stringify(body);
const url = `${origin}/api/profile/generate`;

console.log(`# Recipe: ${recipe.id}`);
console.log(`# ${recipe.description || ''}`);
console.log(
  ['curl', '-sS', '-X', 'POST', url, '-H', shellSingleQuote('Content-Type: application/json'), '-d', shellSingleQuote(json)].join(
    ' ',
  ),
);
