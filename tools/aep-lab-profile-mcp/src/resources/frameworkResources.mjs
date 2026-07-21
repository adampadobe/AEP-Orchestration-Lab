import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  frameworkConventionsMarkdown,
  frameworkOverviewMarkdown,
  getExecutionFramework,
  getIndustryPlaybook,
  getLabConventions,
} from '../framework/labFramework.mjs';
import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { generateScrapeBrief, BRAND_SCRAPER_UPLOAD_LIMITS } from '../brandScraperBrief.mjs';

function brandScrapeOfflineResourceMarkdown() {
  const fw = getExecutionFramework();
  const workflow = fw.workflows?.brand_scrape_offline_fallback || {};
  return [
    '# Brand Scraper — offline fallback (MCP)',
    '',
    'Use when **live crawl fails** (403, bot protection, login wall) or **LLM analysis keeps failing**.',
    '',
    '## Tool chain',
    '',
    ...(Array.isArray(workflow.steps) ? workflow.steps.map((s, i) => `${i + 1}. ${s}`) : []),
    '',
    '## Upload limits',
    '',
    `- Max **${BRAND_SCRAPER_UPLOAD_LIMITS.maxUploadMb} MB** ZIP`,
    `- Max **~${BRAND_SCRAPER_UPLOAD_LIMITS.maxFiles} files**`,
    '- At least one non-empty `.html` (or ZIP containing HTML)',
    '',
    '## MCP tools',
    '',
    '| Tool | Purpose |',
    '| --- | --- |',
    '| `lab_brand_scrape_brief` | Markdown brief + LLM task prompt (call with url + include flags) |',
    '| `lab_brand_scrape_upload` | POST uploaded HTML/ZIP to brandScraperAnalyze (Alan/kirkham upload path) |',
    '| `lab_brand_scrape` | Optional `upload` + `upload_only` / `use_as_fallback` on same analyse API |',
    '| `lab_poll_brand_scrape` | Poll until complete after upload analyse |',
    '| `lab_build_demo_website` | Site clone when `include.demoWebsite` was not set on upload |',
    '',
    '## Settings',
    '',
    '| Scenario | MCP params |',
    '| --- | --- |',
    '| Site blocks crawler but you have ZIP | `use_as_fallback:true` on lab_brand_scrape or lab_brand_scrape_upload |',
    '| Site cannot be crawled at all | `upload_only:true` (default on lab_brand_scrape_upload) |',
    '| Demo site clone | `include.demoWebsite:true` on upload analyse |',
    '',
    '## Example Coworker prompts',
    '',
    '> Live crawl for https://blocked-brand.com failed with 403. Call **lab_brand_scrape_brief** url that site include personas segments. Paste the LLM task prompt to the colleague.',
    '',
    '> Colleague returned brand-upload.zip. Call **lab_brand_scrape_upload** sandbox apalmer url https://blocked-brand.com upload_only true — upload.zip_base64 from file.',
    '',
    '---',
    '',
    '_For a full brief template with brand-specific placeholders, call **lab_brand_scrape_brief** (returns markdown)._',
    '',
    '## Generic brief template (no brand URL)',
    '',
    generateScrapeBrief({ url: 'https://example.com', customer_name: 'Example Brand' }),
  ].join('\n');
}

function jsonResourceContents(uri, data) {
  const href = typeof uri === 'string' ? uri : uri.href;
  return {
    contents: [
      {
        uri: href,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function textResourceContents(uri, text, mimeType = 'text/markdown') {
  const href = typeof uri === 'string' ? uri : uri.href;
  return {
    contents: [{ uri: href, mimeType, text }],
  };
}

/**
 * Register lab framework MCP resources.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerFrameworkResources(mcpServer) {
  mcpServer.registerResource(
    'lab-framework-overview',
    'lab://framework/overview',
    {
      title: 'Lab execution framework overview',
      description:
        'How the lab executes: generate → industry HTTP stream → full-snapshot update → events. Read before onboarding Coworker workflows.',
      mimeType: 'text/markdown',
    },
    async (uri) => textResourceContents(uri, frameworkOverviewMarkdown()),
  );

  mcpServer.registerResource(
    'lab-framework-conventions',
    'lab://framework/conventions',
    {
      title: 'Lab test data conventions',
      description: 'Test email plus-addressing, default mobile +447425627462, testProfile flag, identity stitching rules.',
      mimeType: 'text/markdown',
    },
    async (uri) => textResourceContents(uri, frameworkConventionsMarkdown()),
  );

  mcpServer.registerResource(
    'lab-framework-industry',
    new ResourceTemplate('lab://framework/industries/{industry}', {}),
    {
      title: 'Per-industry lab playbook',
      description:
        'Core attributes, tenant paths, segment_hints, infra prerequisites, and example Coworker prompt chain for one industry.',
      mimeType: 'application/json',
    },
    async (uri, { industry }) => {
      const result = getIndustryPlaybook(industry);
      if (!result.ok) {
        return jsonResourceContents(uri, result);
      }
      return jsonResourceContents(uri, result);
    },
  );

  // Static JSON mirrors for clients that prefer application/json on fixed URIs
  mcpServer.registerResource(
    'lab-framework-overview-json',
    'lab://framework/overview.json',
    {
      title: 'Lab execution framework (JSON)',
      description: 'Structured execution framework — same content as lab_get_execution_framework tool.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResourceContents(uri, getExecutionFramework()),
  );

  mcpServer.registerResource(
    'lab-framework-conventions-json',
    'lab://framework/conventions.json',
    {
      title: 'Lab conventions (JSON)',
      description: 'Email, phone, testProfile, stitching — structured conventions object.',
      mimeType: 'application/json',
    },
    async (uri) => jsonResourceContents(uri, getLabConventions()),
  );

  mcpServer.registerResource(
    'lab-framework-industry-index',
    'lab://framework/industries',
    {
      title: 'Industry playbook index',
      description: `List of industries with playbook URIs. Keys: ${LAB_INDUSTRY_KEYS.join(', ')}.`,
      mimeType: 'application/json',
    },
    async (uri) =>
      jsonResourceContents(uri, {
        industries: LAB_INDUSTRY_KEYS.map((key) => ({
          key,
          resourceUri: `lab://framework/industries/${key}`,
        })),
      }),
  );

  mcpServer.registerResource(
    'lab-framework-brand-scrape-offline',
    'lab://framework/brand-scrape-offline',
    {
      title: 'Brand Scraper offline fallback workflow',
      description:
        'When crawl fails: lab_brand_scrape_brief → external LLM/manual ZIP → lab_brand_scrape_upload. Upload limits 30 MB / ~40 files.',
      mimeType: 'text/markdown',
    },
    async (uri) => textResourceContents(uri, brandScrapeOfflineResourceMarkdown()),
  );
}
