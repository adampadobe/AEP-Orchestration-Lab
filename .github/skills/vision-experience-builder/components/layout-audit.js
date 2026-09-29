/* layout-audit.js — deterministic slide-layout checker (overlaps · overflow · empty space).
 *
 * WHY: "eyeball every slide for overlaps and dead space" is a rule that gets skipped. This
 * computes it. It reads REAL geometry (getBoundingClientRect at END-STATE, after animations
 * finish), so it catches what static HTML analysis can't — animated elements that settle into
 * an overlapping position, %-width columns that collide, content huddled in one corner.
 *
 * USE (three ways):
 *   1. In the live preview / visual-smoke step:  auditDeck()  → per-slide verdict in console.
 *   2. Append ?audit=1 to the deck URL           → draws red overlap / amber empty overlays.
 *   3. Headless (layout_qa.py drives this via Playwright) → structured JSON for the gate.
 *
 * CONTRACT (a slide PASSES when):
 *   - no two CONTENT units overlap (a background layer behind content is fine — see isLayer);
 *   - nothing overflows the 1920×1080 stage by more than EDGE px;
 *   - content isn't lopsided: coverage ≥ MIN_COVERAGE and no empty half-stage band;
 *   - type scale meets the §12 minimums (device-mock subtrees exempt) — 23px takeaways
 *     shipped on Northwind because the minimums lived only in prose.
 */
(function (global) {
  const AUDIT_VERSION = 2;
  const STAGE_W = 1920, STAGE_H = 1080;
  const EDGE = 8;            // px an element may bleed past the stage before it's "overflow"
  const OVERLAP_AREA = 600;  // px² intersection below this is a rounding touch, not an overlap
  const MIN_COVERAGE = 0.14; // content covering < this fraction of the stage reads as empty
  const CONTENT_SEL = [
    'h1', 'h2', 'h3', 'p', '.eye', '.eyebrow', '.numdisc', '.htitle', '.narr', '.takeaway',
    '.tag', '.stat', '.card', '.chip', '.pchip', '.qchip', '.sig', '.bub', '.jlab', '.jm',
    '.notif', '.phone', '.esb-laptop', '.lapwrap', '.spark', '.ocard', '.pf-lab', '.prodcard',
    '.lockup', '.cover-mid', '.foot', '.who', '.role', '.q', '.pintro', '.story', '.stats',
    '.ogrid', '.qrow', '.sigcol', '.screencol', '.mapwrap', '[data-audit]'
  ].join(',');

  function stageBox() {
    const st = document.getElementById('stage') || document.querySelector('.deck-stage');
    const r = st.getBoundingClientRect();
    const k = r.width / STAGE_W;               // current scale of the 1920×1080 stage
    return { r, k };
  }
  // element rect in STAGE (1920×1080) coordinates, undoing the stage transform
  function boxOf(el, st) {
    const b = el.getBoundingClientRect();
    return {
      x: (b.left - st.r.left) / st.k, y: (b.top - st.r.top) / st.k,
      w: b.width / st.k, h: b.height / st.k, el
    };
  }
  const area = z => Math.max(0, z.w) * Math.max(0, z.h);
  function intersect(a, b) {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w), d = Math.min(a.y + a.h, b.y + b.h);
    return (r > x && d > y) ? (r - x) * (d - y) : 0;
  }
  // a "layer" is a deliberate backdrop content may sit over: full-bleed, or a known bg class
  function isLayer(z) {
    const c = (z.el.className && z.el.className.baseVal !== undefined)
      ? z.el.className.baseVal : ('' + (z.el.className || ''));
    if (/\b(photo-r|persona-bg|bloom|ibloom|backdrop|bg-layer|ms-map|photo-panel)\b/.test(c)) return true;
    // [data-audit] is an explicit "I am content" declaration, so it beats the area heuristic
    // below. Without it a full-bleed product screen (cx-enterprise-home at fold scale) is
    // indistinguishable from a backdrop by area alone: it gets classed as a layer, contentUnits
    // drops to 0 and the slide fails as blank -- the opposite of what data-audit is for. The
    // class test above still wins, so a declared backdrop stays a backdrop.
    if (z.el.hasAttribute && z.el.hasAttribute('data-audit')) return false;
    return area(z) > 0.55 * STAGE_W * STAGE_H;   // covers most of the stage → it's the canvas
  }
  function finishAnims() {
    document.querySelectorAll('.slide.active *').forEach(n =>
      (n.getAnimations ? n.getAnimations() : []).forEach(a => { try { a.finish(); } catch (e) {} }));
  }

  function auditSlide(slide) {
    const st = stageBox();
    let units = [...slide.querySelectorAll(CONTENT_SEL)]
      .filter(el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map(el => boxOf(el, st))
      .filter(z => area(z) > 400);
    // drop a unit if another unit is its ancestor (compare outermost clusters only)
    units = units.filter(z => !units.some(o => o !== z && o.el.contains(z.el)));

    const content = units.filter(z => !isLayer(z));
    const layers = units.filter(isLayer);

    // 1. overlaps among content
    const overlaps = [];
    for (let i = 0; i < content.length; i++)
      for (let j = i + 1; j < content.length; j++) {
        const ov = intersect(content[i], content[j]);
        if (ov > OVERLAP_AREA) overlaps.push({
          a: tag(content[i].el), b: tag(content[j].el),
          overlapPx: Math.round(ov),
          pctOfSmaller: Math.round(100 * ov / Math.min(area(content[i]), area(content[j])))
        });
      }
    // 2. overflow past the stage
    const overflow = content.filter(z =>
      z.x < -EDGE || z.y < -EDGE || z.x + z.w > STAGE_W + EDGE || z.y + z.h > STAGE_H + EDGE)
      .map(z => ({ el: tag(z.el), box: [r(z.x), r(z.y), r(z.w), r(z.h)] }));
    // 3. coverage + empty-band (content only; a full-bleed layer doesn't excuse huddled text).
    //    HERO slides (cover / close / a data-layout="hero") are intentionally a centred lockup
    //    in negative space — exempt from the coverage floor and empty-band check, but STILL
    //    checked for overlap and overflow (a hero may not collide or bleed off-stage).
    const scls = '' + (slide.className || '');
    const isHero = /\b(cover|close|hero|kin)\b/.test(scls) || slide.getAttribute('data-layout') === 'hero';
    const cov = coverage(content);
    const bands = isHero ? [] : emptyBands(content);
    const sparse = !isHero && cov < MIN_COVERAGE;

    // 4. §12 type-scale minimums (device-mock subtrees exempt — realistic UI scale)
    const typeViolations = typeScale(slide);
    // 5. WCAG contrast in the SHIPPED PIXELS (contrast_check.py only checks brand.json; the
    //    rendered fg/bg were checked by nothing). Solid-bg failures are HARD (reliable); gradient
    //    ones are ADVISORY (we can't know where the text lands without pixel sampling).
    const c = contrastViolations(slide);

    // content.length === 0 -> the slide rendered blank (e.g. a cover whose lockup/wordmark failed
    // to load): never a valid layout, even for a hero that's otherwise exempt from the coverage
    // and empty-band checks. Verified against the REAL decks through the headless Playwright
    // audit — live slides report contentUnits 1..10 (cover=2, close=1), so this cannot false-block
    // them. (An earlier revert of this line was based on a broken browser-pane measurement that
    // wrongly reported contentUnits:0 for every slide.)
    const verdict = (content.length === 0 || overlaps.length || overflow.length || sparse ||
                     bands.length || typeViolations.length || c.hard.length) ? 'FAIL' : 'PASS';
    return {
      slide: slideName(slide), verdict, overlaps, overflow,
      coverage: +cov.toFixed(2), emptyBands: bands, typeViolations,
      contrast: c.hard, contrastAdvisory: c.soft,
      contentUnits: content.length, layers: layers.length
    };
  }

  // ---- WCAG contrast on rendered pixels ----
  function relLum(rgb) {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }
  function parseRGB(s) {
    const m = (s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  }
  // all opaque colour stops of a gradient (decks set slide bg via `background:
  // linear-gradient(...)`, which computes as backgroundImage, not backgroundColor).
  function gradientStops(el) {
    const bi = getComputedStyle(el).backgroundImage;
    if (!bi || bi === 'none' || !/gradient/.test(bi)) return null;
    const found = (bi.match(/rgba?\([^)]+\)/g) || []).map(parseRGB)
      .filter(p => p && p.a >= 0.5).map(p => p.rgb);
    return found.length ? found : null;
  }
  // What the text sits on, and how sure we are:
  //   {rgb:[...], solid:true}   a single opaque colour — RELIABLE, hard-checkable
  //   {stops:[...], solid:false} a gradient — we can't know WHERE in it the text lands, so this
  //                              is ADVISORY only (worst-stop reported, never fails the verdict —
  //                              only pixel sampling could make it a hard fail without false
  //                              positives on legitimate dark-gradient slides)
  //   null                      over a photo / nothing readable — skip
  function bgCandidates(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = parseRGB(getComputedStyle(n).backgroundColor);
      if (bg && bg.a >= 0.9) return { rgb: bg.rgb, solid: true };
      const g = gradientStops(n);
      if (g) return { stops: g, solid: false };
      n = n.parentElement;
    }
    return null;
  }
  function ratio(fg, bg) {
    const L1 = relLum(fg), L2 = relLum(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }
  // returns { hard:[...solid-bg failures — fail the verdict], soft:[...gradient advisories] }
  function contrastViolations(slide) {
    const hard = [], soft = [];
    // Product-UI chrome is exempt from deck type rules: a 12px eyebrow inside an Adobe
    // product mock is correct at product scale, and judging it as deck copy is a false
    // fail. [data-mock] lets a component declare itself instead of waiting to be added to
    // this list — the class names below are the pre-existing mocks, kept for back-compat.
    const inMock = el => el.closest('[data-mock], .phone, .pscreen, .esb-laptop, .lapwrap, .screen');
    slide.querySelectorAll('h1,h2,h3,p,span,div,li,b,strong,em,.eye,.narr,.takeaway,.chip,.tag,.osub')
      .forEach(el => {
        if (inMock(el) || el.offsetParent === null) return;
        const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
          .map(n => n.textContent.trim()).join('');
        if (own.length < 2) return;
        const cs = getComputedStyle(el);
        const fg = parseRGB(cs.color);
        if (!fg || fg.a < 0.5) return;
        const bc = bgCandidates(el);
        if (!bc) return;   // over a photo / nothing — skip, never guess
        const bgs = bc.solid ? [bc.rgb] : bc.stops;
        const r = Math.min(...bgs.map(bg => ratio(fg.rgb, bg)));   // worst stop
        const px = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight) || 400) >= 700;
        const large = px >= 24 || (bold && px >= 18.66);
        const floor = large ? 3.0 : 4.5;
        if (r < floor - 0.05) {
          const rec = { el: tag(el), ratio: +r.toFixed(2), floor, px: Math.round(px),
                        fg: cs.color, kind: large ? 'large' : 'body' };
          (bc.solid ? hard : soft).push(rec);   // gradient bg = advisory (can't place the text)
        }
      });
    return { hard, soft };
  }

  // §12 minimums, machine-enforced (23px takeaways shipped when this was prose-only).
  // Long-form body ≥26 · scene titles ≥60 · eyebrows ≥18 · chips/labels ≥16.
  const TYPE_RULES = [
    { sel: 'h1, h2, .htitle', min: 60, what: 'scene title' },
    { sel: '.eye, .eyebrow, .numdisc', min: 18, what: 'eyebrow' },
    { sel: '.narr, .takeaway, .osub, .who, .sub, p', min: 26, what: 'body', longOnly: true },
    { sel: '.chip, .pchip, .qchip, .jflag, .foot, .tag, .laylab', min: 16, what: 'label' },
  ];
  function typeScale(slide) {
    const out = [];
    // Product-UI chrome is exempt from deck type rules: a 12px eyebrow inside an Adobe
    // product mock is correct at product scale, and judging it as deck copy is a false
    // fail. [data-mock] lets a component declare itself instead of waiting to be added to
    // this list — the class names below are the pre-existing mocks, kept for back-compat.
    const inMock = el => el.closest('[data-mock], .phone, .pscreen, .esb-laptop, .lapwrap, .screen');
    TYPE_RULES.forEach(rule => {
      slide.querySelectorAll(rule.sel).forEach(el => {
        if (inMock(el) || el.offsetParent === null) return;
        const txt = (el.textContent || '').trim();
        if (!txt || (rule.longOnly && txt.length <= 30)) return;
        // measure the element's own text, not a child's (skip pure containers)
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < rule.min - 0.5) out.push({ el: tag(el), what: rule.what, px: Math.round(fs), min: rule.min });
      });
    });
    return out;
  }

  // fraction of the stage covered by the union of content boxes (grid approximation)
  function coverage(content) {
    const GX = 32, GY = 18, cell = new Uint8Array(GX * GY);
    content.forEach(z => {
      const x0 = Math.max(0, Math.floor(z.x / STAGE_W * GX)), x1 = Math.min(GX - 1, Math.floor((z.x + z.w) / STAGE_W * GX));
      const y0 = Math.max(0, Math.floor(z.y / STAGE_H * GY)), y1 = Math.min(GY - 1, Math.floor((z.y + z.h) / STAGE_H * GY));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cell[y * GX + x] = 1;
    });
    return cell.reduce((a, b) => a + b, 0) / (GX * GY);
  }
  // A half is empty only if NO content BOX reaches into it (box-intersection, not centre —
  // a tall phone spanning both halves fills the bottom even though its centre is up top).
  // Uses a small inset so a box merely grazing the midline doesn't count as "filling" a half.
  function emptyBands(content) {
    if (!content.length) return ['entire-stage-empty'];
    const out = [], IN = 40;
    const reaches = (test) => content.some(test);
    if (!reaches(z => z.x + z.w > STAGE_W * 0.5 + IN)) out.push('right-half-empty');
    if (!reaches(z => z.x < STAGE_W * 0.5 - IN)) out.push('left-half-empty');
    if (!reaches(z => z.y + z.h > STAGE_H * 0.5 + IN)) out.push('bottom-half-empty');
    if (!reaches(z => z.y < STAGE_H * 0.5 - IN)) out.push('top-half-empty');
    return out;
  }

  const r = n => Math.round(n);
  function tag(el) {
    const c = ('' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ''))
      .trim().split(/\s+/).filter(x => !/^(a\d|active|anim)$/.test(x)).slice(0, 2).join('.');
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ' «' + t + '»' : ''}`;
  }
  function slideName(s) {
    return s.id || tag(s.querySelector('h1,h2,.htitle') || s).replace(/^section/, '') || 'slide';
  }

  // draw overlays for ?audit=1
  function paint(res, slide) {
    const st = stageBox();
    slide.querySelectorAll('.__audit_ov').forEach(n => n.remove());
    const mark = (z, color, label) => {
      const d = document.createElement('div');
      d.className = '__audit_ov';
      Object.assign(d.style, {
        position: 'absolute', left: z.x + 'px', top: z.y + 'px', width: z.w + 'px', height: z.h + 'px',
        outline: '3px solid ' + color, background: color.replace(')', ',.12)').replace('rgb', 'rgba'),
        zIndex: 9999, pointerEvents: 'none', font: '12px monospace', color: color
      });
      d.textContent = label;
      slide.appendChild(d);
    };
    res._contentBoxes && res._contentBoxes.forEach(z => mark(z, 'rgb(0,180,90)', ''));
    // (overlap/overflow re-marked from the audit result by class match — kept simple here)
  }

  function auditDeck(opts) {
    opts = opts || {};
    finishAnims();
    const slides = [...document.querySelectorAll('.slide')];
    const results = [];
    const cur = slides.findIndex(s => s.classList.contains('active'));
    slides.forEach((s, i) => {
      const wasActive = s.classList.contains('active');
      s.classList.add('active');            // force layout so hidden slides measure
      finishAnims();
      const res = auditSlide(s);
      results.push(res);
      if (!wasActive && i !== cur) s.classList.remove('active');
    });
    if (cur >= 0) slides[cur].classList.add('active');
    const fails = results.filter(r => r.verdict === 'FAIL');
    const summary = {
      auditVersion: AUDIT_VERSION,
      artifactSha: opts.artifactSha || null,
      deck: document.title,
      slides: results.length,
      failing: fails.length,
      results
    };
    if (opts.log !== false) {
      console.log('%c[layout-audit] ' + (fails.length ? fails.length + ' slide(s) FAIL' : 'all ' + results.length + ' slides PASS'),
        'font-weight:bold;color:' + (fails.length ? '#c00' : '#0a0'));
      results.forEach(r => console.log(`  ${r.verdict === 'FAIL' ? '✗' : '✓'} ${r.slide}  cover=${r.coverage}` +
        (r.overlaps.length ? `  OVERLAP:${r.overlaps.map(o => o.a + '×' + o.b).join(', ')}` : '') +
        (r.overflow.length ? `  OVERFLOW:${r.overflow.map(o => o.el).join(', ')}` : '') +
        (r.emptyBands.length ? `  EMPTY:${r.emptyBands.join(',')}` : '') +
        ((r.typeViolations || []).length ? `  TYPE:${r.typeViolations.map(t => t.el + ' ' + t.px + 'px<' + t.min).join(', ')}` : '') +
        ((r.contrast || []).length ? `  CONTRAST:${r.contrast.map(c => c.el + ' ' + c.ratio + ':1<' + c.floor).join(', ')}` : '') +
        ((r.contrastAdvisory || []).length ? `  contrast?(gradient, verify):${r.contrastAdvisory.map(c => c.el + ' ' + c.ratio + ':1').join(', ')}` : '')));
    }
    global.__layoutAudit = summary;
    return summary;
  }

  global.auditDeck = auditDeck;
  global.auditSlide = () => auditSlide(document.querySelector('.slide.active'));
  if (/[?&]audit=1/.test(location.search)) {
    addEventListener('load', () => setTimeout(() => auditDeck(), 800));
  }
})(typeof window !== 'undefined' ? window : globalThis);
