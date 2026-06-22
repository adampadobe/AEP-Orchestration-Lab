/**
 * Mock catalogue for Starbucks UAE (Alshaya) lab demo.
 */
(function (global) {
  'use strict';

  global.StarbucksMockData = {
    rewardsTiers: [
      { id: 'welcome', label: 'Welcome', stars: '0', perk: 'Free birthday drink' },
      { id: 'green', label: 'Green', stars: '300', perk: 'Free handcrafted drink' },
      { id: 'gold', label: 'Gold', stars: '400', perk: 'Monthly double-star days' },
    ],
    featuredDrinks: [
      { id: 'pistachio-latte', name: 'Pistachio Latte', price: 'AED 22', tag: 'Seasonal' },
      { id: 'caramel-macchiato', name: 'Caramel Macchiato', price: 'AED 20', tag: 'Bestseller' },
      { id: 'iced-shaken-espresso', name: 'Iced Shaken Espresso', price: 'AED 19', tag: 'Iced' },
    ],
    stores: [
      { id: 'dubai-mall', name: 'The Dubai Mall', city: 'Dubai', hours: '8:00 – 00:00' },
      { id: 'mall-emirates', name: 'Mall of the Emirates', city: 'Dubai', hours: '7:00 – 23:00' },
      { id: 'yas-mall', name: 'Yas Mall', city: 'Abu Dhabi', hours: '8:00 – 22:00' },
    ],
    orderItems: [
      { id: 'grande-latte', name: 'Grande Caffè Latte', modifiers: 'Oat milk', price: 'AED 18' },
      { id: 'croissant', name: 'Butter Croissant', modifiers: 'Warm', price: 'AED 12' },
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
