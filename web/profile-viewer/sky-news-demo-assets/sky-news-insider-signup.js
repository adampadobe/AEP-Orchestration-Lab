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
      updates.push({ path: 'interestTypes.interests', value: interests });
    }
    updates.push({ path: 'media.contractStatus', value: CONTRACT_STATUS });
    return updates;
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'sky-news-demo-shell') return;
    if (ev.data.type === 'sky-news-profile-prefill') {
      applyProfilePrefill(ev.data.profile);
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
    var plan = data.get('plan');
    var email = String(data.get('email') || '').trim();
    var firstName = String(data.get('firstName') || '').trim();
    var lastName = String(data.get('lastName') || '').trim();
    var profileUpdates = buildProfileUpdates(data, interests);

    var payload = {
      eventType: 'insider.registered',
      viewName: 'Sky News Insider Signup',
      viewUrl: typeof location !== 'undefined' ? location.href.split('?')[0] : '',
      email: email,
      person: {
        name: {
          firstName: firstName,
          lastName: lastName,
        },
      },
      personalEmail: { address: email },
      homeAddress: {
        street1: String(data.get('addressLine') || '').trim(),
        city: String(data.get('city') || '').trim(),
        postalCode: String(data.get('postcode') || '').trim(),
        country: 'GB',
      },
      tenant: {
        interestTypes: {
          interests: interests,
        },
        media: {
          contractStatus: CONTRACT_STATUS,
        },
      },
      public: {
        insider: {
          plan: plan,
          marketingOptIn: !!data.get('marketingOptIn'),
          termsAccepted: !!data.get('termsAccepted'),
          signupDate: new Date().toISOString(),
        },
      },
    };

    if (
      window.SkyNewsLabEvents &&
      typeof window.SkyNewsLabEvents.submitRegistration === 'function'
    ) {
      window.SkyNewsLabEvents.submitRegistration(profileUpdates, payload);
    } else if (window.SkyNewsLabEvents && typeof window.SkyNewsLabEvents.emit === 'function') {
      window.SkyNewsLabEvents.emit(payload);
    }

    if (preview && previewJson && previewTime) {
      previewTime.textContent = new Date().toLocaleTimeString();
      previewJson.textContent = JSON.stringify(
        {
          profileUpdate: {
            updates: profileUpdates,
            _demoemea: {
              interestTypes: { interests: interests },
              media: { contractStatus: CONTRACT_STATUS },
            },
          },
          experienceEvent: {
            eventType: payload.eventType,
            person: payload.person,
            personalEmail: payload.personalEmail,
            homeAddress: payload.homeAddress,
            _demoemea: {
              interestTypes: payload.tenant.interestTypes,
              media: payload.tenant.media,
              public: payload.public,
            },
          },
        },
        null,
        2,
      );
      preview.classList.add('show');
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
})();
