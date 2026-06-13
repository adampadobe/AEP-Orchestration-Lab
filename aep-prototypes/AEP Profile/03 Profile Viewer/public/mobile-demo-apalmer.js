/**
 * Mobile simulator — apalmer sandbox copy (config-driven shell; Etihad default).
 * @see shared/mobile-demo-shell.js
 * @see shared/mobile-demo-configs.js
 */
(function () {
  if (typeof MobileDemoShell === 'undefined' || typeof MobileDemoConfigs === 'undefined') {
    console.warn('[mobile-demo-apalmer] shell modules not loaded');
    return;
  }
  MobileDemoShell.initFromHash({ defaultHash: 'etihad-phone', storageKeyPrefix: 'apalmerLab' });
})();
