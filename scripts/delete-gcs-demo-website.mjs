#!/usr/bin/env node
/**
 * Delete a legacy brand-scraper demo site from GCS (demo-websites/<slug>/web/**).
 * Usage: node scripts/delete-gcs-demo-website.mjs <slug>
 * Requires Application Default Credentials (Firebase CLI login or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const slug = String(process.argv[2] || '').trim().toLowerCase();
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: node scripts/delete-gcs-demo-website.mjs <slug>');
  process.exit(1);
}

const bucketName = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const prefix = `demo-websites/${slug}/`;

if (!admin.apps.length) admin.initializeApp();
const bucket = admin.storage().bucket(bucketName);

const [files] = await bucket.getFiles({ prefix });
if (!files.length) {
  console.log(`No objects under gs://${bucketName}/${prefix}`);
  process.exit(0);
}

await bucket.deleteFiles({ prefix });
console.log(`Deleted ${files.length} object(s) under gs://${bucketName}/${prefix}`);
