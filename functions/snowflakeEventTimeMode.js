'use strict';

const RECENT_EVENT_WINDOW_MS = 6 * 60 * 60 * 1000;

function resolveEventTimeMode(input = {}) {
  if (input.eventTimeMode !== undefined && input.event_time_mode !== undefined
    && input.eventTimeMode !== input.event_time_mode) {
    throw new Error('eventTimeMode and event_time_mode must agree');
  }
  const mode = input.eventTimeMode !== undefined ? input.eventTimeMode
    : input.event_time_mode !== undefined ? input.event_time_mode : 'historical';
  if (!['historical', 'recent'].includes(mode)) {
    throw new Error('eventTimeMode must be historical or recent');
  }
  return mode;
}

module.exports = { RECENT_EVENT_WINDOW_MS, resolveEventTimeMode };
