(function (global) {
  'use strict';
  const model = global.NatwestDecisioningModel;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  let state = { ...model.defaults };
  let result = model.evaluate(state);
  let mode = 'desktop';
  let firstName = 'there';
  let live = null;
  let previewVersion = 0;
  const openObjectives = new Set();
  const controls = new Map();
  const asset = name => new URL('natwest-decisioning-assets/' + name, global.location.href).href;
  function status(text) {
    if (global.parent !== global) global.parent.dispatchEvent(new CustomEvent('natwest-preview-status', { detail: text }));
  }
  function changed() {
    global.dispatchEvent(new CustomEvent('natwest-signals-changed'));
    status('Staged signals - displayed hero changes only after a successful live decision.');
  }
  model.groups.forEach(([id, title, fields], index) => {
    const group = document.createElement('section');
    group.className = 'sig collapsed';
    group.dataset.group = id;
    group.innerHTML = '<button type="button" class="sig-head" aria-expanded="false"><span class="sig-icon" aria-hidden="true">' +
      (index + 1) + '</span>' + escape(title) + '<span class="sig-chev" aria-hidden="true">&#9660;</span></button>';
    group.querySelector('button').addEventListener('click', event => {
      const expanded = group.classList.toggle('collapsed') === false;
      event.currentTarget.setAttribute('aria-expanded', String(expanded));
    });
    fields.forEach(([name, label, choices]) => {
      const field = document.createElement('div');
      field.className = 'ctl';
      field.innerHTML = '<div class="ctl-top"><span class="ctl-label" id="label-' + name + '">' + escape(label) +
        '</span><span class="ctl-attr" title="' + model.pathFor(name) + '">' +
        (name === 'prop' ? 'scoring.core' : 'natwestDecisioning') + '</span></div>';
      if (Array.isArray(choices)) {
        const pills = document.createElement('div');
        pills.className = 'toggle-pill';
        pills.setAttribute('role', 'group');
        pills.setAttribute('aria-labelledby', 'label-' + name);
        choices.forEach(value => {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'toggle-opt';
          button.textContent = model.labels[value] || String(value);
          button.dataset.value = String(value);
          button.addEventListener('click', () => {
            state[name] = value; update(); changed();
          });
          pills.appendChild(button);
        });
        field.appendChild(pills);
        controls.set(name, pills);
      } else {
        const output = document.createElement('output');
        output.id = 'value-' + name; output.className = 'slider-val';
        output.htmlFor = 'input-' + name;
        field.querySelector('.ctl-top').appendChild(output);
        const slider = document.createElement('input');
        slider.id = 'input-' + name; slider.type = 'range'; slider.min = choices.min; slider.max = choices.max; slider.step = 1;
        slider.setAttribute('aria-labelledby', 'label-' + name);
        slider.addEventListener('input', () => { state[name] = Number(slider.value); update(); changed(); });
        field.appendChild(slider);
        controls.set(name, slider);
      }
      group.appendChild(field);
    });
    $('signals').appendChild(group);
  });
  model.scenarios.forEach(([label, preset]) => {
    const button = document.createElement('button');
    button.className = 'scn'; button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => {
      state = model.validate({ ...model.defaults, ...preset });
      openObjectives.clear();
      const selected = model.evaluate(state).winner;
      if (selected) openObjectives.add(selected.id);
      document.querySelectorAll('.sig').forEach(group => {
        const definition = model.groups.find(([id]) => group.dataset.group === id);
        if (definition[2].some(([name]) => name in preset)) {
          group.classList.remove('collapsed'); group.querySelector('button').setAttribute('aria-expanded', 'true');
        }
      });
      $('nbaPanel').classList.remove('collapsed'); $('nbaHead').setAttribute('aria-expanded', 'true');
      update(); changed();
    });
    $('scenarios').appendChild(button);
  });
  function renderLadder() {
    const selectedIndex = result.ladder.findIndex(objective => objective.id === (result.winner && result.winner.id));
    $('ladder').innerHTML = result.ladder.map((objective, index) => {
      const selected = index === selectedIndex;
      const open = openObjectives.has(objective.id);
      return '<li class="obj' + (selected ? ' selected' : selectedIndex >= 0 && index > selectedIndex ? ' after' : '') +
        (open ? ' open' : '') + '" data-objective="' + objective.id + '"><button type="button" class="obj-row" aria-expanded="' + open +
        '" aria-controls="gates-' + objective.id + '"><span class="chev">' + (index + 1) +
        '</span><span class="obj-title"><span class="obj-name">' + objective.title + '</span><span class="obj-sub">' +
        objective.description + '</span></span><span class="pill ' + (selected ? 'selected' : objective.eligible ? 'queued' : 'no') +
        '">' + (selected ? 'Selected' : objective.eligible ? 'Queued' : 'Not eligible') + '</span></button><div class="gates" id="gates-' +
        objective.id + '">' + objective.gates.map(gate => '<div class="gate ' + (gate.ok ? 'ok' : 'no') +
          '"><span class="gi" aria-label="' + (gate.ok ? 'Passed' : 'Failed') + '">' + (gate.ok ? '&#10003;' : '&#215;') +
          '</span><span>' + gate.text + '</span></div>').join('') + '</div></li>';
    }).join('');
    $('expandAll').textContent = openObjectives.size === model.objectives.length ? 'Collapse all' : 'Expand all';
    $('nbaCount').textContent = result.candidates.length + ' eligible';
    $('nbaList').innerHTML = result.candidates.map((candidate, index) =>
      '<li class="nba' + (index ? '' : ' winner') + '"><span class="nba-rank">' + (index + 1) +
      '</span><div class="nba-main"><div class="nba-name">' + escape(candidate.title) + '</div><p class="nba-why">' +
      escape(result.winner.title) + ' &middot; ' + escape(model.labels[state.product]) +
      '</p><div class="bar"><i style="width:' + Math.min(100, candidate.score) + '%"></i></div><div class="comps">' +
      Object.entries(candidate.parts).map(([key, value]) => '<span>' + key + ' <b>' + value + '</b></span>').join('') +
      '</div></div><span class="nba-score">' + candidate.score + '</span></li>'
    ).join('') || '<li class="nba">' + escape(result.hold) + '</li>';
    $('localStatus').textContent = result.winner ?
      'Local simulation: ' + result.winner.title + '. Eligibility is illustrative, not underwriting or financial advice. Live image/copy updates are independent of local ranking.' : result.hold;
  }
  $('ladder').addEventListener('click', event => {
    const button = event.target.closest('.obj-row');
    if (!button) return;
    const id = button.closest('.obj').dataset.objective;
    if (openObjectives.has(id)) openObjectives.delete(id); else openObjectives.add(id);
    renderLadder();
    $('ladder').querySelector('[data-objective="' + id + '"] button').focus();
  });
  $('expandAll').addEventListener('click', () => {
    if (openObjectives.size === model.objectives.length) openObjectives.clear();
    else model.objectives.forEach(([id]) => openObjectives.add(id));
    renderLadder();
  });
  $('nbaHead').addEventListener('click', () => {
    const collapsed = $('nbaPanel').classList.toggle('collapsed');
    $('nbaHead').setAttribute('aria-expanded', String(!collapsed));
  });
  function emailDocument(copy) {
    const styles = getComputedStyle(document.body);
    const tokens = ['brand', 'accent', 'white', 'email-bg', 'email-text', 'email-muted']
      .map(name => '--dash-nw-' + name + ':' + styles.getPropertyValue('--dash-nw-' + name)).join(';');
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>NatWest email preview</title><style>:root{' + tokens + '}*{box-sizing:border-box}body{margin:0;background:var(--dash-nw-email-bg);font-family:Arial,sans-serif;color:var(--dash-nw-email-text)}' +
      'table{border-collapse:collapse}.master{width:100%;max-width:600px;margin:auto;background:var(--dash-nw-white)}.logo{background:var(--dash-nw-brand);padding:24px 36px;border-bottom:4px solid var(--dash-nw-accent)}' +
      '.logo img{width:150px;height:auto;display:block}.hero{display:block;width:100%;height:277px;object-fit:cover}.px{padding:28px 36px 10px}.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--dash-nw-accent);font-weight:bold}' +
      'h1{font-family:Georgia,serif;font-size:29px;line-height:1.2;font-weight:normal;color:var(--dash-nw-brand);margin:12px 0 14px}p{font-size:16px;line-height:24px;margin:0 0 14px}.offer{background:var(--dash-nw-email-bg);border-left:5px solid var(--dash-nw-accent);padding:16px 20px;font-size:14px;line-height:22px}' +
      '.cta{display:block;padding:15px 24px;text-align:center;background:var(--dash-nw-brand);color:var(--dash-nw-white);font-weight:bold;border-radius:5px;font-size:16px}.footer{padding:22px 36px 28px;background:var(--dash-nw-email-bg);color:var(--dash-nw-email-muted);font-size:12px;line-height:18px}' +
      '@media(max-width:620px){.px{padding-left:24px;padding-right:24px}h1{font-size:26px}.hero{height:230px}.logo{padding:22px 24px}.footer{padding:22px 24px}}</style></head><body>' +
      '<table role="presentation" class="master"><tr><td class="logo"><img src="' + escape(asset('natwest-logo.svg')) + '" alt="NatWest"></td></tr>' +
      '<tr><td><img id="emailHero" class="hero" src="' + escape(copy.image) + '" alt="NatWest decisioning preview"></td></tr>' +
      '<tr><td class="px"><p>Hi ' + escape(firstName) + ',</p><p class="eyebrow">Tomorrow begins today</p><h1>' + escape(copy.title) +
      '</h1><p>' + escape(copy.description) + '</p></td></tr><tr><td class="px"><div class="offer"><strong>A little help with your next step</strong><br>' +
      'Explore the details and choose what works for you. Eligibility criteria and terms apply.</div></td></tr>' +
      '<tr><td class="px" style="padding-bottom:30px"><span class="cta">' + escape(copy.cta) +
      '</span><p style="font-size:11px;margin-top:12px">Preview only - this button does not submit an application.</p></td></tr>' +
      '<tr><td class="footer">NatWest internal demonstration. No email is sent.<br><br>Reconstructed from supplied website files. Content is illustrative, not a current offer or personalised financial advice. Check current terms before making a financial decision.</td></tr></table></body></html>';
  }
  function previewCopy() {
    const base = model.content.grow;
    return { title: live && live.title || base[0], description: live && live.description || base[1],
      cta: base[2], image: live && live.image || asset(base[3]) };
  }
  async function renderPreview() {
    const version = ++previewVersion;
    const blocked = !result.winner;
    $('mailEmpty').hidden = !blocked;
    $('mailEmptyWhy').textContent = result.hold;
    $('mailFrame').hidden = blocked || mode === 'web';
    $('webStage').hidden = blocked || mode !== 'web';
    $('channelPanel').classList.toggle('is-mobile', mode === 'mobile');
    $('channelPanel').setAttribute('aria-labelledby', 'tab-' + mode);
    if (blocked) {
      $('mailFrame').srcdoc = '';
      $('webImage').removeAttribute('src');
      return false;
    }
    const copy = previewCopy();
    $('webTitle').textContent = copy.title;
    $('webDescription').textContent = copy.description;
    $('webCta').textContent = copy.cta;
    $('webImage').src = copy.image;
    if (mode !== 'web') {
      await new Promise((resolve, reject) => {
        const frame = $('mailFrame');
        const timeout = setTimeout(() => { frame.removeEventListener('load', onload); reject(new Error('Email preview timed out.')); }, 10000);
        function onload() { clearTimeout(timeout); resolve(); }
        frame.addEventListener('load', onload, { once: true });
        frame.srcdoc = emailDocument(copy);
      });
    }
    const image = mode === 'web' ? $('webImage') : $('mailFrame').contentDocument.getElementById('emailHero');
    if (version !== previewVersion) return false;
    if (!image) return false;
    try { await image.decode(); } catch (error) {
      if (version !== previewVersion) return false;
      throw error;
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (version !== previewVersion) return false;
    const imageRect = image.getBoundingClientRect();
    const frameRect = mode === 'web' ? { left: 0, top: 0 } : $('mailFrame').getBoundingClientRect();
    const stage = $('channelPanel').getBoundingClientRect();
    const left = imageRect.left + frameRect.left, top = imageRect.top + frameRect.top;
    const right = left + imageRect.width, bottom = top + imageRect.height;
    return document.visibilityState === 'visible' && image.naturalWidth > 0 &&
      imageRect.width > 0 && imageRect.height > 0 &&
      right > Math.max(0, stage.left) && left < Math.min(global.innerWidth, stage.right) &&
      bottom > Math.max(0, stage.top) && top < Math.min(global.innerHeight, stage.bottom);
  }
  function showPreview() {
    void renderPreview().catch(error => { status('Preview failed: ' + error.message); console.error('[natwest-preview]', error); });
  }
  function update() {
    result = model.evaluate(state);
    controls.forEach((control, name) => {
      if (control.tagName === 'INPUT') { control.value = state[name]; $('value-' + name).value = state[name]; }
      else control.querySelectorAll('button').forEach(button => {
        const active = button.dataset.value === String(state[name]);
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      });
    });
    renderLadder(); showPreview();
  }
  function setMode(value, emit = true) {
    mode = ['desktop', 'mobile', 'web'].includes(value) ? value : 'desktop';
    $('dev').querySelectorAll('button').forEach(button => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    showPreview();
    if (emit) global.dispatchEvent(new CustomEvent('natwest-channel-changed', { detail: mode }));
  }
  $('dev').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) setMode(button.dataset.mode);
  });
  $('dev').addEventListener('keydown', event => {
    const tabs = [...$('dev').querySelectorAll('button')];
    const current = tabs.findIndex(button => button.dataset.mode === mode);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 :
      event.key === 'ArrowRight' ? (current + 1) % 3 : event.key === 'ArrowLeft' ? (current + 2) % 3 : -1;
    if (index < 0) return;
    event.preventDefault(); setMode(tabs[index].dataset.mode); tabs[index].focus();
  });
  const panes = $('panes');
  const storageKey = 'natwest-nba-pane-ratio';
  let ratio = null;
  let widths;
  try { ratio = JSON.parse(localStorage.getItem(storageKey)); } catch (error) { console.warn('[natwest-layout] Saved layout unavailable', error.message); }
  function clamp(value, changedPane) {
    const room = panes.clientWidth - 20 - 420;
    let sig = Math.max(300, value.sig), prev = Math.max(440, value.prev);
    if (changedPane === 0) sig = Math.min(sig, room - prev);
    else if (changedPane === 1) prev = Math.min(prev, room - sig);
    else if (sig + prev > room) { const excess = sig + prev - room; sig -= excess * .4; prev -= excess * .6; }
    sig = Math.max(300, Math.min(sig, room - 440));
    prev = Math.max(440, Math.min(prev, room - sig));
    return { sig: Math.round(sig), prev: Math.round(prev) };
  }
  function applyWidths(value) {
    widths = value; panes.style.setProperty('--w-sig', value.sig + 'px'); panes.style.setProperty('--w-prev', value.prev + 'px');
    [$('gut0'), $('gut1')].forEach((gutter, index) => {
      gutter.setAttribute('aria-valuemin', index ? '440' : '300');
      gutter.setAttribute('aria-valuemax', String(panes.clientWidth - (index ? 740 : 880) - 20));
      gutter.setAttribute('aria-valuenow', String(index ? value.prev : value.sig));
    });
  }
  function saveWidths() {
    ratio = { sig: widths.sig / panes.clientWidth, prev: widths.prev / panes.clientWidth };
    try { localStorage.setItem(storageKey, JSON.stringify(ratio)); } catch (error) { console.warn('[natwest-layout] Layout not saved', error.message); }
  }
  function layout() {
    if (!matchMedia('(min-width:1301px)').matches) return;
    const width = panes.clientWidth;
    const validRatio = ratio && Number.isFinite(ratio.sig) && Number.isFinite(ratio.prev) && ratio.sig > 0 && ratio.prev > 0;
    applyWidths(clamp(validRatio ? { sig: ratio.sig * width, prev: ratio.prev * width } :
      { sig: Math.min(520, Math.max(360, Math.round(width * .22))), prev: Math.min(1000, Math.max(620, Math.round(width * .34))) }));
  }
  [$('gut0'), $('gut1')].forEach((gutter, index) => {
    gutter.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !widths) return;
      event.preventDefault();
      const start = { ...widths }, x = event.clientX;
      gutter.setPointerCapture(event.pointerId); gutter.classList.add('drag'); document.body.classList.add('resizing');
      function move(next) {
        const delta = next.clientX - x;
        applyWidths(clamp(index ? { sig: start.sig, prev: start.prev - delta } : { sig: start.sig + delta, prev: start.prev }, index));
      }
      function end(next) {
        if (gutter.hasPointerCapture(next.pointerId)) gutter.releasePointerCapture(next.pointerId);
        gutter.classList.remove('drag'); document.body.classList.remove('resizing');
        gutter.removeEventListener('pointermove', move); gutter.removeEventListener('pointerup', end); gutter.removeEventListener('pointercancel', end); saveWidths();
      }
      gutter.addEventListener('pointermove', move); gutter.addEventListener('pointerup', end); gutter.addEventListener('pointercancel', end);
    });
    gutter.addEventListener('dblclick', () => { ratio = null; layout(); saveWidths(); });
    gutter.addEventListener('keydown', event => {
      if (!widths || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step = (event.shiftKey ? 96 : 24) * (event.key === 'ArrowRight' ? 1 : -1);
      applyWidths(clamp(index ? { sig: widths.sig, prev: widths.prev - step } : { sig: widths.sig + step, prev: widths.prev }, index)); saveWidths();
    });
  });
  global.addEventListener('resize', layout);
  global.NatwestDecisioningVisualiser = {
    getState: () => ({ ...state }), getPreviewChannel: () => mode === 'web' ? 'web' : 'email',
    setState: next => { state = model.validate({ ...state, ...next }); update(); },
    setMode, setRecipientFirstName: value => { firstName = value && String(value).trim() || 'there'; showPreview(); },
    setDecisionStatus: status,
    clearDecision: () => { live = null; showPreview(); },
    setDecisionImage: async (url, copy) => {
      const parsed = new URL(url, global.location.href);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Decision image must be an HTTP(S) URL.');
      const previous = live;
      const next = { image: parsed.href, title: copy.title || '', description: copy.description || '' };
      live = next;
      try {
        if (!await renderPreview()) throw new Error('The selected preview is not visible; display tracking was not sent.');
      } catch (error) {
        if (live === next) { live = previous; showPreview(); }
        throw error;
      }
    },
  };
  layout(); update();
  let initial = new URLSearchParams(global.location.search).get('channel');
  if (global.parent !== global) initial = new URLSearchParams(global.parent.location.search).get('channel');
  setMode(initial === 'email' ? 'desktop' : initial);
})(window);
