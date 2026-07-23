'use strict';

const { createHash } = require('crypto');
const {
  getIndustryEventConfig,
  listIndustryEventTypes,
} = require('./snowflakeIndustryEventRegistry');

const DAY_MS = 86400000;

function seededRandom(seed) {
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function context(industry, profile, generationId, now) {
  const random = seededRandom(`${industry}:${profile.ECID || profile.EMAIL}:${generationId}`);
  const int = (min, max) => Math.floor(random() * (max - min + 1)) + min;
  const number = (min, max, digits = 2) => Number((min + random() * (max - min)).toFixed(digits));
  const pick = (values) => values[int(0, values.length - 1)];
  const chance = (probability) => random() < probability;
  const timestamp = (maxDays = 90, offsetMs = 0) =>
    new Date(now.getTime() - int(0, maxDays * DAY_MS) - offsetMs).toISOString();
  const date = (maxDays = 90) => timestamp(maxDays).slice(0, 10);
  const futureDate = (minDays, maxDays) =>
    new Date(now.getTime() + int(minDays, maxDays) * DAY_MS).toISOString().slice(0, 10);
  const identity = {
    EMAIL: profile.EMAIL,
    ECID: profile.ECID,
    CRMID: profile.CRMID,
    GENERATIONID: generationId,
  };
  let sequence = 0;
  const event = (key, values, eventTimestamp) => ({
    ...identity,
    EVENTID: `${generationId}-${key}-${String(++sequence).padStart(4, '0')}`,
    TIMESTAMP: eventTimestamp || timestamp(),
    ...values,
    _RECORDCREATEDTIMESTAMP: now.toISOString(),
  });
  const enrichment = (values) => ({
    ...identity,
    ...values,
    _RECORDCREATEDTIMESTAMP: now.toISOString(),
  });
  return { random, int, number, pick, chance, timestamp, date, futureDate, event, enrichment };
}

function generateFsi(profile, ctx) {
  const digital = Array.from({ length: ctx.int(10, 30) }, () => {
    const action = ctx.pick(['login', 'transfer', 'payment', 'statement_download', 'balance_check', 'beneficiary_add']);
    return ctx.event('digital', {
      CHANNEL: ctx.pick(['web', 'mobile_app', 'tablet']),
      ACTION: action,
      AMOUNT: ['transfer', 'payment'].includes(action) ? ctx.number(10, 5000) : null,
      CURRENCY: 'GBP',
      DEVICE: ctx.pick(['iPhone 17 Pro', 'Samsung Galaxy S26', 'Desktop Chrome', 'iPad']),
      SESSION_DURATION_SECONDS: ctx.int(30, 1800),
      IP_COUNTRY: 'GB',
      AUTHENTICATION_METHOD: ctx.pick(['biometric', 'password', '2fa']),
    });
  });

  let balance = Number(profile.CHECKINGBALANCE || 4000);
  const transaction = Array.from({ length: ctx.int(30, 80) }, () => {
    const transactionType = ctx.pick([
      'salary', 'direct_debit', 'card_payment', 'ATM_withdrawal',
      'standing_order', 'interest', 'refund',
    ]);
    const credit = ['salary', 'interest', 'refund'].includes(transactionType);
    const amount = transactionType === 'salary'
      ? ctx.number(1800, Math.max(2200, Number(profile.HOUSEHOLDINCOME || 60000) / 12))
      : ctx.number(2, 450);
    balance = Math.max(0, balance + (credit ? amount : -amount));
    return ctx.event('transaction', {
      TRANSACTION_TYPE: transactionType,
      DIRECTION: credit ? 'credit' : 'debit',
      AMOUNT: amount,
      CURRENCY: 'GBP',
      MERCHANT: credit ? (transactionType === 'salary' ? 'Employer Payroll' : 'Bank Credit') : ctx.pick(['Tesco', 'Netflix', 'British Gas', 'TfL', 'Pret A Manger']),
      CATEGORY: credit ? 'income' : ctx.pick(['groceries', 'entertainment', 'utilities', 'transport', 'dining']),
      BALANCE_AFTER: Number(balance.toFixed(2)),
      ACCOUNT_TYPE: ctx.pick(['current', 'savings', 'credit_card']),
      REFERENCE: `FSI-${ctx.int(100000, 999999)}`,
    });
  }).sort((a, b) => a.TIMESTAMP.localeCompare(b.TIMESTAMP));

  const application = [];
  for (let app = 0; app < ctx.int(1, 4); app += 1) {
    const id = `APP-${ctx.int(100000, 999999)}`;
    const product = ctx.pick(['mortgage', 'personal_loan', 'credit_card', 'savings_account', 'investment_isa']);
    const finalStage = ctx.chance(0.72) ? 'completed' : ctx.pick(['declined', 'withdrawn']);
    const stages = ['started', 'identity_verified', 'income_verified', finalStage];
    const baseOffset = ctx.int(2, 80) * DAY_MS;
    stages.forEach((stage, index) => application.push(ctx.event('application', {
      APPLICATION_ID: id,
      PRODUCT_TYPE: product,
      STAGE: stage,
      AMOUNT_REQUESTED: ['mortgage', 'personal_loan'].includes(product) ? ctx.number(5000, 600000) : null,
      TERM_MONTHS: ['mortgage', 'personal_loan'].includes(product) ? ctx.pick([12, 24, 36, 60, 240, 300]) : null,
      CHANNEL: ctx.pick(['web', 'branch', 'phone', 'broker']),
      DECISION_REASON: ['declined', 'completed'].includes(stage) ? (stage === 'completed' ? 'affordability_passed' : 'affordability_failed') : null,
    }, new Date(ctx.timestamp(0, baseOffset - index * DAY_MS)).toISOString())));
  }

  const advisory = Array.from({ length: ctx.int(0, 5) }, () => ctx.event('advisory', {
    CHANNEL: ctx.pick(['branch', 'video_call', 'phone']),
    ADVISOR_ID: `ADV-${ctx.int(1000, 9999)}`,
    TOPIC: ctx.pick(['mortgage_review', 'investment_review', 'retirement_planning', 'insurance', 'general_review']),
    DURATION_MINUTES: ctx.int(20, 90),
    OUTCOME: ctx.pick(['product_recommended', 'no_action', 'referral', 'follow_up_booked']),
    NEXT_ACTION_DATE: ctx.chance(0.55) ? ctx.futureDate(7, 120) : null,
    NPS_SCORE: ctx.int(5, 10),
  }));

  const balances = [
    ['current_account', Number(profile.CHECKINGBALANCE || 0)],
    ['savings', Number(profile.SAVINGSBALANCE || 0)],
    ['mortgage', Number(profile.MORTGAGEBALANCE || 0)],
    ['credit_card', Number(profile.MONTHLYCREDITSPEND || 0)],
    ['isa', Number(profile.INVESTMENTVALUE || 0)],
    ['pension', Number(profile.INVESTMENTVALUE || 0) * 0.75],
  ].filter(([, value]) => value > 0);
  const products = balances.slice(0, Math.max(2, Math.min(6, Number(profile.TOTALACCOUNTS || 3))))
    .map(([type, value]) => ctx.enrichment({
      PRODUCT_TYPE: type,
      ACCOUNT_NUMBER: `GB-${ctx.int(10000000, 99999999)}`,
      OPEN_DATE: ctx.date(3650),
      BALANCE: Number(value.toFixed(2)),
      INTEREST_RATE: ctx.number(0.1, type === 'mortgage' ? 6.5 : 5.2, 4),
      TERM_END_DATE: ['mortgage', 'personal_loan'].includes(type) ? ctx.futureDate(180, 3650) : null,
      MONTHLY_PAYMENT: type === 'mortgage' ? ctx.number(500, 3500) : null,
      STATUS: 'active',
    }));
  return { digital, transaction, application, advisory, products };
}

function retailItem(ctx, category) {
  const price = ctx.number(8, 250);
  return {
    sku: `SKU-${ctx.int(10000, 99999)}`,
    name: `${category} ${ctx.pick(['Essential', 'Classic', 'Premium', 'Edition'])}`,
    category,
    qty: ctx.int(1, 3),
    price,
  };
}

function generateRetail(profile, ctx) {
  const category = profile.FAVOURITECATEGORY || 'fashion';
  const orderCount = Math.max(5, Math.min(25, Number(profile.ORDERSYTD || 8)));
  const order = Array.from({ length: orderCount }, () => {
    const items = Array.from({ length: ctx.int(1, 4) }, () => retailItem(ctx, ctx.chance(0.65) ? category : ctx.pick(['fashion', 'beauty', 'home', 'electronics', 'sports'])));
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return ctx.event('order', {
      ORDER_ID: `ORD-${ctx.int(100000, 999999)}`,
      ITEMS: items,
      ITEM_COUNT: items.reduce((sum, item) => sum + item.qty, 0),
      ORDER_TOTAL: Number(total.toFixed(2)),
      CURRENCY: 'GBP',
      PAYMENT_METHOD: ctx.pick(['credit_card', 'debit_card', 'paypal', 'klarna', 'apple_pay']),
      CHANNEL: ctx.pick(['web', 'app', 'store', 'phone']),
      DELIVERY_METHOD: ctx.pick(['standard', 'next_day', 'click_collect', 'in_store']),
      STATUS: ctx.pick(['confirmed', 'dispatched', 'delivered', 'delivered', 'delivered']),
      PROMO_CODE: ctx.chance(0.3) ? `SAVE${ctx.pick([10, 15, 20])}` : null,
    }, ctx.timestamp(365));
  });
  const browse = Array.from({ length: ctx.int(20, 60) }, () => {
    const page = ctx.pick(['homepage', 'category', 'product', 'search_results', 'cart', 'checkout']);
    return ctx.event('browse', {
      PAGE_TYPE: page,
      PRODUCT_ID: ['product', 'cart', 'checkout'].includes(page) ? `SKU-${ctx.int(10000, 99999)}` : null,
      PRODUCT_NAME: ['product', 'cart', 'checkout'].includes(page) ? `${category} product` : null,
      CATEGORY: ctx.chance(0.7) ? category : ctx.pick(['fashion', 'beauty', 'home', 'electronics', 'sports']),
      DWELL_TIME_SECONDS: ctx.int(5, 900),
      DEVICE: ctx.pick(['mobile', 'desktop', 'tablet']),
      SEARCH_TERM: page === 'search_results' ? `${category} offers` : null,
      REFERRAL_SOURCE: ctx.pick(['organic', 'paid_search', 'social', 'email', 'direct']),
    });
  });
  const returnCount = Math.min(5, Math.max(0, Math.round(orderCount * Number(profile.RETURNRATE || 0))));
  const returns = order.slice(0, returnCount).map((original) => ctx.event('return', {
    RETURN_ID: `RET-${ctx.int(100000, 999999)}`,
    ORDER_ID: original.ORDER_ID,
    ITEMS: original.ITEMS.slice(0, 1).map((item) => ({ sku: item.sku, name: item.name, qty: 1, reason: 'changed_mind' })),
    REASON: ctx.pick(['wrong_size', 'defective', 'not_as_described', 'changed_mind', 'late_delivery']),
    REFUND_AMOUNT: Math.min(original.ORDER_TOTAL, original.ITEMS[0].price),
    METHOD: ctx.pick(['refund_to_card', 'store_credit', 'exchange']),
    STATUS: ctx.pick(['initiated', 'received', 'processed', 'refunded']),
  }));
  const service = Array.from({ length: ctx.int(1, 8) }, () => ctx.event('service', {
    CASE_ID: `CASE-${ctx.int(100000, 999999)}`,
    CHANNEL: ctx.pick(['live_chat', 'phone', 'email', 'social_media']),
    TOPIC: ctx.pick(['delivery_query', 'return_help', 'product_question', 'complaint', 'account_issue']),
    RESOLUTION: ctx.pick(['resolved_first_contact', 'escalated', 'pending', 'unresolved']),
    CSAT_SCORE: ctx.int(1, 5),
    RESPONSE_TIME_MINUTES: ctx.int(1, 240),
  }));
  const points = Number(profile.REWARDPOINTS || 0);
  const rewards = [ctx.enrichment({
    TIER: points > 15000 ? 'platinum' : points > 7500 ? 'gold' : points > 2500 ? 'silver' : 'bronze',
    POINTS_BALANCE: points,
    POINTS_EARNED_YTD: Math.max(points, ctx.int(500, 30000)),
    POINTS_REDEEMED_YTD: ctx.int(0, 5000),
    TIER_EXPIRY_DATE: ctx.futureDate(60, 365),
    NEXT_TIER_THRESHOLD: points > 15000 ? 0 : points > 7500 ? 15000 : points > 2500 ? 7500 : 2500,
    PREFERRED_REWARD_TYPE: ctx.pick(['voucher', 'free_delivery', 'exclusive_access', 'charity_donation']),
    BIRTHDAY_REWARD_USED: ctx.chance(0.4),
    REFERRAL_COUNT: ctx.int(0, 12),
  })];
  return { order, browse, return: returns, service, rewards };
}

function generateTelecom(profile, ctx) {
  const totalDataMb = Math.max(100, Number(profile.DATAUSAGEGB || 10) * 1024);
  const usageCount = ctx.int(50, 150);
  const dataEvents = Math.max(1, Math.round(usageCount * 0.45));
  const dataPerEvent = totalDataMb / dataEvents;
  let dataSeen = 0;
  const usage = Array.from({ length: usageCount }, (_, index) => {
    const type = index < dataEvents ? 'data_session' : ctx.pick(['voice_call', 'sms', 'mms']);
    const data = type === 'data_session'
      ? (index === dataEvents - 1 ? totalDataMb - dataSeen : dataPerEvent * ctx.number(0.65, 1.2))
      : null;
    if (data != null) dataSeen += data;
    return ctx.event('usage', {
      USAGE_TYPE: type,
      DURATION_SECONDS: type === 'voice_call' ? ctx.int(15, 3600) : null,
      DATA_MB: data == null ? null : Number(Math.max(0.1, data).toFixed(2)),
      DESTINATION: type === 'voice_call' ? `+44${ctx.int(7000000000, 7999999999)}` : null,
      ROAMING: ctx.chance(0.08),
      NETWORK_TYPE: ctx.pick(['4G', '5G', 'WiFi_calling']),
      PEAK_FLAG: ctx.chance(0.35),
    }, ctx.timestamp(30));
  });
  const billing = Array.from({ length: ctx.int(3, 12) }, (_, index) => {
    const periodEnd = new Date(ctx.timestamp(0, index * 30 * DAY_MS));
    const periodStart = new Date(periodEnd.getTime() - 30 * DAY_MS);
    const status = ctx.pick(['paid', 'paid', 'paid', 'pending', 'overdue', 'failed']);
    return ctx.event('billing', {
      INVOICE_ID: `INV-${ctx.int(100000, 999999)}`,
      AMOUNT: ctx.number(Number(profile.MONTHLYSPEND || 35) * 0.96, Number(profile.MONTHLYSPEND || 35) * 1.08),
      CURRENCY: 'GBP',
      PAYMENT_STATUS: status,
      PAYMENT_METHOD: ctx.pick(['direct_debit', 'card', 'bank_transfer']),
      OVERDUE_DAYS: status === 'overdue' ? ctx.int(1, 30) : 0,
      BILL_PERIOD_START: periodStart.toISOString().slice(0, 10),
      BILL_PERIOD_END: periodEnd.toISOString().slice(0, 10),
    }, periodEnd.toISOString());
  });
  const service = Array.from({ length: ctx.int(2, 10) }, () => ctx.event('service', {
    CASE_ID: `CASE-${ctx.int(100000, 999999)}`,
    CHANNEL: ctx.pick(['live_chat', 'phone', 'store', 'ivr', 'social']),
    TOPIC: ctx.pick(['upgrade_enquiry', 'billing_dispute', 'tech_support', 'coverage_complaint', 'cancellation']),
    RESOLUTION: ctx.pick(['resolved', 'escalated', 'pending', 'cancelled']),
    NPS_SCORE: Number(profile.NETWORKNPS || ctx.int(0, 10)),
    AGENT_ID: `AGT-${ctx.int(1000, 9999)}`,
    CALL_DURATION_SECONDS: ctx.int(60, 3600),
  }));
  const network = Array.from({ length: ctx.int(3, 15) }, () => {
    const type = ctx.chance(0.7) ? 'speed_test' : ctx.pick(['outage', 'degradation', 'resolved']);
    return ctx.event('network', {
      EVENT_TYPE: type,
      CELL_ID: `CELL-${ctx.int(10000, 99999)}`,
      DURATION_MINUTES: type === 'speed_test' ? 0 : ctx.int(5, 240),
      IMPACT_AREA: ctx.pick(['voice', 'data', 'sms', 'all']),
      DOWNLOAD_SPEED_MBPS: ctx.number(5, 950),
      UPLOAD_SPEED_MBPS: ctx.number(1, 120),
    });
  });
  const deviceCount = ctx.int(1, 4);
  const devices = Array.from({ length: deviceCount }, (_, index) => ctx.enrichment({
    DEVICE_MODEL: index === 0 ? profile.DEVICEMODEL : ctx.pick(['iPhone 15 Pro', 'Samsung Galaxy S24', 'Google Pixel 8']),
    IMEI: String(ctx.int(100000000, 999999999)) + String(ctx.int(100000, 999999)),
    ACTIVATION_DATE: ctx.date(1500),
    TRADE_IN_VALUE: index === 0 ? null : ctx.number(40, 450),
    INSURANCE: ctx.chance(0.55),
    INSURANCE_TIER: ctx.chance(0.55) ? ctx.pick(['basic', 'premium']) : null,
    UPGRADE_ELIGIBLE_DATE: ctx.futureDate(30, 730),
    PREVIOUS_DEVICE: index === 0 && deviceCount > 1 ? 'Previous handset' : null,
    CONTRACT_MONTHS: ctx.pick([12, 24, 36]),
    STATUS: index === 0 ? 'active' : ctx.pick(['traded_in', 'retired']),
  }));
  return { usage, billing, service, network, devices };
}

function content(ctx, genre) {
  return {
    CONTENT_ID: `CNT-${ctx.int(100000, 999999)}`,
    TITLE: `${ctx.pick(['The', 'Beyond', 'Inside', 'Last', 'Secret'])} ${ctx.pick(['Signal', 'Kingdom', 'Journey', 'Match', 'Story'])}`,
    GENRE: genre,
  };
}

function generateMedia(profile, ctx) {
  const genre = profile.PRIMARYGENRE || 'drama';
  const viewing = Array.from({ length: ctx.int(20, 80) }, () => {
    const item = content(ctx, ctx.chance(0.7) ? genre : ctx.pick(['drama', 'comedy', 'thriller', 'documentary', 'sci_fi', 'sport']));
    const total = ctx.int(20, 150);
    const watched = ctx.int(2, total);
    const type = ctx.pick(['movie', 'series_episode', 'documentary', 'live_sport', 'short']);
    return ctx.event('viewing', {
      ...item,
      CONTENT_TYPE: type,
      SEASON: type === 'series_episode' ? ctx.int(1, 8) : null,
      EPISODE: type === 'series_episode' ? ctx.int(1, 20) : null,
      DURATION_WATCHED_MINUTES: watched,
      TOTAL_DURATION_MINUTES: total,
      COMPLETION_PCT: Number(((watched / total) * 100).toFixed(2)),
      DEVICE: ctx.pick(['smart_tv', 'mobile', 'tablet', 'laptop', 'console']),
      STREAM_QUALITY: ctx.pick(['4K', 'HD', 'SD', 'auto']),
      PROFILE_NAME: ctx.pick(['main', 'kids', 'partner']),
    }, ctx.timestamp(30));
  });
  const engagement = Array.from({ length: ctx.int(5, 20) }, () => {
    const action = ctx.pick(['add_to_list', 'remove_from_list', 'rate', 'review', 'share', 'like', 'skip_intro', 'report']);
    const item = content(ctx, genre);
    return ctx.event('engagement', {
      ACTION: action,
      CONTENT_ID: item.CONTENT_ID,
      TITLE: item.TITLE,
      RATING: action === 'rate' ? ctx.number(1, 5, 1) : null,
      SHARE_PLATFORM: action === 'share' ? ctx.pick(['twitter', 'whatsapp', 'imessage']) : null,
    });
  });
  const billing = Array.from({ length: ctx.int(3, 12) }, () => ctx.event('billing', {
    EVENT_TYPE: ctx.pick(['charge', 'charge', 'charge', 'refund', 'upgrade', 'downgrade']),
    PLAN: profile.SUBSCRIPTIONTIER || 'standard',
    AMOUNT: Number(profile.MONTHLYFEE || 10.99),
    CURRENCY: 'GBP',
    PAYMENT_METHOD: ctx.pick(['credit_card', 'paypal', 'direct_debit', 'apple_pay']),
    PAYMENT_STATUS: ctx.pick(['success', 'success', 'success', 'failed', 'retrying']),
    ADDONS: [ctx.pick(['sports_pack', 'kids_pack', 'no_ads'])],
  }, ctx.timestamp(365)));
  const downloadCount = Math.max(2, Math.min(15, Number(profile.DOWNLOADSPERMONTH || 4)));
  const download = Array.from({ length: downloadCount }, () => {
    const item = content(ctx, genre);
    return ctx.event('download', {
      CONTENT_ID: item.CONTENT_ID,
      TITLE: item.TITLE,
      CONTENT_TYPE: ctx.pick(['movie', 'episode', 'podcast']),
      FILE_SIZE_MB: ctx.number(80, 4500),
      DEVICE: ctx.pick(['mobile', 'tablet']),
      EXPIRY_DATE: ctx.futureDate(2, 30),
      STATUS: ctx.pick(['downloaded', 'expired', 'deleted']),
    }, ctx.timestamp(30));
  });
  const watchlist = Array.from({ length: ctx.int(5, 20) }, (_, index) => {
    const item = content(ctx, ctx.chance(0.7) ? genre : ctx.pick(['drama', 'comedy', 'documentary']));
    return ctx.enrichment({
      ...item,
      CONTENT_TYPE: ctx.pick(['movie', 'series', 'documentary']),
      ADDED_DATE: ctx.date(365),
      PRIORITY: index + 1,
      ESTIMATED_DURATION_MINUTES: ctx.int(20, 180),
      STATUS: ctx.pick(['queued', 'watching', 'completed']),
    });
  });
  return { viewing, engagement, billing, download, watchlist };
}

function generateSports(profile, ctx) {
  const sport = profile.FAVOURITESPORT || 'football';
  const team = profile.FAVOURITETEAM || 'Home Team';
  const attendance = Array.from({ length: ctx.int(2, 12) }, () => {
    const stamp = ctx.timestamp(365);
    return ctx.event('attendance', {
      EVENT_ID: `MATCH-${ctx.int(10000, 99999)}`,
      EVENT_NAME: `${team} vs ${ctx.pick(['United', 'City', 'Rovers', 'Athletic'])}`,
      SPORT: sport,
      VENUE: ctx.pick(['Old Trafford', 'Twickenham', 'Lords', 'Wembley', 'Silverstone']),
      SECTION: profile.STADIUMSECTION || 'General Admission',
      TICKET_TYPE: ctx.pick(['standard', 'premium', 'hospitality', 'family']),
      TICKET_PRICE: ctx.number(25, 350),
      COMPANIONS: ctx.int(0, 5),
      GATE_SCAN_TIME: stamp,
    }, stamp);
  });
  const merchandiseCount = ctx.int(2, 8);
  const targetSpend = Number(profile.MERCHSPENDYTD || 200);
  const merchandise = Array.from({ length: merchandiseCount }, (_, index) => {
    const total = index === merchandiseCount - 1
      ? Math.max(5, targetSpend - (targetSpend / merchandiseCount) * index)
      : targetSpend / merchandiseCount;
    const item = {
      name: ctx.pick(['home jersey', 'scarf', 'match programme', 'training top', 'cap']),
      category: 'club_merchandise',
      size: profile.JERSEYSIZEPREFERENCE || 'M',
      qty: 1,
      price: Number(total.toFixed(2)),
    };
    return ctx.event('merchandise', {
      ORDER_ID: `MERCH-${ctx.int(100000, 999999)}`,
      ITEMS: [item],
      ITEM_COUNT: 1,
      ORDER_TOTAL: item.price,
      CURRENCY: 'GBP',
      CHANNEL: ctx.pick(['stadium_shop', 'online_store', 'pop_up', 'third_party']),
      PAYMENT_METHOD: ctx.pick(['credit_card', 'debit_card', 'apple_pay']),
      PERSONALISATION: ctx.chance(0.35),
    }, ctx.timestamp(365));
  });
  const engagement = Array.from({ length: ctx.int(5, 30) }, () => ctx.event('engagement', {
    ACTION: ctx.pick(['vote_motm', 'predict_score', 'fantasy_transfer', 'social_share', 'poll', 'quiz', 'live_react']),
    CONTEXT: `MATCH-${ctx.int(10000, 99999)}`,
    PLATFORM: ctx.pick(['club_app', 'website', 'social_media', 'fantasy_app']),
    POINTS_EARNED: ctx.int(0, 500),
    RESULT: ctx.pick(['correct', 'incorrect', null]),
  }));
  const betting = profile.BETSREGULARLY
    ? Array.from({ length: ctx.int(1, 20) }, () => {
      const outcome = ctx.pick(['won', 'lost', 'void', 'pending']);
      const stake = ctx.number(2, 100);
      const odds = ctx.number(1.2, 12);
      return ctx.event('betting', {
        EVENT_ID: `MATCH-${ctx.int(10000, 99999)}`,
        EVENT_NAME: `${team} Match`,
        BET_TYPE: ctx.pick(['match_result', 'first_scorer', 'over_under', 'accumulator', 'in_play']),
        STAKE: stake,
        ODDS: odds,
        OUTCOME: outcome,
        PAYOUT: outcome === 'won' ? Number((stake * odds).toFixed(2)) : 0,
        BOOKMAKER: ctx.pick(['Bet365', 'Sky Bet', 'William Hill', 'Paddy Power']),
      });
    })
    : [];
  const membership = [ctx.enrichment({
    MEMBERSHIP_TYPE: profile.MEMBERSHIPTYPE || 'standard',
    MEMBER_SINCE: ctx.date(3650),
    RENEWAL_DATE: ctx.futureDate(30, 365),
    AUTO_RENEW: ctx.chance(0.75),
    ANNUAL_FEE: ctx.number(20, 500),
    BENEFITS_USED: ['priority_tickets', 'club_shop_discount'],
    LOYALTY_POINTS: ctx.int(0, 25000),
    REFERRALS_MADE: ctx.int(0, 12),
    STATUS: ctx.pick(['active', 'active', 'active', 'lapsed']),
  })];
  return { attendance, merchandise, engagement, betting, membership };
}

const GENERATORS = { fsi: generateFsi, retail: generateRetail, telecom: generateTelecom, media: generateMedia, sports: generateSports };

function normalizeProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile || {}).map(([key, value]) => [String(key).toUpperCase(), value]),
  );
}

function generateIndustryEventRows(industry, profileInput, options = {}) {
  const key = String(industry || '').trim().toLowerCase();
  if (!getIndustryEventConfig(key) || !GENERATORS[key]) {
    throw new Error(`Unsupported event enrichment industry "${industry}"`);
  }
  const profile = normalizeProfile(profileInput);
  if (!profile.EMAIL || !profile.ECID || !profile.CRMID) {
    throw new Error('Profile EMAIL, ECID, and CRMID are required for enrichment');
  }
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const generationId = String(
    options.generationId ||
      createHash('sha256').update(`${key}:${profile.ECID}:industry-events-v1`).digest('hex').slice(0, 32),
  );
  const generated = GENERATORS[key](profile, context(key, profile, generationId, now));
  const requested = Array.isArray(options.eventTypes) && options.eventTypes.length
    ? options.eventTypes.map((value) => String(value).trim().toLowerCase())
    : listIndustryEventTypes(key);
  const rowsByType = {};
  for (const type of requested) {
    if (!Object.hasOwn(generated, type)) throw new Error(`Unsupported ${key} event type "${type}"`);
    rowsByType[type] = generated[type];
  }
  return { industry: key, generationId, rowsByType };
}

module.exports = {
  generateIndustryEventRows,
  seededRandom,
};
