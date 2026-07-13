/**
 * Arm.com homepage mock data — lab demo only (assets vendored under assets/).
 */
(function (global) {
  'use strict';

  var A = 'assets/';

  global.ArmcomMockData = {
    logoWhite: A + 'arm-logo-white.svg',
    logoBlack: A + 'arm-logo-black.svg',
    hero: {
      kicker: 'Arm AGI CPU',
      title: "The world's most efficient agentic CPU",
      copy: "Introducing Arm AGI CPU — Arm's first silicon. And this is just the beginning.",
      cta: 'Learn more',
      ctaHref: 'cloud-ai/index.html',
      image: A + 'hero-agi-cpu.png',
      imageAlt: 'Arm AGI CPU product render',
    },
    highlights: [
      {
        id: 'rethinking-cpu',
        image: A + 'highlight-rethinking-cpu.jpg',
        title: 'Rethinking the AI CPU',
        copy: 'As agentic AI scales, infrastructure must evolve to support continuous, large-scale workloads.',
        cta: 'Read the blog',
        href: 'cloud-ai/data-center-ai.html',
      },
      {
        id: 'innovations',
        image: A + 'highlight-innovations.jpg',
        title: 'Top Arm-based innovations from June',
        copy: 'Explore the latest Arm technology advancing AI, cloud, edge, and mobile computing.',
        cta: 'Read blog',
        href: 'cloud-ai/index.html',
      },
      {
        id: 'tech-unheard',
        image: A + 'highlight-tech-unheard.png',
        title: 'Tech unheard',
        copy: 'Panos Panay joins Arm CEO Rene Haas to talk decision-making, humility and empathy in leadership.',
        cta: 'Listen to podcast',
        href: '#',
      },
    ],
    stats: [
      { value: '100%', label: 'of the connected global population touches Arm-based products' },
      { value: '350B+', label: 'Arm-based chips shipped to date' },
      { value: '22M+', label: 'Software developers on Arm' },
    ],
    computeCards: [
      {
        id: 'cloud',
        tag: 'Cloud & data center',
        image: A + 'compute-cloud-datacenter.jpg',
        title: 'Cloud & data center',
        copy: 'High-performance, power-efficient platform for scaling infrastructure.',
        href: 'cloud-ai/index.html',
      },
      {
        id: 'autonomous',
        tag: 'Autonomous machines',
        image: A + 'compute-autonomous.jpg',
        title: 'Autonomous machines',
        copy: 'Performance-driven platform powering safe, real-world autonomy.',
        href: 'cloud-ai/data-center-ai.html',
      },
      {
        id: 'mobile',
        tag: 'Mobile & PC',
        image: A + 'compute-mobile-pc.jpg',
        title: 'Mobile & PC',
        copy: 'AI-first compute platform delivering fast, personalized experiences.',
        href: 'developer/index.html',
      },
      {
        id: 'wearables',
        tag: 'Wearables & embedded',
        image: A + 'compute-wearables.jpg',
        title: 'Wearables, smart homes & embedded',
        copy: 'Power-efficient compute bringing always-on intelligence to everyday devices.',
        href: 'developer/index.html',
      },
    ],
    innovationTabs: [
      {
        id: 'cloud-ai',
        label: 'Cloud AI',
        icon: A + 'tab-cloud-ai.jpg',
        title: 'The future of AI infrastructure',
        copy: 'As AI and compute converge, data centers must operate as coordinated systems. Arm enables scalable orchestration across cloud and edge environments.',
        bullets: ['Cloud AI overview', 'Data center AI', 'Cloud computing', 'Telco and networking', 'High-performance computing'],
        image: A + 'tab-cloud-ai.jpg',
        href: 'cloud-ai/index.html',
      },
      {
        id: 'edge-ai',
        label: 'Edge AI',
        icon: A + 'tab-edge-ai.jpg',
        title: 'Intelligence in everyday devices',
        copy: 'AI in everyday devices must run instantly, reliably, and within strict power limits. Arm delivers real-time, private, power-efficient edge AI.',
        bullets: ['Edge AI overview', 'Mobile AI', 'Laptops and PCs', 'Wearables', 'Smart homes'],
        image: A + 'tab-edge-ai.jpg',
        href: 'developer/index.html',
      },
      {
        id: 'physical-ai',
        label: 'Physical AI',
        icon: A + 'tab-physical-ai.jpg',
        title: 'AI in motion',
        copy: 'Autonomous machines need real-time AI within tight power and safety limits. Arm delivers scalable, energy-efficient compute for robotics and vehicles.',
        bullets: ['Physical AI overview', 'AI-defined vehicles', 'Robotics'],
        image: A + 'tab-physical-ai.jpg',
        href: 'cloud-ai/data-center-ai.html',
      },
    ],
    partnerStories: [
      {
        id: 'nvidia',
        brand: 'Arm + NVIDIA',
        title: 'Personal AI computing',
        subtitle: 'AI supercomputing on your desk',
        copy: 'Develop, fine-tune, and run large AI models locally with NVIDIA DGX Spark on Arm Grace Blackwell.',
        cta: 'Explore the story',
        theme: 'dark',
      },
      {
        id: 'agibot',
        brand: 'Arm + AGIBOT',
        title: 'Real-time intelligence',
        subtitle: 'Scaling intelligent robots for real-world environments',
        copy: 'See how AGIBOT delivers real-time perception and control while maintaining power efficiency.',
        cta: 'Read story',
        theme: 'gradient-a',
      },
      {
        id: 'loveholidays',
        brand: 'Arm + loveholidays',
        title: 'High-performance travel',
        subtitle: 'Optimizing travel platforms with Arm compute',
        copy: 'Loveholidays improves performance and efficiency while reducing infrastructure cost across cloud deployments.',
        cta: 'Explore the story',
        theme: 'gradient-b',
      },
    ],
    leadership: [
      {
        image: A + 'leadership-rene.png',
        kicker: 'Tech unheard podcasts',
        title: 'Tech unheard podcasts',
        copy: 'Rene Haas in conversation with industry leaders as they discuss AI, industry trends, and more.',
        cta: 'Listen to podcasts',
      },
      {
        image: A + 'leadership-future.png',
        kicker: 'Shaping the future',
        title: 'Shaping the future',
        copy: 'New perspectives on the future of AI, business transformation, and silicon-driven innovation.',
        cta: 'Read insights',
      },
      {
        image: A + 'leadership-newsroom.png',
        kicker: 'Arm newsroom',
        title: 'Arm newsroom',
        copy: 'Stay up to date with the latest Arm news, blogs, and press releases.',
        cta: 'Visit newsroom',
      },
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
