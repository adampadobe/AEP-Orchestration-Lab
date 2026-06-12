/**
 * Claude skills — shared lab catalog (Storage + Firestore + Vertex AI).
 * Primary UX: drop file → upload → Vertex analyze → auto-publish.
 */
(function () {
  'use strict';

  var STORAGE_LEGACY_KEY = 'claudeSkillsCatalogV1';
  var ACCEPTED_EXTENSIONS = ['md', 'txt', 'json', 'yaml', 'yml', 'zip'];
  /** Must stay under Cloud Functions ~32 MiB JSON body (base64 adds ~33%). */
  var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  var MAX_JSON_PAYLOAD_BYTES = 31 * 1024 * 1024;
  var API_UPLOAD = '/api/claude-skills/upload';
  var API_ANALYZE = '/api/claude-skills/analyze';
  var API_CATALOG = '/api/claude-skills/catalog';
  var API_PUBLISH = '/api/claude-skills/publish';

  var state = {
    draft: null,
    lastPublishedSkill: null,
    publishedSkills: [],
    catalogLoading: false,
    processing: false,
    advancedOpen: false,
    expandedSkillIds: {},
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fileExtension(fileName) {
    var parts = String(fileName || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function parseTagsInput(raw) {
    return Array.from(
      new Set(
        String(raw || '')
          .split(',')
          .map(function (item) {
            return item.trim().toLowerCase();
          })
          .filter(Boolean)
      )
    );
  }

  function parseUseCasesInput(raw) {
    return Array.from(
      new Set(
        String(raw || '')
          .split('\n')
          .map(function (item) {
            return item.trim();
          })
          .filter(Boolean)
      )
    ).slice(0, 10);
  }

  function formatFileSize(bytes) {
    var mb = bytes / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(mb >= 10 ? 0 : 1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function estimateJsonPayloadBytes(rawBytes) {
    return Math.ceil(Number(rawBytes || 0) * 4 / 3) + 512;
  }

  function normalizeZipPath(entryPath) {
    return String(entryPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function isUnsafeZipPath(name) {
    if (!name || name.indexOf('..') !== -1) return true;
    if (name.indexOf('__MACOSX/') === 0 || name === '__MACOSX') return true;
    var base = name.split('/').pop() || '';
    return base === '.DS_Store' || base.indexOf('._') === 0;
  }

  function isAcceptedSkillZipEntry(entryPath) {
    var normalized = normalizeZipPath(entryPath);
    if (!normalized || isUnsafeZipPath(normalized)) return false;
    var base = normalized.split('/').pop() || '';
    if (!base || base.charAt(0) === '.') return false;
    return ACCEPTED_EXTENSIONS.indexOf(fileExtension(base)) !== -1;
  }

  function ensureFflate() {
    if (typeof fflate === 'undefined' || !fflate.unzipSync || !fflate.zipSync) {
      return Promise.reject(new Error('ZIP helper failed to load. Refresh and try again.'));
    }
    return Promise.resolve(fflate);
  }

  function slimZipToSkillFiles(file) {
    return ensureFflate().then(function (zipLib) {
      return file.arrayBuffer().then(function (buffer) {
        var entries;
        try {
          entries = zipLib.unzipSync(new Uint8Array(buffer));
        } catch (_err) {
          throw new Error('Could not read ZIP archive in the browser.');
        }
        var filtered = {};
        var kept = 0;
        Object.keys(entries).forEach(function (entryPath) {
          if (!isAcceptedSkillZipEntry(entryPath)) return;
          filtered[entryPath] = entries[entryPath];
          kept += 1;
        });
        if (!kept) {
          throw new Error(
            'ZIP contains no skill files (.md, .txt, .json, .yaml, .yml). Add SKILL.md or upload the markdown file directly.',
          );
        }
        var slimBytes = zipLib.zipSync(filtered);
        var slimName = String(file.name || 'archive.zip').replace(/\.zip$/i, '') + '-skill-files.zip';
        return new File([slimBytes], slimName, { type: 'application/zip' });
      });
    });
  }

  function prepareUploadFile(file) {
    var ext = fileExtension(file.name);
    var payloadEstimate = estimateJsonPayloadBytes(file.size);
    if (payloadEstimate <= MAX_JSON_PAYLOAD_BYTES && file.size <= MAX_UPLOAD_BYTES) {
      return Promise.resolve({ file: file, note: '' });
    }
    if (ext !== 'zip') {
      throw new Error(
        'Upload failed (file too large): ' +
          formatFileSize(file.size) +
          ' exceeds the ' +
          formatFileSize(MAX_UPLOAD_BYTES) +
          ' browser upload limit. Upload a smaller file or split assets out of the skill bundle.',
      );
    }
    return slimZipToSkillFiles(file).then(function (slimFile) {
      var slimPayload = estimateJsonPayloadBytes(slimFile.size);
      if (slimPayload > MAX_JSON_PAYLOAD_BYTES || slimFile.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          'Upload failed (ZIP still too large after keeping skill text files): ' +
            formatFileSize(slimFile.size) +
            '. Remove large binaries from the archive or upload SKILL.md directly.',
        );
      }
      return {
        file: slimFile,
        note:
          'Large ZIP trimmed to skill text files only (' +
          formatFileSize(file.size) +
          ' → ' +
          formatFileSize(slimFile.size) +
          '). Videos and other binaries were skipped.',
      };
    });
  }

  function proxyFailureMessage(step, response, text) {
    var trimmed = String(text || '').trim();
    if (/^internal error$/i.test(trimmed) || /^internal server error$/i.test(trimmed)) {
      return (
        step +
        ' failed: request was rejected by the hosting proxy (often because the upload exceeds the ~20 MB skill file limit once base64-encoded). ' +
        'Try uploading SKILL.md only, or a smaller ZIP without video/assets.'
      );
    }
    return trimmed || response.statusText || step + ' failed';
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        var comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = function () {
        reject(new Error('Unable to read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  function parseApiResponse(response, text, stepLabel) {
    var trimmed = String(text || '').trim();
    var contentType = String(response.headers.get('content-type') || '').toLowerCase();
    var looksJson = trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[';
    if (contentType.indexOf('application/json') === -1 && !looksJson) {
      if (!response.ok) {
        throw new Error(proxyFailureMessage(stepLabel || 'Request', response, trimmed));
      }
      throw new Error('Unexpected non-JSON response from server');
    }
    try {
      return trimmed ? JSON.parse(trimmed) : {};
    } catch (_parseErr) {
      if (!response.ok) {
        throw new Error(proxyFailureMessage(stepLabel || 'Request', response, trimmed));
      }
      throw new Error('Invalid JSON response from server');
    }
  }

  function apiJson(url, options, stepLabel) {
    var step = stepLabel || 'Request';
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        var data = parseApiResponse(response, text, step);
        if (!response.ok) {
          var msg = (data && data.error) || proxyFailureMessage(step, response, text);
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function setDropStatus(message, tone) {
    var el = byId('skillsDropStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('skills-status--error', 'skills-status--success', 'skills-status--info');
    if (tone === 'error') el.classList.add('skills-status--error');
    if (tone === 'success') el.classList.add('skills-status--success');
    if (tone === 'info') el.classList.add('skills-status--info');
  }

  function setPublishStatus(message, tone) {
    var el = byId('publishStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('skills-status--error', 'skills-status--success', 'skills-status--info');
    if (tone === 'error') el.classList.add('skills-status--error');
    if (tone === 'success') el.classList.add('skills-status--success');
    if (tone === 'info') el.classList.add('skills-status--info');
  }

  function hideDropSuccess() {
    var box = byId('skillsDropSuccess');
    if (box) box.hidden = true;
    var zone = byId('skillsDropZone');
    if (zone) zone.classList.remove('skills-dropzone--published');
  }

  function showDropSuccess(skill) {
    var box = byId('skillsDropSuccess');
    var title = byId('skillsDropSuccessTitle');
    var links = byId('skillsDropSuccessLinks');
    var zone = byId('skillsDropZone');
    if (!box || !title) return;

    var name = (skill && skill.name) || 'Skill';
    title.textContent = 'Published: ' + name;

    if (links) {
      var html = '';
      if (skill && skill.publicUrl) {
        html +=
          '<a href="' +
          escapeHtml(skill.publicUrl) +
          '" target="_blank" rel="noopener noreferrer">Open hosted skill</a>';
      }
      links.innerHTML = html;
    }

    box.hidden = false;
    if (zone) zone.classList.add('skills-dropzone--published');
    setDropStatus('', '');
  }

  function setDropZoneBusy(busy) {
    var zone = byId('skillsDropZone');
    if (zone) {
      zone.classList.toggle('skills-dropzone--busy', !!busy);
      zone.classList.toggle('skills-dropzone--processing', !!busy);
    }
    state.processing = !!busy;
    updatePublishEnabled();
  }

  function setAdvancedOpen(open) {
    state.advancedOpen = !!open;
    var panel = byId('skillsAdvancedPanel');
    var showBtn = byId('showAdvancedBtn');
    if (panel) panel.hidden = !open;
    if (showBtn) showBtn.hidden = open || !state.draft;
  }

  function updatePublishEnabled() {
    var btn = byId('publishSkillBtn');
    if (!btn) return;
    btn.disabled = state.processing || !state.draft || !state.draft.skillId;
  }

  function metadataFromAnalysis(analysis) {
    if (!analysis) return null;
    var name = String(analysis.title || '').trim();
    if (!name) {
      var base = String(state.draft && state.draft.fileName || 'skill').replace(/\.[^.]+$/, '');
      name = base || 'Untitled skill';
    }
    return {
      name: name,
      description: String(analysis.description || '').trim(),
      category: String(analysis.category || '').trim(),
      valueSummary: String(analysis.valueSummary || '').trim(),
      useCases: Array.isArray(analysis.useCases) ? analysis.useCases : [],
      tags: Array.isArray(analysis.tags) ? analysis.tags : [],
      sourcePath: String(analysis.sourcePath || '').trim(),
      confidence: typeof analysis.confidence === 'number' ? analysis.confidence : undefined,
    };
  }

  function fillDraftForm(metadata) {
    if (!metadata) return;
    byId('skillNameInput').value = metadata.name || metadata.title || '';
    byId('skillDescriptionInput').value = metadata.description || '';
    byId('skillCategoryInput').value = metadata.category || '';
    byId('skillValueSummaryInput').value = metadata.valueSummary || '';
    byId('skillUseCasesInput').value = (metadata.useCases || []).join('\n');
    byId('skillTagsInput').value = (metadata.tags || []).join(', ');
    byId('skillSourcePathInput').value = metadata.sourcePath || '';

    var hosted = byId('skillHostedUrl');
    if (hosted && state.draft && state.draft.publicUrl) {
      hosted.hidden = false;
      hosted.innerHTML =
        'Hosted file: <a href="' +
        escapeHtml(state.draft.publicUrl) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(state.draft.publicUrl) +
        '</a>';
    } else if (hosted) {
      hosted.hidden = true;
      hosted.textContent = '';
    }
  }

  function getDraftFromForm() {
    return {
      name: byId('skillNameInput').value.trim(),
      description: byId('skillDescriptionInput').value.trim(),
      category: byId('skillCategoryInput').value.trim(),
      valueSummary: byId('skillValueSummaryInput').value.trim(),
      useCases: parseUseCasesInput(byId('skillUseCasesInput').value),
      tags: parseTagsInput(byId('skillTagsInput').value),
      sourcePath: byId('skillSourcePathInput').value.trim(),
      confidence: state.draft && state.draft.confidence,
    };
  }

  function applyAnalysis(analysis) {
    if (!analysis) return;
    var meta = metadataFromAnalysis(analysis);
    fillDraftForm(meta);
    if (state.draft) state.draft.confidence = analysis.confidence;
    if (state.draft && meta) state.draft.lastMetadata = meta;
    return meta;
  }

  function clearDraft() {
    state.draft = null;
    state.lastPublishedSkill = null;
    state.advancedOpen = false;
    var form = byId('skillMetadataForm');
    if (form) form.reset();
    byId('skillFileInput').value = '';
    var fileLabel = byId('skillsDropFileName');
    if (fileLabel) fileLabel.textContent = '';
    var hosted = byId('skillHostedUrl');
    if (hosted) {
      hosted.hidden = true;
      hosted.textContent = '';
    }
    hideDropSuccess();
    setDropStatus('', '');
    setPublishStatus('');
    setAdvancedOpen(false);
    var showBtn = byId('showAdvancedBtn');
    if (showBtn) showBtn.hidden = true;
    updatePublishEnabled();
  }

  function upsertPublishedSkill(skill) {
    if (!skill || !skill.id) return;
    state.publishedSkills = state.publishedSkills.filter(function (s) {
      return s.id !== skill.id;
    });
    state.publishedSkills.unshift(skill);
    renderSkills();
  }

  async function publishDraft(metadata) {
    if (!state.draft || !state.draft.skillId) {
      throw new Error('No skill draft to publish');
    }
    var draft = metadata || getDraftFromForm();
    if (!draft.name) {
      throw new Error('Vertex AI did not return a skill name. Try another file or use Edit details.');
    }

    var data = await apiJson(
      API_PUBLISH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: state.draft.skillId,
          fileName: state.draft.fileName,
          storagePath: state.draft.storagePath,
          name: draft.name,
          description: draft.description,
          category: draft.category,
          valueSummary: draft.valueSummary,
          useCases: draft.useCases,
          tags: draft.tags,
          sourcePath: draft.sourcePath,
          confidence: draft.confidence,
        }),
      },
      'Publish',
    );

    if (data.skill) {
      upsertPublishedSkill(data.skill);
      try {
        localStorage.removeItem(STORAGE_LEGACY_KEY);
      } catch (_e) { /* ignore */ }
      var banner = byId('skillsMigrateBanner');
      if (banner) banner.hidden = true;
    }
    return data.skill;
  }

  async function processFile(file) {
    if (!file) return;
    var ext = fileExtension(file.name);
    if (ACCEPTED_EXTENSIONS.indexOf(ext) === -1) {
      hideDropSuccess();
      setDropStatus('Unsupported file type. Use .md, .txt, .json, .yaml, .yml, or .zip.', 'error');
      return;
    }
    var isZip = ext === 'zip';

    hideDropSuccess();
    setAdvancedOpen(false);
    setPublishStatus('');

    var fileLabel = byId('skillsDropFileName');
    if (fileLabel) fileLabel.textContent = file.name;

    setDropZoneBusy(true);
    setDropStatus(isZip ? 'Preparing ZIP…' : 'Uploading…', 'info');

    try {
      var prepared = await prepareUploadFile(file);
      var uploadFile = prepared.file;
      if (prepared.note) {
        setDropStatus(prepared.note + ' Uploading…', 'info');
      } else {
        setDropStatus(isZip ? 'Uploading ZIP…' : 'Uploading…', 'info');
      }

      var contentBase64 = await readFileAsBase64(uploadFile);
      var upload = await apiJson(
        API_UPLOAD,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: uploadFile.name,
            contentBase64: contentBase64,
            contentType: uploadFile.type || file.type || '',
          }),
        },
        'Upload',
      );

      state.draft = {
        skillId: upload.skillId,
        fileName: upload.fileName,
        storagePath: upload.storagePath,
        publicUrl: upload.publicUrl,
        extension: upload.extension,
        extractedFromZip: !!upload.extractedFromZip,
        zipFileName: upload.zipFileName || '',
        extractedFiles: upload.files || [],
      };
      updatePublishEnabled();

      var uploadDetail = upload.extractedFromZip ? 'ZIP extracted on server. ' : '';
      if (prepared.note) uploadDetail = prepared.note + ' ';
      setDropStatus(uploadDetail + 'Analyzing with Vertex AI…', 'info');

      var analyzed = await apiJson(
        API_ANALYZE,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId: state.draft.skillId,
            storagePath: state.draft.storagePath,
            fileName: state.draft.fileName,
          }),
        },
        'Analyze',
      );

      var metadata = applyAnalysis(analyzed.analysis);
      setDropStatus('Publishing to shared catalog…', 'info');

      var skill = await publishDraft(metadata);
      state.lastPublishedSkill = skill || null;
      showDropSuccess(skill);

      var showBtn = byId('showAdvancedBtn');
      if (showBtn) showBtn.hidden = false;

      state.draft = null;
      updatePublishEnabled();
    } catch (error) {
      hideDropSuccess();
      var message = error && error.message ? error.message : 'Something went wrong. Try again or use Edit details.';
      if (message.indexOf('failed:') === -1 && message.indexOf('Upload failed') !== 0) {
        message = 'Upload pipeline failed: ' + message;
      }
      setDropStatus(message, 'error');
    } finally {
      setDropZoneBusy(false);
    }
  }

  function loadLegacyLocalSkills() {
    try {
      var raw = localStorage.getItem(STORAGE_LEGACY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function showMigrateBanner(legacyCount) {
    var banner = byId('skillsMigrateBanner');
    if (!banner || !legacyCount) return;
    banner.hidden = false;
    banner.innerHTML =
      'You have <strong>' +
      legacyCount +
      '</strong> skill tile(s) saved only in this browser. Re-upload those files here to publish them to the shared team catalog. ' +
      '<button type="button" class="skills-btn skills-btn--inline" id="dismissMigrateBtn">Dismiss</button>';
    var dismiss = byId('dismissMigrateBtn');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        banner.hidden = true;
        try {
          localStorage.removeItem(STORAGE_LEGACY_KEY);
        } catch (_e2) { /* ignore */ }
      });
    }
  }

  async function loadCatalog() {
    state.catalogLoading = true;
    try {
      var data = await apiJson(API_CATALOG, { method: 'GET' });
      state.publishedSkills = Array.isArray(data.items) ? data.items : [];
      var legacy = loadLegacyLocalSkills();
      if (legacy.length && !state.publishedSkills.length) {
        showMigrateBanner(legacy.length);
      }
      renderSkills();
    } catch (error) {
      setPublishStatus('Could not load catalog: ' + (error.message || error), 'error');
      var legacyOnly = loadLegacyLocalSkills();
      if (legacyOnly.length) {
        state.publishedSkills = legacyOnly.map(function (s) {
          return Object.assign({}, s, { _legacyLocal: true });
        });
        renderSkills();
        showMigrateBanner(legacyOnly.length);
      }
    } finally {
      state.catalogLoading = false;
    }
  }

  function renderTagFilter() {
    var select = byId('skillsTagFilter');
    if (!select) return;
    var previous = select.value;
    var tagMap = {};
    state.publishedSkills.forEach(function (skill) {
      (skill.tags || []).forEach(function (tag) {
        tagMap[tag] = true;
      });
    });
    var tags = Object.keys(tagMap).sort();
    select.innerHTML =
      '<option value="">All tags</option>' +
      tags
        .map(function (tag) {
          return '<option value="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</option>';
        })
        .join('');
    if (previous && tagMap[previous]) select.value = previous;
  }

  function matchSkill(skill, query, tagFilter) {
    if (tagFilter && !(skill.tags || []).includes(tagFilter)) return false;
    if (!query) return true;
    var haystack = [
      skill.name,
      skill.description,
      skill.category,
      skill.valueSummary,
      (skill.tags || []).join(' '),
      (skill.useCases || []).join(' '),
      skill.sourcePath,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function encodeSkillFilePath(fileName) {
    return String(fileName || '')
      .split('/')
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join('/');
  }

  function getSkillDownloadUrl(skill) {
    if (skill && skill.publicUrl) return skill.publicUrl;
    if (skill && skill.id && skill.fileName) {
      return (
        '/skills/' +
        encodeURIComponent(skill.id) +
        '/' +
        encodeSkillFilePath(skill.fileName)
      );
    }
    return '';
  }

  function getSkillDownloadName(skill) {
    var fileName = skill && skill.fileName;
    if (fileName) return fileName.split('/').pop() || fileName;
    var ext = (skill && skill.extension) || 'md';
    return (skill && skill.name ? String(skill.name).replace(/[^\w.-]+/g, '-') : 'skill') + '.' + ext;
  }

  function truncateText(text, maxLen) {
    var value = String(text || '').trim();
    if (!value) return '';
    if (value.length <= maxLen) return value;
    return value.slice(0, maxLen - 1).trim() + '…';
  }

  function formatMetaExtension(extension) {
    var ext = String(extension || '').trim().toLowerCase();
    if (!ext) return '';
    if (ext === 'yml') return 'YAML';
    return ext.toUpperCase();
  }

  function pickPrimaryTags(tags, tagFilter, maxCount) {
    var limit = typeof maxCount === 'number' ? maxCount : 2;
    var list = Array.isArray(tags) ? tags.slice() : [];
    if (!list.length) return [];
    if (tagFilter && list.indexOf(tagFilter) !== -1) {
      list = [tagFilter].concat(
        list.filter(function (tag) {
          return tag !== tagFilter;
        })
      );
    }
    return list.slice(0, limit);
  }

  function buildSkillCollapsedSummary(skill) {
    var valueSummary = String(skill.valueSummary || '').trim();
    if (valueSummary) return truncateText(valueSummary, 220);
    var description = String(skill.description || '').trim();
    if (description) return truncateText(description, 220);
    return 'No summary available.';
  }

  function buildSkillMetaLine(skill, tagFilter) {
    var parts = [];
    var extLabel = formatMetaExtension(skill.extension);
    if (extLabel) parts.push(extLabel);
    var category = String(skill.category || '').trim().toLowerCase();
    if (category) parts.push(category);
    pickPrimaryTags(skill.tags, tagFilter, 2).forEach(function (tag) {
      var normalized = String(tag || '').trim().toLowerCase();
      if (normalized && parts.indexOf(normalized) === -1) parts.push(normalized);
    });
    return parts.join(' · ');
  }

  function toggleSkillExpanded(skillId) {
    if (state.expandedSkillIds[skillId]) {
      delete state.expandedSkillIds[skillId];
    } else {
      state.expandedSkillIds[skillId] = true;
    }
    renderSkills();
  }

  function openEditForSkill(skillId) {
    var skill = state.publishedSkills.find(function (s) {
      return s.id === skillId;
    });
    if (!skill) return;

    state.draft = {
      skillId: skill.id,
      fileName: skill.fileName,
      storagePath: skill.storagePath,
      publicUrl: skill.publicUrl,
      extension: skill.extension,
      confidence: skill.confidence,
    };
    fillDraftForm({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      valueSummary: skill.valueSummary,
      useCases: skill.useCases,
      tags: skill.tags,
      sourcePath: skill.sourcePath,
    });
    updatePublishEnabled();
    setAdvancedOpen(true);
    setPublishStatus('Editing published tile. Save changes when ready.', 'info');
    byId('skillsAdvancedPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderSkills() {
    renderTagFilter();

    var query = byId('skillsSearchInput').value.trim().toLowerCase();
    var tagFilter = byId('skillsTagFilter').value;
    var list = state.publishedSkills.filter(function (skill) {
      return matchSkill(skill, query, tagFilter);
    });

    var count = byId('skillsCount');
    if (count) {
      var label = state.catalogLoading ? 'Loading catalog…' : list.length + ' published skills';
      if (!state.catalogLoading && list.length !== state.publishedSkills.length) {
        label = list.length + ' of ' + state.publishedSkills.length + ' published skills';
      }
      count.textContent = label;
    }

    var tiles = byId('skillsTiles');
    if (!tiles) return;
    if (!list.length) {
      tiles.innerHTML =
        '<div class="skills-empty">No skill tiles yet. Drop a file above — Vertex AI will classify and publish automatically.</div>';
      return;
    }

    tiles.innerHTML = list
      .map(function (skill) {
        var skillId = skill.id;
        var isExpanded = !!state.expandedSkillIds[skillId];
        var detailsId = 'skills-tile-details-' + skillId;

        var collapsedSummary = buildSkillCollapsedSummary(skill);
        var metaLine = buildSkillMetaLine(skill, tagFilter);

        var useCasesHtml =
          skill.useCases && skill.useCases.length
            ? '<ul class="skills-use-cases">' +
              skill.useCases
                .map(function (item) {
                  return '<li>' + escapeHtml(item) + '</li>';
                })
                .join('') +
              '</ul>'
            : '<p class="skills-muted">No use cases listed.</p>';

        var downloadUrl = getSkillDownloadUrl(skill);
        var downloadName = getSkillDownloadName(skill);
        var downloadBtn = downloadUrl
          ? '<a class="skills-btn skills-btn--primary skills-tile-download skills-tile-download--summary" href="' +
            escapeHtml(downloadUrl) +
            '" download="' +
            escapeHtml(downloadName) +
            '">Download</a>'
          : '';

        var hostedLink = downloadUrl
          ? '<a class="skills-tile-link" href="' +
            escapeHtml(downloadUrl) +
            '" target="_blank" rel="noopener noreferrer">Open hosted skill</a>'
          : '';

        var editBtn = skill._legacyLocal
          ? ''
          : '<button class="skills-btn skills-btn--link skills-tile-edit" type="button" data-edit-id="' +
            escapeHtml(skillId) +
            '">Edit</button>';

        var deleteBtn = skill._legacyLocal
          ? ''
          : '<button class="skills-btn skills-delete" type="button" data-delete-id="' +
            escapeHtml(skillId) +
            '">Delete</button>';

        var fileMeta = skill.fileName
          ? '<p class="skills-muted">File: <code class="skills-code">' +
            escapeHtml(skill.fileName) +
            '</code></p>'
          : '';

        return (
          '<article class="skills-tile' +
          (isExpanded ? ' skills-tile--expanded' : '') +
          '" data-skill-id="' +
          escapeHtml(skillId) +
          '">' +
          '<div class="skills-tile-summary">' +
          '<div class="skills-tile-summary-head">' +
          '<button type="button" class="skills-tile-toggle" data-toggle-id="' +
          escapeHtml(skillId) +
          '" aria-expanded="' +
          (isExpanded ? 'true' : 'false') +
          '" aria-controls="' +
          escapeHtml(detailsId) +
          '">' +
          '<span class="skills-tile-toggle-text">' +
          '<span class="skills-tile-title-row">' +
          '<span class="skills-tile-title">' +
          escapeHtml(skill.name || 'Untitled skill') +
          '</span>' +
          '<span class="skills-tile-chevron" aria-hidden="true"></span>' +
          '</span>' +
          '<span class="skills-tile-preview">' +
          '<span class="skills-tile-preview-text">' +
          escapeHtml(collapsedSummary) +
          '</span>' +
          (metaLine
            ? '<span class="skills-tile-meta">' + escapeHtml(metaLine) + '</span>'
            : '') +
          '</span>' +
          '</span>' +
          '</button>' +
          downloadBtn +
          '</div>' +
          '</div>' +
          '<div id="' +
          escapeHtml(detailsId) +
          '" class="skills-tile-details"' +
          (isExpanded ? '' : ' hidden') +
          '>' +
          (skill._legacyLocal
            ? '<p class="skills-muted skills-tile-legacy-note">Saved in this browser only — re-upload to publish to the shared catalog.</p>'
            : '') +
          '<p class="skills-tile-desc">' +
          escapeHtml(skill.description || 'No description provided.') +
          '</p>' +
          (skill.valueSummary
            ? '<div class="skills-tile-field">' +
              '<span class="skills-tile-field-label">Value summary</span>' +
              '<p class="skills-muted">' +
              escapeHtml(skill.valueSummary) +
              '</p>' +
              '</div>'
            : '') +
          (skill.category
            ? '<div class="skills-tile-field">' +
              '<span class="skills-tile-field-label">Category</span>' +
              '<p class="skills-muted">' +
              escapeHtml(skill.category) +
              '</p>' +
              '</div>'
            : '') +
          '<div class="skills-tile-field">' +
          '<span class="skills-tile-field-label">Use cases</span>' +
          useCasesHtml +
          '</div>' +
          (skill.tags && skill.tags.length
            ? '<div class="skills-tile-field">' +
              '<span class="skills-tile-field-label">Tags</span>' +
              '<p class="skills-muted skills-inline-list">' +
              escapeHtml(skill.tags.join(', ')) +
              '</p>' +
              '</div>'
            : '') +
          (skill.sourcePath
            ? '<div class="skills-tile-field">' +
              '<span class="skills-tile-field-label">Source path</span>' +
              '<p class="skills-muted"><code class="skills-code">' +
              escapeHtml(skill.sourcePath) +
              '</code></p>' +
              '</div>'
            : '') +
          fileMeta +
          (downloadUrl
            ? '<div class="skills-tile-field">' +
              '<span class="skills-tile-field-label">Hosted URL</span>' +
              '<p class="skills-muted"><code class="skills-code">' +
              escapeHtml(downloadUrl) +
              '</code></p>' +
              '</div>'
            : '') +
          '<div class="skills-tile-footer">' +
          '<div class="skills-tile-links">' +
          hostedLink +
          '</div>' +
          '<div class="skills-tile-actions">' +
          editBtn +
          deleteBtn +
          '</div>' +
          '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function wireDropZone() {
    var zone = byId('skillsDropZone');
    var input = byId('skillFileInput');
    if (!zone || !input) return;

    zone.addEventListener('click', function (event) {
      if (state.processing) return;
      if (event.target === input) return;
      if (event.target.closest && event.target.closest('a, button')) return;
      input.click();
    });

    zone.addEventListener('keydown', function (event) {
      if (state.processing) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });

    input.addEventListener('change', function () {
      var file = input.files && input.files[0] ? input.files[0] : null;
      if (file) processFile(file);
    });

    zone.addEventListener('dragover', function (event) {
      event.preventDefault();
      if (!state.processing) zone.classList.add('skills-dropzone--over');
    });

    zone.addEventListener('dragleave', function () {
      zone.classList.remove('skills-dropzone--over');
    });

    zone.addEventListener('drop', function (event) {
      event.preventDefault();
      zone.classList.remove('skills-dropzone--over');
      if (state.processing) return;
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) processFile(file);
    });
  }

  function wirePublishActions() {
    var form = byId('skillMetadataForm');
    var tiles = byId('skillsTiles');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!state.draft || !state.draft.skillId) {
        setPublishStatus('Open a tile with Edit or drop a file first.', 'error');
        return;
      }
      var draft = getDraftFromForm();
      if (!draft.name) {
        setPublishStatus('Name is required.', 'error');
        return;
      }

      setPublishStatus('Saving…', 'info');
      publishDraft(draft)
        .then(function (skill) {
          setPublishStatus('Saved "' + draft.name + '" to the shared catalog.', 'success');
          if (skill) showDropSuccess(skill);
        })
        .catch(function (error) {
          setPublishStatus(error.message || 'Save failed', 'error');
        });
    });

    tiles.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var toggleBtn = target.closest('[data-toggle-id]');
      if (!toggleBtn) return;
      event.preventDefault();
      var toggleId = toggleBtn.getAttribute('data-toggle-id');
      if (toggleId) toggleSkillExpanded(toggleId);
    });

    tiles.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.closest('.skills-tile-download')) {
        event.stopPropagation();
        return;
      }

      var toggleBtn = target.closest('[data-toggle-id]');
      if (toggleBtn) {
        var toggleId = toggleBtn.getAttribute('data-toggle-id');
        if (toggleId) toggleSkillExpanded(toggleId);
        return;
      }

      var editEl = target.closest('[data-edit-id]');
      if (editEl) {
        openEditForSkill(editEl.getAttribute('data-edit-id'));
        return;
      }

      var deleteEl = target.closest('[data-delete-id]');
      if (!deleteEl) return;
      var deleteId = deleteEl.getAttribute('data-delete-id');
      if (!window.confirm('Delete this skill from the shared catalog?')) return;

      fetch(API_CATALOG + '?id=' + encodeURIComponent(deleteId), { method: 'DELETE' })
        .then(function (response) {
          return response.text().then(function (text) {
            var data = parseApiResponse(response, text);
            if (!response.ok) throw new Error((data && data.error) || 'Delete failed');
            return data;
          });
        })
        .then(function () {
          delete state.expandedSkillIds[deleteId];
          state.publishedSkills = state.publishedSkills.filter(function (skill) {
            return skill.id !== deleteId;
          });
          renderSkills();
          setPublishStatus('Removed skill tile.', 'success');
        })
        .catch(function (error) {
          setPublishStatus(error.message || 'Delete failed', 'error');
        });
    });
  }

  function wireAdvancedPanel() {
    var showBtn = byId('showAdvancedBtn');
    var hideBtn = byId('hideAdvancedBtn');
    var editFromSuccess = byId('editDraftFromSuccessBtn');

    if (showBtn) {
      showBtn.addEventListener('click', function () {
        if (state.draft) {
          setAdvancedOpen(true);
          return;
        }
        if (state.lastPublishedSkill && state.lastPublishedSkill.id) {
          openEditForSkill(state.lastPublishedSkill.id);
          return;
        }
        setPublishStatus('Drop a file first, or use Edit on a published tile.', 'info');
      });
    }
    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        setAdvancedOpen(false);
      });
    }
    if (editFromSuccess) {
      editFromSuccess.addEventListener('click', function () {
        var skill = state.lastPublishedSkill;
        if (skill && skill.id) {
          openEditForSkill(skill.id);
          return;
        }
        if (state.publishedSkills.length) openEditForSkill(state.publishedSkills[0].id);
      });
    }
  }

  function wireFilterActions() {
    byId('skillsSearchInput').addEventListener('input', renderSkills);
    byId('skillsTagFilter').addEventListener('change', renderSkills);
  }

  function init() {
    wireDropZone();
    wirePublishActions();
    wireAdvancedPanel();
    wireFilterActions();
    byId('clearDraftBtn').addEventListener('click', clearDraft);
    loadCatalog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
