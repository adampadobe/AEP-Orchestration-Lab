/**
 * AJO pipeline iframe — apply industry labels to cloned journey/path data + profile hero copy.
 * Expects window.__AEP_SF_JOURNEYS_BASE / __AEP_SF_PATHS_BASE (snapshot from inline script)
 * and window.AEP_PIPELINE_INDUSTRY_LABELS from ajo-pipeline-industry-labels.js.
 * Business impact (#impact): baseline captured on first apply (before mutations), same pattern as profileHub.
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
