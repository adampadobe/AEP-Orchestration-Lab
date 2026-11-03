(function () {
  'use strict';
  const launcher = document.getElementById('hmConciergeLauncher');
  const panel = document.getElementById('hmConciergePanel');
  const closeButton = document.getElementById('hmConciergeClose');
  const host = document.getElementById('hmConciergeFrameHost');
  const status = document.getElementById('hmConciergeStatus');
  const modeButtons = panel.querySelectorAll('[data-hm-concierge-mode]');
  let frame, timer;

  function show() {
    const modal = panel.dataset.mode === 'modal';
    if (modal) panel.showModal();
    else panel.show();
    panel.setAttribute('aria-modal', String(modal));
    document.documentElement.classList.toggle('hm-concierge-modal-open', modal);
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => {
    if (panel.dataset.mode === button.dataset.hmConciergeMode) return;
    // Reopen the same dialog to change native modality without replacing its iframe.
    panel.close();
    panel.dataset.mode = button.dataset.hmConciergeMode;
    modeButtons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    show();
    button.focus();
  }));

  function load() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.id = 'hmConciergeFrame';
    frame.title = 'Interactive H&M concierge';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    frame.src = 'https://d3mey6isb8np59.cloudfront.net/H%26M-concierge/index.html';
    host.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading concierge...';
    timer = window.setTimeout(() => {
      host.setAttribute('aria-busy', 'false');
      status.textContent = 'Taking longer than expected? Try opening in a new tab.';
    }, 20000);
    frame.addEventListener('load', () => {
      window.clearTimeout(timer);
      host.setAttribute('aria-busy', 'false');
      // Cross-origin load is not proof that the remote chat service is ready.
      status.textContent = 'If chat is unavailable, open it in a new tab.';
    });
    frame.addEventListener('error', () => {
      window.clearTimeout(timer);
      host.setAttribute('aria-busy', 'false');
      status.textContent = 'Could not load concierge. Try opening in a new tab.';
    });
    host.append(frame);
  }
  launcher.addEventListener('click', () => {
    if (panel.open) { panel.close(); return; }
    window.EnvBarCompact?.closeOverlay({ force: true });
    show();
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Close H&M concierge');
    load();
    closeButton.focus();
  });
  closeButton.addEventListener('click', () => panel.close());
  panel.addEventListener('close', () => {
    if (panel.open) return; // Mode switches queue a close event before reopening.
    document.documentElement.classList.remove('hm-concierge-modal-open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open H&M concierge');
    launcher.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.open) { event.preventDefault(); panel.close(); }
  });
})();
