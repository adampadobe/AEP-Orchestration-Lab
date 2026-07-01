/**
 * Sky News demo shell — handles iframe postMessage events via POST /api/events/generator.
 */
(function skyNewsDemoLabEvents(global) {
  'use strict';

  var XDM_TENANT_KEY = '_demoemea';
  var MSG_SOURCE = 'sky-news-lab';
  var streamingCache = Object.create(null);

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

    function getSandboxName() {
      if (
        typeof global.AepGlobalSandbox !== 'undefined' &&
        typeof global.AepGlobalSandbox.getSandboxName === 'function'
      ) {
        return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      }
      return '';
    }

    function getEcidFromStrip() {
      var ecidEl = document.getElementById('infoEcid');
      var ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
      return normaliseEcidDigits(ecidText);
    }

    async function fetchStreamingForSandbox(sandbox) {
      var key = sandbox || '__default__';
      if (Object.prototype.hasOwnProperty.call(streamingCache, key)) return streamingCache[key];
      var qs = sandbox ? '?sandbox=' + encodeURIComponent(sandbox) : '';
      var res;
      var data;
      try {
        res = await fetch('/api/generic-profile-connection' + qs);
        data = await res.json().catch(function () {
          return {};
        });
      } catch (e) {
        streamingCache[key] = {
          error: 'Network error loading streaming connection: ' + ((e && e.message) || e),
        };
        return streamingCache[key];
      }
      if (!res.ok || data.ok === false) {
        streamingCache[key] = {
          error: data.error || 'Streaming connection lookup failed (HTTP ' + res.status + ').',
        };
        return streamingCache[key];
      }
      var rec = data.record;
      var streaming = rec && rec.streaming && typeof rec.streaming === 'object' ? rec.streaming : null;
      if (!streaming || !streaming.url || !streaming.flowId) {
        streamingCache[key] = {
          error:
            'No saved streaming connection for sandbox "' +
            (sandbox || 'default') +
            '". Configure it on the Profile Generation page first.',
        };
        return streamingCache[key];
      }
      streamingCache[key] = { streaming: streaming };
      return streamingCache[key];
    }

    function postToFrame(type, detail) {
      if (!siteFrame || !siteFrame.contentWindow) return;
      siteFrame.contentWindow.postMessage(
        {
          source: 'sky-news-demo-shell',
          type: type,
          detail: detail || {},
        },
        '*',
      );
    }

    /**
     * @param {Array<{ path: string, value: unknown }>} updates
     * @param {Record<string, unknown>} eventPayload
     */
    async function handleInsiderRegistration(updates, eventPayload) {
      var list = Array.isArray(updates) ? updates : [];
      if (!list.length) {
        setMessage('No profile fields to update.', 'error');
        postToFrame('sky-news-registration-result', { ok: false, error: 'No profile fields to update.' });
        return;
      }
      var emailForUpdate = String(
        (eventPayload && eventPayload.email) || getEmail() || '',
      ).trim();
      if (!emailForUpdate) {
        setMessage('Enter a customer email in the lab strip before registering.', 'error');
        postToFrame('sky-news-registration-result', {
          ok: false,
          error: 'Enter a customer email in the lab strip before registering.',
        });
        return;
      }
      if (typeof global.postProfileUpdate !== 'function') {
        setMessage('Profile streaming helper not loaded.', 'error');
        postToFrame('sky-news-registration-result', { ok: false, error: 'Profile streaming helper not loaded.' });
        return;
      }

      var sandbox = getSandboxName();
      var ecid = getEcidFromStrip();
      setMessage('Updating profile…', '');

      var streamingResolved = await fetchStreamingForSandbox(sandbox);
      if (streamingResolved.error) {
        setMessage(streamingResolved.error, 'error');
        postToFrame('sky-news-registration-result', { ok: false, error: streamingResolved.error });
        return;
      }

      var profileBody = {
        email: emailForUpdate,
        ecid: ecid || undefined,
        sandbox: sandbox || undefined,
        industry: 'generic',
        updates: list,
        streaming: streamingResolved.streaming,
      };

      try {
        var profileResult = await global.postProfileUpdate(profileBody);
        if (!profileResult || !profileResult.ok) {
          var profileErr =
            typeof global.formatProfileUpdateError === 'function' && profileResult && profileResult.data
              ? global.formatProfileUpdateError(profileResult.data)
              : (profileResult &&
                  profileResult.data &&
                  (profileResult.data.error || profileResult.data.message)) ||
                'Profile update failed.';
          setMessage(profileErr + ' Sending experience event anyway…', 'warning');
          var eventAfterProfileFail = await sendSkyNewsExperienceEvent(eventPayload || {});
          postToFrame('sky-news-registration-result', {
            ok: !!eventAfterProfileFail,
            step: 'event',
            profileError: profileErr,
            profileResponse: profileResult && profileResult.data ? profileResult.data : undefined,
            eventSent: !!eventAfterProfileFail,
          });
          return;
        }
        scheduleDrawerProfileReload(emailForUpdate);
        refreshDrawerEvents();
        setMessage((profileResult.data && profileResult.data.message) || 'Profile updated. Sending event…', 'success');
        var eventOk = await sendSkyNewsExperienceEvent(eventPayload || {});
        if (eventOk) scheduleDrawerProfileReload(emailForUpdate);
        postToFrame('sky-news-registration-result', {
          ok: !!eventOk,
          step: eventOk ? 'complete' : 'event',
          profileResponse: profileResult.data,
          eventSent: !!eventOk,
        });
      } catch (err) {
        var netErr = (err && err.message) || 'Network error';
        setMessage(netErr, 'error');
        postToFrame('sky-news-registration-result', { ok: false, error: netErr });
      }
    }

    function reloadDrawerProfile(email) {
      var em = String(email || getEmail() || '').trim();
      if (!em || typeof global.DemoProfileDrawer === 'undefined') return;
      if (typeof global.DemoProfileDrawer.loadProfileDataForDrawer !== 'function') return;
      void global.DemoProfileDrawer.loadProfileDataForDrawer(em, {
        updateMessage: false,
        sendApplicationLogin: false,
      });
    }

    function scheduleDrawerProfileReload(email) {
      reloadDrawerProfile(email);
      global.setTimeout(function () {
        reloadDrawerProfile(email);
      }, 4000);
      global.setTimeout(function () {
        reloadDrawerProfile(email);
      }, 12000);
    }

    function refreshDrawerEvents() {
      if (typeof global.DemoProfileDrawer === 'undefined') return;
      if (typeof global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile === 'function') {
        void global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        global.setTimeout(function () {
          void global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        }, 2500);
        global.setTimeout(function () {
          void global.DemoProfileDrawer.refreshDrawerEventsForLoadedProfile();
        }, 8000);
        return;
      }
      var ecid = getEcidFromStrip();
      var email = String(getEmail() || '').trim();
      var id = email || ecid;
      var ns = email ? 'email' : ecid ? 'ecid' : '';
      if (!id || typeof global.DemoProfileDrawer.refreshDrawerEventsForIdentity !== 'function') return;
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
        refreshDrawerEvents();
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
        addressLine: profile.addressLine || '',
        postcode: profile.postcode || '',
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

      if (ev.data.type === 'sky-news-insider-registration') {
        void handleInsiderRegistration(ev.data.updates, ev.data.payload);
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

    global.addEventListener('aep-profile-drawer-loaded', function () {
      postProfilePrefillToFrame();
    });

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
