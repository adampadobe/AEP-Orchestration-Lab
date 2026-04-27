/**
 * AJO pipeline iframe — apply industry labels to cloned journey/path data + profile hero copy.
 * Expects window.__AEP_SF_JOURNEYS_BASE / __AEP_SF_PATHS_BASE (snapshot from inline script)
 * and window.AEP_PIPELINE_INDUSTRY_LABELS from ajo-pipeline-industry-labels.js.
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

  function resetFlowUiAfterIndustryChange() {
    try {
      sfExpandedJourney = null;
      sfSelectedPath = null;
    } catch (e) { /* globals may not exist in other embed contexts */ }

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

    document.body.setAttribute('data-dce-industry', key);

    window.SF_JOURNEYS = clone(window.__AEP_SF_JOURNEYS_BASE);
    window.SF_PATHS = clone(window.__AEP_SF_PATHS_BASE);

    var labels = packs[key] || packs.media;

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
