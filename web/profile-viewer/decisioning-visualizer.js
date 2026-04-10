/**
 * Decisioning visualiser — interactive ranking methods (embedded on decisioning-catalog).
 */
(function () {
  'use strict';

// ── TAB NAVIGATION ────────────────────────────────────────────────────────
function showPanel(id) {
  document.getElementById('dceVizRoot').querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('dceVizRoot').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('dceViz-panel-' + id).classList.add('active');

  const idx = ['overview','priority','formula','ai','experiment'].indexOf(id);
  document.getElementById('dceVizRoot').querySelectorAll('.tab-btn')[idx].classList.add('active');
  var _sec = document.getElementById('decisioning-visualiser'); if (_sec) _sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── OFFER PRIORITY ────────────────────────────────────────────────────────
const offers = [
  { name: '🎬 Annual Plan — 2 months free', sub: 'Highest value · Long-term commitment', id: 's1' },
  { name: '📺 Premium HD — First month £4.99', sub: 'Mid-tier entry point · Monthly rolling', id: 's2' },
  { name: '🔔 30-Day Free Trial', sub: 'Low commitment · Acquisition offer', id: 's3' },
];

// Build persistent DOM nodes once — we'll reorder them, never recreate
function buildPriorityList() {
  const list = document.getElementById('dceViz-priority-list');
  list.innerHTML = '';
  offers.forEach(o => {
    const el = document.createElement('div');
    el.className = 'offer-row';
    el.dataset.offerId = o.id;
    el.innerHTML = `
      <div class="offer-score-badge" id="dceViz-badge-${o.id}">0</div>
      <div style="flex:1; min-width:0;">
        <div class="offer-name">${o.name}</div>
        <div class="offer-sub">${o.sub}</div>
        <div class="priority-bar-wrap">
          <div class="priority-bar-track">
            <div class="priority-bar-fill" id="bar-${o.id}" style="width:0%"></div>
          </div>
        </div>
      </div>
      <div class="crown">👑</div>
    `;
    list.appendChild(el);
  });
}

function updatePriority() {
  const vals = offers.map(o => ({ ...o, score: parseInt(document.getElementById('dceViz-' + o.id).value, 10) }));
  document.getElementById('dceViz-s1-val').textContent = vals[0].score;
  document.getElementById('dceViz-s2-val').textContent = vals[1].score;
  document.getElementById('dceViz-s3-val').textContent = vals[2].score;

  const sorted = [...vals].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...vals.map(v => v.score));
  const winner = sorted[0];
  const list = document.getElementById('dceViz-priority-list');

  // ── FLIP: record First positions ──────────────────────────────────────
  const nodes = {};
  offers.forEach(o => {
    const el = list.querySelector(`[data-offer-id="${o.id}"]`);
    nodes[o.id] = el;
    el._firstTop = el.getBoundingClientRect().top;
  });

  // ── Update badges, bars, winner class (still in old order) ────────────
  vals.forEach(o => {
    document.getElementById(`dceViz-badge-${o.id}`).textContent = o.score;
    document.getElementById(`dceViz-bar-${o.id}`).style.width = maxScore > 0 ? `${(o.score / maxScore) * 100}%` : '0%';
  });
  offers.forEach(o => {
    nodes[o.id].classList.toggle('winner', o.id === winner.id);
  });

  // ── Reorder DOM nodes into new sort order ─────────────────────────────
  sorted.forEach(o => list.appendChild(nodes[o.id]));

  // ── FLIP: record Last positions, invert & play ────────────────────────
  sorted.forEach(o => {
    const el = nodes[o.id];
    const lastTop = el.getBoundingClientRect().top;
    const delta = el._firstTop - lastTop;
    if (Math.abs(delta) > 1) {
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';
      // Force reflow
      el.getBoundingClientRect();
      el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
      el.style.transform = 'translateY(0)';
    }
  });

  document.getElementById('dceViz-winner-label').textContent = winner.name.replace(/^.\s/, '');
}

buildPriorityList();
updatePriority();

// ── RANKING FORMULA ───────────────────────────────────────────────────────
// Each item has its own expiry window (expiresIn hours). Urgency ×2 fires
// per-item when sliderHours ≤ item.expiresIn, producing visible rank flips:
//
//  🎭 DRAMA  ≥37h: Drama=105★ Docs=85  Kids=78  | 21-36h: Docs=170★ Drama=105 (flip!) | ≤20h: Drama=180★
//  🎥 DOCS   ≥37h: Docs=115★  Kids=78  Drama=75 | ≤20h: Drama=150 overtakes Kids=78 (#2/#3 flip!)
//  🧸 KIDS   ≥37h: Kids=108★  Docs=85  Drama=75 | 21-36h: Docs=170★ Kids=108 (flip!) | ≤10h: Kids=186★

const formulaOffers = [
  { name: 'Drama Series — Annual Plan',  category: 'drama',       baseScore: 75, expiresIn: 20 },
  { name: 'Documentary Hub — Monthly',   category: 'documentary', baseScore: 85, expiresIn: 36 },
  { name: 'Kids & Family — Annual Plan', category: 'kids',        baseScore: 78, expiresIn: 10 },
];

let currentInterest = 'drama';
let currentPropensity = 'medium'; // low | medium | high
let currentCampaign = 'none';     // none | drama | documentary | kids

function setInterest(interest, btn) {
  currentInterest = interest;
  document.getElementById('dceVizRoot').querySelectorAll('#dceViz-panel-formula .toggle-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const ruleInterest = document.getElementById('dceViz-rule-interest');
  if (ruleInterest) ruleInterest.classList.add('active-rule');
  updateFormula();
}

function setPropensity(level, btn) {
  currentPropensity = level;
  // only deactivate sibling buttons in propensity group
  btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateFormula();
}

function setCampaign(group, btn) {
  currentCampaign = group;
  btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateFormula();
}

function computeFormulaScore(offer, interest, hours, propensity, campaign) {
  let score = offer.baseScore;
  const urgency = hours <= offer.expiresIn;
  const match = offer.category === interest;
  const highPropensity = propensity === 'high';
  const campaignMatch = campaign !== 'none' && offer.category === campaign;

  if (urgency) score *= 2;
  if (match) score += 30;
  if (highPropensity) score = Math.round(score * 1.5);
  if (campaignMatch) score += 50;

  return { score, urgency, match, highPropensity, campaignMatch };
}

function buildFormulaList() {
  const container = document.getElementById('dceViz-formula-offers');
  container.innerHTML = '';
  formulaOffers.forEach((o, i) => {
    const el = document.createElement('div');
    el.className = 'formula-input-row';
    el.dataset.formulaId = o.category;
    el.innerHTML = `
      <div class="formula-rank-num" id="dceViz-frank-${o.category}">${i + 1}</div>
      <div class="formula-input-label" style="flex:1;">
        <span class="formula-trophy-${o.category}"></span>
        <span style="color:white; font-weight:500;">${o.name}</span>
        <div class="formula-sub-${o.category}" style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:3px; line-height:1.5;"></div>
      </div>
      <div class="formula-input-value" id="dceViz-fscore-${o.category}" style="color:rgba(255,255,255,0.9); font-size:18px; font-weight:700;">—</div>
    `;
    container.appendChild(el);
  });
}

function updateFormula() {
  const hours = parseInt(document.getElementById('dceViz-hours-slider').value);
  document.getElementById('dceViz-hours-val').textContent = hours + 'h remaining';

  const urgencyActive = formulaOffers.some(o => hours <= o.expiresIn);

  // Show/hide urgency flag
  const urgencyFlag = document.getElementById('dceViz-urgency-flag');
  if (urgencyFlag) {
    urgencyFlag.style.display = urgencyActive ? 'flex' : 'none';
    const boostedNames = formulaOffers.filter(o => hours <= o.expiresIn).map(o => o.name.split('—')[0].trim());
    urgencyFlag.innerHTML = `⚡ Urgency ×2 active for: <strong style="margin-left:4px;">${boostedNames.join(', ')}</strong> — ranking order has changed.`;
  }

  // Show crossover hint when nothing is boosted yet
  const crossoverHint = document.getElementById('dceViz-crossover-hint');
  if (crossoverHint) {
    crossoverHint.style.display = !urgencyActive ? 'block' : 'none';
  }

  // Highlight active rules in builder UI
  const ruleUrgency = document.getElementById('dceViz-rule-urgency');
  if (ruleUrgency) {
    ruleUrgency.classList.toggle('active-rule', urgencyActive);
    const badge = document.getElementById('dceViz-urgency-badge');
    if (badge) badge.style.opacity = urgencyActive ? '1' : '0.3';
  }

  // Interest rule always active — update display value
  const interestDisplay = document.getElementById('dceViz-interest-val-display');
  if (interestDisplay) interestDisplay.textContent = currentInterest + ' (viewer genre → item.genre)';

  // Propensity rule — active when high
  const highPropensity = currentPropensity === 'high';
  const rulePropensity = document.getElementById('dceViz-rule-propensity');
  if (rulePropensity) {
    rulePropensity.classList.toggle('active-rule', highPropensity);
    const badge = document.getElementById('dceViz-propensity-badge');
    if (badge) badge.style.opacity = highPropensity ? '1' : '0.3';
  }

  // Campaign booster rule — active when a group is selected
  const campaignActive = currentCampaign !== 'none';
  const ruleCampaign = document.getElementById('dceViz-rule-campaign');
  if (ruleCampaign) {
    ruleCampaign.classList.toggle('active-rule', campaignActive);
    const badge = document.getElementById('dceViz-campaign-badge');
    if (badge) badge.style.opacity = campaignActive ? '1' : '0.3';
    const display = document.getElementById('dceViz-campaign-val-display');
    if (display) display.textContent = campaignActive ? currentCampaign : 'strategic';
  }

  const scored = formulaOffers.map(o => {
    const { score, urgency, match, highPropensity: hp, campaignMatch } = computeFormulaScore(o, currentInterest, hours, currentPropensity, currentCampaign);
    return { ...o, score, urgency, match, highPropensity: hp, campaignMatch };
  }).sort((a, b) => b.score - a.score);

  const winner = scored[0];

  // Update score in builder result bar
  const scoreEl = document.getElementById('dceViz-formula-score');
  if (scoreEl) scoreEl.textContent = winner.score;

  // Update formula expression in builder
  let expr = 'baseScore';
  if (winner.urgency) expr += ' × 2';
  if (winner.match) expr += ' + 30';
  if (winner.highPropensity) expr += ' × 1.5';
  if (winner.campaignMatch) expr += ' + 50';
  const exprEl = document.getElementById('dceViz-formula-expr-text');
  if (exprEl) exprEl.textContent = expr + ' = ' + winner.score;

  // Update winner panel
  const winnerEl = document.getElementById('dceViz-formula-winner');
  if (winnerEl) winnerEl.textContent = winner.name;

  let breakdown = `base(${winner.baseScore})`;
  if (winner.urgency) breakdown += ` × urgency(×2)`;
  if (winner.match) breakdown += ` + genre(+30)`;
  if (winner.highPropensity) breakdown += ` × propensity(×1.5)`;
  if (winner.campaignMatch) breakdown += ` + campaign(+50)`;
  breakdown += ` = ${winner.score}`;
  const bdEl = document.getElementById('dceViz-formula-breakdown');
  if (bdEl) bdEl.textContent = breakdown;

  // ── FLIP animation for ranked items list ─────────────────────────────────
  const container = document.getElementById('dceViz-formula-offers');
  const nodes = {};
  formulaOffers.forEach(o => {
    const el = container.querySelector(`[data-formula-id="${o.category}"]`);
    nodes[o.category] = el;
    el._firstTop = el.getBoundingClientRect().top;
  });

  // Update content in place (old order)
  scored.forEach((o, i) => {
    const isWinner = i === 0;
    const el = nodes[o.category];
    el.classList.toggle('winner-row', isWinner);
    el.style.borderColor = '';
    el.style.background = '';
    const rankNum = document.getElementById(`dceViz-frank-${o.category}`);
    if (rankNum) rankNum.textContent = i + 1;
    const trophy = el.querySelector(`.formula-trophy-${o.category}`);
    if (trophy) trophy.textContent = isWinner ? '🏆 ' : '';
    const sub = el.querySelector(`.formula-sub-${o.category}`);
    if (sub) sub.innerHTML = `${o.urgency ? `<span style="color:#f5a623;font-weight:600;">⚡ ×2 urgency</span> · ` : `<span style="color:rgba(255,255,255,0.35);">expires ${o.expiresIn}h</span> · `}${o.match ? '<span style="color:#5ecf90;font-weight:600;">🎯 +30 genre</span> · ' : ''}${o.highPropensity ? '<span style="color:#c4a3f0;font-weight:600;">🧠 ×1.5 propensity</span> · ' : ''}${o.campaignMatch ? '<span style="color:#f87171;font-weight:600;">🚀 +50 campaign</span> · ' : ''}base ${o.baseScore} → <strong style="color:white;">${o.score}</strong>`;
    const scoreSpan = document.getElementById(`dceViz-fscore-${o.category}`);
    if (scoreSpan) scoreSpan.textContent = o.score;
  });

  // Reorder DOM nodes
  scored.forEach(o => container.appendChild(nodes[o.category]));

  // FLIP: invert & play
  scored.forEach(o => {
    const el = nodes[o.category];
    const lastTop = el.getBoundingClientRect().top;
    const delta = el._firstTop - lastTop;
    if (Math.abs(delta) > 1) {
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';
      el.getBoundingClientRect(); // force reflow
      el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
      el.style.transform = 'translateY(0)';
    }
  });
}

// Initialise formula panel at 48h (nothing boosted) so the flip is demonstrable by dragging left
buildFormulaList();
document.getElementById('dceViz-hours-val').textContent = '48h remaining';
document.getElementById('dceViz-hours-slider').value = 48;
updateFormula();

// ── AI MODELS ─────────────────────────────────────────────────────────────
const profiles = [
  {
    reasoning: '🧠 <strong>Model reasoning:</strong> Maya streams 20+ hours/month — she already loves the product. High engagement signals low price-sensitivity. The model predicts she\'ll commit to an annual plan if anchored with the "2 months free" value framing. A free trial would be wasted on someone who\'s already sold.',
    ranks: [
      { name: 'Annual Plan — 2 months free',       why: 'High engagement → ready to commit long-term',               conf: 92 },
      { name: 'Premium HD — Monthly',               why: 'Fallback if annual feels like too much',                    conf: 71 },
      { name: '30-Day Free Trial',                  why: 'Low relevance — she already uses the free tier heavily',    conf: 34 },
      { name: 'Family Plan — 3 screens',            why: 'No multi-user signals in her behaviour',                    conf: 18 },
      { name: 'Student Discount Plan',              why: 'Age & usage profile doesn\'t match',                        conf: 9  },
      { name: '7-Day Free Trial — No card required',why: 'Too short — high engager needs commitment framing',         conf: 6  },
      { name: 'Monthly Plan — Cancel anytime',      why: 'Annual offer dominates; monthly adds little incremental value', conf: 4 },
    ]
  },
  {
    reasoning: '🧠 <strong>Model reasoning:</strong> Marcus watches infrequently and primarily uses a desktop browser — a signal of passive intent. He\'s never clicked a subscription prompt before. The model predicts he needs a low-stakes entry point with no credit card friction. Long-term commitment items will likely cause drop-off.',
    ranks: [
      { name: '7-Day Free Trial — No card required',why: 'Zero friction → matches low-commitment signals',            conf: 87 },
      { name: 'Monthly Plan — Cancel anytime',      why: 'Short commitment horizon fits his usage pattern',           conf: 64 },
      { name: 'Student Discount Plan',              why: 'Price sensitivity signal, though age uncertain',            conf: 41 },
      { name: 'Annual Plan — 2 months free',        why: 'Too long a commitment for passive viewer',                  conf: 22 },
      { name: 'Family Plan — 3 screens',            why: 'Single-device usage — no multi-screen need',               conf: 8  },
      { name: '30-Day Free Trial',                  why: 'Longer trial unlikely to convert passive user',             conf: 5  },
      { name: 'Premium HD — Monthly',               why: 'Price point too high for low-intent profile',              conf: 3  },
    ]
  },
  {
    reasoning: '🧠 <strong>Model reasoning:</strong> The García household streams across 3 devices simultaneously, with both kids and adult content. This is the clearest signal for a family plan. The model has seen this pattern convert at 2.4× the rate of individual plans for households with similar multi-device behaviour.',
    ranks: [
      { name: 'Family Plan — 3 screens',            why: 'Multi-device usage is the #1 conversion predictor',        conf: 94 },
      { name: 'Annual Plan — 2 months free',        why: 'High engagement household justifies annual savings',        conf: 68 },
      { name: 'Premium HD — Monthly',               why: 'Good fallback if family plan price is a barrier',          conf: 45 },
      { name: '30-Day Free Trial',                  why: 'Already active — trial doesn\'t add perceived value',      conf: 21 },
      { name: '7-Day Free Trial — No card required',why: 'Too short for a household to evaluate properly',           conf: 11 },
      { name: 'Monthly Plan — Cancel anytime',      why: 'Family needs multi-screen, not flexibility',               conf: 7  },
      { name: 'Student Discount Plan',              why: 'Household profile doesn\'t match student segment',         conf: 2  },
    ]
  },
];

function selectProfile(idx, el) {
  document.getElementById('dceVizRoot').querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const p = profiles[idx];
  document.getElementById('dceViz-ai-reasoning').innerHTML = p.reasoning;
  renderAiRanks(p.ranks);
}

// All unique item names — same order every time so nodes are stable
const allAiItems = [...new Set(profiles.flatMap(p => p.ranks.map(r => r.name)))];

function buildAiRanksList() {
  const container = document.getElementById('dceViz-ai-ranks');
  container.innerHTML = '';
  allAiItems.forEach(name => {
    const el = document.createElement('div');
    el.className = 'ai-offer-row';
    el.dataset.aiItem = name;
    el.style.cssText = 'flex-direction:column; align-items:stretch; gap:6px; padding:10px 14px;';
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="ai-rank" data-rank-num>1</div>
        <div class="ai-offer-name" style="flex:1;">${name}</div>
        <div class="ai-confidence">
          <div class="conf-bar"><div class="conf-fill" data-conf-fill style="width:0%"></div></div>
          <span style="min-width:30px; text-align:right;" data-conf-pct>0%</span>
        </div>
      </div>
      <div style="font-size:11px; padding-left:34px; font-style:italic;" data-why></div>
    `;
    container.appendChild(el);
  });
}

function renderAiRanks(ranks) {
  const container = document.getElementById('dceViz-ai-ranks');

  // ── FLIP: record First positions (all nodes always visible) ──────────
  const nodes = {};
  allAiItems.forEach(name => {
    const el = container.querySelector(`[data-ai-item="${CSS.escape(name)}"]`);
    if (el) { nodes[name] = el; el._firstTop = el.getBoundingClientRect().top; }
  });

  // ── Update content in place, still in old order ───────────────────────
  ranks.forEach((r, i) => {
    const el = nodes[r.name];
    if (!el) return;
    el.classList.toggle('top', i === 0);
    el.querySelector('[data-rank-num]').textContent = i + 1;
    el.querySelector('[data-conf-fill]').style.width = r.conf + '%';
    el.querySelector('[data-conf-pct]').textContent = r.conf + '%';
    const why = el.querySelector('[data-why]');
    why.textContent = r.why;
    why.style.color = i === 0 ? '#1a7a4a' : '#9a948e';
  });

  // ── Reorder DOM nodes into new sort order ─────────────────────────────
  ranks.forEach(r => container.appendChild(nodes[r.name]));

  // ── FLIP: record Last positions, invert & play ────────────────────────
  ranks.forEach(r => {
    const el = nodes[r.name];
    if (!el) return;
    const lastTop = el.getBoundingClientRect().top;
    const delta = el._firstTop - lastTop;
    if (Math.abs(delta) > 1) {
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';
      el.getBoundingClientRect(); // force reflow
      el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
      el.style.transform = 'translateY(0)';
    }
  });
}

buildAiRanksList();
renderAiRanks(profiles[0].ranks);
document.getElementById('dceViz-ai-reasoning').innerHTML = profiles[0].reasoning;

  function scrollToVizIfHash() {
    if (window.location.hash === '#decisioning-visualiser') {
      var sec = document.getElementById('decisioning-visualiser');
      if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrollToVizIfHash);
  } else {
    scrollToVizIfHash();
  }

  window.dceVizShowPanel = showPanel;
  window.dceVizUpdatePriority = updatePriority;
  window.dceVizUpdateFormula = updateFormula;
  window.dceVizSetInterest = setInterest;
  window.dceVizSetPropensity = setPropensity;
  window.dceVizSetCampaign = setCampaign;
  window.dceVizSelectProfile = selectProfile;
})();
