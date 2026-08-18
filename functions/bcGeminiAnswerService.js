/**
 * Answers one Brand Concierge turn from the stored per-demo Gemini corpus
 * (see functions/bcGeminiTrainingService.js) via vertexClient.callGemini,
 * for the client-side Gemini override at
 * web/profile-viewer/embed-bc/embed-bc-gemini-override.js.
 *
 * Uses controlled JSON generation (responseSchema) so the client can trust
 * the shape without fragile prompt-engineered parsing.
 */

'use strict';

const admin = require('firebase-admin');
const { callGemini } = require('./vertexClient');
const { setCors } = require('./httpCors');
const { corpusDocId, COLLECTION } = require('./bcGeminiTrainingService');

const MAX_MESSAGE_CHARS = 4000;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
          productDescription: { type: 'string' },
          productPageURL: { type: 'string' },
          productImageURL: { type: 'string' },
        },
        required: ['productName'],
      },
    },
  },
  required: ['message', 'products'],
};

/** Renders one structured product entry as a labelled block Gemini can copy fields from verbatim. */
function formatProductForPrompt(p, index) {
  if (!p || typeof p !== 'object') return null;
  const name = p.productName || `Product ${index + 1}`;
  const parts = [`${index + 1}. ${name}`];
  if (p.productDescription) parts.push(`   Description: ${p.productDescription}`);
  if (p.productPageURL) parts.push(`   productPageURL: ${p.productPageURL}`);
  if (p.productImageURL) parts.push(`   productImageURL: ${p.productImageURL}`);
  return parts.join('\n');
}

function buildSystemPrompt(corpusRecord) {
  const corpus = (corpusRecord && corpusRecord.corpus) || {};
  const brandNames = Array.isArray(corpus.brandNames) && corpus.brandNames.length ? corpus.brandNames.join(', ') : null;
  const products = Array.isArray(corpus.products) ? corpus.products : [];
  const images = Array.isArray(corpus.images) ? corpus.images : [];
  const productBlocks = products.map(formatProductForPrompt).filter(Boolean);

  const lines = [
    'You are a helpful, on-brand chat concierge for a live sales demo.',
    brandNames ? `You represent: ${brandNames}.` : 'You represent the brand described below.',
    'Answer the user\'s question naturally and conversationally, grounded ONLY in the brand facts, product list, and notes provided below.',
    'If the answer genuinely is not covered by the material below, say so honestly and suggest what related topic you *can* help with — do not invent facts.',
    'If specific products from the PRODUCT LIST are relevant to the answer, include them in the "products" array. Copy productPageURL and productImageURL EXACTLY, character-for-character, from the matching entry below — never invent, guess, or modify a URL. If a product from the list has no productPageURL/productImageURL listed, omit that field entirely rather than making one up. Only include products that are NOT in the list below without page/image URLs.',
    'Keep the "message" concise — a few sentences, not an essay.',
    '',
    '--- BRAND FACTS (scraped from the brand\'s own website) ---',
    corpus.text || '(no site content provided yet)',
    '',
    '--- PRODUCT LIST (productPageURL/productImageURL are real, verified URLs — copy them exactly) ---',
    productBlocks.length ? productBlocks.join('\n') : '(no product list provided yet)',
  ];

  if (images.length) {
    lines.push(
      '',
      '--- OTHER SITE IMAGE URLS (generic images scraped from the site — only use one of these for a product that has no productImageURL of its own above, and only if clearly relevant) ---',
      images.join('\n'),
    );
  }
  if (corpus.manifestText) {
    lines.push('', '--- ADDITIONAL NOTES ---', corpus.manifestText);
  }

  return lines.join('\n');
}

async function handleAnswer(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  const body = req.body || {};
  const sandbox = String(body.sandbox || '').trim();
  const demoPrefix = String(body.demoPrefix || '').trim();
  const message = String(body.message || '').trim().slice(0, MAX_MESSAGE_CHARS);

  if (!sandbox || !demoPrefix) {
    res.status(400).json({ ok: false, error: 'sandbox and demoPrefix are required' });
    return;
  }
  if (!message) {
    res.status(400).json({ ok: false, error: 'message is required' });
    return;
  }

  try {
    const docId = corpusDocId(sandbox, demoPrefix);
    const snap = await getDb().collection(COLLECTION).doc(docId).get();
    const corpusRecord = snap.exists ? snap.data() : null;

    const systemPrompt = buildSystemPrompt(corpusRecord);
    const text = await callGemini(systemPrompt, message, {
      jsonMode: true,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.5,
      maxOutputTokens: 2048,
    });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`Gemini returned unparseable JSON: ${String(parseErr.message || parseErr)}`);
    }

    res.status(200).json({
      ok: true,
      message: String(parsed.message || ''),
      products: Array.isArray(parsed.products) ? parsed.products : [],
    });
  } catch (err) {
    console.error('[bcGeminiAnswer] error', err);
    res.status(200).json({
      ok: false,
      message: "I'm having trouble reaching my knowledge base right now — please try asking again in a moment.",
      products: [],
      error: String((err && err.message) || err),
    });
  }
}

module.exports = { handleAnswer };
