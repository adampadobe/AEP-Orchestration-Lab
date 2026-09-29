#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build cx-coworker-chat.html — the interactive Coworker demo.

Composes the SELF-CONTAINED demo from the banked screens/cx-enterprise-home so that component
stays the single source of truth: edit the screen, re-run this, never hand-edit the output.
(Same reason _cx-home-fold.html is generated: fetch() cannot read file:// and decks ship offline.)

Run:  python build_coworker.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOME = HERE.parent.parent / "screens" / "cx-enterprise-home"
OUT = HERE / "cx-coworker-chat.html"

home_css = (HOME / "sample.css").read_text(encoding="utf-8")
home_html = (HOME / "sample.html").read_text(encoding="utf-8")

# Strip the component's leading comment block; provenance is restated in the demo header.
home_html = re.sub(r"^<!--.*?-->\s*", "", home_html, flags=re.S)

# Icons: pull the real Adobe Spectrum workflow vectors (Apache-2.0) already banked, so nothing
# here is hand-drawn. Looked up by semantic label from the icon pack.
import json
PACK = json.loads((HERE.parent.parent / "icons" / "pack.json").read_text(encoding="utf-8"))["icons"]


def ico(label):
    svg = PACK[label]["svg"]
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r'\s(width|height)="[^"]*"', "", svg, count=2)
    return re.sub(r"\s+", " ", svg).strip()


def wico(label):
    """Wrapped icon. The component's `.cx-home svg{width:100%;height:100%}` means a bare <svg>
    fills whatever box it lands in, so everything injected must carry the .cx-ico wrapper."""
    return '<span class="cx-ico">' + ico(label) + "</span>"


ADOBE_ICON = ('<svg viewBox="0 0 512 512" role="img" aria-label="Adobe">'
              '<rect x="16" y="16" width="480" height="480" rx="116" fill="#EB1000"/>'
              '<path transform="translate(131 141) scale(1.497)" fill="#fff" '
              'd="M97.69 150.12L85.72 116.83H55.7L80.94 53.3L119.23 150.12H164.7L104 4.35H61.14L0 150.12H97.69Z"/></svg>')

CHAT_CSS = """
/* ============================================================================
   COWORKER CHAT VIEW
   The second view of the demo. Shares the cx-enterprise-home shell (header +
   rail) so the two read as one product; only the content area swaps.

   Real values recovered from the saved Adobe CX Enterprise page
   (KSIA/Chat _ AI Assistant _ Adobe Experience Cloud.htm, 17 Jul 2026):
     --shell-header-height: 49px
     .spectrum-ShellContainer-content { border-top-left-radius: 16px }
   The saved page is a React app: ONLY the shell survived the save, so every
   piece of chat content below is reconstructed from the screenshot against the
   verified cx-enterprise-home token set. Do not treat it as design-exact the
   way cx-enterprise-home is (that one is asserted against Figma by verify.py).
   ========================================================================= */

/* the content panel's rounded top-left corner, straight from the real CSS */
.cx-stage{border-top-left-radius:16px;}
/* In the conversation the panel is plain white, per the live product: the indigo wash and the
   hue-sweep banner belong to the HOME surface only. Left in, the banner bleeds behind the whole
   chat and tints the messages. */
.app.chat .cx-stage{background:var(--cx-layer-2);}
.app.chat .cx-banner{display:none;}

/* View switching. The :not([hidden]) is load-bearing, not decoration: an id selector
   (specificity 100) beats .cx-view[hidden] (20), so a bare `#view-chat{display:flex}` would
   override the hidden attribute. The panel then stays laid out and invisible ON TOP of the
   home view, silently eating every click on the suggested chips. */
.cx-view{position:absolute; inset:0;}
.cx-view[hidden]{display:none;}
#view-home:not([hidden]){animation:cwFade .32s ease both;}
#view-chat:not([hidden]){display:flex; flex-direction:column; animation:cwFade .32s ease both;}
@keyframes cwFade{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;}}

/* rail: chat is the selected item once we are in the conversation.
   #292929 is Alias/background/neutral-selected/default — a real published token. */
.cx-rail-i.sel{background:var(--cx-content);}
.cx-rail-i.sel .cx-ico{--iconPrimary:#fff;}

/* ---------- conversation header ----------
   Opaque and above the stream: it does not overlap (they stack cleanly at y=114), but without a
   background the scrolled workplan butts straight against the title with nothing between them,
   which reads like a rendering fault. The background plus the fade below is what makes the
   scroll read as intentional. */
.cw-head{flex:0 0 auto; display:flex; align-items:center; gap:14px; padding:26px 40px 16px;
  background:var(--cx-layer-2); position:relative; z-index:2;}
.cw-head::after{content:""; position:absolute; left:0; right:0; bottom:-18px; height:18px;
  background:linear-gradient(180deg, var(--cx-layer-2), rgba(255,255,255,0)); pointer-events:none;}
.cw-head .cx-ico{width:26px; height:26px; flex:0 0 26px;}
.cw-head b{font-size:22px; font-weight:700;}

/* ---------- stream ---------- */
.cw-stream{flex:1; overflow-y:auto; padding:30px 40px 10px; display:flex;
  flex-direction:column; gap:22px; scroll-behavior:smooth;}
.cw-stream::-webkit-scrollbar{width:8px;}
.cw-stream::-webkit-scrollbar-thumb{background:var(--cx-gray-200); border-radius:4px;}
/* flex:none is load-bearing. In a column flex container children shrink to fit by default, so
   without this the 6-step workplan gets crushed to ~145px and shows 1.5 steps while still
   reporting "6 of 6" — it must keep its height and let the stream scroll instead. */
.cw-stream > *{flex:0 0 auto;}

.cw-msg{max-width:940px; animation:cwIn .34s ease both;}
@keyframes cwIn{from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;}}
/* user: right-aligned pill. AI: plain text, no bubble — matches the product. */
.cw-msg.me{align-self:flex-end; background:var(--cx-indigo-100); border:1px solid var(--cx-indigo-200);
  border-radius:14px; padding:11px 18px; font-size:19px; line-height:26px;}
.cw-msg.ai{align-self:flex-start; font-size:21px; line-height:34px; color:var(--cx-content);}

.cw-typing{align-self:flex-start; display:flex; gap:6px; padding:6px 0;}
.cw-typing i{width:9px; height:9px; border-radius:50%; background:var(--cx-gray-300);
  animation:cwBlink 1.25s infinite;}
.cw-typing i:nth-child(2){animation-delay:.18s;} .cw-typing i:nth-child(3){animation-delay:.36s;}
@keyframes cwBlink{0%,80%,100%{opacity:.3; transform:translateY(0);} 40%{opacity:1; transform:translateY(-3px);}}

.cw-fb{display:flex; gap:14px; align-self:flex-start; margin-top:-10px;}
.cw-fb .cx-ico{width:19px; height:19px; flex:0 0 19px; opacity:.5; cursor:pointer; transition:.2s;}
.cw-fb .cx-ico:hover{opacity:1;}

/* ---------- workplan: the Coworker beat ----------
   Coworker states a named plan, then steps back and lets the agents run. The
   steps tick in CSC order (Planning, Workflow Ops, Creative Ideation, Asset
   Mgmt, Delivery, Optimisation) because that order is the house contract. */
.cw-plan{align-self:flex-start; width:940px; border:1px solid var(--cx-gray-200); border-radius:14px;
  background:var(--cx-layer-2); box-shadow:0 1px 6px var(--cx-shadow-ambient); overflow:hidden;
  animation:cwIn .34s ease both;}
.cw-plan-hd{padding:16px 20px; border-bottom:1px solid var(--cx-gray-100); display:flex;
  align-items:center; gap:10px; font-size:15px; font-weight:700;}
.cw-plan-hd .cx-ico{width:18px; height:18px; flex:0 0 18px;}
.cw-plan-hd .cw-count{margin-left:auto; font-size:13px; font-weight:600; color:var(--cx-gray-600);}
.cw-step{display:flex; align-items:flex-start; gap:14px; padding:13px 20px;
  border-bottom:1px solid var(--cx-gray-100); opacity:.45; transition:opacity .4s, background .4s;}
.cw-step:last-child{border-bottom:0;}
.cw-step.live{opacity:1; background:var(--cx-accent-subtle);}
.cw-step.done{opacity:1;}
.cw-dot{width:22px; height:22px; flex:0 0 22px; border-radius:50%; border:2px solid var(--cx-gray-300);
  display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;
  color:var(--cx-gray-600); margin-top:1px; transition:.3s;}
.cw-step.live .cw-dot{border-color:var(--cx-static-blue); color:var(--cx-static-blue);
  animation:cwPulse 1.3s infinite;}
.cw-step.done .cw-dot{border-color:var(--cx-content); background:var(--cx-content); color:#fff;}
@keyframes cwPulse{0%,100%{box-shadow:0 0 0 0 rgba(59,99,251,.35);} 50%{box-shadow:0 0 0 6px rgba(59,99,251,0);}}
.cw-st b{display:block; font-size:15px; font-weight:700; line-height:20px;}
.cw-st span{display:block; font-size:13px; line-height:18px; color:var(--cx-gray-600); margin-top:2px;}
.cw-agent{margin-left:auto; align-self:center; height:22px; padding:0 10px; border-radius:11px;
  background:var(--cx-gray-100); color:var(--cx-gray-600); font-size:11px; font-weight:700;
  line-height:22px; white-space:nowrap; transition:.3s;}
.cw-step.live .cw-agent{background:var(--cx-static-blue); color:#fff;}
.cw-step.done .cw-agent{background:var(--cx-accent-subtle); color:var(--cx-static-blue);}

/* ---------- artifacts ---------- */
.cw-arts{align-self:flex-start; display:grid; grid-template-columns:repeat(3,300px); gap:14px;
  animation:cwIn .34s ease both;}
.cw-art{border:1px solid var(--cx-gray-200); border-radius:12px; background:var(--cx-layer-2);
  box-shadow:0 1px 6px var(--cx-shadow-ambient); overflow:hidden;}
.cw-art-top{height:74px; display:flex; align-items:center; justify-content:center;}
.cw-art-top .cx-ico{width:24px; height:24px; flex:none; opacity:.62;}
.cw-art-b{padding:12px 14px;}
.cw-art-b b{display:block; font-size:14px; font-weight:700; line-height:19px;}
.cw-art-b span{display:block; font-size:12px; line-height:16px; color:var(--cx-gray-600); margin-top:4px;}

/* ---------- quick replies ---------- */
.cw-chips{align-self:flex-start; display:flex; gap:10px; flex-wrap:wrap;}
.cw-chip{height:40px; padding:0 18px; border-radius:20px; background:var(--cx-layer-2);
  border:1px solid var(--cx-gray-300); font-family:inherit; font-size:15px; font-weight:600;
  color:var(--cx-content); cursor:pointer; transition:.18s; animation:cwIn .3s ease both;}
.cw-chip:hover{border-color:var(--cx-static-blue); color:var(--cx-static-blue);
  background:var(--cx-accent-subtle);}

/* ---------- composer ---------- */
.cw-foot{flex:0 0 auto; padding:12px 40px 20px;}
.cw-prompt{border:1px solid var(--cx-gray-300); border-radius:16px; background:var(--cx-layer-2);
  box-shadow:0 1px 6px var(--cx-shadow-key); padding:16px 18px 12px; transition:border-color .2s;}
.cw-prompt:focus-within{border-color:var(--cx-static-blue);}
.cw-input{min-height:30px; font-size:17px; line-height:24px; color:var(--cx-content); outline:0;}
.cw-input:empty::before{content:attr(data-ph); color:var(--cx-gray-600);}
.cw-tools{display:flex; align-items:center; gap:10px; margin-top:12px;}
.cw-pill{height:32px; padding:0 12px; border-radius:16px; border:1px solid var(--cx-gray-200);
  display:flex; align-items:center; gap:7px; font-size:13px; font-weight:600; white-space:nowrap;
  cursor:pointer; transition:.18s;}
.cw-pill:hover{background:var(--cx-layer-1);}
.cw-pill .cx-ico{width:15px; height:15px; flex:0 0 15px;}
.cw-pill.ctx{max-width:560px; overflow:hidden; text-overflow:ellipsis; display:flex;}
.cw-pill.ctx span{overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.cw-send{width:32px; height:32px; flex:0 0 32px; border-radius:50%; background:var(--cx-gray-100);
  display:flex; align-items:center; justify-content:center; margin-left:auto; cursor:pointer;
  transition:.2s;}
.cw-send .cx-ico{width:16px; height:16px; flex:0 0 16px; --iconPrimary:var(--cx-disabled);}
.cw-send.on{background:var(--cx-content);}
.cw-send.on .cx-ico{--iconPrimary:#fff;}
.cw-terms{margin-top:12px; text-align:center; font-size:12px; line-height:16px; color:var(--cx-gray-600);}
.cw-terms u{cursor:pointer;}

/* home prompt bar becomes a real control in the demo */
.cx-prompt{cursor:text;}
.cx-prompt .cx-prompt-ph{outline:0; min-height:20px;}
.cx-prompt .cx-prompt-ph:empty::before{content:attr(data-ph); color:var(--cx-gray-600);}
.cx-chip{cursor:pointer; transition:.18s;}
.cx-chip:hover{border-color:var(--cx-static-blue); box-shadow:0 2px 10px rgba(59,99,251,.16);}
.cx-round{cursor:pointer; transition:.2s;}
.cx-round.on{background:var(--cx-content);}
.cx-round.on .cx-ico{--iconPrimary:#fff;}

/* reset affordance for a live demo */
.cw-reset{position:absolute; right:18px; bottom:14px; z-index:40; height:30px; padding:0 14px;
  border-radius:15px; border:1px solid var(--cx-gray-300); background:var(--cx-layer-2);
  font-family:inherit; font-size:12px; font-weight:700; color:var(--cx-gray-600); cursor:pointer;
  opacity:.5; transition:.2s;}
.cw-reset:hover{opacity:1; color:var(--cx-content);}
"""

CHAT_HTML = """
    <!-- ===================== VIEW 2: the conversation ===================== -->
    <div class="cx-view" id="view-chat" hidden>
      <div class="cw-head">{ICO_CHAT}<b data-slot="conversation-title">New conversation</b></div>
      <div class="cw-stream" id="stream"></div>
      <div class="cw-foot">
        <div class="cw-prompt">
          <div class="cw-input" id="cwInput" contenteditable="true" data-ph="Ask anything"></div>
          <div class="cw-tools">
            <span class="cx-plus">{ICO_ADD}</span>
            <span class="cw-pill">{ICO_LIB}Prompt library</span>
            <span class="cw-pill ctx" data-slot="sandbox-context">{ICO_DATA}<span>Experience Platform &bull; EMEA UK SC (NLD2) &bull; tclarke - Omni-Channe&hellip;</span></span>
            <span class="cw-send" id="cwSend">{ICO_SEND}</span>
          </div>
        </div>
        <p class="cw-terms">Responses are generated using AI, and may be inaccurate. Check before using. <u>AI User Guidelines</u></p>
      </div>
    </div>
"""

JS = """
<script>
/* ===========================================================================
   Interaction model lifted from app-screens/interactive/brand-concierge.html:
   typing() -> them()/me() -> chips() -> route(), with a rail that lights per
   stage. Here the "agent rail" is the Coworker WORKPLAN, because that is the
   house choreography for this surface: Coworker names a plan, steps back, the
   named agents run, artifacts land, and the marketer answers in directives.

   SCRIPT is data. To retarget this template, edit SCRIPT and PLANS only —
   never the Adobe product chrome above (same contract as aep-xray:
   parameterize data, never rebrand).
   =========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, html) => { const e = document.createElement(t); e.className = c; if (html != null) e.innerHTML = html; return e; };

/* Every icon is wrapped in .cx-ico. The parent component sets
   `.cx-home svg{width:100%;height:100%}`, so a RAW <svg> injected into a card stretches to fill
   it — the workplan header rendered as a full-width black blob before this. The wrapper is what
   constrains it. Never inject a bare <svg> into this DOM. */
const ICO = {
  plan: `{ICO_PLAN}`, rocket: `{ICO_ROCKET}`, promote: `{ICO_PROMOTE}`,
  audience: `{ICO_AUDIENCE}`, up: `{ICO_UP}`, down: `{ICO_DOWN}`, view: `{ICO_VIEW}`
};

/* Workplans, in CSC order: Planning -> Workflow Ops -> Creative Ideation
   (Firefly always here) -> Asset Mgmt -> Delivery -> Optimisation. */
const PLANS = {
  optimise: {
    title: 'Optimising campaign performance',
    steps: [
      ['Read the last 30 days',      'Spend, reach and conversion across every live campaign', 'Planning'],
      ['Find what is underperforming', 'Three campaigns below target cost per acquisition',     'Workflow Ops'],
      ['Draft replacement creative',  '200+ variations generated, on-brand, ready to review',   'Creative Ideation'],
      ['Version and store',           'Approved cuts filed against the campaign record',        'Asset Mgmt'],
      ['Stage the reallocation',      'Budget moved to the three best performers, held for you','Delivery'],
      ['Watch and report back',       'Daily check, flagged here the moment it moves',          'Optimisation']
    ],
    arts: [
      ['Performance read', '30 days, every live campaign', 'plan', 'g1'],
      ['Creative set', '212 variations, on-brand', 'rocket', 'g2'],
      ['Reallocation plan', 'Staged, awaiting your approval', 'promote', 'g3']
    ]
  },
  audience: {
    title: 'Fine-tuning the journey audience',
    steps: [
      ['Read the journey',        'Every entry rule and branch in the live flow',        'Planning'],
      ['Find the drop-off',       'Two branches losing people before the offer',         'Workflow Ops'],
      ['Rewrite the branch copy', 'Variants generated for the two weak steps',           'Creative Ideation'],
      ['Version and store',       'New copy filed against the journey record',           'Asset Mgmt'],
      ['Stage the change',        'Rules updated, held for your approval',               'Delivery'],
      ['Watch and report back',   'Conversion tracked per branch, flagged here',         'Optimisation']
    ],
    arts: [
      ['Journey read', 'Every rule and branch', 'plan', 'g1'],
      ['Branch copy', 'Variants for the two weak steps', 'rocket', 'g2'],
      ['Audience delta', '+18k reachable, staged', 'audience', 'g3']
    ]
  },
  version: {
    title: 'Building version B',
    steps: [
      ['Read version A',       'Creative, audience and results to date',      'Planning'],
      ['Set the test',         'One variable, sized for a clean read',        'Workflow Ops'],
      ['Generate version B',   '200+ variations, on-brand, ready to review',  'Creative Ideation'],
      ['Version and store',    'Both cuts filed against the campaign record', 'Asset Mgmt'],
      ['Stage the split',      '50/50, held for your approval',               'Delivery'],
      ['Call the winner',      'Significance watched, flagged here',          'Optimisation']
    ],
    arts: [
      ['Version A read', 'Creative, audience, results', 'plan', 'g1'],
      ['Version B set', '204 variations, on-brand', 'rocket', 'g2'],
      ['Test plan', '50/50 split, staged', 'promote', 'g3']
    ]
  }
};

/* Free-text falls back to the closest plan by keyword. A demo should never dead-end. */
function planFor(text) {
  const t = (text || '').toLowerCase();
  if (/audien|journey|segment|drop|fine.?tune/.test(t)) return 'audience';
  if (/version|test|a\\/b|\\bb\\b|variant|experiment/.test(t)) return 'version';
  return 'optimise';
}

const stream = () => $('#stream');
const scroll = () => requestAnimationFrame(() => { const s = stream(); s.scrollTop = s.scrollHeight; });

const C = {
  _plan: null,
  me(txt, after) { stream().append(el('div', 'cw-msg me', txt)); scroll(); after && setTimeout(after, 420); },
  typing() { const t = el('div', 'cw-typing', '<i></i><i></i><i></i>'); stream().append(t); scroll(); return t; },
  ai(html, after, wait = 700) {
    const t = this.typing();
    setTimeout(() => { t.remove(); stream().append(el('div', 'cw-msg ai', html)); scroll(); after && setTimeout(after, 300); }, wait);
  },
  fb() { const f = el('div', 'cw-fb', ICO.up + ICO.down); stream().append(f); scroll(); },
  chips(list) {
    const c = el('div', 'cw-chips', '');
    list.forEach(([label, go], i) => {
      const b = el('button', 'cw-chip', label);
      b.style.animationDelay = (i * .07) + 's';
      b.onclick = () => { c.remove(); this.me(label, () => this.route(go)); };
      c.append(b);
    });
    stream().append(c); scroll();
  },

  /* The workplan beat: Coworker names the plan, then steps back and the named
     agents run it. Steps tick one at a time so the room can read each one. */
  plan(key, after) {
    const P = PLANS[key];
    const card = el('div', 'cw-plan', '');
    card.innerHTML =
      `<div class="cw-plan-hd">${ICO.plan}<span class="cw-plan-t">${P.title}</span><span class="cw-count">0 of ${P.steps.length}</span></div>` +
      P.steps.map(([n, d, ag]) =>
        `<div class="cw-step"><span class="cw-dot"></span><span class="cw-st"><b>${n}</b><span>${d}</span></span><span class="cw-agent">${ag}</span></div>`
      ).join('');
    stream().append(card); scroll();

    const steps = [...card.querySelectorAll('.cw-step')];
    const count = card.querySelector('.cw-count');
    let i = 0;
    const tick = () => {
      if (i > 0) { steps[i - 1].classList.remove('live'); steps[i - 1].classList.add('done'); steps[i - 1].querySelector('.cw-dot').textContent = '✓'; }
      count.textContent = `${i} of ${steps.length}`;
      if (i === steps.length) { after && setTimeout(after, 420); return; }
      steps[i].classList.add('live');
      steps[i].querySelector('.cw-dot').textContent = i + 1;
      scroll(); i++;
      setTimeout(tick, 780);
    };
    setTimeout(tick, 380);
  },

  arts(key, after) {
    const P = PLANS[key];
    const a = el('div', 'cw-arts', P.arts.map(([t, s, ic, g]) =>
      `<div class="cw-art"><div class="cw-art-top ${g}">${ICO[ic] || ICO.plan}</div><div class="cw-art-b"><b>${t}</b><span>${s}</span></div></div>`
    ).join(''));
    stream().append(a); scroll(); after && setTimeout(after, 380);
  },

  /* ---- conversation ---- */
  open(text) {
    $('.app').classList.add('chat');
    $('#view-home').hidden = true;
    $('#view-chat').hidden = false;
    $('#rail-ai').classList.remove('on');
    $('#rail-ai').classList.add('sel');
    stream().innerHTML = '';
    this._plan = planFor(text);
    this.me(text, () => this.route('start'));
  },
  route(go) {
    const key = this._plan;
    if (go === 'start') {
      this.ai(`Here is how I would approach that. I will do the work and hold anything that needs your call.`,
        () => this.plan(key, () => this.ai(
          `Done. Everything is staged and nothing has gone out. Your call on the rest.`,
          () => this.arts(key, () => { this.fb(); this.chips([['Approve and ship it', 'ship'], ['Show me the creative', 'creative'], ['What did you change?', 'diff']]); })
        )));
    } else if (go === 'ship') {
      this.ai(`Shipped. I will watch it daily and flag the moment it moves. You will see it here first.`,
        () => this.chips([['Start something else', 'reset'], ['Show me the creative', 'creative']]));
    } else if (go === 'creative') {
      this.ai(`Generated on your brand kit, so tone, colour and logo lockups are already right. Nothing off-brand reaches a customer.`,
        () => this.arts(key, () => this.chips([['Approve and ship it', 'ship'], ['Start something else', 'reset']])));
    } else if (go === 'diff') {
      this.ai(`Nothing is live yet. I moved budget to the three best performers, drafted replacement creative for the three that were underperforming, and left both staged for you.`,
        () => this.chips([['Approve and ship it', 'ship'], ['Start something else', 'reset']]));
    } else if (go === 'reset') {
      this.home();
    }
  },
  home() {
    $('.app').classList.remove('chat');
    $('#view-chat').hidden = true;
    $('#view-home').hidden = false;
    $('#rail-ai').classList.remove('sel');
    $('#rail-ai').classList.add('on');
    const ph = $('#homeInput'); if (ph) ph.textContent = '';
    const r = $('#homeSend'); if (r) r.classList.remove('on');
  }
};

/* ---- entry: the home prompt bar is the way in ---- */
const homeInput = $('#homeInput'), homeSend = $('#homeSend');
const homeText = () => (homeInput.textContent || '').trim();
homeInput.addEventListener('input', () => homeSend.classList.toggle('on', !!homeText()));
homeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (homeText()) C.open(homeText()); }
});
homeSend.onclick = () => { if (homeText()) C.open(homeText()); };
/* the suggested chips are prompts too */
document.querySelectorAll('#view-home .cx-chip').forEach(c => {
  c.onclick = () => C.open(c.textContent.trim());
});

/* ---- composer inside the chat ---- */
const cwInput = $('#cwInput'), cwSend = $('#cwSend');
const cwText = () => (cwInput.textContent || '').trim();
const cwGo = () => {
  const t = cwText(); if (!t) return;
  cwInput.textContent = ''; cwSend.classList.remove('on');
  document.querySelectorAll('.cw-chips').forEach(c => c.remove());
  C._plan = planFor(t);
  C.me(t, () => C.route('start'));
};
cwInput.addEventListener('input', () => cwSend.classList.toggle('on', !!cwText()));
cwInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cwGo(); } });
cwSend.onclick = cwGo;

$('#cwReset').onclick = () => C.home();
</script>
"""


def build():
    # split the home component: keep header + rail as shared shell, wrap the column as view 1
    html = home_html

    # Tag the AI rail item so the demo can switch it to the dark selected state in chat.
    # It is the only .on item in the rail, so this anchor is unambiguous.
    n_before = html.count('<span class="cx-rail-i on">')
    html = html.replace('<span class="cx-rail-i on">', '<span class="cx-rail-i on" id="rail-ai">', 1)
    assert n_before == 1, f"expected exactly one active rail item to tag, found {n_before}"

    # make the home prompt bar live, and wrap the column as view 1
    html = html.replace('<span class="cx-prompt-ph">Ask anything</span>',
                        '<span class="cx-prompt-ph" id="homeInput" contenteditable="true" data-ph="Ask anything"></span>')
    html = html.replace('<span class="cx-round">', '<span class="cx-round" id="homeSend">', 1)
    html = html.replace('<div class="cx-col">', '<div class="cx-view" id="view-home"><div class="cx-col">', 1)
    # close view-home after the column, then append the chat view
    html = html.replace('    </div>\n  </div>\n</section>',
                        '    </div>\n    </div>\n' + chat_block() + '  </div>\n  <button class="cw-reset" id="cwReset">Reset demo</button>\n</section>')

    page = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<title>Adobe Coworker interactive demo</title>\n"
            "<!--\n"
            "  GENERATED by build_coworker.py — edit screens/cx-enterprise-home or this builder,\n"
            "  never this file. Self-contained and offline (no fetch, no deps).\n\n"
            "  View 1 is the banked screens/cx-enterprise-home, built from the real Figma source\n"
            "  (Summit-2026 node 538:36576) and asserted against it by that component's verify.py.\n"
            "  View 2 is the Coworker conversation, reconstructed from a screenshot of the live\n"
            "  Adobe CX Enterprise chat: the saved page was a React app and ONLY its shell\n"
            "  survived the save, so the chat panel is NOT design-exact the way view 1 is. Real\n"
            "  values recovered from it: --shell-header-height 49px, content radius 16px.\n\n"
            "  The two surfaces differ in the product ('Adobe Experience Cloud' vs 'Adobe CX\n"
            "  Enterprise'). The banked shell is kept across both views so the demo reads as one\n"
            "  product rather than two.\n\n"
            "  Interaction model is brand-concierge.html's: typing -> message -> chips -> route.\n"
            "  Adobe product UI: parameterize DATA ONLY (SCRIPT/PLANS in the script), never rebrand.\n"
            "-->\n<style>\n"
            "@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&display=swap');\n"
            "html,body{margin:0;background:#5b5f66;}\n"
            "/* stage: the 1440x2560 component hosted as an app window. See cx-enterprise-home\n"
            "   meta.json 'host' — the fold is the honest way to show a product page. */\n"
            ".app{position:relative;width:1440px;height:900px;margin:0 auto;overflow:hidden;\n"
            "     background:var(--cx-layer-1,#F8F8F8);}\n"
            ".app .cx-home{height:900px;}\n"
            ".app .cx-rail,.app .cx-stage{height:844px;}\n"
            + home_css + CHAT_CSS +
            "\n</style>\n</head>\n<body>\n<div class=\"app\">\n" + html + "\n</div>\n"
            + JS
            .replace("{ICO_PLAN}", wico("analytics")).replace("{ICO_ROCKET}", wico("quick-action"))
            .replace("{ICO_PROMOTE}", wico("campaign")).replace("{ICO_AUDIENCE}", wico("audience"))
            .replace("{ICO_UP}", wico("thumb-up")).replace("{ICO_DOWN}", wico("thumb-down"))
            .replace("{ICO_VIEW}", wico("view"))
            + "\n</body>\n</html>\n")
    # Every hook the script binds to. A missed string-surgery anchor silently produces a demo
    # that looks fine and dies on first click ($('#x').classList of null), so fail here instead.
    required = ["view-home", "view-chat", "rail-ai", "homeInput", "homeSend",
                "stream", "cwInput", "cwSend", "cwReset"]
    missing = [h for h in required if f'id="{h}"' not in page]
    if missing:
        raise SystemExit(f"[FAIL] anchors not applied, demo would break on click: {missing}")

    # House rule is ZERO em dashes in anything rendered. Comments are not rendered; <title> is.
    body = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"//[^\n]*", "", body)
    if "—" in body:
        raise SystemExit("[FAIL] em dash in rendered output (house rule: zero)")

    OUT.write_text(page, encoding="utf-8")
    print("wrote", OUT, "|", len(page), "bytes")
    print(f"[OK] all {len(required)} script anchors applied")
    print("[OK] zero em dashes outside comments")


def chat_block():
    return (CHAT_HTML
            .replace("{ICO_CHAT}", '<span class="cx-ico">' + ico("chat") + '</span>')
            .replace("{ICO_ADD}", '<span class="cx-ico">' + ico("add") + '</span>')
            .replace("{ICO_LIB}", '<span class="cx-ico">' + ico("analytics") + '</span>')
            .replace("{ICO_DATA}", '<span class="cx-ico">' + ico("data") + '</span>')
            .replace("{ICO_SEND}", '<span class="cx-ico">' + ico("send") + '</span>'))


build()
