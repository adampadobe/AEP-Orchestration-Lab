/**
 * Standalone Audience membership page – uses GET /api/profile/audiences.
 */

const sandboxSelect = document.getElementById('sandboxSelect');
const emailInput = document.getElementById('audienceEmail');
const lookupBtn = document.getElementById('audienceLookupBtn');
const resultsSection = document.getElementById('audienceResults');
const statusEl = document.getElementById('audienceStatus');
const audienceListEl = document.getElementById('audienceList');
const audienceLoadingEl = document.getElementById('audienceLoading');
const audienceErrorEl = document.getElementById('audienceError');
const audienceEmptyEl = document.getElementById('audienceEmpty');

function getSandboxParam() {
  if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
    return window.AepGlobalSandbox.getSandboxParam();
  }
  const val = sandboxSelect?.value?.trim();
  return val ? `&sandbox=${encodeURIComponent(val)}` : '';
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

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

function setStatus(text, type) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.className = 'consent-message' + (type ? ` ${type}` : '');
  statusEl.hidden = !text;
}

function formatAudienceDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function renderAudiences(data) {
  if (!audienceListEl) return;
  audienceListEl.innerHTML = '';
  if (audienceLoadingEl) audienceLoadingEl.hidden = true;
  if (audienceErrorEl) audienceErrorEl.hidden = true;
  if (!data) {
    if (audienceEmptyEl) audienceEmptyEl.hidden = false;
    return;
  }
  const { realized = [], exited = [] } = data;
  if (realized.length === 0 && exited.length === 0) {
    if (audienceEmptyEl) {
      audienceEmptyEl.hidden = false;
      audienceEmptyEl.textContent = 'No audience membership found for this profile.';
    }
    return;
  }
  if (audienceEmptyEl) audienceEmptyEl.hidden = true;

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

async function loadAudiences() {
  const email = (emailInput?.value || '').trim();
  setStatus('');
  if (!email) {
    setStatus('Enter an email address.', 'error');
    if (resultsSection) resultsSection.hidden = true;
    return;
  }

  if (resultsSection) resultsSection.hidden = false;
  if (audienceLoadingEl) audienceLoadingEl.hidden = false;
  if (audienceErrorEl) audienceErrorEl.hidden = true;
  if (audienceEmptyEl) audienceEmptyEl.hidden = true;
  if (audienceListEl) audienceListEl.innerHTML = '';

  if (lookupBtn) lookupBtn.disabled = true;
  try {
    const res = await fetch(`/api/profile/audiences?email=${encodeURIComponent(email)}${getSandboxParam()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (audienceErrorEl) {
        audienceErrorEl.textContent = data.error || res.statusText || 'Failed to load audience membership.';
        audienceErrorEl.hidden = false;
      }
      if (audienceLoadingEl) audienceLoadingEl.hidden = true;
      renderAudiences(null);
      return;
    }
    renderAudiences(data);
  } catch (err) {
    if (audienceErrorEl) {
      audienceErrorEl.textContent = err.message || 'Network error';
      audienceErrorEl.hidden = false;
    }
    if (audienceLoadingEl) audienceLoadingEl.hidden = true;
    renderAudiences(null);
  } finally {
    if (lookupBtn) lookupBtn.disabled = false;
  }
}

loadSandboxes();
lookupBtn?.addEventListener('click', loadAudiences);
emailInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadAudiences();
  }
});
