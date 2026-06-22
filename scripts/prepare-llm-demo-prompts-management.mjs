import path from 'node:path';
import { prepareWalnutPage } from './prepare-llm-demo-walnut-page.mjs';

const srcAssetsDir =
  process.env.LLM_DEMO_PM_SOURCE_ASSETS ||
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'Adobe Brand Visibility - Jun 08, 2026 Prompt Suggestions_files',
  );

prepareWalnutPage({
  pageSlug: 'prompts-management',
  srcAssetsDir,
  filesPathPrefix: 'Adobe Brand Visibility - Jun 08, 2026 Prompt Suggestions_files/',
  findHtml: {
    preferredName: 'assets(14).html',
    markers: ['Prompt Suggestions', 'Intent coverage', 'Prompts Management'],
  },
});
