(function () {
  'use strict';

  const statusLine = document.getElementById('statusLine');
  const pathsDl = document.getElementById('pathsDl');
  const pathProject = document.getElementById('pathProject');
  const pathHosting = document.getElementById('pathHosting');
  const targetFolder = document.getElementById('targetFolder');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadMsg = document.getElementById('uploadMsg');
  const uploadList = document.getElementById('uploadList');
  const btnDeploy = document.getElementById('btnDeploy');
  const deployOut = document.getElementById('deployOut');

  function getNamingMode() {
    const el = document.querySelector('input[name="naming"]:checked');
    return el ? el.value : 'keep';
  }

  async function loadStatus() {
    try {
      const r = await fetch('/api/hosting/status');
      const j = await r.json();
      if (j.ok && j.hostingExists && j.firebaseJsonExists) {
        statusLine.textContent = 'Ready — paths resolved.';
        statusLine.className = 'status-line ok';
        pathProject.textContent = j.projectDir || '—';
        pathHosting.textContent = j.hostingPublicDir || '—';
        pathsDl.hidden = false;
        btnDeploy.disabled = false;
      } else {
        statusLine.textContent =
          'Not configured — set FIREBASE_PROJECT_DIR in .env and restart the server.';
        statusLine.className = 'status-line bad';
        pathProject.textContent = j.projectDir || '(unset)';
        pathHosting.textContent = j.hostingPublicDir || '(unset)';
        pathsDl.hidden = false;
        btnDeploy.disabled = true;
      }
    } catch (e) {
      statusLine.textContent = 'Cannot reach local server. Run: npm start in this folder.';
      statusLine.className = 'status-line bad';
    }
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    const folder = (targetFolder.value || '').trim();
    const namingMode = getNamingMode();

    uploadMsg.textContent = 'Uploading…';
    uploadMsg.className = 'msg';
    uploadList.hidden = true;
    uploadList.innerHTML = '';

    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('targetFolder', folder);
    fd.append('namingMode', namingMode);

    try {
      const r = await fetch('/api/hosting/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);

      uploadMsg.textContent = `Saved ${j.count} file(s) under hosting folder.`;
      uploadMsg.className = 'msg ok';
      uploadList.hidden = false;
      (j.files || []).forEach((f) => {
        const li = document.createElement('li');
        li.textContent = f.path;
        uploadList.appendChild(li);
      });
    } catch (e) {
      uploadMsg.textContent = e.message || 'Upload failed';
      uploadMsg.className = 'msg error';
    }
  }

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    uploadFiles(e.dataTransfer.files);
  });

  btnDeploy.addEventListener('click', async () => {
    deployOut.hidden = false;
    deployOut.textContent = 'Running firebase deploy…';
    btnDeploy.disabled = true;
    try {
      const r = await fetch('/api/hosting/deploy', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      const parts = [];
      if (j.error) parts.push('Error: ' + j.error, j.hint || '');
      if (j.stdout) parts.push(j.stdout);
      if (j.stderr) parts.push(j.stderr);
      if (!parts.length) parts.push(JSON.stringify(j, null, 2));
      deployOut.textContent = parts.filter(Boolean).join('\n');
      if (!r.ok && !j.stdout && !j.stderr) {
        deployOut.textContent = 'HTTP ' + r.status + (j.error ? ': ' + j.error : '');
      }
    } catch (e) {
      deployOut.textContent = e.message || 'Deploy request failed';
    }
    btnDeploy.disabled = false;
    loadStatus();
  });

  loadStatus();
})();
