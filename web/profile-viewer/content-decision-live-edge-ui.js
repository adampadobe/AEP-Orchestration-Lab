/**
 * Decision lab Edge — workflow: provision (schema/dataset), save config, load Launch URL from Firebase.
 * Placement fragments: dynamic rows → preview mounts (cd-edge-{key}).
 */
(function (global) {
  'use strict';

  /** Aligned with functions/decisionLabConfigStore.js sanitizePlacements (max 8). */
  var MAX_PLACEMENTS = 8;

  var DEFAULT_PLACEMENTS = [
    { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
    { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
    { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card' },
  ];

  var placementRowSeq = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function setMsg(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.className = 'status' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : '');
    node.hidden = !text;
  }

  function sandboxName() {
    return typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName
      ? String(AepGlobalSandbox.getSandboxName() || '').trim()
      : '';
  }

  function sandboxQs() {
    var n = sandboxName();
    return n ? '?sandbox=' + encodeURIComponent(n) : '';
  }

  async function labFetch(url, opts) {
    if (typeof CdLabConfigApi !== 'undefined' && CdLabConfigApi.labAuthFetch) {
      return CdLabConfigApi.labAuthFetch(url, opts || {});
    }
    return fetch(url, opts || {});
  }

  function sanitizeKey(raw) {
    return String(raw || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /** Ensure unique sanitized keys (server + DOM id safety). */
  function dedupePlacementKeys(rows) {
    var seen = {};
    return rows.map(function (r) {
      var base = sanitizeKey(r.key) || 'slot';
      var k = base;
      var n = 1;
      while (seen[k]) {
        k = base + '_' + n++;
      }
      seen[k] = true;
      return {
        key: k,
        fragment: String(r.fragment || '')
          .trim()
          .replace(/^#/, ''),
        label: String(r.label || r.key || '')
          .trim()
          .slice(0, 128),
      };
    });
  }

  function readRowsFromDom() {
    var list = el('cdLabPlacementsList');
    if (!list) return [];
    var rows = list.querySelectorAll('.cd-lab-placement-row');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var keyIn = row.querySelector('.cd-lab-placement-key');
      var fragIn = row.querySelector('.cd-lab-placement-fragment');
      var labIn = row.querySelector('.cd-lab-placement-label');
      out.push({
        key: keyIn ? keyIn.value : '',
        fragment: fragIn ? fragIn.value : '',
        label: labIn ? labIn.value : '',
      });
    }
    return out;
  }

  function getPlacementsFromForm() {
    var raw = readRowsFromDom();
    var normalized = raw
      .map(function (r) {
        return {
          key: r.key,
          fragment: String(r.fragment || '')
            .trim()
            .replace(/^#/, ''),
          label: String(r.label || '').trim(),
        };
      })
      .filter(function (r) {
        return r.fragment.length > 0;
      });
    if (!normalized.length) {
      normalized = DEFAULT_PLACEMENTS.slice();
    }
    return dedupePlacementKeys(normalized);
  }

  function validatePlacementKeysForSave() {
    var raw = readRowsFromDom();
    var keys = raw.map(function (r) {
      return sanitizeKey(r.key) || 'slot';
    });
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      if (seen[keys[i]]) {
        return { ok: false, msg: 'Duplicate placement key after sanitizing: ' + keys[i] + '. Edit keys so each is unique.' };
      }
      seen[keys[i]] = true;
    }
    return { ok: true };
  }

  function rebuildPreviewMounts() {
    var wrap = el('cdEdgeMounts');
    if (!wrap) return;
    var placements = getPlacementsFromForm();
    wrap.textContent = '';
    var i;
    for (i = 0; i < placements.length; i++) {
      var p = placements[i];
      var key = p.key;
      var fragment = p.fragment || '';
      var lab = p.label || key;
      var outer = document.createElement('div');
      outer.className = 'cd-edge-mount';
      var labEl = document.createElement('span');
      labEl.className = 'cd-edge-mount-label';
      labEl.id = 'cdMountLabel-' + key;
      labEl.textContent = lab + (fragment ? ' — #' + fragment : '');
      var body = document.createElement('div');
      body.id = 'cd-edge-' + key;
      body.className = 'cd-edge-mount-body';
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', lab);
      var lk = String(key).toLowerCase();
      if (lk === 'hero') {
        body.classList.add('cd-edge-mount-body--hero');
      }
      var isCardSlot =
        lk === 'contentcard' || /contentcard|content-card/i.test(fragment);
      if (!isCardSlot) {
        body.classList.add('cd-edge-prefer-html');
      }
      outer.appendChild(labEl);
      outer.appendChild(body);
      wrap.appendChild(outer);
    }
  }

  function createPlacementRow(p) {
    p = p || { key: '', fragment: '', label: '' };
    var row = document.createElement('div');
    row.className = 'cd-lab-placement-row';
    var uid = 'cdpl_' + ++placementRowSeq;

    function field(labelText, className, value, ph) {
      var wrap = document.createElement('div');
      var lab = document.createElement('label');
      lab.setAttribute('for', uid + '_' + className);
      lab.textContent = labelText;
      var input = document.createElement('input');
      input.type = 'text';
      input.id = uid + '_' + className;
      input.className = className;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = value != null ? value : '';
      if (ph) input.placeholder = ph;
      wrap.appendChild(lab);
      wrap.appendChild(input);
      return wrap;
    }

    row.appendChild(field('Key', 'cd-lab-placement-key', p.key, 'e.g. topRibbon'));
    row.appendChild(field('Fragment (hash)', 'cd-lab-placement-fragment', p.fragment, 'e.g. hero-banner'));
    row.appendChild(field('Label', 'cd-lab-placement-label', p.label, 'Preview title'));

    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'secondary cd-lab-placement-row-remove';
    rm.setAttribute('aria-label', 'Remove placement');
    rm.textContent = 'Remove';
    row.appendChild(rm);

    return row;
  }

  function renderPlacementRows(arr) {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    list.textContent = '';
    var source = arr && arr.length ? arr : DEFAULT_PLACEMENTS.slice();
    var i;
    for (i = 0; i < source.length; i++) {
      list.appendChild(
        createPlacementRow({
          key: source[i].key || '',
          fragment: source[i].fragment || '',
          label: source[i].label || '',
        })
      );
    }
    if (!list.querySelector('.cd-lab-placement-row')) {
      list.appendChild(createPlacementRow(DEFAULT_PLACEMENTS[0]));
    }
    updateRemoveButtonsEnabled();
  }

  function placementRowCount() {
    var list = el('cdLabPlacementsList');
    if (!list) return 0;
    return list.querySelectorAll('.cd-lab-placement-row').length;
  }

  function updateRemoveButtonsEnabled() {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    var n = placementRowCount();
    var rows = list.querySelectorAll('.cd-lab-placement-row');
    for (var i = 0; i < rows.length; i++) {
      var btn = rows[i].querySelector('.cd-lab-placement-row-remove');
      if (btn) btn.disabled = n <= 1;
    }
    var addBtn = el('cdLabAddPlacementBtn');
    if (addBtn) {
      addBtn.disabled = n >= MAX_PLACEMENTS;
      addBtn.title =
        n >= MAX_PLACEMENTS
          ? 'Maximum ' + MAX_PLACEMENTS + ' placements (same limit as saved config).'
          : 'Add another preview region and surface fragment.';
    }
  }

  function onPlacementsListClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var rm = t.closest('.cd-lab-placement-row-remove');
    if (!rm || rm.disabled) return;
    var row = rm.closest('.cd-lab-placement-row');
    if (!row) return;
    if (placementRowCount() <= 1) return;
    row.remove();
    updateRemoveButtonsEnabled();
    applyPlacementsToMountsModule();
  }

  function onPlacementsListInput() {
    setMsg(el('cdLabPlacementKeyMsg'), '', '');
    applyPlacementsToMountsModule();
  }

  function wirePlacementList() {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    list.addEventListener('click', onPlacementsListClick);
    list.addEventListener('input', onPlacementsListInput);
    list.addEventListener('change', onPlacementsListInput);
  }

  function addPlacementRow() {
    var list = el('cdLabPlacementsList');
    if (!list) return;
    if (placementRowCount() >= MAX_PLACEMENTS) return;
    var n = placementRowCount() + 1;
    list.appendChild(
      createPlacementRow({
        key: 'slot' + n,
        fragment: 'placement-' + n,
        label: 'Placement ' + n,
      })
    );
    updateRemoveButtonsEnabled();
    applyPlacementsToMountsModule();
  }

  function applyPlacementsToMountsModule() {
    rebuildPreviewMounts();
    if (typeof CdEdgeMounts !== 'undefined' && CdEdgeMounts.setPlacements) {
      CdEdgeMounts.setPlacements(getPlacementsFromForm());
    }
  }

  function toggleScopesRow() {
    var mode = el('cdLabEdgeMode') && el('cdLabEdgeMode').value;
    var row = el('cdLabScopesRow');
    if (row) row.style.display = mode === 'decisionScopes' ? 'block' : 'none';
  }

  /**
   * Normalise whatever the user pasted for the Launch embed.
   * Accepts full <script src="..."> tags, bare URLs, and URLs missing a
   * protocol. Returns an empty string if nothing usable is present.
   */
  function sanitiseLaunchScriptUrl(raw) {
    if (!raw) return '';
    var v = String(raw).trim();
    if (!v) return '';
    // <script ... src="..."></script> → just the src
    var m = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(v);
    if (m) v = m[1].trim();
    // Strip stray wrapping quotes
    v = v.replace(/^["']+|["']+$/g, '').trim();
    // Adobe CDN is HTTPS-only — upgrade if someone pastes http://
    if (/^http:\/\/assets\.adobedtm\.com/i.test(v)) v = v.replace(/^http:/i, 'https:');
    // Add https:// when user pasted just a domain/path
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }

  function loadRecordIntoForm(rec) {
    if (!rec || typeof rec !== 'object') return;
    if (rec.datastreamId && el('edgeConfigId')) el('edgeConfigId').value = rec.datastreamId;
    if (rec.launchScriptUrl && el('cdLabLaunchUrl')) {
      el('cdLabLaunchUrl').value = sanitiseLaunchScriptUrl(rec.launchScriptUrl);
    }
    if (rec.tagsPropertyRef && el('cdLabTagsProperty')) el('cdLabTagsProperty').value = rec.tagsPropertyRef;
    if (rec.targetPageUrl && el('cdLabTargetPageUrl')) el('cdLabTargetPageUrl').value = rec.targetPageUrl;
    if (rec.edgePersonalizationMode && el('cdLabEdgeMode')) {
      el('cdLabEdgeMode').value =
        rec.edgePersonalizationMode === 'decisionScopes' ? 'decisionScopes' : 'surfaces';
    }
    var pl = rec.placements;
    if (Array.isArray(pl) && pl.length) {
      renderPlacementRows(pl.slice(0, MAX_PLACEMENTS));
    } else {
      renderPlacementRows(DEFAULT_PLACEMENTS);
    }
    applyPlacementsToMountsModule();
    toggleScopesRow();

    // ----- surface styles (per sandbox + surface) -----
    currentSurfaceStyles = (rec.surfaceStyles && typeof rec.surfaceStyles === 'object' && !Array.isArray(rec.surfaceStyles))
      ? Object.assign({}, rec.surfaceStyles)
      : {};
    populateStyleSurfaceDropdown();
    loadStyleEditorForSelectedSurface();
    applySurfaceStylesToMounts();
  }

  // ===== Per-surface styling =====
  // Keyed by placement.fragment so a rename of placement.key doesn't lose
  // formatting. Value shape: one entry per field the style form exposes.
  var currentSurfaceStyles = {};

  var STYLE_DEFAULTS = {
    layoutMode: 'overlay',
    blockY: 'flex-end',
    titleH: 'center', titleV: 'flex-start',
    descH: 'center', descV: 'center',
    ctaH: 'center', ctaV: 'flex-end',
    titleColor: '#e6e9ef',
    descColor: '#c5c9d3',
    ctaBg: '#f0f2f6',
    ctaText: '#1a1d23',
  };
  var JUSTIFY_VALUES = { 'flex-start': 1, 'center': 1, 'flex-end': 1 };
  var LAYOUT_MODES = { overlay: 1, half: 1, below: 1 };

  function normaliseHex(v) {
    if (!v) return '';
    var s = String(v).trim();
    if (s[0] !== '#') s = '#' + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{4}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.toLowerCase();
    return '';
  }
  function pickJustify(v, fb) { return JUSTIFY_VALUES[v] ? v : fb; }
  function pickHex(v, fb) { var n = normaliseHex(v); return n || fb; }
  function pickLayout(v, fb) { return LAYOUT_MODES[v] ? v : fb; }

  function readStyleEditorForm() {
    function g(id) { var x = el(id); return x ? x.value : ''; }
    return {
      layoutMode: pickLayout(g('cdStyleLayoutMode'), STYLE_DEFAULTS.layoutMode),
      blockY: pickJustify(g('cdStyleBlockY'), STYLE_DEFAULTS.blockY),
      titleH: pickJustify(g('cdStyleTitleH'), STYLE_DEFAULTS.titleH),
      titleV: pickJustify(g('cdStyleTitleV'), STYLE_DEFAULTS.titleV),
      descH: pickJustify(g('cdStyleDescH'), STYLE_DEFAULTS.descH),
      descV: pickJustify(g('cdStyleDescV'), STYLE_DEFAULTS.descV),
      ctaH: pickJustify(g('cdStyleCtaH'), STYLE_DEFAULTS.ctaH),
      ctaV: pickJustify(g('cdStyleCtaV'), STYLE_DEFAULTS.ctaV),
      titleColor: pickHex(g('cdStyleTitleColorHex'), STYLE_DEFAULTS.titleColor),
      descColor: pickHex(g('cdStyleDescColorHex'), STYLE_DEFAULTS.descColor),
      ctaBg: pickHex(g('cdStyleCtaBgHex'), STYLE_DEFAULTS.ctaBg),
      ctaText: pickHex(g('cdStyleCtaTextHex'), STYLE_DEFAULTS.ctaText),
    };
  }

  function writeStyleEditorForm(st) {
    function set(id, val) { var x = el(id); if (x) x.value = val; }
    set('cdStyleLayoutMode', st.layoutMode);
    set('cdStyleBlockY', st.blockY);
    set('cdStyleTitleH', st.titleH); set('cdStyleTitleV', st.titleV);
    set('cdStyleDescH', st.descH); set('cdStyleDescV', st.descV);
    set('cdStyleCtaH', st.ctaH); set('cdStyleCtaV', st.ctaV);
    set('cdStyleTitleColorHex', st.titleColor); set('cdStyleTitleColorPick', st.titleColor);
    set('cdStyleDescColorHex', st.descColor); set('cdStyleDescColorPick', st.descColor);
    set('cdStyleCtaBgHex', st.ctaBg); set('cdStyleCtaBgPick', st.ctaBg);
    set('cdStyleCtaTextHex', st.ctaText); set('cdStyleCtaTextPick', st.ctaText);
  }

  /** Apply one style entry's CSS custom properties + layout class to a mount. */
  function applyStyleToMount(mount, st) {
    if (!mount || !st) return;
    var banner = mount.querySelector('.cd-banner');
    if (banner) {
      banner.classList.remove('cd-banner--overlay', 'cd-banner--half', 'cd-banner--below');
      banner.classList.add('cd-banner--' + (st.layoutMode || STYLE_DEFAULTS.layoutMode));
      banner.style.setProperty('--cd-title-color', st.titleColor);
      banner.style.setProperty('--cd-desc-color', st.descColor);
      banner.style.setProperty('--cd-cta-bg', st.ctaBg);
      banner.style.setProperty('--cd-cta-text', st.ctaText);
    }
    var copy = mount.querySelector('.cd-banner-copy');
    if (copy) copy.style.setProperty('--cd-block-justify', st.blockY);
    var t = mount.querySelector('.cd-slot--title');
    if (t) { t.style.setProperty('--cd-slot-justify', st.titleH); t.style.setProperty('--cd-slot-align', st.titleV); }
    var d = mount.querySelector('.cd-slot--desc');
    if (d) { d.style.setProperty('--cd-slot-justify', st.descH); d.style.setProperty('--cd-slot-align', st.descV); }
    var c = mount.querySelector('.cd-slot--cta');
    if (c) { c.style.setProperty('--cd-slot-justify', st.ctaH); c.style.setProperty('--cd-slot-align', st.ctaV); }
  }

  function currentPlacementList() {
    var arr = getPlacementsFromForm();
    return Array.isArray(arr) && arr.length ? arr : DEFAULT_PLACEMENTS.slice();
  }

  function populateStyleSurfaceDropdown() {
    var sel = el('cdLabStyleSurface');
    if (!sel) return;
    var prior = sel.value;
    var placements = currentPlacementList();
    var html = placements.map(function (p) {
      var label = (p.label || p.fragment || p.key || '').replace(/</g, '&lt;');
      var frag = String(p.fragment || '').replace(/"/g, '&quot;');
      var key = String(p.key || '').replace(/</g, '&lt;');
      var hasSaved = !!currentSurfaceStyles[p.fragment];
      return '<option value="' + frag + '">' + label + ' — #' + (p.fragment || '') + ' [' + key + ']' + (hasSaved ? ' · saved' : '') + '</option>';
    }).join('');
    sel.innerHTML = html;
    if (prior && placements.some(function (p) { return p.fragment === prior; })) sel.value = prior;
    else if (placements.length) sel.value = placements[0].fragment;
  }

  function loadStyleEditorForSelectedSurface() {
    var sel = el('cdLabStyleSurface');
    if (!sel) return;
    var frag = sel.value;
    var saved = currentSurfaceStyles[frag];
    var st = saved ? Object.assign({}, STYLE_DEFAULTS, saved) : Object.assign({}, STYLE_DEFAULTS);
    writeStyleEditorForm(st);
    var msg = el('cdLabStyleMsg');
    if (msg) setMsg(msg, saved ? 'Saved styles loaded for #' + frag + '.' : 'No saved styles for #' + frag + ' — using defaults.', '');
  }

  /** Find the DOM mount for a given surface fragment using the placements map. */
  function findMountForFragment(fragment) {
    var placements = currentPlacementList();
    var placement = placements.find(function (p) { return p.fragment === fragment; });
    if (!placement) return null;
    return document.getElementById('cd-edge-' + placement.key);
  }

  /** Walk every saved surface style and apply its CSS vars to the matching mount. */
  function applySurfaceStylesToMounts() {
    Object.keys(currentSurfaceStyles).forEach(function (frag) {
      var st = currentSurfaceStyles[frag];
      if (!st) return;
      var mount = findMountForFragment(frag);
      if (mount) applyStyleToMount(mount, Object.assign({}, STYLE_DEFAULTS, st));
    });
  }

  // Debounce the save so dragging a color picker doesn't spray writes.
  var _styleSaveTimer = null;
  function scheduleStyleSave() {
    if (_styleSaveTimer) clearTimeout(_styleSaveTimer);
    _styleSaveTimer = setTimeout(async function () {
      _styleSaveTimer = null;
      try {
        var data = await CdLabConfigApi.saveDecisionLabConfig({ surfaceStyles: currentSurfaceStyles });
        if (data.ok) setMsg(el('cdLabStyleMsg'), 'Saved to Firebase.', 'ok');
        else setMsg(el('cdLabStyleMsg'), data.error || 'Save failed.', 'err');
      } catch (e) {
        setMsg(el('cdLabStyleMsg'), String(e && e.message || e), 'err');
      }
    }, 600);
  }

  function styleFormOnChange() {
    var sel = el('cdLabStyleSurface');
    if (!sel) return;
    var frag = (sel.value || '').trim();
    if (!frag) return;
    var st = readStyleEditorForm();
    currentSurfaceStyles[frag] = Object.assign({ updatedAt: new Date().toISOString() }, st);
    var mount = findMountForFragment(frag);
    if (mount) applyStyleToMount(mount, st);
    scheduleStyleSave();
    populateStyleSurfaceDropdown();
    sel.value = frag;
  }

  async function styleResetHandler() {
    var sel = el('cdLabStyleSurface');
    if (!sel) return;
    var frag = (sel.value || '').trim();
    if (!frag) return;
    if (!global.confirm('Reset the saved styles for #' + frag + ' back to defaults?')) return;
    delete currentSurfaceStyles[frag];
    writeStyleEditorForm(STYLE_DEFAULTS);
    var mount = findMountForFragment(frag);
    if (mount) applyStyleToMount(mount, STYLE_DEFAULTS);
    try {
      var data = await CdLabConfigApi.saveDecisionLabConfig({ surfaceStyles: currentSurfaceStyles });
      if (data.ok) setMsg(el('cdLabStyleMsg'), 'Reset for #' + frag + '.', 'ok');
      else setMsg(el('cdLabStyleMsg'), data.error || 'Save failed.', 'err');
    } catch (e) {
      setMsg(el('cdLabStyleMsg'), String(e && e.message || e), 'err');
    }
    populateStyleSurfaceDropdown();
    sel.value = frag;
  }

  function currentPlacementList() {
    var arr = getPlacementsFromForm();
    return Array.isArray(arr) && arr.length ? arr : DEFAULT_PLACEMENTS.slice();
  }

  /** Best-effort save schema/dataset names after successful infra steps (requires sign-in). */
  async function persistDecisionLabFields(patch) {
    if (typeof CdLabConfigApi === 'undefined' || !CdLabConfigApi.saveDecisionLabConfig) return;
    try {
      var data = await CdLabConfigApi.saveDecisionLabConfig(patch);
      if (data.ok) {
        setMsg(el('cdLabSaveStatus'), 'Saved to your lab config for this sandbox.', 'ok');
      } else if (data.error && /Sign in|401/i.test(String(data.error))) {
        setMsg(
          el('cdLabSaveStatus'),
          'Sign in (anonymous is fine) under the profile menu to save names for next visit.',
          ''
        );
      }
    } catch (e) {
      /* ignore */
    }
  }

  async function fetchConfigFromFirebase() {
    setMsg(el('cdLabSaveStatus'), 'Loading configuration…', '');
    var data = await CdLabConfigApi.fetchDecisionLabConfig();
    if (!data.ok) {
      setMsg(el('cdLabSaveStatus'), data.error || 'Could not load config.', 'err');
      return null;
    }
    loadRecordIntoForm(data.record || {});
    setMsg(
      el('cdLabSaveStatus'),
      data.record ? 'Loaded saved configuration (' + (data.storage || 'user') + ').' : 'No saved config yet — fill and save.',
      data.record ? 'ok' : ''
    );
    return data.record || null;
  }

  function renderLaunchPreview(data) {
    var box = el('cdLabLaunchPreview');
    if (!box) return;
    var esc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    var listHtml = function (arr, cls) {
      if (!arr || !arr.length) return '<em class="cd-lab-launch-preview__empty">(none)</em>';
      return '<ul class="cd-lab-launch-preview__list ' + cls + '">' +
        arr.map(function (s) { return '<li><code>' + esc(s) + '</code></li>'; }).join('') +
        '</ul>';
    };

    if (!data || data.ok === false) {
      var err = (data && data.error) || 'Preview failed.';
      var extra = '';
      if (data && Array.isArray(data.availableRules) && data.availableRules.length) {
        extra += '<p class="hint">Available rules on property: ' +
          data.availableRules.map(function (n) { return '<code>' + esc(n) + '</code>'; }).join(', ') +
          '</p>';
      }
      if (data && Array.isArray(data.matches) && data.matches.length) {
        extra += '<p class="hint">Ambiguous — possible matches:</p><ul>' +
          data.matches.map(function (m) { return '<li><code>' + esc(m.propertyId) + '</code> — ' + esc(m.name) + '</li>'; }).join('') +
          '</ul>';
      }
      box.innerHTML = '<div class="status err">' + esc(err) + '</div>' + extra;
      box.hidden = false;
      return;
    }

    var d = data.diff || {};
    var summary =
      '<strong>Preview</strong> — ' +
      'property ' + esc(data.propertyName || data.propertyId) +
      ' · rule <code>' + esc(data.ruleName) + '</code>' +
      ' · action <code>' + esc(data.actionName) + '</code>' +
      ' · target <code>' + esc(data.target && data.target.host) + esc(data.target && data.target.path) + '</code>';

    var diffCounts =
      '<p class="hint">' +
      'Surfaces: <strong>+' + (d.surfacesAdded || []).length + '</strong> added, ' +
      '<strong>−' + (d.surfacesRemoved || []).length + '</strong> removed, ' +
      (d.surfacesUnchanged || []).length + ' unchanged. ' +
      'Scopes: <strong>+' + (d.scopesAdded || []).length + '</strong> added, ' +
      '<strong>−' + (d.scopesRemoved || []).length + '</strong> removed.' +
      '</p>';

    box.innerHTML =
      '<p class="cd-lab-launch-preview__title">' + summary + '</p>' +
      diffCounts +
      '<details open><summary>Surfaces to add (' + (d.surfacesAdded || []).length + ')</summary>' + listHtml(d.surfacesAdded, 'add') + '</details>' +
      '<details><summary>Surfaces to remove (' + (d.surfacesRemoved || []).length + ')</summary>' + listHtml(d.surfacesRemoved, 'rm') + '</details>' +
      '<details><summary>Scopes to add (' + (d.scopesAdded || []).length + ')</summary>' + listHtml(d.scopesAdded, 'add') + '</details>' +
      '<details><summary>Scopes to remove (' + (d.scopesRemoved || []).length + ')</summary>' + listHtml(d.scopesRemoved, 'rm') + '</details>' +
      '<details><summary>After merge: proposed surfaces (' + (data.proposedSurfaces || []).length + ')</summary>' + listHtml(data.proposedSurfaces, '') + '</details>' +
      '<p class="hint"><em>Read-only. No Reactor writes happened. The write pipeline ships in a follow-up.</em></p>';
    box.hidden = false;
  }

  function renderLaunchApplyResult(data) {
    var box = el('cdLabLaunchPreview');
    if (!box) return;
    var esc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    if (!data || data.ok === false) {
      box.innerHTML = '<div class="status err">Apply failed: ' + esc((data && data.error) || 'unknown error') + '</div>';
      box.hidden = false;
      return;
    }
    if (data.noop) {
      box.innerHTML = '<div class="status ok">No change applied — surfaces and scopes already match the current placements.</div>';
      box.hidden = false;
      return;
    }
    var listHtml = function (arr) {
      if (!arr || !arr.length) return '<em class="cd-lab-launch-preview__empty">(none)</em>';
      return '<ul class="cd-lab-launch-preview__list">' +
        arr.map(function (s) { return '<li><code>' + esc(s) + '</code></li>'; }).join('') +
        '</ul>';
    };
    box.innerHTML =
      '<div class="status ok">Reactor updated — rule <code>' + esc(data.ruleName) + '</code>, action <code>' + esc(data.actionName) + '</code>.</div>' +
      '<p class="hint"><strong>' + ((data.afterSurfaces || []).length) + '</strong> surfaces · <strong>' + ((data.afterScopes || []).length) + '</strong> scopes now on the rule.</p>' +
      '<details><summary>After: surfaces</summary>' + listHtml(data.afterSurfaces) + '</details>' +
      '<details><summary>After: scopes</summary>' + listHtml(data.afterScopes) + '</details>' +
      (data.publishNote ? '<p class="hint"><em>' + esc(data.publishNote) + '</em></p>' : '');
    box.hidden = false;
  }

  // Bypass Firebase Hosting's 60s proxy timeout — the publish endpoint
  // polls Reactor builds which can take up to ~2 min.
  var PUBLISH_URL = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net/edgeLaunchRulePublish';

  function renderPublishResult(data) {
    var box = el('cdLabLaunchPreview');
    if (!box) return;
    var esc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    if (!data || data.ok === false) {
      var step = data && data.step ? ' (' + esc(data.step) + ')' : '';
      var extra = '';
      if (data && data.publish && data.publish.step) {
        extra = '<p class="hint">Publish step that failed: <code>' + esc(data.publish.step) + '</code></p>';
      }
      box.innerHTML = '<div class="status err">Apply &amp; publish failed' + step + ': ' + esc((data && data.error) || (data && data.publish && data.publish.error) || 'unknown error') + '</div>' + extra;
      box.hidden = false;
      return;
    }
    var pub = data.publish || {};
    var build = pub.build || {};
    var env = pub.environment || {};
    var library = pub.library || {};
    var elapsedS = pub.elapsedMs ? (pub.elapsedMs / 1000).toFixed(1) + 's' : '—';

    if (pub.skipped) {
      box.innerHTML = '<div class="status ok">No change — apply was a no-op so nothing to publish.</div>';
      box.hidden = false;
      return;
    }

    box.innerHTML =
      '<div class="status ok">Published to <strong>' + esc(env.name || 'Development') + '</strong> — build <code>' + esc(build.status) + '</code> in ' + elapsedS + '.</div>' +
      '<p class="hint">Library <code>' + esc(library.name || library.libraryId) + '</code> · build <code>' + esc(build.buildId) + '</code>. The Development embed script will now serve the updated surfaces/scopes.</p>' +
      '<p class="hint"><strong>' + ((data.afterSurfaces || []).length) + '</strong> surfaces · <strong>' + ((data.afterScopes || []).length) + '</strong> scopes are now live on the rule.</p>';
    box.hidden = false;
  }

  async function applyAndPublishLaunchRule() {
    var propertyRef = el('cdLabTagsProperty') && el('cdLabTagsProperty').value.trim();
    var targetPageUrl = el('cdLabTargetPageUrl') && el('cdLabTargetPageUrl').value.trim();
    if (!propertyRef) { renderLaunchPreview({ ok: false, error: 'Enter a Tags property name or PR… ID first.' }); return; }
    if (!targetPageUrl) { renderLaunchPreview({ ok: false, error: 'Enter a target page URL first.' }); return; }
    var plCount = getPlacementsFromForm().length;
    var msg = 'Apply the current ' + plCount + ' placement' + (plCount === 1 ? '' : 's') +
      ' to the Page View rule AND publish to the Development environment? This creates a new Launch library, builds it, and auto-deploys. Takes up to 2 minutes.';
    if (!global.confirm(msg)) return;

    var btn = el('cdLabPublishLaunchBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
    var box = el('cdLabLaunchPreview');
    if (box) { box.hidden = false; box.innerHTML = '<div class="status">Starting apply + publish \u2014 this can take 30-120s while Launch builds the library.</div>'; }

    var body = {
      propertyRef: propertyRef,
      targetPageUrl: targetPageUrl,
      placements: getPlacementsFromForm(),
      edgePersonalizationMode: el('cdLabEdgeMode') && el('cdLabEdgeMode').value,
    };

    try {
      var res = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      renderPublishResult(data);
    } catch (e) {
      renderPublishResult({ ok: false, error: String(e && e.message || e) });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply & publish to Dev'; }
    }
  }

  async function applyLaunchRuleChange() {
    var propertyRef = el('cdLabTagsProperty') && el('cdLabTagsProperty').value.trim();
    var targetPageUrl = el('cdLabTargetPageUrl') && el('cdLabTargetPageUrl').value.trim();
    if (!propertyRef) { renderLaunchPreview({ ok: false, error: 'Enter a Tags property name or PR… ID first.' }); return; }
    if (!targetPageUrl) { renderLaunchPreview({ ok: false, error: 'Enter a target page URL first.' }); return; }
    var plCount = getPlacementsFromForm().length;
    var msg = 'Write the current ' + plCount + ' placement' + (plCount === 1 ? '' : 's') +
      ' to the Page View rule on "' + propertyRef + '"? Only surfaces matching the target host+path are rewritten; other surfaces stay untouched.';
    if (!global.confirm(msg)) return;

    var btn = el('cdLabApplyLaunchBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Writing to Reactor…'; }

    var body = {
      propertyRef: propertyRef,
      targetPageUrl: targetPageUrl,
      placements: getPlacementsFromForm(),
      edgePersonalizationMode: el('cdLabEdgeMode') && el('cdLabEdgeMode').value,
    };

    try {
      var res = await labFetch('/api/edge-decisioning/apply-launch-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      renderLaunchApplyResult(data);
    } catch (e) {
      renderLaunchApplyResult({ ok: false, error: String(e && e.message || e) });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Apply to Launch'; }
    }
  }

  async function previewLaunchRuleChange() {
    var propertyRef = el('cdLabTagsProperty') && el('cdLabTagsProperty').value.trim();
    var targetPageUrl = el('cdLabTargetPageUrl') && el('cdLabTargetPageUrl').value.trim();
    if (!propertyRef) { renderLaunchPreview({ ok: false, error: 'Enter a Tags property name or PR… ID first.' }); return; }
    if (!targetPageUrl) { renderLaunchPreview({ ok: false, error: 'Enter a target page URL first.' }); return; }

    var btn = el('cdLabPreviewLaunchBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching rule…'; }

    var body = {
      propertyRef: propertyRef,
      targetPageUrl: targetPageUrl,
      placements: getPlacementsFromForm(),
      edgePersonalizationMode: el('cdLabEdgeMode') && el('cdLabEdgeMode').value,
    };

    try {
      var res = await labFetch('/api/edge-decisioning/preview-launch-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      renderLaunchPreview(data);
    } catch (e) {
      renderLaunchPreview({ ok: false, error: String(e && e.message || e) });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Preview Launch rule'; }
    }
  }

  async function saveConfigToFirebase() {
    var sb = sandboxName();
    if (!sb) {
      setMsg(el('cdLabSaveStatus'), 'Select a sandbox first.', 'err');
      return;
    }
    var keyCheck = validatePlacementKeysForSave();
    if (!keyCheck.ok) {
      setMsg(el('cdLabPlacementKeyMsg'), keyCheck.msg, 'err');
      return;
    }
    setMsg(el('cdLabPlacementKeyMsg'), '', '');
    setMsg(el('cdLabSaveStatus'), 'Saving…', '');
    var body = {
      datastreamId: el('edgeConfigId') && el('edgeConfigId').value.trim(),
      launchScriptUrl: sanitiseLaunchScriptUrl(el('cdLabLaunchUrl') && el('cdLabLaunchUrl').value),
      tagsPropertyRef: el('cdLabTagsProperty') && el('cdLabTagsProperty').value.trim(),
      targetPageUrl: el('cdLabTargetPageUrl') && el('cdLabTargetPageUrl').value.trim(),
      edgePersonalizationMode: el('cdLabEdgeMode') && el('cdLabEdgeMode').value,
      placements: getPlacementsFromForm(),
      surfaceStyles: currentSurfaceStyles,
    };
    var data = await CdLabConfigApi.saveDecisionLabConfig(body);
    if (!data.ok) {
      setMsg(el('cdLabSaveStatus'), data.error || 'Save failed.', 'err');
      return;
    }
    loadRecordIntoForm(data.record || {});
    setMsg(el('cdLabSaveStatus'), 'Saved for sandbox ' + sb + '.', 'ok');
    // If the sandbox has a Tags property + target URL configured, show the
    // diff against the Launch rule so the user sees what a subsequent write
    // would do. Silent no-op if either field is empty.
    var hasTags = el('cdLabTagsProperty') && el('cdLabTagsProperty').value.trim();
    var hasTarget = el('cdLabTargetPageUrl') && el('cdLabTargetPageUrl').value.trim();
    if (hasTags && hasTarget) {
      previewLaunchRuleChange().catch(function () { /* already surfaced via renderLaunchPreview */ });
    }
  }

  async function probeTagsApiStep() {
    if (!sandboxName()) {
      setMsg(el('cdLabTagsApiMsg'), 'Select a sandbox first.', 'err');
      return;
    }
    setMsg(el('cdLabTagsApiMsg'), 'Calling Reactor API…', '');
    try {
      var res = await labFetch('/api/events/infra/step' + sandboxQs(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'probeTagsApi' }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok && data.authorized) {
        setMsg(
          el('cdLabTagsApiMsg'),
          (data.hint || 'Tags API OK.') + (data.companiesCount != null ? ' Companies visible: ' + data.companiesCount + '.' : ''),
          'ok'
        );
        return;
      }
      var msg = data.hint || data.detail || data.error || 'Tags API check failed.';
      setMsg(el('cdLabTagsApiMsg'), msg, 'err');
    } catch (e) {
      setMsg(el('cdLabTagsApiMsg'), e.message || 'Network error', 'err');
    }
  }

  function wireFormListeners() {
    wirePlacementList();
    if (el('cdLabEdgeMode')) el('cdLabEdgeMode').addEventListener('change', toggleScopesRow);
    if (el('cdLabAddPlacementBtn')) {
      el('cdLabAddPlacementBtn').addEventListener('click', function () {
        addPlacementRow();
      });
    }
  }

  function earlyInitPlacements() {
    var list = el('cdLabPlacementsList');
    if (!list || list.querySelector('.cd-lab-placement-row')) return;
    renderPlacementRows(DEFAULT_PLACEMENTS);
    applyPlacementsToMountsModule();
  }

  var __lastLaunchInjected = '';

  global.CdLabUi = {
    DEFAULT_PLACEMENTS: DEFAULT_PLACEMENTS,
    getPlacementsFromForm: getPlacementsFromForm,
    applyPlacementsToMountsModule: applyPlacementsToMountsModule,
    rebuildPreviewMounts: rebuildPreviewMounts,
    applySurfaceStylesToMounts: applySurfaceStylesToMounts,
    getLaunchScriptUrl: function () {
      return el('cdLabLaunchUrl') ? el('cdLabLaunchUrl').value.trim() : '';
    },
    getEdgePersonalizationMode: function () {
      return el('cdLabEdgeMode') ? el('cdLabEdgeMode').value : 'surfaces';
    },
    loadRecordIntoForm: loadRecordIntoForm,
    fetchConfigFromFirebase: fetchConfigFromFirebase,
    /** After auth — load Firebase config, wire buttons, first Launch inject */
    bootstrapAfterAuth: async function () {
      wireFormListeners();
      toggleScopesRow();
      if (!el('cdLabPlacementsList') || !el('cdLabPlacementsList').querySelector('.cd-lab-placement-row')) {
        renderPlacementRows(DEFAULT_PLACEMENTS);
      }
      applyPlacementsToMountsModule();

      if (el('cdLabProbeTagsBtn')) el('cdLabProbeTagsBtn').addEventListener('click', probeTagsApiStep);
      if (el('cdLabSaveConfigBtn')) el('cdLabSaveConfigBtn').addEventListener('click', saveConfigToFirebase);
      if (el('cdLabLoadConfigBtn')) el('cdLabLoadConfigBtn').addEventListener('click', fetchConfigFromFirebase);

      // Per-surface styling editor wiring.
      if (el('cdLabStyleSurface')) {
        el('cdLabStyleSurface').addEventListener('change', loadStyleEditorForSelectedSurface);
        // Refresh dropdown contents on focus so placement edits (add / rename /
        // remove) reflect without a page reload.
        el('cdLabStyleSurface').addEventListener('focus', populateStyleSurfaceDropdown);
      }
      var styleSelectIds = [
        'cdStyleLayoutMode', 'cdStyleBlockY',
        'cdStyleTitleH', 'cdStyleTitleV',
        'cdStyleDescH', 'cdStyleDescV',
        'cdStyleCtaH', 'cdStyleCtaV',
      ];
      styleSelectIds.forEach(function (id) {
        if (el(id)) el(id).addEventListener('change', styleFormOnChange);
      });
      var colorPairs = [
        ['cdStyleTitleColorPick', 'cdStyleTitleColorHex'],
        ['cdStyleDescColorPick', 'cdStyleDescColorHex'],
        ['cdStyleCtaBgPick', 'cdStyleCtaBgHex'],
        ['cdStyleCtaTextPick', 'cdStyleCtaTextHex'],
      ];
      colorPairs.forEach(function (pair) {
        var pick = el(pair[0]);
        var hex = el(pair[1]);
        if (pick) {
          pick.addEventListener('input', function () {
            if (hex) hex.value = pick.value;
            styleFormOnChange();
          });
        }
        if (hex) {
          hex.addEventListener('input', function () {
            var v = normaliseHex(hex.value);
            if (v && pick) pick.value = v;
            styleFormOnChange();
          });
        }
      });
      if (el('cdLabStyleResetBtn')) el('cdLabStyleResetBtn').addEventListener('click', styleResetHandler);
      populateStyleSurfaceDropdown();

      // Auto-sanitise the Launch input so pasting the full <script> tag,
      // an http:// URL, or a bare domain still results in a clean https URL.
      var launchEl = el('cdLabLaunchUrl');
      if (launchEl) {
        var normaliseLaunchInput = function () {
          var before = launchEl.value;
          var after = sanitiseLaunchScriptUrl(before);
          if (before !== after) launchEl.value = after;
        };
        var maybeReinjectLaunch = function () {
          normaliseLaunchInput();
          var next = launchEl.value.trim();
          if (!next) return;
          if (next === __lastLaunchInjected) return;
          if (global.CdEdgeLab && typeof global.CdEdgeLab.reinjectLaunch === 'function') {
            global.CdEdgeLab.reinjectLaunch().catch(function () { /* surfaced in webSdkInitStatus */ });
          }
        };
        launchEl.addEventListener('blur', maybeReinjectLaunch);
        launchEl.addEventListener('paste', function () { setTimeout(normaliseLaunchInput, 0); });
        launchEl.addEventListener('change', maybeReinjectLaunch);
      }

      if (el('cdLabPreviewLaunchBtn')) {
        el('cdLabPreviewLaunchBtn').addEventListener('click', previewLaunchRuleChange);
      }
      if (el('cdLabApplyLaunchBtn')) {
        el('cdLabApplyLaunchBtn').addEventListener('click', applyLaunchRuleChange);
      }
      if (el('cdLabPublishLaunchBtn')) {
        el('cdLabPublishLaunchBtn').addEventListener('click', applyAndPublishLaunchRule);
      }

      await fetchConfigFromFirebase();
      __lastLaunchInjected = global.CdLabUi.getLaunchScriptUrl();
    },
    noteLaunchInjected: function (url) {
      __lastLaunchInjected = String(url || '').trim();
    },
    getLastInjectedLaunchUrl: function () {
      return __lastLaunchInjected;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', earlyInitPlacements);
  } else {
    earlyInitPlacements();
  }
})(typeof window !== 'undefined' ? window : globalThis);
