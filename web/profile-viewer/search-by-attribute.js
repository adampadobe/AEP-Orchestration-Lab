const attrSelect = document.getElementById('attrSelect');
const attrCustom = document.getElementById('attrCustom');
const valueInput = document.getElementById('valueInput');
const matchSelect = document.getElementById('matchSelect');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');
const resultsSection = document.getElementById('results');
const profileListBody = document.getElementById('profileListBody');
const noResultsEl = document.getElementById('noResults');
const errorSection = document.getElementById('error');
const errorMessageEl = document.getElementById('errorMessage');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  return '';
}

attrSelect.addEventListener('change', () => {
  const isCustom = attrSelect.value === '_custom';
  attrCustom.hidden = !isCustom;
  if (isCustom) attrCustom.focus();
});

function getAttrPath() {
  if (attrSelect.value === '_custom') {
    return (attrCustom.value || '').trim();
  }
  return attrSelect.value || '';
}

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
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

searchBtn.addEventListener('click', doSearch);
valueInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});
attrCustom.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

async function doSearch() {
  const attr = getAttrPath();
  const value = valueInput.value.trim();
  if (!attr) {
    setStatus('Select or enter an attribute path.', 'error');
    return;
  }
  if (!value) {
    setStatus('Enter a value to search for.', 'error');
    return;
  }

  searchBtn.disabled = true;
  setStatus('Searching… (Query Service can take 2–3 min)', 'loading');
  showError('');

  const match = matchSelect.value || 'exact';
  const quickMode = document.getElementById('quickMode')?.checked;
  const params = new URLSearchParams({ attr, value, match });
  if (quickMode) params.set('quick', '1');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const res = await fetch(`/api/profile/search-by-attribute?${params}${getSandboxParam()}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showError(data.error || `Request failed (${res.status})`);
      setStatus('', 'error');
      resultsSection.hidden = false;
      profileListBody.innerHTML = '';
      noResultsEl.hidden = false;
      return;
    }

    const profiles = data.profiles || [];
    const apiMessage = data.message;

    if (typeof addEmail === 'function') {
      profiles.forEach((p) => { if (p && p.email) addEmail(p.email); });
    }

    renderResults(profiles, quickMode);

    const apiMessageEl = document.getElementById('apiMessage');
    if (apiMessage) {
      apiMessageEl.textContent = apiMessage;
      apiMessageEl.hidden = false;
    } else {
      apiMessageEl.hidden = true;
    }

    setStatus(profiles.length ? `Found ${profiles.length} profile(s).` : (apiMessage ? 'See message below.' : 'No profiles match.'));
    if (profiles.length === 0) showSqlHelp(attr, value, matchSelect.value);
    else hideSqlHelp();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      showError('Request timed out after 3 minutes. Query Service can be slow. Try a more specific value or use "Contains" match.');
    } else {
      showError(err.message || 'Network error');
    }
    setStatus('', 'error');
    showSqlHelp(getAttrPath(), valueInput.value.trim(), matchSelect.value);
  } finally {
    searchBtn.disabled = false;
  }
}

function renderResults(profiles, emailsOnly) {
  resultsSection.hidden = false;
  noResultsEl.hidden = (profiles || []).length > 0;
  profileListBody.innerHTML = '';
  const thead = profileListBody.closest('table')?.querySelector('thead tr');
  if (thead) {
    thead.innerHTML = emailsOnly ? '<th>Email address</th>' : '<th>First name</th><th>Last name</th><th>Email address</th>';
  }
  (profiles || []).forEach((p) => {
    const tr = document.createElement('tr');
    const email = p.email || p;
    tr.innerHTML = emailsOnly
      ? `<td><a href="profile.html?email=${encodeURIComponent(email)}">${escapeHtml(email)}</a></td>`
      : `
      <td>${escapeHtml(p.firstName || '—')}</td>
      <td>${escapeHtml(p.lastName || '—')}</td>
      <td><a href="profile.html?email=${encodeURIComponent(p.email)}">${escapeHtml(p.email)}</a></td>
    `;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      window.location.href = `profile.html?email=${encodeURIComponent(email)}`;
    });
    profileListBody.appendChild(tr);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function showSqlHelp(attr, value, match) {
  if (!attr || !value) return hideSqlHelp();
  const sqlHelp = document.getElementById('sqlHelp');
  const sqlPreview = document.getElementById('sqlPreview');
  const copyBtn = document.getElementById('copySqlBtn');
  if (!sqlHelp || !sqlPreview) return;
  try {
    const res = await fetch(
      `/api/profile/search-by-attribute/sql?attr=${encodeURIComponent(attr)}&value=${encodeURIComponent(value)}&match=${encodeURIComponent(match || 'exact')}${getSandboxParam()}`,
    );
    const data = await res.json().catch(() => ({}));
    if (data.sql) {
      sqlPreview.textContent = data.sql;
      sqlHelp.hidden = false;
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(data.sql).then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy SQL'; }, 1500); });
        };
      }
    } else {
      hideSqlHelp();
    }
  } catch {
    hideSqlHelp();
  }
}

function hideSqlHelp() {
  const sqlHelp = document.getElementById('sqlHelp');
  if (sqlHelp) sqlHelp.hidden = true;
}
