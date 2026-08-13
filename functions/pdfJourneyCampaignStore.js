'use strict';

const admin = require('firebase-admin');
const core = require('./pdfPersonalisationCore');
const journeyAction = require('./pdfJourneyActionService');

const COLLECTION = 'pdfJourneyCampaignConfig';
const MAX_CAMPAIGNS = 30;

function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp();
}

function getFirestore(deps = {}) {
  if (deps.firestore) return deps.firestore;
  ensureAdmin();
  return admin.firestore();
}

function configId(ownerUid, sandbox) {
  return core.sha256(`${String(ownerUid || '')}\n${String(sandbox || 'default')}`).slice(0, 40);
}

function cleanCampaign(item) {
  const name = String(item && item.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const campaignId = String(item && item.campaignId || '').trim();
  if (!name) throw new core.PdfPersonalisationError('Campaign name is required.', 400, 'PDF_JOURNEY_CAMPAIGN_NAME_REQUIRED');
  journeyAction.resolveCampaignId(campaignId);
  return { name, campaignId };
}

function normaliseCampaigns(value) {
  const campaigns = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value.slice(0, MAX_CAMPAIGNS) : []) {
    const campaign = cleanCampaign(item);
    if (seen.has(campaign.campaignId)) continue;
    seen.add(campaign.campaignId);
    campaigns.push(campaign);
  }
  return campaigns;
}

async function listCampaigns(ownerUid, sandbox, deps = {}) {
  const snapshot = await getFirestore(deps).collection(COLLECTION).doc(configId(ownerUid, sandbox)).get();
  const saved = snapshot.exists ? normaliseCampaigns((snapshot.data() || {}).campaigns) : [];
  if (saved.length) return saved;
  return [{ name: 'Default PDF transactional campaign', campaignId: journeyAction.DEFAULT_CAMPAIGN_ID }];
}

async function saveCampaigns(ownerUid, sandbox, campaigns, deps = {}) {
  const uid = String(ownerUid || '').trim();
  if (!uid) throw new core.PdfPersonalisationError('Campaign owner is required.', 400, 'PDF_JOURNEY_CAMPAIGN_OWNER_REQUIRED');
  const normalised = normaliseCampaigns(campaigns);
  const timestamp = (deps.now ? deps.now() : new Date()).toISOString();
  await getFirestore(deps).collection(COLLECTION).doc(configId(uid, sandbox)).set({
    ownerUid: uid,
    sandbox: String(sandbox || '').trim() || null,
    campaigns: normalised,
    updatedAt: timestamp,
  });
  return normalised;
}

module.exports = {
  COLLECTION,
  MAX_CAMPAIGNS,
  configId,
  cleanCampaign,
  normaliseCampaigns,
  listCampaigns,
  saveCampaigns,
};
