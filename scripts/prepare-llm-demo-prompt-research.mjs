import path from 'node:path';
import { prepareWalnutPage } from './prepare-llm-demo-walnut-page.mjs';

const srcAssetsDir =
  process.env.LLM_DEMO_PR_SOURCE_ASSETS ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Adobe Brand Visibility - Jun 08, 2026 PR_files');

prepareWalnutPage({
  pageSlug: 'prompt-research',
  srcAssetsDir,
  filesPathPrefix: 'Adobe Brand Visibility - Jun 08, 2026 PR_files/',
  findHtml: {
    preferredName: 'assets(18).html',
    markers: ['Prompt Research', 'Related topics AI volume', 'Unique prompts'],
  },
});
