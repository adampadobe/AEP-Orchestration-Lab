import path from 'node:path';
import { prepareWalnutPage } from './prepare-llm-demo-walnut-page.mjs';

const srcAssetsDir =
  process.env.LLM_DEMO_MC_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe Brand Visibility - Jun 08, 2026 MC_files');

prepareWalnutPage({
  pageSlug: 'market-comparison',
  srcAssetsDir,
  filesPathPrefix: 'Adobe Brand Visibility - Jun 08, 2026 MC_files/',
  findHtml: {
    preferredName: 'assets(18).html',
    markers: ['Market Comparison', 'Intent coverage', 'Google Search Console'],
  },
});
