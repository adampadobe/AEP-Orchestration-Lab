/**
 * POST /api/easter-egg-found — records Marauder's Map "register" signings and optionally emails lab owners.
 * Optional SendGrid: set secret EASTER_EGG_SENDGRID_API_KEY (use "skip" to disable) and param EASTER_EGG_MAIL_FROM (verified sender).
 */
const admin = require('firebase-admin');

const RECIPIENTS = ['apalmer@adobe.com', 'kirkham@adobe.com'];
const ALLOWED_FLAVORS = new Set(['home', 'journeys', 'catalog', 'profile']);

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function sanitizeName(name) {
  const s = String(name || '').trim();
  if (s.length < 1 || s.length > 120) return null;
  return s.replace(/[\x00-\x1f<>]/g, '').slice(0, 120);
}

function sanitizeFlavor(flavor) {
  const f = String(flavor || 'home').trim().toLowerCase();
  return ALLOWED_FLAVORS.has(f) ? f : 'home';
}

function sanitizePage(page) {
  const p = String(page || '').trim().slice(0, 500);
  return p.replace(/[\x00-\x1f<>]/g, '') || '(unknown)';
}

async function sendSendgridEmail({ apiKey, fromEmail, subject, text }) {
  if (!apiKey || apiKey === 'disabled' || apiKey === 'skip' || apiKey.length < 8) {
    return { skipped: true };
  }
  if (!fromEmail || !String(fromEmail).includes('@')) {
    return { skipped: true, reason: 'no_from' };
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: RECIPIENTS.map((email) => ({ email })) }],
      from: { email: String(fromEmail).trim(), name: 'AEP Orchestration Lab' },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`SendGrid ${res.status}: ${t.slice(0, 500)}`);
  }
  return { sent: true };
}

async function handleEasterEggNotify(req, res, { sendgridKey, mailFrom }) {
  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const name = sanitizeName(body.name);
  if (!name) {
    res.status(400).json({ error: 'Name is required (1–120 characters).' });
    return;
  }

  const flavor = sanitizeFlavor(body.flavor);
  const page = sanitizePage(body.page);
  const ua = String(req.get('user-agent') || '').slice(0, 400);
  const ip =
    String(req.get('x-forwarded-for') || req.socket?.remoteAddress || '')
      .split(',')[0]
      .trim()
      .slice(0, 64) || 'unknown';

  const record = {
    name,
    flavor,
    page,
    userAgent: ua,
    clientIp: ip,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  let docId;
  try {
    const ref = await getDb().collection('easterEggFinds').add(record);
    docId = ref.id;
  } catch (e) {
    console.error('[easterEggNotify] Firestore write failed', e);
    res.status(500).json({ error: 'Could not save signing. Try again later.' });
    return;
  }

  const subject = `Mischief managed: ${name} found the map (${flavor})`;
  const text = [
    `Someone signed the Marauder's Map register.`,
    ``,
    `Name: ${name}`,
    `Flavor / page: ${flavor}`,
    `Path: ${page}`,
    `Firestore doc: ${docId}`,
    ``,
    `— AEP Orchestration Lab easter egg`,
  ].join('\n');

  let emailResult = { skipped: true };
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    emailResult = { skipped: true, reason: 'emulator' };
  } else {
    try {
      emailResult = await sendSendgridEmail({
        apiKey: sendgridKey,
        fromEmail: mailFrom,
        subject,
        text,
      });
    } catch (e) {
      console.error('[easterEggNotify] SendGrid failed', e.message || e);
      emailResult = { error: String(e.message || e) };
    }
  }

  res.status(200).json({
    ok: true,
    docId,
    email: emailResult.sent ? 'sent' : emailResult.skipped ? 'skipped' : 'failed',
  });
}

module.exports = { handleEasterEggNotify };
