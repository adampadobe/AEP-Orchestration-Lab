/**
 * Home dashboard layout controls (ported from Alan's upstream implementation):
 * - Sidebar theme swatches (dark blue / white)
 * - Background color swatches
 * - Background image thumbnails
 * Persistence uses the same localStorage keys as upstream.
 */
(function (global) {
  var STORAGE_KEY = 'aepHomeDashboardLayoutBg';
  var SIDEBAR_STORAGE_KEY = 'aepHomeDashboardSidebarTheme';
  var wrapSelector = '.dashboard-main-wrap--layout';

  var DEFAULT = {
    type: 'image',
    id: 'beach',
    overlay:
      'linear-gradient(165deg, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0.2) 45%, rgba(251, 146, 60, 0.08) 100%)',
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=80',
  };

  var SIDEBAR_PRESETS = [
    { id: 'dark', label: 'Dark blue sidebar', swatch: '#0e1628', border: '' },
    { id: 'light', label: 'White sidebar', swatch: '#f8f8f8', border: '#e2e8f0' },
  ];

  var COLOR_PRESETS = [
    { id: 'none', label: 'No background tint', kind: 'none', swatch: null, value: '' },
    { id: 'peach', label: 'Peach', kind: 'color', swatch: 'linear-gradient(160deg, #ffecd2 0%, #fcb69f 100%)', value: 'linear-gradient(160deg, #ffecd2 0%, #fcb69f 100%)' },
    { id: 'mint', label: 'Mint', kind: 'color', swatch: 'linear-gradient(160deg, #d1fae5 0%, #a7f3d0 100%)', value: 'linear-gradient(160deg, #d1fae5 0%, #a7f3d0 100%)' },
    { id: 'lavender', label: 'Lavender', kind: 'color', swatch: 'linear-gradient(160deg, #e0e7ff 0%, #c7d2fe 100%)', value: 'linear-gradient(160deg, #e0e7ff 0%, #c7d2fe 100%)' },
    { id: 'rose', label: 'Rose', kind: 'color', swatch: 'linear-gradient(160deg, #fce7f3 0%, #fbcfe8 100%)', value: 'linear-gradient(160deg, #fce7f3 0%, #fbcfe8 100%)' },
    { id: 'grad-blue', label: 'Blue purple gradient', kind: 'color', swatch: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 'grad-sun', label: 'Sunset gradient', kind: 'color', swatch: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { id: 'grad-sea', label: 'Sea gradient', kind: 'color', swatch: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { id: 'grad-forest', label: 'Forest gradient', kind: 'color', swatch: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)', value: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  ];

  var IMAGE_PRESETS = [
    {
      id: 'beach',
      label: 'Beach',
      thumb: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'abstract-pink',
      label: 'Abstract',
      thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'mountains-red',
      label: 'Mountains',
      thumb: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'mountains-blue',
      label: 'Peaks',
      thumb: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'forest',
      label: 'Forest',
      thumb: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'galaxy',
      label: 'Galaxy',
      thumb: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'sand',
      label: 'Shore',
      thumb: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=2400&q=80',
    },
    {
      id: 'city-dusk',
      label: 'City',
      thumb: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f290?auto=format&fit=crop&w=200&q=60',
      full: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f290?auto=format&fit=crop&w=2400&q=80',
    },
  ];

  function getWrap() {
    return global.document.querySelector(wrapSelector);
  }

  function getRoot() {
    return global.document.documentElement;
  }

  function applySpec(spec) {
    var wrap = getWrap();
    if (!wrap) return;
    if (!spec || spec.type === 'none' || spec.kind === 'none') {
      wrap.style.setProperty('--home-layout-bg-overlay', 'none');
      wrap.style.setProperty('--home-layout-bg-image', 'none');
      wrap.style.setProperty('--home-layout-bg-color', '#f5f5f5');
      wrap.setAttribute('data-layout-bg', 'none');
      return;
    }
    wrap.style.removeProperty('--home-layout-bg-color');
    if (spec.type === 'color' && spec.value) {
      wrap.style.setProperty('--home-layout-bg-overlay', 'none');
      wrap.style.setProperty('--home-layout-bg-image', spec.value);
      wrap.setAttribute('data-layout-bg', spec.id || 'color');
      return;
    }
    if (spec.type === 'image' && spec.image) {
      var overlay = spec.overlay != null ? spec.overlay : DEFAULT.overlay;
      wrap.style.setProperty('--home-layout-bg-overlay', overlay);
      wrap.style.setProperty('--home-layout-bg-image', 'url("' + spec.image + '")');
      wrap.setAttribute('data-layout-bg', spec.id || 'image');
    }
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveSpec(spec) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
    } catch (e) {}
  }

  function specFromSaved(saved) {
    if (!saved || !saved.type) return null;
    if (saved.type === 'none') return { type: 'none', kind: 'none' };
    if (saved.type === 'color') {
      var c = COLOR_PRESETS.find(function (x) {
        return x.id === saved.id;
      });
      if (c && c.value) return { type: 'color', kind: 'color', id: c.id, value: c.value };
    }
    if (saved.type === 'image') {
      var img = IMAGE_PRESETS.find(function (x) {
        return x.id === saved.id;
      });
      if (img) return { type: 'image', id: img.id, image: img.full, overlay: DEFAULT.overlay };
    }
    return null;
  }

  function initBackground() {
    var saved = loadSaved();
    var spec = specFromSaved(saved);
    if (spec) applySpec(spec);
    else applySpec({ type: 'image', id: DEFAULT.id, image: DEFAULT.image, overlay: DEFAULT.overlay });
  }

  function loadSidebarSaved() {
    try {
      var raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (raw === 'light' || raw === 'dark') return raw;
    } catch (e) {}
    return 'dark';
  }

  function saveSidebarTheme(id) {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, id);
    } catch (e) {}
  }

  function applySidebarTheme(themeId) {
    var root = getRoot();
    if (!root) return;
    if (themeId === 'light') root.setAttribute('data-ajo-sidebar', 'light');
    else root.setAttribute('data-ajo-sidebar', 'dark');
  }

  function initSidebar() {
    applySidebarTheme(loadSidebarSaved());
  }

  function hydrateVisualSwatches(drawer) {
    drawer.querySelectorAll('[data-layout-color]').forEach(function (el) {
      var id = el.getAttribute('data-layout-color');
      var p = COLOR_PRESETS.find(function (x) {
        return x.id === id;
      });
      if (!p) return;
      if (p.kind === 'none') return;
      el.style.background = p.swatch || '';
      el.setAttribute('aria-label', p.label);
    });
    drawer.querySelectorAll('[data-layout-image]').forEach(function (el) {
      var id = el.getAttribute('data-layout-image');
      var p = IMAGE_PRESETS.find(function (x) {
        return x.id === id;
      });
      if (!p) return;
      el.style.backgroundImage = 'url("' + p.thumb + '")';
      el.setAttribute('aria-label', p.label);
    });
    drawer.querySelectorAll('[data-sidebar-theme]').forEach(function (el) {
      var id = el.getAttribute('data-sidebar-theme');
      var p = SIDEBAR_PRESETS.find(function (x) {
        return x.id === id;
      });
      if (!p) return;
      el.style.background = p.swatch;
      el.style.borderColor = p.border || '';
      el.setAttribute('aria-label', p.label);
    });
  }

  function wireDrawer() {
    var btn = document.getElementById('homeLayoutEditBtn');
    var drawer = document.getElementById('homeLayoutDrawer');
    var backdrop = document.getElementById('homeLayoutBackdrop');
    var closeBtn = document.getElementById('homeLayoutDrawerClose');
    if (!btn || !drawer || !backdrop) return;

    hydrateVisualSwatches(drawer);

    function openDrawer() {
      drawer.classList.add('home-ajo-layout-drawer--open');
      drawer.setAttribute('aria-hidden', 'false');
      backdrop.removeAttribute('hidden');
      backdrop.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('home-layout-drawer-open');
    }

    function closeDrawer() {
      drawer.classList.remove('home-ajo-layout-drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
      backdrop.setAttribute('hidden', '');
      backdrop.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('home-layout-drawer-open');
    }

    closeDrawer();

    btn.addEventListener('click', function () {
      if (drawer.classList.contains('home-ajo-layout-drawer--open')) closeDrawer();
      else openDrawer();
    });
    backdrop.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('home-ajo-layout-drawer--open')) {
        closeDrawer();
        btn.focus();
      }
    });

    drawer.querySelectorAll('[data-layout-color]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-layout-color');
        var preset = COLOR_PRESETS.find(function (x) {
          return x.id === id;
        });
        if (!preset) return;
        if (preset.kind === 'none') {
          applySpec({ type: 'none', kind: 'none' });
          saveSpec({ type: 'none' });
        } else {
          applySpec({ type: 'color', kind: 'color', id: preset.id, value: preset.value });
          saveSpec({ type: 'color', id: preset.id });
        }
        syncActiveStates();
      });
    });

    drawer.querySelectorAll('[data-layout-image]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-layout-image');
        var img = IMAGE_PRESETS.find(function (x) {
          return x.id === id;
        });
        if (!img) return;
        applySpec({ type: 'image', id: img.id, image: img.full, overlay: DEFAULT.overlay });
        saveSpec({ type: 'image', id: img.id });
        syncActiveStates();
      });
    });

    drawer.querySelectorAll('[data-sidebar-theme]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-sidebar-theme');
        if (id !== 'light' && id !== 'dark') return;
        applySidebarTheme(id);
        saveSidebarTheme(id);
        syncSidebarActive(drawer);
      });
    });

    function syncSidebarActive(drawerEl) {
      var current = loadSidebarSaved();
      drawerEl.querySelectorAll('[data-sidebar-theme]').forEach(function (el) {
        var id = el.getAttribute('data-sidebar-theme');
        var on = id === current;
        el.classList.toggle('home-ajo-swatch--active', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function syncActiveStates() {
      var saved = loadSaved();
      if (!saved) saved = { type: 'image', id: DEFAULT.id };
      drawer.querySelectorAll('[data-layout-color]').forEach(function (el) {
        var id = el.getAttribute('data-layout-color');
        var on = (saved.type === 'none' && id === 'none') || (saved.type === 'color' && id === saved.id);
        el.classList.toggle('home-ajo-swatch--active', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      drawer.querySelectorAll('[data-layout-image]').forEach(function (el) {
        var id = el.getAttribute('data-layout-image');
        var on = saved.type === 'image' && id === saved.id;
        el.classList.toggle('home-ajo-thumb--active', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    initBackground();
    syncActiveStates();
    syncSidebarActive(drawer);
  }

  function boot() {
    initSidebar();
    wireDrawer();
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
