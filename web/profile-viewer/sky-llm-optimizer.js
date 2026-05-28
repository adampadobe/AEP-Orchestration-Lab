/**
 * Sky LLM Optimizer demo — lab flyout nav, product nav hover reveal, platform picker.
 */
(function () {
  'use strict';

  var PLATFORMS = [
    {
      id: 'chatgpt-free',
      name: 'ChatGPT (Free)',
      share: '49 % global market share',
      icon: 'openai',
    },
    { id: 'gemini', name: 'Gemini', share: '19 % global market share', icon: 'gemini' },
    { id: 'google-ai-mode', name: 'Google AI Mode', share: '17 % global market share', icon: 'google' },
    {
      id: 'copilot',
      name: 'Microsoft Copilot',
      share: '3 % global market share',
      icon: 'microsoft',
    },
    { id: 'chatgpt-paid', name: 'ChatGPT (Paid)', share: '2 % global market share', icon: 'openai' },
    { id: 'perplexity', name: 'Perplexity', share: '2 % global market share', icon: 'perplexity' },
    {
      id: 'google-overview',
      name: 'Google AI Overview',
      share: '1 % global market share',
      icon: 'google',
    },
  ];

  var METRICS_BY_PLATFORM = {
    'chatgpt-free': { visibility: '36%', mentions: '24', citability: '0', agentic: '215', traffic: '0' },
    gemini: { visibility: '41%', mentions: '31', citability: '2', agentic: '188', traffic: '12' },
    'google-ai-mode': { visibility: '38%', mentions: '27', citability: '1', agentic: '201', traffic: '8' },
    copilot: { visibility: '29%', mentions: '18', citability: '0', agentic: '142', traffic: '4' },
    'chatgpt-paid': { visibility: '44%', mentions: '35', citability: '3', agentic: '198', traffic: '6' },
    perplexity: { visibility: '33%', mentions: '22', citability: '4', agentic: '156', traffic: '19' },
    'google-overview': { visibility: '37%', mentions: '26', citability: '1', agentic: '175', traffic: '5' },
  };

  var MARKET_BY_PLATFORM = {
    'chatgpt-free': [
      { name: 'Sky', pos: 44, neg: 16 },
      { name: 'Virgin Media', pos: 38, neg: 22 },
      { name: 'BT', pos: 35, neg: 25 },
      { name: 'TalkTalk', pos: 28, neg: 30 },
      { name: 'Vodafone', pos: 32, neg: 28 },
    ],
    gemini: [
      { name: 'Sky', pos: 48, neg: 14 },
      { name: 'Virgin Media', pos: 40, neg: 20 },
      { name: 'BT', pos: 33, neg: 27 },
      { name: 'TalkTalk', pos: 26, neg: 32 },
      { name: 'NOW', pos: 30, neg: 24 },
    ],
    'google-ai-mode': [
      { name: 'Sky', pos: 42, neg: 18 },
      { name: 'Virgin Media', pos: 36, neg: 24 },
      { name: 'BT', pos: 37, neg: 23 },
      { name: 'EE', pos: 31, neg: 26 },
      { name: 'TalkTalk', pos: 27, neg: 29 },
    ],
    copilot: [
      { name: 'Sky', pos: 39, neg: 19 },
      { name: 'BT', pos: 34, neg: 26 },
      { name: 'Virgin Media', pos: 36, neg: 22 },
      { name: 'Vodafone', pos: 29, neg: 27 },
      { name: 'TalkTalk', pos: 25, neg: 31 },
    ],
    'chatgpt-paid': [
      { name: 'Sky', pos: 46, neg: 15 },
      { name: 'Virgin Media', pos: 41, neg: 19 },
      { name: 'BT', pos: 36, neg: 24 },
      { name: 'TalkTalk', pos: 30, neg: 28 },
      { name: 'Vodafone', pos: 33, neg: 25 },
    ],
    perplexity: [
      { name: 'Sky', pos: 40, neg: 17 },
      { name: 'Virgin Media', pos: 37, neg: 21 },
      { name: 'BT', pos: 32, neg: 28 },
      { name: 'NOW', pos: 34, neg: 22 },
      { name: 'TalkTalk', pos: 26, neg: 30 },
    ],
    'google-overview': [
      { name: 'Sky', pos: 43, neg: 17 },
      { name: 'Virgin Media', pos: 39, neg: 21 },
      { name: 'BT', pos: 34, neg: 25 },
      { name: 'EE', pos: 30, neg: 27 },
      { name: 'TalkTalk', pos: 28, neg: 29 },
    ],
  };

  function platformIconSvg(type) {
    if (type === 'openai') {
      return (
        '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M12 2a7 7 0 00-5.2 11.6L4 18l4.4-2.8A7 7 0 1012 2z"/></svg>'
      );
    }
    if (type === 'gemini') {
      return (
        '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="#4285f4" d="M12 2l2.4 6.8L22 12l-7.6 3.2L12 22l-2.4-6.8L2 12l7.6-3.2L12 2z"/></svg>'
      );
    }
    if (type === 'google') {
      return (
        '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="#ea4335" d="M12 11.2V8.4c2.5 0 4.6 1.6 5.4 3.8h4.3C20.5 6.8 16.6 4 12 4 7.9 4 4.3 6.5 2.7 10l4 3.1c.8-2.3 3-3.9 5.3-3.9z"/>' +
        '<path fill="#34a853" d="M4.7 14l-1.6 1.2C4.3 17.5 7.9 20 12 20c4.6 0 8.5-2.8 9.7-6.8h-4.3c-.8 2.2-2.9 3.8-5.4 3.8V12H4.7z"/>' +
        '<path fill="#fbbc05" d="M2.7 10C2.2 11.3 2 12.6 2 14s.2 2.7.7 4l4-3.1V10H2.7z"/>' +
        '<path fill="#4285f4" d="M12 4c2.3 0 4.5 1.6 5.3 3.9l4-3.1C19.7 6.5 16.1 4 12 4 7.4 4 3.5 6.8 2.3 10.8h4.3C7.4 8.6 9.5 7 12 7v4.2z"/></svg>'
      );
    }
    if (type === 'microsoft') {
      return (
        '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect x="3" y="3" width="8" height="8" fill="#f25022"/>' +
        '<rect x="13" y="3" width="8" height="8" fill="#7fba00"/>' +
        '<rect x="3" y="13" width="8" height="8" fill="#00a4ef"/>' +
        '<rect x="13" y="13" width="8" height="8" fill="#ffb900"/></svg>'
      );
    }
    if (type === 'perplexity') {
      return (
        '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<rect width="24" height="24" rx="4" fill="#20808d"/>' +
        '<path fill="#fff" d="M7 7h4v10H7zm6 0h4v10h-4z"/></svg>'
      );
    }
    return '';
  }

  function initLabFlyoutSidebar() {
    var body = document.body;
    if (!body.classList.contains('sky-llm-optimizer-page')) return;
    var sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return;

    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function setFlyoutOpen(open) {
      body.classList.toggle('mod-demo-page--nav-open', open);
    }

    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setFlyoutOpen(false);
        hideTimer = null;
      }, 450);
    }

    function onPointerMove(e) {
      if (mq.matches) return;
      if (e.clientX <= 24) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      var r = sidebar.getBoundingClientRect();
      var over =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      if (body.classList.contains('mod-demo-page--nav-open')) {
        scheduleClose();
      }
    }

    sidebar.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setFlyoutOpen(true);
      }
    });
    sidebar.addEventListener('mouseleave', function () {
      if (!mq.matches) scheduleClose();
    });
    document.addEventListener('mousemove', onPointerMove, { passive: true });
    mq.addEventListener('change', function () {
      clearHideTimer();
      if (mq.matches) body.classList.remove('mod-demo-page--nav-open');
    });
    setFlyoutOpen(false);
  }

  function initProductNavFlyout() {
    var body = document.body;
    var nav = document.getElementById('skyLlmProductNav');
    var zone = document.getElementById('skyLlmNavHoverZone');
    if (!nav) return;

    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function setOpen(open) {
      body.classList.toggle('sky-llm-product-nav-open', open);
    }

    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setOpen(false);
        hideTimer = null;
      }, 450);
    }

    function onPointerMove(e) {
      if (mq.matches) return;
      if (e.clientX <= 18) {
        clearHideTimer();
        setOpen(true);
        return;
      }
      var r = nav.getBoundingClientRect();
      var over =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) {
        clearHideTimer();
        setOpen(true);
        return;
      }
      if (body.classList.contains('sky-llm-product-nav-open')) {
        scheduleClose();
      }
    }

    nav.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setOpen(true);
      }
    });
    nav.addEventListener('mouseleave', function () {
      if (!mq.matches) scheduleClose();
    });
    if (zone) {
      zone.addEventListener('mouseenter', function () {
        if (!mq.matches) {
          clearHideTimer();
          setOpen(true);
        }
      });
    }
    document.addEventListener('mousemove', onPointerMove, { passive: true });
    setOpen(false);
  }

  function renderPlatformMenu(menuEl, selectedId, onSelect) {
    menuEl.innerHTML = '';
    PLATFORMS.forEach(function (p) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sky-llm-platform-option' + (p.id === selectedId ? ' is-selected' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', p.id === selectedId ? 'true' : 'false');
      btn.dataset.platformId = p.id;
      btn.innerHTML =
        '<span class="sky-llm-platform-check" aria-hidden="true">✓</span>' +
        platformIconSvg(p.icon) +
        '<span class="sky-llm-platform-copy"><strong>' +
        p.name +
        '</strong><span>' +
        p.share +
        '</span></span>';
      btn.addEventListener('click', function () {
        onSelect(p.id);
      });
      li.appendChild(btn);
      menuEl.appendChild(li);
    });
  }

  function updateMetrics(platformId) {
    var m = METRICS_BY_PLATFORM[platformId] || METRICS_BY_PLATFORM['chatgpt-free'];
    var map = {
      visibility: document.getElementById('skyLlmMetricVisibility'),
      mentions: document.getElementById('skyLlmMetricMentions'),
      citability: document.getElementById('skyLlmMetricCitability'),
      agentic: document.getElementById('skyLlmMetricAgentic'),
      traffic: document.getElementById('skyLlmMetricTraffic'),
    };
    if (map.visibility) map.visibility.textContent = m.visibility;
    if (map.mentions) map.mentions.textContent = m.mentions;
    if (map.citability) map.citability.textContent = m.citability;
    if (map.agentic) map.agentic.textContent = m.agentic;
    if (map.traffic) map.traffic.textContent = m.traffic;
  }

  function updateMarketChart(platformId) {
    var host = document.getElementById('skyLlmMarketChart');
    if (!host) return;
    var rows = MARKET_BY_PLATFORM[platformId] || MARKET_BY_PLATFORM['chatgpt-free'];
    host.innerHTML = rows
      .map(function (row) {
        return (
          '<div class="sky-llm-market-row">' +
          '<span>' +
          row.name +
          '</span>' +
          '<div class="sky-llm-market-bar" title="Positive / negative sentiment share">' +
          '<span class="sky-llm-market-bar-pos" style="width:' +
          row.pos +
          '%"></span>' +
          '<span class="sky-llm-market-bar-neg" style="width:' +
          row.neg +
          '%"></span>' +
          '</div>' +
          '<span>' +
          row.pos +
          '%</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function initPlatformPicker() {
    var trigger = document.getElementById('skyLlmPlatformTrigger');
    var menu = document.getElementById('skyLlmPlatformMenu');
    var triggerName = document.getElementById('skyLlmPlatformTriggerName');
    if (!trigger || !menu) return;

    var selectedId = 'chatgpt-free';

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      renderPlatformMenu(menu, selectedId, selectPlatform);
    }

    function selectPlatform(id) {
      selectedId = id;
      var p = PLATFORMS.find(function (x) {
        return x.id === id;
      });
      if (p && triggerName) triggerName.textContent = p.name;
      closeMenu();
      updateMetrics(id);
      updateMarketChart(id);
      renderPlatformMenu(menu, selectedId, selectPlatform);
    }

    trigger.addEventListener('click', function () {
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    document.addEventListener('click', function (e) {
      if (!trigger.contains(e.target) && !menu.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    updateMetrics(selectedId);
    updateMarketChart(selectedId);
  }

  function initProfileLookup() {
    var customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'skyLlmNs');

    var skyLlmMessage = document.getElementById('skyLlmMessage');
    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var generatorTargets = [];

    function getEmail() {
      return customerEmail ? String(customerEmail.value || '').trim() : '';
    }

    function setMessage(text, type) {
      if (!skyLlmMessage) return;
      skyLlmMessage.textContent = text || '';
      skyLlmMessage.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      skyLlmMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    async function loadGeneratorTargets() {
      if (!generatorTargetSelect) return;
      if (
        typeof window.AepDemoGeneratorTargets !== 'undefined' &&
        window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(
          generatorTargetSelect,
          {},
        );
      }
    }

    if (typeof DemoProfileDrawer !== 'undefined') {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'mod-demo-page--profile-open',
        viewName: 'Sky LLM Optimizer',
        emailGetter: getEmail,
        messageSetter: setMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }

    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var email = getEmail();
        if (!email) {
          setMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setMessage('Looking up profile…', '');
        await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
      });
    }

    void loadGeneratorTargets();

    if (typeof AepDemoEnvStrip !== 'undefined' && AepDemoEnvStrip.initStandardEnvBar) {
      AepDemoEnvStrip.initStandardEnvBar({
        summaryId: null,
        fieldsId: null,
        selectedScriptCodeId: null,
      });
    }
  }

  initLabFlyoutSidebar();
  initProductNavFlyout();
  initPlatformPicker();
  initProfileLookup();
})();
