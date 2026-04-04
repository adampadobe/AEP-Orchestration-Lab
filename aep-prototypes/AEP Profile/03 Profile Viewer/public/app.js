const emailInput = document.getElementById('email');
const sandboxSelect = document.getElementById('sandboxSelect');
const fetchBtn = document.getElementById('fetchBtn');

/** Return URL query string for sandbox when selected (e.g. '&sandbox=kirkham'). */
function getSandboxParam() {
  const val = sandboxSelect?.value?.trim();
  return val ? `&sandbox=${encodeURIComponent(val)}` : '';
}

/** Load available sandboxes into the selector on page load. */
async function loadSandboxes() {
  if (!sandboxSelect) return;
  if (window.AepGlobalSandbox) {
    await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
    window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
    window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
    return;
  }
  sandboxSelect.innerHTML = '<option value="">Loading sandboxes…</option>';
  try {
    const res = await fetch('/api/sandboxes');
    const data = await res.json().catch(() => ({}));
    sandboxSelect.innerHTML = '';
    const sandboxes = data.sandboxes || [];
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Default (from env)';
    sandboxSelect.appendChild(defaultOpt);
    if (sandboxes.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No sandboxes available';
      emptyOpt.disabled = true;
      sandboxSelect.appendChild(emptyOpt);
      return;
    }
    sandboxes.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      const label = s.title ? `${s.title} (${s.name})` : s.name;
      opt.textContent = s.type ? `${label} - ${s.type}` : label;
      sandboxSelect.appendChild(opt);
    });
    if (sandboxes.some((s) => s.name === 'kirkham')) sandboxSelect.value = 'kirkham';
  } catch {
    sandboxSelect.innerHTML = '<option value="">Failed to load sandboxes</option>';
  }
}
if (sandboxSelect) loadSandboxes();
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('email');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results');
const metaEl = document.getElementById('meta');
const attributeTableBody = document.getElementById('attributeTableBody');
const errorSection = document.getElementById('error');
const errorMessageEl = document.getElementById('errorMessage');
const profileIdentityEl = document.getElementById('profileIdentity');
const profileEmailDisplay = document.getElementById('profileEmailDisplay');
const profileEcidDisplay = document.getElementById('profileEcidDisplay');

/** Last loaded profile data – used for View JSON and summary */
let lastProfileData = null;

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'profile-status consent-message' + (type ? ' ' + type : ' success');
  statusEl.hidden = !text;
}

function showError(message) {
  if (message) {
    errorSection.hidden = false;
    resultsSection.hidden = true;
    errorMessageEl.textContent = message;
  } else {
    errorSection.hidden = true;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

/**
 * XDM date fields expect YYYY-MM-DD. Values that look like legacy YYYY-DD-MM (middle segment > 12) are converted.
 * @param {string} fullPath Table path (e.g. _demoemea.omnichannelCdpUseCasePack.donationDate)
 */
function normalizeProfileStreamDateField(fullPath, raw) {
  if (raw == null || fullPath == null) return raw;
  const pathNorm = String(fullPath).toLowerCase();
  if (!pathNorm.includes('donationdate')) return raw;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return raw;
  const [, y, a, b] = m;
  const na = parseInt(a, 10);
  if (na > 12) {
    return `${y}-${b}-${a}`;
  }
  return `${y}-${a}-${b}`;
}

function pathLower(r) {
  return (r.path || '').toLowerCase().replace(/_/g, '.');
}

function findRowValue(rows, testFn) {
  const r = rows.find(testFn);
  if (!r || r.value == null) return '';
  const v = String(r.value).trim();
  return v || '';
}

function findByPathKeywords(rows, keywords) {
  const kws = keywords.map((k) => k.toLowerCase());
  return findRowValue(rows, (row) => {
    const p = pathLower(row);
    return kws.every((k) => p.includes(k));
  });
}

function findByPathSuffix(rows, suffixes) {
  for (const row of rows) {
    const p = pathLower(row);
    for (const suf of suffixes) {
      const s = suf.toLowerCase();
      if (p.endsWith(`.${s}`) || p.endsWith(s)) {
        const v = String(row.value ?? '').trim();
        if (v) return v;
      }
    }
  }
  return '';
}

function composeAddressFromRows(rows) {
  const street =
    findByPathSuffix(rows, ['street1', 'address1', 'addressline1', 'street']) ||
    findByPathKeywords(rows, ['address', 'street']);
  const city = findByPathSuffix(rows, ['city']) || findByPathKeywords(rows, ['address', 'city']);
  const state = findByPathSuffix(rows, ['state', 'stateprovince', 'region']);
  const postal = findByPathSuffix(rows, ['postalcode', 'zip', 'zipcode']);
  const country = findByPathSuffix(rows, ['country', 'countrycode']);
  const parts = [street, city, state, postal, country].filter(Boolean);
  return parts.length ? parts.join(', ') : '';
}

function extractLinkedIdentitiesFromRows(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const p = pathLower(row);
    if (!p.includes('identitymap')) continue;
    const m = p.match(/identitymap\.([^.]+)/);
    if (!m) continue;
    if (!p.match(/\.(id|xid)$/)) continue;
    const ns = m[1];
    const v = String(row.value ?? '').trim();
    if (!v || v.length > 256) continue;
    const key = `${ns}:${v.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ namespace: ns, value: v });
  }
  return out;
}

function identityCategoryLabel(ns) {
  const u = String(ns).toUpperCase();
  if (u.includes('ECID') || u === 'AVID' || u.includes('TNT')) return 'Cross-device ID';
  if (u.includes('EMAIL')) return 'Email';
  if (u.includes('PHONE') || u.includes('SMS')) return 'Phone number';
  if (u.includes('COOKIE') || u.includes('AMCV')) return 'Cookie ID';
  if (u.includes('CRM') || u.includes('LOYALTY')) return 'CRM / Loyalty ID';
  return 'Other';
}

function aggregateIdentityTypeCounts(identities) {
  const counts = new Map();
  identities.forEach(({ namespace }) => {
    const cat = identityCategoryLabel(namespace);
    counts.set(cat, (counts.get(cat) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function extractProfileInsightFields(rows, data) {
  const firstName =
    findByPathSuffix(rows, ['firstname', 'first.name', 'givenname']) ||
    findByPathKeywords(rows, ['person', 'firstname']) ||
    findByPathKeywords(rows, ['individual', 'firstname']);
  const lastName =
    findByPathSuffix(rows, ['lastname', 'last.name', 'surname']) ||
    findByPathKeywords(rows, ['person', 'lastname']);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || '—';
  const email = (data.profileEmail || findByPathSuffix(rows, ['email']) || data.email || '').trim() || '—';
  const phone =
    findByPathSuffix(rows, ['phone', 'phonenumber', 'mobilephone', 'mobile']) ||
    findByPathKeywords(rows, ['phone', 'number']) ||
    findByPathKeywords(rows, ['telecom', 'phone']);
  const gender = findByPathSuffix(rows, ['gender', 'sex']) || findByPathKeywords(rows, ['person', 'gender']);
  const dob = findByPathSuffix(rows, ['dateofbirth', 'birthdate', 'birthday']);
  const birthDayMonth =
    findByPathSuffix(rows, ['birthdayandmonth']) ||
    (dob && String(dob).length >= 10 ? `${String(dob).slice(8, 10)}-${String(dob).slice(5, 7)}` : '') ||
    '';
  const birthYear = findByPathSuffix(rows, ['birthyear', 'yearofbirth']) || (dob && String(dob).slice(0, 4)) || '';
  const age = findByPathSuffix(rows, ['age']) || '';
  const marital = findByPathSuffix(rows, ['maritalstatus', 'marital']) || findByPathKeywords(rows, ['person', 'marital']);
  const address = composeAddressFromRows(rows);
  const preferredLanguage = findByPathSuffix(rows, ['language', 'preferredlanguage', 'locale']) || findByPathKeywords(rows, ['language']);
  const lastOrderDate =
    findByPathKeywords(rows, ['order', 'date']) ||
    findByPathKeywords(rows, ['commerce', 'last']) ||
    findByPathSuffix(rows, ['lastorderdate', 'lastpurchasedate']);
  const promotionType = findByPathKeywords(rows, ['promotion', 'type']) || findByPathSuffix(rows, ['promotiontype']);
  const favoriteCategory =
    findByPathKeywords(rows, ['favorite', 'category']) ||
    findByPathKeywords(rows, ['interest', 'category']) ||
    findByPathSuffix(rows, ['favoritecategory']);
  const favoriteSubcategory = findByPathKeywords(rows, ['subcategory', 'favorite']) || findByPathSuffix(rows, ['favoritesubcategory']);
  const lastActionChannel =
    findByPathKeywords(rows, ['last', 'channel']) ||
    findByPathSuffix(rows, ['preferredchannel', 'lastchannel']) ||
    '';
  const lastActionType =
    findByPathKeywords(rows, ['last', 'action']) ||
    findByPathSuffix(rows, ['lastactiontype', 'interactiontype']) ||
    '';
  const lastActionTs =
    findByPathSuffix(rows, ['lastactivitydate', 'lastvisittime', 'lastengagementtime']) ||
    findByPathKeywords(rows, ['last', 'timestamp']) ||
    findByPathKeywords(rows, ['last', 'event']) ||
    '';
  const loyaltyProgram = findByPathKeywords(rows, ['loyalty', 'program']) || findByPathSuffix(rows, ['loyaltyprogramname']);
  const loyaltyTier = findByPathKeywords(rows, ['loyalty', 'tier']) || findByPathSuffix(rows, ['loyaltytier', 'tier']);
  const loyaltyId = findByPathKeywords(rows, ['loyalty', 'id']) || findByPathSuffix(rows, ['loyaltyid', 'memberid']);
  const loyaltyStatus = findByPathKeywords(rows, ['loyalty', 'status']) || findByPathSuffix(rows, ['loyaltystatus', 'memberstatus']);

  const ltv =
    findByPathKeywords(rows, ['lifetime', 'value']) ||
    findByPathKeywords(rows, ['commerce', 'lifetime']) ||
    findByPathKeywords(rows, ['loyalty', 'balance']) ||
    findByPathSuffix(rows, ['totalrevenue', 'lifetimevalue']);
  const ordersYtd =
    findByPathKeywords(rows, ['orders', 'year']) ||
    findByPathKeywords(rows, ['purchase', 'count']) ||
    findByPathSuffix(rows, ['ordersytd', 'numberoforders']);
  const avgOrder =
    findByPathKeywords(rows, ['average', 'order']) ||
    findByPathSuffix(rows, ['averageordervalue', 'averageordersize']);
  const pointsEarned =
    findByPathKeywords(rows, ['points', 'earned']) ||
    findByPathKeywords(rows, ['loyalty', 'points']) ||
    findByPathSuffix(rows, ['pointsearned', 'totalpoints']);
  const pointsRedeemed =
    findByPathKeywords(rows, ['points', 'redeem']) ||
    findByPathSuffix(rows, ['pointsredeemed', 'redeemedpoints']);

  const identities = extractLinkedIdentitiesFromRows(rows);
  if (identities.length === 0 && data.ecid) {
    identities.push({ namespace: 'ECID', value: String(data.ecid) });
  }
  if (identities.length === 0 && email && email !== '—') {
    identities.push({ namespace: 'Email', value: email });
  }

  return {
    firstName,
    lastName,
    fullName: fullName === '—' && email !== '—' ? email.split('@')[0] : fullName,
    email,
    phone,
    gender,
    birthDayMonth: birthDayMonth || (dob && String(dob).length >= 5 ? String(dob).slice(5, 10).replace(/-/g, '-') : ''),
    dob,
    birthYear,
    age,
    marital,
    address,
    preferredLanguage,
    lastOrderDate,
    promotionType,
    favoriteCategory,
    favoriteSubcategory,
    lastActionChannel,
    lastActionType,
    lastActionTs,
    loyaltyProgram,
    loyaltyTier,
    loyaltyId,
    loyaltyStatus,
    ltv,
    ordersYtd,
    avgOrder,
    pointsEarned,
    pointsRedeemed,
    identities,
    identityTypeCounts: aggregateIdentityTypeCounts(identities),
  };
}

function detailsInsightCard(title, fields) {
  const rowsHtml = fields
    .filter((f) => f.label)
    .map(
      (f) =>
        `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value || '—')}</dd></div>`,
    )
    .join('');
  return `<article class="details-category-card"><h3 class="details-category-card-title"><span class="details-category-star" aria-hidden="true">✦</span>${escapeHtml(title)}</h3><dl class="details-dl">${rowsHtml}</dl></article>`;
}

function renderDetailsCategoryGrid(ins) {
  const grid = document.getElementById('detailsCategoryGrid');
  if (!grid) return;
  const cards = [
    detailsInsightCard('Location details', [{ label: 'Address', value: ins.address }]),
    detailsInsightCard('Personal details', [
      { label: 'First name', value: ins.firstName },
      { label: 'Last name', value: ins.lastName },
      { label: 'Marital status', value: ins.marital },
      { label: 'Birth year', value: ins.birthYear },
      { label: 'Gender', value: ins.gender },
    ]),
    detailsInsightCard('Demographics', [{ label: 'Age', value: ins.age }]),
    detailsInsightCard('Interesting facts', [
      { label: 'Preferred language', value: ins.preferredLanguage },
      { label: 'Last order date', value: ins.lastOrderDate },
      { label: 'Promotion type', value: ins.promotionType },
    ]),
    detailsInsightCard('Interests', [
      { label: 'Favorite category', value: ins.favoriteCategory },
      { label: 'Favorite subcategory', value: ins.favoriteSubcategory },
    ]),
    detailsInsightCard('Engagement', [
      { label: 'Last action channel', value: ins.lastActionChannel },
      { label: 'Last action type', value: ins.lastActionType },
      { label: 'Last action timestamp', value: ins.lastActionTs },
    ]),
    detailsInsightCard('Loyalty', [
      { label: 'Loyalty program', value: ins.loyaltyProgram },
      { label: 'Loyalty tier', value: ins.loyaltyTier },
      { label: 'Loyalty id', value: ins.loyaltyId },
      { label: 'Loyalty status', value: ins.loyaltyStatus },
    ]),
  ];
  grid.innerHTML = cards.join('');
}

function renderDetailsContactList(ins) {
  const ul = document.getElementById('detailsContactList');
  if (!ul) return;
  const items = [
    { icon: '✉️', label: 'Email', value: ins.email },
    { icon: '📱', label: 'Phone number', value: ins.phone },
    { icon: '⚧', label: 'Gender', value: ins.gender },
    { icon: '🎂', label: 'Date of birth', value: ins.dob || ins.birthDayMonth || '—' },
    { icon: '📍', label: 'Address', value: ins.address || '—' },
  ];
  ul.innerHTML = items
    .map(
      (it) =>
        `<li class="details-contact-item"><span class="details-contact-icon" aria-hidden="true">${it.icon}</span><div><span class="details-contact-label">${escapeHtml(it.label)}</span><span class="details-contact-value">${escapeHtml(it.value || '—')}</span></div></li>`,
    )
    .join('');
}

function renderDetailsIdentityTypesList(ins) {
  const ul = document.getElementById('detailsIdentityTypes');
  if (!ul) return;
  if (!ins.identityTypeCounts.length) {
    ul.innerHTML = '<li>—</li>';
    return;
  }
  ul.innerHTML = ins.identityTypeCounts
    .map(([type, n]) => `<li><strong>${escapeHtml(type)}</strong> (${n})</li>`)
    .join('');
}

function renderDetailsBasicAttrs(ins, rows) {
  const dl = document.getElementById('detailsBasicAttrs');
  if (!dl) return;
  const r = rows || lastProfileData?.rows || [];
  const street1 =
    findRowValue(r, (row) => pathLower(row).includes('street1')) ||
    findRowValue(r, (row) => pathLower(row).includes('addressline1'));
  const pairs = [
    { label: 'address', value: ins.address },
    { label: 'gender', value: ins.gender },
    { label: 'birthDayAndMonth', value: ins.birthDayMonth || (ins.dob ? String(ins.dob).slice(5, 10) : '') },
    { label: 'number', value: ins.phone },
    { label: 'street1', value: street1 },
  ];
  dl.innerHTML = pairs
    .map((p) => `<div><dt>${escapeHtml(p.label)}</dt><dd>${escapeHtml(p.value || '—')}</dd></div>`)
    .join('');
}

function renderDetailsLinkedIdentitiesDl(identities) {
  const dl = document.getElementById('detailsLinkedIdentities');
  if (!dl) return;
  if (!identities.length) {
    dl.innerHTML = '<div><dt>—</dt><dd>No identity map rows in profile</dd></div>';
    return;
  }
  const top = identities.slice(0, 12);
  dl.innerHTML = top
    .map((id) => `<div><dt>${escapeHtml(id.namespace)}</dt><dd>${escapeHtml(id.value)}</dd></div>`)
    .join('');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '—';
}

let detailsSupplementaryForEmail = null;

function renderDetailsInsightsPanel(data) {
  const panel = document.getElementById('detailsInsightsPanel');
  if (!panel) return;
  if (!data || !data.found) {
    panel.hidden = true;
    detailsSupplementaryForEmail = null;
    return;
  }
  detailsSupplementaryForEmail = null;
  panel.hidden = false;
  const rows = data.rows || [];
  const ins = extractProfileInsightFields(rows, data);

  setText('detailsSumAttributes', String(rows.length));
  setText('detailsSumIdentities', String(ins.identities.length));
  setText('detailsSumAudiences', '…');

  setText('detailsKpiLtv', ins.ltv || '—');
  setText('detailsKpiOrdersYtd', ins.ordersYtd || '—');
  setText('detailsKpiAvgOrder', ins.avgOrder || '—');
  setText('detailsKpiPointsEarned', ins.pointsEarned || '—');
  setText('detailsKpiPointsRedeemed', ins.pointsRedeemed || '—');

  const profileId = data.entityId || '—';
  setText('detailsProfileId', profileId);
  setText('detailsSubcardProfileId', profileId.length > 48 ? `${profileId.slice(0, 48)}…` : profileId);
  setText('detailsHeroName', ins.fullName);
  setText('detailsSubcardName', ins.fullName);

  renderDetailsContactList(ins);
  renderDetailsIdentityTypesList(ins);
  renderDetailsCategoryGrid(ins);
  renderDetailsBasicAttrs(ins, rows);
  renderDetailsLinkedIdentitiesDl(ins.identities);

  const chEl = document.getElementById('detailsChannelPrefs');
  if (chEl) chEl.innerHTML = '<p class="details-journeys-note" style="margin:0">Loading preferences…</p>';

  const audPrev = document.getElementById('detailsAudiencePreview');
  if (audPrev) audPrev.innerHTML = '';
  loadDetailsSupplementaryData();
}

async function loadDetailsSupplementaryData() {
  const profileEmail = profileEmailDisplay?.dataset?.profileEmail ?? (profileEmailDisplay?.textContent || '').trim();
  const email = (profileEmail && profileEmail !== '—') ? profileEmail : (lastProfileData?.email || emailInput?.value?.trim());
  if (!email || !lastProfileData?.found) return;
  if (detailsSupplementaryForEmail === email) return;
  const loadingFor = email;
  detailsSupplementaryForEmail = email;
  const sb = getSandboxParam();
  try {
    const [aRes, cRes] = await Promise.all([
      fetch(`/api/profile/audiences?email=${encodeURIComponent(email)}${sb}`),
      fetch(`/api/profile/consent?email=${encodeURIComponent(email)}${sb}`),
    ]);
    const aData = await aRes.json().catch(() => ({}));
    const cData = await cRes.json().catch(() => ({}));

    if (loadingFor !== detailsSupplementaryForEmail) return;

    const realized = aData.realized || [];
    const exited = aData.exited || [];
    const audCount = realized.length + exited.length;
    setText('detailsSumAudiences', String(audCount));

    const prev = document.getElementById('detailsAudiencePreview');
    if (prev) {
      const top5 = realized.slice(0, 5);
      if (top5.length === 0) {
        prev.innerHTML = '<li><span class="details-contact-value">No qualified audiences</span></li>';
      } else {
        prev.innerHTML = top5
          .map(
            (a) =>
              `<li><a href="#" class="details-audience-link" data-audience-jump="1">${escapeHtml(a.name || 'Audience')}</a></li>`,
          )
          .join('');
        prev.querySelectorAll('[data-audience-jump]').forEach((link) => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('audience');
          });
        });
      }
    }

    const chEl = document.getElementById('detailsChannelPrefs');
    if (chEl) {
      const ch = cData.channels || {};
      const rows = [
        ['email', 'Email', '📧'],
        ['push', 'Push', '🔔'],
        ['sms', 'SMS', '💬'],
        ['phone', 'Phone', '📞'],
        ['directMail', 'Direct mail', '✉️'],
        ['whatsapp', 'WhatsApp', '💚'],
      ];
      if (!cRes.ok) {
        chEl.innerHTML = '<p class="details-journeys-note" style="margin:0">Could not load channel preferences.</p>';
      } else {
        chEl.innerHTML = rows
          .map(([key, label, icon]) => {
            const v = ch[key];
            const on = v === 'in';
            const mark = on ? '<span class="details-channel-check" aria-label="Opted in">✓</span>' : '<span class="details-channel-check" style="color:#999" aria-label="Not opted in">—</span>';
            return `<div class="details-channel-pref-row"><span class="details-channel-pref-label"><span aria-hidden="true">${icon}</span> ${escapeHtml(label)}</span>${mark}</div>`;
          })
          .join('');
      }
    }
  } catch {
    setText('detailsSumAudiences', '—');
    const chEl = document.getElementById('detailsChannelPrefs');
    if (chEl) chEl.innerHTML = '<p class="details-journeys-note" style="margin:0">Failed to load preferences.</p>';
  }
}

function showResults(data) {
  errorSection.hidden = true;
  resultsSection.hidden = false;
  lastProfileData = data;
  eventsLoadedForEmail = null;
  audiencesLoadedForEmail = null;

  const rowCount = (data.rows && data.rows.length) || 0;
  metaEl.textContent = data.found
    ? `Profile for ${data.email} (${rowCount} attributes)`
    : `No profile found for ${data.email}.`;

  const lastModEl = document.getElementById('profileLastModified');
  if (lastModEl) lastModEl.textContent = data.lastModified || data.lastModifiedAt || '—';

  const searchInput = document.getElementById('attributeSearch');
  if (searchInput) searchInput.value = '';
  filterAttributeRows('');

  if (profileIdentityEl && profileEmailDisplay && profileEcidDisplay) {
    profileIdentityEl.hidden = !data.found;
    const emailVal = data.profileEmail != null && data.profileEmail !== '' ? data.profileEmail : '—';
    profileEmailDisplay.textContent = emailVal;
    const ecidVal = data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
    profileEcidDisplay.textContent = !ecidVal ? '—' : ecidVal;
    if (data.found) {
      profileEmailDisplay.dataset.profileEmail = data.profileEmail != null ? String(data.profileEmail) : '';
      profileEcidDisplay.dataset.ecid = ecidVal;
    } else {
      delete profileEmailDisplay.dataset.profileEmail;
      delete profileEcidDisplay.dataset.ecid;
    }
  }

  attributeTableBody.innerHTML = '';
  if (data.rows && data.rows.length) {
    data.rows.forEach((row) => {
      const tr = document.createElement('tr');
      const path = escapeHtml(row.path || '');
      const originalValue = String(row.value ?? '');
      const value = escapeHtml(originalValue);
      tr.innerHTML = `
        <td class="attr-cell">${escapeHtml(row.attribute)}</td>
        <td class="display-name-cell">${escapeHtml(row.displayName)}</td>
        <td class="value-cell"><input type="text" class="profile-value-input" data-path="${path}" data-original-value="${value}" value="${value}" aria-label="Value for ${escapeHtml(row.attribute)}"></td>
        <td class="path-cell">${path}</td>
      `;
      attributeTableBody.appendChild(tr);
    });
  }

  renderDetailsInsightsPanel(data);

  let insights = null;
  if (data?.found && data.rows && data.rows.length) {
    try {
      insights = extractProfileInsightFields(data.rows, data);
    } catch (e) {
      insights = null;
    }
  }
  document.dispatchEvent(new CustomEvent('aepProfileLoaded', { detail: { data, insights } }));
  syncAttributesBackToTop();
}

/** Fixed “Back to top” on Attributes tab – show when toolbar scrolls near top of viewport. */
function syncAttributesBackToTop() {
  const btn = document.getElementById('attributesBackToTopBtn');
  const anchor = document.getElementById('attributesPanelTop');
  if (!btn || !anchor || !resultsSection) return;
  if (resultsSection.hidden) {
    btn.hidden = true;
    return;
  }
  const panelAttributes = document.getElementById('panelAttributes');
  if (!panelAttributes || panelAttributes.hidden) {
    btn.hidden = true;
    return;
  }
  const top = anchor.getBoundingClientRect().top;
  const showAfterScrollPx = 64;
  btn.hidden = top >= showAfterScrollPx;
}

fetchBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('Please enter an email address.', 'error');
    return;
  }

  fetchBtn.disabled = true;
  setStatus('Loading…', 'loading');
  showError('');

  try {
    const res = await fetch(`/api/profile/table?email=${encodeURIComponent(email)}${getSandboxParam()}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || `Request failed (${res.status})`);
      setStatus('', 'error');
      if (profileIdentityEl) profileIdentityEl.hidden = true;
      return;
    }

    showResults(data);
    if (typeof addEmail === 'function') addEmail(email);
    setStatus(`Profile loaded for ${email}.`);
    // Refresh Events and Audience tabs if they're visible
    const panelEvents = document.getElementById('panelEvents');
    const panelAudience = document.getElementById('panelAudience');
    if (panelEvents && !panelEvents.hidden) loadEventsIfNeeded();
    if (panelAudience && !panelAudience.hidden) loadAudiencesIfNeeded();
  } catch (err) {
    showError(err.message || 'Network error');
    setStatus('', 'error');
    if (profileIdentityEl) profileIdentityEl.hidden = true;
  } finally {
    fetchBtn.disabled = false;
  }
});

// Allow Enter in the email field to submit
emailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchBtn.click();
});

/** Filter events by date range and email namespace. Returns filtered array. */
function filterEmailEventsByDateRange(events, hoursBack) {
  if (!events || !events.length) return [];
  const now = Date.now();
  const cutoff = now - hoursBack * 60 * 60 * 1000;
  return events.filter((ev) => {
    const ts = ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
    if (ts < cutoff) return false;
    const ns = getEventNamespaceValue(ev);
    return ns && String(ns).toLowerCase() === 'email';
  });
}

/** Filter events by date range only (no namespace filter). Used for opens/clicks from message.tracking. */
function filterEventsByDateRange(events, hoursBack) {
  if (!events || !events.length) return [];
  const now = Date.now();
  const cutoff = now - hoursBack * 60 * 60 * 1000;
  return events.filter((ev) => {
    const ts = ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
    return ts >= cutoff;
  });
}

/** Count email engagement metrics from filtered events (email namespace, date range). */
function computeEmailEngagementMetrics(filtered, allDateFiltered) {
  const evName = (ev) => String(ev.eventName || '').toLowerCase();
  const fb = (ev) => String(getEventFeedbackStatus(ev)).toLowerCase();
  const has = (ev, ...terms) => {
    const n = evName(ev);
    const f = fb(ev);
    return terms.some((t) => n.includes(t) || f.includes(t));
  };
  const interactionType = (ev) => getEventInteractionType(ev);
  const sentOrDelivered = filtered.filter((ev) => has(ev, 'sent', 'delivered', 'delay')).length;
  const bounced = filtered.filter((ev) => has(ev, 'bounce')).length;
  const unsubscribed = filtered.filter((ev) => has(ev, 'unsub', 'exclude')).length;
  const eventsForOpensClicks = allDateFiltered && allDateFiltered.length > 0 ? allDateFiltered : filtered;
  const opens = eventsForOpensClicks.filter((ev) => interactionType(ev) === 'open').length;
  const clicks = eventsForOpensClicks.filter((ev) => interactionType(ev) === 'click').length;
  const sends = sentOrDelivered > 0 ? sentOrDelivered : filtered.length;
  const delivered = Math.max(sends - bounced, 0) || sends;
  const effectiveSends = Math.max(sends, 1);
  const effectiveDelivered = Math.max(delivered, 1);
  return {
    sends,
    delivered,
    bounced,
    unsubscribed,
    opens,
    clicks,
    deliveryRate: effectiveSends > 0 ? ((delivered / effectiveSends) * 100).toFixed(2) : null,
    bounceRate: effectiveSends > 0 ? ((bounced / effectiveSends) * 100).toFixed(2) : null,
    unsubRate: effectiveSends > 0 ? ((unsubscribed / effectiveSends) * 100).toFixed(2) : null,
    openRate: effectiveDelivered > 0 ? ((opens / effectiveDelivered) * 100).toFixed(2) : null,
    clickRate: effectiveDelivered > 0 ? ((clicks / effectiveDelivered) * 100).toFixed(2) : null,
    clickToOpenRate: opens > 0 ? ((clicks / opens) * 100).toFixed(2) : null,
  };
}

function updateDetailsPanel() {
  const hintEl = document.getElementById('detailsLoadHint');
  const filterEl = document.getElementById('detailsDateFilter');
  const gridEl = document.getElementById('detailsMetricsGrid');

  const hoursBack = filterEl ? parseInt(filterEl.value, 10) || 168 : 168;
  const rangeLabel = hoursBack === 24 ? '24 hours' : hoursBack === 168 ? '7 days' : '30 days';

  const journeysSectionEl = document.getElementById('detailsJourneysSection');
  const channelsSectionEl = document.getElementById('detailsChannelsSection');
  if (eventsData.length === 0) {
    if (hintEl) { hintEl.hidden = false; hintEl.textContent = 'Load a profile and open the Details tab to see email engagement metrics.'; }
    if (gridEl) gridEl.hidden = true;
    if (journeysSectionEl) journeysSectionEl.hidden = true;
    if (channelsSectionEl) channelsSectionEl.hidden = true;
    ['detailsSends', 'detailsDeliveryRate', 'detailsBounceRate', 'detailsUnsubRate', 'detailsOpenRate', 'detailsOtherOpenRate', 'detailsClickRate', 'detailsClickToOpenRate'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    ['detailsSendsSub', 'detailsDeliveryRateSub', 'detailsBounceRateSub', 'detailsUnsubRateSub', 'detailsOpenRateSub', 'detailsOtherOpenRateSub', 'detailsClickRateSub', 'detailsClickToOpenRateSub'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }

  if (hintEl) hintEl.hidden = true;
  if (gridEl) gridEl.hidden = false;

  const filtered = filterEmailEventsByDateRange(eventsData, hoursBack);
  const allDateFiltered = filterEventsByDateRange(eventsData, hoursBack);
  const m = computeEmailEngagementMetrics(filtered, allDateFiltered);

  const days = hoursBack / 24;
  const avgPerDay = days > 0 ? (m.sends / days).toFixed(1) : '—';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
  set('detailsSends', m.sends.toLocaleString());
  set('detailsSendsSub', `Average Per Day: ${avgPerDay}`);
  set('detailsDeliveryRate', m.deliveryRate != null ? `${m.deliveryRate}%` : '—');
  set('detailsDeliveryRateSub', `${m.delivered.toLocaleString()} Emails Delivered`);
  set('detailsBounceRate', m.bounceRate != null ? `${m.bounceRate}%` : '—');
  set('detailsBounceRateSub', `${m.bounced.toLocaleString()} Emails Bounced`);
  set('detailsUnsubRate', m.unsubRate != null ? `${m.unsubRate}%` : '—');
  set('detailsUnsubRateSub', `${m.unsubscribed.toLocaleString()} Unsubscribes`);
  set('detailsOpenRate', m.openRate != null ? `${m.openRate}%` : '—');
  set('detailsOpenRateSub', `${m.opens.toLocaleString()} Opens`);
  set('detailsOtherOpenRate', m.openRate != null ? `${m.openRate}%` : '—');
  set('detailsOtherOpenRateSub', `${m.opens.toLocaleString()} Other Opens`);
  set('detailsClickRate', m.clickRate != null ? `${m.clickRate}%` : '—');
  set('detailsClickRateSub', `${m.clicks.toLocaleString()} Clicks`);
  set('detailsClickToOpenRate', m.clickToOpenRate != null ? `${m.clickToOpenRate}%` : '—');
  set('detailsClickToOpenRateSub', '');

  if (channelsSectionEl) channelsSectionEl.hidden = false;
  if (journeysSectionEl) journeysSectionEl.hidden = false;
  renderDetailsChannelsSection(allDateFiltered, hoursBack);
  renderDetailsJourneysSection(allDateFiltered, hoursBack);
}

// Tab switching (Details, Attributes, Events, Audience Membership)
const tabButtons = document.querySelectorAll('.profile-tab[data-tab]');
const tabPanels = document.querySelectorAll('.profile-tab-panel');
function switchTab(tabKey) {
  tabButtons.forEach((btn) => {
    const isActive = (btn.getAttribute('data-tab') || '') === tabKey;
    btn.classList.toggle('profile-tab--active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  tabPanels.forEach((panel) => {
    const forTab = panel.id === 'panelDetails' && tabKey === 'details'
      || panel.id === 'panelAttributes' && tabKey === 'attributes'
      || panel.id === 'panelEvents' && tabKey === 'events'
      || panel.id === 'panelAudience' && tabKey === 'audience';
    panel.classList.toggle('profile-tab-panel--active', forTab);
    panel.hidden = !forTab;
  });
  if (tabKey === 'details') loadEventsIfNeeded();
  if (tabKey === 'events') loadEventsIfNeeded();
  if (tabKey === 'audience') {
    loadAudiencesIfNeeded();
    const sentPayloadDetails = document.getElementById('sentPayloadDetails');
    if (sentPayloadDetails) {
      sentPayloadDetails.open = false;
      sentPayloadDetails.removeAttribute('open');
    }
  }
  if (tabKey === 'details') {
    updateDetailsPanel();
    loadDetailsSupplementaryData();
  }
  syncAttributesBackToTop();
}

window.addEventListener('scroll', syncAttributesBackToTop, { passive: true });
window.addEventListener('resize', syncAttributesBackToTop);

document.getElementById('attributesBackToTopBtn')?.addEventListener('click', () => {
  document.getElementById('attributesPanelTop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  requestAnimationFrame(() => syncAttributesBackToTop());
});

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab') || 'attributes'));
});

document.getElementById('detailsCopyProfileIdBtn')?.addEventListener('click', () => {
  const idEl = document.getElementById('detailsProfileId');
  const id = idEl?.textContent?.trim();
  if (!id || id === '—') return;
  navigator.clipboard.writeText(id).then(() => setStatus('Profile ID copied.', 'success')).catch(() => setStatus('Could not copy.', 'error'));
});

document.getElementById('detailsAudiencesViewAllBtn')?.addEventListener('click', () => switchTab('audience'));

document.getElementById('detailsIdentitiesScrollBtn')?.addEventListener('click', () => switchTab('attributes'));

const detailsDateFilterEl = document.getElementById('detailsDateFilter');
if (detailsDateFilterEl) detailsDateFilterEl.addEventListener('change', () => updateDetailsPanel());
const detailsFiltersBtn = document.getElementById('detailsFiltersBtn');
if (detailsFiltersBtn) detailsFiltersBtn.addEventListener('click', () => { /* Filters modal – future */ });
const detailsClearFiltersBtn = document.getElementById('detailsClearFiltersBtn');
if (detailsClearFiltersBtn) detailsClearFiltersBtn.addEventListener('click', () => { if (detailsDateFilterEl) detailsDateFilterEl.value = '168'; updateDetailsPanel(); });

// Events tab – fetch and render profile experience events (lazy load on first open)
let eventsLoadedForEmail = null;
let eventsData = []; // Full events array for search and detail view
const eventsListEl = document.getElementById('eventsList');
const eventsLoadingEl = document.getElementById('eventsLoading');
const eventsErrorEl = document.getElementById('eventsError');
const eventsEmptyEl = document.getElementById('eventsEmpty');
const eventsSearchEl = document.getElementById('eventsSearch');
const eventsDateFilterEl = document.getElementById('eventsDateFilter');

function formatEventTimestamp(ts) {
  if (ts == null) return '—';
  const d = new Date(typeof ts === 'number' ? ts : parseInt(ts, 10));
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function formatEventDateTimeReceived(ts) {
  if (ts == null) return '—';
  const d = new Date(typeof ts === 'number' ? ts : parseInt(ts, 10));
  return isNaN(d.getTime()) ? '—' : d.toISOString();
}

function getEventEcid(ev) {
  const rows = ev.rows || [];
  const ecidRow = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    const a = (r.attribute || '').toLowerCase();
    return (p.includes('ecid') || a === 'ecid') && r.value;
  });
  return ecidRow ? String(ecidRow.value) : '—';
}

function getEventChannel(ev) {
  if (ev.channel != null && String(ev.channel).trim()) return String(ev.channel).trim();
  const rows = ev.rows || [];
  const channelRow = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    const a = (r.attribute || '').toLowerCase();
    return ((p === 'channel' || p.endsWith('.channel') || p === '_experiencechannel' || a === 'channel') && r.value != null && String(r.value).trim());
  });
  return channelRow ? String(channelRow.value).trim() : '—';
}

function getEventNamespaceValue(ev) {
  const rows = ev.rows || [];
  const row = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    return p === '_experience.customerjourneymanagement.emailchannelcontext.namespace' ||
      p.endsWith('emailchannelcontext.namespace') || p.endsWith('emailchannelcontext_namespace');
  });
  if (!row || row.value == null) return '—';
  const val = String(row.value).trim();
  return val || '—';
}

/** Normalize CJM / event channel labels for grouping (email, push, sms, …). */
function normalizeMarketingChannelKeyForDetails(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (!v || v === '—') return '';
  const compact = v.replace(/[\s_-]+/g, '');
  if (compact === 'email' || v.includes('email')) return 'email';
  if (compact === 'sms' || v === 'text' || v.includes('sms')) return 'sms';
  if (v.includes('push')) return 'push';
  if (v.includes('in-app') || compact === 'inapp') return 'inApp';
  if (v.includes('whatsapp')) return 'whatsapp';
  if ((v.includes('line') || compact === 'line') && !v.includes('timeline')) return 'line';
  if (v.includes('web')) return 'web';
  if ((v.includes('direct') && v.includes('mail')) || compact === 'directmail') return 'directMail';
  if (v.includes('phone') || v === 'call') return 'phone';
  return v.replace(/\s+/g, '_');
}

function formatChannelLabelForDetails(key) {
  const labels = {
    email: 'email',
    sms: 'sms',
    push: 'push',
    inApp: 'in-app',
    web: 'web',
    whatsapp: 'whatsapp',
    line: 'line',
    directMail: 'direct mail',
    phone: 'phone',
  };
  return labels[key] || String(key).replace(/_/g, ' ');
}

/**
 * Channel for Details / Channels table: any *channelcontext*.namespace (email, push, sms, …),
 * then legacy email-only namespace helper, then top-level channel on the event.
 */
function getMessageChannelKeyForDetails(ev) {
  const rows = ev.rows || [];
  for (const r of rows) {
    const p = (r.path || '').toLowerCase().replace(/_/g, '.');
    if (!p.includes('channelcontext')) continue;
    if (!(p.endsWith('.namespace') || p.endsWith('_namespace'))) continue;
    if (r.value == null || !String(r.value).trim()) continue;
    const k = normalizeMarketingChannelKeyForDetails(r.value);
    if (k) return k;
  }
  const legacyNs = getEventNamespaceValue(ev);
  if (legacyNs && legacyNs !== '—') {
    const k = normalizeMarketingChannelKeyForDetails(legacyNs);
    if (k) return k;
  }
  const ch = getEventChannel(ev);
  if (ch && ch !== '—') {
    const k = normalizeMarketingChannelKeyForDetails(ch);
    if (k) return k;
  }
  return '';
}

const DETAILS_CHANNEL_SORT_ORDER = ['email', 'sms', 'push', 'inApp', 'web', 'whatsapp', 'line', 'directMail', 'phone'];

function detailsChannelSortIndex(key) {
  const i = DETAILS_CHANNEL_SORT_ORDER.indexOf(key);
  return i === -1 ? 100 + key.charCodeAt(0) : i;
}

function computeChannelRowMetrics(evList) {
  const evName = (ev) => String(ev.eventName || '').toLowerCase();
  const fb = (ev) => String(getEventFeedbackStatus(ev)).toLowerCase();
  const has = (ev, ...terms) => terms.some((t) => evName(ev).includes(t) || fb(ev).includes(t));
  const it = (ev) => getEventInteractionType(ev);

  const sentOrDelivered = evList.filter((ev) => has(ev, 'sent', 'delivered', 'delay')).length;
  const bounced = evList.filter((ev) => has(ev, 'bounce')).length;
  let delivered = sentOrDelivered > 0 ? Math.max(sentOrDelivered - bounced, 0) : 0;
  const displays = evList.filter((ev) => it(ev) === 'open').length;
  const clicks = evList.filter((ev) => it(ev) === 'click').length;

  if (delivered === 0 && (displays > 0 || clicks > 0)) {
    const feedbackLike = evList.filter((ev) => /message\.(feedback|tracking)/i.test(evName(ev))).length;
    delivered = feedbackLike > 0 ? feedbackLike : (displays + clicks > 0 ? 1 : 0);
  }

  let ctr = '0.00';
  if (delivered > 0) ctr = ((clicks / delivered) * 100).toFixed(2);
  else if (displays > 0) ctr = ((clicks / displays) * 100).toFixed(2);

  return {
    people: evList.length > 0 ? 1 : 0,
    delivered,
    displays,
    clicks,
    ctr,
    eventCount: evList.length,
  };
}

function detailsChannelBarCell(numericVal, maxVal, displayText, pctOfTotal) {
  const w = maxVal > 0 ? Math.round((numericVal / maxVal) * 100) : 0;
  const label = pctOfTotal != null && !Number.isNaN(pctOfTotal)
    ? `${displayText} (${Number(pctOfTotal).toFixed(1)}%)`
    : displayText;
  return `<div class="details-journey-count-bar-wrap details-channel-metric"><div class="details-journey-count-bar" style="width:${w}%"></div><span class="details-journey-count-text">${label}</span></div>`;
}

function renderDetailsChannelsSection(dateFilteredEvents, hoursBack) {
  const sectionEl = document.getElementById('detailsChannelsSection');
  const emptyEl = document.getElementById('detailsChannelsEmpty');
  const wrapEl = document.getElementById('detailsChannelsWrap');
  const noteEl = document.getElementById('detailsChannelsNote');
  const tbody = document.getElementById('detailsChannelsBody');
  const hdrPeople = document.getElementById('detailsChannelsHdrPeople');
  const hdrCtr = document.getElementById('detailsChannelsHdrCtr');
  const hdrDelivered = document.getElementById('detailsChannelsHdrDelivered');
  const hdrDisplays = document.getElementById('detailsChannelsHdrDisplays');
  const hdrClicks = document.getElementById('detailsChannelsHdrClicks');
  if (!sectionEl || !tbody || !wrapEl || !emptyEl || !noteEl) return;

  const rangePhrase = hoursBack === 24 ? 'last 24 hours' : hoursBack === 168 ? 'last 7 days' : 'last 30 days';
  noteEl.textContent = `Grouped by Adobe Journey Optimizer–style channel context when present (paths such as …emailchannelcontext.namespace, …pushchannelcontext.namespace, …smschannelcontext.namespace, or equivalent), then the Events-tab email namespace, then the event channel field. Metrics use the same delivery and interaction signals as the email cards above. ${rangePhrase}. Per-profile counts—not org-wide AJO reporting.`;
  noteEl.hidden = false;

  const bucket = new Map();
  (dateFilteredEvents || []).forEach((ev) => {
    const key = getMessageChannelKeyForDetails(ev);
    if (!key) return;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(ev);
  });

  if (bucket.size === 0) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'No events in this range could be assigned to a channel. Events need a channel-context namespace, email namespace, or a recognizable channel value.';
    wrapEl.hidden = true;
    tbody.innerHTML = '';
    if (hdrPeople) hdrPeople.textContent = '';
    if (hdrCtr) hdrCtr.textContent = '';
    if (hdrDelivered) hdrDelivered.textContent = '';
    if (hdrDisplays) hdrDisplays.textContent = '';
    if (hdrClicks) hdrClicks.textContent = '';
    return;
  }

  emptyEl.hidden = true;

  const rows = Array.from(bucket.entries()).map(([key, evs]) => {
    const m = computeChannelRowMetrics(evs);
    return { key, ...m };
  });
  rows.sort((a, b) => detailsChannelSortIndex(a.key) - detailsChannelSortIndex(b.key) || a.key.localeCompare(b.key));

  const totalDelivered = rows.reduce((s, r) => s + r.delivered, 0);
  const totalDisplays = rows.reduce((s, r) => s + r.displays, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalEvents = rows.reduce((s, r) => s + r.eventCount, 0);
  const avgCtr = totalDelivered > 0 ? ((totalClicks / totalDelivered) * 100).toFixed(2) : (totalDisplays > 0 ? ((totalClicks / totalDisplays) * 100).toFixed(2) : '0.00');

  if (hdrPeople) hdrPeople.textContent = `${rows.length} channel(s) · 1 profile`;
  if (hdrCtr) hdrCtr.textContent = `${avgCtr}%`;
  if (hdrDelivered) hdrDelivered.textContent = totalDelivered.toLocaleString();
  if (hdrDisplays) hdrDisplays.textContent = totalDisplays.toLocaleString();
  if (hdrClicks) hdrClicks.textContent = totalClicks.toLocaleString();

  const maxEv = Math.max(...rows.map((r) => r.eventCount), 1);
  const maxDel = Math.max(...rows.map((r) => r.delivered), 1);
  const maxDisp = Math.max(...rows.map((r) => r.displays), 1);
  const maxClk = Math.max(...rows.map((r) => r.clicks), 1);
  const maxCtr = Math.max(...rows.map((r) => parseFloat(r.ctr) || 0), 1);

  wrapEl.hidden = false;
  tbody.innerHTML = rows
    .map((r) => {
      const label = escapeHtml(formatChannelLabelForDetails(r.key));
      const peopleShare = totalEvents > 0 ? (r.eventCount / totalEvents) * 100 : 0;
      const delPct = totalDelivered > 0 ? (r.delivered / totalDelivered) * 100 : 0;
      const dispPct = totalDisplays > 0 ? (r.displays / totalDisplays) * 100 : 0;
      const clkPct = totalClicks > 0 ? (r.clicks / totalClicks) * 100 : 0;
      const peopleCell = detailsChannelBarCell(r.eventCount, maxEv, `1 · ${r.eventCount.toLocaleString()}`, peopleShare);
      const ctrCell = detailsChannelBarCell(parseFloat(r.ctr) || 0, maxCtr, `${r.ctr}%`, null);
      const delCell = detailsChannelBarCell(r.delivered, maxDel, r.delivered.toLocaleString(), delPct);
      const dispCell = detailsChannelBarCell(r.displays, maxDisp, r.displays.toLocaleString(), dispPct);
      const clkCell = detailsChannelBarCell(r.clicks, maxClk, r.clicks.toLocaleString(), clkPct);
      return `<tr><th scope="row">${label}</th><td>${peopleCell}</td><td>${ctrCell}</td><td>${delCell}</td><td>${dispCell}</td><td>${clkCell}</td></tr>`;
    })
    .join('');
}

function getEventFeedbackStatus(ev) {
  const rows = ev.rows || [];
  const row = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    return p === '_experience.customerjourneymanagement.messagedeliveryfeedback.feedbackstatus' ||
      (p.includes('messagedelivery') && p.includes('feedbackstatus'));
  });
  if (!row || row.value == null) return '—';
  const val = String(row.value).trim();
  return val || '—';
}

function getEventInteractionType(ev) {
  const rows = ev.rows || [];
  const row = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    const a = (r.attribute || '').toLowerCase();
    return p === '_experience.customerjourneymanagement.messageinteraction.interactiontype' ||
      p.endsWith('messageinteraction.interactiontype') ||
      (p.includes('messageinteraction') && p.includes('interactiontype')) ||
      p.includes('messageinteraction/interactiontype') ||
      (a === 'interactiontype' && p.includes('messageinteraction'));
  });
  if (!row || row.value == null) return '';
  return String(row.value).trim().toLowerCase();
}

function getEventCampaignId(ev) {
  const rows = ev.rows || [];
  const row = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    const a = (r.attribute || '').toLowerCase();
    return p.includes('messageexecution') && (p.includes('campaignid') || a === 'campaignid');
  });
  if (!row || row.value == null) return '';
  return String(row.value).trim();
}

function getEventJourneyVersionId(ev) {
  const rows = ev.rows || [];
  const row = rows.find((r) => {
    const p = (r.path || '').toLowerCase();
    const a = (r.attribute || '').toLowerCase();
    return p.includes('messageexecution') && (p.includes('journeyversionid') || a === 'journeyversionid');
  });
  if (!row || row.value == null) return '';
  return String(row.value).trim();
}

/** Group experience events by journey version ID (same field as the event detail modal). */
function aggregateJourneyActivity(events) {
  const map = new Map();
  (events || []).forEach((ev) => {
    const vid = getEventJourneyVersionId(ev);
    if (!vid) return;
    const ts = ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
    if (!map.has(vid)) {
      map.set(vid, { journeyVersionId: vid, count: 0, firstTs: ts, lastTs: ts });
    }
    const j = map.get(vid);
    j.count += 1;
    if (ts && (!j.firstTs || ts < j.firstTs)) j.firstTs = ts;
    if (ts > j.lastTs) j.lastTs = ts;
  });
  return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
}

function renderDetailsJourneysSection(dateFilteredEvents, hoursBack) {
  const emptyEl = document.getElementById('detailsJourneysEmpty');
  const wrapEl = document.getElementById('detailsJourneysWrap');
  const noteEl = document.getElementById('detailsJourneysNote');
  const tbody = document.getElementById('detailsJourneysBody');
  if (!tbody || !wrapEl || !emptyEl || !noteEl) return;

  const rows = aggregateJourneyActivity(dateFilteredEvents);
  const rangePhrase = hoursBack === 24 ? 'last 24 hours' : hoursBack === 168 ? 'last 7 days' : 'last 30 days';
  noteEl.textContent = `Journeys are inferred from experience events that include message execution / journey version ID (same source as the Events tab detail view). Date range: ${rangePhrase}. This is per-profile activity, not the all-profiles Journey Optimizer reporting totals.`;
  noteEl.hidden = false;

  if (rows.length === 0) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'No journey-linked events in this range. Open an event that was sent from a journey to see journey version ID there; only those events appear here.';
    wrapEl.hidden = true;
    tbody.innerHTML = '';
    return;
  }

  emptyEl.hidden = true;
  wrapEl.hidden = false;
  const maxCount = Math.max(...rows.map((r) => r.count), 1);
  tbody.innerHTML = rows
    .map((r, i) => {
      const pct = Math.round((r.count / maxCount) * 100);
      const last = r.lastTs ? formatEventTimestamp(r.lastTs) : '—';
      const vidEsc = escapeHtml(r.journeyVersionId);
      return `<tr><td class="details-journey-name-cell" data-journey-row="${i}">…</td><td class="details-journey-id-cell"><code>${vidEsc}</code></td><td class="details-journey-count-cell"><div class="details-journey-count-bar-wrap"><div class="details-journey-count-bar" style="width:${pct}%"></div><span class="details-journey-count-text">${r.count.toLocaleString()}</span></div></td><td>${escapeHtml(last)}</td></tr>`;
    })
    .join('');

  rows.forEach((r, i) => {
    fetchJourneyName(r.journeyVersionId).then((name) => {
      const cell = tbody.querySelector(`[data-journey-row="${i}"]`);
      if (cell) cell.textContent = name || '—';
    });
  });
}

/** Icon for each event type – visually distinct, category-based fallbacks */
const EVENT_TYPE_ICONS = {
  'web.webpagedetails.pageViews': '🌐',
  'web.login': '🔐',
  'web.logout': '🚪',
  'commerce.productViews': '👁️',
  'commerce.productListAdds': '🛒',
  'commerce.productListRemoves': '🗑️',
  'commerce.purchases': '✅',
  'commerce.checkouts': '💳',
  'email.open': '📧',
  'email.click': '📬',
  'email.bounce': '↩️',
  'contactCenter.call.start': '📞',
  'contactCenter.call.end': '📴',
  'contactCenter.call.details.submit': '📋',
  'contactCenter.survey.submit': '📝',
  'contactCenter.message.sent': '💬',
  'app.launch': '📱',
  'app.download': '⬇️',
  'application.launch': '📱',
  'application.login': '🔐',
  'mobile.homeScreenView': '🏠',
  'subscription.re-activated': '🔄',
  'paid.subscription.cancelled': '❌',
  'message.tracking': '📊',
  'message.feedback': '💬',
  'transaction': '💳',
  'advertising.completes': '📺',
  'deposit.made': '💰',
  'partnerData.update': '🔄',
  'bot.start': '🤖',
  'registration': '📝',
  'add.show.to.watch.list': '🎬',
};

function getEventTypeIcon(eventType) {
  if (!eventType) return '⚡';
  const key = String(eventType).trim();
  if (EVENT_TYPE_ICONS[key]) return EVENT_TYPE_ICONS[key];
  if (key.startsWith('web.')) return '🌐';
  if (key.startsWith('commerce.')) return '🛒';
  if (key.startsWith('email.')) return '📧';
  if (key.startsWith('contactCenter.')) return '📞';
  if (key.startsWith('app.') || key.startsWith('application.')) return '📱';
  if (key.startsWith('mobile.')) return '📱';
  if (key.includes('subscription')) return '📋';
  if (key.startsWith('message.')) return '💬';
  if (key.includes('transaction') || key.includes('commerce')) return '💳';
  if (key.startsWith('advertising.')) return '📺';
  return '⚡';
}

function filterEventsBySearch(events, query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return events;
  return events.filter((ev) => {
    const dt = formatEventDateTimeReceived(ev.timestamp);
    const et = (ev.eventName || '').toLowerCase();
    const eid = String(ev.entityId ?? '').toLowerCase();
    const ns = getEventNamespaceValue(ev).toLowerCase();
    const fb = getEventFeedbackStatus(ev).toLowerCase();
    const it = getEventInteractionType(ev).toLowerCase();
    const rowText = (ev.rows || []).map((r) => `${r.attribute} ${r.displayName} ${r.value} ${r.path}`).join(' ').toLowerCase();
    return dt.toLowerCase().includes(q) || et.includes(q) || eid.includes(q) || ns.includes(q) || fb.includes(q) || it.includes(q) || rowText.includes(q);
  });
}

function renderEvents(events) {
  if (!eventsListEl) return;
  eventsListEl.innerHTML = '';
  eventsLoadingEl.hidden = true;
  eventsErrorEl.hidden = true;
  if (!events || events.length === 0) {
    eventsEmptyEl.hidden = false;
    return;
  }
  eventsEmptyEl.hidden = true;

  eventsData = events;
  const hoursBack = eventsDateFilterEl ? parseInt(eventsDateFilterEl.value, 10) || 168 : 168;
  const dateFiltered = filterEventsByDateRange(events, hoursBack);
  const query = eventsSearchEl ? eventsSearchEl.value : '';
  const filtered = filterEventsBySearch(dateFiltered, query);
  const displayEvents = filtered;
  const totalCount = events.length;
  const dateFilteredCount = dateFiltered.length;
  const filteredCount = filtered.length;

  const wrapper = document.createElement('div');
  wrapper.className = 'profile-events-table-wrapper';
  const heading = document.createElement('p');
  heading.className = 'events-table-heading';
  heading.textContent = query
    ? `Showing ${displayEvents.length} of ${filteredCount} matching events (of ${dateFilteredCount} in range, ${totalCount} total)`
    : `Showing ${displayEvents.length} of ${dateFilteredCount} events in range (${totalCount} total). Click a row to view details.`;
  wrapper.appendChild(heading);

  const table = document.createElement('table');
  table.className = 'profile-events-summary-table';
  table.setAttribute('aria-label', 'Profile experience events');
  const hasVal = (v) => v != null && String(v).trim() !== '' && String(v).trim() !== '—';
  const countDateTime = displayEvents.filter((ev) => ev.timestamp != null && !isNaN(new Date(ev.timestamp).getTime())).length;
  const countEventType = displayEvents.filter((ev) => hasVal(ev.eventName)).length;
  const countChannel = displayEvents.filter((ev) => hasVal(getEventChannel(ev))).length;
  const countNamespace = displayEvents.filter((ev) => hasVal(getEventNamespaceValue(ev))).length;
  const countFeedbackStatus = displayEvents.filter((ev) => hasVal(getEventFeedbackStatus(ev))).length;
  const countInteractionType = displayEvents.filter((ev) => hasVal(getEventInteractionType(ev))).length;
  const countEntityId = displayEvents.filter((ev) => hasVal(ev.entityId)).length;

  const tbody = displayEvents.map((ev) => {
    const idx = eventsData.indexOf(ev);
    const dateTimeReceived = formatEventDateTimeReceived(ev.timestamp);
    const eventType = escapeHtml(ev.eventName || 'Experience event');
    const icon = getEventTypeIcon(ev.eventName);
    const entityId = escapeHtml(String(ev.entityId ?? ''));
    const channel = escapeHtml(getEventChannel(ev));
    const namespace = escapeHtml(getEventNamespaceValue(ev));
    const feedbackStatus = escapeHtml(getEventFeedbackStatus(ev));
    const interactionType = escapeHtml(getEventInteractionType(ev) || '—');
    return `<tr class="profile-event-row" data-event-index="${idx}" role="button" tabindex="0"><td>${dateTimeReceived}</td><td class="event-type-cell"><span class="event-type-icon" aria-hidden="true">${icon}</span>${eventType}</td><td class="event-channel-cell">${channel}</td><td class="event-namespace-cell">${namespace}</td><td class="event-feedback-status-cell">${feedbackStatus}</td><td class="event-interaction-type-cell">${interactionType}</td><td class="entity-id-cell">${entityId}</td></tr>`;
  }).join('');
  table.innerHTML = `
    <thead>
      <tr>
        <th>DateTime Received (${countDateTime})</th>
        <th>Event Type (${countEventType})</th>
        <th>Channel (${countChannel})</th>
        <th>Namespace (${countNamespace})</th>
        <th>Feedback Status (${countFeedbackStatus})</th>
        <th>Interaction Type (${countInteractionType})</th>
        <th>Entity ID (${countEntityId})</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  `;
  table.querySelectorAll('.profile-event-row').forEach((tr) => {
    tr.addEventListener('click', () => showEventDetail(eventsData[parseInt(tr.dataset.eventIndex, 10)]));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showEventDetail(eventsData[parseInt(tr.dataset.eventIndex, 10)]); } });
  });
  wrapper.appendChild(table);
  eventsListEl.appendChild(wrapper);
}

/** Extract propositions from event rows (scopeDetails.strategies.treatmentID, items.name, rank). */
function extractPropositionsFromEvent(ev) {
  const rows = ev.rows || [];
  const props = {};
  const propMatch = /propositions[._]?(\d+)/i;

  rows.forEach((r) => {
    const path = (r.path || '').replace(/_/g, '.');
    const val = r.value != null ? String(r.value).trim() : '';
    if (!path.toLowerCase().includes('decisioning') || !path.toLowerCase().includes('propositions')) return;

    const m = path.match(propMatch);
    const idx = m ? parseInt(m[1], 10) : 0;
    if (!(idx in props)) props[idx] = { place: idx + 1, treatmentID: '', treatmentName: '' };

    if (/strategies[._]?\d+[._]treatmentID$/i.test(path)) props[idx].treatmentID = val;
    if (/items[._]?\d+[._]name$/i.test(path) && path.includes(`propositions.${idx}.`)) props[idx].treatmentName = val;
    if (/scopeDetails[._]rank$/i.test(path) && path.includes(`propositions.${idx}.`)) props[idx].place = parseInt(val, 10) || idx + 1;
  });

  const out = Object.entries(props)
    .map(([k, p]) => ({ ...p, _idx: parseInt(k, 10) }))
    .filter((p) => p.treatmentID || p.treatmentName)
    .sort((a, b) => a.place - b.place || a._idx - b._idx);
  out.forEach((p) => {
    if (!p.treatmentName && p.treatmentID) p.treatmentName = p.treatmentID;
  });
  return out;
}

const treatmentNameCache = new Map();
const campaignNameCache = new Map();
const journeyNameCache = new Map();

async function fetchCampaignName(campaignId) {
  if (!campaignId || campaignNameCache.has(campaignId)) return campaignNameCache.get(campaignId) ?? null;
  try {
    const res = await fetch(`/api/campaign-name?id=${encodeURIComponent(campaignId)}${getSandboxParam()}`);
    const data = await res.json().catch(() => ({}));
    const name = data.name || null;
    campaignNameCache.set(campaignId, name);
    return name;
  } catch {
    campaignNameCache.set(campaignId, null);
    return null;
  }
}

async function fetchJourneyName(journeyVersionId) {
  if (!journeyVersionId || journeyNameCache.has(journeyVersionId)) return journeyNameCache.get(journeyVersionId) ?? null;
  try {
    const res = await fetch(`/api/journey-name?id=${encodeURIComponent(journeyVersionId)}${getSandboxParam()}`);
    const data = await res.json().catch(() => ({}));
    const name = data.name || null;
    journeyNameCache.set(journeyVersionId, name);
    return name;
  } catch {
    journeyNameCache.set(journeyVersionId, null);
    return null;
  }
}

async function fetchTreatmentName(treatmentID) {
  if (treatmentNameCache.has(treatmentID)) return treatmentNameCache.get(treatmentID);
  try {
    const res = await fetch(`/api/decisioning/treatment-name?id=${encodeURIComponent(treatmentID)}${getSandboxParam()}`);
    const data = await res.json().catch(() => ({}));
    const name = data.name || null;
    treatmentNameCache.set(treatmentID, name);
    return name;
  } catch {
    treatmentNameCache.set(treatmentID, null);
    return null;
  }
}

function showEventDetail(ev) {
  if (!ev) return;
  const modal = document.getElementById('eventDetailModal');
  const titleEl = document.getElementById('eventDetailModalTitle');
  const ecidEl = document.getElementById('eventDetailEcid');
  const tbody = document.getElementById('eventDetailTableBody');
  const propsWrap = document.getElementById('eventDetailPropositionsWrap');
  const propsBody = document.getElementById('eventDetailPropositionsBody');
  if (!modal || !ecidEl || !tbody) return;

  const icon = getEventTypeIcon(ev.eventName);
  titleEl.innerHTML = `<span class="event-detail-title-icon" aria-hidden="true">${icon}</span>${escapeHtml(ev.eventName || 'Event')}`;
  ecidEl.textContent = getEventEcid(ev);

  const campaignId = getEventCampaignId(ev);
  const campaignWrap = document.getElementById('eventDetailCampaignWrap');
  const campaignIdEl = document.getElementById('eventDetailCampaignId');
  const campaignNameEl = document.getElementById('eventDetailCampaignName');
  if (campaignWrap && campaignIdEl && campaignNameEl) {
    if (campaignId) {
      campaignWrap.hidden = false;
      campaignIdEl.textContent = campaignId;
      campaignNameEl.textContent = '…';
      fetchCampaignName(campaignId).then((name) => {
        campaignNameEl.textContent = name || '—';
      });
    } else {
      campaignWrap.hidden = true;
    }
  }

  const journeyVersionId = getEventJourneyVersionId(ev);
  const journeyWrap = document.getElementById('eventDetailJourneyWrap');
  const journeyVersionIdEl = document.getElementById('eventDetailJourneyVersionId');
  const journeyNameEl = document.getElementById('eventDetailJourneyName');
  if (journeyWrap && journeyVersionIdEl && journeyNameEl) {
    if (journeyVersionId) {
      journeyWrap.hidden = false;
      journeyVersionIdEl.textContent = journeyVersionId;
      journeyNameEl.textContent = '…';
      fetchJourneyName(journeyVersionId).then((name) => {
        journeyNameEl.textContent = name || '—';
      });
    } else {
      journeyWrap.hidden = true;
    }
  }

  const propositions = extractPropositionsFromEvent(ev);
  if (propositions.length > 0 && propsWrap && propsBody) {
    propsWrap.hidden = false;
    propsBody.innerHTML = propositions
      .map((p) => {
        const itemsName = p.treatmentName || '—';
        const treatmentDisplay = p.treatmentID || '—';
        const hasTreatmentId = !!p.treatmentID;
        return `<tr><td>${escapeHtml(String(p.place))}</td><td class="items-name-cell">${escapeHtml(itemsName)}</td><td class="treatment-name-cell" data-treatment-id="${hasTreatmentId ? escapeHtml(p.treatmentID) : ''}">${escapeHtml(treatmentDisplay)}</td></tr>`;
      })
      .join('');
    propsBody.querySelectorAll('.treatment-name-cell[data-treatment-id]').forEach((td) => {
      const id = td.dataset.treatmentId;
      if (!id) return;
      fetchTreatmentName(id).then((name) => {
        if (name) td.textContent = name;
      });
    });
  } else if (propsWrap) {
    propsWrap.hidden = true;
  }

  const rows = (ev.rows || []).map((row) => {
    const path = escapeHtml(row.path || '');
    const value = escapeHtml(String(row.value ?? ''));
    return `<tr><td class="attr-cell">${escapeHtml(row.attribute)}</td><td class="display-name-cell">${escapeHtml(row.displayName)}</td><td class="value-cell">${value}</td><td class="path-cell">${path}</td></tr>`;
  }).join('');
  tbody.innerHTML = rows;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closeEventDetailModal() {
  const modal = document.getElementById('eventDetailModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function loadEventsIfNeeded() {
  // Use the same email as the profile email field under Get profile (canonical profile email)
  const profileEmail = profileEmailDisplay?.dataset?.profileEmail ?? (profileEmailDisplay?.textContent || '').trim();
  const email = (profileEmail && profileEmail !== '—') ? profileEmail : (lastProfileData?.email || emailInput?.value?.trim());
  if (!email) {
    if (eventsListEl) eventsListEl.innerHTML = '';
    if (eventsEmptyEl) { eventsEmptyEl.hidden = false; eventsEmptyEl.textContent = 'Load a profile first (Get profile), then open the Events tab.'; }
    if (eventsLoadingEl) eventsLoadingEl.hidden = true;
    if (eventsErrorEl) eventsErrorEl.hidden = true;
    return;
  }
  if (eventsLoadedForEmail === email) return;
  eventsLoadedForEmail = email;
  if (eventsLoadingEl) eventsLoadingEl.hidden = false;
  if (eventsErrorEl) eventsErrorEl.hidden = true;
  if (eventsEmptyEl) eventsEmptyEl.hidden = true;
  if (eventsListEl) eventsListEl.innerHTML = '';
  try {
    const res = await fetch(`/api/profile/events?email=${encodeURIComponent(email)}${getSandboxParam()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      eventsLoadedForEmail = null;
      if (eventsErrorEl) { eventsErrorEl.textContent = data.error || res.statusText || 'Failed to load events.'; eventsErrorEl.hidden = false; }
      renderEvents([]);
      if (document.getElementById('panelDetails') && !document.getElementById('panelDetails').hidden) updateDetailsPanel();
      return;
    }
    renderEvents(data.events || []);
    if (document.getElementById('panelDetails') && !document.getElementById('panelDetails').hidden) updateDetailsPanel();
  } catch (err) {
    eventsLoadedForEmail = null;
    if (eventsErrorEl) { eventsErrorEl.textContent = err.message || 'Network error'; eventsErrorEl.hidden = false; }
    renderEvents([]);
    if (document.getElementById('panelDetails') && !document.getElementById('panelDetails').hidden) updateDetailsPanel();
  }
}

if (eventsSearchEl) {
  eventsSearchEl.addEventListener('input', () => {
    if (eventsData.length) renderEvents(eventsData);
  });
}
if (eventsDateFilterEl) {
  eventsDateFilterEl.addEventListener('change', () => {
    if (eventsData.length) renderEvents(eventsData);
  });
}

// Audience Membership tab – fetch and render audience membership (lazy load on first open)
let audiencesLoadedForEmail = null;
const audienceListEl = document.getElementById('audienceList');
const audienceLoadingEl = document.getElementById('audienceLoading');
const audienceErrorEl = document.getElementById('audienceError');
const audienceEmptyEl = document.getElementById('audienceEmpty');

function formatAudienceDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function renderAudiences(data) {
  if (!audienceListEl) return;
  audienceListEl.innerHTML = '';
  audienceLoadingEl.hidden = true;
  audienceErrorEl.hidden = true;
  if (!data) {
    audienceEmptyEl.hidden = false;
    return;
  }
  const { realized = [], exited = [] } = data;
  if (realized.length === 0 && exited.length === 0) {
    audienceEmptyEl.hidden = false;
    audienceEmptyEl.textContent = 'No audience membership found for this profile.';
    return;
  }
  audienceEmptyEl.hidden = true;

  const wrapper = document.createElement('div');
  wrapper.className = 'profile-audience-wrapper';

  if (realized.length > 0) {
    const section = document.createElement('div');
    section.className = 'audience-section';
    section.innerHTML = `
      <h3 class="audience-section-title">Currently qualified</h3>
      <table class="profile-events-summary-table audience-table" aria-label="Currently qualified audiences">
        <thead><tr><th>Audience</th><th>Last qualified</th></tr></thead>
        <tbody>
          ${realized.map((a) => `
            <tr>
              <td><span class="audience-status-badge audience-status-realized">Qualified</span> ${escapeHtml(a.name)}</td>
              <td>${formatAudienceDate(a.lastQualificationTime)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrapper.appendChild(section);
  }

  if (exited.length > 0) {
    const section = document.createElement('div');
    section.className = 'audience-section audience-section-exited';
    section.innerHTML = `
      <h3 class="audience-section-title">Previously qualified (exited)</h3>
      <table class="profile-events-summary-table audience-table" aria-label="Previously qualified audiences">
        <thead><tr><th>Audience</th><th>Last qualified</th></tr></thead>
        <tbody>
          ${exited.map((a) => `
            <tr>
              <td><span class="audience-status-badge audience-status-exited">Exited</span> ${escapeHtml(a.name)}</td>
              <td>${formatAudienceDate(a.lastQualificationTime)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrapper.appendChild(section);
  }

  audienceListEl.appendChild(wrapper);
}

async function loadAudiencesIfNeeded() {
  const profileEmail = profileEmailDisplay?.dataset?.profileEmail ?? (profileEmailDisplay?.textContent || '').trim();
  const email = (profileEmail && profileEmail !== '—') ? profileEmail : (lastProfileData?.email || emailInput?.value?.trim());
  if (!email) {
    if (audienceListEl) audienceListEl.innerHTML = '';
    if (audienceEmptyEl) { audienceEmptyEl.hidden = false; audienceEmptyEl.textContent = 'Load a profile first (Get profile), then open the Audience Membership tab.'; }
    if (audienceLoadingEl) audienceLoadingEl.hidden = true;
    if (audienceErrorEl) audienceErrorEl.hidden = true;
    return;
  }
  if (audiencesLoadedForEmail === email) return;
  audiencesLoadedForEmail = email;
  audienceLoadingEl.hidden = false;
  audienceErrorEl.hidden = true;
  audienceEmptyEl.hidden = true;
  if (audienceListEl) audienceListEl.innerHTML = '';
  try {
    const res = await fetch(`/api/profile/audiences?email=${encodeURIComponent(email)}${getSandboxParam()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      audiencesLoadedForEmail = null;
      if (audienceErrorEl) { audienceErrorEl.textContent = data.error || res.statusText || 'Failed to load audience membership.'; audienceErrorEl.hidden = false; }
      renderAudiences(null);
      return;
    }
    renderAudiences(data);
  } catch (err) {
    audiencesLoadedForEmail = null;
    if (audienceErrorEl) { audienceErrorEl.textContent = err.message || 'Network error'; audienceErrorEl.hidden = false; }
    renderAudiences(null);
  }
}

const eventDetailClose = document.getElementById('eventDetailClose');
const eventDetailModal = document.getElementById('eventDetailModal');
if (eventDetailClose && eventDetailModal) {
  eventDetailClose.addEventListener('click', closeEventDetailModal);
  eventDetailModal.addEventListener('click', (e) => { if (e.target === eventDetailModal) closeEventDetailModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !eventDetailModal.hidden) closeEventDetailModal(); });
}

// Attribute search – filter table rows
function filterAttributeRows(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = attributeTableBody.querySelectorAll('tr');
  rows.forEach((tr) => {
    const text = tr.textContent || '';
    tr.hidden = q ? !text.toLowerCase().includes(q) : false;
  });
}
const attributeSearchEl = document.getElementById('attributeSearch');
if (attributeSearchEl) {
  attributeSearchEl.addEventListener('input', () => filterAttributeRows(attributeSearchEl.value));
}

// View JSON – show last profile data in modal
const viewJsonBtn = document.getElementById('viewJsonBtn');
const viewJsonModal = document.getElementById('viewJsonModal');
const viewJsonPre = document.getElementById('viewJsonPre');
const viewJsonClose = document.getElementById('viewJsonClose');
if (viewJsonBtn && viewJsonModal && viewJsonPre) {
  viewJsonBtn.addEventListener('click', () => {
    if (lastProfileData) {
      viewJsonPre.textContent = JSON.stringify(lastProfileData, null, 2);
      viewJsonModal.hidden = false;
      viewJsonModal.setAttribute('aria-hidden', 'false');
    }
  });
}
if (viewJsonClose && viewJsonModal) {
  viewJsonClose.addEventListener('click', () => {
    viewJsonModal.hidden = true;
    viewJsonModal.setAttribute('aria-hidden', 'true');
  });
  viewJsonModal.addEventListener('click', (e) => {
    if (e.target === viewJsonModal) {
      viewJsonModal.hidden = true;
      viewJsonModal.setAttribute('aria-hidden', 'true');
    }
  });
}

// Update profile – send changed attributes via streaming (Data Prep merge) or Edge fallback
const updateProfileBtn = document.getElementById('updateProfileBtn');
const updateStatusEl = document.getElementById('updateStatus');

function setUpdateStatus(text, type) {
  if (updateStatusEl) {
    updateStatusEl.textContent = text || '';
    updateStatusEl.className = 'profile-update-status consent-message' + (type ? ' ' + type : '');
    updateStatusEl.hidden = !text;
  }
}

if (updateProfileBtn && updateStatusEl) {
  updateProfileBtn.addEventListener('click', async () => {
    const emailEl = document.getElementById('profileEmailDisplay');
    const ecidEl = document.getElementById('profileEcidDisplay');
    // Use data attributes (set when profile loads) so payload uses same email/ECID as displayed profile; display truncates ECID to 38 chars
    const profileEmail = String((emailEl?.dataset.profileEmail ?? emailEl?.textContent) ?? '').trim();
    const ecid = String((ecidEl?.dataset.ecid ?? ecidEl?.textContent) ?? '').trim();
    if (!profileEmail) {
      setUpdateStatus('Load a profile first (Get profile) to get profile email.', 'error');
      return;
    }
    if (!ecid || ecid.length < 10) {
      setUpdateStatus('Load a profile first (Get profile) to get ECID.', 'error');
      return;
    }
    const inputs = attributeTableBody.querySelectorAll('.profile-value-input');
    const updates = [];
    inputs.forEach((input) => {
      const path = input.getAttribute('data-path');
      const originalValue = input.getAttribute('data-original-value') ?? '';
      const currentValue = input.value == null ? '' : String(input.value);
      if (path && currentValue !== originalValue) {
        const valueToSend = normalizeProfileStreamDateField(path, currentValue);
        updates.push({ path, value: valueToSend });
      }
    });
    const loyaltySel = document.getElementById('addLoyaltyIdSelect');
    const loyaltyChoice = String(loyaltySel?.value ?? '').trim();
    if (loyaltyChoice) {
      const loyaltyId =
        loyaltyChoice === '__random__'
          ? `LYL-${Math.floor(Math.random() * 900000) + 100000}`
          : loyaltyChoice;
      updates.push({ path: '_demoemea.identification.core.loyaltyId', value: loyaltyId });
    }
    if (updates.length === 0) {
      setUpdateStatus(
        'No changes to update. Edit attribute values or choose a loyalty ID above, then click Update profile.',
        'error',
      );
      return;
    }
    updateProfileBtn.disabled = true;
    setUpdateStatus('Sending update…', '');
    const payloadDetailsEl = document.getElementById('sentPayloadDetails');
    if (payloadDetailsEl) payloadDetailsEl.hidden = true;
    try {
      const sandbox = sandboxSelect?.value?.trim() || undefined;
      const { ok, data } = await postProfileUpdate({ email: profileEmail, ecid, updates, sandbox });
      if (!ok) {
        const errMsg = formatProfileUpdateError(data);
        setUpdateStatus(errMsg, 'error');
        const payloadDetails = document.getElementById('sentPayloadDetails');
        const payloadPre = document.getElementById('sentPayloadPre');
        const requestInfo = document.getElementById('sentRequestInfo');
        const requestUrlEl = document.getElementById('sentRequestUrl');
        const requestHeadersEl = document.getElementById('sentRequestHeaders');
        const showPayloadDetails =
          payloadDetails &&
          payloadPre &&
          (data.sentToAep != null ||
            resolveProfileStreamingUiFields(data) != null);
        if (showPayloadDetails) {
          if (requestInfo && requestUrlEl && requestHeadersEl && data.requestUrl != null) {
            requestUrlEl.textContent = data.requestUrl;
            requestHeadersEl.textContent = data.requestHeaders != null ? JSON.stringify(data.requestHeaders, null, 2) : '';
            requestInfo.hidden = false;
          } else if (requestInfo) {
            requestInfo.hidden = true;
          }
          payloadPre.textContent =
            data.sentToAep != null ? formatAepPayloadPreContent(data) : '— (no request body returned)';
          payloadDetails.hidden = false;
          payloadDetails.open = false;
        }
        return;
      }
      updates.forEach(({ path, value }) => {
        attributeTableBody.querySelectorAll('.profile-value-input').forEach((input) => {
          if (input.getAttribute('data-path') === path) {
            const v = Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value);
            input.setAttribute('data-original-value', v);
          }
        });
      });
      if (loyaltyChoice && loyaltySel) loyaltySel.value = '';
      let okMsg =
        data.message ||
        `Profile update sent (${updates.length} attribute${updates.length === 1 ? '' : 's'}). Refresh the profile to see changes.`;
      if (data.streamingWarning) okMsg += ` Streaming note: ${data.streamingWarning}`;
      setUpdateStatus(okMsg, data.streamingWarning ? 'warning' : 'success');
      const payloadDetails = document.getElementById('sentPayloadDetails');
      const payloadPre = document.getElementById('sentPayloadPre');
      const requestInfo = document.getElementById('sentRequestInfo');
      const requestUrlEl = document.getElementById('sentRequestUrl');
      const requestHeadersEl = document.getElementById('sentRequestHeaders');
      if (payloadDetails && payloadPre && data.sentToAep != null) {
        if (requestInfo && requestUrlEl && requestHeadersEl && data.requestUrl != null) {
          requestUrlEl.textContent = data.requestUrl;
          requestHeadersEl.textContent = data.requestHeaders != null ? JSON.stringify(data.requestHeaders, null, 2) : '';
          requestInfo.hidden = false;
        } else if (requestInfo) {
          requestInfo.hidden = true;
        }
        payloadPre.textContent = formatAepPayloadPreContent(data);
        payloadDetails.hidden = false;
        payloadDetails.open = false;
      }
    } catch (err) {
      setUpdateStatus(err.message || 'Network error', 'error');
    } finally {
      updateProfileBtn.disabled = false;
    }
  });
}
