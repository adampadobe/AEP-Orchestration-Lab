'use strict';

const { createHash } = require('crypto');
const {
  getIndustryEventConfig,
  listIndustryEventTypes,
} = require('./snowflakeIndustryEventRegistry');
const { getRecipientId } = require('./snowflakeRecipientFactory');

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
  return { now, random, int, number, pick, chance, timestamp, date, futureDate, event, enrichment };
}

function generateFsi(profile, ctx) {
  const recipientId = profile.RECIPIENT_ID || getRecipientId('fsi', profile.CRMID, profile.ECID);
  const money = (value) => Number(Number(value).toFixed(2));
  const overdraftLimit = 500;
  const monthlySalary = Number((Number(profile.HOUSEHOLDINCOME || 60000) / 12).toFixed(2));
  const monthlyCreditSpend = Math.max(0, Number(profile.MONTHLYCREDITSPEND || 0));
  const creditLimit = Math.max(1000, Number(profile.CREDITCARDLIMIT || monthlyCreditSpend * 3));
  const accountProducts = [
    {
      type: 'current_account',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: money(Math.max(0, Number(profile.CHECKINGBALANCE || 0))),
      interestRate: ctx.number(0, 0.005, 4),
      overdraftLimit,
    },
    {
      type: 'savings_account',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: money(Math.max(0, Number(profile.SAVINGSBALANCE || 0))),
      interestRate: ctx.number(0.01, 0.05, 4),
      overdraftLimit: 0,
    },
    {
      type: 'mortgage',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: null,
      balance: Math.max(0, Number(profile.MORTGAGEBALANCE || 0)),
      interestRate: ctx.number(0.025, 0.065, 4),
    },
    {
      type: 'credit_card',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: money(Math.min(monthlyCreditSpend * 0.25, creditLimit * 0.25)),
      balance: 0,
      interestRate: ctx.number(0.18, 0.30, 4),
      creditLimit,
    },
    {
      type: 'personal_loan',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: null,
      balance: ctx.number(1000, Math.max(5000, Number(profile.HOUSEHOLDINCOME || 60000) * 0.25)),
      interestRate: ctx.number(0.059, 0.149, 4),
      termMonths: ctx.pick([12, 24, 36, 48, 60]),
    },
    {
      type: 'isa',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: null,
      balance: Math.max(0, Number(profile.INVESTMENTVALUE || 0)),
      interestRate: ctx.number(0.01, 0.052, 4),
    },
    {
      type: 'pension',
      accountNumber: `GB-${ctx.int(10000000, 99999999)}`,
      openingBalance: null,
      balance: Math.max(0, Number(profile.INVESTMENTVALUE || 0) * 0.75),
      interestRate: ctx.number(0.01, 0.052, 4),
    },
  ];
  const accountCount = Math.max(2, Math.min(7, Number(profile.TOTALACCOUNTS || 3)));
  const products = accountProducts.slice(0, accountCount);
  const byType = new Map(products.map((product) => [product.type, product]));
  const accountId = (product) => `${recipientId}-ACC-${product.accountNumber}`;
  const cardId = (product) => `${recipientId}-CARD-${product.accountNumber}`;
  const current = byType.get('current_account');
  const savings = byType.get('savings_account');
  const card = byType.get('credit_card');
  const balances = new Map();
  if (current) balances.set(accountId(current), current.openingBalance);
  if (savings) balances.set(accountId(savings), savings.openingBalance);
  if (card) balances.set(cardId(card), card.openingBalance);

  const transaction = [];
  const addTransaction = ({
    type, direction, amount, product, cardTransaction = false, merchant, category, reference, monthAgo, day,
  }) => {
    const roundedAmount = Number(amount.toFixed(2));
    const id = cardTransaction ? cardId(product) : accountId(product);
    const balance = balances.get(id);
    const nextBalance = Number((balance + (direction === 'credit' ? roundedAmount : -roundedAmount)).toFixed(2));
    if (cardTransaction && nextBalance > product.creditLimit + 0.01) {
      throw new Error('Generated credit-card balance exceeds its credit limit.');
    }
    if (!cardTransaction && product.type === 'current_account' && nextBalance < -product.overdraftLimit - 0.01) {
      throw new Error('Generated current-account balance exceeds its overdraft limit.');
    }
    if (!cardTransaction && product.type === 'savings_account' && nextBalance < -0.01) {
      throw new Error('Generated savings-account balance is negative.');
    }
    balances.set(id, nextBalance);
    transaction.push(ctx.event('transaction', {
      TRANSACTION_TYPE: type,
      DIRECTION: direction,
      AMOUNT: roundedAmount,
      CURRENCY: 'GBP',
      MERCHANT: merchant,
      CATEGORY: category,
      BALANCE_AFTER: nextBalance,
      ACCOUNT_TYPE: product.type,
      ACCOUNT_ID: cardTransaction ? null : id,
      CARD_ID: cardTransaction ? id : null,
      REFERENCE: reference,
    }, new Date(ctx.now.getTime() - (monthAgo * 30 + (30 - day)) * DAY_MS).toISOString()));
    return nextBalance;
  };

  for (let monthAgo = 5; monthAgo >= 0; monthAgo -= 1) {
    if (current) {
      addTransaction({
        type: 'salary', direction: 'credit', amount: monthlySalary, product: current,
        merchant: 'Employer Payroll', category: 'income', reference: `SAL-${monthAgo}`,
        monthAgo, day: 1,
      });
    }
    if (current && savings) {
      const available = Math.max(0, balances.get(accountId(current)) + current.overdraftLimit);
      const transfer = Math.min(Number((monthlySalary * ctx.number(0.05, 0.12)).toFixed(2)), available);
      if (transfer >= 1) {
        const reference = `TRF-${monthAgo}`;
        addTransaction({
          type: 'transfer', direction: 'debit', amount: transfer, product: current,
          merchant: 'Monthly savings transfer', category: 'transfer', reference, monthAgo, day: 2,
        });
        addTransaction({
          type: 'transfer', direction: 'credit', amount: transfer, product: savings,
          merchant: 'Current account transfer', category: 'transfer', reference, monthAgo, day: 2,
        });
      }
    }
    if (current) {
      for (let index = 0; index < 3; index += 1) {
        const available = Math.max(0, balances.get(accountId(current)) + current.overdraftLimit);
        if (available < 2) break;
        const amount = ctx.number(2, Math.min(1200, available));
        addTransaction({
          type: ctx.pick(['direct_debit', 'standing_order', 'ATM_withdrawal']),
          direction: 'debit', amount, product: current,
          merchant: ctx.pick(['Tesco', 'Netflix', 'British Gas', 'TfL', 'Pret A Manger']),
          category: ctx.pick(['groceries', 'entertainment', 'utilities', 'transport', 'dining']),
          reference: `CUR-${monthAgo}-${index}`, monthAgo, day: 3 + index,
        });
      }
    }
    if (card) {
      for (let index = 0; index < 2; index += 1) {
        const available = Math.max(0, card.creditLimit - balances.get(cardId(card)));
        if (available < 2) break;
        const amount = ctx.number(2, Math.min(monthlyCreditSpend || 450, available, 450));
        addTransaction({
          type: 'card_purchase', direction: 'credit', amount, product: card, cardTransaction: true,
          merchant: ctx.pick(['Tesco', 'Netflix', 'British Gas', 'TfL', 'Pret A Manger']),
          category: ctx.pick(['groceries', 'entertainment', 'utilities', 'transport', 'dining']),
          reference: `CARD-${monthAgo}-${index}`, monthAgo, day: 7 + index,
        });
      }
      const owed = balances.get(cardId(card));
      const available = Math.max(0, balances.get(accountId(current)) + current.overdraftLimit);
      const payment = Math.min(owed, available, Math.max(50, monthlyCreditSpend * 0.7));
      if (current && payment >= 1) {
        const reference = `PAY-${monthAgo}`;
        addTransaction({
          type: 'card_payment', direction: 'debit', amount: payment, product: current,
          merchant: 'Credit card payment', category: 'card_payment', reference, monthAgo, day: 10,
        });
        addTransaction({
          type: 'card_payment', direction: 'debit', amount: payment, product: card, cardTransaction: true,
          merchant: 'Current account payment', category: 'card_payment', reference, monthAgo, day: 10,
        });
      }
    }
    if (savings && balances.get(accountId(savings)) > 0) {
      const interest = Number((balances.get(accountId(savings)) * savings.interestRate / 12).toFixed(2));
      if (interest > 0) {
        addTransaction({
          type: 'interest', direction: 'credit', amount: interest, product: savings,
          merchant: 'Savings interest', category: 'interest', reference: `INT-${monthAgo}`,
          monthAgo, day: 20,
        });
      }
    }
  }

  for (const product of products) {
    if (['current_account', 'savings_account'].includes(product.type)) {
      product.balance = balances.get(accountId(product));
    } else if (product.type === 'credit_card') {
      product.balance = balances.get(cardId(product));
    }
  }

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

  const productRows = products.map((product) => {
    const loanMonths = product.termMonths || null;
    const monthlyRate = product.interestRate / 12;
    return ctx.enrichment({
      PRODUCT_TYPE: product.type,
      ACCOUNT_NUMBER: product.accountNumber,
      OPEN_DATE: ctx.date(3650),
      OPENING_BALANCE: product.openingBalance,
      BALANCE: Number(product.balance.toFixed(2)),
      OVERDRAFT_LIMIT: product.overdraftLimit ?? null,
      CREDIT_LIMIT: product.creditLimit ?? null,
      INTEREST_RATE: product.interestRate,
      TERM_END_DATE: loanMonths ? ctx.futureDate(loanMonths * 30, loanMonths * 30)
        : product.type === 'mortgage' ? ctx.futureDate(180, 3650) : null,
      MONTHLY_PAYMENT: loanMonths
        ? Number((product.balance * monthlyRate / (1 - (1 + monthlyRate) ** -loanMonths)).toFixed(2))
        : product.type === 'mortgage' ? ctx.number(500, 3500) : null,
      STATUS: 'active',
    });
  });
  return { digital, transaction, application, advisory, products: productRows };
}

function retailItem(ctx, category) {
  const price = ctx.number(8, 250);
  const name = `${category} ${ctx.pick(['Essential', 'Classic', 'Premium', 'Edition'])}`;
  return {
    sku: `SKU-${createHash('sha256').update(JSON.stringify([category, name])).digest('hex').slice(0, 32)}`,
    name,
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
    const row = ctx.event('order', {
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
    row.ORDER_ID = row.EVENTID;
    return row;
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
  const minimumReturnAgeMs = 2 * 60 * 60 * 1000;
  const returns = order.filter((original) =>
    original.STATUS === 'delivered'
      && ctx.now.getTime() - Date.parse(original.TIMESTAMP) >= minimumReturnAgeMs)
    .slice(0, returnCount).map((original) => {
      const reason = ctx.pick(['wrong_size', 'defective', 'not_as_described', 'changed_mind', 'late_delivery']);
      const orderTime = Date.parse(original.TIMESTAMP);
      const offset = ctx.int(minimumReturnAgeMs, Math.min(60 * DAY_MS, ctx.now.getTime() - orderTime));
      return ctx.event('return', {
        RETURN_ID: `RET-${ctx.int(100000, 999999)}`,
        ORDER_ID: original.ORDER_ID,
        ITEMS: original.ITEMS.slice(0, 1).map((item) => ({ sku: item.sku, name: item.name, qty: 1, reason })),
        REASON: reason,
        REFUND_AMOUNT: Math.min(original.ORDER_TOTAL, original.ITEMS[0].price),
        METHOD: ctx.pick(['refund_to_card', 'store_credit', 'exchange']),
        STATUS: ctx.pick(['initiated', 'received', 'processed', 'refunded']),
      }, new Date(orderTime + offset).toISOString());
    });
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
  const title = `${ctx.pick(['The', 'Beyond', 'Inside', 'Last', 'Secret'])} ${ctx.pick(['Signal', 'Kingdom', 'Journey', 'Match', 'Story'])}`;
  const type = ctx.pick(['movie', 'series_episode', 'documentary', 'live_sport', 'short']);
  return {
    CONTENT_ID: `CNT-${createHash('sha256').update(JSON.stringify([title, genre, type])).digest('hex').slice(0, 32)}`,
    TITLE: title,
    GENRE: genre,
    CONTENT_TYPE: type,
  };
}

function generateMedia(profile, ctx) {
  const genre = profile.PRIMARYGENRE || 'drama';
  const catalog = Array.from({ length: ctx.int(8, 15) }, () =>
    content(ctx, ctx.chance(0.7) ? genre : ctx.pick(['drama', 'comedy', 'thriller', 'documentary', 'sci_fi', 'sport'])));
  const viewing = Array.from({ length: ctx.int(20, 80) }, (_, index) => {
    const item = index < catalog.length ? catalog[index] : ctx.pick(catalog);
    const total = ctx.int(20, 150);
    const watched = ctx.int(2, total);
    const type = item.CONTENT_TYPE;
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
    const item = ctx.pick(catalog);
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
    const item = ctx.pick(catalog);
    const status = ctx.pick(['downloaded', 'expired', 'deleted']);
    const downloadedAt = ctx.timestamp(30);
    return ctx.event('download', {
      CONTENT_ID: item.CONTENT_ID,
      TITLE: item.TITLE,
      CONTENT_TYPE: item.CONTENT_TYPE,
      FILE_SIZE_MB: ctx.number(80, 4500),
      DEVICE: ctx.pick(['mobile', 'tablet']),
      EXPIRY_DATE: status === 'expired'
        ? new Date(ctx.int(Date.parse(downloadedAt), ctx.now.getTime())).toISOString().slice(0, 10)
        : ctx.futureDate(2, 30),
      STATUS: status,
    }, downloadedAt);
  });
  const watchlist = Array.from({ length: ctx.int(5, 20) }, (_, index) => {
    const item = ctx.pick(catalog);
    return ctx.enrichment({
      ...item,
      CONTENT_TYPE: item.CONTENT_TYPE,
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
    item.sku = `SKU-${createHash('sha256').update(JSON.stringify([team, item.name, item.size])).digest('hex').slice(0, 32)}`;
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

function linkGeneratedRows(industry, generated) {
  const key = (prefix, identity) => `${prefix}-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
  if (industry === 'retail') {
    const orders = new Map();
    for (const row of generated.order) {
      const id = key('ORD', row.EVENTID);
      orders.set(row.ORDER_ID, id);
      row.ORDER_ID = id;
    }
    for (const row of generated.return) {
      const orderId = orders.get(row.ORDER_ID);
      if (!orderId) throw new Error('Generated retail return has no matching generated order.');
      row.ORDER_ID = orderId;
      row.RETURN_ID = key('RET', row.EVENTID);
    }
  }
  if (industry === 'sports') {
    generated.attendance.forEach((row) => { row.EVENT_ID = key('MATCH', row.EVENTID); });
    generated.merchandise.forEach((row) => { row.ORDER_ID = key('MERCH', row.EVENTID); });
    generated.betting.forEach((row, index) => {
      const fixture = generated.attendance[index % generated.attendance.length];
      if (!fixture) throw new Error('Generated sports bet has no matching generated fixture.');
      row.EVENT_ID = fixture.EVENT_ID;
      row.EVENT_NAME = fixture.EVENT_NAME;
    });
  }
}

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
  linkGeneratedRows(key, generated);
  const requested = Array.isArray(options.eventTypes) && options.eventTypes.length
    ? options.eventTypes.map((value) => String(value).trim().toLowerCase())
    : listIndustryEventTypes(key);
  const rowsByType = {};
  for (const type of requested) {
    if (!Object.hasOwn(generated, type)) throw new Error(`Unsupported ${key} event type "${type}"`);
    rowsByType[type] = getIndustryEventConfig(key)[type].kind === 'enrichment'
      ? generated[type].map((row, index) => ({ ...row, GENERATIONID: `${generationId}-${index}` }))
      : generated[type];
  }
  return { industry: key, generationId, rowsByType };
}

module.exports = {
  generateIndustryEventRows,
  seededRandom,
};
