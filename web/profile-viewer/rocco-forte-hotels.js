/**
 * Rocco Forte Hotels — Step 1 hotel list + map markers.
 */
(function roccoForteHotels(global) {
  'use strict';

  var HOTELS = [
    {
      id: 'browns',
      name: "Brown's Hotel",
      city: 'London',
      price: '£1,939',
      priceLabel: 'Including Taxes & Fees',
      description:
        "In the heart of London's elegant Mayfair, Brown's Hotel is an iconic luxury hotel where history and 21st-century sophistication come together.",
      image: 'https://d1t1qzzb2zwrre.cloudfront.net/master/upload/64/648ce746a8762427713548.jpg',
      mapTop: '42%',
      mapLeft: '28%',
    },
    {
      id: 'balmoral',
      name: 'The Balmoral',
      city: 'Edinburgh',
      price: '£850',
      priceLabel: 'Including Taxes & Fees',
      description:
        'The Balmoral, 1 Princes Street, where Old Town meets New, a legendary hotel and landmark clock tower: a symbol of its city.',
      image: 'https://d1t1qzzb2zwrre.cloudfront.net/master/upload/64/64887242ece56026022320.jpg',
      mapTop: '22%',
      mapLeft: '24%',
    },
    {
      id: 'charles',
      name: 'The Charles Hotel',
      city: 'Munich',
      price: '€805',
      priceLabel: 'Including Taxes & Fees',
      description:
        'Set within the verdant Lenbachgärten quarter, the effortlessly elegant Charles Hotel in Munich is where contemporary style meets traditional Bavarian hospitality.',
      image: 'https://d1t1qzzb2zwrre.cloudfront.net/master/upload/64/6488731d13a0e539669644.jpeg',
      mapTop: '48%',
      mapLeft: '52%',
    },
    {
      id: 'savoy',
      name: 'Hotel Savoy',
      city: 'Florence',
      price: '€1,846',
      priceLabel: 'Including Taxes & Fees',
      description:
        "In pride of place on the Piazza della Repubblica, amongst the city's leading landmarks, an iconic Florentine hotel.",
      image: 'https://d1t1qzzb2zwrre.cloudfront.net/master/upload/64/648872ce61473213807990.jpg',
      mapTop: '58%',
      mapLeft: '50%',
    },
    {
      id: 'de-russie',
      name: 'Hotel de Russie',
      city: 'Rome',
      price: '€2,280',
      priceLabel: 'Including Taxes & Fees',
      description:
        'A true Roman luminary between Piazza del Popolo and the Spanish Steps, the classical and cosmopolitan come together at Hotel de Russie.',
      image: 'https://d1t1qzzb2zwrre.cloudfront.net/master/upload/64/6488db44d06ae879250731.jpg',
      mapTop: '62%',
      mapLeft: '54%',
    },
    {
      id: 'verdura',
      name: 'Verdura Resort',
      city: 'Sciacca',
      price: '€1,250',
      priceLabel: 'Including Taxes & Fees',
      description:
        'Welcome to Verdura Resort: 230 hectares of sun-kissed Mediterranean coastline, countryside, spa and golf.',
      image: 'https://d1t1qzzb2zwrre.cloudfront.net/master/upload/64/648b73892ad6f265951230.JPG',
      mapTop: '72%',
      mapLeft: '52%',
    },
  ];

  var els = {
    list: document.getElementById('rfHotelsList'),
    map: document.getElementById('rfHotelsMap'),
    tabDates: document.getElementById('rfHotelsTabDates'),
    modifyBtn: document.getElementById('rfHotelsModifyDates'),
    empty: document.getElementById('rfHotelsEmpty'),
    split: document.getElementById('rfHotelsSplit'),
  };

  function getBookingState() {
    if (typeof global.RoccoForteBookingState !== 'undefined' && global.RoccoForteBookingState.load) {
      return global.RoccoForteBookingState.load();
    }
    return null;
  }

  function renderHotelCard(hotel, booking) {
    var article = document.createElement('article');
    article.className = 'rf-hotel-card';
    article.dataset.hotelId = hotel.id;

    var img = document.createElement('div');
    img.className = 'rf-hotel-card__image';
    img.style.backgroundImage = 'url("' + hotel.image + '")';
    img.setAttribute('role', 'img');
    img.setAttribute('aria-label', hotel.name);

    var body = document.createElement('div');
    body.className = 'rf-hotel-card__body';

    var head = document.createElement('div');
    head.className = 'rf-hotel-card__head';
    head.innerHTML =
      '<h2 class="rf-hotel-card__name">' +
      hotel.name +
      '</h2><div class="rf-hotel-card__city">' +
      hotel.city +
      '</div>';

    var descRow = document.createElement('div');
    descRow.className = 'rf-hotel-card__desc-row';
    descRow.innerHTML =
      '<p class="rf-hotel-card__desc">' +
      hotel.description +
      '</p>' +
      '<div class="rf-hotel-card__price">From <div class="rf-hotel-card__price-value">' +
      hotel.price +
      ' <span>/ night</span></div>' +
      '<span class="rf-hotel-card__price-label">' +
      hotel.priceLabel +
      '</span></div>';

    var actions = document.createElement('div');
    actions.className = 'rf-hotel-card__actions';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rf-hotel-card__select';
    btn.textContent = 'Select Hotel';
    btn.addEventListener('click', function () {
      onSelectHotel(hotel, booking);
    });
    actions.appendChild(btn);

    body.appendChild(head);
    body.appendChild(descRow);
    body.appendChild(actions);
    article.appendChild(img);
    article.appendChild(body);
    return article;
  }

  function renderMapMarkers(hotels) {
    if (!els.map) return;
    els.map.querySelectorAll('.rf-hotels-map-marker').forEach(function (m) {
      m.remove();
    });
    hotels.forEach(function (hotel) {
      var pin = document.createElement('div');
      pin.className = 'rf-hotels-map-marker';
      pin.textContent = hotel.price;
      pin.style.top = hotel.mapTop;
      pin.style.left = hotel.mapLeft;
      pin.setAttribute('aria-hidden', 'true');
      els.map.appendChild(pin);
    });
  }

  function onSelectHotel(hotel, booking) {
    var next = Object.assign({}, booking || {}, { selectedHotelId: hotel.id, selectedHotelName: hotel.name });
    if (typeof global.RoccoForteBookingState !== 'undefined') {
      global.RoccoForteBookingState.save(next);
    }
    console.info('[Rocco Forte demo] Hotel selected:', hotel.name, next);
    if (typeof global.roccoForteDemoConfig !== 'undefined' && typeof global.roccoForteDemoConfig.setMessage === 'function') {
      global.roccoForteDemoConfig.setMessage(
        'Selected ' + hotel.name + '. Room selection step is not implemented yet.',
        'success',
      );
    }
  }

  function showEmptyState() {
    if (els.split) els.split.hidden = true;
    if (els.empty) els.empty.hidden = false;
  }

  function init() {
    var booking = getBookingState();
    if (!booking || !booking.checkIn || !booking.checkOut) {
      showEmptyState();
      return;
    }

    if (els.empty) els.empty.hidden = true;
    if (els.split) els.split.hidden = false;

    if (els.tabDates && typeof global.RoccoForteBookingState !== 'undefined') {
      els.tabDates.textContent = global.RoccoForteBookingState.formatDisplayRange(booking.checkIn, booking.checkOut);
    }

    if (els.modifyBtn) {
      els.modifyBtn.addEventListener('click', function () {
        global.location.href = 'rocco-forte-booking.html';
      });
    }

    if (els.list) {
      els.list.innerHTML = '';
      HOTELS.forEach(function (hotel) {
        els.list.appendChild(renderHotelCard(hotel, booking));
      });
    }

    renderMapMarkers(HOTELS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.RoccoForteHotels = { hotels: HOTELS };
})(typeof window !== 'undefined' ? window : globalThis);
