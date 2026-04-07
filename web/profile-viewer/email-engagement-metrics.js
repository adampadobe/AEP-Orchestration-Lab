/**
 * Email engagement helpers aligned with Profile Viewer Details → Email Channel Engagement (Sends).
 * Used by aep-profile-drawer (donate / race demos); mirrors public/app.js filter + compute logic.
 */
(function (global) {
  function getEventNamespaceValue(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      return (
        p === '_experience.customerjourneymanagement.emailchannelcontext.namespace' ||
        p.endsWith('emailchannelcontext.namespace') ||
        p.endsWith('emailchannelcontext_namespace')
      );
    });
    if (!row || row.value == null) return '—';
    const val = String(row.value).trim();
    return val || '—';
  }

  function getEventFeedbackStatus(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      return (
        p === '_experience.customerjourneymanagement.messagedeliveryfeedback.feedbackstatus' ||
        (p.includes('messagedelivery') && p.includes('feedbackstatus'))
      );
    });
    if (!row || row.value == null) return '—';
    const val = String(row.value).trim();
    return val || '—';
  }

  function getEventInteractionType(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      const a = (r.attribute || '').toLowerCase();
      return (
        p === '_experience.customerjourneymanagement.messageinteraction.interactiontype' ||
        p.endsWith('messageinteraction.interactiontype') ||
        (p.includes('messageinteraction') && p.includes('interactiontype')) ||
        p.includes('messageinteraction/interactiontype') ||
        (a === 'interactiontype' && p.includes('messageinteraction'))
      );
    });
    if (!row || row.value == null) return '';
    return String(row.value).trim().toLowerCase();
  }

  function getPushChannelNamespaceValue(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      return (
        p.endsWith('pushchannelcontext.namespace') ||
        p.endsWith('pushchannelcontext_namespace') ||
        (p.includes('pushchannelcontext') && (p.endsWith('.namespace') || p.endsWith('_namespace')))
      );
    });
    if (!row || row.value == null) return '—';
    const val = String(row.value).trim();
    return val || '—';
  }

  /** True when pushChannelContext.platform is fcm or apns (AJO-style). */
  function hasPushChannelPlatform(ev) {
    const rows = ev.rows || [];
    for (const r of rows) {
      const p = (r.path || '').toLowerCase().replace(/_/g, '.');
      if (!p.includes('pushchannelcontext')) continue;
      if (!(p.endsWith('.platform') || p.endsWith('_platform'))) continue;
      const v = String(r.value || '').trim().toLowerCase();
      if (v === 'fcm' || v === 'apns') return true;
    }
    return false;
  }

  function filterPushEventsByDateRange(events, hoursBack) {
    if (!events || !events.length) return [];
    const now = Date.now();
    const cutoff = now - hoursBack * 60 * 60 * 1000;
    return events.filter((ev) => {
      const ts =
        ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
      if (ts < cutoff) return false;
      const ns = getPushChannelNamespaceValue(ev);
      if (ns && String(ns).toLowerCase() === 'push') return true;
      return hasPushChannelPlatform(ev);
    });
  }

  function filterEmailEventsByDateRange(events, hoursBack) {
    if (!events || !events.length) return [];
    const now = Date.now();
    const cutoff = now - hoursBack * 60 * 60 * 1000;
    return events.filter((ev) => {
      const ts =
        ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
      if (ts < cutoff) return false;
      const ns = getEventNamespaceValue(ev);
      return ns && String(ns).toLowerCase() === 'email';
    });
  }

  function filterEventsByDateRange(events, hoursBack) {
    if (!events || !events.length) return [];
    const now = Date.now();
    const cutoff = now - hoursBack * 60 * 60 * 1000;
    return events.filter((ev) => {
      const ts =
        ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
      return ts >= cutoff;
    });
  }

  function computeEmailEngagementMetrics(filtered, allDateFiltered) {
    const evName = (ev) => String(ev.eventName || '').toLowerCase();
    const fb = (ev) => String(getEventFeedbackStatus(ev)).toLowerCase();
    const has = (ev, ...terms) => {
      const n = evName(ev);
      const f = fb(ev);
      return terms.some((t) => n.includes(t) || f.includes(t));
    };
    const interactionType = (ev) => getEventInteractionType(ev);
    const sentOrDelivered = filtered.filter((ev) => has(ev, 'sent', 'delivered', 'delay')).length;
    const bounced = filtered.filter((ev) => has(ev, 'bounce')).length;
    const unsubscribed = filtered.filter((ev) => has(ev, 'unsub', 'exclude')).length;
    const eventsForOpensClicks = allDateFiltered && allDateFiltered.length > 0 ? allDateFiltered : filtered;
    const opens = eventsForOpensClicks.filter((ev) => interactionType(ev) === 'open').length;
    const clicks = eventsForOpensClicks.filter((ev) => interactionType(ev) === 'click').length;
    const sends = sentOrDelivered > 0 ? sentOrDelivered : filtered.length;
    const delivered = Math.max(sends - bounced, 0) || sends;
    const effectiveSends = Math.max(sends, 1);
    const effectiveDelivered = Math.max(delivered, 1);
    return {
      sends,
      delivered,
      bounced,
      unsubscribed,
      opens,
      clicks,
      deliveryRate: effectiveSends > 0 ? ((delivered / effectiveSends) * 100).toFixed(2) : null,
      bounceRate: effectiveSends > 0 ? ((bounced / effectiveSends) * 100).toFixed(2) : null,
      unsubRate: effectiveSends > 0 ? ((unsubscribed / effectiveSends) * 100).toFixed(2) : null,
      openRate: effectiveDelivered > 0 ? ((opens / effectiveDelivered) * 100).toFixed(2) : null,
      clickRate: effectiveDelivered > 0 ? ((clicks / effectiveDelivered) * 100).toFixed(2) : null,
      clickToOpenRate: opens > 0 ? ((clicks / opens) * 100).toFixed(2) : null,
    };
  }

  /**
   * @param {unknown[]} events
   * @param {number} [hoursBack]
   * @returns {number}
   */
  function getEmailSendsLastHours(events, hoursBack) {
    const h = hoursBack != null ? Number(hoursBack) : 24;
    const hours = Number.isFinite(h) && h > 0 ? h : 24;
    const filtered = filterEmailEventsByDateRange(events, hours);
    const allDateFiltered = filterEventsByDateRange(events, hours);
    return computeEmailEngagementMetrics(filtered, allDateFiltered).sends;
  }

  /**
   * Push sends in window — same send/delivery heuristic as email (message.feedback / tracking signals).
   * @param {unknown[]} events
   * @param {number} [hoursBack]
   * @returns {number}
   */
  function getPushSendsLastHours(events, hoursBack) {
    const h = hoursBack != null ? Number(hoursBack) : 24;
    const hours = Number.isFinite(h) && h > 0 ? h : 24;
    const filtered = filterPushEventsByDateRange(events, hours);
    const allDateFiltered = filterEventsByDateRange(events, hours);
    return computeEmailEngagementMetrics(filtered, allDateFiltered).sends;
  }

  global.EmailEngagementMetrics = {
    getEmailSendsLastHours,
    getPushSendsLastHours,
    computeEmailEngagementMetrics,
    filterEmailEventsByDateRange,
    filterPushEventsByDateRange,
    filterEventsByDateRange,
    getEventNamespaceValue,
    getPushChannelNamespaceValue,
    getEventFeedbackStatus,
    getEventInteractionType,
  };
})(typeof window !== 'undefined' ? window : globalThis);
