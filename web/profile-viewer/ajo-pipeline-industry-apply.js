/**
 * AJO pipeline iframe — apply industry labels to cloned journey/path data + profile hero copy.
 * Expects window.__AEP_SF_JOURNEYS_BASE / __AEP_SF_PATHS_BASE (snapshot from inline script)
 * and window.AEP_PIPELINE_INDUSTRY_LABELS from ajo-pipeline-industry-labels.js.
 * Business impact (#impact): baseline captured on first apply (before mutations), same pattern as profileHub.
 * Journey prioritisation (#s2): baseline captured on first apply; `journeyPrioritisation` updates
 * funnel + formula legend; `rankedJourneys` updates the five ranked rows and explainer (HTML-safe).
 * Stage 3 (#s3): `nextBestPath` updates intro, AJO 101 callout, mini-canvas labels, path formula legend,
 * ranked path cards, and footer metrics; `fsi` omits `nextBestPath` and restores the HTML baseline.
 * Stages 4–6 (#s4–#s6): `channelOptimisation`, `sendTimeOptimisation`, `messagePersonalisation` retune tab
 * copy + matrices; `fsi` omits all three (same restore pattern as `nextBestPath`).
 * Decisioning controls (cascade view): `decisioningControls` on industry packs or
 * `window.AEP_PIPELINE_DECISIONING_CONTROLS` — chips + `SCENARIOS` mini-cards 01–06; `fsi` restores
 * `__AEP_DC_BASE_SNAPSHOT` baseline from the anatomy HTML.
 */
(function () {
  function migrateIndustryKey(k) {
    if (!k) return 'media';
    var leg = { telco: 'telecommunications', automotive: 'sports' };
    return leg[k] || k;
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var TAG_TONE_STYLES = {
    accent: 'background:var(--accent-soft);color:var(--accent)',
    teal: 'background:var(--teal-soft);color:var(--teal)',
    amber: 'background:var(--amber-soft);color:var(--amber)',
    coral: 'background:var(--coral-soft);color:var(--coral)',
    blue: 'background:var(--blue-soft);color:var(--blue)',
  };

  var ALLOWED_BAR_CLASS = { 'bar-red': 1, 'bar-blue': 1, 'bar-amber': 1, 'bar-teal': 1 };
  var ALLOWED_AG_TAG = { intent: 1, entity: 1, sentiment: 1 };

  var IMPACT_VALUE_TONE_COLOR = {
    accent: 'var(--accent)',
    teal: 'var(--teal)',
    amber: 'var(--amber)',
    blue: 'var(--blue)',
  };

  function impactNumberStyleAttr(tone) {
    var c = IMPACT_VALUE_TONE_COLOR[tone] ? IMPACT_VALUE_TONE_COLOR[tone] : IMPACT_VALUE_TONE_COLOR.accent;
    return 'color:' + c;
  }

  function ensureBusinessImpactBaseline() {
    if (window.__AEP_BUSINESS_IMPACT_BASE) return;
    try {
      var root = document.getElementById('impact');
      if (!root) {
        window.__AEP_BUSINESS_IMPACT_BASE = { sectionTitle: '', sectionDesc: '', gridHtml: '' };
        return;
      }
      var h2 = root.querySelector('h2.section-title');
      var desc = root.querySelector('p.section-desc');
      var grid = root.querySelector('.impact-grid');
      window.__AEP_BUSINESS_IMPACT_BASE = {
        sectionTitle: h2 ? h2.textContent : '',
        sectionDesc: desc ? desc.textContent : '',
        gridHtml: grid ? grid.innerHTML : '',
      };
    } catch (e) {
      window.__AEP_BUSINESS_IMPACT_BASE = { sectionTitle: '', sectionDesc: '', gridHtml: '' };
    }
  }

  function restoreBusinessImpactBaseline() {
    var b = window.__AEP_BUSINESS_IMPACT_BASE;
    if (!b) return;
    var root = document.getElementById('impact');
    if (!root) return;
    var h2 = root.querySelector('h2.section-title');
    var desc = root.querySelector('p.section-desc');
    var grid = root.querySelector('.impact-grid');
    if (h2 && b.sectionTitle != null) h2.textContent = b.sectionTitle;
    if (desc && b.sectionDesc != null) desc.textContent = b.sectionDesc;
    if (grid && b.gridHtml != null) grid.innerHTML = b.gridHtml;
  }

  var S2_LEG_DOT = ['journey', 'profile', 'external', 'business'];
  var S2_LEG_KEYS = ['s2-leg-base', 's2-leg-signal', 's2-leg-agentic', 's2-leg-strategic'];

  function s2RankedListEl(sec) {
    return sec.querySelector('[data-aep-jp="s2-ranked-list"]') || sec.querySelector('.s2-journey-list');
  }

  function ensureJourneyPrioritisationBaseline() {
    if (window.__AEP_JOURNEY_PRIORITISATION_BASE) return;
    var sec = document.getElementById('s2');
    if (!sec) {
      window.__AEP_JOURNEY_PRIORITISATION_BASE = null;
      return;
    }
    try {
      var intro = sec.querySelector('[data-aep-jp="s2-intro"]');
      var funnelDetails = [];
      for (var fi = 0; fi < 5; fi++) {
        var fd = sec.querySelector('[data-aep-jp="s2-funnel-' + fi + '"]');
        funnelDetails.push(fd ? fd.textContent : '');
      }
      var vt = sec.querySelector('[data-aep-jp="s2-value-term"]');
      var legs = S2_LEG_KEYS.map(function (k) {
        var el = sec.querySelector('[data-aep-jp="' + k + '"]');
        return el ? el.innerHTML : '';
      });
      var rankedTitle = sec.querySelector('[data-aep-jp="s2-ranked-title"]');
      var list = s2RankedListEl(sec);
      var rt = sec.querySelector('[data-aep-jp="s2-result-title"]');
      var rb = sec.querySelector('[data-aep-jp="s2-result-body"]');
      window.__AEP_JOURNEY_PRIORITISATION_BASE = {
        intro: intro ? intro.textContent : '',
        funnelDetails: funnelDetails,
        valueTerm: vt ? vt.textContent : '',
        legendHtml: legs,
        rankedTitle: rankedTitle ? rankedTitle.textContent : '',
        journeyListHtml: list ? list.innerHTML : '',
        resultTitle: rt ? rt.textContent : '',
        resultBodyHtml: rb ? rb.innerHTML : '',
      };
    } catch (e) {
      window.__AEP_JOURNEY_PRIORITISATION_BASE = null;
    }
  }

  function restoreJourneyPrioritisationBaseline() {
    var b = window.__AEP_JOURNEY_PRIORITISATION_BASE;
    if (!b) return;
    var sec = document.getElementById('s2');
    if (!sec) return;
    var intro = sec.querySelector('[data-aep-jp="s2-intro"]');
    if (intro && b.intro != null) intro.textContent = b.intro;
    for (var fi = 0; fi < 5; fi++) {
      var fd = sec.querySelector('[data-aep-jp="s2-funnel-' + fi + '"]');
      if (fd && b.funnelDetails && b.funnelDetails[fi] != null) fd.textContent = b.funnelDetails[fi];
    }
    var vt = sec.querySelector('[data-aep-jp="s2-value-term"]');
    if (vt && b.valueTerm != null) vt.textContent = b.valueTerm;
    S2_LEG_KEYS.forEach(function (k, i) {
      var el = sec.querySelector('[data-aep-jp="' + k + '"]');
      if (el && b.legendHtml && b.legendHtml[i] != null) el.innerHTML = b.legendHtml[i];
    });
    var rankedTitle = sec.querySelector('[data-aep-jp="s2-ranked-title"]');
    if (rankedTitle && b.rankedTitle != null) rankedTitle.textContent = b.rankedTitle;
    var list = s2RankedListEl(sec);
    if (list && b.journeyListHtml != null) list.innerHTML = b.journeyListHtml;
    var rt = sec.querySelector('[data-aep-jp="s2-result-title"]');
    var rb = sec.querySelector('[data-aep-jp="s2-result-body"]');
    if (rt && b.resultTitle != null) rt.textContent = b.resultTitle;
    if (rb && b.resultBodyHtml != null) rb.innerHTML = b.resultBodyHtml;
  }

  function s2LegendSpanHtml(dotClass, labelText) {
    return '<span class="ldot ' + dotClass + '"></span>' + escapeHtml(labelText);
  }

  function buildS2JourneyListHtml(valueMultSpoken) {
    var rows = window.SF_JOURNEYS;
    if (!rows || !rows.length) return '';
    var scores = ['345', '136', '95', '82', '61'];
    var widths = ['100%', '40%', '28%', '24%', '18%'];
    var opac = ['', ' style="opacity:.55"', ' style="opacity:.4"', ' style="opacity:.3"', ' style="opacity:.2"'];
    var parts = [];
    for (var i = 0; i < 5 && i < rows.length; i++) {
      var j = rows[i];
      var issCls = j.issue === 'retention' ? 'retention' : 'sales';
      var issText = j.issue === 'retention' ? 'Issue · Retention' : 'Issue · Sales';
      var mult = '×' + j.bankValue.toFixed(2) + ' ' + valueMultSpoken;
      if (i === 0) mult += ' · ×1.50 agentic';
      var sel = i === 0 ? ' selected' : '';
      parts.push(
        '<div class="s2-journey' +
          sel +
          '">\n    <div class="s2-jrank">' +
          (i + 1) +
          '</div>\n    <div class="s2-jbody">\n      <span class="s2-jissue ' +
          issCls +
          '">' +
          escapeHtml(issText) +
          '</span>\n      <div class="s2-jname">' +
          escapeHtml(j.name || '') +
          '</div>\n      <div class="s2-jdesc">' +
          escapeHtml(j.desc || '') +
          '</div>\n    </div>\n    <div class="s2-jscore-wrap">\n      <div class="s2-jscore">' +
          scores[i] +
          '</div>\n      <div class="bar-track"><div class="bar-fill bar-red" data-w="' +
          escapeHtml(widths[i]) +
          '"' +
          opac[i] +
          '></div></div>\n      <div class="s2-jmult">' +
          escapeHtml(mult) +
          '</div>\n    </div>\n  </div>'
      );
    }
    return parts.join('\n  ');
  }

  function rankedJourneyRowHtml(row, idx) {
    var issue = row.issue === 'retention' ? 'retention' : 'sales';
    var issText = issue === 'retention' ? 'Issue · Retention' : 'Issue · Sales';
    var sel = idx === 0 ? ' selected' : '';
    var w = row.barWidth || '100%';
    var op =
      row.barOpacity != null && row.barOpacity !== 1 ? ' style="opacity:' + row.barOpacity + '"' : '';
    var rank = row.rank != null ? row.rank : idx + 1;
    return (
      '<div class="s2-journey' +
      sel +
      '">\n    <div class="s2-jrank">' +
      escapeHtml(String(rank)) +
      '</div>\n    <div class="s2-jbody">\n      <span class="s2-jissue ' +
      issue +
      '">' +
      issText +
      '</span>\n      <div class="s2-jname">' +
      escapeHtml(row.title || '') +
      '</div>\n      <div class="s2-jdesc">' +
      escapeHtml(row.desc || '') +
      '</div>\n    </div>\n    <div class="s2-jscore-wrap">\n      <div class="s2-jscore">' +
      escapeHtml(row.score || '') +
      '</div>\n      <div class="bar-track"><div class="bar-fill bar-red" data-w="' +
      escapeHtml(w) +
      '"' +
      op +
      '></div></div>\n      <div class="s2-jmult">' +
      escapeHtml(row.multipliers || '') +
      '</div>\n    </div>\n  </div>'
    );
  }

  function applyRankedJourneys(rj) {
    if (!rj) return;
    var sec = document.getElementById('s2');
    if (!sec) return;
    var rankedTitle = sec.querySelector('[data-aep-jp="s2-ranked-title"]');
    if (rankedTitle && rj.heading != null) rankedTitle.textContent = rj.heading;
    var list = s2RankedListEl(sec);
    var rows = rj.rows || [];
    if (list && rows.length) {
      list.innerHTML = rows
        .map(function (row, i) {
          return rankedJourneyRowHtml(row, i);
        })
        .join('\n  ');
    }
    var ex = rj.selectedExplainer || {};
    var rt = sec.querySelector('[data-aep-jp="s2-result-title"]');
    if (rt && ex.title != null) rt.textContent = ex.title;
    var rb = sec.querySelector('[data-aep-jp="s2-result-body"]');
    if (rb) {
      var main = ex.body != null ? escapeHtml(ex.body) : '';
      var em = ex.bodyEm != null ? '<em>' + escapeHtml(ex.bodyEm) + '</em>' : '';
      rb.innerHTML = main + em;
    }
  }

  function applyJourneyPrioritisation(jp, skipRankedPanel) {
    if (!jp) return;
    var sec = document.getElementById('s2');
    if (!sec) return;
    var intro = sec.querySelector('[data-aep-jp="s2-intro"]');
    if (intro && jp.intro != null) intro.textContent = jp.intro;
    if (jp.funnelDetails && jp.funnelDetails.length) {
      for (var fi = 0; fi < 5; fi++) {
        var fd = sec.querySelector('[data-aep-jp="s2-funnel-' + fi + '"]');
        if (fd && jp.funnelDetails[fi] != null) fd.textContent = jp.funnelDetails[fi];
      }
    }
    var vt = sec.querySelector('[data-aep-jp="s2-value-term"]');
    if (vt && jp.valueTerm != null) vt.textContent = jp.valueTerm;
    var legTexts = [jp.legendBase, jp.legendSignal, jp.legendAgentic, jp.legendStrategic];
    S2_LEG_KEYS.forEach(function (k, i) {
      var el = sec.querySelector('[data-aep-jp="' + k + '"]');
      if (!el || legTexts[i] == null) return;
      el.innerHTML = s2LegendSpanHtml(S2_LEG_DOT[i], legTexts[i]);
    });
    if (skipRankedPanel) return;
    var rankedTitle = sec.querySelector('[data-aep-jp="s2-ranked-title"]');
    if (rankedTitle && jp.rankedTitle != null) rankedTitle.textContent = jp.rankedTitle;
    var spoken = jp.valueMultSpoken || 'bank value';
    var list = s2RankedListEl(sec);
    if (list) list.innerHTML = buildS2JourneyListHtml(spoken);
    var rt = sec.querySelector('[data-aep-jp="s2-result-title"]');
    var rb = sec.querySelector('[data-aep-jp="s2-result-body"]');
    if (rt && jp.resultTitle != null) rt.textContent = jp.resultTitle;
    if (rb && jp.resultBodyHtml != null) rb.innerHTML = jp.resultBodyHtml;
  }

  function applyBusinessImpact(bi) {
    if (!bi || !bi.cards || !bi.cards.length) return;
    var root = document.getElementById('impact');
    if (!root) return;
    var h2 = root.querySelector('h2.section-title');
    var desc = root.querySelector('p.section-desc');
    var grid = root.querySelector('.impact-grid');
    if (bi.sectionTitle != null && h2) h2.textContent = bi.sectionTitle;
    if (bi.sectionDesc != null && desc) desc.textContent = bi.sectionDesc;
    if (!grid) return;
    var cards = bi.cards.slice(0, 4);
    while (cards.length < 4) {
      cards.push({ value: '—', valueTone: 'accent', label: '', sub: '' });
    }
    var html = cards
      .map(function (c) {
        var tone = c.valueTone || 'accent';
        var styleAttr = impactNumberStyleAttr(tone);
        return (
          '<div class="impact-card"><div class="impact-number" style="' +
          styleAttr +
          '">' +
          escapeHtml(c.value) +
          '</div><div class="impact-label">' +
          escapeHtml(c.label) +
          '</div><div class="impact-sub">' +
          escapeHtml(c.sub) +
          '</div></div>'
        );
      })
      .join('');
    grid.innerHTML = html;
  }

  function segmentTagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return tags
      .map(function (t) {
        var tone = t.tone || 'accent';
        var style = TAG_TONE_STYLES[tone] || TAG_TONE_STYLES.accent;
        return '<span class="data-tag" style="' + style + '">' + escapeHtml(t.text) + '</span>';
      })
      .join('');
  }

  function eventsHtml(rows) {
    if (!rows || !rows.length) return '';
    return rows
      .map(function (r) {
        return (
          '<div class="data-row"><span class="data-key">' +
          escapeHtml(r.key) +
          '</span><span class="data-val" style="font-family:var(--font-body)">' +
          escapeHtml(r.text) +
          '</span></div>'
        );
      })
      .join('');
  }

  function supportHtml(s) {
    if (!s) return '';
    return (
      '<div class="data-row"><span class="data-key">Last call</span><span class="data-val">' +
      escapeHtml(s.lastCall || '') +
      '</span></div><div class="data-row"><span class="data-key">CSAT</span><span class="data-val">' +
      escapeHtml(s.csat || '') +
      '</span></div>'
    );
  }

  function propensityHtml(rows) {
    if (!rows || !rows.length) return '';
    return rows
      .map(function (r) {
        var w = r.w != null ? r.w : '';
        var cls = ALLOWED_BAR_CLASS[r.barClass] ? r.barClass : 'bar-red';
        return (
          '<div class="branch-prop-row"><span class="pp-name">' +
          escapeHtml(r.name) +
          '</span><div class="pp-bar"><div class="pp-bar-fill bar-fill ' +
          cls +
          '" data-w="' +
          escapeHtml(w) +
          '" style="width:' +
          escapeHtml(w) +
          '"></div></div><span class="pp-val">' +
          escapeHtml(r.val) +
          '</span></div>'
        );
      })
      .join('');
  }

  function agenticBodyHtml(a) {
    if (!a) return '';
    var tags = (a.tags || [])
      .map(function (t) {
        var cls = ALLOWED_AG_TAG[t.cls] ? t.cls : 'intent';
        return '<span class="ag-tag ' + cls + '">' + escapeHtml(t.text) + '</span>';
      })
      .join('');

    var docs = (a.docs || [])
      .map(function (d) {
        return (
          '<div class="ag-doc"><span class="ag-doc-icon">' +
          escapeHtml(d.icon) +
          '</span><span class="ag-doc-name">' +
          escapeHtml(d.name) +
          '</span><span class="ag-doc-meta">' +
          escapeHtml(d.meta) +
          '</span></div>'
        );
      })
      .join('');

    var nbrs = (a.neighbours || [])
      .map(function (n) {
        return (
          '<div class="ag-neighbour"><span class="ag-nbar"><span class="ag-nbar-fill" style="width:' +
          escapeHtml(n.w) +
          '"></span></span><span class="ag-nlabel">' +
          escapeHtml(n.label) +
          '</span><span class="ag-nval">' +
          escapeHtml(n.val) +
          '</span></div>'
        );
      })
      .join('');

    var quote =
      '<span class="ag-quote-mark">"</span>' +
      escapeHtml(a.quoteBefore || '') +
      '<em>' +
      escapeHtml(a.quoteEm || '') +
      '</em>' +
      escapeHtml(a.quoteAfter || '') +
      '<span class="ag-quote-mark">"</span>';

    return (
      '<div class="branch-title" style="color:var(--teal)">\n  Agentic &amp; semantic\n  <span class="branch-new-badge">NEW</span>\n</div>\n\n' +
      '<div class="ag-block">\n  <div class="ag-block-label">' +
      escapeHtml(a.voiceLabel || '') +
      '</div>\n  <div class="ag-quote">\n    ' +
      quote +
      '\n  </div>\n  <div class="ag-extracted">\n    ' +
      tags +
      '\n  </div>\n</div>\n\n' +
      '<div class="ag-block">\n  <div class="ag-block-label">' +
      escapeHtml(a.docsLabel || '') +
      '</div>\n' +
      docs +
      '\n</div>\n\n' +
      '<div class="ag-block">\n  <div class="ag-block-label">' +
      escapeHtml(a.neighboursLabel || '') +
      '</div>\n  <div class="ag-neighbours">\n' +
      nbrs +
      '\n  </div>\n</div>\n'
    );
  }

  function ensureProfileHubBaseline() {
    if (window.__AEP_PROFILE_HUB_BASE) return;
    try {
      var q = function (sel) {
        var el = document.querySelector(sel);
        return el ? el.innerHTML : '';
      };
      var agentEl = document.querySelector('.branch.b-agentic .branch-card-body');
      window.__AEP_PROFILE_HUB_BASE = {
        segments: q('.branch.b-segments .branch-detail'),
        events: q('.branch.b-events .branch-detail'),
        support: q('.branch.b-support .branch-detail'),
        propensity: q('.branch.b-propensity .branch-detail'),
        agenticBody: agentEl ? agentEl.innerHTML : '',
      };
    } catch (e) {
      window.__AEP_PROFILE_HUB_BASE = {
        segments: '',
        events: '',
        support: '',
        propensity: '',
        agenticBody: '',
      };
    }
  }

  function restoreProfileHubBaseline() {
    var b = window.__AEP_PROFILE_HUB_BASE;
    if (!b) return;
    var set = function (sel, html) {
      var el = document.querySelector(sel);
      if (el && html != null) el.innerHTML = html;
    };
    set('.branch.b-segments .branch-detail', b.segments);
    set('.branch.b-events .branch-detail', b.events);
    set('.branch.b-support .branch-detail', b.support);
    set('.branch.b-propensity .branch-detail', b.propensity);
    var card = document.querySelector('.branch.b-agentic .branch-card-body');
    if (card && b.agenticBody) card.innerHTML = b.agenticBody;
  }

  function applyProfileHub(ph) {
    if (!ph) return;
    var set = function (sel, html) {
      var el = document.querySelector(sel);
      if (!el || html == null) return;
      el.innerHTML = html;
    };
    set('.branch.b-segments .branch-detail', segmentTagsHtml(ph.segmentTags));
    set('.branch.b-events .branch-detail', eventsHtml(ph.events));
    set('.branch.b-support .branch-detail', supportHtml(ph.support));
    set('.branch.b-propensity .branch-detail', propensityHtml(ph.propensities));
    var card = document.querySelector('.branch.b-agentic .branch-card-body');
    if (card) card.innerHTML = agenticBodyHtml(ph.agentic);
  }

  var S3_LEG_DOT_CLASSES = ['journey', 'profile', 'external', 'business'];
  var ALLOWED_S3_PATH_TAG = { teal: 1, amber: 1, violet: 1, dim: 1 };

  function ensureNextBestPathBaseline() {
    if (window.__AEP_NEXT_BEST_PATH_BASE) return;
    var sec = document.getElementById('s3');
    if (!sec) {
      window.__AEP_NEXT_BEST_PATH_BASE = null;
      return;
    }
    try {
      var qText = function (hook) {
        var el = sec.querySelector('[data-aep-nbp="' + hook + '"]');
        return el ? el.textContent : '';
      };
      var qHtml = function (hook) {
        var el = sec.querySelector('[data-aep-nbp="' + hook + '"]');
        return el ? el.innerHTML : '';
      };
      var branchStats = [];
      for (var bi = 1; bi <= 4; bi++) {
        var st = sec.querySelector('[data-aep-nbp="canvas-b' + bi + '-stat"]');
        branchStats.push({
          html: st ? st.innerHTML : '',
          winner: st ? st.classList.contains('winner') : false,
        });
      }
      var legends = [];
      for (var li = 0; li < 4; li++) {
        var lg = sec.querySelector('[data-aep-nbp="s3-leg-' + li + '"]');
        legends.push(lg ? lg.innerHTML : '');
      }
      var list = sec.querySelector('[data-aep-nbp="s3-path-list"]');
      var cbar = sec.querySelector('[data-aep-nbp="s3-foot-conv-bar"]');
      window.__AEP_NEXT_BEST_PATH_BASE = {
        intro: qText('s3-intro'),
        ajo101Title: qHtml('ajo101-title'),
        ajo101Body: qHtml('ajo101-body'),
        ajo101Why: qHtml('ajo101-why'),
        ajo101Source: qHtml('ajo101-source'),
        canvasEntry: qText('canvas-entry'),
        canvasSplit: qText('canvas-split'),
        branchNames: [1, 2, 3, 4].map(function (n) {
          return qText('canvas-b' + n + '-name');
        }),
        branchStats: branchStats,
        formulaPathTerm: qText('s3-formula-path-term'),
        legends: legends,
        rankedTitle: qText('s3-ranked-title'),
        pathListHtml: list ? list.innerHTML : '',
        footerPathsLabel: qText('s3-foot-paths-label'),
        footerPathsValue: qText('s3-foot-paths-value'),
        footerConvLabel: qText('s3-foot-conv-label'),
        footerConvValue: qText('s3-foot-conv-value'),
        footerConvBarW: cbar ? cbar.getAttribute('data-w') || '' : '',
        footerLiftLabel: qText('s3-foot-lift-label'),
        footerLiftValue: qText('s3-foot-lift-value'),
      };
    } catch (e) {
      window.__AEP_NEXT_BEST_PATH_BASE = null;
    }
  }

  function restoreNextBestPathBaseline() {
    var b = window.__AEP_NEXT_BEST_PATH_BASE;
    if (!b) return;
    var sec = document.getElementById('s3');
    if (!sec) return;
    var setT = function (hook, val) {
      var el = sec.querySelector('[data-aep-nbp="' + hook + '"]');
      if (el && val != null) el.textContent = val;
    };
    var setH = function (hook, val) {
      var el = sec.querySelector('[data-aep-nbp="' + hook + '"]');
      if (el && val != null) el.innerHTML = val;
    };
    setT('s3-intro', b.intro);
    setH('ajo101-title', b.ajo101Title);
    setH('ajo101-body', b.ajo101Body);
    setH('ajo101-why', b.ajo101Why);
    setH('ajo101-source', b.ajo101Source);
    setT('canvas-entry', b.canvasEntry);
    setT('canvas-split', b.canvasSplit);
    for (var bi = 1; bi <= 4; bi++) {
      setT('canvas-b' + bi + '-name', b.branchNames && b.branchNames[bi - 1]);
      var st = sec.querySelector('[data-aep-nbp="canvas-b' + bi + '-stat"]');
      if (st && b.branchStats && b.branchStats[bi - 1]) {
        var bs = b.branchStats[bi - 1];
        st.innerHTML = bs.html != null ? bs.html : '';
        st.classList.toggle('winner', !!bs.winner);
      }
    }
    setT('s3-formula-path-term', b.formulaPathTerm);
    for (var li = 0; li < 4; li++) {
      setH('s3-leg-' + li, b.legends && b.legends[li]);
    }
    setT('s3-ranked-title', b.rankedTitle);
    var list = sec.querySelector('[data-aep-nbp="s3-path-list"]');
    if (list && b.pathListHtml != null) list.innerHTML = b.pathListHtml;
    setT('s3-foot-paths-label', b.footerPathsLabel);
    setT('s3-foot-paths-value', b.footerPathsValue);
    setT('s3-foot-conv-label', b.footerConvLabel);
    setT('s3-foot-conv-value', b.footerConvValue);
    var cbar = sec.querySelector('[data-aep-nbp="s3-foot-conv-bar"]');
    if (cbar && b.footerConvBarW != null) {
      cbar.setAttribute('data-w', b.footerConvBarW);
      cbar.style.width = b.footerConvBarW;
    }
    setT('s3-foot-lift-label', b.footerLiftLabel);
    setT('s3-foot-lift-value', b.footerLiftValue);
    if (typeof window.drawAjoCanvas === 'function') setTimeout(window.drawAjoCanvas, 40);
  }

  function s3PathTagSpan(cls, text) {
    var c = ALLOWED_S3_PATH_TAG[cls] ? cls : 'dim';
    return '<span class="s3-tag ' + c + '">' + escapeHtml(text) + '</span>';
  }

  function buildS3PathListRow(p, rank) {
    var isW = p.winner != null ? !!p.winner : rank === 1;
    var ch = p.channel === 'assisted' ? 'assisted' : 'digital';
    var tagHtml = (p.tags || [])
      .map(function (t) {
        return s3PathTagSpan(t.cls, t.text);
      })
      .join('\n        ');
    return (
      '<div class="s3-path' +
      (isW ? ' winner' : '') +
      '">\n    <div class="s3-prank">' +
      rank +
      '</div>\n    <div class="s3-pbody">\n      <span class="s3-pchannel ' +
      ch +
      '">' +
      escapeHtml(p.channelLabel || '') +
      '</span>\n      <div class="s3-pname">' +
      escapeHtml(p.name || '') +
      '</div>\n      <div class="s3-pactions">' +
      escapeHtml(p.actions || '') +
      '</div>\n      <div class="s3-pcontrib">\n        ' +
      tagHtml +
      '\n      </div>\n    </div>\n    <div class="s3-pscore">' +
      escapeHtml(p.score || '') +
      '</div>\n  </div>'
    );
  }

  function applyNextBestPath(nbp) {
    if (!nbp) return;
    var sec = document.getElementById('s3');
    if (!sec) return;
    var aj = nbp.ajo101 || {};
    var cv = nbp.canvas || {};
    var fo = nbp.formula || {};
    var ft = nbp.footer || {};

    var setT = function (hook, val) {
      var el = sec.querySelector('[data-aep-nbp="' + hook + '"]');
      if (el && val != null) el.textContent = val;
    };
    var setH = function (hook, val) {
      var el = sec.querySelector('[data-aep-nbp="' + hook + '"]');
      if (el && val != null) el.innerHTML = val;
    };

    if (nbp.intro != null) setT('s3-intro', nbp.intro);
    if (aj.titleHtml != null) setH('ajo101-title', aj.titleHtml);
    if (aj.bodyHtml != null) setH('ajo101-body', aj.bodyHtml);
    if (aj.whyHtml != null) setH('ajo101-why', aj.whyHtml);
    if (aj.sourceHtml != null) setH('ajo101-source', aj.sourceHtml);

    if (cv.entryLabel != null) setT('canvas-entry', cv.entryLabel);
    if (cv.splitLabel != null) setT('canvas-split', cv.splitLabel);

    var branches = cv.branches || [];
    for (var bi = 0; bi < 4; bi++) {
      var br = branches[bi] || {};
      if (br.name != null) setT('canvas-b' + (bi + 1) + '-name', br.name);
      var st = sec.querySelector('[data-aep-nbp="canvas-b' + (bi + 1) + '-stat"]');
      if (st) {
        if (br.statHtml != null) st.innerHTML = br.statHtml;
        st.classList.toggle('winner', !!br.winner);
      }
    }

    if (fo.pathTerm != null) setT('s3-formula-path-term', fo.pathTerm);
    var legs = fo.legends || [];
    for (var li = 0; li < 4; li++) {
      var legEl = sec.querySelector('[data-aep-nbp="s3-leg-' + li + '"]');
      if (legEl && legs[li] != null) {
        var dotc = S3_LEG_DOT_CLASSES[li] || 'journey';
        legEl.innerHTML = '<span class="ldot ' + dotc + '"></span>' + escapeHtml(legs[li]);
      }
    }

    if (nbp.rankedPathsTitle != null) setT('s3-ranked-title', nbp.rankedPathsTitle);

    var plist = sec.querySelector('[data-aep-nbp="s3-path-list"]');
    if (plist && nbp.paths && nbp.paths.length) {
      plist.innerHTML = nbp.paths
        .map(function (p, i) {
          return buildS3PathListRow(p, i + 1);
        })
        .join('\n  ');
    }

    if (ft.pathsEvaluatedLabel != null) setT('s3-foot-paths-label', ft.pathsEvaluatedLabel);
    if (ft.pathsEvaluatedValue != null) setT('s3-foot-paths-value', ft.pathsEvaluatedValue);
    if (ft.conversionLabel != null) setT('s3-foot-conv-label', ft.conversionLabel);
    if (ft.conversionValue != null) setT('s3-foot-conv-value', ft.conversionValue);
    var cbar = sec.querySelector('[data-aep-nbp="s3-foot-conv-bar"]');
    if (cbar && ft.conversionBarW != null) {
      cbar.setAttribute('data-w', ft.conversionBarW);
      cbar.style.width = ft.conversionBarW;
    }
    if (ft.liftLabel != null) setT('s3-foot-lift-label', ft.liftLabel);
    if (ft.liftValue != null) setT('s3-foot-lift-value', ft.liftValue);

    if (typeof window.drawAjoCanvas === 'function') setTimeout(window.drawAjoCanvas, 40);
  }

  var S4_GROUP_CLASS = { inbound: 1, outbound: 1, agent: 1 };
  var S6_ITYPE_STYLE = {
    primary: 'background:var(--accent-soft);color:var(--accent);border-color:var(--accent-border)',
    variant: 'background:var(--amber-soft);color:var(--amber);border-color:var(--amber-border)',
    dynamic: 'background:var(--teal-soft);color:var(--teal);border-color:var(--teal-border)',
    crosssell: 'background:var(--blue-soft);color:var(--blue);border-color:var(--blue-border)',
    accentAlt: 'background:var(--coral-soft);color:var(--coral);border-color:var(--coral-border)',
  };

  function s4ChannelRowHtml(r) {
    var cls = 'channel-item';
    if (r.winner) cls += ' winner';
    if (r.dimmed) cls += ' dimmed';
    var metaCls = 's4-cmeta' + (r.metaWarn ? ' s4-cmeta-warn' : '');
    var meta =
      r.meta != null && r.meta !== ''
        ? '<span class="' + metaCls + '">' + escapeHtml(r.meta) + '</span>'
        : '';
    var barCls = r.barClass && /^bar-/.test(r.barClass) ? r.barClass : 'bar-teal';
    return (
      '<div class="' +
      cls +
      '">\n    <div class="channel-icon" style="' +
      escapeHtml(r.iconStyle || '') +
      '">' +
      escapeHtml(r.icon || '') +
      '</div>\n    <div class="channel-name">' +
      escapeHtml(r.name || '') +
      meta +
      '</div>\n    <div class="channel-bar"><div class="bar-track"><div class="bar-fill ' +
      barCls +
      '" data-w="' +
      escapeHtml(r.barW || '0%') +
      '"></div></div></div>\n    <div class="channel-score">' +
      escapeHtml(r.score || '') +
      '</div>\n  </div>'
    );
  }

  function s4GroupsHtmlFromSpec(groups) {
    if (!groups || !groups.length) return '';
    return groups
      .map(function (g) {
        var gcl = S4_GROUP_CLASS[g.cssClass] ? g.cssClass : 'inbound';
        var rows = (g.rows || [])
          .map(function (row) {
            return s4ChannelRowHtml(row);
          })
          .join('\n  ');
        return (
          '<div class="s4-channel-group ' +
          gcl +
          '">\n  <div class="s4-channel-group-label">' +
          escapeHtml(g.label || '') +
          '</div>\n  ' +
          rows +
          '\n</div>'
        );
      })
      .join('\n');
  }

  function s5SpectrumHtml(m) {
    var markers = (m.markers || [])
      .map(function (mk) {
        var cl = mk.cls === 'inbound' ? 'inbound' : 'outbound';
        return (
          '<div class="s5-spectrum-marker ' +
          cl +
          '" style="left:' +
          escapeHtml(mk.left || '0%') +
          '">' +
          escapeHtml(mk.label || '') +
          '</div>'
        );
      })
      .join('\n  ');
    return (
      '<div class="s5-spectrum-bar"></div>\n  <div class="s5-spectrum-end left">\n    <div class="s5-spectrum-label">' +
      escapeHtml(m.scheduledLabel || '') +
      '</div>\n    <div class="s5-spectrum-detail">' +
      escapeHtml(m.scheduledDetail || '') +
      '</div>\n  </div>\n  <div class="s5-spectrum-end right">\n    <div class="s5-spectrum-label">' +
      escapeHtml(m.realtimeLabel || '') +
      '</div>\n    <div class="s5-spectrum-detail">' +
      escapeHtml(m.realtimeDetail || '') +
      '</div>\n  </div>\n  ' +
      markers
    );
  }

  function s5MetricsHtml(metrics) {
    if (!metrics || !metrics.length) return '';
    return metrics
      .map(function (x) {
        var bar = '';
        if (x.barW) {
          bar =
            '<div class="bar-track"><div class="bar-fill bar-teal" data-w="' +
            escapeHtml(x.barW) +
            '"></div></div>';
        }
        var vc = x.valueClass && /^[a-z-]+$/.test(x.valueClass) ? x.valueClass : 'teal';
        var valInner = x.valueHtml != null ? x.valueHtml : escapeHtml(x.value || '');
        return (
          '<div class="metric-card">\n<div class="metric-label">' +
          escapeHtml(x.label || '') +
          '</div>\n<div class="metric-value ' +
          vc +
          '">' +
          valInner +
          '</div>\n' +
          bar +
          '</div>'
        );
      })
      .join('\n');
  }

  function s6ItemsHtml(items) {
    return (items || [])
      .map(function (it) {
        var st = S6_ITYPE_STYLE[it.itypeStyle] ? S6_ITYPE_STYLE[it.itypeStyle] : S6_ITYPE_STYLE.primary;
        var meta =
          it.meta != null && it.meta !== ''
            ? '<span class="s6-imeta">' + escapeHtml(it.meta) + '</span>'
            : '';
        return (
          '<div class="s6-item' +
          (it.chosen ? ' chosen' : '') +
          '">\n  <div class="s6-itype" style="' +
          st +
          '">' +
          escapeHtml(it.itypeLabel || '') +
          '</div>\n  <div class="s6-iname">' +
          escapeHtml(it.name || '') +
          meta +
          '</div>\n  <div class="s6-iscore">' +
          escapeHtml(it.score != null ? String(it.score) : '') +
          '</div>\n</div>'
        );
      })
      .join('\n');
  }

  function ensureStages456Baseline() {
    if (window.__AEP_STAGES_456_BASE) return;
    function qText(sel) {
      var el = document.querySelector(sel);
      return el ? el.textContent : '';
    }
    function qHtml(sel) {
      var el = document.querySelector(sel);
      return el ? el.innerHTML : '';
    }
    try {
      window.__AEP_STAGES_456_BASE = {
        s4TabEyebrow: qText('[data-aep-s4-tab-eyebrow]'),
        s4TabTitle: qText('[data-aep-s4-tab-title]'),
        s4Title: qText('[data-aep-s4-title]'),
        s4Intro: qText('[data-aep-s4-intro]'),
        s4CardTitle: qText('[data-aep-s4-card-title]'),
        s4GroupsHtml: qHtml('[data-aep-s4-groups]'),
        s4BannerTitle: qText('[data-aep-s4-banner-title]'),
        s4BannerBody: qText('[data-aep-s4-banner-body]'),
        s5TabEyebrow: qText('[data-aep-s5-tab-eyebrow]'),
        s5TabTitle: qText('[data-aep-s5-tab-title]'),
        s5Title: qText('[data-aep-s5-title]'),
        s5Intro: qText('[data-aep-s5-intro]'),
        s5SpectrumCardTitle: qText('[data-aep-s5-spectrum-card-title]'),
        s5SpectrumHtml: qHtml('[data-aep-s5-spectrum]'),
        s5HeatmapCardTitle: qText('[data-aep-s5-heatmap-card-title]'),
        s5HeatmapCaptionHtml: qHtml('[data-aep-s5-heatmap-caption]'),
        s5MetricsHtml: qHtml('[data-aep-s5-metrics]'),
        s6TabEyebrow: qText('[data-aep-s6-tab-eyebrow]'),
        s6TabTitle: qText('[data-aep-s6-tab-title]'),
        s6Title: qText('[data-aep-s6-title]'),
        s6Intro: qText('[data-aep-s6-intro]'),
        s6SelectionCardTitle: qText('[data-aep-s6-selection-card-title]'),
        s6ItemListHtml: qHtml('[data-aep-s6-item-list]'),
        s6AssembledCardTitle: qText('[data-aep-s6-assembled-card-title]'),
        s6AssembledInnerHtml: qHtml('[data-aep-s6-assembled-body]'),
        s6BrandNote: qText('[data-aep-s6-brand-note]'),
        s6EndTitle: qText('[data-aep-s6-end-title]'),
        s6EndBody: qText('[data-aep-s6-end-body]'),
      };
    } catch (e) {
      window.__AEP_STAGES_456_BASE = null;
    }
  }

  function restoreStages456Baseline() {
    var b = window.__AEP_STAGES_456_BASE;
    if (!b) return;
    function setT(sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.textContent = val;
    }
    function setH(sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.innerHTML = val;
    }
    setT('[data-aep-s4-tab-eyebrow]', b.s4TabEyebrow);
    setT('[data-aep-s4-tab-title]', b.s4TabTitle);
    setT('[data-aep-s4-title]', b.s4Title);
    setT('[data-aep-s4-intro]', b.s4Intro);
    setT('[data-aep-s4-card-title]', b.s4CardTitle);
    setH('[data-aep-s4-groups]', b.s4GroupsHtml);
    setT('[data-aep-s4-banner-title]', b.s4BannerTitle);
    setT('[data-aep-s4-banner-body]', b.s4BannerBody);
    setT('[data-aep-s5-tab-eyebrow]', b.s5TabEyebrow);
    setT('[data-aep-s5-tab-title]', b.s5TabTitle);
    setT('[data-aep-s5-title]', b.s5Title);
    setT('[data-aep-s5-intro]', b.s5Intro);
    setT('[data-aep-s5-spectrum-card-title]', b.s5SpectrumCardTitle);
    setH('[data-aep-s5-spectrum]', b.s5SpectrumHtml);
    setT('[data-aep-s5-heatmap-card-title]', b.s5HeatmapCardTitle);
    setH('[data-aep-s5-heatmap-caption]', b.s5HeatmapCaptionHtml);
    setH('[data-aep-s5-metrics]', b.s5MetricsHtml);
    setT('[data-aep-s6-tab-eyebrow]', b.s6TabEyebrow);
    setT('[data-aep-s6-tab-title]', b.s6TabTitle);
    setT('[data-aep-s6-title]', b.s6Title);
    setT('[data-aep-s6-intro]', b.s6Intro);
    setT('[data-aep-s6-selection-card-title]', b.s6SelectionCardTitle);
    setH('[data-aep-s6-item-list]', b.s6ItemListHtml);
    setT('[data-aep-s6-assembled-card-title]', b.s6AssembledCardTitle);
    setH('[data-aep-s6-assembled-body]', b.s6AssembledInnerHtml);
    setT('[data-aep-s6-brand-note]', b.s6BrandNote);
    setT('[data-aep-s6-end-title]', b.s6EndTitle);
    setT('[data-aep-s6-end-body]', b.s6EndBody);
  }

  function applyChannelOptimisation(co) {
    if (!co) return;
    var setT = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.textContent = val;
    };
    var setH = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.innerHTML = val;
    };
    if (co.tabEyebrow != null) setT('[data-aep-s4-tab-eyebrow]', co.tabEyebrow);
    if (co.tabTitle != null) setT('[data-aep-s4-tab-title]', co.tabTitle);
    if (co.title != null) setT('[data-aep-s4-title]', co.title);
    if (co.intro != null) setT('[data-aep-s4-intro]', co.intro);
    if (co.cardTitle != null) setT('[data-aep-s4-card-title]', co.cardTitle);
    if (co.groups && co.groups.length) setH('[data-aep-s4-groups]', s4GroupsHtmlFromSpec(co.groups));
    if (co.resultTitle != null) setT('[data-aep-s4-banner-title]', co.resultTitle);
    if (co.resultBody != null) setT('[data-aep-s4-banner-body]', co.resultBody);
  }

  function applySendTimeOptimisation(st) {
    if (!st) return;
    var setT = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.textContent = val;
    };
    var setH = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.innerHTML = val;
    };
    if (st.tabEyebrow != null) setT('[data-aep-s5-tab-eyebrow]', st.tabEyebrow);
    if (st.tabTitle != null) setT('[data-aep-s5-tab-title]', st.tabTitle);
    if (st.title != null) setT('[data-aep-s5-title]', st.title);
    if (st.intro != null) setT('[data-aep-s5-intro]', st.intro);
    if (st.spectrumCardTitle != null) setT('[data-aep-s5-spectrum-card-title]', st.spectrumCardTitle);
    if (st.spectrum) setH('[data-aep-s5-spectrum]', s5SpectrumHtml(st.spectrum));
    if (st.heatmapCardTitle != null) setT('[data-aep-s5-heatmap-card-title]', st.heatmapCardTitle);
    if (st.heatmapCaptionHtml != null) setH('[data-aep-s5-heatmap-caption]', st.heatmapCaptionHtml);
    if (st.metrics && st.metrics.length) setH('[data-aep-s5-metrics]', s5MetricsHtml(st.metrics));
  }

  function applyMessagePersonalisation(mp) {
    if (!mp) return;
    var setT = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.textContent = val;
    };
    var setH = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val != null) el.innerHTML = val;
    };
    if (mp.tabEyebrow != null) setT('[data-aep-s6-tab-eyebrow]', mp.tabEyebrow);
    if (mp.tabTitle != null) setT('[data-aep-s6-tab-title]', mp.tabTitle);
    if (mp.title != null) setT('[data-aep-s6-title]', mp.title);
    if (mp.intro != null) setT('[data-aep-s6-intro]', mp.intro);
    if (mp.selectionCardTitle != null) setT('[data-aep-s6-selection-card-title]', mp.selectionCardTitle);
    if (mp.items && mp.items.length) setH('[data-aep-s6-item-list]', s6ItemsHtml(mp.items));
    if (mp.assembledCardTitle != null) setT('[data-aep-s6-assembled-card-title]', mp.assembledCardTitle);
    if (mp.subject != null || mp.bodyHtml != null || mp.cta != null) {
      var subj = escapeHtml(mp.subject || '');
      var body = mp.bodyHtml != null ? mp.bodyHtml : '';
      var cta = escapeHtml(mp.cta || '');
      setH(
        '[data-aep-s6-assembled-body]',
        '<div class="subject">' + subj + '</div>\n<div class="body">' + body + '</div>\n<span class="message-cta">' + cta + '</span>'
      );
    }
    if (mp.brandNote != null) setT('[data-aep-s6-brand-note]', mp.brandNote);
    if (mp.endBannerTitle != null) setT('[data-aep-s6-end-title]', mp.endBannerTitle);
    if (mp.endBannerBody != null) setT('[data-aep-s6-end-body]', mp.endBannerBody);
  }

  var SF_DC_PROP_TO_JID = { refi: 'mortgage', invest: 'invest', card: 'card', retain: 'retention' };

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function ensureDecisioningControlsBaseline() {
    if (window.__AEP_DECISIONING_CONTROLS_BASE) return;
    var snap = window.__AEP_DC_BASE_SNAPSHOT;
    if (!snap || !window.__AEP_CASCADE_SCENARIOS) {
      window.__AEP_DECISIONING_CONTROLS_BASE = null;
      return;
    }
    try {
      window.__AEP_DECISIONING_CONTROLS_BASE = {
        attrRowHtml: snap.attrRowHtml,
        propRowHtml: snap.propRowHtml,
        scenarios: JSON.parse(snap.scenariosJson),
        state: JSON.parse(snap.stateJson),
      };
    } catch (e) {
      window.__AEP_DECISIONING_CONTROLS_BASE = null;
    }
  }

  function restoreDcUiState(s) {
    var st = window.__AEP_CASCADE_STATE;
    if (!st || !s) return;
    st.attrs.clear();
    (s.attrs || []).forEach(function (a) {
      st.attrs.add(a);
    });
    st.prop = s.prop || 'refi';
    st.formula = s.formula || 'balanced';
    document.querySelectorAll('#dcAttrRow [data-attr]').forEach(function (el) {
      var da = el.getAttribute('data-attr');
      el.classList.toggle('active', da && st.attrs.has(da));
    });
    document.querySelectorAll('#dcPropRow [data-prop]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-prop') === st.prop);
    });
    document.querySelectorAll('.cascade-controls [data-formula]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-formula') === st.formula);
    });
  }

  function restoreDecisioningControlsBaseline() {
    var b = window.__AEP_DECISIONING_CONTROLS_BASE;
    if (!b || !window.__AEP_CASCADE_SCENARIOS) return;
    var ar = document.getElementById('dcAttrRow');
    var pr = document.getElementById('dcPropRow');
    if (ar && b.attrRowHtml != null) ar.innerHTML = b.attrRowHtml;
    if (pr && b.propRowHtml != null) pr.innerHTML = b.propRowHtml;
    var scen = window.__AEP_CASCADE_SCENARIOS;
    var baseScen = b.scenarios;
    if (baseScen && scen) {
      ['refi', 'invest', 'card', 'retain'].forEach(function (k) {
        if (baseScen[k] != null) scen[k] = deepClone(baseScen[k]);
      });
    }
    window.__AEP_CASCADE_ATTR_LABELS = null;
    window.__AEP_CASCADE_CHANNEL_HINTS = null;
    restoreDcUiState(b.state);
    if (typeof window.__AEP_CASCADE_RENDER === 'function') window.__AEP_CASCADE_RENDER();
  }

  function syncCascadeScenariosFromSf() {
    var scen = window.__AEP_CASCADE_SCENARIOS;
    var sj = window.SF_JOURNEYS;
    var sp = window.SF_PATHS;
    if (!scen || !sj || !sp) return;
    Object.keys(SF_DC_PROP_TO_JID).forEach(function (pk) {
      var sc = scen[pk];
      if (!sc || !sc.journeys) return;
      for (var ji = 0; ji < sc.journeys.length && ji < sj.length; ji++) {
        if (sj[ji].name != null) sc.journeys[ji].name = sj[ji].name;
      }
      var jid = SF_DC_PROP_TO_JID[pk];
      var plist = sp[jid];
      if (!plist || !sc.paths) return;
      for (var pi = 0; pi < sc.paths.length && pi < plist.length; pi++) {
        if (plist[pi].name != null) sc.paths[pi].name = plist[pi].name;
      }
    });
  }

  function applyDecisioningControls(dc) {
    if (!dc || !window.__AEP_CASCADE_SCENARIOS) return;
    var ar = document.getElementById('dcAttrRow');
    var pr = document.getElementById('dcPropRow');
    if (dc.attrChipsHtml != null && ar) ar.innerHTML = dc.attrChipsHtml;
    if (dc.propChipsHtml != null && pr) pr.innerHTML = dc.propChipsHtml;
    if (dc.scenarios) {
      Object.keys(dc.scenarios).forEach(function (k) {
        if (window.__AEP_CASCADE_SCENARIOS[k] && dc.scenarios[k]) {
          window.__AEP_CASCADE_SCENARIOS[k] = deepClone(dc.scenarios[k]);
        }
      });
    }
    syncCascadeScenariosFromSf();
    window.__AEP_CASCADE_ATTR_LABELS = dc.attrLabels || null;
    window.__AEP_CASCADE_CHANNEL_HINTS = dc.channelHints || null;
    if (dc.stateDefaults) restoreDcUiState(dc.stateDefaults);
    if (typeof window.__AEP_CASCADE_RENDER === 'function') window.__AEP_CASCADE_RENDER();
  }

  function resetFlowUiAfterIndustryChange() {
    try {
      sfExpandedJourney = null;
      sfSelectedPath = null;
    } catch (e) {
      /* globals may not exist in other embed contexts */
    }

    var pi = document.getElementById('sfPathsIntro');
    if (pi) pi.style.display = '';
    var ci = document.getElementById('sfChannelsIntro');
    if (ci) ci.style.display = '';
    ['sfPhase3Panel', 'sfPhase4Panel', 'sfPhase5Panel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('locked');
    });
    ['sfPhase2', 'sfPhase3', 'sfPhase4', 'sfPhase5'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    var jList = document.querySelectorAll('.sf-journey.expanded');
    jList.forEach(function (el) {
      el.classList.remove('expanded');
    });
    var jSel = document.querySelectorAll('.sf-journey.selected');
    jSel.forEach(function (el) {
      el.classList.remove('selected');
    });
  }

  function aepPipelineApplyIndustry(rawKey) {
    var key = migrateIndustryKey(rawKey);
    var packs = window.AEP_PIPELINE_INDUSTRY_LABELS;
    if (!packs || !window.__AEP_SF_JOURNEYS_BASE || !window.__AEP_SF_PATHS_BASE) return;

    ensureProfileHubBaseline();
    ensureBusinessImpactBaseline();
    ensureJourneyPrioritisationBaseline();
    ensureNextBestPathBaseline();
    ensureStages456Baseline();

    document.body.setAttribute('data-dce-industry', key);

    window.SF_JOURNEYS = clone(window.__AEP_SF_JOURNEYS_BASE);
    window.SF_PATHS = clone(window.__AEP_SF_PATHS_BASE);

    var labels = packs[key] || packs.media;

    if (labels.profileHub) {
      applyProfileHub(labels.profileHub);
    } else {
      restoreProfileHubBaseline();
    }

    if (labels.businessImpact) {
      applyBusinessImpact(labels.businessImpact);
    } else {
      restoreBusinessImpactBaseline();
    }

    if (labels.profile) {
      var pr = labels.profile;
      document.querySelectorAll('.sf-avatar, .profile-avatar-lg').forEach(function (el) {
        el.textContent = pr.initials || '';
      });
      document.querySelectorAll('.sf-name, .profile-center-name').forEach(function (el) {
        el.textContent = pr.name || '';
      });
      var meta = document.querySelector('.sf-meta');
      if (meta && pr.meta != null) meta.textContent = pr.meta;
      var csub = document.querySelector('.profile-center-sub');
      if (csub && pr.centerSub != null) csub.textContent = pr.centerSub;
    }

    var hp = document.querySelector('.hero > p');
    if (hp && labels.heroP) hp.textContent = labels.heroP;

    if (labels.journeys && Array.isArray(labels.journeys)) {
      labels.journeys.forEach(function (patch, i) {
        if (!window.SF_JOURNEYS[i]) return;
        if (patch.name != null) window.SF_JOURNEYS[i].name = patch.name;
        if (patch.desc != null) window.SF_JOURNEYS[i].desc = patch.desc;
        if (patch.issue != null) window.SF_JOURNEYS[i].issue = patch.issue;
      });
    }

    if (labels.paths && typeof labels.paths === 'object') {
      Object.keys(labels.paths).forEach(function (jid) {
        var arr = labels.paths[jid];
        if (!window.SF_PATHS[jid] || !arr) return;
        arr.forEach(function (patch, i) {
          var p = window.SF_PATHS[jid][i];
          if (!p) return;
          if (patch.name != null) p.name = patch.name;
          if (patch.actions != null) p.actions = patch.actions;
          if (patch.desc != null) p.desc = patch.desc;
        });
      });
    }

    if (labels.journeyPrioritisation) {
      applyJourneyPrioritisation(labels.journeyPrioritisation, !!labels.rankedJourneys);
    } else {
      restoreJourneyPrioritisationBaseline();
    }
    if (labels.rankedJourneys) {
      applyRankedJourneys(labels.rankedJourneys);
    }

    if (labels.nextBestPath) {
      applyNextBestPath(labels.nextBestPath);
    } else {
      restoreNextBestPathBaseline();
    }

    if (
      labels.channelOptimisation &&
      labels.sendTimeOptimisation &&
      labels.messagePersonalisation
    ) {
      applyChannelOptimisation(labels.channelOptimisation);
      applySendTimeOptimisation(labels.sendTimeOptimisation);
      applyMessagePersonalisation(labels.messagePersonalisation);
    } else {
      restoreStages456Baseline();
    }

    ensureDecisioningControlsBaseline();
    if (key === 'fsi') {
      restoreDecisioningControlsBaseline();
    } else {
      var dcPack =
        (labels && labels.decisioningControls) ||
        (window.AEP_PIPELINE_DECISIONING_CONTROLS && window.AEP_PIPELINE_DECISIONING_CONTROLS[key]);
      if (dcPack) {
        applyDecisioningControls(dcPack);
      } else {
        restoreDecisioningControlsBaseline();
      }
    }

    resetFlowUiAfterIndustryChange();

    if (typeof window.sfRender === 'function') window.sfRender();
    if (typeof window.sfUpdateStepper === 'function') window.sfUpdateStepper();
    if (typeof window.sfDrawConnectors === 'function') setTimeout(window.sfDrawConnectors, 40);
  }

  window.aepPipelineApplyIndustry = aepPipelineApplyIndustry;

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.source !== 'aep-profile-viewer' || d.type !== 'ja-v2-set-industry') return;
    aepPipelineApplyIndustry(d.industry);
  });
})();
