'use strict';

const HIGHLIGHT_LIMIT = 8;
const BODY_MAX = 220;

function stripMarkdown(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\!DNL\s+([^\]]+)\]/gi, '$1')
    .replace(/\[\!UICONTROL\s+([^\]]+)\]/gi, '$1')
    .replace(/\[\!BADGE[^\]]*\]\{[^}]*\}/gi, '')
    .replace(/<\/?(?:strong|em|code|br|p|ul|li|a)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateBody(body, max = BODY_MAX) {
  const cleaned = stripMarkdown(body);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function inferBadge(text) {
  const t = String(text || '');
  if (/\bcoming soon\b|\bsoon\b/i.test(t)) return 'Soon';
  if (/\blimited availability\b|\(LA\)/i.test(t)) return 'LA';
  if (/\bbeta\b/i.test(t) && !/formerly in beta|now generally available/i.test(t)) return 'Beta';
  if (/\bfix\b|fixed an issue|fixes and improvements/i.test(t)) return 'Fix';
  if (/generally available|\(General Availability\)|\bGA\b|now available to all/i.test(t)) return 'GA';
  if (/\binfra\b|infrastructure/i.test(t)) return 'Infra';
  if (/\bnew\b/i.test(t)) return 'New';
  return 'GA';
}

function splitByH2(markdown) {
  const parts = String(markdown || '').split(/^## /m);
  const out = {};
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const heading = part.slice(0, nl).replace(/\s*\{#.*\}$/, '').trim();
    out[heading] = part.slice(nl + 1);
  }
  return out;
}

function parseMarkdownTableRows(sectionText, { includeFixes = true } = {}) {
  const rows = [];
  const inFixes = /\*\*Fixes and improvements\*\*/i.test(sectionText);
  for (const line of String(sectionText || '').split('\n')) {
    if (!line.startsWith('|') || /\|\s*---/.test(line)) continue;
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    const head = cols[0].toLowerCase();
    if (head === 'feature' || head === 'fix' || head.includes('feature and description')) continue;
    const isFixRow = head === 'fix' || inFixes;
    if (!includeFixes && isFixRow) continue;
    rows.push({
      title: stripMarkdown(cols[0]),
      body: truncateBody(cols[1]),
      badge: inferBadge(`${cols[0]} ${cols[1]}`),
    });
  }
  return rows.filter((row) => row.title);
}

function parseAjoHtmlTables(sectionText) {
  const items = [];
  const tableRe = /<table>[\s\S]*?<thead>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<tbody>[\s\S]*?<td>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = tableRe.exec(String(sectionText || ''))) !== null) {
    const title = stripMarkdown(match[1]);
    const td = match[2];
    const paragraph = td.match(/<p>([\s\S]*?)<\/p>/i);
    const bodySource = paragraph ? paragraph[1] : td;
    items.push({
      title,
      body: truncateBody(bodySource),
      badge: inferBadge(`${title} ${td}`),
    });
  }
  return items.filter((row) => row.title);
}

function parseAjoBullets(sectionText) {
  const items = [];
  const re = /^\*\s+\*\*([^*]+)\*\*\s*-\s*(.+)$/gm;
  let match;
  while ((match = re.exec(String(sectionText || ''))) !== null) {
    items.push({
      title: stripMarkdown(match[1]),
      body: truncateBody(match[2]),
      badge: inferBadge(`${match[1]} ${match[2]}`),
    });
  }
  return items;
}

function extractSectionByAnchor(markdown, anchor) {
  const re = new RegExp(`###[^\\n]*\\{#${anchor}\\}[\\s\\S]*?(?=\\n### |\\n## |$)`, 'i');
  const match = String(markdown || '').match(re);
  return match ? match[0] : '';
}

function extractAjoMonthBlock(markdown, prefix) {
  if (prefix) {
    const anchored = new RegExp(`## [^\\n]*\\{#${prefix}-rn\\}[\\s\\S]*?(?=\\n## |$)`, 'i');
    const match = String(markdown || '').match(anchored);
    if (match) return match[0];
  }
  const fallback = String(markdown || '').match(/## [A-Za-z]+ '\d{2} release notes[\s\S]*?(?=\n## |$)/i);
  return fallback ? fallback[0] : String(markdown || '');
}

function parseAepPeriod(markdown) {
  const titleMatch = String(markdown || '').match(
    /^title:\s*Adobe Experience Platform Release Notes\s+(\w+\s+\d{4})/m,
  );
  if (titleMatch) return titleMatch[1];

  const h1Match = String(markdown || '').match(/^#\s+Adobe Experience Platform release notes\s+(\w+\s+\d{4})/im);
  if (h1Match) return h1Match[1];

  const releaseDateMatch = String(markdown || '').match(
    /\*\*Release date:\s*(\w+\s+\d{1,2},\s*\d{4})\*\*/,
  );
  if (releaseDateMatch) {
    const parsed = new Date(releaseDateMatch[1]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  return 'Current';
}

function periodToId(period) {
  const match = String(period || '').match(/^(\w+)\s+(\d{4})$/);
  if (!match) return 'current';
  return `${match[1].toLowerCase()}-${match[2]}`;
}

function periodToAjoPrefix(period) {
  const match = String(period || '').match(/^(\w+)\s+(\d{4})$/);
  if (!match) return null;
  return `${match[1].toLowerCase()}-${match[2].slice(-2)}`;
}

function takeHighlights(items, limit = HIGHLIGHT_LIMIT) {
  return items.slice(0, limit);
}

function buildSections(title, items) {
  if (!items.length) return [];
  return [{ title, items }];
}

function parseAepCdpProduct(markdown, releaseNotesUrl) {
  const sectionsByHeading = splitByH2(markdown);
  const sectionDefs = [
    { title: 'Destinations & Activation', keys: ['Destinations'] },
    {
      title: 'Data, Profiles & Operations',
      keys: [
        'Real-Time Customer Profile',
        'Segmentation Service',
        'Sources',
        'Experience Data Model (XDM)',
        'Query Service',
        'Run and Operate',
        'Agent Orchestrator',
      ],
    },
  ];

  const sections = [];
  const allItems = [];

  for (const def of sectionDefs) {
    const items = [];
    for (const key of def.keys) {
      const body = sectionsByHeading[key];
      if (!body) continue;
      const featureBlock = body.split(/\*\*Fixes and improvements\*\*/i)[0];
      items.push(...parseMarkdownTableRows(featureBlock, { includeFixes: false }));
    }
    if (items.length) {
      sections.push({ title: def.title, items });
      allItems.push(...items);
    }
  }

  return {
    id: 'cdp',
    name: 'Real-Time CDP',
    shortName: 'CDP',
    releaseNotesUrl,
    highlights: takeHighlights(allItems),
    sections,
  };
}

function parseAjoSectionProduct(markdown, prefix, anchorSuffix, meta) {
  const monthBlock = extractAjoMonthBlock(markdown, prefix);
  const section = extractSectionByAnchor(monthBlock, `${prefix}-${anchorSuffix}`);
  const items = [
    ...parseAjoHtmlTables(section),
    ...parseAjoBullets(section),
  ];
  return {
    ...meta,
    highlights: takeHighlights(items),
    sections: buildSections(meta.sectionTitle || meta.name, items),
  };
}

function parseAjoAggregateProduct(markdown, prefix, releaseNotesUrl) {
  const monthBlock = extractAjoMonthBlock(markdown, prefix);
  const subsections = [...monthBlock.matchAll(/^### ([^\n{]+)(?:\s*\{#([^}]+)\})?/gm)];
  const items = [];
  for (const sub of subsections) {
    const anchor = sub[2];
    if (!anchor || !anchor.startsWith(`${prefix}-`)) continue;
    const chunk = extractSectionByAnchor(monthBlock, anchor);
    items.push(...parseAjoHtmlTables(chunk), ...parseAjoBullets(chunk));
  }
  return {
    id: 'ajo',
    name: 'Adobe Journey Optimizer',
    shortName: 'AJO',
    releaseNotesUrl,
    highlights: takeHighlights(items),
    sections: items.length ? [{ title: 'Latest release', items }] : [],
  };
}

function parseCjaProduct(markdown, releaseNotesUrl) {
  const periodMatch = String(markdown || '').match(/^#\s+Current Customer Journey Analytics release notes \(([^)]+)\)/im);
  const featureSection = String(markdown || '').split('## New or updated features')[1] || '';
  const tablePart = featureSection.split('### Fixes')[0] || featureSection;
  const items = [];

  for (const line of tablePart.split('\n')) {
    if (!line.startsWith('|') || /\|\s*---/.test(line)) continue;
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.length < 1 || /feature and description/i.test(cols[0])) continue;
    const first = cols[0];
    const titleMatch = first.match(/\*\*([^*]+)\*\*/);
    if (!titleMatch) continue;
    const body = first.replace(/\*\*[^*]+\*\*/, '').replace(/^<br\/?>/i, '');
    items.push({
      title: stripMarkdown(titleMatch[1]),
      body: truncateBody(body),
      badge: inferBadge(first),
    });
  }

  return {
    id: 'cja',
    name: 'Customer Journey Analytics',
    shortName: 'CJA',
    releaseNotesUrl,
    highlights: takeHighlights(items),
    sections: buildSections(periodMatch ? `CJA — ${periodMatch[1]}` : 'Latest features', items),
  };
}

function parseBrandConciergeProduct(markdown, releaseNotesUrl) {
  const monthSections = [...String(markdown || '').matchAll(/^## ([A-Z][a-z]+ \d{4})\s*\{#([^}]+)\}/gm)];
  if (!monthSections.length) {
    return {
      id: 'brandConcierge',
      name: 'Brand Concierge',
      shortName: 'Concierge',
      releaseNotesUrl,
      highlights: [],
      sections: [],
    };
  }

  const latest = monthSections[0][1];
  const blockRe = new RegExp(
    `## ${latest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n## |$)`,
  );
  const block = String(markdown || '').match(blockRe)?.[0] || '';
  const items = [];
  for (const line of block.split('\n')) {
    const match = line.match(/^\*\s+\*\*([^*]+)\*\*(?:\s*\(([^)]+)\))?\s*:\s*(.+)$/);
    if (!match) continue;
    items.push({
      title: stripMarkdown(match[1]),
      body: truncateBody(match[3]),
      badge: inferBadge(match[2] || match[3]),
    });
  }

  return {
    id: 'brandConcierge',
    name: 'Brand Concierge',
    shortName: 'Concierge',
    releaseNotesUrl,
    highlights: takeHighlights(items),
    sections: buildSections(latest, items),
  };
}

function parseTargetProduct(markdown, releaseNotesUrl) {
  const items = [];
  for (const block of String(markdown || '').matchAll(/\+\+\+See details([\s\S]*?)\+\+\+/g)) {
    for (const line of block[1].split('\n')) {
      const match = line.match(/^\*\s+\*\*([^*]+)\.\*\*\s*(.+)$/);
      if (!match) continue;
      items.push({
        title: stripMarkdown(match[1]),
        body: truncateBody(match[2]),
        badge: inferBadge(match[2]),
      });
    }
  }

  return {
    id: 'target',
    name: 'Adobe Target',
    shortName: 'Target',
    releaseNotesUrl,
    highlights: takeHighlights(items),
    sections: buildSections('Recent fixes & updates', items),
  };
}

function parseCampaignProduct(markdown, releaseNotesUrl) {
  const block = String(markdown || '').match(/## [A-Za-z]+ '\d{2} release[\s\S]*?(?=\n## |$)/i)?.[0] || '';
  const items = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('*') || line.includes('<!--')) continue;
    const text = stripMarkdown(line.replace(/^\*\s+/, ''));
    if (!text) continue;
    const title = text.split(/[.!]/)[0].slice(0, 100);
    items.push({
      title,
      body: truncateBody(text),
      badge: 'GA',
    });
  }

  return {
    id: 'campaign',
    name: 'Campaign v8 Web',
    shortName: 'Campaign',
    releaseNotesUrl,
    highlights: takeHighlights(items),
    sections: buildSections('Latest release', items),
  };
}

module.exports = {
  BODY_MAX,
  HIGHLIGHT_LIMIT,
  stripMarkdown,
  truncateBody,
  inferBadge,
  parseAepPeriod,
  periodToId,
  periodToAjoPrefix,
  parseAepCdpProduct,
  parseAjoSectionProduct,
  parseAjoAggregateProduct,
  parseCjaProduct,
  parseBrandConciergeProduct,
  parseTargetProduct,
  parseCampaignProduct,
  parseMarkdownTableRows,
  parseAjoHtmlTables,
};
