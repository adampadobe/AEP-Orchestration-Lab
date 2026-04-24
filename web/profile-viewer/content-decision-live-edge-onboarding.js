/**
 * Decisioning lab (Edge) — first-run wizard for sandboxes without datastream + Launch + target URL.
 * Dismiss for this browser tab only (sessionStorage); returns on next visit until lab is configured.
 */
(function (global) {
  'use strict';

  var OVERLAY_ID = 'cdEdgeOnboardingOverlay';
  var SESSION_PREFIX = 'cdEdgeLabOnboardingDefer_';

  function el(id) {
    return document.getElementById(id);
  }

  function sandboxSlug() {
    try {
      if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
        var s = String(AepGlobalSandbox.getSandboxName() || '').trim().toLowerCase();
        return s ? s.replace(/[^a-z0-9._-]+/g, '_').slice(0, 120) : '_no_sandbox_';
      }
    } catch (e) {}
    return '_no_sandbox_';
  }

  function deferKey() {
    return SESSION_PREFIX + sandboxSlug();
  }

  function isDeferred() {
    try {
      return sessionStorage.getItem(deferKey()) === '1';
    } catch (e) {
      return false;
    }
  }

  function setDeferred() {
    try {
      sessionStorage.setItem(deferKey(), '1');
    } catch (e) {}
  }

  function isLabConfigured() {
    return typeof CdLabUi !== 'undefined' && CdLabUi.isLabEdgeConfigured && CdLabUi.isLabEdgeConfigured();
  }

  function defaultTargetPageUrl() {
    try {
      return global.location.origin + global.location.pathname;
    } catch (e2) {
      return '';
    }
  }

  function syncWizardInputsFromForm(root) {
    if (!root) return;
    [['edgeConfigId', 'cdOnbEdgeConfigId'], ['cdLabLaunchUrl', 'cdOnbLaunchUrl'], ['cdLabTargetPageUrl', 'cdOnbTargetUrl'], ['cdLabTagsProperty', 'cdOnbTagsProperty']].forEach(function (pair) {
      var formEl = el(pair[0]);
      var w = root.querySelector('#' + pair[1]);
      if (formEl && w) w.value = formEl.value || '';
    });
  }

  function syncFormFromWizard(root) {
    if (!root) return;
    [['edgeConfigId', 'cdOnbEdgeConfigId'], ['cdLabLaunchUrl', 'cdOnbLaunchUrl'], ['cdLabTargetPageUrl', 'cdOnbTargetUrl'], ['cdLabTagsProperty', 'cdOnbTagsProperty']].forEach(function (pair) {
      var formEl = el(pair[0]);
      var w = root.querySelector('#' + pair[1]);
      if (formEl && w) formEl.value = w.value || '';
    });
    ['edgeConfigId', 'cdLabLaunchUrl', 'cdLabTargetPageUrl'].forEach(function (id) {
      var n = el(id);
      if (n) n.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (typeof CdLabUi !== 'undefined' && CdLabUi.refreshConfigBadge) CdLabUi.refreshConfigBadge();
  }

  var steps = [
    {
      title: 'Welcome — what you are wiring up',
      body:
        '<p class="cd-onb-lead">This lab loads <strong>Adobe Experience Platform Web SDK</strong> from <strong>Tags</strong>, sends <code>sendEvent</code> to the <strong>Edge Network</strong>, and paints <strong>Experience Decisioning</strong> propositions into the preview areas.</p>' +
        '<p class="cd-onb-p">You will touch three places in Adobe’s UI — in order:</p>' +
        '<ol class="cd-onb-ol">' +
        '<li><strong>Channel (Data Collection)</strong> — a <strong>datastream</strong> for this sandbox with AEP + AJO + Personalization services enabled.</li>' +
        '<li><strong>Experience Decisioning / code-based</strong> — a <strong>Web channel</strong> whose <strong>app surfaces</strong> use URIs like <code>web://your-host/your-path#Fragment</code> that match this lab’s placement fragments.</li>' +
        '<li><strong>Journey / campaign (AJO)</strong> — an <strong>inbound</strong> or <strong>journey</strong> action that delivers an experience to those surfaces, published with consent in scope.</li>' +
        '</ol>' +
        '<p class="cd-onb-hint">The steps ahead spell out exactly where to click. Use <strong>Next</strong> when you have done each block in Adobe; the last step copies values into <strong>Workflow &amp; controls</strong> at the bottom of this page.</p>',
      checks: [],
    },
    {
      title: 'Step 1 — Datastream (channel level)',
      body:
        '<p class="cd-onb-p">In <strong>Adobe Experience Cloud</strong> open <strong>Data Collection</strong> (or your Demo Sandbox Network DSN portal), pick your <strong>sandbox</strong>, then <strong>Datastreams</strong>.</p>' +
        '<ol class="cd-onb-ol">' +
        '<li>Create or select a datastream mapped to the <strong>same AEP sandbox</strong> as this Profile Viewer (check the sandbox name in the header / Workflow drawer).</li>' +
        '<li>Under services, enable <strong>Adobe Experience Platform</strong>, <strong>Adobe Journey Optimizer</strong>, and <strong>Personalization</strong> / Edge where offered — the Web SDK needs Edge + AJO signals for code-based experiences.</li>' +
        '<li>Copy the <strong>Datastream ID</strong> (UUID). You will paste it in the final technical step.</li>' +
        '</ol>',
      checks: [{ id: 'c1', label: 'I created or verified a datastream for this sandbox with the right services.' }],
    },
    {
      title: 'Step 2 — Tags + Web SDK (Launch embed)',
      body:
        '<p class="cd-onb-p">In <strong>Adobe Experience Platform</strong> → <strong>Data Collection</strong> → <strong>Tags</strong>, open the <strong>property</strong> you use for demos.</p>' +
        '<ol class="cd-onb-ol">' +
        '<li>Add or edit an <strong>Adobe Experience Platform Web SDK</strong> extension.</li>' +
        '<li>Set the <strong>Datastream</strong> to the UUID from step 1 (sandbox must match).</li>' +
        '<li>Open the <strong>Environments</strong> tab, use the <strong>Development</strong> (or appropriate) embed, and copy the <strong>Launch script URL</strong> (the <code>https://assets.adobedtm.com/…</code> script).</li>' +
        '</ol>' +
        '<p class="cd-onb-hint">You can paste either the bare URL or the full <code>&lt;script src="…"&gt;</code> tag — the lab will clean it up.</p>',
      checks: [{ id: 'c2', label: 'I have a Launch embed URL from the Web SDK extension for this datastream.' }],
    },
    {
      title: 'Step 3 — AJO Web channel & surfaces (Experience Decisioning level)',
      body:
        '<p class="cd-onb-p">In <strong>Journey Optimizer</strong> go to <strong>Channels</strong> → <strong>Web</strong> (or <strong>Code-based experiences</strong> depending on your org’s menu).</p>' +
        '<ol class="cd-onb-ol">' +
        '<li>Create or open a <strong>Web / code-based</strong> channel configuration tied to the same sandbox.</li>' +
        '<li>Add <strong>app surfaces</strong> (placements) whose URIs match what this lab sends. This page uses <strong>surfaces</strong> mode: each placement becomes <code>web://</code> + this site’s host + this page path + <code>#</code> + <strong>fragment</strong> (default fragments include <code>TopRibbon</code>, <code>hero-banner</code>, <code>ContentCardContainer</code> — you can change them later under Workflow).</li>' +
        '<li>Example surface URI: <code class="cd-onb-code" id="cdOnbSurfaceExample"></code></li>' +
        '<li>Save/publish the channel so AJO knows these surfaces exist.</li>' +
        '</ol>',
      checks: [{ id: 'c3', label: 'My AJO Web/code-based surfaces use the same host, path, and #fragments as this lab.' }],
    },
    {
      title: 'Step 4 — Campaign / journey (AJO delivery level)',
      body:
        '<p class="cd-onb-p">Still in <strong>Journey Optimizer</strong>:</p>' +
        '<ol class="cd-onb-ol">' +
        '<li>Create or open a <strong>campaign</strong> or <strong>journey</strong> that targets your Web channel.</li>' +
        '<li>Add an action that delivers an <strong>Experience Decisioning</strong> or <strong>inbound</strong> / <strong>web</strong> experience to the surfaces from step 3 (hero, ribbon, content card, etc.).</li>' +
        '<li>Attach the correct <strong>offer / decision policy</strong> or content template, check <strong>consent</strong> / marketing preferences, then <strong>activate / publish</strong>.</li>' +
        '<li>Wait until the activity shows as live — Edge will not return propositions until AJO has something eligible for the profile you test with.</li>' +
        '</ol>',
      checks: [{ id: 'c4', label: 'I published an AJO action that targets those surfaces for a test profile.' }],
    },
    {
      title: 'Step 5 — Paste technical values (fills Workflow & controls)',
      body:
        '<p class="cd-onb-p">These fields update the hidden <strong>Decisioning lab setup</strong> form. They are saved when you click <strong>Save lab configuration</strong> on the next step.</p>' +
        '<div class="cd-onb-fields">' +
        '<label for="cdOnbEdgeConfigId">Datastream ID</label>' +
        '<input id="cdOnbEdgeConfigId" type="text" autocomplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />' +
        '<label for="cdOnbLaunchUrl">Launch script URL</label>' +
        '<input id="cdOnbLaunchUrl" type="text" autocomplete="off" spellcheck="false" placeholder="https://assets.adobedtm.com/…" />' +
        '<label for="cdOnbTargetUrl">Target page URL (Tags rule / surfaces scope)</label>' +
        '<input id="cdOnbTargetUrl" type="url" autocomplete="off" spellcheck="false" placeholder="https://…" />' +
        '<p class="cd-onb-row-btns"><button type="button" class="secondary cd-onb-use-page-url" id="cdOnbUsePageUrlBtn">Use this page as target URL</button></p>' +
        '<label for="cdOnbTagsProperty">Tags property (optional, for Launch preview/publish tools)</label>' +
        '<input id="cdOnbTagsProperty" type="text" autocomplete="off" placeholder="PR123… or property name" />' +
        '</div>',
      checks: [{ id: 'c5', label: 'I pasted the real Datastream ID and Launch URL from Adobe (not placeholders).' }],
    },
    {
      title: 'Step 6 — Save & close',
      body:
        '<p class="cd-onb-p">We will write these values to <strong>Firebase</strong> for the current sandbox (same as <strong>Save lab configuration</strong> in Workflow). You must be signed in (anonymous is enough).</p>' +
        '<ul class="cd-onb-ul">' +
        '<li>After save, move the pointer to the <strong>bottom edge</strong> to open <strong>Workflow &amp; controls</strong> anytime.</li>' +
        '<li>Use <strong>Run content decision</strong> when Launch has finished loading.</li>' +
        '</ul>' +
        '<p class="cd-onb-status" id="cdOnbSaveMsg" role="status" aria-live="polite"></p>',
      checks: [{ id: 'c6', label: 'I am ready to save this sandbox’s lab configuration.' }],
    },
  ];

  var overlayEl = null;
  var stepIndex = 0;
  var escapeHandler = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    var wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.className = 'cd-onboarding-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'cdOnbTitle');
    wrap.innerHTML =
      '<div class="cd-onboarding-backdrop" data-cd-onb-backdrop></div>' +
      '<div class="cd-onboarding-card">' +
      '<div class="cd-onboarding-head">' +
      '<p class="cd-onboarding-kicker">First-time setup</p>' +
      '<h2 id="cdOnbTitle" class="cd-onboarding-title"></h2>' +
      '<p class="cd-onboarding-progress"><span id="cdOnbStepNum"></span> of ' +
      steps.length +
      '</p>' +
      '</div>' +
      '<div class="cd-onboarding-body" id="cdOnbBody"></div>' +
      '<div class="cd-onboarding-foot">' +
      '<button type="button" class="secondary" id="cdOnbBack">Back</button>' +
      '<div class="cd-onboarding-foot-right">' +
      '<button type="button" class="quiet" id="cdOnbLater">I’ll configure this later</button>' +
      '<button type="button" class="primary" id="cdOnbNext">Next</button>' +
      '</div></div></div>';
    wrap.hidden = true;
    document.body.appendChild(wrap);
    overlayEl = wrap;

    wrap.querySelector('[data-cd-onb-backdrop]').addEventListener('click', function () {
      /* ignore backdrop click — force explicit Later */
    });
    el('cdOnbBack').addEventListener('click', onBack);
    el('cdOnbNext').addEventListener('click', onNext);
    el('cdOnbLater').addEventListener('click', onLater);

    return wrap;
  }

  function renderStep() {
    ensureOverlay();
    var s = steps[stepIndex];
    el('cdOnbTitle').textContent = s.title;
    el('cdOnbStepNum').textContent = 'Step ' + (stepIndex + 1);
    var body = el('cdOnbBody');
    var checksHtml = (s.checks || [])
      .map(function (c) {
        return (
          '<label class="cd-onb-check">' +
          '<input type="checkbox" class="cd-onb-cb" id="' +
          c.id +
          '" /> ' +
          '<span>' +
          c.label +
          '</span></label>'
        );
      })
      .join('');
    body.innerHTML = s.body + (checksHtml ? '<div class="cd-onb-checks">' + checksHtml + '</div>' : '');

    var ex = el('cdOnbSurfaceExample');
    if (ex) {
      try {
        var host = global.location.host;
        var path = (global.location.pathname || '').split('?')[0];
        ex.textContent = 'web://' + host + path + '#hero-banner';
      } catch (e3) {
        ex.textContent = 'web://your-host/profile-viewer/content-decision-live-edge.html#hero-banner';
      }
    }

    var useBtn = el('cdOnbUsePageUrlBtn');
    if (useBtn) {
      useBtn.addEventListener('click', function () {
        var t = el('cdOnbTargetUrl');
        if (t) t.value = defaultTargetPageUrl();
      });
    }

    syncWizardInputsFromForm(overlayEl);
    wireWizardFieldSync();

    var back = el('cdOnbBack');
    var next = el('cdOnbNext');
    if (back) back.hidden = stepIndex === 0;
    if (next) next.textContent = stepIndex === steps.length - 1 ? 'Save lab configuration' : 'Next';

    next.disabled = !stepChecksOk();
    body.querySelectorAll('.cd-onb-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        next.disabled = !stepChecksOk();
      });
    });

    try {
      next.focus();
    } catch (e4) {}
  }

  function wireWizardFieldSync() {
    if (!overlayEl) return;
    ['cdOnbEdgeConfigId', 'cdOnbLaunchUrl', 'cdOnbTargetUrl', 'cdOnbTagsProperty'].forEach(function (wid) {
      var w = el(wid);
      if (!w) return;
      var map = {
        cdOnbEdgeConfigId: 'edgeConfigId',
        cdOnbLaunchUrl: 'cdLabLaunchUrl',
        cdOnbTargetUrl: 'cdLabTargetPageUrl',
        cdOnbTagsProperty: 'cdLabTagsProperty',
      };
      var fid = map[wid];
      w.addEventListener('input', function () {
        var f = el(fid);
        if (f) f.value = w.value;
        if (fid !== 'cdLabTagsProperty') {
          if (f) f.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof CdLabUi !== 'undefined' && CdLabUi.refreshConfigBadge) CdLabUi.refreshConfigBadge();
      });
    });
  }

  function stepChecksOk() {
    var s = steps[stepIndex];
    if (!s.checks || !s.checks.length) return true;
    for (var i = 0; i < s.checks.length; i++) {
      var cb = el(s.checks[i].id);
      if (!cb || !cb.checked) return false;
    }
    return true;
  }

  function onBack() {
    if (stepIndex > 0) {
      syncFormFromWizard(overlayEl);
      stepIndex--;
      renderStep();
    }
  }

  function onLater() {
    setDeferred();
    hide();
  }

  function onNext() {
    if (!stepChecksOk()) return;
    syncFormFromWizard(overlayEl);
    if (stepIndex < steps.length - 1) {
      stepIndex++;
      renderStep();
      return;
    }
    var msg = el('cdOnbSaveMsg');
    if (!isLabConfigured()) {
      if (msg) {
        msg.textContent = 'Fill Datastream ID, Launch URL, and Target URL before saving.';
        msg.className = 'cd-onb-status cd-onb-status--err';
      }
      return;
    }
    if (typeof CdLabUi === 'undefined' || !CdLabUi.saveLabConfigToFirebase) {
      if (msg) msg.textContent = 'Lab UI not ready — try Save in Workflow.';
      return;
    }
    var nextBtn = el('cdOnbNext');
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'Saving…';
    }
    CdLabUi.saveLabConfigToFirebase()
      .then(function (result) {
        if (!result || !result.ok) {
          if (msg) {
            msg.textContent = (result && result.error) || 'Save failed.';
            msg.className = 'cd-onb-status cd-onb-status--err';
          }
          return null;
        }
        if (msg) {
          msg.textContent = 'Saved. Closing wizard…';
          msg.className = 'cd-onb-status cd-onb-status--ok';
        }
        if (typeof global.CdEdgeLab !== 'undefined' && typeof global.CdEdgeLab.reinjectLaunch === 'function') {
          return global.CdEdgeLab.reinjectLaunch().catch(function () {}).then(function () {
            return result;
          });
        }
        return result;
      })
      .then(function (result) {
        if (!result || !result.ok) return;
        hide();
        try {
          sessionStorage.removeItem(deferKey());
        } catch (e5) {}
      })
      .catch(function (e) {
        if (msg) {
          msg.textContent = String((e && e.message) || e || 'Save failed');
          msg.className = 'cd-onb-status cd-onb-status--err';
        }
      })
      .finally(function () {
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.textContent = 'Save lab configuration';
        }
      });
  }

  function show() {
    if (isLabConfigured()) return;
    if (isDeferred()) return;
    stepIndex = 0;
    ensureOverlay();
    overlayEl.hidden = false;
    overlayEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cd-onboarding-open');
    renderStep();
    escapeHandler = function (ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onLater();
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  function hide() {
    if (!overlayEl) return;
    overlayEl.hidden = true;
    overlayEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cd-onboarding-open');
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
    }
  }

  function syncAfterConfigLoad() {
    if (isLabConfigured()) {
      hide();
      return;
    }
    if (isDeferred()) {
      hide();
      return;
    }
    show();
  }

  function initAfterBoot() {
    ensureOverlay();
    syncAfterConfigLoad();
  }

  global.CdEdgeOnboarding = {
    initAfterBoot: initAfterBoot,
    syncAfterConfigLoad: syncAfterConfigLoad,
  };
})(typeof window !== 'undefined' ? window : globalThis);
