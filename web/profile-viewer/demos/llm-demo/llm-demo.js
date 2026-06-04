/**
 * LLM Demo — lab chrome, profile lookup, iframe reload on personalization.
 */
(function () {
  'use strict';

  function snapshotBuild() {
    return (typeof LlmDemoConfig !== 'undefined' && LlmDemoConfig.BUILD_ID) || '20260622';
  }

  function snapshotPageUrl(file) {
    return (
      '../../sky-llm-snapshot/' +
      (file || 'overview.html') +
      '?v=' +
      snapshotBuild() +
      '&llmDemo=1&_=' +
      Date.now()
    );
  }

  function initLabFlyoutSidebar() {
    var body = document.body;
    if (!body.classList.contains('llm-demo-page')) return;
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
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      if (body.classList.contains('mod-demo-page--nav-open')) scheduleClose();
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

  function pushConfigToFrame() {
    var frame = document.getElementById('llmDemoFrame');
    if (!frame || typeof LlmDemoConfig === 'undefined') return;
    var cfg = LlmDemoConfig.load();
    if (!cfg) return;
    try {
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'llm-demo-config', config: cfg }, window.location.origin);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function reloadIframe() {
    var frame = document.getElementById('llmDemoFrame');
    if (!frame) return;
    var file = 'overview.html';
    try {
      var loc = frame.contentWindow && frame.contentWindow.location;
      if (loc && loc.pathname) {
        var parts = loc.pathname.split('/');
        file = (parts[parts.length - 1] || file).split('?')[0];
      }
    } catch (e) {
      /* cross-origin or not loaded */
    }
    frame.src = snapshotPageUrl(file);
    window.setTimeout(pushConfigToFrame, 600);
    window.setTimeout(pushConfigToFrame, 1800);
  }

  function initFrameConfigSync() {
    var frame = document.getElementById('llmDemoFrame');
    if (!frame) return;
    frame.addEventListener('load', pushConfigToFrame);
    pushConfigToFrame();
  }

  function getSandboxName() {
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return String(AepGlobalSandbox.getSandboxName() || '').trim();
    }
    var sel = document.getElementById('sandboxSelect');
    return sel ? String(sel.value || '').trim() : '';
  }

  function formatScrapeOption(item) {
    var brand = item.brandName || 'Brand';
    var url = item.baseUrl || item.url || '';
    var when = item.updatedAt || item.createdAt || '';
    var dateLabel = '';
    if (when) {
      try {
        dateLabel = new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } catch (e) {
        dateLabel = '';
      }
    }
    var pages = item.pagesScraped != null ? item.pagesScraped + ' pg' : '';
    return brand + ' — ' + url + (dateLabel ? ' (' + dateLabel + ')' : '') + (pages ? ' · ' + pages : '');
  }

  function initCustomizeBar() {
    var anchor = document.getElementById('llmDemoCustomizeAnchor');
    var panel = document.getElementById('llmDemoCustomizePanel');
    var urlInput = document.getElementById('llmDemoSiteUrl');
    var brandInput = document.getElementById('llmDemoBrand');
    var scrapeSelect = document.getElementById('llmDemoScrapeSelect');
    var loadScrapeBtn = document.getElementById('llmDemoLoadScrapeBtn');
    var applyBtn = document.getElementById('llmDemoApplyBtn');
    var resetBtn = document.getElementById('llmDemoResetBtn');
    var status = document.getElementById('llmDemoCustomizeStatus');
    if (!anchor || !panel || !urlInput || typeof LlmDemoConfig === 'undefined') return;

    var hideTimer = null;

    function setOpen(open) {
      panel.classList.toggle('llm-demo-customize-panel--open', open);
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setOpen(false);
      }, 450);
    }

    anchor.addEventListener('mouseenter', function () {
      clearHideTimer();
      setOpen(true);
    });
    anchor.addEventListener('mouseleave', scheduleClose);
    panel.addEventListener('mouseenter', clearHideTimer);
    panel.addEventListener('mouseleave', scheduleClose);

    function setStatus(text, kind) {
      if (!status) return;
      status.textContent = text || '';
      status.className =
        'llm-demo-customize-status' + (kind ? ' llm-demo-customize-status--' + kind : '');
    }

    function fillForm() {
      var active = LlmDemoConfig.activeOrDefault();
      if (LlmDemoConfig.isCustomized()) {
        urlInput.value = active.sourceUrl || active.siteUrl || '';
        brandInput.value = active.brand || '';
        var extra = active.loadedFromScrape
          ? ' · loaded from brand scrape'
          : active.researchUsed
            ? ' · researched online'
            : '';
        if (active.industry) extra += ' · ' + active.industry;
        setStatus('Personalized for ' + active.brand + ' (' + active.siteHost + ')' + extra + '.', 'ok');
      } else {
        urlInput.value = '';
        brandInput.value = '';
        setStatus('Showing default Sky UK demo. Enter a customer URL to personalize.', '');
      }
    }

    function refreshScrapeList() {
      if (!scrapeSelect) return;
      var sandbox = getSandboxName();
      scrapeSelect.innerHTML = '';
      if (!sandbox) {
        scrapeSelect.appendChild(new Option('Select sandbox to list scrapes…', ''));
        return;
      }
      scrapeSelect.appendChild(new Option('Loading scrapes for ' + sandbox + '…', ''));
      LlmDemoConfig.fetchScrapeList(sandbox)
        .then(function (items) {
          scrapeSelect.innerHTML = '';
          scrapeSelect.appendChild(new Option('— Choose a saved scrape —', ''));
          if (!items.length) {
            scrapeSelect.appendChild(new Option('No completed scrapes in this sandbox', ''));
            return;
          }
          items.forEach(function (item) {
            var opt = new Option(formatScrapeOption(item), item.scrapeId || '');
            opt.dataset.url = item.baseUrl || item.url || '';
            opt.dataset.brand = item.brandName || '';
            scrapeSelect.appendChild(opt);
          });
        })
        .catch(function (err) {
          scrapeSelect.innerHTML = '';
          scrapeSelect.appendChild(new Option('Could not load scrapes', ''));
          setStatus(String((err && err.message) || err || 'Scrape list failed'), 'err');
        });
    }

    if (scrapeSelect) {
      scrapeSelect.addEventListener('change', function () {
        var opt = scrapeSelect.options[scrapeSelect.selectedIndex];
        if (!opt || !opt.value) return;
        if (opt.dataset.url) urlInput.value = opt.dataset.url;
        if (opt.dataset.brand) brandInput.value = opt.dataset.brand;
      });
    }

    if (loadScrapeBtn) {
      loadScrapeBtn.addEventListener('click', function () {
        var sandbox = getSandboxName();
        var scrapeId = scrapeSelect ? scrapeSelect.value : '';
        if (!sandbox) {
          setStatus('Choose a sandbox in Environment first.', 'err');
          return;
        }
        if (!scrapeId) {
          setStatus('Choose a saved brand scrape.', 'err');
          return;
        }
        loadScrapeBtn.disabled = true;
        setStatus('Loading scrape data and building demo config…', '');
        LlmDemoConfig.fetchFromScrape(scrapeId, sandbox, { brandOverride: brandInput.value.trim() })
          .then(function (result) {
            LlmDemoConfig.save(result.config);
            var meta = result.meta || {};
            var note = 'Brand scrape · ' + (meta.crawlPages || 0) + ' page(s)';
            if (meta.payloadExpired) note += ' · payload may be partial';
            setStatus('Personalized for ' + result.config.brand + ' — ' + note + '.', 'ok');
            fillForm();
            reloadIframe();
          })
          .catch(function (err) {
            setStatus(String((err && err.message) || err || 'Load scrape failed'), 'err');
          })
          .finally(function () {
            loadScrapeBtn.disabled = false;
          });
      });
    }

    var sandboxSelect = document.getElementById('sandboxSelect');
    if (sandboxSelect) {
      sandboxSelect.addEventListener('change', refreshScrapeList);
    }
    document.addEventListener('aep:sandbox-changed', refreshScrapeList);
    refreshScrapeList();

    applyBtn.addEventListener('click', function () {
      if (!urlInput.value.trim()) {
        setStatus('Enter a valid URL (e.g. https://www.example.com).', 'err');
        return;
      }
      applyBtn.disabled = true;
      setStatus('Crawling site and researching competitors (may take up to a minute)…', '');
      LlmDemoConfig.fetchResearch(urlInput.value, { brandOverride: brandInput.value.trim() })
        .then(function (result) {
          LlmDemoConfig.save(result.config);
          var meta = result.meta || {};
          var note = result.config.researchUsed ? 'Grounded web research' : 'Crawl-only fallback';
          if (meta.crawlPages) note += ' · ' + meta.crawlPages + ' page(s) crawled';
          setStatus('Personalized for ' + result.config.brand + ' — ' + note + '.', 'ok');
          fillForm();
          reloadIframe();
        })
        .catch(function (err) {
          setStatus(String((err && err.message) || err || 'Research failed'), 'err');
        })
        .finally(function () {
          applyBtn.disabled = false;
        });
    });

    resetBtn.addEventListener('click', function () {
      LlmDemoConfig.reset();
      fillForm();
      reloadIframe();
    });

    fillForm();
    setOpen(false);

    var params = new URLSearchParams(global.location.search || '');
    var preloadScrapeId = params.get('scrapeId');
    if (preloadScrapeId) {
      setOpen(true);
      var tryLoad = function () {
        var sandbox = getSandboxName();
        if (!sandbox) return;
        if (scrapeSelect) scrapeSelect.value = preloadScrapeId;
        setStatus('Loading scrape from brand scraper…', '');
        LlmDemoConfig.fetchFromScrape(preloadScrapeId, sandbox, {})
          .then(function (result) {
            LlmDemoConfig.save(result.config);
            setStatus('Loaded ' + result.config.brand + ' from brand scrape (no re-crawl).', 'ok');
            fillForm();
            reloadIframe();
          })
          .catch(function (err) {
            setStatus(String((err && err.message) || err || 'Load scrape failed'), 'err');
          });
      };
      if (scrapeSelect && scrapeSelect.options.length > 1) {
        tryLoad();
      } else {
        document.addEventListener('aep:sandbox-changed', tryLoad, { once: true });
        setTimeout(tryLoad, 1200);
      }
    }
  }

  function initProfileLookup() {
    var customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'llmDemoNs');

    var llmDemoMessage = document.getElementById('llmDemoMessage');
    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var generatorTargets = [];

    function getEmail() {
      return customerEmail ? String(customerEmail.value || '').trim() : '';
    }

    function setMessage(text, type) {
      if (!llmDemoMessage) return;
      llmDemoMessage.textContent = text || '';
      llmDemoMessage.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      llmDemoMessage.hidden = !text;
    }

    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    if (typeof DemoProfileDrawer !== 'undefined') {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'mod-demo-page--profile-open',
        viewName: 'LLM Demo',
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

    if (generatorTargetSelect && window.AepDemoGeneratorTargets) {
      void window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {}).then(
        function (t) {
          generatorTargets = t || [];
        },
      );
    }

    if (typeof AepDemoEnvStrip !== 'undefined' && AepDemoEnvStrip.initStandardEnvBar) {
      AepDemoEnvStrip.initStandardEnvBar({});
    }
  }

  initLabFlyoutSidebar();
  initCustomizeBar();
  initProfileLookup();
  initFrameConfigSync();
})();
