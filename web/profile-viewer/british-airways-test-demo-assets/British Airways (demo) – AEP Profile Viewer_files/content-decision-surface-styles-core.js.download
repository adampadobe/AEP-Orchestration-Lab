/**
 * Shared surface style utilities for Decisioning Lab Edge + iframe inject + env-bar panel.
 */
(function (global) {
  'use strict';

  var STYLE_DEFAULTS_LAB = {
    layoutMode: 'overlay',
    blockY: 'flex-end',
    titleH: 'center',
    titleV: 'flex-start',
    descH: 'center',
    descV: 'center',
    ctaH: 'center',
    ctaV: 'flex-end',
    titleColor: '#e6e9ef',
    descColor: '#c5c9d3',
    ctaBg: '#f0f2f6',
    ctaText: '#1a1d23',
    noImageBg: '',
    showTitle: true,
    showDesc: true,
    showCta: true,
    showImage: true,
    mountMinHeight: '',
  };

  var STYLE_DEFAULTS_INJECT = {
    layoutMode: 'overlay',
    blockY: 'flex-end',
    titleH: 'center',
    titleV: 'flex-start',
    descH: 'center',
    descV: 'center',
    ctaH: 'center',
    ctaV: 'flex-end',
    titleColor: '',
    descColor: '',
    ctaBg: '',
    ctaText: '',
    noImageBg: '',
    showTitle: true,
    showDesc: true,
    showCta: true,
    showImage: true,
    mountMinHeight: '',
  };

  var VIS_CLASS = [
    'cd-edge-vis--no-title',
    'cd-edge-vis--no-desc',
    'cd-edge-vis--no-cta',
    'cd-edge-vis--no-fig',
  ];

  var JUSTIFY_VALUES = { 'flex-start': 1, center: 1, 'flex-end': 1 };
  var LAYOUT_MODES = { overlay: 1, half: 1, below: 1 };

  function normaliseHex(v) {
    if (!v) return '';
    var s = String(v).trim();
    if (s[0] !== '#') s = '#' + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{4}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.toLowerCase();
    return '';
  }

  function pickJustify(v, fb) {
    return JUSTIFY_VALUES[v] ? v : fb;
  }

  function pickHex(v, fb) {
    var n = normaliseHex(v);
    return n || fb;
  }

  function pickLayout(v, fb) {
    return LAYOUT_MODES[v] ? v : fb;
  }

  function sanitizeMountMinHeight(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (s.length > 40) s = s.slice(0, 40);
    if (!/^[0-9a-zA-Z%().,\s+-]+$/.test(s)) return '';
    return s;
  }

  function mountHeightPxFromCss(css) {
    var m = String(css || '').trim().match(/^(\d+(?:\.\d+)?)px$/i);
    return m ? m[1] : '';
  }

  function mergeStyleEntry(saved, defaults) {
    var base = defaults || STYLE_DEFAULTS_LAB;
    return saved && typeof saved === 'object' ? Object.assign({}, base, saved) : Object.assign({}, base);
  }

  function mountUsesTopRibbonSurface(mount, opts) {
    opts = opts || {};
    if (!mount) return false;
    if (opts.topRibbonFragment && mount.id === opts.topRibbonFragment) return true;
    if (/topribbon/i.test(String(mount.id || ''))) return true;
    if (mount.id && mount.id.indexOf('cd-edge-') === 0 && typeof opts.getPlacements === 'function') {
      var suffix = mount.id.slice('cd-edge-'.length);
      var list = opts.getPlacements() || [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].key !== suffix) continue;
        var f = String(list[i].fragment || '')
          .trim()
          .replace(/^#/, '')
          .toLowerCase();
        var k = String(list[i].key || '')
          .trim()
          .toLowerCase();
        return f === 'topribbon' || k === 'topribbon';
      }
      return mount.id === 'cd-edge-topRibbon';
    }
    return false;
  }

  function mountUsesHeroSurface(mount, opts) {
    opts = opts || {};
    if (!mount) return false;
    if (opts.heroFragment && mount.id === opts.heroFragment) return true;
    if (/hero-banner/i.test(String(mount.id || ''))) return true;
    if (mount.id && mount.id.indexOf('cd-edge-') === 0 && typeof opts.getPlacements === 'function') {
      var suffix = mount.id.slice('cd-edge-'.length);
      var list = opts.getPlacements() || [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].key !== suffix) continue;
        var f = String(list[i].fragment || '')
          .trim()
          .replace(/^#/, '')
          .toLowerCase();
        var k = String(list[i].key || '')
          .trim()
          .toLowerCase();
        return f === 'hero-banner' || k === 'hero';
      }
      return mount.id === 'cd-edge-hero';
    }
    return false;
  }

  function mountUsesFixedHeightSurface(mount, opts) {
    return mountUsesTopRibbonSurface(mount, opts) || mountUsesHeroSurface(mount, opts);
  }

  function applyVisibilityClasses(mount, st) {
    if (!mount || !st) return;
    VIS_CLASS.forEach(function (cls) {
      mount.classList.remove(cls);
    });
    if (st.showTitle === false) mount.classList.add('cd-edge-vis--no-title');
    if (st.showDesc === false) mount.classList.add('cd-edge-vis--no-desc');
    if (st.showCta === false) mount.classList.add('cd-edge-vis--no-cta');
    if (st.showImage === false) mount.classList.add('cd-edge-vis--no-fig');
  }

  function applySlotAlignment(mount, st, defaults) {
    var d = defaults || STYLE_DEFAULTS_LAB;
    var copy = mount.querySelector('.cd-banner-copy');
    if (copy) copy.style.setProperty('--cd-block-justify', st.blockY || d.blockY);
    var t = mount.querySelector('.cd-slot--title');
    if (t) {
      t.style.setProperty('--cd-slot-justify', st.titleH || d.titleH);
      t.style.setProperty('--cd-slot-align', st.titleV || d.titleV);
    }
    var dSlot = mount.querySelector('.cd-slot--desc');
    if (dSlot) {
      dSlot.style.setProperty('--cd-slot-justify', st.descH || d.descH);
      dSlot.style.setProperty('--cd-slot-align', st.descV || d.descV);
    }
    var c = mount.querySelector('.cd-slot--cta');
    if (c) {
      c.style.setProperty('--cd-slot-justify', st.ctaH || d.ctaH);
      c.style.setProperty('--cd-slot-align', st.ctaV || d.ctaV);
    }
  }

  /**
   * @param {HTMLElement} mount
   * @param {object} st
   * @param {{ mode?: 'lab'|'inject', defaults?: object, getPlacements?: function, injectHooks?: object }} [opts]
   */
  function applyStyleToMount(mount, st, opts) {
    if (!mount || !st) return;
    opts = opts || {};
    var mode = opts.mode === 'inject' ? 'inject' : 'lab';
    var defaults = opts.defaults || (mode === 'inject' ? STYLE_DEFAULTS_INJECT : STYLE_DEFAULTS_LAB);
    var mountOpts = {
      getPlacements: opts.getPlacements,
      topRibbonFragment: opts.topRibbonFragment,
      heroFragment: opts.heroFragment,
    };

    var banner = mount.querySelector('.cd-banner');
    if (banner) {
      var isHeroFlow = mount.classList.contains('cd-edge-mount-body--hero-flow');
      var isLayoutBelow = mount.classList.contains('cd-edge-mount-body--layout-below');
      var isCardBelow = mount.classList.contains('cd-edge-mount-body--card-below');
      var usesStackedLayout = isLayoutBelow || isCardBelow;

      if (mode === 'lab' || (!isHeroFlow && !usesStackedLayout)) {
        banner.classList.remove('cd-banner--overlay', 'cd-banner--half', 'cd-banner--below', 'cd-banner--contain-fit');
        banner.classList.add('cd-banner--' + (st.layoutMode || defaults.layoutMode));
      }

      if (mode === 'lab') {
        banner.style.setProperty('--cd-title-color', st.titleColor);
        banner.style.setProperty('--cd-desc-color', st.descColor);
        banner.style.setProperty('--cd-cta-bg', st.ctaBg);
        banner.style.setProperty('--cd-cta-text', st.ctaText);
      } else {
        if (st.titleColor) banner.style.setProperty('--cd-title-color', String(st.titleColor));
        if (st.descColor) banner.style.setProperty('--cd-desc-color', String(st.descColor));
        if (st.ctaBg) banner.style.setProperty('--cd-cta-bg', String(st.ctaBg));
        if (st.ctaText) banner.style.setProperty('--cd-cta-text', String(st.ctaText));
      }

      var nib =
        st.noImageBg != null && String(st.noImageBg).trim()
          ? mode === 'lab'
            ? normaliseHex(st.noImageBg)
            : String(st.noImageBg).trim()
          : '';
      if (nib) {
        banner.style.setProperty('--cd-no-image-bg', nib);
        if (mode === 'inject' && (isHeroFlow || usesStackedLayout)) {
          banner.style.removeProperty('background-color');
          banner.style.background = 'transparent';
          var fig = banner.querySelector('.cd-banner-figure--empty');
          if (fig) fig.style.backgroundColor = nib;
        } else if (mode === 'lab' || !isHeroFlow) {
          banner.style.setProperty('background-color', nib);
        }
      } else {
        banner.style.removeProperty('--cd-no-image-bg');
        if (mode === 'lab' || (!isHeroFlow && !usesStackedLayout)) banner.style.removeProperty('background-color');
      }
    }

    applySlotAlignment(mount, st, defaults);
    applyVisibilityClasses(mount, st);

    var mh = sanitizeMountMinHeight(st.mountMinHeight);
    var ribbonInline = mount.classList.contains('cd-edge-mount-body--ribbon-inline');
    var hooks = opts.injectHooks || {};
    var isHeroFlow = mount.classList.contains('cd-edge-mount-body--hero-flow');
    var isLayoutBelow = mount.classList.contains('cd-edge-mount-body--layout-below');
    var isCardBelow = mount.classList.contains('cd-edge-mount-body--card-below');

    if (mode === 'inject' && isHeroFlow) {
      mount.style.minHeight = '0';
      mount.style.maxHeight = '';
      mount.style.height = '';
      mount.style.overflow = '';
      if (isLayoutBelow) {
        if (typeof hooks.normalizeBannerToBelow === 'function') hooks.normalizeBannerToBelow(mount);
        if (typeof hooks.reapplySkyHeroMetricsFromCache === 'function') {
          hooks.reapplySkyHeroMetricsFromCache(mount, st.noImageBg);
        }
        if (typeof hooks.hideBannerCta === 'function') hooks.hideBannerCta(mount);
      } else {
        if (typeof hooks.normalizeOverlayBanner === 'function') hooks.normalizeOverlayBanner(mount);
        mount.style.width = '100%';
        mount.style.maxWidth = '100%';
        var heroHost = mount.closest('[data-hero-mount]');
        if (heroHost && typeof hooks.expandHeroHostFullWidth === 'function') {
          hooks.expandHeroHostFullWidth(heroHost);
        }
      }
      return;
    }

    if (mode === 'inject' && isCardBelow) {
      mount.style.minHeight = mh || '';
      if (typeof hooks.normalizeBannerToBelow === 'function') hooks.normalizeBannerToBelow(mount);
      if (typeof hooks.hideBannerCta === 'function') hooks.hideBannerCta(mount);
      return;
    }

    if (ribbonInline) {
      mount.classList.remove('cd-edge-mount-body--ribbon-fixed');
      mount.style.maxHeight = '';
      mount.style.height = '';
      mount.style.overflow = '';
      mount.style.minHeight = mh || '';
      var topRibbonInner = mount.querySelector('.TopRibbon');
      if (topRibbonInner && st.noImageBg) {
        topRibbonInner.style.backgroundColor = String(st.noImageBg).trim();
      }
      return;
    }

    var ribbonFixed =
      !ribbonInline &&
      mountUsesTopRibbonSurface(mount, mountOpts) &&
      (mode === 'inject'
        ? !!mh || mount.classList.contains('cd-edge-mount-body--ribbon-fixed')
        : !!mh);

    var fixedHeight = mode === 'lab' ? mountUsesFixedHeightSurface(mount, mountOpts) && !!mh : ribbonFixed;

    if (fixedHeight) {
      mount.classList.add('cd-edge-mount-body--ribbon-fixed');
      var resolvedHeight = mh || (mode === 'inject' ? '8rem' : mh);
      mount.style.minHeight = resolvedHeight;
      mount.style.maxHeight = resolvedHeight;
      mount.style.height = resolvedHeight;
      mount.style.overflow = 'hidden';
    } else {
      mount.classList.remove('cd-edge-mount-body--ribbon-fixed');
      mount.style.maxHeight = '';
      mount.style.height = '';
      mount.style.overflow = '';
      mount.style.minHeight = mh || '';
    }
  }

  global.CdSurfaceStylesCore = {
    STYLE_DEFAULTS_LAB: STYLE_DEFAULTS_LAB,
    STYLE_DEFAULTS_INJECT: STYLE_DEFAULTS_INJECT,
    VIS_CLASS: VIS_CLASS,
    JUSTIFY_VALUES: JUSTIFY_VALUES,
    LAYOUT_MODES: LAYOUT_MODES,
    normaliseHex: normaliseHex,
    pickJustify: pickJustify,
    pickHex: pickHex,
    pickLayout: pickLayout,
    sanitizeMountMinHeight: sanitizeMountMinHeight,
    mountHeightPxFromCss: mountHeightPxFromCss,
    mergeStyleEntry: mergeStyleEntry,
    mountUsesTopRibbonSurface: mountUsesTopRibbonSurface,
    mountUsesHeroSurface: mountUsesHeroSurface,
    mountUsesFixedHeightSurface: mountUsesFixedHeightSurface,
    applyStyleToMount: applyStyleToMount,
    applyVisibilityClasses: applyVisibilityClasses,
  };
})(typeof window !== 'undefined' ? window : globalThis);
