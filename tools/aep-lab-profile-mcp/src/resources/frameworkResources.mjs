import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  frameworkConventionsMarkdown,
  frameworkOverviewMarkdown,
  getExecutionFramework,
  getIndustryPlaybook,
  getLabConventions,
} from '../framework/labFramework.mjs';
import { LAB_INDUSTRY_KEYS } from '../industries.mjs';

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
}
