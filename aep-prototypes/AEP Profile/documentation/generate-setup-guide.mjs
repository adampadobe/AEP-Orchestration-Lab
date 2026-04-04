/**
 * Generates shareable setup documentation: DOCX + PPTX for AEP Profile / Profile Viewer configuration.
 * Run from this folder: npm install && npm run generate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ImageRun,
  ExternalHyperlink,
} from 'docx';
import pptxgen from 'pptxgenjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const SHOT_DIR = path.join(__dirname, 'screenshots');

const PLACEHOLDER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOsnAAAAAElFTkSuQmCC';

function ensureShotDir() {
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const placeholderPath = path.join(SHOT_DIR, '_placeholder.png');
  if (!fs.existsSync(placeholderPath)) {
    fs.writeFileSync(placeholderPath, Buffer.from(PLACEHOLDER_PNG_B64, 'base64'));
  }
}

/** First existing path, else placeholder */
function resolveImage(preferredNames) {
  ensureShotDir();
  const placeholder = path.join(SHOT_DIR, '_placeholder.png');
  for (const name of preferredNames) {
    const p = path.join(SHOT_DIR, name);
    if (fs.existsSync(p) && fs.statSync(p).size > 100) return p;
  }
  return placeholder;
}

function cellPara(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });
}

function bulletParas(items) {
  return items.map(
    (t) =>
      new Paragraph({
        text: t,
        bullet: { level: 0 },
        spacing: { after: 100 },
      })
  );
}

function linkPara(label, url) {
  return new Paragraph({
    children: [
      new ExternalHyperlink({
        children: [
          new TextRun({
            text: label,
            style: 'Hyperlink',
            color: '0563C1',
            underline: { type: 'single' },
          }),
        ],
        link: url,
      }),
    ],
    spacing: { after: 160 },
  });
}

function tableFromRows(rows, header = true) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
  const tableRows = rows.map((cells, ri) => {
    const isHeader = header && ri === 0;
    return new TableRow({
      children: cells.map(
        (text) =>
          new TableCell({
            children: [cellPara(String(text), { bold: isHeader })],
            width: { size: 50, type: WidthType.PERCENTAGE },
          })
      ),
    });
  });
  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function buildDocx() {
  ensureShotDir();
  const devImg = resolveImage(['01-adobe-developer-console.png', 'developer-console.png']);
  const sourcesImg = resolveImage(['02-aep-sources-http-api.png', 'http-api-source.png']);
  const dataflowImg = resolveImage(['03-dataflow-api-usage.png', 'dataflow.png']);
  const viewerImg = resolveImage(['04-profile-viewer-localhost.png', 'profile-viewer.png']);

  const imageBlock = async (filePath, caption, dimsOverride) => {
    const buf = fs.readFileSync(filePath);
    const isPlaceholder = path.basename(filePath) === '_placeholder.png';
    const dims =
      dimsOverride ||
      (isPlaceholder ? { width: 400, height: 300 } : { width: 500, height: 280 });
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: buf,
            transformation: dims,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: isPlaceholder ? `[Add screenshot] ${caption}` : caption,
            italics: true,
            size: 20,
          }),
        ],
        spacing: { after: 240 },
      }),
    ];
  };

  const sections = [
    new Paragraph({
      text: 'AEP Profile toolkit — configuration guide',
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'This guide helps you configure Adobe I/O authentication and the Profile Viewer web app so your team can query profiles, use search, stream profile updates, and related features. All secrets stay in local ',
        }),
        new TextRun({ text: '.env', bold: true }),
        new TextRun({ text: ' files — never commit credentials.' }),
      ],
      spacing: { after: 200 },
    }),
    ...(await imageBlock(
      resolveImage(['00-setup-flow-overview.png']),
      'Figure 0 — Configuration flow (overview diagram)',
      { width: 624, height: 351 }
    )),

    new Paragraph({ text: '1. Prerequisites', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    ...bulletParas([
      'Node.js (LTS) installed.',
      'Access to Adobe Experience Platform (sandbox) and Adobe Developer Console.',
      'Repository: AEP Profile project (folders 00 Adobe Auth, 03 Profile Viewer).',
    ]),

    new Paragraph({ text: '2. Adobe I/O — 00 Adobe Auth', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    new Paragraph({
      text: 'Create or open a project in Adobe Developer Console with a Service Account (OAuth) integration. Copy credentials into 00 Adobe Auth/.env.',
      spacing: { after: 160 },
    }),
    linkPara('Adobe Developer Console', 'https://developer.adobe.com/console'),
    ...(await imageBlock(devImg, 'Figure 1 — Service Account / OAuth credentials (example)')),

    new Paragraph({ text: 'Required variables (00 Adobe Auth/.env)', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 120 } }),
    tableFromRows(
      [
        ['Variable', 'Description'],
        ['ADOBE_CLIENT_ID', 'API Key (Client ID) from the integration'],
        ['ADOBE_CLIENT_SECRET', 'Client secret'],
        ['ADOBE_IMS_HOST', 'e.g. ims-na1.adobelogin.com or ims-eu1.adobelogin.com'],
        ['ADOBE_SCOPES', 'Space-separated scopes matching your project'],
        ['ADOBE_ORG_ID', 'Org ID, e.g. XXXXX@AdobeOrg'],
        ['ADOBE_SANDBOX_NAME', 'AEP sandbox name, e.g. production sandbox short name'],
      ],
      true
    ),
    new Paragraph({ text: '', spacing: { after: 200 } }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Verify: ', bold: true }),
        new TextRun({ text: 'From 00 Adobe Auth run: ' }),
        new TextRun({ text: 'npm install', font: 'Consolas' }),
        new TextRun({ text: ' then ' }),
        new TextRun({ text: 'npm run test-auth', font: 'Consolas' }),
        new TextRun({ text: '. You should see config and token length without errors.' }),
      ],
      spacing: { after: 200 },
    }),

    new Paragraph({ text: 'Postman mapping (optional)', heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 120 } }),
    tableFromRows(
      [
        ['Postman / environment', '.env variable'],
        ['API_KEY', 'ADOBE_CLIENT_ID'],
        ['CLIENT_SECRET', 'ADOBE_CLIENT_SECRET'],
        ['ORG_ID / IMS_ORG', 'ADOBE_ORG_ID'],
        ['x-sandbox-name', 'ADOBE_SANDBOX_NAME'],
      ],
      true
    ),
    new Paragraph({ text: '', spacing: { after: 200 } }),

    new Paragraph({ text: '3. Profile Viewer — 03 Profile Viewer', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Copy ' }),
        new TextRun({ text: '.env.example', font: 'Consolas' }),
        new TextRun({ text: ' to ' }),
        new TextRun({ text: '.env', font: 'Consolas' }),
        new TextRun({ text: ' in the Profile Viewer folder. Edit values for your org.' }),
      ],
      spacing: { after: 160 },
    }),
    ...bulletParas([
      'AEP_QUERY_PROFILE_DATASET_ID — Profile dataset name or ID for Query Service search (required for search).',
      'AEP_PROFILE_STREAMING_URL — DCS collection URL from HTTP API source (for Update profile streaming).',
      'AEP_PROFILE_FLOW_ID — Dataflow ID (x-adobe-flow-id) for that streaming pipeline.',
      'Optional: AEP_PROFILE_STREAMING_API_KEY, envelope flags, event/trigger URLs — see .env.example comments.',
    ]),

    new Paragraph({ text: '4. Streaming profile updates (AEP UI)', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    ...bulletParas([
      'Sources → HTTP API: create connection; copy collection URL.',
      'Set up dataflow to the Profile dataset; configure Data Prep mapping to your schema.',
      'From dataflow API Usage / details: note Dataflow ID and Dataset ID.',
      'Put collection URL and flow ID in Profile Viewer .env; restart npm start.',
    ]),
    ...(await imageBlock(sourcesImg, 'Figure 2 — AEP Sources: HTTP API (example)')),
    ...(await imageBlock(dataflowImg, 'Figure 3 — Dataflow / API usage (example)')),

    new Paragraph({ text: '5. Run the app', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    new Paragraph({
      children: [
        new TextRun({ text: 'From ', italics: true }),
        new TextRun({ text: '03 Profile Viewer', font: 'Consolas', italics: true }),
        new TextRun({ text: ': ', italics: true }),
        new TextRun({ text: 'npm start', font: 'Consolas', bold: true }),
      ],
      spacing: { after: 120 },
    }),
    ...bulletParas([
      'http://localhost:3333 — profile lookup by email',
      'http://localhost:3333/search.html — profile search (partial email)',
    ]),
    new Paragraph({
      text: 'Do not open HTML via file:// or Live Server; API routes require the Node server.',
      spacing: { after: 160 },
    }),
    ...(await imageBlock(viewerImg, 'Figure 4 — Profile Viewer in the browser (example)')),

    new Paragraph({ text: '6. Security notes', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    ...bulletParas([
      '.env is gitignored — do not commit secrets.',
      'Production: consider Azure Key Vault for client ID/secret (see 00 Adobe Auth README).',
    ]),

    new Paragraph({ text: '7. Adding your own screenshots', heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Save PNG files under ', italics: true }),
        new TextRun({ text: 'AEP Profile/documentation/screenshots/', font: 'Consolas', italics: true }),
        new TextRun({
          text: ' (see WHICH-FILES.txt there for filenames), then run ',
          italics: true,
        }),
        new TextRun({ text: 'npm run generate', font: 'Consolas', italics: true }),
        new TextRun({
          text: ' in the documentation folder again to refresh this Word file and the PowerPoint deck.',
          italics: true,
        }),
      ],
      spacing: { after: 200 },
    }),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children: sections.flat() }],
  });

  const out = path.join(OUT_DIR, 'AEP-Profile-Viewer-Setup-Guide.docx');
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
}

function buildPptx() {
  ensureShotDir();
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'AEP Profile documentation';
  pptx.title = 'AEP Profile — Setup & configuration';

  const addSlide = (title, bullets, imageCandidates = [], caption = '') => {
    const slide = pptx.addSlide();
    slide.addText(title, { x: 0.5, y: 0.35, w: 9, h: 0.6, fontSize: 28, bold: true, color: '1a1a1a' });
    const hasFig = Array.isArray(imageCandidates) && imageCandidates.length > 0;
    if (bullets?.length) {
      slide.addText(bullets.map((t) => ({ text: t, options: { bullet: true, indentLevel: 0 } })), {
        x: 0.5,
        y: 1.1,
        w: hasFig ? 4.4 : 8.8,
        h: 3.2,
        fontSize: 14,
        color: '333333',
        valign: 'top',
      });
    }
    const imgPath = resolveImage(imageCandidates);
    const hasReal = path.basename(imgPath) !== '_placeholder.png';
    if (hasFig) {
      slide.addImage({
        path: imgPath,
        x: 5.1,
        y: 1.05,
        w: 4.35,
        h: 3.25,
        sizing: { type: 'contain', w: 4.35, h: 3.25 },
      });
      slide.addText(hasReal ? caption : `[Add screenshot] ${caption}`, {
        x: 5.1,
        y: 4.35,
        w: 4.35,
        h: 0.5,
        fontSize: 11,
        italic: true,
        color: '666666',
      });
    }
  };

  const titleSlide = pptx.addSlide();
  titleSlide.addText('AEP Profile toolkit', { x: 0.5, y: 1.6, w: 9, h: 1, fontSize: 36, bold: true, color: 'E31837' });
  titleSlide.addText('Configuration guide — Adobe Auth & Profile Viewer', {
    x: 0.5,
    y: 2.55,
    w: 9,
    h: 0.8,
    fontSize: 20,
    color: '333333',
  });
  titleSlide.addText('Secrets stay in .env (never commit). Node.js + AEP sandbox required.', {
    x: 0.5,
    y: 3.45,
    w: 9,
    h: 0.6,
    fontSize: 14,
    color: '555555',
  });

  const overviewPath = resolveImage(['00-setup-flow-overview.png']);
  const overviewSlide = pptx.addSlide();
  overviewSlide.addText('Configuration flow overview', {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: '1a1a1a',
  });
  overviewSlide.addImage({
    path: overviewPath,
    x: 0.35,
    y: 0.95,
    w: 9.3,
    h: 4.85,
    sizing: { type: 'contain', w: 9.3, h: 4.85 },
  });
  if (path.basename(overviewPath) === '_placeholder.png') {
    overviewSlide.addText('[Add 00-setup-flow-overview.png — or run generator with bundled diagram]', {
      x: 0.5,
      y: 5.05,
      w: 9,
      h: 0.45,
      fontSize: 11,
      italic: true,
      color: '666666',
    });
  }

  addSlide('Prerequisites', [
    'Install Node.js (LTS)',
    'Adobe Developer Console project (Service Account)',
    'AEP sandbox access',
  ]);

  addSlide(
    '00 Adobe Auth — .env',
    [
      'ADOBE_CLIENT_ID / SECRET — from Developer Console',
      'ADOBE_IMS_HOST — NA or EU IMS host',
      'ADOBE_SCOPES — must match integration',
      'ADOBE_ORG_ID — org@AdobeOrg',
      'ADOBE_SANDBOX_NAME — AEP sandbox',
      'Verify: npm run test-auth',
    ],
    ['01-adobe-developer-console.png', 'developer-console.png'],
    'Developer Console credentials'
  );

  addSlide(
    '03 Profile Viewer — .env',
    [
      'Copy .env.example → .env',
      'AEP_QUERY_PROFILE_DATASET_ID — search / Query Service table',
      'AEP_PROFILE_STREAMING_URL — DCS collection URL',
      'AEP_PROFILE_FLOW_ID — dataflow ID',
      'Optional: streaming API key, event URLs — see .env.example',
    ]
  );

  addSlide(
    'Streaming: HTTP API source',
    [
      'Sources → HTTP API — create connection',
      'Copy collection URL to AEP_PROFILE_STREAMING_URL',
      'Dataflow → Profile dataset + Data Prep',
      'Note flow ID for AEP_PROFILE_FLOW_ID',
    ],
    ['02-aep-sources-http-api.png', 'http-api-source.png'],
    'AEP Sources — HTTP API'
  );

  addSlide(
    'Run Profile Viewer',
    [
      'cd "03 Profile Viewer" && npm start',
      'http://localhost:3333 — lookup by email',
      '/search.html — partial email search',
      'Serve via Node — not file:// or Live Server',
    ],
    ['04-profile-viewer-localhost.png', 'profile-viewer.png'],
    'Local app in browser'
  );

  addSlide('Security & sharing', [
    '.env is gitignored',
    'Map from Postman env if you use EMEA Demo',
    'Key Vault option in 00 Adobe Auth README',
    'Add PNGs per screenshots/WHICH-FILES.txt — npm run generate to refresh',
  ]);

  const out = path.join(OUT_DIR, 'AEP-Profile-Viewer-Setup-Guide.pptx');
  pptx.writeFile({ fileName: out });
  console.log('Wrote', out);
}

ensureShotDir();
await buildDocx();
buildPptx();
