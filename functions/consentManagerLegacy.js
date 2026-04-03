/**
 * Legacy Consent Manager DCS payload — ported from AI Projects/firebaseFunctions/adobe/consent-manager.js
 * (emeapresales-style). Slim xdmEntity: tenant identification.core.email only, root consents + idSpecific,
 * person.name, personID, metadata — no identityMap / optInOut / demoemea mirror.
 *
 * Dataset ID, schema $id, imsOrgId, collection URL, and flow ID come from the request (saved connection).
 */

const { randomUUID } = require('crypto');

const SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';

/**
 * @param {string} entityId - Email used for idSpecific.Email[entityId] and personID
 * @param {Record<string, unknown>} consents - yes/no flags (legacy shape)
 * @param {Record<string, unknown>} customerInfo - email, firstName, lastName, fullName
 * @param {{ schemaId: string, datasetId: string, imsOrgId: string, sourceName?: string, tenantKey?: string }} cfg
 */
function buildLegacyConsentManagerEnvelope(entityId, consents, customerInfo, cfg) {
  const currentTime = new Date().toISOString();
  const uuid = randomUUID();
  const sid = String(cfg.schemaId || '').trim().replace(/\/+$/, '');
  const did = String(cfg.datasetId || '').trim();
  const org = String(cfg.imsOrgId || '').trim();
  const sourceName = String(cfg.sourceName || 'Consent Manager - Profile Update').trim();
  const tenantKey = String(cfg.tenantKey || '_demoemea').trim() || '_demoemea';

  const em = String(entityId || '').trim();
  const ci = customerInfo && typeof customerInfo === 'object' ? customerInfo : {};
  const emailForCore = String(ci.email || em || '').trim() || em;

  const c = consents && typeof consents === 'object' ? consents : {};

  const marketing = {
    any: {
      ...(c.marketingAny === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingAny === 'yes' ? 'y' : 'n',
    },
    email: {
      ...(c.marketingEmail === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingEmail === 'yes' ? 'y' : 'n',
    },
    sms: {
      ...(c.marketingSms === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingSms === 'yes' ? 'y' : 'n',
    },
    push: {
      ...(c.marketingPush === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingPush === 'yes' ? 'y' : 'n',
    },
    call: {
      ...(c.marketingCall === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingCall === 'yes' ? 'y' : 'n',
    },
    postalMail: {
      ...(c.marketingMail === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingMail === 'yes' ? 'y' : 'n',
    },
    whatsApp: {
      ...(c.marketingWhatsapp === 'no' ? { reason: 'User preference' } : {}),
      time: currentTime,
      val: c.marketingWhatsapp === 'yes' ? 'y' : 'n',
    },
    preferred: typeof c.preferredChannel === 'string' && c.preferredChannel.trim() ? c.preferredChannel.trim() : 'email',
    preferredLanguage: typeof c.preferredLanguage === 'string' && c.preferredLanguage.trim() ? c.preferredLanguage.trim() : 'en-US',
  };

  const firstName = ci.firstName != null ? String(ci.firstName) : '';
  const lastName = ci.lastName != null ? String(ci.lastName) : '';
  let fullName = ci.fullName != null ? String(ci.fullName).trim() : '';
  if (!fullName) fullName = [firstName, lastName].map((s) => String(s).trim()).filter(Boolean).join(' ').trim();

  const xdmEntity = {
    [tenantKey]: {
      identification: {
        core: {
          email: emailForCore,
        },
      },
    },
    _id: uuid,
    _repo: {
      createDate: currentTime,
      modifyDate: currentTime,
    },
    preferredLanguage: typeof c.preferredLanguage === 'string' && c.preferredLanguage.trim() ? c.preferredLanguage.trim() : 'en-US',
    consents: {
      collect: {
        val: c.consentCollect === 'yes' ? 'y' : 'n',
      },
      idSpecific: {
        Email: {
          [em]: {
            marketing: {
              email: {
                ...(c.marketingEmailSpecific === 'no' ? { reason: 'User preference' } : {}),
                time: currentTime,
                val: c.marketingEmailSpecific === 'yes' ? 'y' : 'n',
              },
            },
          },
        },
      },
      marketing,
      personalize: {
        content: {
          val: c.consentPersonalize === 'yes' ? 'y' : 'n',
        },
      },
      share: {
        val: c.consentShare === 'yes' ? 'y' : 'n',
      },
    },
    person: {
      name: {
        firstName,
        lastName,
        fullName,
      },
    },
    personID: em,
    metadata: {
      time: currentTime,
    },
  };

  return {
    header: {
      schemaRef: {
        id: sid,
        contentType: SCHEMA_CONTENT_TYPE,
      },
      imsOrgId: org,
      datasetId: did,
      source: { name: sourceName },
    },
    body: {
      xdmMeta: {
        schemaRef: {
          id: sid,
          contentType: SCHEMA_CONTENT_TYPE,
        },
      },
      xdmEntity,
    },
  };
}

/** DCS headers matching legacy consent-manager (x-gw-ims-org-id + sandbox + bearer + api-key; optional flow). */
function buildLegacyConsentDcsHeaders(token, sandboxName, flowId, apiKey, imsOrgId) {
  const h = {
    'Content-Type': 'application/json',
    'sandbox-name': String(sandboxName || 'production').trim(),
    Authorization: `Bearer ${token}`,
    'x-api-key': String(apiKey || '').trim(),
  };
  const org = String(imsOrgId || '').trim();
  if (org) h['x-gw-ims-org-id'] = org;
  const fid = String(flowId || '').trim();
  if (fid) h['x-adobe-flow-id'] = fid;
  return h;
}

function redactLegacyConsentDcsHeaders(headers) {
  return {
    'Content-Type': headers['Content-Type'],
    'sandbox-name': headers['sandbox-name'],
    'x-adobe-flow-id': headers['x-adobe-flow-id'],
    'x-gw-ims-org-id': headers['x-gw-ims-org-id'] ? '***' : undefined,
    'x-api-key': headers['x-api-key'] ? '***' : undefined,
    Authorization: 'Bearer ***',
  };
}

module.exports = {
  buildLegacyConsentManagerEnvelope,
  buildLegacyConsentDcsHeaders,
  redactLegacyConsentDcsHeaders,
  SCHEMA_CONTENT_TYPE,
};
