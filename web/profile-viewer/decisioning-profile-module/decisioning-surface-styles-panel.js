/**
 * Compact surface styling panel for env-bar Decisioning popout.
 * Reads/writes Firestore surfaceStyles via CdLabConfigApi (same as Edge lab Step 4).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260617-surface-expand';
  var core = function () {
    return global.CdSurfaceStylesCore;
  };

  function defaults() {
    var c = core();
    return c ? c.STYLE_DEFAULTS_LAB : {};
  }

  function buildMarkup() {
    return (
      '<div class="cd-micro-profile-surface-footer">' +
      '<button type="button" class="cd-micro-profile-surface-toggle" id="cdMicroSurfaceStylesToggle" aria-expanded="false" aria-controls="cdMicroSurfaceStylesPanel">' +
      '<span>Surface styling</span>' +
      '<span class="cd-micro-profile-surface-chevron" aria-hidden="true"></span>' +
      '</button></div>' +
      '<section class="cd-micro-profile-surface-panel" id="cdMicroSurfaceStylesPanel" hidden aria-label="Surface styling">' +
      '<div class="cd-micro-profile-field">' +
      '<label for="cdMicroSurfaceSelect">Surface</label>' +
      '<select id="cdMicroSurfaceSelect" aria-label="Surface fragment"></select>' +
      '</div>' +
      '<div class="cd-micro-profile-field">' +
      '<label for="cdMicroSurfaceLayout">Layout</label>' +
      '<select id="cdMicroSurfaceLayout">' +
      '<option value="overlay">Overlay</option><option value="half">Half</option><option value="below">Below</option>' +
      '</select></div>' +
      '<div class="cd-micro-profile-field">' +
      '<label for="cdMicroSurfaceBlockY">Copy vertical</label>' +
      '<select id="cdMicroSurfaceBlockY">' +
      '<option value="flex-start">Top</option><option value="center">Center</option><option value="flex-end">Bottom</option>' +
      '</select></div>' +
      '<details class="cd-micro-profile-surface-details"><summary>Title placement</summary>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroSurfaceTitleH">Title horizontal</label>' +
      '<select id="cdMicroSurfaceTitleH"><option value="flex-start">Left</option><option value="center">Center</option><option value="flex-end">Right</option></select></div>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroSurfaceTitleV">Title vertical</label>' +
      '<select id="cdMicroSurfaceTitleV"><option value="flex-start">Top</option><option value="center">Center</option><option value="flex-end">Bottom</option></select></div>' +
      '</details>' +
      '<details class="cd-micro-profile-surface-details"><summary>Description placement</summary>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroSurfaceDescH">Desc horizontal</label>' +
      '<select id="cdMicroSurfaceDescH"><option value="flex-start">Left</option><option value="center">Center</option><option value="flex-end">Right</option></select></div>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroSurfaceDescV">Desc vertical</label>' +
      '<select id="cdMicroSurfaceDescV"><option value="flex-start">Top</option><option value="center">Center</option><option value="flex-end">Bottom</option></select></div>' +
      '</details>' +
      '<details class="cd-micro-profile-surface-details"><summary>CTA placement</summary>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroSurfaceCtaH">CTA horizontal</label>' +
      '<select id="cdMicroSurfaceCtaH"><option value="flex-start">Left</option><option value="center">Center</option><option value="flex-end">Right</option></select></div>' +
      '<div class="cd-micro-profile-field"><label for="cdMicroSurfaceCtaV">CTA vertical</label>' +
      '<select id="cdMicroSurfaceCtaV"><option value="flex-start">Top</option><option value="center">Center</option><option value="flex-end">Bottom</option></select></div>' +
      '</details>' +
      '<div class="cd-micro-profile-field cd-micro-profile-surface-color">' +
      '<label for="cdMicroSurfaceTitleColor">Title colour</label>' +
      '<div class="cd-micro-profile-color-row"><input type="color" id="cdMicroSurfaceTitleColorPick" value="#e6e9ef">' +
      '<input type="text" id="cdMicroSurfaceTitleColor" maxlength="9" spellcheck="false" autocomplete="off"></div></div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-surface-color">' +
      '<label for="cdMicroSurfaceDescColor">Description colour</label>' +
      '<div class="cd-micro-profile-color-row"><input type="color" id="cdMicroSurfaceDescColorPick" value="#c5c9d3">' +
      '<input type="text" id="cdMicroSurfaceDescColor" maxlength="9" spellcheck="false" autocomplete="off"></div></div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-surface-color">' +
      '<label for="cdMicroSurfaceCtaBg">Button background</label>' +
      '<div class="cd-micro-profile-color-row"><input type="color" id="cdMicroSurfaceCtaBgPick" value="#f0f2f6">' +
      '<input type="text" id="cdMicroSurfaceCtaBg" maxlength="9" spellcheck="false" autocomplete="off"></div></div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-surface-color">' +
      '<label for="cdMicroSurfaceCtaText">Button text</label>' +
      '<div class="cd-micro-profile-color-row"><input type="color" id="cdMicroSurfaceCtaTextPick" value="#1a1d23">' +
      '<input type="text" id="cdMicroSurfaceCtaText" maxlength="9" spellcheck="false" autocomplete="off"></div></div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-surface-color">' +
      '<label for="cdMicroSurfaceNoImageBg">Empty-slot background</label>' +
      '<div class="cd-micro-profile-color-row"><input type="color" id="cdMicroSurfaceNoImageBgPick" value="#2a2d34">' +
      '<input type="text" id="cdMicroSurfaceNoImageBg" maxlength="9" spellcheck="false" autocomplete="off" placeholder="Optional"></div></div>' +
      '<div class="cd-micro-profile-field">' +
      '<label>Preview height</label>' +
      '<div class="cd-micro-profile-height-row">' +
      '<input type="number" id="cdMicroSurfaceHeightPx" min="0" max="2000" step="1" placeholder="px" inputmode="numeric">' +
      '<input type="text" id="cdMicroSurfaceHeightCss" maxlength="40" placeholder="or CSS e.g. 6rem" spellcheck="false" autocomplete="off">' +
      '</div></div>' +
      '<div class="cd-micro-profile-field cd-micro-profile-surface-vis">' +
      '<label class="chk"><input type="checkbox" id="cdMicroSurfaceShowTitle" checked> Title</label>' +
      '<label class="chk"><input type="checkbox" id="cdMicroSurfaceShowDesc" checked> Description</label>' +
      '<label class="chk"><input type="checkbox" id="cdMicroSurfaceShowImage" checked> Image</label>' +
      '<label class="chk"><input type="checkbox" id="cdMicroSurfaceShowCta" checked> CTA</label>' +
      '</div>' +
      '<p class="cd-micro-profile-surface-status" id="cdMicroSurfaceStylesStatus" aria-live="polite"></p>' +
      '</section>'
    );
  }

  /**
   * @param {HTMLElement} container — host inside decisioning-profile-module (after actions)
   * @param {object} options
   */
  function mount(container, options) {
    if (!container) return null;
    options = options || {};
    container.innerHTML = buildMarkup();

    var currentSurfaceStyles = {};
    var placements = [];
    var saveTimer = null;
    var expanded = false;

    function $(id) {
      return document.getElementById(id);
    }

    function normaliseHex(v) {
      var c = core();
      return c && c.normaliseHex ? c.normaliseHex(v) : String(v || '').trim();
    }

    function mergeEntry(saved) {
      var c = core();
      return c && c.mergeStyleEntry ? c.mergeStyleEntry(saved, defaults()) : Object.assign({}, defaults(), saved || {});
    }

    function getPlacements() {
      if (typeof options.getPlacements === 'function') {
        var p = options.getPlacements();
        if (Array.isArray(p) && p.length) return p;
      }
      if (global.CdEdgeMounts && typeof global.CdEdgeMounts.getPlacements === 'function') {
        return global.CdEdgeMounts.getPlacements() || [];
      }
      return [
        { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
        { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
        { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card' },
      ];
    }

    function populateSurfaceSelect() {
      var sel = $('cdMicroSurfaceSelect');
      if (!sel) return;
      placements = getPlacements();
      var prior = sel.value;
      sel.innerHTML = placements
        .map(function (p) {
          var frag = String(p.fragment || '').replace(/"/g, '&quot;');
          var label = String(p.label || p.fragment || p.key || '').replace(/</g, '&lt;');
          var saved = currentSurfaceStyles[p.fragment] ? ' · saved' : '';
          return '<option value="' + frag + '">' + label + ' · #' + (p.fragment || '') + saved + '</option>';
        })
        .join('');
      if (prior && placements.some(function (p) { return p.fragment === prior; })) sel.value = prior;
      else if (placements.length) sel.value = placements[0].fragment;
    }

    function syncHeightPxField(css) {
      var px = $('cdMicroSurfaceHeightPx');
      var c = core();
      if (!px || !c) return;
      px.value = c.mountHeightPxFromCss(css);
    }

    function writeForm(st) {
      var d = defaults();
      function set(id, val) {
        var el = $(id);
        if (el) el.value = val;
      }
      function setChk(id, on) {
        var el = $(id);
        if (el && el.type === 'checkbox') el.checked = on !== false;
      }
      set('cdMicroSurfaceLayout', st.layoutMode || d.layoutMode);
      set('cdMicroSurfaceBlockY', st.blockY || d.blockY);
      set('cdMicroSurfaceTitleH', st.titleH || d.titleH);
      set('cdMicroSurfaceTitleV', st.titleV || d.titleV);
      set('cdMicroSurfaceDescH', st.descH || d.descH);
      set('cdMicroSurfaceDescV', st.descV || d.descV);
      set('cdMicroSurfaceCtaH', st.ctaH || d.ctaH);
      set('cdMicroSurfaceCtaV', st.ctaV || d.ctaV);
      var titleC = st.titleColor || d.titleColor;
      var descC = st.descColor || d.descColor;
      var ctaBg = st.ctaBg || d.ctaBg;
      var ctaTx = st.ctaText || d.ctaText;
      var nib = st.noImageBg != null && String(st.noImageBg).trim() ? normaliseHex(st.noImageBg) : '';
      set('cdMicroSurfaceTitleColor', titleC);
      if ($('cdMicroSurfaceTitleColorPick')) $('cdMicroSurfaceTitleColorPick').value = titleC;
      set('cdMicroSurfaceDescColor', descC);
      if ($('cdMicroSurfaceDescColorPick')) $('cdMicroSurfaceDescColorPick').value = descC;
      set('cdMicroSurfaceCtaBg', ctaBg);
      if ($('cdMicroSurfaceCtaBgPick')) $('cdMicroSurfaceCtaBgPick').value = ctaBg;
      set('cdMicroSurfaceCtaText', ctaTx);
      if ($('cdMicroSurfaceCtaTextPick')) $('cdMicroSurfaceCtaTextPick').value = ctaTx;
      set('cdMicroSurfaceNoImageBg', nib);
      if ($('cdMicroSurfaceNoImageBgPick')) $('cdMicroSurfaceNoImageBgPick').value = nib || '#2a2d34';
      var mh = st.mountMinHeight != null ? String(st.mountMinHeight) : '';
      set('cdMicroSurfaceHeightCss', mh);
      syncHeightPxField(mh);
      setChk('cdMicroSurfaceShowTitle', st.showTitle !== false);
      setChk('cdMicroSurfaceShowDesc', st.showDesc !== false);
      setChk('cdMicroSurfaceShowImage', st.showImage !== false);
      setChk('cdMicroSurfaceShowCta', st.showCta !== false);
    }

    function readForm() {
      var c = core();
      var d = defaults();
      function g(id) {
        var el = $(id);
        return el ? el.value : '';
      }
      function readChk(id, defTrue) {
        var el = $(id);
        if (!el || el.type !== 'checkbox') return defTrue;
        return !!el.checked;
      }
      var sanitizeH = c && c.sanitizeMountMinHeight ? c.sanitizeMountMinHeight : function (x) { return String(x || '').trim(); };
      return {
        layoutMode: c && c.pickLayout ? c.pickLayout(g('cdMicroSurfaceLayout'), d.layoutMode) : g('cdMicroSurfaceLayout'),
        blockY: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceBlockY'), d.blockY) : g('cdMicroSurfaceBlockY'),
        titleH: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceTitleH'), d.titleH) : g('cdMicroSurfaceTitleH'),
        titleV: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceTitleV'), d.titleV) : g('cdMicroSurfaceTitleV'),
        descH: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceDescH'), d.descH) : g('cdMicroSurfaceDescH'),
        descV: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceDescV'), d.descV) : g('cdMicroSurfaceDescV'),
        ctaH: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceCtaH'), d.ctaH) : g('cdMicroSurfaceCtaH'),
        ctaV: c && c.pickJustify ? c.pickJustify(g('cdMicroSurfaceCtaV'), d.ctaV) : g('cdMicroSurfaceCtaV'),
        titleColor: c && c.pickHex ? c.pickHex(g('cdMicroSurfaceTitleColor'), d.titleColor) : g('cdMicroSurfaceTitleColor'),
        descColor: c && c.pickHex ? c.pickHex(g('cdMicroSurfaceDescColor'), d.descColor) : g('cdMicroSurfaceDescColor'),
        ctaBg: c && c.pickHex ? c.pickHex(g('cdMicroSurfaceCtaBg'), d.ctaBg) : g('cdMicroSurfaceCtaBg'),
        ctaText: c && c.pickHex ? c.pickHex(g('cdMicroSurfaceCtaText'), d.ctaText) : g('cdMicroSurfaceCtaText'),
        noImageBg: normaliseHex(g('cdMicroSurfaceNoImageBg')) || '',
        mountMinHeight: sanitizeH(g('cdMicroSurfaceHeightCss')) || '',
        showTitle: readChk('cdMicroSurfaceShowTitle', true),
        showDesc: readChk('cdMicroSurfaceShowDesc', true),
        showImage: readChk('cdMicroSurfaceShowImage', true),
        showCta: readChk('cdMicroSurfaceShowCta', true),
      };
    }

    function setStatus(text, kind) {
      var el = $('cdMicroSurfaceStylesStatus');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'cd-micro-profile-surface-status' + (kind === 'err' ? ' is-err' : kind === 'ok' ? ' is-ok' : '');
    }

    function applyToTarget() {
      if (typeof options.onApply === 'function') {
        options.onApply(currentSurfaceStyles);
      }
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        persist();
      }, 600);
    }

    async function persist() {
      if (!global.CdLabConfigApi || typeof global.CdLabConfigApi.saveDecisionLabConfig !== 'function') {
        setStatus('Config API not loaded.', 'err');
        return;
      }
      setStatus('Saving…', '');
      try {
        var data = await global.CdLabConfigApi.saveDecisionLabConfig({ surfaceStyles: currentSurfaceStyles });
        if (data && data.ok) {
          setStatus('Saved to Firebase.', 'ok');
          if (data.record && data.record.surfaceStyles) {
            currentSurfaceStyles = Object.assign({}, data.record.surfaceStyles);
          }
        } else {
          setStatus((data && data.error) || 'Save failed.', 'err');
        }
      } catch (e) {
        setStatus(String(e && e.message ? e.message : e), 'err');
      }
    }

    function onFormChange() {
      var sel = $('cdMicroSurfaceSelect');
      if (!sel) return;
      var frag = (sel.value || '').trim();
      if (!frag) return;
      var st = readForm();
      currentSurfaceStyles[frag] = Object.assign({ updatedAt: new Date().toISOString() }, st);
      applyToTarget();
      scheduleSave();
      populateSurfaceSelect();
      sel.value = frag;
    }

    function loadEditorForSurface() {
      var sel = $('cdMicroSurfaceSelect');
      if (!sel) return;
      var frag = sel.value;
      writeForm(mergeEntry(currentSurfaceStyles[frag]));
      setStatus(currentSurfaceStyles[frag] ? 'Loaded saved styles.' : 'Using defaults.', '');
    }

    function setExpanded(open) {
      expanded = !!open;
      var panel = $('cdMicroSurfaceStylesPanel');
      var toggle = $('cdMicroSurfaceStylesToggle');
      var shell = document.getElementById('dpmPanelShell');
      var host = container;
      if (panel) {
        panel.hidden = !expanded;
        panel.classList.toggle('is-expanded', expanded);
      }
      if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (shell) shell.classList.toggle('is-surface-open', expanded);
      if (host) host.classList.toggle('is-surface-expanded', expanded);
      if (expanded) loadEditorForSurface();
    }

    function wireColorPair(pickId, hexId) {
      var pick = $(pickId);
      var hex = $(hexId);
      if (pick) {
        pick.addEventListener('input', function () {
          if (hex) hex.value = pick.value;
          onFormChange();
        });
      }
      if (hex) {
        hex.addEventListener('input', function () {
          var v = normaliseHex(hex.value);
          if (v && pick) pick.value = v;
          onFormChange();
        });
      }
    }

    function wire() {
      var toggle = $('cdMicroSurfaceStylesToggle');
      if (toggle) {
        toggle.addEventListener('click', function () {
          setExpanded(!expanded);
        });
      }
      var surfaceSel = $('cdMicroSurfaceSelect');
      if (surfaceSel) surfaceSel.addEventListener('change', loadEditorForSurface);

      [
        'cdMicroSurfaceLayout',
        'cdMicroSurfaceBlockY',
        'cdMicroSurfaceTitleH',
        'cdMicroSurfaceTitleV',
        'cdMicroSurfaceDescH',
        'cdMicroSurfaceDescV',
        'cdMicroSurfaceCtaH',
        'cdMicroSurfaceCtaV',
      ].forEach(function (id) {
        var el = $(id);
        if (el) el.addEventListener('change', onFormChange);
      });

      wireColorPair('cdMicroSurfaceTitleColorPick', 'cdMicroSurfaceTitleColor');
      wireColorPair('cdMicroSurfaceDescColorPick', 'cdMicroSurfaceDescColor');
      wireColorPair('cdMicroSurfaceCtaBgPick', 'cdMicroSurfaceCtaBg');
      wireColorPair('cdMicroSurfaceCtaTextPick', 'cdMicroSurfaceCtaText');
      wireColorPair('cdMicroSurfaceNoImageBgPick', 'cdMicroSurfaceNoImageBg');

      ['cdMicroSurfaceShowTitle', 'cdMicroSurfaceShowDesc', 'cdMicroSurfaceShowImage', 'cdMicroSurfaceShowCta'].forEach(
        function (id) {
          var el = $(id);
          if (el) el.addEventListener('change', onFormChange);
        }
      );

      var heightCss = $('cdMicroSurfaceHeightCss');
      if (heightCss) {
        heightCss.addEventListener('input', function () {
          syncHeightPxField(heightCss.value);
          onFormChange();
        });
      }
      var heightPx = $('cdMicroSurfaceHeightPx');
      if (heightPx) {
        heightPx.addEventListener('input', function () {
          var v = heightPx.value.trim();
          if (heightCss) heightCss.value = v === '' ? '' : String(Math.round(Number(v))) + 'px';
          onFormChange();
        });
      }
    }

    async function loadFromFirebase() {
      if (!global.CdLabConfigApi || typeof global.CdLabConfigApi.fetchDecisionLabConfig !== 'function') return;
      try {
        var data = await global.CdLabConfigApi.fetchDecisionLabConfig();
        if (data && data.ok && data.record) {
          if (data.record.surfaceStyles && typeof data.record.surfaceStyles === 'object') {
            currentSurfaceStyles = Object.assign({}, data.record.surfaceStyles);
          }
          if (data.record.placements && global.CdEdgeMounts && global.CdEdgeMounts.setPlacements) {
            global.CdEdgeMounts.setPlacements(data.record.placements);
          }
          populateSurfaceSelect();
          applyToTarget();
        }
      } catch (_e) {}
    }

    wire();
    populateSurfaceSelect();
    setExpanded(false);
    loadFromFirebase();

    return {
      getSurfaceStyles: function () {
        return currentSurfaceStyles;
      },
      setSurfaceStyles: function (styles) {
        currentSurfaceStyles =
          styles && typeof styles === 'object' && !Array.isArray(styles) ? Object.assign({}, styles) : {};
        populateSurfaceSelect();
        if (expanded) loadEditorForSurface();
        applyToTarget();
      },
      reload: loadFromFirebase,
      applyToTarget: applyToTarget,
    };
  }

  global.DecisioningSurfaceStylesPanel = { CACHE_BUST: CACHE_BUST, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
