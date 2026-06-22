import path from 'node:path';
import { prepareWalnutPage } from './prepare-llm-demo-walnut-page.mjs';

const srcAssetsDir =
  process.env.LLM_DEMO_IC_SOURCE_ASSETS ||
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'Adobe Brand Visibility - Jun 08, 2026 Intent Coverage_files',
  );

prepareWalnutPage({
  pageSlug: 'intent-coverage-overlay',
  outHtmlName: 'intent-coverage-overlay.html',
  srcAssetsDir,
  filesPathPrefix: 'Adobe Brand Visibility - Jun 08, 2026 Intent Coverage_files/',
  findHtml: {
    preferredName: 'assets(12).html',
    markers: ['Intent Coverage', 'Planning', 'Informational'],
  },
});
