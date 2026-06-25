/**
 * Rocco Forte Hotels — booking calendar, guest selectors, summary panel.
 */
(function roccoForteBooking(global) {
  'use strict';

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /** @type {{ checkIn: Date | null, checkOut: Date | null, adults: number, children: number, promoCode: string, groupCode: string, viewMonth: Date }} */
  const state = {
    checkIn: null,
    checkOut: null,
    adults: 2,
    children: 0,
    promoCode: '',
    groupCode: '',
    viewMonth: startOfMonth(new Date()),
  };

  let abandonBasketTimerId = null;
  let abandonBasketSentForRange = '';

  function clearAbandonBasketTimer() {
    if (abandonBasketTimerId != null) {
      global.clearTimeout(abandonBasketTimerId);
      abandonBasketTimerId = null;
    }
  }

  function bookingRangeKey() {
    if (!state.checkIn || !state.checkOut) return '';
    return state.checkIn.toISOString().slice(0, 10) + '|' + state.checkOut.toISOString().slice(0, 10);
  }

  function getEmailForEvent() {
    const el = document.getElementById('customerEmail');
    return el ? String(el.value || '').trim() : '';
  }

  function getSelectedGeneratorTarget() {
    const select = document.getElementById('generatorTarget');
    if (!select) return null;
    const id = select.value || '';
    const opt = select.selectedOptions && select.selectedOptions[0];
    if (!id || !opt) return null;
    return { id: id, label: opt.textContent || id, transport: opt.dataset.transport || '' };
  }

  function augmentGeneratorPostBody(body) {
    if (
      typeof global.AepDemoGeneratorTargets !== 'undefined' &&
      typeof global.AepDemoGeneratorTargets.augmentGeneratorPostBody === 'function'
    ) {
      return global.AepDemoGeneratorTargets.augmentGeneratorPostBody(body);
    }
    return body;
  }

  async function sendBookingEvent(eventType) {
    const email = getEmailForEvent();
    const target = getSelectedGeneratorTarget();
    const infoEcid = document.getElementById('infoEcid');
    const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
    const ecid =
      ecidText && ecidText !== '-' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;

    const body = augmentGeneratorPostBody({
      targetId: target ? target.id : undefined,
      email: email || undefined,
      eventType: eventType,
      viewName: 'Rocco Forte Hotels — Booking',
      viewUrl: global.location ? global.location.href.split('?')[0] : '',
      channel: 'Web',
      public: {
        checkIn: state.checkIn ? state.checkIn.toISOString().slice(0, 10) : null,
        checkOut: state.checkOut ? state.checkOut.toISOString().slice(0, 10) : null,
        adults: state.adults,
        children: state.children,
        promoCode: state.promoCode || null,
        groupCode: state.groupCode || null,
      },
    });
    if (ecid) body.ecid = ecid;

    try {
      const res = await fetch('/api/events/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[Rocco Forte demo] Event failed:', data.error || data.message || res.status);
        return false;
      }
      if (typeof global.roccoForteDemoConfig !== 'undefined' && typeof global.roccoForteDemoConfig.setMessage === 'function') {
        global.roccoForteDemoConfig.setMessage(data.message || 'abandon.basket event sent.', 'success');
      }
      return true;
    } catch (err) {
      console.warn('[Rocco Forte demo] Event network error:', err);
      return false;
    }
  }

  /** Fires abandon.basket 5s after a complete date range is selected (timer resets on change). */
  function scheduleAbandonBasketAfterDates() {
    clearAbandonBasketTimer();
    if (!state.checkIn || !state.checkOut) return;

    const rangeKey = bookingRangeKey();
    if (abandonBasketSentForRange === rangeKey) return;

    abandonBasketTimerId = global.setTimeout(function () {
      abandonBasketTimerId = null;
      if (!state.checkIn || !state.checkOut) return;
      if (bookingRangeKey() !== rangeKey) return;
      if (abandonBasketSentForRange === rangeKey) return;
      abandonBasketSentForRange = rangeKey;
      void sendBookingEvent('abandon.basket');
    }, 5000);
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }

  function sameDay(a, b) {
    return (
      a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }


  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isBeforeDay(a, b) {
    return startOfDay(a).getTime() < startOfDay(b).getTime();
  }

  function isInRange(day, start, end) {
    if (!start || !end) return false;
    const t = startOfDay(day).getTime();
    return t >= startOfDay(start).getTime() && t <= startOfDay(end).getTime();
  }

  function formatSummaryRange() {
    if (!state.checkIn) return '';
    const fmt = (d) =>
      String(d.getMonth() + 1).padStart(2, '0') +
      '/' +
      String(d.getDate()).padStart(2, '0') +
      '/' +
      d.getFullYear();
    if (!state.checkOut) return fmt(state.checkIn);
    return fmt(state.checkIn) + ' - ' + fmt(state.checkOut);
  }

  function formatArrivalDeparture(d) {
    if (!d) return { day: '', month: '' };
    return {
      day: String(d.getDate()).padStart(2, '0'),
      month: MONTH_NAMES[d.getMonth()].toUpperCase(),
    };
  }

  const els = {
    rangeBar: document.getElementById('rfBookingRangeBar'),
    monthLeft: document.getElementById('rfCalendarMonthLeft'),
    monthRight: document.getElementById('rfCalendarMonthRight'),
    daysLeft: document.getElementById('rfCalendarDaysLeft'),
    daysRight: document.getElementById('rfCalendarDaysRight'),
    titleLeft: document.getElementById('rfCalendarTitleLeft'),
    titleRight: document.getElementById('rfCalendarTitleRight'),
    prevBtn: document.getElementById('rfCalendarPrev'),
    nextBtn: document.getElementById('rfCalendarNext'),
    arrivalDay: document.getElementById('rfArrivalDay'),
    arrivalMonth: document.getElementById('rfArrivalMonth'),
    departureDay: document.getElementById('rfDepartureDay'),
    departureMonth: document.getElementById('rfDepartureMonth'),
    adultsTrigger: document.getElementById('rfAdultsTrigger'),
    adultsMenu: document.getElementById('rfAdultsMenu'),
    childrenTrigger: document.getElementById('rfChildrenTrigger'),
    childrenMenu: document.getElementById('rfChildrenMenu'),
    promoInput: document.getElementById('rfPromoCode'),
    groupInput: document.getElementById('rfGroupCode'),
    checkBtn: document.getElementById('rfCheckAvailability'),
  };

  function buildMonthGrid(monthDate, container) {
    if (!container) return;
    container.innerHTML = '';
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfDay(new Date());

    const leading = startWeekday;
    const prevMonthDays = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      let dayNum;
      let cellDate;
      let isOutside = false;

      if (i < leading) {
        dayNum = prevMonthDays - leading + i + 1;
        cellDate = new Date(year, month - 1, dayNum);
        isOutside = true;
      } else if (i >= leading + daysInMonth) {
        dayNum = i - leading - daysInMonth + 1;
        cellDate = new Date(year, month + 1, dayNum);
        isOutside = true;
      } else {
        dayNum = i - leading + 1;
        cellDate = new Date(year, month, dayNum);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rf-booking-day';
      btn.textContent = String(dayNum);
      btn.dataset.date = cellDate.toISOString();
      if (isOutside) btn.classList.add('is-outside');

      const disabled = isBeforeDay(cellDate, today);
      if (disabled) btn.classList.add('is-disabled');

      if (state.checkIn && sameDay(cellDate, state.checkIn)) {
        btn.classList.add('is-range-start', 'is-selected');
      }
      if (state.checkOut && sameDay(cellDate, state.checkOut)) {
        btn.classList.add('is-range-end', 'is-selected');
      }
      if (state.checkIn && state.checkOut && isInRange(cellDate, state.checkIn, state.checkOut)) {
        btn.classList.add('is-range-middle', 'is-selected');
        if (!sameDay(cellDate, state.checkIn)) btn.classList.remove('is-range-start');
        if (!sameDay(cellDate, state.checkOut)) btn.classList.remove('is-range-end');
      }

      if (!disabled) {
        btn.addEventListener('click', function () {
          onDayClick(cellDate);
        });
      }

      container.appendChild(btn);
    }
  }

  function onDayClick(day) {
    const d = startOfDay(day);
    clearAbandonBasketTimer();
    if (!state.checkIn || (state.checkIn && state.checkOut)) {
      state.checkIn = d;
      state.checkOut = null;
    } else if (isBeforeDay(d, state.checkIn)) {
      state.checkIn = d;
      state.checkOut = null;
    } else if (sameDay(d, state.checkIn)) {
      state.checkOut = null;
    } else {
      state.checkOut = d;
    }
    render();
    scheduleAbandonBasketAfterDates();
  }

  function renderCalendars() {
    const left = state.viewMonth;
    const right = addMonths(left, 1);
    if (els.titleLeft) els.titleLeft.textContent = MONTH_NAMES[left.getMonth()] + ' ' + left.getFullYear();
    if (els.titleRight) els.titleRight.textContent = MONTH_NAMES[right.getMonth()] + ' ' + right.getFullYear();
    buildMonthGrid(left, els.daysLeft);
    buildMonthGrid(right, els.daysRight);
  }

  function renderSummary() {
    const rangeText = formatSummaryRange();
    if (els.rangeBar) {
      if (rangeText) {
        els.rangeBar.textContent = rangeText;
        els.rangeBar.classList.remove('is-empty');
      } else {
        els.rangeBar.textContent = 'Select dates';
        els.rangeBar.classList.add('is-empty');
      }
    }

    const arrival = formatArrivalDeparture(state.checkIn);
    const departure = formatArrivalDeparture(state.checkOut);

    if (els.arrivalDay) els.arrivalDay.textContent = arrival.day || '';
    if (els.arrivalMonth) els.arrivalMonth.textContent = arrival.month || '';
    if (els.departureDay) els.departureDay.textContent = departure.day || '';
    if (els.departureMonth) els.departureMonth.textContent = departure.month || '';

    if (els.adultsTrigger) {
      const label = els.adultsTrigger.querySelector('.rf-booking-dropdown__label');
      const text = state.adults + (state.adults === 1 ? ' Adult' : ' Adults');
      if (label) label.textContent = text;
    }
    if (els.childrenTrigger) {
      const label = els.childrenTrigger.querySelector('.rf-booking-dropdown__label');
      const text = state.children + (state.children === 1 ? ' Child' : ' Children');
      if (label) label.textContent = text;
    }

    const ready = !!(state.checkIn && state.checkOut);
    if (els.checkBtn) {
      els.checkBtn.classList.toggle('is-ready', ready);
      els.checkBtn.disabled = !ready;
    }
  }

  function render() {
    renderCalendars();
    renderSummary();
  }

  function initDropdown(trigger, menu, options, onSelect) {
    if (!trigger || !menu) return;
    const wrap = trigger.closest('.rf-booking-dropdown');
    menu.innerHTML = '';
    options.forEach(function (val) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rf-booking-dropdown__option';
      btn.textContent = val + (val === 1 ? ' adult' : ' adults');
      if (menu.id === 'rfChildrenMenu') {
        btn.textContent = val + (val === 1 ? ' child' : ' children');
      }
      btn.addEventListener('click', function () {
        onSelect(val);
        menu.hidden = true;
        if (wrap) wrap.classList.remove('is-open');
        renderSummary();
      });
      li.appendChild(btn);
      menu.appendChild(li);
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = !menu.hidden;
      closeAllDropdowns();
      if (!open) {
        menu.hidden = false;
        if (wrap) wrap.classList.add('is-open');
      }
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.rf-booking-dropdown__menu').forEach(function (m) {
      m.hidden = true;
    });
    document.querySelectorAll('.rf-booking-dropdown').forEach(function (d) {
      d.classList.remove('is-open');
    });
  }

  document.addEventListener('click', closeAllDropdowns);

  if (els.prevBtn) {
    els.prevBtn.addEventListener('click', function () {
      const todayMonth = startOfMonth(new Date());
      const next = addMonths(state.viewMonth, -1);
      if (next.getTime() < todayMonth.getTime()) return;
      state.viewMonth = next;
      renderCalendars();
      updateCalendarNavState();
    });
  }

  if (els.nextBtn) {
    els.nextBtn.addEventListener('click', function () {
      state.viewMonth = addMonths(state.viewMonth, 1);
      renderCalendars();
      updateCalendarNavState();
    });
  }

  function updateCalendarNavState() {
    if (!els.prevBtn) return;
    const todayMonth = startOfMonth(new Date());
    els.prevBtn.disabled = state.viewMonth.getTime() <= todayMonth.getTime();
  }

  initDropdown(
    els.adultsTrigger,
    els.adultsMenu,
    [1, 2, 3, 4, 5, 6],
    function (n) {
      state.adults = n;
    },
  );

  initDropdown(
    els.childrenTrigger,
    els.childrenMenu,
    [0, 1, 2, 3, 4, 5, 6],
    function (n) {
      state.children = n;
    },
  );

  if (els.promoInput) {
    els.promoInput.addEventListener('input', function () {
      state.promoCode = els.promoInput.value.trim();
    });
  }

  if (els.groupInput) {
    els.groupInput.addEventListener('input', function () {
      state.groupCode = els.groupInput.value.trim();
    });
  }

  if (els.checkBtn) {
    els.checkBtn.addEventListener('click', function () {
      if (!state.checkIn || !state.checkOut) return;
      clearAbandonBasketTimer();
      const payload = {
        checkIn: state.checkIn.toISOString().slice(0, 10),
        checkOut: state.checkOut.toISOString().slice(0, 10),
        adults: state.adults,
        children: state.children,
        promoCode: state.promoCode,
        groupCode: state.groupCode,
      };
      console.info('[Rocco Forte demo] Check availability — booking state:', payload);
      if (typeof global.roccoForteDemoConfig !== 'undefined' && typeof global.roccoForteDemoConfig.setMessage === 'function') {
        global.roccoForteDemoConfig.setMessage(
          'Availability check is a demo placeholder. Next booking step is not implemented yet.',
          'success',
        );
      }
    });
  }

  render();
  updateCalendarNavState();

  global.RoccoForteBooking = {
    getState: function () {
      return Object.assign({}, state);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
