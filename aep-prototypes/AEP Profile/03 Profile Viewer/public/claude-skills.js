/**
 * Claude skills local catalog:
 * - upload + infer metadata
 * - editable draft + tile publishing
 * - localStorage persistence
 * - configurable Vertex AI handoff
 */
(function () {
  'use strict';

  var STORAGE_SKILLS_KEY = 'claudeSkillsCatalogV1';
  var STORAGE_VERTEX_KEY = 'claudeSkillsVertexSettingsV1';
  var ACCEPTED_EXTENSIONS = ['md', 'txt', 'json', 'yaml', 'yml'];

  var state = {
    uploadedFile: null,
    uploadedText: '',
    publishedSkills: [],
    vertexSettings: {
      endpointUrl: '',
      routeOrModel: '',
    },
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

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  function splitLines(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
  }

  function parseUseCasesFromText(text) {
    var lines = splitLines(text);
    var useCases = [];
    var inUseCaseSection = false;
    for (var i = 0; i < lines.length; i += 1) {
      var raw = lines[i].trim();
      if (!raw) {
        if (inUseCaseSection) break;
        continue;
      }

      if (/^#{1,4}\s*use\s+cases?/i.test(raw) || /^use\s+cases?\s*:/i.test(raw)) {
        inUseCaseSection = true;
        var inline = raw.replace(/^#{1,4}\s*use\s+cases?\s*:?/i, '').trim();
        if (inline) useCases.push(inline);
        continue;
      }

      if (/^[-*]\s+/.test(raw) && inUseCaseSection) {
        useCases.push(raw.replace(/^[-*]\s+/, '').trim());
        continue;
      }

      if (/^[-*]\s+/.test(raw) && /^use\s+when/i.test(raw)) {
        useCases.push(raw.replace(/^[-*]\s+/, '').trim());
        continue;
      }

      if (/^use\s+when/i.test(raw)) {
        useCases.push(raw);
      }
    }
    return Array.from(new Set(useCases.filter(Boolean))).slice(0, 8);
  }

  function inferNameFromText(text, fileName) {
    var lines = splitLines(text);
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (/^#\s+/.test(line)) return line.replace(/^#\s+/, '').trim();
      if (/^title\s*:/i.test(line)) return line.replace(/^title\s*:/i, '').trim();
      if (/^name\s*:/i.test(line)) return line.replace(/^name\s*:/i, '').trim();
    }
    var base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    return base || 'Untitled skill';
  }

  function inferDescriptionFromText(text) {
    var lines = splitLines(text);
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line || /^#/.test(line)) continue;
      if (/^description\s*:/i.test(line)) {
        return line.replace(/^description\s*:/i, '').trim();
      }
      if (!/^[-*]\s/.test(line) && line.length > 24) {
        return line.slice(0, 420);
      }
    }
    return '';
  }

  function inferSourcePath(text) {
    var match = String(text || '').match(/fullPath\s*=\s*"([^"]+)"/i) || String(text || '').match(/^source\s*:\s*(.+)$/im);
    return match ? String(match[1] || '').trim() : '';
  }

  function inferTags(name, text, ext) {
    var tags = [];
    if (name) {
      name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .forEach(function (token) {
          if (token && token.length > 2) tags.push(token);
        });
    }
    if (/vertex/i.test(text)) tags.push('vertex');
    if (/firebase/i.test(text)) tags.push('firebase');
    if (/mcp/i.test(text)) tags.push('mcp');
    if (/aep|adobe/i.test(text)) tags.push('adobe');
    if (ext) tags.push(ext);
    return Array.from(new Set(tags)).slice(0, 10);
  }

  function inferMetadata(fileName, text) {
    var ext = fileExtension(fileName);
    var parsedJson = null;
    if (ext === 'json') {
      try {
        parsedJson = JSON.parse(text);
      } catch (error) {
        parsedJson = null;
      }
    }

    var name = '';
    var description = '';
    var useCases = [];
    var sourcePath = '';
    var tags = [];

    if (parsedJson && typeof parsedJson === 'object' && parsedJson !== null) {
      name = parsedJson.name || parsedJson.title || '';
      description = parsedJson.description || parsedJson.summary || '';
      useCases = Array.isArray(parsedJson.useCases) ? parsedJson.useCases : [];
      sourcePath = parsedJson.sourcePath || parsedJson.path || '';
      tags = Array.isArray(parsedJson.tags) ? parsedJson.tags : [];
    }

    if (!name) name = inferNameFromText(text, fileName);
    if (!description) description = inferDescriptionFromText(text);
    if (!useCases.length) useCases = parseUseCasesFromText(text);
    if (!sourcePath) sourcePath = inferSourcePath(text);
    if (!tags.length) tags = inferTags(name, text, ext);

    return {
      name: name,
      description: description,
      useCases: useCases,
      sourcePath: sourcePath,
      tags: tags,
      extension: ext || 'unknown',
    };
  }

  function parseTagsInput(raw) {
    return Array.from(
      new Set(
        String(raw || '')
          .split(',')
          .map(function (item) {
            return item.trim();
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

  function loadFromStorage() {
    try {
      var storedSkills = localStorage.getItem(STORAGE_SKILLS_KEY);
      if (storedSkills) {
        var parsedSkills = JSON.parse(storedSkills);
        if (Array.isArray(parsedSkills)) state.publishedSkills = parsedSkills;
      }
    } catch (error) {
      state.publishedSkills = [];
    }

    try {
      var storedVertex = localStorage.getItem(STORAGE_VERTEX_KEY);
      if (storedVertex) {
        var parsedVertex = JSON.parse(storedVertex);
        if (parsedVertex && typeof parsedVertex === 'object') {
          state.vertexSettings.endpointUrl = String(parsedVertex.endpointUrl || '');
          state.vertexSettings.routeOrModel = String(parsedVertex.routeOrModel || '');
        }
      }
    } catch (error2) {
      state.vertexSettings.endpointUrl = '';
      state.vertexSettings.routeOrModel = '';
    }
  }

  function saveSkills() {
    localStorage.setItem(STORAGE_SKILLS_KEY, JSON.stringify(state.publishedSkills));
  }

  function saveVertexSettings() {
    localStorage.setItem(STORAGE_VERTEX_KEY, JSON.stringify(state.vertexSettings));
  }

  function setStatus(id, message) {
    var el = byId(id);
    if (el) el.textContent = message;
  }

  function fillDraftForm(metadata) {
    byId('skillNameInput').value = metadata.name || '';
    byId('skillDescriptionInput').value = metadata.description || '';
    byId('skillUseCasesInput').value = (metadata.useCases || []).join('\n');
    byId('skillTagsInput').value = (metadata.tags || []).join(', ');
    byId('skillSourcePathInput').value = metadata.sourcePath || '';
  }

  function getDraftFromForm() {
    return {
      name: byId('skillNameInput').value.trim(),
      description: byId('skillDescriptionInput').value.trim(),
      useCases: parseUseCasesInput(byId('skillUseCasesInput').value),
      tags: parseTagsInput(byId('skillTagsInput').value),
      sourcePath: byId('skillSourcePathInput').value.trim(),
    };
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
      count.textContent =
        list.length === state.publishedSkills.length
          ? list.length + ' published skills'
          : list.length + ' of ' + state.publishedSkills.length + ' published skills';
    }

    var tiles = byId('skillsTiles');
    if (!tiles) return;
    if (!list.length) {
      tiles.innerHTML = '<div class="skills-empty">No skill tiles match this filter.</div>';
      return;
    }

    tiles.innerHTML = list
      .map(function (skill) {
        var useCasesHtml = skill.useCases && skill.useCases.length
          ? '<ul class="skills-use-cases">' +
            skill.useCases.map(function (item) {
              return '<li>' + escapeHtml(item) + '</li>';
            }).join('') +
            '</ul>'
          : '<p class="skills-muted">No use cases listed.</p>';

        var tagsHtml = (skill.tags || [])
          .map(function (tag) {
            return '<span class="skills-tag">' + escapeHtml(tag) + '</span>';
          })
          .join('');

        return (
          '<article class="skills-tile" data-skill-id="' + escapeHtml(skill.id) + '">' +
          '<div class="skills-tile-header">' +
          '<h4 class="skills-tile-title">' + escapeHtml(skill.name || 'Untitled skill') + '</h4>' +
          '<button class="skills-btn skills-delete" type="button" data-delete-id="' + escapeHtml(skill.id) + '">Delete</button>' +
          '</div>' +
          '<div class="skills-badges">' +
          '<span class="skills-badge">' + escapeHtml(skill.extension || 'unknown') + '</span>' +
          '<span class="skills-badge">local</span>' +
          '</div>' +
          '<p>' + escapeHtml(skill.description || 'No description provided.') + '</p>' +
          useCasesHtml +
          (tagsHtml ? '<div class="skills-tags">' + tagsHtml + '</div>' : '') +
          (skill.sourcePath ? '<p class="skills-muted">Source: ' + escapeHtml(skill.sourcePath) + '</p>' : '') +
          '</article>'
        );
      })
      .join('');
  }

  function makeVertexPrompt(draft) {
    var sourcePreview = String(state.uploadedText || '').slice(0, 5000);
    return [
      'Analyze this Claude skill file and return:',
      '1) skill category/type',
      '2) value summary (business + technical)',
      '3) recommended tags',
      '4) confidence score',
      '5) suggested tile title and description',
      '',
      'Current inferred metadata:',
      JSON.stringify(draft, null, 2),
      '',
      'Skill file excerpt:',
      sourcePreview,
    ].join('\n');
  }

  function buildVertexPayload(draft) {
    var prompt = makeVertexPrompt(draft);
    var payload = {
      routeOrModel: state.vertexSettings.routeOrModel || '',
      prompt: prompt,
      metadata: {
        name: draft.name,
        tags: draft.tags,
        sourcePath: draft.sourcePath || '',
        extension: state.uploadedFile ? fileExtension(state.uploadedFile.name) : '',
      },
    };
    return payload;
  }

  function refreshVertexPayload() {
    var draft = getDraftFromForm();
    var payload = buildVertexPayload(draft);
    byId('vertexPayloadOutput').value = JSON.stringify(payload, null, 2);
  }

  function wireUploadActions() {
    var fileInput = byId('skillFileInput');
    var inferBtn = byId('inferSkillBtn');
    var clearBtn = byId('clearDraftBtn');

    fileInput.addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      state.uploadedFile = file;
      state.uploadedText = '';
      if (!file) {
        setStatus('uploadStatus', 'No file selected.');
        return;
      }
      var ext = fileExtension(file.name);
      if (ACCEPTED_EXTENSIONS.indexOf(ext) === -1) {
        setStatus('uploadStatus', 'Unsupported file extension: .' + ext);
        return;
      }
      setStatus('uploadStatus', 'Selected ' + file.name + '. Click "Infer metadata".');
    });

    inferBtn.addEventListener('click', function () {
      if (!state.uploadedFile) {
        setStatus('uploadStatus', 'Choose a file before inferring metadata.');
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        state.uploadedText = String(reader.result || '');
        var metadata = inferMetadata(state.uploadedFile.name, state.uploadedText);
        fillDraftForm(metadata);
        refreshVertexPayload();
        setStatus('uploadStatus', 'Metadata inferred from ' + state.uploadedFile.name + '. Review before publishing.');
      };
      reader.onerror = function () {
        setStatus('uploadStatus', 'Unable to read selected file.');
      };
      reader.readAsText(state.uploadedFile);
    });

    clearBtn.addEventListener('click', function () {
      byId('skillMetadataForm').reset();
      byId('skillFileInput').value = '';
      state.uploadedFile = null;
      state.uploadedText = '';
      refreshVertexPayload();
      setStatus('uploadStatus', 'Draft cleared.');
      setStatus('publishStatus', '');
      setStatus('vertexStatus', '');
    });
  }

  function wirePublishActions() {
    var form = byId('skillMetadataForm');
    var tiles = byId('skillsTiles');

    form.addEventListener('input', refreshVertexPayload);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var draft = getDraftFromForm();
      if (!draft.name) {
        setStatus('publishStatus', 'Name is required.');
        return;
      }

      var skill = {
        id: Date.now().toString(36) + '-' + slugify(draft.name),
        name: draft.name,
        description: draft.description,
        useCases: draft.useCases,
        tags: draft.tags,
        sourcePath: draft.sourcePath,
        extension: state.uploadedFile ? fileExtension(state.uploadedFile.name) : 'manual',
        createdAt: new Date().toISOString(),
      };
      state.publishedSkills.unshift(skill);
      saveSkills();
      renderSkills();
      refreshVertexPayload();
      setStatus('publishStatus', 'Published "' + draft.name + '" as a local tile.');
    });

    tiles.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var deleteId = target.getAttribute('data-delete-id');
      if (!deleteId) return;
      state.publishedSkills = state.publishedSkills.filter(function (skill) {
        return skill.id !== deleteId;
      });
      saveSkills();
      renderSkills();
      setStatus('publishStatus', 'Removed skill tile.');
    });
  }

  function wireFilterActions() {
    byId('skillsSearchInput').addEventListener('input', renderSkills);
    byId('skillsTagFilter').addEventListener('change', renderSkills);
  }

  function copyPayloadToClipboard() {
    var payload = byId('vertexPayloadOutput').value;
    if (!payload) {
      setStatus('vertexStatus', 'Generate payload first.');
      return;
    }
    navigator.clipboard.writeText(payload).then(
      function () {
        setStatus('vertexStatus', 'Payload copied. Paste it into your Vertex chat/form.');
      },
      function () {
        setStatus('vertexStatus', 'Clipboard blocked by browser. Copy manually from the payload box.');
      }
    );
  }

  function wireVertexActions() {
    var endpointInput = byId('vertexEndpointInput');
    var routeInput = byId('vertexRouteInput');
    var analyzeBtn = byId('vertexAnalyzeBtn');
    var copyBtn = byId('vertexCopyBtn');
    var submitBtn = byId('vertexSubmitBtn');

    endpointInput.value = state.vertexSettings.endpointUrl;
    routeInput.value = state.vertexSettings.routeOrModel;

    function syncVertexSettings() {
      state.vertexSettings.endpointUrl = endpointInput.value.trim();
      state.vertexSettings.routeOrModel = routeInput.value.trim();
      saveVertexSettings();
      refreshVertexPayload();
    }

    endpointInput.addEventListener('change', syncVertexSettings);
    routeInput.addEventListener('change', syncVertexSettings);
    endpointInput.addEventListener('input', syncVertexSettings);
    routeInput.addEventListener('input', syncVertexSettings);

    analyzeBtn.addEventListener('click', function () {
      syncVertexSettings();
      var endpoint = state.vertexSettings.endpointUrl;
      if (!endpoint) {
        setStatus('vertexStatus', 'Add an endpoint URL to open Vertex AI for analysis.');
        return;
      }
      window.open(endpoint, '_blank', 'noopener,noreferrer');
      setStatus(
        'vertexStatus',
        'Opened Vertex endpoint. If auth/CORS prevents direct submit, copy payload and paste it manually.'
      );
    });

    copyBtn.addEventListener('click', copyPayloadToClipboard);

    submitBtn.addEventListener('click', function () {
      syncVertexSettings();
      var endpoint = state.vertexSettings.endpointUrl;
      if (!endpoint) {
        setStatus('vertexStatus', 'Add endpoint URL before direct submit.');
        return;
      }
      var payloadText = byId('vertexPayloadOutput').value;
      if (!payloadText) {
        setStatus('vertexStatus', 'No payload available for submit.');
        return;
      }

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payloadText,
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.text();
        })
        .then(function () {
          setStatus('vertexStatus', 'Direct submit sent successfully.');
        })
        .catch(function (error) {
          setStatus(
            'vertexStatus',
            'Direct submit blocked (' +
              error.message +
              '). Use copy payload + open endpoint flow.'
          );
        });
    });
  }

  function init() {
    loadFromStorage();
    wireUploadActions();
    wirePublishActions();
    wireFilterActions();
    wireVertexActions();
    renderSkills();
    refreshVertexPayload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
