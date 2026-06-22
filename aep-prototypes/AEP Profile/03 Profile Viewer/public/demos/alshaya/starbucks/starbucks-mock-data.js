/**
 * Mock catalogue for Starbucks UAE (Alshaya) lab demo.
 * Image assets sourced from starbucks.ae CDN and self-hosted under assets/ (lab demo only).
 */
(function (global) {
  'use strict';

  var ASSETS = 'assets/';

  global.StarbucksMockData = {
    logo: ASSETS + 'logo.png',
    heroSlides: [
      {
        id: 'cloud-frappuccino',
        image: ASSETS + 'hero-cloud-frappuccino.webp',
        alt: 'Cloud Frappuccino lineup',
        kicker: 'New this summer',
        title: 'Original is a picture-perfect Cloud',
        copy: 'Meet the new Cloud Frappuccino lineup — light, fluffy, colorful, and made to brighten your summer.',
      },
      {
        id: 'match-day',
        image: ASSETS + 'hero-match-day.webp',
        alt: 'Get ready for Match Day',
        kicker: 'Curated for you',
        title: 'Get ready for Match Day',
        copy: 'Celebrate the season with handcrafted favourites made for every moment.',
      },
      {
        id: 'order-ahead',
        image: ASSETS + 'hero-order-ahead.webp',
        alt: 'Skip the queue and order ahead',
        kicker: 'Order ahead',
        title: 'Skip the queue and order ahead',
        copy: 'Place your order in the app and pick up when it is ready — Stars included.',
      },
      {
        id: 'rewards-app',
        image: ASSETS + 'promo-app-download.webp',
        alt: 'Starbucks Rewards app',
        kicker: 'Starbucks Rewards',
        title: 'Get 20% off your first 2 orders',
        copy: 'Download the app, sign up, and start earning Stars from your very first order.',
      },
    ],
    promoCards: [
      {
        id: 'rewards-choices',
        image: ASSETS + 'promo-rewards-choices.webp',
        alt: 'Unlock more rewards choices',
        title: 'Unlock more with your Stars',
        cta: 'Find out more',
      },
      {
        id: 'app-download',
        image: ASSETS + 'promo-app-download.webp',
        alt: 'Download the Starbucks Rewards app',
        title: 'Download the Starbucks Rewards App',
        cta: 'Join now',
      },
      {
        id: 'cloud-frappe-card',
        image: ASSETS + 'hero-cloud-frappuccino.webp',
        alt: 'Cloud Frappuccino',
        title: 'Cloud Frappuccino lineup',
        cta: 'Find out more',
      },
    ],
    rewardsTiers: [
      {
        id: 'welcome',
        label: 'Collect Stars',
        stars: '4 per 10 AED',
        perk: 'Earn Stars on every handcrafted drink and food purchase',
        image: ASSETS + 'rewards-collect-stars.webp',
      },
      {
        id: 'green',
        label: 'Unlock rewards',
        stars: 'Redeem anytime',
        perk: 'Food, snacks, drinks, and merchandise — more choices with your Stars',
        image: ASSETS + 'rewards-unlock.webp',
      },
      {
        id: 'gold',
        label: 'Gold Level',
        stars: '750 / year',
        perk: 'Free birthday drink, exclusive offers, and double-star days',
        image: ASSETS + 'rewards-gold-level.webp',
      },
    ],
    featuredDrinks: [
      {
        id: 'pistachio-latte',
        name: 'Pistachio Latte',
        price: 'AED 22',
        tag: 'Seasonal',
        image: ASSETS + 'drink-latte.webp',
      },
      {
        id: 'caramel-macchiato',
        name: 'Caramel Macchiato',
        price: 'AED 20',
        tag: 'Bestseller',
        image: ASSETS + 'drink-frappuccino.webp',
      },
      {
        id: 'iced-shaken-espresso',
        name: 'Iced Shaken Espresso',
        price: 'AED 19',
        tag: 'Iced',
        image: ASSETS + 'drink-iced-espresso.webp',
      },
    ],
    stores: [
      { id: 'dubai-mall', name: 'The Dubai Mall', city: 'Dubai', hours: '8:00 – 00:00' },
      { id: 'mall-emirates', name: 'Mall of the Emirates', city: 'Dubai', hours: '7:00 – 23:00' },
      { id: 'yas-mall', name: 'Yas Mall', city: 'Abu Dhabi', hours: '8:00 – 22:00' },
    ],
    orderItems: [
      { id: 'grande-latte', name: 'Grande Caffè Latte', modifiers: 'Oat milk', price: 'AED 18', image: ASSETS + 'drink-latte.webp' },
      { id: 'croissant', name: 'Butter Croissant', modifiers: 'Warm', price: 'AED 12', image: ASSETS + 'drink-frappuccino.webp' },
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
