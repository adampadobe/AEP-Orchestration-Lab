/**
 * Stages 04–06 (channel, send time, message) for the anatomy iframe tab content.
 * Merged into window.AEP_PIPELINE_INDUSTRY_LABELS after ajo-pipeline-industry-labels.js loads.
 * FSI intentionally has no merge here — apply.js restores the HTML baseline for FSI.
 */
(function () {
  var root = window.AEP_PIPELINE_INDUSTRY_LABELS;
  if (!root) return;

  function chRow(iconStyle, icon, name, meta, score, barClass, barW, winner, dimmed, metaWarn) {
    return {
      iconStyle: iconStyle,
      icon: icon,
      name: name,
      meta: meta,
      score: score,
      barClass: barClass,
      barW: barW,
      winner: !!winner,
      dimmed: !!dimmed,
      metaWarn: !!metaWarn,
    };
  }

  function stdSpectrum() {
    return {
      scheduledLabel: 'SCHEDULED',
      scheduledDetail: 'Outbound · we pick the moment',
      realtimeLabel: 'REAL-TIME',
      realtimeDetail: 'Inbound · they pick the moment',
      markers: [
        { cls: 'outbound', left: '24%', label: 'Push' },
        { cls: 'outbound', left: '32%', label: 'SMS' },
        { cls: 'inbound', left: '78%', label: 'Web' },
        { cls: 'inbound', left: '86%', label: 'In-app' },
      ],
    };
  }

  function stdMetrics(tOpen, tSched) {
    return [
      { label: 'Outbound · scheduled at', value: tSched, valueClass: 'red' },
      { label: 'Predicted open rate', value: tOpen, valueClass: 'teal', barW: tOpen },
      { label: 'Inbound · response time', value: '<100ms', valueClass: 'amber' },
      { label: 'Lift vs batch send', value: '+31%', valueClass: 'blue' },
    ];
  }

  function stdChannelGroups(pushMeta, emailMeta) {
    return [
      {
        cssClass: 'inbound',
        label: 'INBOUND  ·  customer-initiated · sub-100ms decision',
        rows: [
          chRow('background:var(--teal-soft);color:var(--teal)', '🌐', 'Web personalisation', 'on-session triggers', '0.68', 'bar-teal', '68%'),
          chRow('background:var(--blue-soft);color:var(--blue)', '📲', 'In-app message', 'on-session triggers', '0.62', 'bar-blue', '62%'),
        ],
      },
      {
        cssClass: 'outbound',
        label: 'OUTBOUND  ·  brand-initiated · fatigue-aware',
        rows: [
          chRow('background:var(--accent-soft);color:var(--accent)', '📱', 'Push notification', pushMeta, '0.84', 'bar-red', '84%', true),
          chRow('background:var(--blue-soft);color:var(--blue)', '💬', 'SMS', 'opt-in confirmed', '0.66', 'bar-blue', '66%'),
          chRow('background:var(--coral-soft);color:var(--coral)', '✉', 'Email', emailMeta, '0.32', 'bar-amber', '32%', false, true, true),
        ],
      },
      {
        cssClass: 'agent',
        label: 'AGENT & PAID  ·  external orchestration',
        rows: [
          chRow('background:var(--amber-soft);color:var(--amber)', '🤖', 'Voice agent', 'recently-used · agentic NEW', '0.58', 'bar-amber', '58%'),
        ],
      },
    ];
  }

  var packs = {
    media: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Alex Chen\'s reachability, engagement propensity by channel, and contact policy. Inbound surfaces respond in-session; outbound respects fatigue and consent.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 prime-time trailer boost',
          'weekly recap cap reached this week'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Alex\'s push engagement (0.84) wins arbitration. Evening mobile-first usage contributes a +0.32 boost. Email is deprioritised — the weekly editorial recap cap is already reached, so fatigue rules apply. Web and in-app stay armed for sub-100ms session triggers.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'For outbound channels (push, SMS), the engine schedules delivery at Alex\'s predicted peak-engagement window. For inbound channels (web, in-app), there is no schedule — the engine responds in real time the moment the subscriber returns.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'The model predicts Alex\'s peak engagement at <strong style="color:var(--accent)">20:00 – 21:00</strong> — aligning with evening binge-and-upgrade behaviour. Push is scheduled automatically for that window.',
        metrics: stdMetrics('95%', '20:00'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library. Selection Strategy ranks eligible items, applies eligibility and capping, and chooses the top item per container — including a dynamic underused-feature surface and a variant-aware primary item.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Upgrade & save · standard variant', meta: 'trial window > 48h · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Upgrade & save · urgency variant', meta: 'activates if trial ends < 24h', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Continue-watching rail · underused surface', meta: 'feature_enabled = false · nurture journey', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'Drama bundle · AI-ranked next-best', meta: 'genre_affinity', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Ad-lite tier · AI-ranked secondary', meta: 'ad_tier_eligible', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'Your upgrade offer is ready',
        bodyHtml:
          'Hi Alex — your personalised upgrade stack is ready. Estimated monthly delta vs current plan: <strong style="color:var(--teal)">$6.40</strong>.',
        cta: 'Review offer',
        brandNote:
          'Brand voice: confident, concise, no hard urgency. The standard variant is delivered while the trial window is >24h away — tighten the trial clock in Flow Analysis to surface the urgency variant.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage — profile, journey, path, channel, send time, and message — fed the next. One decision, one channel, one moment, one variant — tuned to Alex and to subscriber economics together.',
      },
    },

    retail: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Morgan Lee\'s reachability, channel propensity, and contact policy. Inbound surfaces fire on session; outbound respects promos and frequency caps.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 back-in-stock boost',
          'promotional email frequency cap reached this week'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Morgan\'s push engagement (0.84) wins arbitration. Mobile-first basket signals add a +0.32 boost. Email is throttled — the weekly promotional cap is already reached. Web and in-app remain live for sub-100ms session triggers.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'For outbound channels (push, SMS), the engine schedules delivery at Morgan\'s predicted peak-engagement window. For inbound channels (web, in-app), evaluation is real time when Morgan shops.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'The model predicts Morgan\'s peak engagement at <strong style="color:var(--accent)">19:00 – 20:00</strong> — post-commute mobile browsing. Push is scheduled automatically for that window.',
        metrics: stdMetrics('95%', '19:00'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library. Selection Strategy ranks offers, applies eligibility and capping, and chooses the top item per container — including dynamic merchandising and variant-aware hero items.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Basket rescue · standard variant', meta: 'slot window > 24h · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Basket rescue · urgency variant', meta: 'activates if slot < 24h', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Loyalty burn reminder · underused surface', meta: 'points_expire_soon = true', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'Care plan attach · AI-ranked next-best', meta: 'SKU affinity', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Click & collect fast lane · secondary', meta: 'omnichannel_active', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'Your basket is still saved',
        bodyHtml:
          'Hi Morgan — your cart is reserved with free delivery if you check out tonight. You are <strong style="color:var(--teal)">£18</strong> away from the next loyalty tier.',
        cta: 'Checkout',
        brandNote:
          'Retail voice: helpful, low pressure. Standard variant while the pickup slot is >24h out — move the slot slider in Flow Analysis to trigger urgency creative.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage fed the next — one decision, one channel, one moment, one variant — tuned to Morgan and to basket economics.',
      },
    },

    travel: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Jordan Miles\' reachability, trip-context propensity, and contact policy. Inbound surfaces handle live shopping sessions; outbound respects disruption alerts and caps.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 day-of-travel boost',
          'marketing email cap reached this week'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Jordan\'s push engagement (0.84) wins arbitration. Day-of-travel context contributes a +0.32 boost. Marketing email is capped for the week. Web and in-app stay ready for instant itinerary changes.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'For outbound channels (push, SMS), the engine schedules at Jordan\'s peak-engagement window. Inbound channels evaluate the moment Jordan opens the app or web trip workspace.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'Peak engagement aligns with <strong style="color:var(--accent)">07:00 – 08:00</strong> pre-departure checks. Push is scheduled for that window.',
        metrics: stdMetrics('95%', '07:00'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library — ancillaries, disruption nudges, and loyalty moments ranked with eligibility and capping.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Seat + bag bundle · standard variant', meta: 'departure > 48h · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Seat + bag bundle · urgency variant', meta: 'activates if departure < 24h', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Lounge upgrade · underused surface', meta: 'tier_eligible = false · nurture', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'Travel insurance · AI-ranked next-best', meta: 'trip_risk_score', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Wi‑Fi day pass · secondary', meta: 'route_history', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'Your upgrade bundle is ready',
        bodyHtml:
          'Hi Jordan — your seat map is updated with a bag bundle that saves <strong style="color:var(--teal)">£42</strong> vs airport walk-up.',
        cta: 'Add bundle',
        brandNote:
          'Travel tone: clear, operational, low anxiety. Standard variant while departure is >24h — tighten the countdown in Flow Analysis to swap urgency creative.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage fed the next — tuned to Jordan and to trip completion economics.',
      },
    },

    sports: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Chris Taylor\'s reachability, gameday engagement propensity, and contact policy.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 gameday digital boost',
          'weekly partner email cap reached'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Chris\'s push engagement (0.84) wins arbitration. Gameday digital habits contribute a +0.32 boost. Partner email is capped for the week. Web and in-app stay live for instant seat-map refreshes.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'Outbound push and SMS align to Chris\'s peak windows; inbound web and in-app respond in real time on match week.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'Peak engagement clusters at <strong style="color:var(--accent)">18:00 – 19:00</strong> on match eve. Push is scheduled for that window.',
        metrics: stdMetrics('95%', '18:00'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library — renewals, upsells, and hospitality ranked with eligibility and capping.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Renewal checkout · standard variant', meta: 'payment plan > 30d · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Renewal checkout · urgency variant', meta: 'activates if deadline < 24h', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Parking + F&B pack · underused surface', meta: 'gameday_attendee = true', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'Seat upgrade map · AI-ranked next-best', meta: 'viewline_affinity', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Partner merch drop · secondary', meta: 'merch_propensity', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'Renewal is almost locked in',
        bodyHtml:
          'Hi Chris — your seats are held at tonight\'s price. You unlock <strong style="color:var(--teal)">12%</strong> off hospitality if you confirm before kickoff.',
        cta: 'Renew now',
        brandNote:
          'Sports voice: energetic but respectful. Standard variant while the payment plan window is >24h — use Flow Analysis to simulate deadline pressure.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage fed the next — tuned to Chris and to renewal yield.',
      },
    },

    telecommunications: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Sam Okonkwo\'s reachability, plan usage signals, and contact policy.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 unlimited-plan engagement boost',
          'bill alert SMS already sent this cycle'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Sam\'s push engagement (0.84) wins arbitration. Heavy data usage on unlimited plans contributes a +0.32 boost. Marketing email is fatigue-limited this week. Web and in-app stay instant for network-status moments.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'Outbound push and SMS align to Sam\'s peak device usage; inbound surfaces respond when Sam opens the account app or signed-in web session.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'Peak engagement lands at <strong style="color:var(--accent)">21:00 – 22:00</strong> — late-evening streaming and social usage on mobile. Push is scheduled for that window.',
        metrics: stdMetrics('95%', '21:00'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library — plan upgrades, add-ons, and support prompts ranked with eligibility and capping.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Fibre upgrade · standard variant', meta: 'install window > 7d · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Fibre upgrade · urgency variant', meta: 'activates if port date < 48h', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Roaming fair-use coach · underused surface', meta: 'roaming_enabled = false', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'Entertainment pack · AI-ranked next-best', meta: 'usage_cluster', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Device trade-in · secondary', meta: 'handset_age_months', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'Your upgrade window is open',
        bodyHtml:
          'Hi Sam — your line is fibre-ready. Estimated bill impact with bundle: <strong style="color:var(--teal)">+$12/mo</strong> with 6 months loyalty credit applied.',
        cta: 'See options',
        brandNote:
          'Telco voice: transparent pricing, no bait-and-switch. Standard variant while install is >48h out — compress the install window in Flow Analysis for urgency creative.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage fed the next — tuned to Sam and to attach economics.',
      },
    },

    public: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Riley Kim\'s reachability, service-alert preferences, and public-sector contact policy.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 reduced-fare alert boost',
          'service bulletin email cap reached this week'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Riley\'s push engagement (0.84) wins arbitration. Reduced-fare eligibility and tap-to-ride habits contribute a +0.32 boost. Service bulletin email is capped. Web and in-app stay live for real-time trip tools.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'Outbound push and SMS align to Riley\'s commute peaks; inbound web and in-app respond when Riley opens trip tools or station mode.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'Peak engagement aligns with <strong style="color:var(--accent)">07:30 – 08:30</strong> weekday commutes. Push is scheduled for that window.',
        metrics: stdMetrics('95%', '07:30'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library — benefits, service changes, and civic prompts ranked with eligibility and accessibility rules.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Transit benefit renewal · standard variant', meta: 'ID verification > 14d · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Transit benefit renewal · urgency variant', meta: 'activates if pass expires < 7d', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Trip planner tips · underused surface', meta: 'planner_enabled = false', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'Reduced fare proof upload · AI-ranked next-best', meta: 'income_verification', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Civic survey opt-in · secondary', meta: 'engagement_score', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'Your pass renewal is ready',
        bodyHtml:
          'Hi Riley — your reduced fare is ready to renew online. You save an estimated <strong style="color:var(--teal)">$34/mo</strong> vs cash fares on your usual route.',
        cta: 'Renew pass',
        brandNote:
          'Public-sector voice: plain language, accessibility-first. Standard variant while expiry is >7d away — shorten the expiry window in Flow Analysis for urgency creative.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage fed the next — tuned to Riley and to equitable service outcomes.',
      },
    },

    healthcare: {
      channelOptimisation: {
        tabEyebrow: 'Channel',
        tabTitle: 'Channel optimisation',
        title: 'Channel optimisation',
        intro:
          'The engine selects the best delivery channel for the chosen path — respecting Jordan Ellis\' reachability, channel consent, and HIPAA-aware contact policy.',
        cardTitle: 'Channel arbitration · grouped by direction',
        groups: stdChannelGroups(
          '+0.32 care-gap nudge boost',
          'wellness newsletter cap reached this week'
        ),
        resultTitle: 'Selected: Push notification (outbound)',
        resultBody:
          'Jordan\'s push engagement (0.84) wins arbitration. Care-gap and refill signals contribute a +0.32 boost. Wellness newsletter is capped for the week. Web portal and in-app stay instant for authenticated visits.',
      },
      sendTimeOptimisation: {
        tabEyebrow: 'Send time',
        tabTitle: 'Send time optimisation',
        title: 'Send time optimisation',
        intro:
          'Outbound push and SMS align to Jordan\'s preferred care windows; authenticated web and in-app respond in real time when Jordan opens the portal.',
        spectrumCardTitle: 'The timing spectrum · scheduled ↔ real-time',
        spectrum: stdSpectrum(),
        heatmapCardTitle: 'Outbound · engagement probability by hour of day',
        heatmapCaptionHtml:
          'Peak engagement aligns with <strong style="color:var(--accent)">17:00 – 18:00</strong> after work. Push is scheduled for that window.',
        metrics: stdMetrics('95%', '17:00'),
      },
      messagePersonalisation: {
        tabEyebrow: 'Message',
        tabTitle: 'Message personalisation',
        title: 'Message personalisation',
        intro:
          'The last mile assembles the push from the item library — care gaps, preventive prompts, and benefits ranked with eligibility, privacy, and capping.',
        selectionCardTitle: 'Selection Strategy · ranked items in the library',
        items: [
          { chosen: true, itypeStyle: 'primary', itypeLabel: 'PRIMARY', name: 'Virtual visit booking · standard variant', meta: 'symptom stable > 48h · calm framing', score: '0.92' },
          { itypeStyle: 'variant', itypeLabel: 'VARIANT', name: 'Virtual visit booking · urgency variant', meta: 'activates if care gap < 24h', score: '—' },
          { itypeStyle: 'dynamic', itypeLabel: 'DYNAMIC', name: 'Preventive checklist · underused surface', meta: 'checklist_completed = false', score: '0.78' },
          { itypeStyle: 'crosssell', itypeLabel: 'CROSS-SELL', name: 'In-network lab · AI-ranked next-best', meta: 'quality_gap_open', score: '0.65' },
          { itypeStyle: 'accentAlt', itypeLabel: 'CROSS-SELL', name: 'Pharmacy savings card · secondary', meta: 'formulary_tier', score: '0.54' },
        ],
        assembledCardTitle: 'Assembled push notification',
        subject: 'A care gap can close today',
        bodyHtml:
          'Hi Jordan — your A1C follow-up is due. Book a virtual visit in two taps; estimated copay after HSA: <strong style="color:var(--teal)">$25</strong>.',
        cta: 'Book visit',
        brandNote:
          'Clinical voice: supportive, no alarmism. Standard variant while the care gap is >24h — adjust the care-gap clock in Flow Analysis for urgency creative.',
        endBannerTitle: 'End-to-end optimisation complete',
        endBannerBody:
          'Each stage fed the next — tuned to Jordan and to quality outcomes.',
      },
    },
  };

  Object.keys(packs).forEach(function (k) {
    if (root[k]) Object.assign(root[k], packs[k]);
  });
})();
