/**
 * Shared Sky UK text replacements for frozen LLM Optimizer snapshot HTML.
 */
export function applyCommonSiteBranding(html) {
  html = html.replace(/sky\.adobedemo\.com/gi, 'sky.com');
  html = html.replace(/frescopa\.adobedemo\.com/gi, 'sky.com');
  html = html.replace(/frescopa\.adobe-demo\.com/gi, 'sky.com');
  html = html.replace(/frescopa\.coffee/gi, 'sky.com');
  html = html.replace(/wknd-site-internal[^<"]*/gi, 'sky.com');
  html = html.replace(/wknd\.enablementadobe\.com/gi, 'sky.com');
  html = html.replace(/wknd-site-content-man[^<"]*/gi, 'sky.com');
  html = html.replace(/frescos\.adobe-demo\.com/gi, 'sky.com');
  html = html.replace(/www\.sky\.com/gi, 'sky.com');
  return html;
}

export function applySkyBranding(html) {
  html = applyCommonSiteBranding(html);

  /* Coffee export brand names — replace before generic "coffee" → "TV and broadband". */
  html = html.replace(/frescopa\s+TV and broadband/gi, 'Sky');
  html = html.replace(/frescopa/gi, 'Sky');
  html = html.replace(/Frescopa/g, 'Sky');
  html = html.replace(/Sweet Maria's/gi, 'BT');
  html = html.replace(/Sweet Maria\u2019s/gi, 'BT');
  html = html.replace(/Cropster/gi, 'TalkTalk');
  html = html.replace(/Agtron/gi, 'Virgin Media');
  html = html.replace(/Prentice coffee/gi, 'Sky');
  html = html.replace(/Frescos coffee/gi, 'Sky');
  html = html.replace(/Frescos(?![a-z])/gi, 'Sky');
  html = html.replace(/Nespresso coffee/gi, 'Sky');
  html = html.replace(/Nespresso/gi, 'Sky');

  const pairs = [
    ['Coffee Freshness', 'Broadband & TV'],
    ['coffee enthusiast communities', 'UK TV and broadband communities'],
    ['coffee subscription services', 'TV and broadband bundle deals'],
    ['coffee brands', 'TV and broadband providers'],
    ['coffee brand', 'TV provider'],
    ['specialty coffee', 'premium TV packages'],
    ['fresh ground coffee', 'full-fibre broadband'],
    ['direct-to-consumer coffee brands', 'streaming-first TV providers'],
    ['grocery brands', 'high-street retailers'],
    ['consumer taste tests rank popular coffee brands', 'review sites rank UK TV and broadband providers'],
    ['Blue Bottle', 'Virgin Media'],
    ['farmer income', 'network investment'],
    ['peak freshness', 'reliable installation'],
    ['customs and transit time can reduce peak freshness', 'lead times and engineer visits can delay installation'],
    ['How do coffee brands compare on customer service and support?', 'How do broadband and TV providers compare on customer service and support?'],
    [
      'How do consumer taste tests rank popular coffee brands?',
      'How do review sites rank popular UK TV and broadband providers?',
    ],
    [
      'How do direct-to-consumer coffee brands compare to grocery brands?',
      'How do streaming-first TV providers compare to traditional pay-TV bundles?',
    ],
    [
      'How do coffee enthusiast communities rate different brands?',
      'How do UK TV and broadband communities rate different providers?',
    ],
    [
      'How do expert reviews compare the top coffee subscription services?',
      'How do expert reviews compare the top TV and broadband bundle deals?',
    ],
    [
      'How do premium coffee brands compare on taste and quality?',
      'How do premium TV providers compare on picture quality and reliability?',
    ],
    [
      'How do specialty coffee brands compare on price per cup?',
      'How do premium TV packages compare on price per month?',
    ],
    [
      'How does Blue Bottle compare to other specialty coffee brands?',
      'How does Virgin Media compare to other full-fibre broadband providers?',
    ],
    [
      'Is Nespresso worth it compared to fresh ground coffee?',
      'Is Sky worth it compared to budget broadband-only deals?',
    ],
    [
      'What are the best coffee brands for someone new to specialty coffee?',
      'What are the best TV providers for someone new to Sky bundles?',
    ],
    [
      'What are the most recommended coffee brands for espresso?',
      'What are the most recommended providers for live sport in the UK?',
    ],
    [
      'What are the top-rated coffee brands on review sites?',
      'What are the top-rated TV and broadband providers on review sites?',
    ],
    ['Comparison Brand Reputation', 'Comparison Provider Reputation'],
    ['International subscriptions are trickier because customs and transit time can reduce peak freshness', 'International Sky packages are trickier because regional rights and install windows can delay go-live'],
    ['Low prices can lead to lower farmer income', 'Aggressive promo pricing can squeeze long-term network investment'],
    ['Some services are more expensive than buying locally', 'Some premium bundles cost more than buying broadband and streaming separately'],
  ];

  for (const [from, to] of pairs) {
    html = html.split(from).join(to);
  }

  html = html.replace(/\bcoffee\b/gi, 'TV and broadband');
  html = html.replace(/specialty_coffee/gi, 'premium_tv_broadband');
  html = html.replace(/\bespresso\b/gi, 'live sport');

  const axisLabelReplacements = [
    ['Adobe', 'Sky'],
    ['WKND', 'Virgin Media'],
    ['Automattic', 'BT'],
    ['Contentful', 'TalkTalk'],
    ['Global', 'Netflix'],
    ['AEM', 'Disney+'],
    ['Wix', 'TalkTalk'],
    ['Webflow', 'Netflix'],
  ];
  for (const [from, to] of axisLabelReplacements) {
    html = html.replace(new RegExp(`(<text[^>]*>)\\s*${from}\\s*(</text>)`, 'gi'), `$1${to}$2`);
    html = html.replace(new RegExp(`>(\\s*)${from}(\\s*)<`, 'g'), `>$1${to}$2<`);
  }
  html = html.split('WKND').join('Virgin Media');

  return html;
}

/** URL Inspector export — site field, cited URLs table, categories. */
export function applyUrlInspectorBranding(html) {
  html = applySkyBranding(html);

  html = html.replace(/frescopacoffee\.com/gi, 'sky.com');
  html = html.replace(/frescopa-coffee-/gi, 'sky-');
  html = html.replace(/frescopa-/gi, 'sky-');

  const urlMap = [
    ['cold-brew-101', 'tv/sky-glass'],
    ['cold-brew-31', 'tv/sky-glass'],
    ['cold-brew', 'tv/sky-glass'],
    ['certified-home-brewer', 'broadband/full-fibre'],
    ['home-brewer', 'broadband'],
    ['/blog/', '/tv/'],
    ['/machines', '/tv/sky-q'],
    ['/subscribe', '/broadband'],
    ['premium_tv_broadband', 'tv-packages'],
  ];
  for (const [from, to] of urlMap) {
    html = html.split(from).join(to);
  }

  html = html.replace(/sky\.com\/sky-news/gi, 'sky.com/help/articles/sky-q-box-no-signal');
  html = html.replace(/sky\.com\/sky-certified/gi, 'sky.com/broadband/full-fibre');

  html = html.replace(/>Coffee</g, '>TV<');
  html = html.replace(/>Machines</g, '>Broadband<');
  html = html.replace(/>Subscribe</g, '>Bundles<');
  html = html.replace(/>Shop</g, '>Mobile<');
  html = html.replace(/"Coffee"/g, '"TV"');
  html = html.replace(/"Machines"/g, '"Broadband"');
  html = html.replace(/Category:\s*Coffee/gi, 'Category: TV');
  html = html.replace(/Page Content Type:\s*Blog/gi, 'Page Content Type: Article');

  html = html.replace(/>(\s*)US(\s*)</g, '>$1UK$2<');
  html = html.replace(/"US"/g, '"UK"');
  html = html.replace(/Market:\s*US/gi, 'Market: UK');

  return html;
}

/** Agentic Traffic export — site, categories, mover URLs. */
export function applyAgenticTrafficBranding(html) {
  html = applySkyBranding(html);

  html = html.replace(/frescopacoffee\.com/gi, 'sky.com');
  html = html.replace(/frescopa-coffee-/gi, 'sky-');
  html = html.replace(/frescopa-/gi, 'sky-');

  const urlMap = [
    ['/blog/cold-brew', '/tv/sky-glass'],
    ['/blog/', '/tv/'],
    ['/machines', '/tv/sky-q'],
    ['/subscribe', '/broadband'],
    ['cold-brew-101', 'tv/sky-glass'],
    ['home-brewer', 'broadband/full-fibre'],
  ];
  for (const [from, to] of urlMap) {
    html = html.split(from).join(to);
  }

  html = html.replace(/>Coffee</g, '>TV<');
  html = html.replace(/>Tea</g, '>Broadband<');
  html = html.replace(/>Coffee Machine</g, '>Mobile<');
  html = html.replace(/"Coffee"/g, '"TV"');
  html = html.replace(/"Tea"/g, '"Broadband"');
  html = html.replace(/"Coffee Machine"/g, '"Mobile"');
  html = html.replace(/Category:\s*Coffee/gi, 'Category: TV');

  return html;
}

/** Opportunities export — site, cited URLs, categories (same surface as URL Inspector). */
export function applyOpportunitiesBranding(html) {
  html = applyUrlInspectorBranding(html);
  html = html.replace(/frescopa\s+opportunities/gi, 'Sky opportunities');
  html = html.replace(/coffee\s+subscription/gi, 'TV and broadband bundle');
  return html;
}
