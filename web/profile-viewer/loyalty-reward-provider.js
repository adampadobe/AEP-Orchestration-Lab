(function () {
  'use strict';

  var msgEl = document.getElementById('lrpMessage');
  var healthStatusEl = document.getElementById('lrpHealthStatus');
  var ledgerMetaEl = document.getElementById('lrpLedgerMeta');
  var ledgerBodyEl = document.getElementById('lrpLedgerBody');
  var ledgerEmptyEl = document.getElementById('lrpLedgerEmpty');
  var ledgerTableWrapEl = document.getElementById('lrpLedgerTableWrap');

  function getCfg() {
    return window.loyaltyRewardProviderConfig || {};
  }

  function baseUrl() {
    return String(getCfg().providerBaseUrl || '').replace(/\/+$/, '');
  }

  function fulfillUrl() {
    return baseUrl() + '/v1/fulfill';
  }

  function healthUrl() {
    return baseUrl() + '/health';
  }

  function oauthUrl() {
    return baseUrl() + '/oauth/token';
  }

  function showMsg(text, kind) {
    if (!msgEl) return;
    if (!text) {
      msgEl.hidden = true;
      return;
    }
    msgEl.hidden = false;
    msgEl.textContent = text;
    msgEl.className = 'lrp-msg' + (kind === 'ok' ? ' lrp-msg--ok' : kind === 'err' ? ' lrp-msg--err' : '');
    if (kind === 'ok' || kind === 'err') {
      setTimeout(function () {
        msgEl.hidden = true;
      }, 5000);
    }
  }

  function setHealthStatus(label, variant) {
    if (!healthStatusEl) return;
    healthStatusEl.textContent = label;
    healthStatusEl.className =
      'lrp-status' +
      (variant === 'ok' ? ' lrp-status--ok' : variant === 'err' ? ' lrp-status--err' : ' lrp-status--warn');
  }

  function copyText(text, okMessage) {
    var value = String(text || '');
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () {
          showMsg(okMessage || 'Copied to clipboard.', 'ok');
        },
        function () {
          fallbackCopy(value, okMessage);
        },
      );
    } else {
      fallbackCopy(value, okMessage);
    }
  }

  function fallbackCopy(text, okMessage) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showMsg(okMessage || 'Copied to clipboard.', 'ok');
    } catch (_e) {
      showMsg('Copy failed — select the text manually.', 'err');
    }
    document.body.removeChild(ta);
  }

  function bindCopyButtons() {
    document.querySelectorAll('[data-lrp-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-lrp-copy');
        var el = targetId ? document.getElementById(targetId) : null;
        var text = el ? el.textContent || el.value || '' : btn.getAttribute('data-copy-text') || '';
        copyText(text, btn.getAttribute('data-copy-msg') || 'Copied.');
      });
    });
  }

  function formatTimestamp(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (_e) {
      return String(iso);
    }
  }

  function payloadPreview(payload) {
    try {
      var s = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return s.length > 120 ? s.slice(0, 117) + '…' : s;
    } catch (_e) {
      return '—';
    }
  }

  function payloadPretty(payload) {
    try {
      if (typeof payload === 'string') {
        try {
          return JSON.stringify(JSON.parse(payload), null, 2);
        } catch (_inner) {
          return payload;
        }
      }
      return JSON.stringify(payload, null, 2);
    } catch (_e) {
      return String(payload);
    }
  }

  async function checkHealth() {
    setHealthStatus('Checking…', 'warn');
    try {
      var res = await fetch('/api/fake-loyalty/health', { headers: { Accept: 'application/json' } });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data.ok && data.reachable) {
        setHealthStatus('Healthy', 'ok');
        return;
      }
      var err = data.error || 'Provider unreachable';
      setHealthStatus(err, 'err');
    } catch (e) {
      setHealthStatus('Unreachable', 'err');
    }
  }

  function renderLedger(entries, totalStored) {
    if (!ledgerBodyEl || !ledgerEmptyEl || !ledgerTableWrapEl) return;

    var count = Array.isArray(entries) ? entries.length : 0;
    if (ledgerMetaEl) {
      var totalNote = typeof totalStored === 'number' ? ' · ' + totalStored + ' stored in memory' : '';
      ledgerMetaEl.textContent = count ? count + ' recent request' + (count === 1 ? '' : 's') + totalNote : 'No requests yet' + totalNote;
    }

    ledgerBodyEl.innerHTML = '';
    if (!count) {
      ledgerEmptyEl.hidden = false;
      ledgerTableWrapEl.hidden = true;
      return;
    }

    ledgerEmptyEl.hidden = true;
    ledgerTableWrapEl.hidden = false;

    entries.forEach(function (entry) {
      var tr = document.createElement('tr');

      var tdTime = document.createElement('td');
      tdTime.textContent = formatTimestamp(entry.receivedAt);
      tr.appendChild(tdTime);

      var tdTxn = document.createElement('td');
      var txnCode = document.createElement('code');
      txnCode.textContent = entry.transactionId || '—';
      tdTxn.appendChild(txnCode);
      tr.appendChild(tdTxn);

      var tdMember = document.createElement('td');
      tdMember.textContent = entry.memberId || '—';
      tr.appendChild(tdMember);

      var tdPayload = document.createElement('td');
      var preview = document.createElement('div');
      preview.className = 'lrp-payload-preview';
      preview.textContent = payloadPreview(entry.payload);
      preview.title = payloadPreview(entry.payload);
      tdPayload.appendChild(preview);
      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'lrp-btn lrp-payload-btn';
      copyBtn.textContent = 'Copy JSON';
      copyBtn.addEventListener('click', function () {
        copyText(payloadPretty(entry.payload), 'Payload copied.');
      });
      tdPayload.appendChild(document.createElement('br'));
      tdPayload.appendChild(copyBtn);
      tr.appendChild(tdPayload);

      ledgerBodyEl.appendChild(tr);
    });
  }

  async function refreshLedger() {
    if (ledgerMetaEl) ledgerMetaEl.textContent = 'Loading…';
    try {
      var res = await fetch('/api/fake-loyalty/ledger?limit=50', {
        headers: { Accept: 'application/json' },
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        var err = data.error || 'Failed to load ledger';
        if (ledgerMetaEl) ledgerMetaEl.textContent = err;
        renderLedger([], null);
        showMsg(err, 'err');
        return;
      }
      renderLedger(data.entries || [], data.totalStored);
    } catch (e) {
      if (ledgerMetaEl) ledgerMetaEl.textContent = 'Request failed';
      showMsg(String(e.message || e), 'err');
      renderLedger([], null);
    }
  }

  function initStaticUrls() {
    var fulfillEl = document.getElementById('lrpFulfillUrl');
    var healthEl = document.getElementById('lrpHealthUrl');
    var oauthEl = document.getElementById('lrpOauthUrl');
    var guidEl = document.getElementById('lrpProviderGuid');
    var rewardEl = document.getElementById('lrpRewardKey');
    var headersPre = document.getElementById('lrpHeadersSnippet');
    var registerCmd = document.getElementById('lrpRegisterCmd');
    var configureCmd = document.getElementById('lrpConfigureCmd');
    var challengeCmd = document.getElementById('lrpChallengeCmd');
    var challengeIdEl = document.getElementById('lrpChallengeId');
    var audienceIdEl = document.getElementById('lrpAudienceId');
    var audienceNameEl = document.getElementById('lrpAudienceName');

    if (fulfillEl) fulfillEl.textContent = fulfillUrl();
    if (healthEl) healthEl.textContent = healthUrl();
    if (oauthEl) oauthEl.textContent = oauthUrl();
    if (guidEl) guidEl.textContent = getCfg().registeredProviderGuid || '—';
    if (rewardEl) rewardEl.textContent = getCfg().rewardDefinitionKey || 'points';

    var headersSnippet =
      'X-API-Key: <configured in Cloud Run / AJO Loyalty admin>\nContent-Type: application/json';
    if (headersPre) headersPre.textContent = headersSnippet;

    var sandbox = getCfg().defaultSandbox || 'apalmer';
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      var selected = window.AepGlobalSandbox.getSandboxName();
      if (selected) sandbox = selected;
    }

    if (registerCmd) {
      registerCmd.textContent =
        'npm run ajo:loyalty-register-provider -- \\\n  --url ' +
        fulfillUrl() +
        ' \\\n  --sandbox ' +
        sandbox;
    }
    if (configureCmd) {
      configureCmd.textContent =
        'npm run ajo:loyalty-setup -- \\\n  --sandbox ' + sandbox;
    }
    if (challengeIdEl) challengeIdEl.textContent = getCfg().labChallengeId || '—';
    if (audienceIdEl) audienceIdEl.textContent = getCfg().labAudienceId || '—';
    if (audienceNameEl) {
      var audName = getCfg().labAudienceName;
      audienceNameEl.textContent = audName ? audName + (getCfg().labChallengeState ? ' · challenge ' + getCfg().labChallengeState : '') : '';
    }
    if (challengeCmd) {
      challengeCmd.textContent =
        'npm run ajo:loyalty-create-challenge -- \\\n  --sandbox ' +
        sandbox +
        ' \\\n  --audience-id ' +
        (getCfg().labAudienceId || '<segment-uuid>') +
        ' \\\n  --provider-guid ' +
        (getCfg().registeredProviderGuid || '<provider-guid>') +
        ' \\\n  --reward-definition ' +
        (getCfg().rewardDefinitionKey || 'points') +
        ' \\\n  --task-id ' +
        (getCfg().labTaskId || 'aep-lab-purchase-task');
    }
  }

  function initSandboxSelect() {
    var select = document.getElementById('lrpSandboxSelect');
    if (!select || !window.AepGlobalSandbox) return;

    if (typeof window.AepGlobalSandbox.loadSandboxesIntoSelect === 'function') {
      window.AepGlobalSandbox.loadSandboxesIntoSelect(select);
    }
    if (typeof window.AepGlobalSandbox.onSandboxSelectChange === 'function') {
      window.AepGlobalSandbox.onSandboxSelectChange(select);
    }
    if (typeof window.AepGlobalSandbox.attachStorageSync === 'function') {
      window.AepGlobalSandbox.attachStorageSync(select);
    }

    select.addEventListener('change', function () {
      initStaticUrls();
    });
  }

  function init() {
    initStaticUrls();
    bindCopyButtons();
    initSandboxSelect();

    var healthBtn = document.getElementById('lrpCheckHealth');
    var refreshBtn = document.getElementById('lrpRefreshLedger');
    if (healthBtn) healthBtn.addEventListener('click', checkHealth);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshLedger);

    checkHealth();
    refreshLedger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
