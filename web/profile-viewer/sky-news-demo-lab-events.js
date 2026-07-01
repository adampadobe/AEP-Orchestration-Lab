/**
 * Sky News demo shell — handles iframe postMessage events via POST /api/events/generator.
 */
(function skyNewsDemoLabEvents(global) {
  'use strict';

  var XDM_TENANT_KEY = '_demoemea';
  var MSG_SOURCE = 'sky-news-lab';

  function run() {
    var siteFrame = document.getElementById('skynewsDemoSiteFrame');
    var messageEl = document.getElementById('skynewsMessage');
    var customerEmail = document.getElementById('customerEmail');
    var generatorTargetSelect = document.getElementById('generatorTarget');

    /** @type {Array<{ id: string, label: string, transport: string }>} */
    var generatorTargets = [];

    function setMessage(text, type) {
      if (!messageEl) return;
      messageEl.textContent = text || '';
      messageEl.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      messageEl.hidden = !text;
    }

    function getEmail() {
      return (customerEmail && customerEmail.value) || '';
    }

    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }

    function normaliseEcidDigits(raw) {
      var v = String(raw || '').trim();
      if (!v || v === '\u2014' || v === '-') return '';
      return /^\d+$/.test(v) && v.length >= 10 ? v : '';
    }

    function refreshDrawerEvents(ecid, email) {
      var id = ecid || email;
      var ns = ecid ? 'ecid' : email ? 'email' : '';
      if (!id || typeof global.DemoProfileDrawer === 'undefined') return;
      if (typeof global.DemoProfileDrawer.refreshDrawerEventsForIdentity !== 'function') return;
      void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(id, ns);
      global.setTimeout(function () {
        void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(id, ns);
      }, 2500);
      global.setTimeout(function () {
        void global.DemoProfileDrawer.refreshDrawerEventsForIdentity(id, ns);
      }, 8000);
    }

    /**
     * @param {Record<string, unknown>} payload
     */
    async function sendSkyNewsExperienceEvent(payload) {
      var p = payload && typeof payload === 'object' ? payload : {};
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      var ecid = normaliseEcidDigits(ecidText);
      var emailForEvent = String(p.email || getEmail() || '').trim();
      var target = getSelectedGeneratorTarget();
      var body = {
        targetId: target ? target.id : undefined,
        eventType: String(p.eventType || 'insider.interaction').trim(),
        viewName: String(p.viewName || 'Sky News demo').trim(),
        viewUrl:
          String(p.viewUrl || '').trim() ||
          (typeof global.location !== 'undefined' ? global.location.href.split('?')[0] : ''),
        channel: 'Web',
        public: p.public && typeof p.public === 'object' ? p.public : {},
        tenant: p.tenant && typeof p.tenant === 'object' ? p.tenant : undefined,
        person: p.person && typeof p.person === 'object' ? p.person : undefined,
        homeAddress: p.homeAddress && typeof p.homeAddress === 'object' ? p.homeAddress : undefined,
        personalEmail: p.personalEmail && typeof p.personalEmail === 'object' ? p.personalEmail : undefined,
        xdmTenantKey: XDM_TENANT_KEY,
        identityMapEcidKey: 'ECID',
      };
      if (emailForEvent) body.email = emailForEvent;
      if (ecid) body.ecid = ecid;
      var postBody =
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.augmentGeneratorPostBody
          ? global.AepDemoGeneratorTargets.augmentGeneratorPostBody(body)
          : body;
      try {
        var res = await fetch('/api/events/generator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          var errMsg = data.error || data.message || 'Request failed.';
          setMessage(errMsg, 'error');
          return false;
        }
        var idPart = '';
        if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
        else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
        setMessage((data.message || 'Sky News event sent to AEP.') + idPart, 'success');
        refreshDrawerEvents(ecid, emailForEvent);
        return true;
      } catch (err) {
        setMessage((err && err.message) || 'Network error', 'error');
        return false;
      }
    }

    function profileForPrefill() {
      var profile =
        global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
          ? global.DemoProfileDrawer.getLastLookedUpProfile()
          : null;
      if (!profile) return null;
      return {
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email || getEmail().trim() || '',
        city: profile.city || '',
        addressLine: '',
        postcode: '',
      };
    }

    function postProfilePrefillToFrame() {
      if (!siteFrame || !siteFrame.contentWindow) return;
      var profile = profileForPrefill();
      if (!profile) return;
      var hasAny =
        profile.firstName || profile.lastName || profile.email || profile.city || profile.addressLine || profile.postcode;
      if (!hasAny) return;
      siteFrame.contentWindow.postMessage(
        {
          source: 'sky-news-demo-shell',
          type: 'sky-news-profile-prefill',
          profile: profile,
        },
        '*',
      );
    }

    global.addEventListener('message', function (ev) {
      if (!siteFrame || !siteFrame.contentWindow || ev.source !== siteFrame.contentWindow) return;
      if (!ev.data || ev.data.source !== MSG_SOURCE) return;

      if (ev.data.type === 'sky-news-experience-event') {
        void sendSkyNewsExperienceEvent(ev.data.payload);
        return;
      }

      if (ev.data.type === 'sky-news-profile-prefill-request') {
        postProfilePrefillToFrame();
      }
    });

    if (siteFrame) {
      siteFrame.addEventListener('load', function () {
        global.setTimeout(postProfilePrefillToFrame, 300);
      });
    }

    async function loadGeneratorTargets() {
      if (!generatorTargetSelect) return;
      if (
        typeof global.AepDemoGeneratorTargets !== 'undefined' &&
        global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect
      ) {
        generatorTargets = await global.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
        return;
      }
      try {
        var res = await fetch('/api/events/generator-targets');
        var data = await res.json().catch(function () {
          return {};
        });
        generatorTargets = Array.isArray(data.targets) ? data.targets : [];
      } catch {
        generatorTargets = [];
      }
    }

    void loadGeneratorTargets();
    if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.onSandboxChange) {
      global.AepDemoGeneratorTargets.onSandboxChange(function () {
        void loadGeneratorTargets();
      });
    }
  }

  if (global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(run);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})(typeof window !== 'undefined' ? window : globalThis);
