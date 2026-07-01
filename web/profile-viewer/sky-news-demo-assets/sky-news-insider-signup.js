(function () {
  'use strict';

  var form = document.getElementById('insiderForm');
  var preview = document.getElementById('preview');
  var previewJson = document.getElementById('previewJson');
  var previewTime = document.getElementById('previewTime');

  var CONTRACT_STATUS = 'Insider Subscription';

  function applyProfilePrefill(profile) {
    if (!profile || typeof profile !== 'object') return;
    var map = {
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      city: 'city',
      addressLine: 'addressLine',
      postcode: 'postcode',
    };
    Object.keys(map).forEach(function (fieldId) {
      var el = document.getElementById(fieldId);
      if (!el) return;
      var key = map[fieldId];
      var val = profile[key];
      if (val != null && String(val).trim()) el.value = String(val).trim();
    });
  }

  /**
   * Paths match Profile Generation /api/profile/update (OOTB roots + _demoemea tenant leaves).
   * @param {FormData} data
   * @param {string[]} interests
   * @returns {Array<{ path: string, value: unknown }>}
   */
  function buildProfileUpdates(data, interests) {
    var email = String(data.get('email') || '').trim();
    var firstName = String(data.get('firstName') || '').trim();
    var lastName = String(data.get('lastName') || '').trim();
    var addressLine = String(data.get('addressLine') || '').trim();
    var city = String(data.get('city') || '').trim();
    var postcode = String(data.get('postcode') || '').trim();
    var plan = String(data.get('plan') || '').trim();
    /** @type {Array<{ path: string, value: unknown }>} */
    var updates = [];

    if (firstName) updates.push({ path: 'person.name.firstName', value: firstName });
    if (lastName) updates.push({ path: 'person.name.lastName', value: lastName });
    if (email) updates.push({ path: 'personalEmail.address', value: email });
    if (addressLine) updates.push({ path: 'homeAddress.street1', value: addressLine });
    if (city) updates.push({ path: 'homeAddress.city', value: city });
    if (postcode) updates.push({ path: 'homeAddress.postalCode', value: postcode });
    updates.push({ path: 'homeAddress.countryCode', value: 'GB' });
    if (interests.length) {
      updates.push({
        path: 'interestTypes',
        value: interests.map(function (topic) {
          return { interests: String(topic) };
        }),
      });
    }
    if (plan) updates.push({ path: 'media.accountType', value: plan });
    updates.push({ path: 'media.contractStatus', value: CONTRACT_STATUS });
    return updates;
  }

  /**
   * Experience event only — webPageDetails + insider.registered + public.insider metadata.
   * Person, address, interests and contract status belong on the profile stream, not the event schema.
   * @param {FormData} data
   * @param {string} email
   */
  function buildExperienceEventPayload(data, email) {
    return {
      eventType: 'insider.registered',
      viewName: 'Sky News Insider Signup',
      viewUrl: typeof location !== 'undefined' ? location.href.split('?')[0] : '',
      email: email,
      public: {
        insider: {
          plan: data.get('plan'),
          marketingOptIn: !!data.get('marketingOptIn'),
          termsAccepted: !!data.get('termsAccepted'),
          signupDate: new Date().toISOString(),
        },
      },
    };
  }

  function buildPreviewDoc(profileUpdates, eventPayload, interests, status, shellResult) {
    var doc = {
      status: status || 'pending',
      note:
        'Person, address, interests, plan (media.accountType) and contract status are written to the operational profile via POST /api/profile/update. The experience event is a slim insider.registered with webPageDetails and _demoemea.public.insider only.',
      profileStream: {
        endpoint: '/api/profile/update',
        updates: profileUpdates,
        _demoemea: {
          interestTypes: interests.map(function (topic) {
            return { interests: String(topic) };
          }),
          media: {
            accountType: (function () {
              var row = profileUpdates.find(function (u) {
                return u.path === 'media.accountType';
              });
              return row && row.value != null ? row.value : '';
            })(),
            contractStatus: CONTRACT_STATUS,
          },
        },
      },
      experienceEvent: {
        eventType: eventPayload.eventType,
        web: {
          webPageDetails: {
            name: eventPayload.viewName,
            URL: eventPayload.viewUrl,
            viewName: eventPayload.viewName,
          },
        },
        _demoemea: {
          public: eventPayload.public,
        },
      },
    };
    if (shellResult) doc.shellResult = shellResult;
    if (shellResult && shellResult.streamingTarget) doc.streamingTarget = shellResult.streamingTarget;
    if (shellResult && shellResult.streamPayloadProfile) doc.streamPayloadProfile = shellResult.streamPayloadProfile;
    return doc;
  }

  function showPreview(doc, scrollToPreview) {
    if (!preview || !previewJson || !previewTime) return;
    previewTime.textContent = new Date().toLocaleTimeString();
    previewJson.textContent = JSON.stringify(doc, null, 2);
    preview.classList.add('show');
    if (scrollToPreview) {
      preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'sky-news-demo-shell') return;
    if (ev.data.type === 'sky-news-profile-prefill') {
      applyProfilePrefill(ev.data.profile);
      return;
    }
    if (ev.data.type === 'sky-news-registration-result' && ev.data.detail) {
      var pending = window.__skyNewsPendingPreview;
      if (pending) {
        showPreview(
          buildPreviewDoc(
            pending.profileUpdates,
            pending.eventPayload,
            pending.interests,
            ev.data.detail.ok ? 'complete' : 'error',
            ev.data.detail,
          ),
          ev.data.detail.ok || !!ev.data.detail.profileError,
        );
        window.__skyNewsPendingPreview = null;
      }
    }
  });

  document.querySelectorAll('.plan').forEach(function (plan) {
    plan.addEventListener('click', function () {
      document.querySelectorAll('.plan').forEach(function (p) {
        p.classList.remove('selected');
      });
      plan.classList.add('selected');
      var input = plan.querySelector('input');
      if (input) input.checked = true;
    });
  });

  if (window.SkyNewsLabEvents && typeof window.SkyNewsLabEvents.requestProfilePrefill === 'function') {
    window.SkyNewsLabEvents.requestProfilePrefill();
  }

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var data = new FormData(form);
    var interests = data.getAll('interests');
    var email = String(data.get('email') || '').trim();
    var profileUpdates = buildProfileUpdates(data, interests);
    var eventPayload = buildExperienceEventPayload(data, email);

    window.__skyNewsPendingPreview = {
      profileUpdates: profileUpdates,
      eventPayload: eventPayload,
      interests: interests,
    };

    var inLabShell = window.parent && window.parent !== window;
    if (
      inLabShell &&
      window.SkyNewsLabEvents &&
      typeof window.SkyNewsLabEvents.submitRegistration === 'function'
    ) {
      showPreview(buildPreviewDoc(profileUpdates, eventPayload, interests, 'sending'), false);
      window.SkyNewsLabEvents.submitRegistration(profileUpdates, eventPayload);
      return;
    }

    showPreview(
      buildPreviewDoc(profileUpdates, eventPayload, interests, 'error', {
        ok: false,
        error:
          'Open this form from the Sky News demo shell (sky-news-demo.html) so profile streaming and events can reach AEP.',
      }),
    );
  });
})();
