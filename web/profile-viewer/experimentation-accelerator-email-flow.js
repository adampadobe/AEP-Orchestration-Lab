/**
 * Email template demo: Modify campaign dialog + navigation to campaign email view.
 */
(function () {
  function qs(id) {
    return document.getElementById(id);
  }

  function initModifyCampaignDialog() {
    var dlg = qs('ajoModifyCampaignDialog');
    var openBtn = qs('ajoEmailTplViewOpp');
    var cancel = qs('ajoModifyCampaignCancel');
    var confirm = qs('ajoModifyCampaignConfirm');
    if (!dlg) return;

    if (openBtn) {
      openBtn.addEventListener('click', function () {
        try {
          if (typeof dlg.showModal === 'function') dlg.showModal();
        } catch (e) {}
        try {
          if (cancel) cancel.focus();
        } catch (e2) {}
      });
    }

    if (cancel) {
      cancel.addEventListener('click', function () {
        try {
          dlg.close();
        } catch (e) {}
      });
    }

    if (confirm) {
      confirm.addEventListener('click', function () {
        try {
          dlg.close();
        } catch (e) {}
        window.location.href = 'experimentation-accelerator-email-properties.html';
      });
    }

    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) {
        try {
          dlg.close();
        } catch (e) {}
      }
    });

    dlg.addEventListener('cancel', function (ev) {
      ev.preventDefault();
      try {
        dlg.close();
      } catch (e) {}
    });
  }

  function init() {
    initModifyCampaignDialog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
