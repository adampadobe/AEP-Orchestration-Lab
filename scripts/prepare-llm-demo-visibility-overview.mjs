import path from 'node:path';
import { prepareWalnutPage } from './prepare-llm-demo-walnut-page.mjs';

const srcAssetsDir =
  process.env.LLM_DEMO_VO_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe Brand Visibility - Jun 08, 2026 VO_files');

prepareWalnutPage({
  pageSlug: 'visibility-overview',
  srcAssetsDir,
  filesPathPrefix: 'Adobe Brand Visibility - Jun 08, 2026 VO_files/',
  findHtml: {
    preferredName: 'assets(14).html',
    markers: ['Visibility Overview', 'AI Visibility', 'Mentions by model'],
  },
});
