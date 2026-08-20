/**
 * Extracts Solutions Consultant Command Centre work items (customer
 * engagements, tasks, meetings) from a pasted screenshot and/or free text —
 * e.g. a deal board screenshot, an email, a deal request ID, or a prompt
 * brief — via Gemini vision/text, so an SC can populate their own Command
 * Centre (web/profile-viewer/home-new.html) without manual data entry.
 *
 * Auth-gated the same way as other per-user lab endpoints
 * (verifyIdTokenClaimsFromRequest, functions/labUserSandboxStore.js) — this
 * only extracts and returns structured JSON; the client merges it into the
 * caller's own Command Centre state (home-command-data.js), so there is no
 * new persistence layer here.
 */

'use strict';

const { setCors } = require('./httpCors');
const { verifyIdTokenClaimsFromRequest } = require('./labUserSandboxStore');

const MAX_TEXT_CHARS = 8000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB, matches typical Cloud Function body limits with headroom

const EXTRACT_SYSTEM = `You help a Solutions Consultant (SC) turn a pasted screenshot or note into structured work-tracking data for their own personal Command Centre. You will be given EITHER an image (a screenshot of a deal board, email, meeting invite, deal request ticket, etc.), OR free text (an email body, a deal request ID, a brief), OR both.

Extract only what is clearly present — never invent customer names, dates, or IDs that aren't actually shown. Return strict JSON matching this shape exactly:

{
  "customers": [
    { "name": string, "notes": string, "drLink": string, "status": one of ["On track","At risk","Delayed","Discovery","UAT","Stalled","Onboarding"], "nextAction": string, "eta": "YYYY-MM-DD or empty string" }
  ],
  "tasks": [
    { "title": string, "customerName": string, "due": "YYYY-MM-DD or empty string" }
  ],
  "meetings": [
    { "title": string, "customerName": string, "at": "YYYY-MM-DDTHH:MM:SS or empty string", "context": string }
  ]
}

Omit a field (use an empty string) rather than guessing. If nothing relevant is present, return empty arrays for all three. Never include anything that looks like a password, API key, credit card, or other credential — omit it and leave surrounding fields intact.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    customers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          notes: { type: 'string' },
          drLink: { type: 'string' },
          status: { type: 'string' },
          nextAction: { type: 'string' },
          eta: { type: 'string' },
        },
        required: ['name'],
      },
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          customerName: { type: 'string' },
          due: { type: 'string' },
        },
        required: ['title'],
      },
    },
    meetings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          customerName: { type: 'string' },
          at: { type: 'string' },
          context: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  required: ['customers', 'tasks', 'meetings'],
};

const ALLOWED_STATUSES = new Set(['On track', 'At risk', 'Delayed', 'Discovery', 'UAT', 'Stalled', 'Onboarding']);

function sanitiseCustomer(c) {
  if (!c || typeof c !== 'object' || !c.name) return null;
  return {
    name: String(c.name).trim().slice(0, 160),
    notes: String(c.notes || '').trim().slice(0, 2000),
    drLink: String(c.drLink || '').trim().slice(0, 200),
    status: ALLOWED_STATUSES.has(c.status) ? c.status : 'Discovery',
    nextAction: String(c.nextAction || '').trim().slice(0, 300),
    eta: /^\d{4}-\d{2}-\d{2}$/.test(String(c.eta || '')) ? c.eta : '',
  };
}

function sanitiseTask(t) {
  if (!t || typeof t !== 'object' || !t.title) return null;
  return {
    title: String(t.title).trim().slice(0, 200),
    customerName: String(t.customerName || '').trim().slice(0, 160),
    due: /^\d{4}-\d{2}-\d{2}$/.test(String(t.due || '')) ? t.due : '',
  };
}

function sanitiseMeeting(m) {
  if (!m || typeof m !== 'object' || !m.title) return null;
  return {
    title: String(m.title).trim().slice(0, 200),
    customerName: String(m.customerName || '').trim().slice(0, 160),
    at: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(m.at || '')) ? m.at : '',
    context: String(m.context || '').trim().slice(0, 300),
  };
}

async function callGeminiVision(systemPrompt, { text, imageBase64, imageMimeType }) {
  const { VertexAI } = require('@google-cloud/vertexai');
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
  const location = process.env.VERTEX_LOCATION || 'us-central1';
  const modelName = process.env.VERTEX_GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const vertex = new VertexAI({ project, location });
  const model = vertex.getGenerativeModel({
    model: modelName,
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const parts = [];
  if (imageBase64) {
    parts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType || 'image/png' } });
  }
  parts.push({ text: text || 'Extract any work items from the image above.' });

  const resp = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const candidates = resp && resp.response && resp.response.candidates;
  if (!candidates || !candidates.length) throw new Error('Gemini returned no candidates');
  const finish = candidates[0].finishReason;
  const respParts = (candidates[0].content && candidates[0].content.parts) || [];
  const raw = respParts.map((p) => p.text || '').join('').trim();
  if (!raw) throw new Error(`Gemini returned empty content (finishReason=${finish || 'unknown'})`);
  return JSON.parse(raw);
}

async function handleExtractWork(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }

  const claims = await verifyIdTokenClaimsFromRequest(req);
  if (!claims || !claims.uid) {
    res.status(401).json({ ok: false, error: 'Sign in required' });
    return;
  }

  const body = req.body || {};
  const text = String(body.text || '').trim().slice(0, MAX_TEXT_CHARS);
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const imageMimeType = typeof body.imageMimeType === 'string' ? body.imageMimeType : '';

  if (!text && !imageBase64) {
    res.status(400).json({ ok: false, error: 'Provide text and/or an image to extract from' });
    return;
  }
  if (imageBase64 && Buffer.byteLength(imageBase64, 'base64') > MAX_IMAGE_BYTES) {
    res.status(400).json({ ok: false, error: 'Image too large (max 8MB)' });
    return;
  }

  try {
    const extracted = await callGeminiVision(EXTRACT_SYSTEM, { text, imageBase64, imageMimeType });
    const customers = (Array.isArray(extracted.customers) ? extracted.customers : []).map(sanitiseCustomer).filter(Boolean);
    const tasks = (Array.isArray(extracted.tasks) ? extracted.tasks : []).map(sanitiseTask).filter(Boolean);
    const meetings = (Array.isArray(extracted.meetings) ? extracted.meetings : []).map(sanitiseMeeting).filter(Boolean);
    res.status(200).json({ ok: true, customers, tasks, meetings });
  } catch (err) {
    console.error('[homeCommandExtractWork] error', err);
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}

module.exports = { handleExtractWork };
