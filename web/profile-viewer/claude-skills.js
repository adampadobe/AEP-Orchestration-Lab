/**
 * Claude skills — shared lab catalog (Storage + Firestore + Vertex AI).
 */
(function () {
  'use strict';

  var STORAGE_LEGACY_KEY = 'claudeSkillsCatalogV1';
  var ACCEPTED_EXTENSIONS = ['md', 'txt', 'json', 'yaml', 'yml'];
  var API_UPLOAD = '/api/claude-skills/upload';
  var API_ANALYZE = '/api/claude-skills/analyze';
  var API_CATALOG = '/api/claude-skills/catalog';
  var API_PUBLISH = '/api/claude-skills/publish';

  var state = {
    draft: null,
    publishedSkills: [],
    catalogLoading: false,
    processing: false,
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

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        reject(new Error('Unable to read file'));
      };
      reader.readAsText(file);
    });
  }

  function apiJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var msg = (data && data.error) || response.statusText || 'Request failed';
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function setStatus(id, message, tone) {
    var el = byId(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('skills-status--error', 'skills-status--success', 'skills-status--info');
    if (tone === 'error') el.classList.add('skills-status--error');
    if (tone === 'success') el.classList.add('skills-status--success');
    if (tone === 'info') el.classList.add('skills-status--info');
  }

  function setDropZoneBusy(busy) {
    var zone = byId('skillsDropZone');
    if (zone) zone.classList.toggle('skills-dropzone--busy', !!busy);
    state.processing = !!busy;
    updatePublishEnabled();
  }

  function updatePublishEnabled() {
    var btn = byId('publishSkillBtn');
    if (!btn) return;
    btn.disabled = state.processing || !state.draft || !state.draft.skillId;
  }

  function fillDraftForm(metadata) {
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
    fillDraftForm({
      name: analysis.title,
      description: analysis.description,
      category: analysis.category,
      valueSummary: analysis.valueSummary,
      useCases: analysis.useCases,
      tags: analysis.tags,
      sourcePath: analysis.sourcePath,
    });
    if (state.draft) state.draft.confidence = analysis.confidence;
  }

  function clearDraft() {
    state.draft = null;
    byId('skillMetadataForm').reset();
    byId('skillFileInput').value = '';
    var fileLabel = byId('skillsDropFileName');
    if (fileLabel) fileLabel.textContent = '';
    var hosted = byId('skillHostedUrl');
    if (hosted) {
      hosted.hidden = true;
      hosted.textContent = '';
    }
    setStatus('uploadStatus', '');
    setStatus('analyzeStatus', '');
    setStatus('publishStatus', '');
    updatePublishEnabled();
  }

  async function processFile(file) {
    if (!file) return;
    var ext = fileExtension(file.name);
    if (ACCEPTED_EXTENSIONS.indexOf(ext) === -1) {
      setStatus('uploadStatus', 'Unsupported extension: .' + (ext || '(none)'), 'error');
      return;
    }
    if (file.size > 512 * 1024) {
      setStatus('uploadStatus', 'File exceeds 512 KB limit.', 'error');
      return;
    }

    var fileLabel = byId('skillsDropFileName');
    if (fileLabel) fileLabel.textContent = file.name;

    setDropZoneBusy(true);
    setStatus('uploadStatus', 'Uploading ' + file.name + '…', 'info');
    setStatus('analyzeStatus', '', 'info');

    try {
      var contentBase64 = await readFileAsBase64(file);
      var upload = await apiJson(API_UPLOAD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentBase64: contentBase64,
        }),
      });

      state.draft = {
        skillId: upload.skillId,
        fileName: upload.fileName,
        storagePath: upload.storagePath,
        publicUrl: upload.publicUrl,
        extension: upload.extension,
        localText: await readFileAsText(file),
      };
      updatePublishEnabled();
      setStatus('uploadStatus', 'Uploaded. Analyzing with Vertex AI…', 'success');

      var analyzed = await apiJson(API_ANALYZE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: state.draft.skillId,
          storagePath: state.draft.storagePath,
          fileName: state.draft.fileName,
        }),
      });

      applyAnalysis(analyzed.analysis);
      var conf = analyzed.analysis && typeof analyzed.analysis.confidence === 'number'
        ? Math.round(analyzed.analysis.confidence * 100) + '%'
        : '';
      setStatus(
        'analyzeStatus',
        'Vertex AI classification complete' + (conf ? ' (confidence ' + conf + ').' : '.') + ' Edit fields, then publish.',
        'success'
      );
    } catch (error) {
      setStatus('uploadStatus', error.message || 'Upload failed', 'error');
      setStatus('analyzeStatus', '', 'error');
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
      setStatus('publishStatus', 'Could not load catalog: ' + (error.message || error), 'error');
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
        '<div class="skills-empty">No skill tiles yet. Drop a file above to upload and publish.</div>';
      return;
    }

    tiles.innerHTML = list
      .map(function (skill) {
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

        var tagsHtml = (skill.tags || [])
          .map(function (tag) {
            return '<span class="skills-tag">' + escapeHtml(tag) + '</span>';
          })
          .join('');

        var link = skill.publicUrl
          ? '<a class="skills-tile-link" href="' +
            escapeHtml(skill.publicUrl) +
            '" target="_blank" rel="noopener noreferrer">Open hosted skill</a>'
          : '';

        var badges =
          '<span class="skills-badge">' +
          escapeHtml(skill.extension || 'unknown') +
          '</span>' +
          (skill._legacyLocal
            ? '<span class="skills-badge skills-badge--warn">browser only</span>'
            : '<span class="skills-badge">shared</span>');

        if (skill.category) {
          badges += '<span class="skills-badge">' + escapeHtml(skill.category) + '</span>';
        }

        return (
          '<article class="skills-tile" data-skill-id="' +
          escapeHtml(skill.id) +
          '">' +
          '<div class="skills-tile-header">' +
          '<h4 class="skills-tile-title">' +
          escapeHtml(skill.name || 'Untitled skill') +
          '</h4>' +
          (skill._legacyLocal
            ? ''
            : '<button class="skills-btn skills-delete" type="button" data-delete-id="' +
              escapeHtml(skill.id) +
              '">Delete</button>') +
          '</div>' +
          '<div class="skills-badges">' +
          badges +
          '</div>' +
          '<p>' +
          escapeHtml(skill.description || 'No description provided.') +
          '</p>' +
          (skill.valueSummary
            ? '<p class="skills-muted">' + escapeHtml(skill.valueSummary) + '</p>'
            : '') +
          useCasesHtml +
          (tagsHtml ? '<div class="skills-tags">' + tagsHtml + '</div>' : '') +
          (skill.sourcePath
            ? '<p class="skills-muted">Source: ' + escapeHtml(skill.sourcePath) + '</p>'
            : '') +
          link +
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
      if (event.target === input) return;
      input.click();
    });

    zone.addEventListener('keydown', function (event) {
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
      zone.classList.add('skills-dropzone--over');
    });

    zone.addEventListener('dragleave', function () {
      zone.classList.remove('skills-dropzone--over');
    });

    zone.addEventListener('drop', function (event) {
      event.preventDefault();
      zone.classList.remove('skills-dropzone--over');
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
        setStatus('publishStatus', 'Upload a skill file first.', 'error');
        return;
      }
      var draft = getDraftFromForm();
      if (!draft.name) {
        setStatus('publishStatus', 'Name is required.', 'error');
        return;
      }

      setStatus('publishStatus', 'Publishing…', 'info');
      apiJson(API_PUBLISH, {
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
      })
        .then(function (data) {
          if (data.skill) {
            state.publishedSkills = state.publishedSkills.filter(function (s) {
              return s.id !== data.skill.id;
            });
            state.publishedSkills.unshift(data.skill);
          }
          renderSkills();
          setStatus('publishStatus', 'Published "' + draft.name + '" to the shared catalog.', 'success');
          try {
            localStorage.removeItem(STORAGE_LEGACY_KEY);
          } catch (_e) { /* ignore */ }
          var banner = byId('skillsMigrateBanner');
          if (banner) banner.hidden = true;
        })
        .catch(function (error) {
          setStatus('publishStatus', error.message || 'Publish failed', 'error');
        });
    });

    tiles.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var deleteId = target.getAttribute('data-delete-id');
      if (!deleteId) return;
      if (!window.confirm('Delete this skill from the shared catalog?')) return;

      fetch(API_CATALOG + '?id=' + encodeURIComponent(deleteId), { method: 'DELETE' })
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) throw new Error((data && data.error) || 'Delete failed');
            return data;
          });
        })
        .then(function () {
          state.publishedSkills = state.publishedSkills.filter(function (skill) {
            return skill.id !== deleteId;
          });
          renderSkills();
          setStatus('publishStatus', 'Removed skill tile.', 'success');
        })
        .catch(function (error) {
          setStatus('publishStatus', error.message || 'Delete failed', 'error');
        });
    });
  }

  function wireFilterActions() {
    byId('skillsSearchInput').addEventListener('input', renderSkills);
    byId('skillsTagFilter').addEventListener('change', renderSkills);
  }

  function init() {
    wireDropZone();
    wirePublishActions();
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
