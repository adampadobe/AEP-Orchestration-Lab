const params = new URLSearchParams(window.location.search);
const email = params.get('identifier') || params.get('email');
const namespace = params.get('namespace') || 'email';

const loadingEl = document.getElementById('loading');
const errorSection = document.getElementById('error');
const errorMessageEl = document.getElementById('errorMessage');
const tableSection = document.getElementById('tableSection');
const profileEmailEl = document.getElementById('profileEmail');
const attributeTableBody = document.getElementById('attributeTableBody');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  return '';
}

if (!email) {
  loadingEl.hidden = true;
  errorSection.hidden = false;
  errorMessageEl.textContent = 'Missing identifier. Open this page from the search results (e.g. profile.html?identifier=user@example.com&namespace=email).';
} else {
  profileEmailEl.textContent = email;

  (async () => {
    try {
      const res = await fetch(`/api/profile/table?identifier=${encodeURIComponent(email)}&namespace=${encodeURIComponent(namespace)}${getSandboxParam()}`);
      const data = await res.json();

      loadingEl.hidden = true;

      if (!res.ok) {
        errorSection.hidden = false;
        tableSection.hidden = true;
        errorMessageEl.textContent = data.error || `Request failed (${res.status})`;
        return;
      }

      if (!data.found || !data.rows || data.rows.length === 0) {
        errorSection.hidden = false;
        tableSection.hidden = true;
        errorMessageEl.textContent = 'No profile or no attributes found for this email.';
        return;
      }

      errorSection.hidden = true;
      tableSection.hidden = false;
      if (typeof addEmail === 'function') addEmail(data.profileEmail || email);

      attributeTableBody.innerHTML = '';
      data.rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="attr-cell">${escapeHtml(row.attribute)}</td>
          <td class="display-name-cell">${escapeHtml(row.displayName)}</td>
          <td class="value-cell">${escapeHtml(row.value)}</td>
          <td class="path-cell">${escapeHtml(row.path)}</td>
        `;
        attributeTableBody.appendChild(tr);
      });
    } catch (err) {
      loadingEl.hidden = true;
      errorSection.hidden = false;
      tableSection.hidden = true;
      errorMessageEl.textContent = err.message || 'Network error';
    }
  })();
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}
