(function () {
  'use strict';

  var assets = 'natwest-decisioning-assets/';
  var profiles = {
    isa: {
      accountType: 'Current account',
      segment: 'Reward',
      intent: 'Save',
      activity: 'Viewed Fixed Rate ISA',
      permission: 'Opted in',
      service: 'Clear',
      safety: 'Clear',
      contacts: '1',
    },
    mortgage: {
      accountType: 'Mortgage',
      segment: 'Premier',
      intent: 'Move home',
      activity: 'Used mortgage calculator',
      permission: 'Opted in',
      service: 'Clear',
      safety: 'Clear',
      contacts: '1',
    },
    borrowing: {
      accountType: 'Personal loan',
      segment: 'Select',
      intent: 'Borrow',
      activity: 'Viewed borrowing options',
      permission: 'Opted in',
      service: 'Clear',
      safety: 'Clear',
      contacts: '1',
    },
    suppressed: {
      accountType: 'Current account',
      segment: 'Reward',
      intent: 'Save',
      activity: 'Viewed Fixed Rate ISA',
      permission: 'Opted out',
      service: 'Clear',
      safety: 'Clear',
      contacts: '4',
    },
  };

  var offers = [
    {
      id: 'isa',
      name: 'Explore a Fixed Rate ISA',
      type: 'SAVINGS',
      subject: 'A little more from your savings?',
      preheader: 'Explore NatWest savings options that fit your plans.',
      headline: 'Make more of your savings',
      copy:
        'The captured NatWest homepage featured a one year Fixed Rate ISA at 4.25% AER / tax-free p.a. (fixed). This is a historical page reference, not a live rate.',
      cta: 'Explore savings options',
      image: 'isa-savings-couple.png',
      imageAlt: 'A couple reviewing their finances together',
      tags: ['Savings intent', 'Recent ISA interest'],
      score: function (profile) {
        return 32 +
          (profile.intent === 'Save' ? 32 : 0) +
          (profile.activity === 'Viewed Fixed Rate ISA' ? 20 : 0) +
          (profile.accountType === 'Current account' || profile.accountType === 'Savings' ? 12 : 0) +
          (profile.segment === 'Premier' || profile.segment === 'Select' ? 4 : 0);
      },
      why: 'Savings intent and recent ISA activity make this the strongest relevant content.',
    },
    {
      id: 'mortgage',
      name: 'Moving home mortgage options',
      type: 'HOME FINANCE',
      subject: 'Planning your next move?',
      preheader: 'See what to consider when moving home with a mortgage.',
      headline: 'A new home starts with a plan',
      copy:
        'Explore the steps involved in moving home with a mortgage, including the questions to ask and options to review with NatWest.',
      cta: 'Explore mortgage options',
      image: 'isa-savings-couple.png',
      imageAlt: 'Customers discussing their finances at home',
      tags: ['Home-move intent', 'Mortgage activity'],
      score: function (profile) {
        return 30 +
          (profile.intent === 'Move home' ? 34 : 0) +
          (profile.activity === 'Used mortgage calculator' ? 22 : 0) +
          (profile.accountType === 'Mortgage' ? 12 : 0);
      },
      why: 'Moving-home intent and mortgage research make this the most relevant next step.',
    },
    {
      id: 'loan',
      name: 'Explore borrowing options',
      type: 'BORROWING',
      subject: 'Exploring ways to borrow?',
      preheader: 'Review borrowing information and important considerations.',
      headline: 'Understand your borrowing options',
      copy:
        'Review the information available about borrowing and consider what may suit your circumstances. This content does not indicate approval or affordability.',
      cta: 'Review borrowing information',
      image: 'mobile-app-customer.png',
      imageAlt: 'A customer using a mobile phone at home',
      tags: ['Borrowing intent', 'Product research'],
      score: function (profile) {
        return 28 +
          (profile.intent === 'Borrow' ? 34 : 0) +
          (profile.activity === 'Viewed borrowing options' ? 22 : 0) +
          (profile.accountType === 'Personal loan' ? 12 : 0);
      },
      why: 'Borrowing intent and recent product research align with informational content.',
    },
    {
      id: 'app',
      name: 'Discover the NatWest app',
      type: 'DIGITAL BANKING',
      subject: 'Banking on your terms',
      preheader: 'Discover ways to manage day-to-day banking in the app.',
      headline: 'Your everyday banking, in one place',
      copy:
        'Explore the NatWest app features shown in the captured site reference and find out how to manage everyday banking from your mobile.',
      cta: 'Explore the app',
      image: 'mobile-app-customer.png',
      imageAlt: 'A customer using a mobile phone at home',
      tags: ['Everyday banking', 'Digital experience'],
      score: function (profile) {
        return 35 +
          (profile.intent === 'Everyday banking' ? 28 : 0) +
          (profile.activity === 'Active in mobile app' ? 18 : 0) +
          (profile.accountType === 'Current account' ? 10 : 0);
      },
      why: 'Day-to-day banking intent makes app features a useful supporting experience.',
    },
  ];

  var serviceMessage = {
    id: 'service',
    name: 'Service case update',
    type: 'SERVICE MESSAGE',
    subject: 'An update about your NatWest service request',
    preheader: 'A service update is available for you.',
    headline: 'We’re here to help',
    copy:
      'There is an open service case on this simulated profile. The demo prioritises a service update and suppresses promotional content.',
    cta: 'View service information',
    image: 'mobile-app-customer.png',
    imageAlt: 'A customer using a mobile phone at home',
    tags: ['Service-first', 'Promotions suppressed'],
    score: function () {
      return 100;
    },
    why: 'An open service case takes priority over promotional communications.',
  };

  var fieldNames = {
    accountType: 'nwAccountType',
    segment: 'nwSegment',
    intent: 'nwIntent',
    activity: 'nwActivity',
    permission: 'nwPermission',
    service: 'nwService',
    safety: 'nwSafety',
    contacts: 'nwContactCount',
  };

  var elements = {
    status: document.getElementById('decisionStatus'),
    winnerType: document.getElementById('winnerType'),
    winnerScore: document.getElementById('winnerScore'),
    winnerName: document.getElementById('winnerName'),
    winnerWhy: document.getElementById('winnerWhy'),
    tags: document.getElementById('decisionTags'),
    ranking: document.getElementById('offerRanking'),
    guardrailSummary: document.getElementById('guardrailSummary'),
    guardrails: document.getElementById('guardrailList'),
    profileSummary: document.getElementById('profileSummary'),
    contactCountValue: document.getElementById('contactCountValue'),
    emailSubject: document.getElementById('emailSubject'),
    emailPreheader: document.getElementById('emailPreheader'),
    emailHeadline: document.getElementById('emailHeadline'),
    emailCopy: document.getElementById('emailCopy'),
    emailImage: document.getElementById('emailImage'),
    emailCta: document.getElementById('emailCta'),
    emailFootnote: document.getElementById('emailFootnote'),
    mobileKicker: document.getElementById('mobileKicker'),
    mobileHeadline: document.getElementById('mobileHeadline'),
    mobileCopy: document.getElementById('mobileCopy'),
    mobileImage: document.getElementById('mobileImage'),
    mobileCta: document.getElementById('mobileCta'),
    webKicker: document.getElementById('webKicker'),
    webHeadline: document.getElementById('webHeadline'),
    webCopy: document.getElementById('webCopy'),
    webImage: document.getElementById('webImage'),
    webCta: document.getElementById('webCta'),
  };

  function readProfile() {
    var profile = {};
    Object.keys(fieldNames).forEach(function (key) {
      var field = document.getElementById(fieldNames[key]);
      profile[key] = field.value;
    });
    return profile;
  }

  function evaluate(profile) {
    var blockedReasons = [];
    if (profile.safety === 'Review required') {
      blockedReasons.push('Contact safety review holds all outbound messages.');
    }
    if (profile.service === 'Open') {
      blockedReasons.push('Open service case suppresses promotional content.');
    }
    if (Number(profile.contacts) >= 3) {
      blockedReasons.push('Contact-frequency cap reached (3 or more in 30 days).');
    }
    if (profile.permission !== 'Opted in') {
      blockedReasons.push('Marketing permission is opted out.');
    }

    var promoAllowed = blockedReasons.length === 0;
    var ranked = offers.map(function (offer) {
      return {
        offer: offer,
        score: Math.min(99, Math.round(offer.score(profile))),
        allowed: promoAllowed,
      };
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    if (profile.safety === 'Review required') {
      return { winner: null, ranked: ranked, blockedReasons: blockedReasons, status: 'Contact hold' };
    }
    if (profile.service === 'Open') {
      return { winner: serviceMessage, ranked: ranked, blockedReasons: blockedReasons, status: 'Service first' };
    }
    if (!promoAllowed) {
      return { winner: null, ranked: ranked, blockedReasons: blockedReasons, status: 'Promotions suppressed' };
    }
    return { winner: ranked[0].offer, ranked: ranked, blockedReasons: blockedReasons, status: 'Decision ready' };
  }

  function addTag(parent, text) {
    var tag = document.createElement('span');
    tag.className = 'nw-tag';
    tag.textContent = text;
    parent.appendChild(tag);
  }

  function renderTags(winner) {
    elements.tags.replaceChildren();
    if (!winner) {
      addTag(elements.tags, 'No content served');
      return;
    }
    winner.tags.forEach(function (tag) {
      addTag(elements.tags, tag);
    });
  }

  function renderRanking(result) {
    elements.ranking.replaceChildren();
    result.ranked.forEach(function (item) {
      var row = document.createElement('li');
      var name = document.createElement('span');
      var detail = document.createElement('span');
      var score = document.createElement('span');
      var isWinner = result.winner && item.offer.id === result.winner.id;

      name.className = 'nw-rank-name';
      name.textContent = item.offer.name;
      detail.className = 'nw-rank-detail';
      detail.textContent = item.allowed ? item.offer.type : 'Suppressed by guardrail';
      name.appendChild(detail);
      score.className = 'nw-rank-score' + (item.allowed ? '' : ' is-suppressed');
      score.textContent = item.allowed ? item.score + ' pts' : 'Held';
      if (isWinner) row.classList.add('is-winner');
      if (!item.allowed) row.classList.add('is-suppressed');
      row.appendChild(name);
      row.appendChild(score);
      elements.ranking.appendChild(row);
    });
  }

  function renderGuardrails(profile, result) {
    var checks = [
      { name: 'Contact safety', ok: profile.safety === 'Clear', message: profile.safety === 'Clear' ? 'Clear' : 'Review required' },
      { name: 'Service case', ok: profile.service === 'Clear', message: profile.service === 'Clear' ? 'No open case' : 'Promotions paused' },
      { name: 'Marketing permission', ok: profile.permission === 'Opted in', message: profile.permission === 'Opted in' ? 'Opted in' : 'Opted out' },
      { name: 'Contact frequency', ok: Number(profile.contacts) < 3, message: Number(profile.contacts) < 3 ? profile.contacts + ' / 3 cap' : 'Frequency cap reached' },
    ];
    elements.guardrails.replaceChildren();
    checks.forEach(function (check) {
      var row = document.createElement('li');
      var dot = document.createElement('span');
      var text = document.createElement('span');
      dot.className = 'nw-guardrail-dot';
      text.textContent = check.name + ': ' + check.message;
      if (!check.ok) row.classList.add('is-blocked');
      row.appendChild(dot);
      row.appendChild(text);
      elements.guardrails.appendChild(row);
    });
    elements.guardrailSummary.textContent = result.blockedReasons.length ?
      result.blockedReasons.length + ' promotion hold' + (result.blockedReasons.length > 1 ? 's' : '') :
      'All checks passed';
  }

  function setImage(element, winner) {
    element.src = assets + winner.image;
    element.alt = winner.imageAlt;
  }

  function renderExperience(winner) {
    if (!winner) {
      elements.emailSubject.textContent = 'No promotional message selected';
      elements.emailPreheader.textContent = 'The profile does not currently meet the demo send rules.';
      elements.emailHeadline.textContent = 'No promotional content will be sent';
      elements.emailCopy.textContent = 'The decision was held by a contact-safety, consent or frequency guardrail. Update the profile signals to preview eligible content.';
      elements.emailImage.hidden = true;
      elements.emailCta.hidden = true;
      elements.emailFootnote.textContent = 'No promotional content is rendered while a hold is active.';
      elements.mobileKicker.textContent = 'MESSAGE HELD';
      elements.mobileHeadline.textContent = 'We’ve paused this message';
      elements.mobileCopy.textContent = 'No promotional content is selected for this profile.';
      elements.mobileImage.hidden = true;
      elements.mobileCta.hidden = true;
      elements.webKicker.textContent = 'PERSONALISED CONTENT HELD';
      elements.webHeadline.textContent = 'No promotional banner is shown';
      elements.webCopy.textContent = 'The current profile signals require the decision to hold promotional content.';
      elements.webImage.hidden = true;
      elements.webCta.hidden = true;
      return;
    }

    elements.emailSubject.textContent = winner.subject;
    elements.emailPreheader.textContent = winner.preheader;
    elements.emailHeadline.textContent = winner.headline;
    elements.emailCopy.textContent = winner.copy;
    elements.emailImage.hidden = false;
    elements.emailCta.hidden = false;
    elements.emailCta.textContent = winner.cta;
    elements.emailFootnote.textContent = winner.id === 'isa' ?
      'The rate shown is from the supplied captured page and may no longer be current.' :
      'Explore information only; product availability and terms may vary.';
    setImage(elements.emailImage, winner);
    elements.mobileKicker.textContent = winner.type;
    elements.mobileHeadline.textContent = winner.headline;
    elements.mobileCopy.textContent = winner.copy;
    elements.mobileImage.hidden = false;
    elements.mobileCta.hidden = false;
    elements.mobileCta.textContent = winner.cta;
    elements.mobileImage.src = assets + (winner.id === 'isa' ? 'mobile-app-customer.png' : winner.image);
    elements.mobileImage.alt = winner.id === 'isa' ? 'A NatWest customer using a mobile phone' : winner.imageAlt;
    elements.webKicker.textContent = winner.type;
    elements.webHeadline.textContent = winner.headline;
    elements.webCopy.textContent = winner.copy;
    elements.webImage.hidden = false;
    elements.webCta.hidden = false;
    elements.webCta.textContent = winner.cta;
    setImage(elements.webImage, winner);
  }

  function render() {
    var profile = readProfile();
    var result = evaluate(profile);
    var winner = result.winner;
    elements.status.textContent = result.status;
    elements.status.classList.toggle('is-blocked', !winner || result.status === 'Service first');
    elements.winnerType.textContent = winner ? winner.type : 'NO CONTENT SERVED';
    elements.winnerScore.textContent = winner ? (winner.id === 'service' ? 'Priority' : result.ranked[0].score + ' pts') : 'Held';
    elements.winnerName.textContent = winner ? winner.name : 'Promotional message suppressed';
    elements.winnerWhy.textContent = winner ?
      winner.why :
      result.blockedReasons.join(' ') || 'No eligible experience is available for this profile.';
    elements.profileSummary.textContent = profile.accountType + ' · ' + profile.segment + ' · ' + profile.intent;
    elements.contactCountValue.textContent = profile.contacts;
    renderTags(winner);
    renderRanking(result);
    renderGuardrails(profile, result);
    renderExperience(winner);
  }

  function setScenario(name) {
    var values = profiles[name];
    if (!values) return;
    Object.keys(values).forEach(function (key) {
      document.getElementById(fieldNames[key]).value = values[key];
    });
    render();
  }

  function setChannel(channel) {
    var validChannels = ['email', 'mobile', 'web'];
    var activeChannel = validChannels.indexOf(channel) >= 0 ? channel : 'email';
    validChannels.forEach(function (name) {
      var tab = document.querySelector('[data-channel="' + name + '"]');
      var panel = document.getElementById('preview-' + name);
      var selected = name === activeChannel;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    });
    var url = new URL(window.location.href);
    if (url.searchParams.get('channel') !== activeChannel) {
      url.searchParams.set('channel', activeChannel);
      window.history.replaceState(null, '', url);
    }
  }

  document.querySelectorAll('[data-profile-field]').forEach(function (field) {
    field.addEventListener('input', render);
    field.addEventListener('change', render);
  });
  document.querySelectorAll('[data-scenario]').forEach(function (button) {
    button.addEventListener('click', function () {
      setScenario(button.getAttribute('data-scenario'));
    });
  });
  document.querySelectorAll('[data-channel]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      setChannel(tab.getAttribute('data-channel'));
    });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var channels = ['email', 'mobile', 'web'];
      var current = channels.indexOf(tab.getAttribute('data-channel'));
      var next = (current + (event.key === 'ArrowRight' ? 1 : channels.length - 1)) % channels.length;
      var nextTab = document.querySelector('[data-channel="' + channels[next] + '"]');
      setChannel(channels[next]);
      nextTab.focus();
    });
  });

  setChannel(new URLSearchParams(window.location.search).get('channel'));
  render();
})();
