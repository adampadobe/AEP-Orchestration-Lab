const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');

// Attach datalist for recent search terms
(function () {
  const listId = 'recentSearchTerms';
  let list = document.getElementById(listId);
  if (!list) {
    list = document.createElement('datalist');
    list.id = listId;
    document.body.appendChild(list);
  }
  searchInput?.setAttribute('list', listId);
  function refresh() {
    if (!list || typeof getRecentSearchTerms !== 'function') return;
    list.innerHTML = '';
    getRecentSearchTerms().forEach((term) => {
      const opt = document.createElement('option');
      opt.value = term;
      list.appendChild(opt);
    });
  }
  refresh();
  searchInput?.addEventListener('focus', refresh);
})();
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
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) {
    setStatus('Enter part of an email address to search.', 'error');
    return;
  }

  // Check cache first
  if (typeof getCachedSearchResults === 'function') {
    const cached = getCachedSearchResults(q);
    if (cached !== null) {
      if (typeof addRecentSearchTerm === 'function') addRecentSearchTerm(q);
      if (typeof addEmail === 'function') cached.forEach((p) => { if (p && p.email) addEmail(p.email); });
      renderResults(cached);
      setStatus(cached.length ? `Found ${cached.length} profile(s) (from cache).` : 'No profiles match.');
      return;
    }
  }

  searchBtn.disabled = true;
  setStatus('Searching…', 'loading');
  showError('');

  try {
    const res = await fetch(`/api/profile/search?q=${encodeURIComponent(q)}${getSandboxParam()}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      showError(
        'Server returned a non-JSON response. Use the Profile Viewer server: run "npm start" in the "03 Profile Viewer" folder, then open http://localhost:3333/search.html (not via Live Server or file://).'
      );
      setStatus('', 'error');
      return;
    }

    if (!res.ok) {
      showError(data.error || `Request failed (${res.status})`);
      setStatus('', 'error');
      if (data.profiles) {
        resultsSection.hidden = false;
        profileListBody.innerHTML = '';
        noResultsEl.hidden = false;
      }
      return;
    }

    const profiles = data.profiles || [];
    const apiMessage = data.message;

    if (typeof setCachedSearchResults === 'function') setCachedSearchResults(q, profiles);
    if (typeof addRecentSearchTerm === 'function') addRecentSearchTerm(q);
    if (typeof addEmail === 'function') (profiles || []).forEach((p) => { if (p.email) addEmail(p.email); });

    renderResults(profiles);

    const apiMessageEl = document.getElementById('apiMessage');
    if (apiMessage) {
      apiMessageEl.textContent = apiMessage;
      apiMessageEl.hidden = false;
    } else {
      apiMessageEl.hidden = true;
    }

    setStatus(profiles.length ? `Found ${profiles.length} profile(s).` : (apiMessage ? 'See message below.' : 'No profiles match.'));
  } catch (err) {
    showError(err.message || 'Network error');
    setStatus('', 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

function renderResults(profiles) {
  resultsSection.hidden = false;
  noResultsEl.hidden = (profiles || []).length > 0;
  profileListBody.innerHTML = '';
  (profiles || []).forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.firstName || '—')}</td>
      <td>${escapeHtml(p.lastName || '—')}</td>
      <td><a href="profile.html?email=${encodeURIComponent(p.email)}">${escapeHtml(p.email)}</a></td>
    `;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      window.location.href = `profile.html?email=${encodeURIComponent(p.email)}`;
    });
    profileListBody.appendChild(tr);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
