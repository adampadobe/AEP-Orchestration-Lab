/**
 * Customise dock: display name + team label for Experimentation Accelerator demo (native UI).
 * Hero first name: optional per-sandbox override; otherwise `/api/profile/consent` for the
 * most recent email identifier (same sandbox), then fallback default.
 * Storage: localStorage aepExpAccelUiPrefs JSON { [sandboxKey]: { displayNameOverride?, teamName, teamSelected?,
 *   expImg1..4, expTitle1..4, expSub1..4, heroDetailImg, ... } }.
 */
(function () {
  var LS = 'aepExpAccelUiPrefs';

  var DEFAULTS = {
    displayName: 'Tina',
    teamName: 'Adobe.com',
    opportunityIndustry: 'general',
  };

  /** Default copy for Top experiments rows (ACE… / subtitle). */
  var EXP_ROW_DEFAULTS = [
    { title: 'ACE0998 | US | TwP Modals', sub: 'Illustrator product page' },
    { title: 'ACE0916 | US | Catalog | AICS on Premiere page', sub: 'Premiere Pro page' },
    { title: 'ACE0918 | US | Catalog | AICS on Catalog page', sub: 'Acrobat DC page' },
    { title: 'ACE0930 | US | HP | Logged-out | SMB | AICS', sub: 'Photoshop product page' },
  ];

  var OPPORTUNITY_RATIONALE_COPY = {
    general: {
      body: 'Experiments analysis shows that making emotional appeals tend to lead to favorable outcomes. Previous experiments show higher click-through rates and <strong>increased revenue</strong> on landing pages for emotionally framed advertising than ones that lead with benefits vs. features.',
      subhead: 'Past experiments with higher revenue using emotional appeal treatment',
      intro: 'Try invoking emotions to make the offer more enticing. Instead of "Accomplish more with Acrobat Pro", explore examples like:',
      pills: [
        'Unlock a world of creative potential',
        'Unleash your full potential',
        'Bring your imagination to life',
        'Supercharge your creativity',
      ],
      rows: [
        { lift: '↑ 25.5%', title: 'Homepage headline experiment', desc: '"Turn ideas into outcomes" outperformed "Learn more about our solution" by 25.5% in revenue lift.' },
        { lift: '↑ 19.5%', title: 'Landing page value-message experiment', desc: '"Move faster with confidence" outperformed "Compare features today" by 19.5% in revenue lift.' },
        { lift: '↑ 15.5%', title: 'Email subject line experiment', desc: '"Build momentum with every step" outperformed "Get started with the basics" by 15.5% in revenue lift.' },
      ],
    },
    retail: {
      body: 'Retail experiments show emotional framing consistently drives stronger shopping intent. Campaigns that emphasize identity, confidence, and inspiration have produced higher engagement and <strong>increased revenue</strong> versus purely feature-led copy.',
      subhead: 'Past retail experiments with higher revenue from emotional appeal treatment',
      intro: 'Try emotionally framed retail messaging. Instead of "Shop the new collection", explore examples like:',
      pills: ['Find your signature look', 'Wear what moves you', 'Style that feels like you', 'Make every day feel iconic'],
      rows: [
        { lift: '↑ 24.8%', title: 'Seasonal homepage hero test', desc: '"Own your moment this season" outperformed "Explore spring arrivals" by 24.8% in revenue lift.' },
        { lift: '↑ 18.6%', title: 'Product listing banner test', desc: '"Feel confident in every fit" outperformed "Browse top-rated styles" by 18.6% in revenue lift.' },
        { lift: '↑ 14.9%', title: 'Abandoned cart email test', desc: '"Your next favorite look is waiting" outperformed "Complete your purchase now" by 14.9% in revenue lift.' },
      ],
    },
    financial: {
      body: 'Financial services experiments indicate reassurance-led emotional messaging improves consideration and conversion. Copy focused on peace of mind and control has delivered higher trust signals and <strong>increased revenue</strong> compared with product-spec-heavy messaging.',
      subhead: 'Past financial services experiments with higher revenue from emotional appeal treatment',
      intro: 'Try emotionally framed financial messaging. Instead of "Compare account benefits", explore examples like:',
      pills: ['Plan with confidence', 'Protect what matters most', 'Feel secure at every milestone', 'Build your future with clarity'],
      rows: [
        { lift: '↑ 22.1%', title: 'Investment landing page headline test', desc: '"Grow with confidence through every market cycle" outperformed "View portfolio options" by 22.1% in revenue lift.' },
        { lift: '↑ 17.4%', title: 'Savings product banner test', desc: '"Peace of mind starts with one smart step" outperformed "Open a high-yield account" by 17.4% in revenue lift.' },
        { lift: '↑ 13.8%', title: 'Credit card nurture email test', desc: '"Stay in control wherever life takes you" outperformed "Explore card features" by 13.8% in revenue lift.' },
      ],
    },
    healthcare: {
      body: 'Healthcare experiments show empathetic messaging increases engagement and action rates. Messaging that emphasizes confidence, care, and quality of life has produced better response and <strong>increased revenue</strong> than feature-first clinical copy.',
      subhead: 'Past healthcare experiments with higher revenue from emotional appeal treatment',
      intro: 'Try emotionally framed healthcare messaging. Instead of "Learn about treatment options", explore examples like:',
      pills: ['Care that supports your whole life', 'Feel better with every step', 'Support you can trust', 'Health outcomes that matter to you'],
      rows: [
        { lift: '↑ 21.3%', title: 'Service line homepage hero test', desc: '"Feel supported from first visit to recovery" outperformed "View available services" by 21.3% in revenue lift.' },
        { lift: '↑ 16.9%', title: 'Appointment booking page headline test', desc: '"Take the next step toward better health" outperformed "Book an appointment today" by 16.9% in revenue lift.' },
        { lift: '↑ 12.7%', title: 'Patient re-engagement email test', desc: '"Your wellness journey deserves momentum" outperformed "Schedule your follow-up" by 12.7% in revenue lift.' },
      ],
    },
    travel: {
      body: 'Travel and hospitality experiments show aspiration-led emotional copy drives stronger booking behavior. Messaging focused on anticipation, comfort, and memorable experiences delivers better engagement and <strong>increased revenue</strong> than logistics-only messaging.',
      subhead: 'Past travel and hospitality experiments with higher revenue from emotional appeal treatment',
      intro: 'Try emotionally framed travel messaging. Instead of "Book your next trip", explore examples like:',
      pills: ['Turn plans into unforgettable memories', 'Your next great escape starts here', 'Travel that feels effortless', 'Stay where every moment matters'],
      rows: [
        { lift: '↑ 23.6%', title: 'Destination campaign headline test', desc: '"Create stories worth retelling" outperformed "Discover top destinations" by 23.6% in revenue lift.' },
        { lift: '↑ 18.1%', title: 'Hotel booking page banner test', desc: '"Rest, recharge, and wake up inspired" outperformed "Book premium rooms now" by 18.1% in revenue lift.' },
        { lift: '↑ 14.2%', title: 'Loyalty reactivation email test', desc: '"Your next getaway is closer than you think" outperformed "Redeem your points today" by 14.2% in revenue lift.' },
      ],
    },
    technology: {
      body: 'Technology experiments show outcome-driven emotional messaging improves conversion for complex offerings. Messaging that highlights confidence, creativity, and progress has produced higher engagement and <strong>increased revenue</strong> versus feature-list positioning.',
      subhead: 'Past technology experiments with higher revenue from emotional appeal treatment',
      intro: 'Try emotionally framed technology messaging. Instead of "Explore product capabilities", explore examples like:',
      pills: ['Build what is next with confidence', 'Turn bold ideas into real outcomes', 'Create without limits', 'Move faster with momentum'],
      rows: [
        { lift: '↑ 25.1%', title: 'Product homepage headline test', desc: '"Build smarter, ship faster, stay ahead" outperformed "See platform capabilities" by 25.1% in revenue lift.' },
        { lift: '↑ 19.2%', title: 'Solution page value proposition test', desc: '"Empower every team to do their best work" outperformed "Compare technical features" by 19.2% in revenue lift.' },
        { lift: '↑ 15.4%', title: 'Lifecycle nurture email subject test', desc: '"Turn your roadmap into measurable wins" outperformed "Read the latest release notes" by 15.4% in revenue lift.' },
      ],
    },
  };

  function rowField(p, i, kind) {
    var def = EXP_ROW_DEFAULTS[i - 1] || { title: '', sub: '' };
    var key = kind === 'title' ? 'expTitle' + i : 'expSub' + i;
    if (!p || p[key] === undefined || p[key] === null) return def[kind];
    var s = String(p[key]).trim();
    return s.length ? s : def[kind];
  }

  function applyExperimentCustomisation(p) {
    var i;
    var raw = p && typeof p === 'object' ? p : {};
    for (i = 1; i <= 4; i++) {
      var titleEl = document.getElementById('expAccelExpTitle' + i);
      var subEl = document.getElementById('expAccelExpSub' + i);
      var imgEl = document.getElementById('expAccelExpImg' + i);
      if (titleEl) titleEl.textContent = rowField(raw, i, 'title');
      if (subEl) subEl.textContent = rowField(raw, i, 'sub');
      if (imgEl) {
        var u = raw['expImg' + i] != null ? String(raw['expImg' + i]).trim() : '';
        var thumb = imgEl.closest('.ajo-exp-thumb');
        if (u) {
          imgEl.src = u;
          imgEl.removeAttribute('hidden');
          if (thumb) thumb.classList.add('ajo-exp-thumb--custom');
        } else {
          imgEl.removeAttribute('src');
          imgEl.setAttribute('hidden', '');
          if (thumb) thumb.classList.remove('ajo-exp-thumb--custom');
        }
      }
    }
  }

  function applyHeroDetailImage(p) {
    var raw = p && typeof p === 'object' ? p : {};
    var img = document.getElementById('expAccelHeroDetailImg');
    var wrap = img && img.closest('.ajo-exp-leader-thumb');
    if (!img || !wrap) return;
    var u = raw.heroDetailImg != null ? String(raw.heroDetailImg).trim() : '';
    if (u) {
      img.src = u;
      wrap.classList.add('ajo-exp-leader-thumb--has-custom-img');
    } else {
      img.removeAttribute('src');
      wrap.classList.remove('ajo-exp-leader-thumb--has-custom-img');
    }
  }

  /** Email template / campaign preview heroes — Customise “Experiment 1 image URL” (treatment 1). */
  function applyEmailTemplateImages(p) {
    var raw = p && typeof p === 'object' ? p : {};
    var u = raw.expImg1 != null ? String(raw.expImg1).trim() : '';
    ['expAccelEmailTemplateHeroImg', 'expAccelEmailCampaignHeroImg'].forEach(function (id) {
      var img = document.getElementById(id);
      var wrap = img && img.closest('.ajo-email-hero-frame');
      if (!img) return;
      if (u) {
        img.src = u;
        img.removeAttribute('hidden');
        if (wrap) wrap.classList.add('ajo-email-hero-frame--has-img');
      } else {
        img.removeAttribute('src');
        img.setAttribute('hidden', '');
        if (wrap) wrap.classList.remove('ajo-email-hero-frame--has-img');
      }
    });
  }

  /** Results table treatment thumbnails (Homepage Hero experiment page) — same expImg1..4 URLs as Overview tiles */
  function applyResultsTableTreatmentImages(p) {
    var raw = p && typeof p === 'object' ? p : {};
    var i;
    for (i = 1; i <= 4; i++) {
      var imgEl = document.getElementById('expAccelResultTreatmentImg' + i);
      var thumb = imgEl && imgEl.closest('.ajo-result-thumb');
      if (!imgEl) continue;
      var u = raw['expImg' + i] != null ? String(raw['expImg' + i]).trim() : '';
      if (u) {
        imgEl.src = u;
        imgEl.removeAttribute('hidden');
        if (thumb) thumb.classList.add('ajo-result-thumb--has-img');
      } else {
        imgEl.removeAttribute('src');
        imgEl.setAttribute('hidden', '');
        if (thumb) thumb.classList.remove('ajo-result-thumb--has-img');
      }
    }
  }

  var lastResolvedFirstName = '';
  var fetchGen = 0;

  function sandboxKey(name) {
    var s = name != null ? String(name).trim() : '';
    return s || '_default';
  }

  function readAll() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeAll(obj) {
    try {
      localStorage.setItem(LS, JSON.stringify(obj));
    } catch (e) {}
    if (window.AepLabSandboxSync && typeof AepLabSandboxSync.notifyDirty === 'function') {
      AepLabSandboxSync.notifyDirty();
    }
  }

  function getForSandbox(sb) {
    var all = readAll();
    return all[sandboxKey(sb)] || null;
  }

  function saveForSandbox(sb, data) {
    var all = readAll();
    all[sandboxKey(sb)] = data;
    writeAll(all);
  }

  /**
   * Explicit override from Customise, or legacy { displayName } from earlier builds.
   */
  function getNameOverride(sb) {
    var p = getForSandbox(sb);
    if (!p) return null;
    if (Object.prototype.hasOwnProperty.call(p, 'displayNameOverride')) {
      var vo = p.displayNameOverride;
      if (vo === null || vo === '') return null;
      if (typeof vo === 'string' && vo.trim()) return vo.trim();
      return null;
    }
    if (typeof p.displayName === 'string' && p.displayName.trim()) return p.displayName.trim();
    return null;
  }

  function sandboxQsForApi() {
    if (typeof AepGlobalSandbox !== 'undefined' && typeof AepGlobalSandbox.getSandboxParam === 'function') {
      return AepGlobalSandbox.getSandboxParam();
    }
    return '';
  }

  function getRecentEmailIdentifier() {
    try {
      var raw = localStorage.getItem('aep-profile-viewer-recent-identifiers-v1');
      if (!raw) return '';
      var o = JSON.parse(raw);
      var emails = o && o.email;
      if (Array.isArray(emails) && emails.length && emails[0]) return String(emails[0]).trim();
    } catch (e) {}
    return '';
  }

  function fetchProfileFirstName() {
    var email = getRecentEmailIdentifier();
    if (!email) return Promise.resolve('');
    var p = new URLSearchParams();
    p.set('identifier', email);
    p.set('namespace', 'email');
    return fetch('/api/profile/consent?' + p.toString() + sandboxQsForApi())
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || data.found === false) return '';
        var fn = data.firstName;
        return fn != null && String(fn).trim() ? String(fn).trim() : '';
      })
      .catch(function () {
        return '';
      });
  }

  function applyHeroNameEl(name) {
    var nameEl = document.getElementById('expAccelDisplayName');
    if (nameEl) nameEl.textContent = name;
  }

  function fillNameInputOnly() {
    var n = document.getElementById('expAccelDisplayNameInput');
    if (!n || document.activeElement === n) return;
    var sb = currentSandboxName();
    var o = getNameOverride(sb);
    n.value = o != null ? o : lastResolvedFirstName || '';
  }

  function resolveAndApplyHeroName() {
    var sb = currentSandboxName();
    var gen = ++fetchGen;
    var override = getNameOverride(sb);
    if (override) {
      lastResolvedFirstName = override;
      applyHeroNameEl(override);
      fillNameInputOnly();
      return;
    }
    fetchProfileFirstName().then(function (fn) {
      if (gen !== fetchGen) return;
      var show = fn || DEFAULTS.displayName;
      lastResolvedFirstName = show;
      applyHeroNameEl(show);
      fillNameInputOnly();
    });
  }

  function splitTeamOptions(raw) {
    var source = raw != null ? String(raw).trim() : '';
    var options = source
      .split(',')
      .map(function (part) {
        return String(part).trim();
      })
      .filter(Boolean);
    return options.length ? options : [DEFAULTS.teamName];
  }

  function normaliseTeam(stored) {
    var teamRaw = stored && typeof stored.teamName === 'string' && stored.teamName.trim() ? stored.teamName.trim() : DEFAULTS.teamName;
    var options = splitTeamOptions(teamRaw);
    var selected = stored && typeof stored.teamSelected === 'string' ? stored.teamSelected.trim() : '';
    if (!selected || options.indexOf(selected) === -1) selected = options[0];
    return { raw: teamRaw, options: options, selected: selected };
  }

  function applyTeamSelection(raw) {
    var teamEl = document.getElementById('expAccelTeamDisplay');
    if (!teamEl) return;
    var teamCfg = normaliseTeam(raw || {});
    if (teamEl.tagName === 'SELECT') {
      teamEl.innerHTML = '';
      teamCfg.options.forEach(function (opt) {
        var optionEl = document.createElement('option');
        optionEl.value = opt;
        optionEl.textContent = opt;
        teamEl.appendChild(optionEl);
      });
      teamEl.value = teamCfg.selected;
      return;
    }
    teamEl.textContent = teamCfg.selected;
  }

  function bindTeamSelectionPersistence() {
    var teamEl = document.getElementById('expAccelTeamDisplay');
    if (!teamEl || teamEl.tagName !== 'SELECT' || teamEl.dataset.persistBound === '1') return;
    teamEl.dataset.persistBound = '1';
    teamEl.addEventListener('change', function () {
      var sb = currentSandboxName();
      var prev = getForSandbox(sb) || {};
      var teamCfg = normaliseTeam(prev);
      var selected = teamEl.value;
      if (teamCfg.options.indexOf(selected) === -1) return;
      var payload = Object.assign({}, prev, { teamName: teamCfg.raw, teamSelected: selected });
      saveForSandbox(sb, payload);
    });
  }

  function normaliseOpportunityIndustry(stored) {
    var key = stored && typeof stored.opportunityIndustry === 'string' ? stored.opportunityIndustry.trim().toLowerCase() : '';
    if (!key || !OPPORTUNITY_RATIONALE_COPY[key]) return DEFAULTS.opportunityIndustry;
    return key;
  }

  function setTextById(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || '';
  }

  function setHtmlById(id, value) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = value || '';
  }

  function applyOpportunityRationale(raw) {
    var prefs = raw && typeof raw === 'object' ? raw : {};
    var industry = normaliseOpportunityIndustry(prefs);
    var copy = OPPORTUNITY_RATIONALE_COPY[industry] || OPPORTUNITY_RATIONALE_COPY[DEFAULTS.opportunityIndustry];
    var industryInput = document.getElementById('expAccelOpportunityIndustryInput');
    if (industryInput && industryInput.tagName === 'SELECT' && document.activeElement !== industryInput) {
      industryInput.value = industry;
    }
    if (!copy) return;
    setHtmlById('expAccelOppRationaleBody', copy.body);
    setTextById('expAccelOppRationaleSubhead', copy.subhead);
    setTextById('expAccelOppExamplesIntro', copy.intro);
    setTextById('expAccelOppPillText1', copy.pills[0] || '');
    setTextById('expAccelOppPillText2', copy.pills[1] || '');
    setTextById('expAccelOppPillText3', copy.pills[2] || '');
    setTextById('expAccelOppPillText4', copy.pills[3] || '');
    setTextById('expAccelOppLift1', copy.rows[0] ? copy.rows[0].lift : '');
    setTextById('expAccelOppLift2', copy.rows[1] ? copy.rows[1].lift : '');
    setTextById('expAccelOppLift3', copy.rows[2] ? copy.rows[2].lift : '');
    setTextById('expAccelOppPrevTitle1', copy.rows[0] ? copy.rows[0].title : '');
    setTextById('expAccelOppPrevTitle2', copy.rows[1] ? copy.rows[1].title : '');
    setTextById('expAccelOppPrevTitle3', copy.rows[2] ? copy.rows[2].title : '');
    setTextById('expAccelOppPrevDesc1', copy.rows[0] ? copy.rows[0].desc : '');
    setTextById('expAccelOppPrevDesc2', copy.rows[1] ? copy.rows[1].desc : '');
    setTextById('expAccelOppPrevDesc3', copy.rows[2] ? copy.rows[2].desc : '');
  }

  function shuffleArray(list) {
    var arr = list.slice();
    var i;
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Meta line shares the same experiment row as the subtitle; "AICS on …" tail matches the bold title (subtitle). */
  function buildLatestUpdateMeta(fullTitle, sub) {
    var s = String(sub || '').trim();
    var t = String(fullTitle || '');
    var sep = ' | AICS on ';
    var idx = t.indexOf(sep);
    if (idx >= 0) {
      return t.slice(0, idx + sep.length) + s;
    }
    var tailAics = ' | AICS';
    if (t.length >= tailAics.length && t.slice(-tailAics.length) === tailAics) {
      return t.slice(0, t.length - tailAics.length) + ' | AICS on ' + s;
    }
    if (t) {
      return t + ' | AICS on ' + s;
    }
    return 'ACE0916 | US | Catalog | AICS on ' + s;
  }

  function applyLatestUpdateTitles(raw) {
    var pairs = [];
    var i;
    for (i = 1; i <= 4; i++) {
      var sub = rowField(raw, i, 'sub');
      var title = rowField(raw, i, 'title');
      if (!sub || !String(sub).trim()) continue;
      pairs.push({ title: title, sub: String(sub).trim() });
    }
    if (!pairs.length) return;
    var shuffled = shuffleArray(pairs);
    var n = shuffled.length;
    var x = shuffled[0 % n];
    var y = shuffled[1 % n];
    var z = shuffled[2 % n];
    setTextById('expAccelLatestUpdateTitle1', x.sub);
    setTextById('expAccelLatestUpdateTitle2', y.sub);
    setTextById('expAccelLatestUpdateTitle3', z.sub);
    setTextById('expAccelLatestUpdateMeta1', buildLatestUpdateMeta(x.title, x.sub));
    setTextById('expAccelLatestUpdateMeta2', buildLatestUpdateMeta(y.title, y.sub));
    setTextById('expAccelLatestUpdateMeta3', buildLatestUpdateMeta(z.title, z.sub));
  }

  function applyToDom(prefs) {
    var raw = prefs && typeof prefs === 'object' ? prefs : {};
    applyTeamSelection(raw);
    applyOpportunityRationale(raw);
    applyLatestUpdateTitles(raw);
    applyExperimentCustomisation(raw);
    applyResultsTableTreatmentImages(raw);
    applyHeroDetailImage(raw);
    applyEmailTemplateImages(raw);
    resolveAndApplyHeroName();
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('expAccelCustomiseStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  }

  function initDock() {
    var mainEl = document.querySelector('main.dashboard-main.profile-viewer-main');
    var dockOuter = document.getElementById('expAccelDockOuter');
    var drawer = document.getElementById('expAccelCustomiseDrawer');
    var hit = document.getElementById('expAccelDockHit');
    if (!mainEl || !dockOuter) return;

    var PEEK_PX = 40;
    var peekRaf = null;
    var lastX = 0;
    var lastY = 0;

    function alignDock() {
      var r = mainEl.getBoundingClientRect();
      dockOuter.style.left = Math.max(0, r.left) + 'px';
      dockOuter.style.width = Math.min(r.width, window.innerWidth) + 'px';
    }

    function setPeekFromPoint(clientX, clientY) {
      if (drawer && drawer.open) {
        dockOuter.classList.add('workflow-dock-outer--peek');
        return;
      }
      var r = mainEl.getBoundingClientRect();
      var nearBottom = clientY >= window.innerHeight - PEEK_PX;
      var inMain = clientX >= r.left && clientX <= r.right;
      if (nearBottom && inMain) {
        dockOuter.classList.add('workflow-dock-outer--peek');
      } else {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    }

    function onMouseMove(e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (peekRaf) return;
      peekRaf = window.requestAnimationFrame(function () {
        peekRaf = null;
        setPeekFromPoint(lastX, lastY);
      });
    }

    alignDock();
    try {
      var ro = new ResizeObserver(alignDock);
      ro.observe(mainEl);
    } catch (e) {}
    window.addEventListener('resize', alignDock);
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () {
      if (drawer && !drawer.open) {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    });

    if (drawer) {
      drawer.addEventListener('toggle', function () {
        if (drawer.open) {
          dockOuter.classList.add('workflow-dock-outer--peek');
        } else {
          setPeekFromPoint(lastX, lastY);
        }
      });
    }

    if (hit) {
      hit.addEventListener(
        'touchstart',
        function () {
          dockOuter.classList.add('workflow-dock-outer--peek');
        },
        { passive: true }
      );
    }
  }

  /** Technical sandbox id (?sandbox= / #sandboxSelect / localStorage) — works before aep-global-sandbox.js parses. */
  function sandboxTechnicalNameFallback() {
    try {
      if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
        return String(AepGlobalSandbox.getSandboxName() || '').trim();
      }
    } catch (e) {}
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (e2) {
      return '';
    }
  }

  /** Mock AJO top bar — mirrors Global values / active sandbox (same source as Customise sandbox dropdown). */
  function applyShellUserLine() {
    var el = document.getElementById('expAccelShellUserLine');
    if (!el) return;
    var technical = sandboxTechnicalNameFallback();
    var sel = document.getElementById('expAccelSandboxSelect');
    if (sel && sel.options && technical) {
      var i;
      for (i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === technical) {
          el.textContent = String(sel.options[i].textContent || '').replace(/\s+/g, ' ').trim();
          return;
        }
      }
    }
    if (!technical) {
      el.textContent = 'Server default sandbox';
      return;
    }
    el.textContent = technical;
  }

  function bindShellUserLineEvents() {
    if (document.documentElement.dataset.expAccelShellUserBound === '1') return;
    document.documentElement.dataset.expAccelShellUserBound = '1';
    window.addEventListener('aep-global-sandbox-change', applyShellUserLine);
    window.addEventListener('storage', function (e) {
      if (!e || e.key !== 'aepGlobalSandboxName') return;
      applyShellUserLine();
    });
  }

  function initSandboxSelect() {
    var sel = document.getElementById('expAccelSandboxSelect');
    if (!sel || typeof AepGlobalSandbox === 'undefined') {
      applyShellUserLine();
      return;
    }
    AepGlobalSandbox.loadSandboxesIntoSelect(sel)
      .then(function () {
        AepGlobalSandbox.onSandboxSelectChange(sel);
        AepGlobalSandbox.attachStorageSync(sel);
        applyShellUserLine();
      })
      .catch(function () {
        applyShellUserLine();
      });
  }

  function currentSandboxName() {
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return AepGlobalSandbox.getSandboxName() || '';
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function fillInputs() {
    var m = getForSandbox(currentSandboxName());
    var team = normaliseTeam(m || {}).raw;
    var industry = normaliseOpportunityIndustry(m || {});
    var t = document.getElementById('expAccelTeamInput');
    if (t) t.value = team;
    var industryInput = document.getElementById('expAccelOpportunityIndustryInput');
    if (industryInput) industryInput.value = industry;
    fillNameInputOnly();

    var p = m || {};
    var i;
    for (i = 1; i <= 4; i++) {
      var urlEl = document.getElementById('expAccelDockExpImgUrl' + i);
      var titleIn = document.getElementById('expAccelDockExpTitle' + i);
      var subIn = document.getElementById('expAccelDockExpSub' + i);
      var def = EXP_ROW_DEFAULTS[i - 1] || { title: '', sub: '' };
      if (urlEl) urlEl.value = p['expImg' + i] != null ? String(p['expImg' + i]) : '';
      if (titleIn) {
        if (p['expTitle' + i] !== undefined && p['expTitle' + i] !== null) {
          titleIn.value = String(p['expTitle' + i]);
        } else {
          titleIn.value = def.title;
        }
      }
      if (subIn) {
        if (p['expSub' + i] !== undefined && p['expSub' + i] !== null) {
          subIn.value = String(p['expSub' + i]);
        } else {
          subIn.value = def.sub;
        }
      }
    }
    var heroU = document.getElementById('expAccelDockHeroDetailImgUrl');
    if (heroU) heroU.value = p.heroDetailImg != null ? String(p.heroDetailImg) : '';
  }

  function refreshFromStorage() {
    fillInputs();
    applyToDom(getForSandbox(currentSandboxName()) || {});
  }

  function init() {
    bindShellUserLineEvents();
    initDock();
    initSandboxSelect();
    bindTeamSelectionPersistence();

    var btn = document.getElementById('expAccelCustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        var sb = currentSandboxName();
        var d = (document.getElementById('expAccelDisplayNameInput') || {}).value;
        var team = (document.getElementById('expAccelTeamInput') || {}).value;
        var industry = (document.getElementById('expAccelOpportunityIndustryInput') || {}).value;
        var trimmed = d != null ? String(d).trim() : '';
        var teamTrim = team != null && String(team).trim() ? String(team).trim() : DEFAULTS.teamName;
        var industryKey = OPPORTUNITY_RATIONALE_COPY[String(industry || '').trim().toLowerCase()]
          ? String(industry || '').trim().toLowerCase()
          : DEFAULTS.opportunityIndustry;
        var prev = getForSandbox(sb) || {};
        var teamCfg = normaliseTeam({ teamName: teamTrim, teamSelected: prev.teamSelected });
        var payload = Object.assign({}, prev, {
          displayNameOverride: trimmed ? trimmed : null,
          teamName: teamCfg.raw,
          teamSelected: teamCfg.selected,
          opportunityIndustry: industryKey,
        });
        if (trimmed) {
          payload.displayName = trimmed;
        } else {
          delete payload.displayName;
        }

        var j;
        for (j = 1; j <= 4; j++) {
          var urlEl = document.getElementById('expAccelDockExpImgUrl' + j);
          var titleIn = document.getElementById('expAccelDockExpTitle' + j);
          var subIn = document.getElementById('expAccelDockExpSub' + j);
          if (urlEl) {
            var u = urlEl.value != null ? String(urlEl.value).trim() : '';
            payload['expImg' + j] = u || '';
          }
          if (titleIn) {
            payload['expTitle' + j] = titleIn.value != null ? String(titleIn.value).trim() : '';
          }
          if (subIn) {
            payload['expSub' + j] = subIn.value != null ? String(subIn.value).trim() : '';
          }
        }
        var heroIn = document.getElementById('expAccelDockHeroDetailImgUrl');
        if (heroIn) {
          var heroTrim = heroIn.value != null ? String(heroIn.value).trim() : '';
          payload.heroDetailImg = heroTrim;
        }

        saveForSandbox(sb, payload);
        refreshFromStorage();
        setStatus('Updated labels for sandbox “' + (sb || 'default') + '”.', 'ok');
      });
    }

    window.addEventListener('aep-global-sandbox-change', function () {
      var sel = document.getElementById('expAccelSandboxSelect');
      if (sel && typeof AepGlobalSandbox !== 'undefined') {
        var n = AepGlobalSandbox.getSandboxName();
        if (
          n !== undefined &&
          Array.from(sel.options).some(function (o) {
            return o.value === n;
          })
        ) {
          sel.value = n;
        }
      }
      refreshFromStorage();
    });

    document.addEventListener('aep-lab-sandbox-keys-applied', function () {
      refreshFromStorage();
    });

    if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
      window.__aepLabSyncReady.then(function () {
        refreshFromStorage();
      });
    } else {
      refreshFromStorage();
    }
  }

  /** Apply Customise labels before first paint when this script is parser-inserted before the dock (sync, no defer). */
  function bootstrapPrefs() {
    try {
      applyToDom(getForSandbox(currentSandboxName()) || {});
      applyShellUserLine();
    } catch (e) {}
  }

  bootstrapPrefs();

  function scheduleInit() {
    function runInit() {
      init();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runInit);
    } else {
      runInit();
    }
  }

  scheduleInit();
})();
