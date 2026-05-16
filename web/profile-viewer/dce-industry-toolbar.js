/**
 * Shared Decisioning / Journey arbitration industry dropdown (matches Decisioning visualiser markup + behaviour).
 * Loaded before journey-arbitration-v3.js — exposes window.aepDceIndustryToolbarInit.
 */
(function () {
  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_EDP_INDUSTRY = 'aepEdpIndustry';

  var INDUSTRY_LABEL_UI = {
    retail: 'Retail',
    fsi: 'FSI',
    travel: 'Travel',
    media: 'Media',
    sports: 'Sports',
    telecommunications: 'Telecommunications',
    public: 'Public',
    healthcare: 'Healthcare',
  };

  var INDUSTRY_ORDER = ['retail', 'fsi', 'travel', 'media', 'sports', 'telecommunications', 'public', 'healthcare'];

  var INDUSTRY_ICON_INNER = {
    retail:
      '<circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />',
    fsi:
      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />',
    travel:
      '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />',
    media: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" />',
    sports:
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
    telecommunications: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />',
    public:
      '<line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" />',
    healthcare:
      '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.3.3 0 1 0 .6.3"/><path d="M8 15v1a6 6 0 0 0 12 0v-4"/>',
  };

  function industryIconMarkup(key) {
    var inner = INDUSTRY_ICON_INNER[key] || INDUSTRY_ICON_INNER.media;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        inner +
        '</svg>'
    );
  }

  function migrateIndustryKey(k) {
    if (!k) return 'media';
    var leg = { telco: 'telecommunications', automotive: 'sports' };
    return leg[k] || k;
  }

  function isValidIndustry(k) {
    return INDUSTRY_ORDER.indexOf(k) >= 0;
  }

  /**
   * @param {object} cfg
   * @param {string} cfg.scopeId
   * @param {string} cfg.btnId
   * @param {string} cfg.menuId
   * @param {string} cfg.labelId
   * @param {string} cfg.icoId
   * @param {string} cfg.builtAttr
   * @param {string} cfg.boundAttr
   * @param {string} cfg.iframeId
   * @param {string} cfg.postMessageType
   */
  function aepDceIndustryToolbarInit(cfg) {
    var scope = document.getElementById(cfg.scopeId);

    function getIndustryKey() {
      var b = migrateIndustryKey(document.body && document.body.getAttribute('data-dce-industry'));
      return isValidIndustry(b) ? b : 'media';
    }

    function postToIframe(key) {
      var frame = document.getElementById(cfg.iframeId);
      if (!frame || !frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage(
          { source: 'aep-profile-viewer', type: cfg.postMessageType, industry: key },
          '*'
        );
      } catch (err) {}
    }

    function syncIndustryChrome(key) {
      var ico = document.getElementById(cfg.icoId);
      if (ico) ico.innerHTML = industryIconMarkup(key);
      var sel = '#' + cfg.menuId + ' .dce-edp-dropdown-item';
      document.querySelectorAll(sel).forEach(function (b) {
        var on = b.getAttribute('data-dce-industry') === key;
        b.classList.toggle('dce-edp-dropdown-item--active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function setIndustry(key, persist, skipPost) {
      key = migrateIndustryKey(key);
      if (!isValidIndustry(key)) key = 'media';
      try {
        document.body.setAttribute('data-dce-industry', key);
        if (persist !== false) {
          localStorage.setItem(LS_INDUSTRY, key);
          localStorage.setItem(LS_EDP_INDUSTRY, key);
        }
      } catch (e) {}
      var pgLbl = document.getElementById(cfg.labelId);
      if (pgLbl) pgLbl.textContent = INDUSTRY_LABEL_UI[key] || INDUSTRY_LABEL_UI.media;
      syncIndustryChrome(key);
      if (!skipPost) postToIframe(key);
    }

    function buildIndustryMenu() {
      var menu = document.getElementById(cfg.menuId);
      if (!menu || menu.getAttribute(cfg.builtAttr) === '1') return;
      menu.setAttribute(cfg.builtAttr, '1');
      menu.innerHTML = '';
      INDUSTRY_ORDER.forEach(function (key) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.className = 'dce-edp-dropdown-item';
        btn.setAttribute('data-dce-industry', key);
        var ico = document.createElement('span');
        ico.className = 'dce-edp-menu-ico';
        ico.innerHTML = industryIconMarkup(key);
        var lab = document.createElement('span');
        lab.className = 'dce-edp-menu-label';
        lab.textContent = INDUSTRY_LABEL_UI[key];
        btn.appendChild(ico);
        btn.appendChild(lab);
        menu.appendChild(btn);
      });
    }

    function bindIndustryUi() {
      if (!scope || scope.getAttribute(cfg.boundAttr) === '1') return;
      scope.setAttribute(cfg.boundAttr, '1');
      buildIndustryMenu();

      var ddBtn = document.getElementById(cfg.btnId);
      var ddMenu = document.getElementById(cfg.menuId);
      if (ddBtn && ddMenu) {
        function closeIndustryMenu() {
          ddMenu.hidden = true;
          ddBtn.setAttribute('aria-expanded', 'false');
        }
        ddBtn.addEventListener('click', function (e) {
          e.preventDefault();
          ddMenu.hidden = !ddMenu.hidden;
          ddBtn.setAttribute('aria-expanded', ddMenu.hidden ? 'false' : 'true');
        });
        ddMenu.querySelectorAll('[data-dce-industry]').forEach(function (item) {
          item.addEventListener('click', function (e) {
            e.preventDefault();
            var raw = item.getAttribute('data-dce-industry');
            var k = migrateIndustryKey(raw);
            if (k && isValidIndustry(k)) setIndustry(k, true);
            closeIndustryMenu();
          });
        });
        document.addEventListener('click', function (e) {
          if (!ddMenu.hidden && ddBtn && !ddBtn.contains(e.target) && !ddMenu.contains(e.target)) {
            closeIndustryMenu();
          }
        });
      }
    }

    function initFromStorage() {
      setIndustry(getIndustryKey(), false, true);
    }

    function boot() {
      bindIndustryUi();
      initFromStorage();
    }

    return {
      getIndustryKey: getIndustryKey,
      setIndustry: setIndustry,
      postToIframe: postToIframe,
      migrateIndustryKey: migrateIndustryKey,
      isValidIndustry: isValidIndustry,
      boot: boot,
    };
  }

  window.aepDceIndustryToolbarInit = aepDceIndustryToolbarInit;
})();
