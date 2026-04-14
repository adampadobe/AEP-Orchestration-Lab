/**
 * Decision items catalog — ported from
 * https://github.com/alexmtmr/experience-decisioning-playground/blob/main/src/data/offers.js
 *
 * Retail array matches the playground exactly (ids 1–10, channels, copy).
 * Other verticals follow the same shape for the Items step UI.
 */
(function () {
  var R = [
    { id: 1, name: 'Free Express Delivery', desc: 'For VIP members on orders over €50', type: 'Loyalty', priority: 100, margin: 'High', category: 'All', color: '#D94B3F', ico: '🚚', img: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=240&fit=crop', channels: ['web', 'app', 'code'] },
    { id: 2, name: '3× Loyalty Points Weekend', desc: 'Earn triple points on every purchase', type: 'Loyalty', priority: 85, margin: 'Medium', category: 'All', color: '#E68619', ico: '🏅', img: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=400&h=240&fit=crop', channels: ['web', 'app', 'email', 'sms'] },
    { id: 3, name: '0% BNPL on Electronics', desc: '12-month interest-free financing', type: 'BNPL', priority: 55, margin: 'Low', category: 'Electronics', color: '#2680EB', ico: '💳', img: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=240&fit=crop', channels: ['web'] },
    { id: 4, name: '20% Off Running Shoes', desc: 'Summer collection — limited time', type: 'Discount', priority: 70, margin: 'Medium', category: 'Footwear', color: '#2D9D78', ico: '👟', img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=240&fit=crop', channels: ['email', 'web', 'app', 'push', 'code'] },
    { id: 5, name: 'Back-to-School Bundle', desc: 'Stationery + backpack combo deal', type: 'Bundle', priority: 40, margin: 'Low', category: 'Stationery', color: '#7C5CFC', ico: '🎁', img: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=240&fit=crop', channels: ['web', 'email', 'sms'] },
    { id: 6, name: 'Premium Headphones €30 Off', desc: 'Noise-cancelling, top rated', type: 'Discount', priority: 65, margin: 'High', category: 'Electronics', color: '#0D918C', ico: '🎧', img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=240&fit=crop', channels: ['web', 'app', 'code'] },
    { id: 7, name: 'New Collection Preview', desc: 'Early access for loyalty members', type: 'Exclusive', priority: 50, margin: 'Medium', category: 'Fashion', color: '#C45BAA', ico: '👕', img: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&h=240&fit=crop', channels: ['app', 'push'] },
    { id: 8, name: 'Smart Watch Trade-In', desc: '€100 off when you trade your old device', type: 'Trade-In', priority: 45, margin: 'High', category: 'Electronics', color: '#5B7FFF', ico: '⌚', img: 'https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=400&h=240&fit=crop', channels: ['web', 'app', 'code'] },
    { id: 9, name: 'Home — Free Assembly', desc: 'Free furniture assembly over €200', type: 'Service', priority: 35, margin: 'Low', category: 'Home', color: '#8B6914', ico: '🛋', img: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=240&fit=crop', channels: ['web', 'email', 'sms'] },
    { id: 10, name: 'Grocery Flash Sale — 15% Off', desc: 'Fresh produce & pantry essentials today only', type: 'Discount', priority: 75, margin: 'Medium', category: 'Grocery', color: '#D4793A', ico: '🍴', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=240&fit=crop', channels: ['email', 'app', 'push', 'sms'] },
  ];

  function o(id, name, desc, type, priority, margin, category, color, ico, img, channels) {
    return { id: id, name: name, desc: desc, type: type, priority: priority, margin: margin, category: category, color: color, ico: ico, img: img, channels: channels };
  }

  window.DCE_PLAYGROUND_ITEMS_BRAND = {
    media: 'StreamMax',
    travel: 'Global Air',
    retail: 'Your Store',
    fsi: 'SecureBank',
    telco: 'ConnectOne',
    automotive: 'Apex Motors',
    healthcare: 'CareUnited',
  };

  window.DCE_PLAYGROUND_ITEMS_BY_INDUSTRY = {
    retail: R,
    media: [
      o(1, 'Annual plan — 2 months free', 'Lock in premium for a year — offline downloads included', 'Subscription', 100, 'High', 'Plans', '#CC0000', '🎬', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&h=240&fit=crop', ['web', 'app', 'email', 'code']),
      o(2, 'Sports live pass add-on', 'League matches + replays for the season', 'Add-on', 85, 'Medium', 'Sports', '#E68619', '⚽', 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=240&fit=crop', ['web', 'app', 'push']),
      o(3, 'Kids & family annual', 'Parental controls + kids profiles', 'Family', 55, 'Low', 'Family', '#7C5CFC', '👨‍👩‍👧', 'https://images.unsplash.com/photo-1519340242416-1e0e29c8b7f5?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(4, '30-day trial — card on file', 'Try premium before you commit', 'Trial', 70, 'Medium', 'Acquisition', '#2D9D78', '🎁', 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400&h=240&fit=crop', ['email', 'web', 'app', 'push', 'sms', 'code']),
      o(5, '4K UHD tier upgrade', 'HDR library + device boost', 'Upgrade', 65, 'High', 'Quality', '#2680EB', '📺', 'https://images.unsplash.com/photo-1598899134739-24d246d0a58d?w=400&h=240&fit=crop', ['web', 'app', 'code']),
      o(6, 'Documentary hub monthly', 'Curated factual — cancel anytime', 'Plan', 40, 'Low', 'Factual', '#0D918C', '📚', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=240&fit=crop', ['web', 'email', 'sms']),
      o(7, 'Student plan discount', 'Verify status — reduced rate', 'Discount', 50, 'Medium', 'Students', '#C45BAA', '🎓', 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=400&h=240&fit=crop', ['web', 'app']),
      o(8, 'CTV big-screen bundle', 'Smart TV app + soundbar partner offer', 'Bundle', 45, 'Medium', 'Devices', '#5B7FFF', '🖥', 'https://images.unsplash.com/photo-1593784991091-a21702167cd2?w=400&h=240&fit=crop', ['web', 'app', 'code']),
      o(9, 'Win-back — 50% off 3 mo', 'We miss you — come back offer', 'Retention', 75, 'High', 'Win-back', '#D4793A', '💌', 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&h=240&fit=crop', ['email', 'push', 'sms']),
      o(10, 'Streaming + music bundle', 'Audio + video in one subscription', 'Bundle', 60, 'Medium', 'Partners', '#8B6914', '🎵', 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=240&fit=crop', ['web', 'app', 'email']),
    ],
    travel: [
      o(1, 'Extra legroom — long-haul bundle', 'Comfort pack + priority boarding', 'Ancillary', 100, 'High', 'Long-haul', '#005f9e', '✈️', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=240&fit=crop', ['web', 'app', 'email', 'push', 'code']),
      o(2, 'Checked bags — 2×23kg', 'Pre-pay and save at the airport', 'Ancillary', 85, 'Medium', 'Bags', '#E68619', '🧳', 'https://images.unsplash.com/photo-1569629743817-70f0eb2ab2a8?w=400&h=240&fit=crop', ['web', 'app', 'sms']),
      o(3, 'Priority boarding — Group 1', 'Beat the queue on busy routes', 'Ancillary', 70, 'Medium', 'Airport', '#2D9D78', '⭐', 'https://images.unsplash.com/photo-1439025981490-27cfc96d22f4?w=400&h=240&fit=crop', ['app', 'push', 'web']),
      o(4, 'Lounge pass — same day', 'Relax before departure', 'Upsell', 55, 'High', 'Airport', '#7C5CFC', '🛋', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=240&fit=crop', ['web', 'app']),
      o(5, 'Seat selection — twin aisle', 'Pick seats together', 'Ancillary', 50, 'Low', 'Seats', '#2680EB', '💺', 'https://images.unsplash.com/photo-1488085061324-297f429d6b27?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(6, 'Carbon offset add-on', 'Fly greener — matched contribution', 'Sustainability', 40, 'Low', 'ESG', '#0D918C', '🌱', 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=240&fit=crop', ['web', 'email']),
      o(7, 'Travel insurance — trip protect', 'Medical + cancellation cover', 'Bundle', 65, 'Medium', 'Insurance', '#C45BAA', '🛡', 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=240&fit=crop', ['web', 'app', 'code']),
      o(8, 'Inflight Wi‑Fi — full flight', 'Stream at 35,000 ft where available', 'Ancillary', 45, 'High', 'Onboard', '#5B7FFF', '📶', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=240&fit=crop', ['app', 'push']),
      o(9, 'Family row + meals', 'Pre-order kids meals', 'Bundle', 35, 'Low', 'Family', '#8B6914', '👪', 'https://images.unsplash.com/photo-1506012787146-f92b7d78bdfc?w=400&h=240&fit=crop', ['web', 'email', 'sms']),
      o(10, 'Upgrade bid — cabin move', 'Name your price for business', 'Upsell', 75, 'Medium', 'Upgrade', '#D4793A', '📈', 'https://images.unsplash.com/photo-1504150558240-0b7fe89e41bb?w=400&h=240&fit=crop', ['email', 'app', 'push', 'sms']),
    ],
    fsi: [
      o(1, 'Fixed-rate mortgage — 4.19% 5yr', 'Fee-free legals for qualifying LTV', 'Lending', 100, 'High', 'Mortgages', '#2680EB', '🏦', 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400&h=240&fit=crop', ['web', 'app', 'email', 'code']),
      o(2, 'Balance-transfer card — 0% 24 mo', 'Consolidate and save', 'Cards', 85, 'Medium', 'Credit', '#E68619', '💳', 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=400&h=240&fit=crop', ['web', 'app', 'sms']),
      o(3, 'Stocks & Shares ISA — bonus', 'Transfer-in reward when eligible', 'Wealth', 70, 'Medium', 'ISA', '#2D9D78', '📈', 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=240&fit=crop', ['web', 'email', 'app']),
      o(4, 'Premium cashback — metal card', 'Higher earn on travel and dining', 'Cards', 65, 'High', 'Rewards', '#7C5CFC', '💎', 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=240&fit=crop', ['app', 'push', 'web']),
      o(5, 'Green loan — home retrofit', 'Finance insulation & heat pumps', 'Lending', 50, 'Low', 'ESG', '#0D918C', '🌿', 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=240&fit=crop', ['web', 'email']),
      o(6, 'Junior ISA — £1 open', 'Start early for dependents', 'Savings', 45, 'Low', 'Family', '#C45BAA', '👶', 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=240&fit=crop', ['web', 'app']),
      o(7, 'FX travel wallet — no fee weekends', 'Spend abroad with mid-market rates', 'Payments', 60, 'Medium', 'Travel', '#5B7FFF', '💱', 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=240&fit=crop', ['app', 'push', 'sms']),
      o(8, 'Business account — £0 fees 12 mo', 'SMB onboarding offer', 'Business', 55, 'Medium', 'SMB', '#8B6914', '🏢', 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=240&fit=crop', ['web', 'email', 'code']),
      o(9, 'Life cover — 20% online discount', 'Simple term protection', 'Insurance', 40, 'High', 'Protection', '#D4793A', '🛡', 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(10, 'Savings vault — boosted rate', 'Lock away for 12 months', 'Savings', 75, 'Low', 'Deposits', '#D94B3F', '🏧', 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400&h=240&fit=crop', ['web', 'app', 'email', 'sms']),
    ],
    telco: [
      o(1, '5G Unlimited Plus — eSIM', 'Roaming in 45 destinations', 'Mobile', 100, 'High', 'Mobile', '#E68619', '📱', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=240&fit=crop', ['web', 'app', 'push', 'email', 'code']),
      o(2, 'Fibre Max 1Gbps — mesh Wi‑Fi', 'Self-install kit included', 'Broadband', 90, 'High', 'Home', '#2680EB', '🏠', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=240&fit=crop', ['web', 'email', 'sms']),
      o(3, 'SMB static IP + SD‑WAN trial', 'Business connectivity bundle', 'Business', 55, 'Medium', 'SMB', '#2D9D78', '🧑‍💼', 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=240&fit=crop', ['web', 'app', 'code']),
      o(4, 'Family plan — 4 lines', 'Shared data pool + parental controls', 'Mobile', 70, 'Medium', 'Family', '#7C5CFC', '👪', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=240&fit=crop', ['app', 'web', 'push']),
      o(5, 'Trade-in — latest handset', 'Guaranteed buy-back value', 'Device', 65, 'High', 'Hardware', '#C45BAA', '🔄', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(6, 'Pay-as-you-go data boost', 'Add 10GB this month', 'Prepaid', 35, 'Low', 'Prepaid', '#0D918C', '📶', 'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=400&h=240&fit=crop', ['app', 'sms', 'push']),
      o(7, 'Entertainment pack — streaming', 'Bundle SVOD at a discount', 'Add-on', 50, 'Medium', 'Content', '#5B7FFF', '🎬', 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&h=240&fit=crop', ['app', 'web', 'email']),
      o(8, 'IoT sensor kit — smart home', 'Security + leak detection', 'IoT', 45, 'Low', 'Home', '#8B6914', '🏡', 'https://images.unsplash.com/photo-1558002038-1055907df827?w=400&h=240&fit=crop', ['web', 'app', 'code']),
      o(9, 'Roaming day pass — EU+', 'Flat fee per day abroad', 'Roaming', 60, 'Medium', 'Travel', '#D4793A', '🌍', 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=240&fit=crop', ['app', 'push', 'sms']),
      o(10, 'Loyalty double data weekend', 'Reward members only', 'Promo', 75, 'Medium', 'Loyalty', '#D94B3F', '🎁', 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=400&h=240&fit=crop', ['email', 'app', 'push', 'web']),
    ],
    automotive: [
      o(1, 'New hybrid SUV — PCP launch', 'Test drive this weekend', 'Retail', 100, 'High', 'Showroom', '#1a1a1a', '🚙', 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&h=240&fit=crop', ['web', 'app', 'email', 'code']),
      o(2, 'EV bundle — wallbox + tariff', 'Electrification programme', 'EV', 90, 'Medium', 'EV', '#2680EB', '🔌', 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=400&h=240&fit=crop', ['web', 'email', 'sms']),
      o(3, 'Service plan+ — 3yr / 36k mi', 'Fixed-price servicing', 'Aftersales', 70, 'High', 'Workshop', '#E68619', '🛠', 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400&h=240&fit=crop', ['web', 'app', 'push']),
      o(4, 'PCP 0% — selected stock', 'Limited units — ends month end', 'Finance', 65, 'Medium', 'Finance', '#2D9D78', '💷', 'https://images.unsplash.com/photo-1563720223185-11003d210492?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(5, 'Approved used — 12 mo warranty', '128-point check', 'Used', 55, 'Medium', 'Used', '#7C5CFC', '✓', 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=400&h=240&fit=crop', ['web', 'email', 'code']),
      o(6, 'Fleet account — volume pricing', 'Business buyers', 'Fleet', 50, 'High', 'B2B', '#C45BAA', '🚚', 'https://images.unsplash.com/photo-1449965408869-eaa3c61788a7?w=400&h=240&fit=crop', ['web', 'email']),
      o(7, 'Winter tyre package', 'Fit + store', 'Aftersales', 40, 'Low', 'Seasonal', '#0D918C', '❄', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=240&fit=crop', ['web', 'app', 'sms']),
      o(8, 'Extended warranty — 5yr', 'Peace of mind add-on', 'Aftersales', 45, 'Medium', 'Warranty', '#5B7FFF', '📋', 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(9, 'Courtesy car — booking open', 'While you service', 'Service', 35, 'Low', 'Service', '#8B6914', '🚗', 'https://images.unsplash.com/photo-1489827905096-8e6c5557c874?w=400&h=240&fit=crop', ['web', 'sms', 'push']),
      o(10, 'Loyalty oil change — £99', 'Members only', 'Promo', 60, 'Medium', 'Loyalty', '#D4793A', '🛢', 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=400&h=240&fit=crop', ['email', 'app', 'push', 'web']),
    ],
    healthcare: [
      o(1, 'Virtual primary — same-day video', '£0 copay eligible members', 'Virtual', 100, 'Low', 'Primary', '#6e4fc7', '🩺', 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=240&fit=crop', ['web', 'app', 'email', 'sms', 'push', 'code']),
      o(2, 'Specialty expedited — cardiology', 'Shorter wait for intake', 'Specialty', 85, 'Medium', 'Cardiology', '#2680EB', '🫀', 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=400&h=240&fit=crop', ['web', 'app', 'email']),
      o(3, 'Pharmacy — 90-day maintenance', 'Mail-order refill', 'Pharmacy', 70, 'Medium', 'Pharmacy', '#2D9D78', '💊', 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=240&fit=crop', ['app', 'web', 'sms']),
      o(4, 'Diabetes coaching programme', 'Devices + nurse check-ins', 'Chronic', 65, 'Low', 'CM', '#E68619', '📋', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=240&fit=crop', ['app', 'push', 'email']),
      o(5, 'Employer wellness screening', 'Annual biometric + coaching', 'Wellness', 55, 'Low', 'Employer', '#7C5CFC', '💼', 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=400&h=240&fit=crop', ['web', 'email', 'code']),
      o(6, 'Mental health — therapist match', 'In-network video sessions', 'Behavioural', 60, 'Medium', 'BH', '#C45BAA', '🧠', 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&h=240&fit=crop', ['web', 'app']),
      o(7, 'Urgent care locator — $25 copay', 'Find in-network clinics', 'Access', 50, 'Low', 'Urgent', '#0D918C', '📍', 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400&h=240&fit=crop', ['app', 'push', 'sms']),
      o(8, 'Maternity bundle — third trimester', 'Classes + kit', 'Maternity', 45, 'Medium', 'Women', '#5B7FFF', '👶', 'https://images.unsplash.com/photo-1584515933487-779824d29309?w=400&h=240&fit=crop', ['email', 'web', 'app']),
      o(9, 'Preventive dental — covered cleanings', 'In-network dentists', 'Dental', 40, 'Low', 'Dental', '#8B6914', '🦷', 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=400&h=240&fit=crop', ['web', 'email']),
      o(10, 'Fitness reward — step streak bonus', 'Linked wearable offer', 'Wellness', 75, 'Low', 'Wellness', '#D4793A', '👟', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400&h=240&fit=crop', ['app', 'push', 'email', 'web']),
    ],
  };
})();
