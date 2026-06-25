/**
 * Rocco Forte Hotels — Leaflet map (local demo; no live booking app dependency).
 *
 * initRoccoForteMap(containerId, options)
 */
(function roccoForteMap(global) {
  'use strict';

  var PIN_SVG =
    '<svg viewBox="0 0 24 32" aria-hidden="true" focusable="false" width="22" height="30">' +
    '<path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0zm0 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>' +
    '</svg>';

  /** Pale land / light water — Carto Positron (OSM data). */
  var DEFAULT_TILES = {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  };

  var EUROPE_VIEW = {
    center: [52, 12],
    zoom: 4,
  };

  function resolveContainer(containerId) {
    if (!containerId) return null;
    if (typeof containerId === 'string') return document.getElementById(containerId);
    if (containerId.nodeType === 1) return containerId;
    return null;
  }

  function createPinIcon(L) {
    return L.divIcon({
      className: 'rf-map-pin-icon',
      html: '<span class="rf-map-pin-icon__svg">' + PIN_SVG + '</span>',
      iconSize: [22, 30],
      iconAnchor: [11, 30],
      popupAnchor: [0, -28],
    });
  }

  function findHotel(hotels, id) {
    if (!id || !hotels || !hotels.length) return null;
    for (var i = 0; i < hotels.length; i += 1) {
      if (hotels[i].id === id) return hotels[i];
    }
    return null;
  }

  /**
   * @param {string|HTMLElement} containerId
   * @param {{
   *   hotels?: Array<{ id: string, name: string, lat: number, lng: number, city?: string }>,
   *   defaultHotelId?: string,
   *   initialView?: { center: [number, number], zoom: number },
   *   focalBounds?: [[number, number], [number, number]],
   *   focalZoom?: number,
   *   flyToOnLoad?: boolean,
   *   flyToDelay?: number,
   *   flyToDuration?: number,
   *   tiles?: { url: string, attribution: string, subdomains?: string, maxZoom?: number },
   *   onMarkerClick?: (hotel: object, marker: object) => void,
   *   onReady?: (api: object) => void,
   * }} [options]
   */
  function initRoccoForteMap(containerId, options) {
    options = options || {};
    var container = resolveContainer(containerId);
    if (!container) {
      console.warn('[Rocco Forte map] Container not found:', containerId);
      return null;
    }
    if (!global.L) {
      console.warn('[Rocco Forte map] Leaflet (L) is not loaded.');
      return null;
    }

    var L = global.L;
    var hotels = Array.isArray(options.hotels) ? options.hotels.slice() : [];
    var pinIcon = createPinIcon(L);

    var map = L.map(container, {
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: true,
      touchZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: true,
      attributionControl: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    var tiles = options.tiles || DEFAULT_TILES;
    L.tileLayer(tiles.url, {
      attribution: tiles.attribution,
      subdomains: tiles.subdomains || 'abcd',
      maxZoom: tiles.maxZoom || 19,
    }).addTo(map);

    var initial = options.initialView || EUROPE_VIEW;
    map.setView(initial.center, initial.zoom, { animate: false });

    var markers = [];
    hotels.forEach(function (hotel) {
      if (typeof hotel.lat !== 'number' || typeof hotel.lng !== 'number') return;
      var marker = L.marker([hotel.lat, hotel.lng], {
        icon: pinIcon,
        title: hotel.name || '',
      });
      marker.addTo(map);
      marker._rfHotel = hotel;
      if (typeof options.onMarkerClick === 'function') {
        marker.on('click', function () {
          options.onMarkerClick(hotel, marker);
        });
      }
      markers.push(marker);
    });

    function flyToHotel(hotelId) {
      var hotel = findHotel(hotels, hotelId);
      if (!hotel) return;
      map.flyTo([hotel.lat, hotel.lng], options.focalZoom || 6, {
        duration: options.flyToDuration != null ? options.flyToDuration : 1.25,
      });
    }

    function flyToFocal() {
      var duration = options.flyToDuration != null ? options.flyToDuration : 1.25;
      var padding = options.flyToPadding || [48, 48];

      if (options.focalBounds && options.focalBounds.length === 2) {
        map.flyToBounds(options.focalBounds, {
          padding: padding,
          duration: duration,
          maxZoom: options.focalZoom || 6,
        });
        return;
      }

      if (markers.length > 1) {
        map.flyToBounds(L.featureGroup(markers).getBounds(), {
          padding: padding,
          duration: duration,
          maxZoom: options.focalZoom || 6,
        });
        return;
      }

      var defaultHotel =
        findHotel(hotels, options.defaultHotelId) || (hotels.length ? hotels[0] : null);
      if (defaultHotel) {
        map.flyTo([defaultHotel.lat, defaultHotel.lng], options.focalZoom || 6, { duration: duration });
      }
    }

    var api = {
      map: map,
      markers: markers,
      flyToFocal: flyToFocal,
      flyToHotel: flyToHotel,
      invalidateSize: function () {
        map.invalidateSize();
      },
    };

    map.whenReady(function () {
      map.invalidateSize();
      if (options.flyToOnLoad !== false) {
        global.setTimeout(flyToFocal, options.flyToDelay != null ? options.flyToDelay : 450);
      }
      if (typeof options.onReady === 'function') options.onReady(api);
    });

    if (typeof global.ResizeObserver !== 'undefined') {
      var ro = new global.ResizeObserver(function () {
        map.invalidateSize();
      });
      ro.observe(container);
      api._resizeObserver = ro;
    }

    return api;
  }

  global.initRoccoForteMap = initRoccoForteMap;
  global.RoccoForteMapDefaults = {
    tiles: DEFAULT_TILES,
    europeView: EUROPE_VIEW,
  };
})(typeof window !== 'undefined' ? window : globalThis);
