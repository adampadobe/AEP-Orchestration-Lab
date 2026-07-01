(function () {
  'use strict';

  var form = document.getElementById('insiderForm');
  var preview = document.getElementById('preview');
  var previewJson = document.getElementById('previewJson');
  var previewTime = document.getElementById('previewTime');

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

    if (window.SkyNewsLabEvents && typeof window.SkyNewsLabEvents.emit === 'function') {
      window.SkyNewsLabEvents.emit(payload);
    }

    if (preview && previewJson && previewTime) {
      previewTime.textContent = new Date().toLocaleTimeString();
      previewJson.textContent = JSON.stringify(
        {
          eventType: payload.eventType,
          person: payload.person,
          personalEmail: payload.personalEmail,
          homeAddress: payload.homeAddress,
          _demoemea: {
            interestTypes: payload.tenant.interestTypes,
            public: payload.public,
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
