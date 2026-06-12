/**
 * KSIA info pages — about, media, contact.
 */
(function () {
  'use strict';

  var data = window.KsiaMockData || {};

  function pageId() {
    return document.body && document.body.getAttribute('data-ksia-page-id');
  }

  function initAbout() {
    var content = data.ABOUT_CONTENT;
    if (!content) return;

    var lead = document.getElementById('ksiaAboutVisionLead');
    if (lead) lead.textContent = content.visionLead;

    var statsMount = document.getElementById('ksiaAboutStats');
    if (statsMount && content.stats) {
      statsMount.innerHTML = content.stats
        .map(function (s) {
          return (
            '<div class="ksia-about-stat">' +
            '<span class="ksia-about-stat-value">' + s.value + '</span>' +
            '<span class="ksia-about-stat-label">' + s.label + '</span></div>'
          );
        })
        .join('');
    }

    var pillarsMount = document.getElementById('ksiaAboutPillars');
    if (pillarsMount && content.pillars) {
      pillarsMount.innerHTML = content.pillars
        .map(function (p) {
          return (
            '<article class="ksia-about-pillar">' +
            '<h3 class="ksia-about-pillar-title">' + p.title + '</h3>' +
            '<p class="ksia-about-pillar-desc">' + p.desc + '</p></article>'
          );
        })
        .join('');
    }
  }

  function initMedia() {
    var mount = document.getElementById('ksiaMediaList');
    var items = data.MEDIA_ITEMS || [];
    if (mount) {
      mount.innerHTML = items
        .map(function (m) {
          return (
            '<article class="ksia-media-item">' +
            '<span class="ksia-media-tag">' + m.tag + '</span>' +
            '<time class="ksia-media-date" datetime="' + m.date + '">' + m.date + '</time>' +
            '<h3 class="ksia-media-title">' + m.title + '</h3>' +
            '<button type="button" class="ksia-btn ksia-btn-secondary ksia-media-download-btn">Download assets (mock)</button>' +
            '</article>'
          );
        })
        .join('');

      mount.querySelectorAll('.ksia-media-download-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.media.download', {});
          }
          btn.textContent = 'Requested (mock)';
        });
      });
    }
  }

  function initContact() {
    var mount = document.getElementById('ksiaContactChannels');
    var channels = data.CONTACT_CHANNELS || [];
    if (mount) {
      mount.innerHTML = channels
        .map(function (c) {
          return (
            '<div class="ksia-contact-channel">' +
            '<span class="ksia-contact-channel-label">' + c.label + '</span>' +
            '<span class="ksia-contact-channel-value">' + c.value + '</span>' +
            '<span class="ksia-contact-channel-hours">' + c.hours + '</span></div>'
          );
        })
        .join('');
    }

    var form = document.getElementById('ksiaContactForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.contact.submit', {});
        }
        var btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.textContent = 'Message sent (mock)';
          btn.disabled = true;
        }
      });
    }
  }

  function init() {
    var id = pageId();
    if (id === 'about') initAbout();
    if (id === 'media') initMedia();
    if (id === 'contact') initContact();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
