/**
 * Decisioning demo — Persona journey concepts (A Canvas flow, B Swimlanes, C Stages).
 *
 * Presentation only: renders the AEP experience events already loaded by aep-profile-drawer.js
 * (same events, filters and story window as the classic journey) via the drawer's
 * setJourneyModalRenderer hook.
 *
 * Rollback (no deploy): append ?journey=classic to the URL, or run
 * localStorage.setItem('decisioningPersonaJourneyLayout', 'classic') and reload. ?journey=concepts restores.
 * Rollback (code): remove this script and stylesheet from the consuming demo.
 */
(function (global) {
  'use strict';
  const doc = global.document;
  const viewName = (global.envBarConfig && global.envBarConfig.decisioning && global.envBarConfig.decisioning.viewName) || doc.title;
  const BODY_CLASS = 'decisioning-journey-concepts';
  const VIEW_KEY = 'decisioningPersonaJourneyView';
  const PAIR_WINDOW_MS = 120000;
  const STAGE_GAP_MS = 30 * 60000;

  function classicRequested() {
    try {
      const param = new URLSearchParams(global.location.search).get('journey');
      if (param) {
        global.localStorage.setItem('decisioningPersonaJourneyLayout', param === 'classic' ? 'classic' : 'concepts');
        return param === 'classic';
      }
      return global.localStorage.getItem('decisioningPersonaJourneyLayout') === 'classic';
    } catch (_err) {
      return false;
    }
  }

  const LANES = {
    digital: { label: 'Events' },
    channel: { label: 'Channel' },
    web: { label: 'Web' },
    decisioning: { label: 'Decisioning' },
  };
  const LANE_ORDER = ['digital', 'channel', 'web', 'decisioning'];
  const VIEWS = { A: 'A · Canvas flow', B: 'B · Swimlanes', C: 'C · Stages' };
  const VIEW_NOTES = {
    A: 'One card per AEP experience event on a linear canvas, with the time between events on each connector.',
    B: 'Events placed in channel lanes so you can follow the customer hopping between events, channel, web and decisioning.',
    C: 'Events grouped into stages; each decisioning request and its PropositionDisplay collapse into one decision card.',
  };
  const ICONS = {
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  };

  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad2 = n => String(n).padStart(2, '0');
  const hm = ms => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  const dayShort = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  function dayLabel(ms) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : dayShort(ms);
  }
  function fmtGap(ms) {
    if (!Number.isFinite(ms)) return '';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 1) return '<1s';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  }

  function rowValue(rows, re) {
    const row = rows.find(r => re.test(String((r && r.path) || '')));
    return row && row.value != null && String(row.value).trim() ? String(row.value).trim() : '';
  }

  /** Normalise one AEP experience event for the concept views. */
  function describe(ev, h) {
    const rows = Array.isArray(ev && ev.rows) ? ev.rows : [];
    const type = String((ev && ev.eventType) || '').trim();
    const name = String((ev && ev.eventName) || '').trim();
    const low = `${type} ${name}`.toLowerCase();
    const pageName = rowValue(rows, /^(?:xdm\.)?web\.webPageDetails\.(name|viewName)$/);
    const isDisplay = (type || name).toLowerCase() === 'decisioning.propositiondisplay';
    const isDecisionRequest = name === viewName || pageName === viewName;
    const msgKind = h.messageChannelKind(ev);
    const isMessage = !!msgKind || /message\.(tracking|feedback)|messagetracking|messagefeedback/.test(low.replace(/\s+/g, ''));
    const isWeb = !isDecisionRequest && (h.isWebPageview(ev) || type.toLowerCase().startsWith('web'));
    const lane = isDisplay || isDecisionRequest || low.includes('decisioning') ? 'decisioning'
      : isMessage ? 'channel' : isWeb ? 'web' : 'digital';

    let title = '';
    try { title = h.title(ev); } catch (_err) { title = ''; }
    if (!title || !String(title).trim()) title = h.fallbackTitle(ev);
    let src = '';
    let short = '';
    if (isDecisionRequest) {
      title = viewName;
      src = 'Decision request';
    } else if (isDisplay) {
      title = 'Decisioning PropositionDisplay';
      short = 'PropositionDisplay';
    } else if (isWeb) {
      const parts = String(title).split(' \u2014 ');
      title = parts[0] || 'Web Pageview';
      src = parts.slice(1).join(' \u2014 ') || pageName || 'Web';
    } else if (isMessage) {
      src = [/feedback/.test(low) ? 'Feedback' : 'Tracking', msgKind === 'email' ? 'Email' : msgKind === 'push' ? 'Push' : '']
        .filter(Boolean).join(' · ');
    } else if (/flight\.?disruption/.test(low.replace(/\s+/g, ''))) {
      const kind = rowValue(rows, /flightDisruption\.disruptionType$/);
      const flight = rowValue(rows, /flightDisruption\.flightNumber$/);
      const delay = rowValue(rows, /flightDisruption\.delayMinutes$/);
      src = [kind ? kind.charAt(0) + kind.slice(1).toLowerCase() : 'Disruption', flight, kind === 'DELAY' && delay ? `${delay} min` : '']
        .filter(Boolean).join(' · ');
    } else if (/flight\.?abandon/.test(low.replace(/\s+/g, ''))) {
      const from = rowValue(rows, /flightSearch\.originAirport$/);
      const to = rowValue(rows, /flightSearch\.destinationAirport$/);
      const cabin = rowValue(rows, /flightSearch\.cabinClass$/);
      src = [from && to ? `${from} → ${to}` : 'Booking flow', cabin].filter(Boolean).join(' · ');
    } else {
      src = h.channel(ev) || 'Digital touchpoint';
    }

    let offer = '';
    let strategy = '';
    (h.decisionFields(ev) || []).forEach(([label, value]) => {
      if (label === 'Offer' && !offer) offer = value;
      if (label === 'Strategy' && !strategy) strategy = value;
    });
    const channelRow = rowValue(rows, /^(?:xdm\.)?(?:_[^.]+\.)?interactionDetails\.core\.channel$/).toLowerCase();
    const via = isDecisionRequest ? (channelRow === 'email' ? 'Email' : channelRow === 'web' ? 'Web' : '') : '';
    const ms = h.timestampMs(ev);
    return {
      ev, lane, title: String(title), short, src, offer, strategy, via,
      isDisplay, isDecisionRequest, ms: Number.isFinite(ms) ? ms : null,
      thumb: h.thumb(ev) || {},
    };
  }

  const S = { view: 'A', moment: 0, sel: null, events: [], items: [], stages: [], ctx: null };

  function readView() {
    try { const v = global.localStorage.getItem(VIEW_KEY); return VIEWS[v] ? v : 'A'; } catch (_err) { return 'A'; }
  }
  function saveView(v) { try { global.localStorage.setItem(VIEW_KEY, v); } catch (_err) { /* noop */ } }

  function buildModel(events, h) {
    const E = events.map(ev => describe(ev, h));
    for (let i = 1; i < E.length; i++) {
      const prev = E[i - 1];
      if (E[i].isDisplay && prev.isDecisionRequest && prev.ms != null && E[i].ms != null && E[i].ms - prev.ms <= PAIR_WINDOW_MS) {
        E[i].via = prev.via;
        E[i].pairedWith = i - 1;
        prev.pairedWith = i;
      }
    }
    const items = [];
    for (let i = 0; i < E.length; i++) {
      if (E[i].isDecisionRequest && E[i].pairedWith === i + 1) { items.push([i, i + 1]); i++; } else items.push([i]);
    }
    const stages = [];
    items.forEach((it, k) => {
      const first = E[it[0]];
      const prevStage = stages[stages.length - 1];
      const prevLast = prevStage ? E[items[prevStage.items[prevStage.items.length - 1]].slice(-1)[0]] : null;
      const split = !prevStage || first.ms == null || prevLast.ms == null ||
        first.ms - prevLast.ms > STAGE_GAP_MS || dayKey(first.ms) !== dayKey(prevLast.ms);
      if (split) stages.push({ items: [k] }); else prevStage.items.push(k);
    });
    stages.forEach(stage => {
      const idx = stage.items.flatMap(k => items[k]);
      const evs = idx.map(i => E[i]);
      const labels = [];
      const add = l => { if (!labels.includes(l)) labels.push(l); };
      evs.forEach(e => {
        if (e.lane === 'decisioning') add('Decisioning');
        else if (e.lane === 'channel') add('Messaging');
        else if (e.lane === 'web') add('Web');
        else if (/abandon/i.test(e.title)) add('Abandonment');
        else if (/disruption/i.test(e.title)) add('Disruption');
        else add('Events');
      });
      stage.name = labels.length > 2 ? `${labels.slice(0, 2).join(' & ')} +${labels.length - 2}` : labels.join(' & ');
      const firstMs = evs[0].ms;
      const lastMs = evs[evs.length - 1].ms;
      const decisions = stage.items.filter(k => items[k].length === 2).length;
      const range = firstMs == null ? '' : firstMs === lastMs ? hm(firstMs).slice(0, 5) : `${hm(firstMs).slice(0, 5)} – ${hm(lastMs).slice(0, 5)}`;
      stage.desc = [firstMs == null ? '' : dayLabel(firstMs), range, decisions ? `${decisions} decision${decisions > 1 ? 's' : ''}` : '']
        .filter(Boolean).join(' · ');
    });
    return { E, items, stages };
  }

  const gapBetween = (a, b) => (a && b && a.ms != null && b.ms != null ? fmtGap(b.ms - a.ms) : '');
  const isSel = arr => !!S.sel && arr.length === S.sel.length && arr.every((x, i) => x === S.sel[i]);

  function iconBox(e, cls) {
    const t = e.thumb || {};
    if (t.svg) return `<div class="dpj-ico dpj-lane--${e.lane} ${cls || ''}">${t.svg}</div>`;
    if (e.lane === 'web' || !t.url) return `<div class="dpj-ico dpj-lane--${e.lane} ${cls || ''}">${ICONS.globe}</div>`;
    return `<div class="dpj-ico dpj-ico--img dpj-lane--${e.lane} ${cls || ''}" style="background-image:${esc(t.url)}"></div>`;
  }
  const laneChip = e => `<span class="dpj-chip dpj-lane--${e.lane}">${esc(LANES[e.lane].label)}</span>`;

  function nodeHtml(e, i, extraClass, style) {
    const ghost = i >= S.moment;
    const sub = e.offer || e.src;
    return `<button type="button" class="dpj-node ${extraClass || ''}${isSel([i]) ? ' is-sel' : ''}${ghost ? ' is-ghost' : ''}" data-dpj-sel="${i}"${style ? ` style="${style}"` : ''}>` +
      `${iconBox(e)}<span class="dpj-node-body"><span class="dpj-t">${esc(e.short || e.title)}</span>` +
      `<span class="dpj-s${e.offer || e.isDecisionRequest ? ' dpj-s--accent' : ''}">${esc(sub)}</span>` +
      `${e.strategy ? `<span class="dpj-chip dpj-chip--muted">${esc(e.strategy)}</span>` : ''}` +
      `${e.via ? `<span class="dpj-chip dpj-chip--muted">${esc(e.via)}</span>` : ''}</span></button>`;
  }
  const conn = (label, ghost, extra) =>
    `<div class="dpj-conn${ghost ? ' is-ghost' : ''}" ${extra || ''}><i></i>${label ? `<b>${esc(label)}</b>` : '<span class="dpj-dot"></span>'}<i></i></div>`;

  function viewA() {
    const E = S.events;
    let h = '<div class="dpj-pad dpj-A"><div class="dpj-row"><div class="dpj-pill">▷ Start</div>';
    E.forEach((e, i) => {
      h += conn(i ? gapBetween(E[i - 1], e) : (e.ms != null ? dayShort(e.ms) : ''), i >= S.moment) + nodeHtml(e, i);
    });
    return `${h}${conn('')}<div class="dpj-pill">Now</div></div></div>`;
  }

  function viewB() {
    const E = S.events;
    const lanes = LANE_ORDER;
    const X0 = 140, DX = 230, W = 176, LH = 120, TOP = 46;
    const X = i => X0 + i * DX;
    const Y = i => TOP + lanes.indexOf(E[i].lane) * LH + LH / 2;
    const w = X0 + E.length * DX + 40;
    const hh = TOP + lanes.length * LH + 20;
    let h = `<div class="dpj-B" style="width:${w}px;height:${hh}px">`;
    lanes.forEach((l, k) => { h += `<div class="dpj-lane" style="top:${TOP + k * LH}px"><span>${esc(LANES[l].label)}</span></div>`; });
    for (let i = 1; i < E.length; i++) {
      if (E[i].ms != null && E[i - 1].ms != null && dayKey(E[i].ms) !== dayKey(E[i - 1].ms)) {
        h += `<div class="dpj-day" style="left:${X(i) - DX / 2 + W / 2}px"><em>${esc(dayShort(E[i - 1].ms))} ← → ${esc(dayShort(E[i].ms))}</em></div>`;
      }
    }
    let paths = '';
    let gaps = '';
    for (let i = 0; i < E.length - 1; i++) {
      const x1 = X(i) + W, y1 = Y(i), x2 = X(i + 1), y2 = Y(i + 1), m = (x1 + x2) / 2;
      const ghost = i + 1 >= S.moment;
      paths += `<path class="dpj-path${ghost ? ' is-ghost' : ''}" d="M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}"/>`;
      gaps += `<div class="dpj-gp" style="left:${m}px;top:${(y1 + y2) / 2}px">${esc(gapBetween(E[i], E[i + 1]))}</div>`;
    }
    h += `<svg class="dpj-svg" width="${w}" height="${hh}" aria-hidden="true">${paths}</svg>${gaps}`;
    E.forEach((e, i) => {
      if (e.ms != null) h += `<div class="dpj-tick" style="left:${X(i) + W / 2}px">${esc(hm(e.ms))}</div>`;
      h += nodeHtml(e, i, 'dpj-bnode', `left:${X(i)}px;top:${Y(i)}px`);
    });
    return `${h}</div>`;
  }

  function itemC(k) {
    const ev = S.items[k];
    const ghost = ev[0] >= S.moment;
    if (ev.length === 1) return nodeHtml(S.events[ev[0]], ev[0]);
    const a = S.events[ev[0]];
    const b = S.events[ev[1]];
    return `<button type="button" class="dpj-dec${isSel(ev) ? ' is-sel' : ''}${ghost ? ' is-ghost' : ''}" data-dpj-sel="${ev.join(',')}">` +
      `<span class="dpj-dec-hd">${iconBox(a)}<span class="dpj-node-body"><span class="dpj-t">Decision</span>` +
      `<span class="dpj-s">${esc(a.ms != null ? hm(a.ms) : '')}${a.via ? ` · ${esc(a.via)}` : ''}</span></span></span>` +
      `<span class="dpj-dec-bd"><span class="dpj-lbl">Offer displayed</span>` +
      `<span class="dpj-of">${esc(b.offer || 'Offer not returned on event')}</span>` +
      `${b.strategy ? `<span class="dpj-chip dpj-chip--muted">${esc(b.strategy)}</span>` : ''}</span></button>`;
  }

  function itemsPerColumn() {
    const root = S.ctx && S.ctx.track && S.ctx.track.querySelector('.dpj-root');
    const scroll = root && root.querySelector('.dpj-scroll');
    const h = scroll ? scroll.clientHeight : 0;
    if (!h) return 4;
    // ~64px pad + ~50px stage header; each item incl. connector ≈ 100px.
    return Math.max(2, Math.floor((h - 114) / 100));
  }

  function viewC() {
    const E = S.events;
    let h = '<div class="dpj-pad dpj-C"><div class="dpj-row dpj-row--top"><div class="dpj-pill dpj-pill--c">▷ Start</div>';
    S.stages.forEach((stage, si) => {
      const firstIdx = S.items[stage.items[0]][0];
      let label = '';
      if (si) {
        const prev = S.stages[si - 1];
        const lastIdx = S.items[prev.items[prev.items.length - 1]].slice(-1)[0];
        label = gapBetween(E[lastIdx], E[firstIdx]);
      }
      h += conn(label, firstIdx >= S.moment, 'data-dpj-c="1"');
      h += `<section class="dpj-grp"><h4>${esc(stage.name)}</h4><div class="dpj-rng">${esc(stage.desc)}</div><div class="dpj-cols"><div class="dpj-col">`;
      const perCol = itemsPerColumn();
      stage.items.forEach((k, j) => {
        if (j && j % perCol === 0) h += '</div><div class="dpj-col">';
        if (j) {
          const a = S.items[stage.items[j - 1]].slice(-1)[0];
          h += `<div class="dpj-vc"><b>${esc(gapBetween(E[a], E[S.items[k][0]]))}</b></div>`;
        }
        h += itemC(k);
      });
      h += '</div></div></section>';
    });
    return `${h}${conn('', false, 'data-dpj-c="1"')}<div class="dpj-pill dpj-pill--c">Now</div></div></div>`;
  }

  function detailsHtml() {
    if (!S.sel) return '';
    return S.sel.slice().reverse().map(i => {
      const e = S.events[i];
      const prev = i > 0 ? S.events[i - 1] : null;
      const ts = e.ms != null ? S.ctx.helpers.formatDate(e.ms) : '—';
      const body = e.offer
        ? `<div class="dpj-kv"><b>Offer:</b> ${esc(e.offer)}</div>${e.strategy ? `<div class="dpj-kv"><b>Strategy:</b> ${esc(e.strategy)}</div>` : ''}`
        : e.src ? `<div class="dpj-kv">${esc(e.src)}</div>` : '';
      const eventType = String((e.ev && (e.ev.eventType || e.ev.eventName)) || '').trim();
      return `<div class="dpj-ev">${iconBox(e, 'dpj-ico--round')}<div><div class="dpj-ts">${esc(ts)}</div>` +
        `<div class="dpj-ti">${esc(e.title)}</div>${body}` +
        `<div class="dpj-kv"><b>Channel:</b> ${esc(e.via || LANES[e.lane].label)}</div>` +
        `${eventType ? `<div class="dpj-kv"><b>Event type:</b> ${esc(eventType)}</div>` : ''}` +
        `${prev ? `<div class="dpj-kv"><b>Since previous event:</b> ${esc(gapBetween(prev, e))}</div>` : ''}</div></div>`;
    }).join('');
  }

  function render() {
    const root = S.ctx && S.ctx.track && S.ctx.track.querySelector('.dpj-root');
    if (!root) return;
    const total = S.events.length;
    root.querySelectorAll('[data-dpj-view]').forEach(btn => {
      const on = btn.getAttribute('data-dpj-view') === S.view;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    root.querySelector('.dpj-note').textContent = VIEW_NOTES[S.view];
    root.querySelector('.dpj-mlabel').textContent = total ? `Moment ${S.moment} of ${total}` : '';
    root.querySelector('[data-dpj-act="prev"]').disabled = S.moment <= 1;
    root.querySelector('[data-dpj-act="next"]').disabled = S.moment >= total;
    root.querySelector('[data-dpj-act="full"]').disabled = S.moment >= total;
    const scroll = root.querySelector('.dpj-scroll');
    const x = scroll.scrollLeft;
    const y = scroll.scrollTop;
    scroll.innerHTML = S.view === 'A' ? viewA() : S.view === 'B' ? viewB() : viewC();
    fitToHeight();
    scroll.scrollLeft = x;
    scroll.scrollTop = y;
    const drawer = root.querySelector('.dpj-drawer');
    root.querySelector('.dpj-dbody').innerHTML = detailsHtml();
    drawer.classList.toggle('is-open', !!S.sel);
    drawer.setAttribute('aria-hidden', S.sel ? 'false' : 'true');
  }

  const MIN_ZOOM = 0.45;
  let fitObserver = null;

  /** Scale the canvas down so its full height fits the stage (no vertical scroll). */
  function fitToHeight() {
    const root = S.ctx && S.ctx.track && S.ctx.track.querySelector('.dpj-root');
    const scroll = root && root.querySelector('.dpj-scroll');
    const pad = scroll && scroll.firstElementChild;
    if (!pad) return;
    pad.style.zoom = '';
    scroll.classList.remove('is-tall');
    const avail = scroll.clientHeight;
    if (!avail) return;
    const needed = pad.offsetHeight;
    if (needed <= avail) return;
    let zoom = Math.max(MIN_ZOOM, Math.floor((avail / needed) * 1000) / 1000);
    pad.style.zoom = String(zoom);
    // A horizontal scrollbar appearing can steal height; shrink once more if needed.
    const after = scroll.clientHeight;
    if (pad.getBoundingClientRect().height > after + 1 && zoom > MIN_ZOOM) {
      zoom = Math.max(MIN_ZOOM, Math.floor((after / needed) * 1000) / 1000);
      pad.style.zoom = String(zoom);
    }
    if (pad.getBoundingClientRect().height > scroll.clientHeight + 1) scroll.classList.add('is-tall');
  }

  function observeStage(root) {
    if (fitObserver) { fitObserver.disconnect(); fitObserver = null; }
    const scroll = root.querySelector('.dpj-scroll');
    if (!scroll) return;
    if (typeof global.ResizeObserver === 'function') {
      let last = -1;
      fitObserver = new global.ResizeObserver(() => {
        const h = scroll.clientHeight;
        if (h === last) return;
        last = h;
        if (S.view === 'C') render();
        else fitToHeight();
      });
      fitObserver.observe(scroll);
    } else {
      global.requestAnimationFrame(fitToHeight);
    }
  }

  function scrollToMoment() {
    const root = S.ctx && S.ctx.track && S.ctx.track.querySelector('.dpj-root');
    if (!root) return;
    const idx = Math.max(0, S.moment - 1);
    const el = root.querySelector(`[data-dpj-sel="${idx}"], [data-dpj-sel^="${idx},"], [data-dpj-sel$=",${idx}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (_err) { /* noop */ }
    }
  }

  function step(delta) {
    const total = S.events.length;
    const next = delta === Infinity ? total : Math.max(1, Math.min(total, S.moment + delta));
    if (next === S.moment) return false;
    S.moment = next;
    render();
    scrollToMoment();
    return true;
  }

  function onClick(event) {
    const target = event.target;
    const tab = target.closest('[data-dpj-view]');
    if (tab) { S.view = tab.getAttribute('data-dpj-view'); saveView(S.view); S.sel = null; render(); return; }
    const act = target.closest('[data-dpj-act]');
    if (act) {
      const a = act.getAttribute('data-dpj-act');
      if (a === 'prev') step(-1);
      else if (a === 'next') step(1);
      else if (a === 'full') step(Infinity);
      else if (a === 'close') { S.sel = null; render(); }
      return;
    }
    const node = target.closest('[data-dpj-sel]');
    if (node) { S.sel = node.getAttribute('data-dpj-sel').split(',').map(Number); render(); }
  }

  function onKeydown(event) {
    if (!S.ctx || !doc.body.classList.contains('aep-profile-drawer-events-story-open')) return;
    if (!S.ctx.track.querySelector('.dpj-root')) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.key === 'Escape' && S.sel) { event.preventDefault(); event.stopImmediatePropagation(); S.sel = null; render(); return; }
    let moved = false;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') moved = step(1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') moved = step(-1);
    else if (event.key === 'End') moved = step(Infinity);
    else if (event.key === 'Home') moved = step(-S.events.length);
    if (moved) event.preventDefault();
  }

  function shell() {
    const tabs = Object.keys(VIEWS).map(k =>
      `<button type="button" role="tab" class="dpj-tab" data-dpj-view="${k}">${esc(VIEWS[k])}</button>`).join('');
    const legend = LANE_ORDER.map(l => `<span class="dpj-legend-item dpj-lane--${l}">${esc(LANES[l].label)}</span>`).join('');
    return '<div class="dpj-root">' +
      `<div class="dpj-top"><div class="dpj-tabs" role="tablist" aria-label="Journey view">${tabs}</div>` +
      '<p class="dpj-note"></p></div>' +
      '<div class="dpj-bar"><span class="dpj-mlabel" role="status"></span><span class="dpj-sp"></span>' +
      '<button type="button" class="dpj-btn" data-dpj-act="prev">Previous moment</button>' +
      '<button type="button" class="dpj-btn" data-dpj-act="next">Next moment</button>' +
      '<button type="button" class="dpj-btn dpj-btn--ghost" data-dpj-act="full">Show full journey</button></div>' +
      '<div class="dpj-stage"><div class="dpj-scroll" tabindex="0" aria-label="Persona journey canvas"></div>' +
      '<aside class="dpj-drawer" aria-hidden="true" aria-label="Event details"><header><span>Event details</span>' +
      '<button type="button" data-dpj-act="close" aria-label="Close event details">×</button></header>' +
      '<div class="dpj-dbody"></div></aside></div>' +
      `<div class="dpj-legend">${legend}</div></div>`;
  }

  let renderedEventsKey = '';
  function renderer(ctx) {
    const eventsKey = JSON.stringify([ctx.events, ctx.profile && ctx.profile.email, ctx.profile && ctx.profile.ecid]);
    S.ctx = ctx;
    const track = ctx.track;
    if (eventsKey === renderedEventsKey && track.querySelector('.dpj-root')) return true;
    renderedEventsKey = eventsKey;
    track.innerHTML = '';
    if (ctx.panel) ctx.panel.classList.add('dpj-panel');
    if (!ctx.events.length) {
      const empty = doc.createElement('p');
      empty.className = 'aep-profile-drawer-events-story-empty';
      empty.textContent = ctx.allEvents.length
        ? 'No events in this window. Adjust the story range or choose All.'
        : 'No experience events loaded yet. Look up a profile to see the journey.';
      track.appendChild(empty);
      return true;
    }
    const model = buildModel(ctx.events, ctx.helpers);
    S.events = model.E;
    S.items = model.items;
    S.stages = model.stages;
    S.moment = S.events.length;
    S.sel = null;
    S.view = readView();
    track.innerHTML = shell();
    const root = track.querySelector('.dpj-root');
    root.addEventListener('click', onClick);
    render();
    observeStage(root);
    return true;
  }

  function install() {
    const drawer = global.DemoProfileDrawer;
    if (!drawer || typeof drawer.setJourneyModalRenderer !== 'function') return;
    if (classicRequested()) return;
    doc.body.classList.add(BODY_CLASS);
    drawer.setJourneyModalRenderer(renderer);
    doc.addEventListener('keydown', onKeydown, true);
  }

  global.DecisioningPersonaJourney = { describe, buildModel, fmtGap };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window !== 'undefined' ? window : globalThis);
