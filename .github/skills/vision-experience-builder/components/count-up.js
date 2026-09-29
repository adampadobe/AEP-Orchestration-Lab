/* ============================================================
 * count-up.js — number animator + slide controller hook
 * Use this when any slide has a money / metric / % reveal.
 *
 * Usage in HTML:
 *   <span class="cu" data-to="5329" data-pre="£" data-delay="1100">£0</span>
 *   <span class="cu" data-to="91"  data-suf="%">0%</span>
 *
 * Attributes:
 *   data-to     final integer value         (required)
 *   data-pre    prefix string  (e.g. "£")   (optional)
 *   data-suf    suffix string  (e.g. "%")   (optional)
 *   data-delay  ms to wait before counting  (optional, default 0)
 *
 * For radial gauges, pair with .gauge .val SVG circle carrying data-pct.
 * GC = 2 * pi * 52 = circumference of the standard gauge ring.
 *
 * Calls reset on slide-leave and re-runs on slide-enter, so figures
 * count up FRESH every time the audience reaches them (don't show a
 * settled total on first paint — that loses the punchline).
 * ============================================================ */

const sl = [...document.querySelectorAll('.slide')];
const cur = document.getElementById('cur');
let i = 0;
const GC = 326.7; // gauge circumference 2*PI*52
const fmt = n => n.toLocaleString('en-GB');

function resetCu(el){ el.textContent = (el.dataset.pre||'') + '0' + (el.dataset.suf||''); }

function countUp(el){
  const to    = +el.dataset.to,
        pre   = el.dataset.pre || '',
        suf   = el.dataset.suf || '',
        delay = +(el.dataset.delay || 0),
        dur   = 1100;
  resetCu(el);
  setTimeout(() => {
    let t0 = null;
    (function step(ts){
      if(!t0) t0 = ts;
      const p = Math.min((ts - t0)/dur, 1),
            e = 1 - Math.pow(1 - p, 3);            // ease-out cubic
      el.textContent = pre + fmt(Math.round(to * e)) + suf;
      if(p < 1) requestAnimationFrame(step);
    })(performance.now());
  }, delay);
}

function resetSlide(s){
  s.querySelectorAll('.cu').forEach(resetCu);
  s.querySelectorAll('.gauge .val').forEach(c => c.style.strokeDashoffset = GC);
}

function animateActive(s){
  s.querySelectorAll('.cu').forEach(countUp);
  s.querySelectorAll('.gauge .val').forEach(c => {
    const pct = +c.dataset.pct;
    c.style.strokeDashoffset = GC;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      c.style.strokeDashoffset = GC * (1 - pct/100);
    }));
  });
}

function show(n){
  i = (n + sl.length) % sl.length;
  sl.forEach((s, x) => {
    const on = (x === i);
    s.classList.toggle('active', on);
    if(!on) resetSlide(s);
  });
  cur.textContent = String(i+1).padStart(2, '0');
  const a = sl[i];
  // dark-theme counter when on a dark interstitial / divider / journey
  const dark = a.classList.contains('journey')
            || a.classList.contains('divider')
            || a.classList.contains('tslide');
  const counter = document.querySelector('.counter');
  if(counter){
    counter.style.color = dark ? 'rgba(255,255,255,.6)' : '';
    cur.style.color     = dark ? '#fff' : '';
  }
  resetSlide(a);
  animateActive(a);
}

// stage scaler — keeps the 1920×1080 stage inside any viewport
function scaleStage(){
  const s = document.querySelector('.deck-stage');
  const k = Math.min(innerWidth/1920, innerHeight/1080);
  s.style.transform = `translate(${(innerWidth-1920*k)/2}px,${(innerHeight-1080*k)/2}px) scale(${k})`;
}
addEventListener('resize', scaleStage);
scaleStage();

// initial state
sl.forEach((s, x) => { if(x !== 0) resetSlide(s); });
animateActive(sl[0]);

// keyboard + click nav
addEventListener('keydown', e => {
  if([' ','ArrowRight','PageDown'].includes(e.key)){ e.preventDefault(); show(i+1); }
  else if(['ArrowLeft','PageUp'].includes(e.key)){  e.preventDefault(); show(i-1); }
});
document.querySelector('.deck-viewport').addEventListener('click', e => {
  if(e.target.closest('iframe')) return;
  show(i+1);
});
window.show = show;
window.scaleStage = scaleStage;
