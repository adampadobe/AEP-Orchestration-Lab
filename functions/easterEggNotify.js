/**
 * POST /api/easter-egg-found — records Marauder's Map "register" signings and optionally emails lab owners.
 * Optional Mailgun: secrets EASTER_EGG_MAILGUN_API_KEY + EASTER_EGG_MAILGUN_DOMAIN (use "skip" to disable mail).
 * Env EASTER_EGG_MAIL_FROM must be an address on that Mailgun domain; EASTER_EGG_MAILGUN_REGION = '' (US) or 'eu'.
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

async function sendMailgunEmail({ apiKey, domain, region, fromEmail, subject, text, recipients }) {
  if (!apiKey || apiKey === 'disabled' || apiKey === 'skip' || apiKey.length < 8) {
    return { skipped: true };
  }
  if (!domain || domain === 'skip' || String(domain).trim().length < 2) {
    return { skipped: true, reason: 'no_domain' };
  }
  if (!fromEmail || !String(fromEmail).includes('@')) {
    return { skipped: true, reason: 'no_from' };
  }
  const base =
    String(region || '').toLowerCase() === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const url = `${base}/v3/${encodeURIComponent(String(domain).trim())}/messages`;
  const params = new URLSearchParams();
  const from = `AEP Orchestration Lab <${String(fromEmail).trim()}>`;
  params.append('from', from);
  recipients.forEach((to) => params.append('to', to));
  params.append('subject', subject);
  params.append('text', text);
  const auth = Buffer.from(`api:${apiKey}`, 'utf8').toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Mailgun ${res.status}: ${raw.slice(0, 500)}`);
  }
  return { sent: true };
}

async function handleEasterEggNotify(req, res, deps) {
  const {
    mailgunKey,
    mailgunDomain,
    mailFrom,
    mailgunRegion,
  } = deps;
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
      emailResult = await sendMailgunEmail({
        apiKey: mailgunKey,
        domain: mailgunDomain,
        region: mailgunRegion,
        fromEmail: mailFrom,
        subject,
        text,
        recipients: RECIPIENTS,
      });
    } catch (e) {
      console.error('[easterEggNotify] Mailgun failed', e.message || e);
      emailResult = { error: String(e.message || e) };
    }
  }

  res.status(200).json({
    ok: true,
    docId,
    email: emailResult.sent ? 'sent' : emailResult.skipped ? 'skipped' : 'failed',
  });
}

const FLAVOR_LABEL = {
  home: 'Home',
  journeys: 'Journeys',
  catalog: 'Catalog',
  profile: 'Profile',
};

/** GET — public roster of register signings (names + flavor + time), newest first. */
async function handleEasterEggList(req, res) {
  try {
    const snap = await getDb()
      .collection('easterEggFinds')
      .orderBy('createdAt', 'desc')
      .limit(150)
      .get();

    const entries = snap.docs.map((doc) => {
      const x = doc.data();
      let at = null;
      if (x.createdAt && typeof x.createdAt.toDate === 'function') {
        at = x.createdAt.toDate().toISOString();
      }
      const name = sanitizeName(x.name) || 'Anonymous';
      const flavor = sanitizeFlavor(x.flavor);
      return {
        name,
        flavor,
        flavorLabel: FLAVOR_LABEL[flavor] || flavor,
        at,
      };
    });

    res.status(200).json({
      ok: true,
      entries,
      total: entries.length,
    });
  } catch (e) {
    console.error('[easterEggNotify] list failed', e);
    res.status(500).json({ ok: false, error: 'Could not load the roster.' });
  }
}

module.exports = { handleEasterEggNotify, handleEasterEggList };
