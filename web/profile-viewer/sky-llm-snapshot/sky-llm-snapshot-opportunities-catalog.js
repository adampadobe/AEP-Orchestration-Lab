/**
 * Canonical opportunity list (dates, copy, detail routes) for Opportunities + Overview.
 */
(function (global) {
  'use strict';

  var OPPORTUNITIES = [
    {
      id: 'simplify',
      title: 'Simplify Complex Content',
      date: 'Mon, May 18, 2026',
      tag: 'Content Opportunity',
      description:
        'Poor readability makes content difficult for users to understand. AI-generated suggestions help simplify complex text while maintaining meaning and context.',
      bullet: null,
    },
    {
      id: '404',
      title: 'Agentic Traffic 404s Analysis',
      date: 'Sun, May 17, 2026',
      tag: 'Technical SEO',
      description: 'Analysis of 404 errors detected by AI agents crawling your site.',
      bullet: '2 URLs affected',
    },
    {
      id: '503',
      title: 'Agentic Traffic 503s Analysis',
      date: 'Sun, May 17, 2026',
      tag: 'Technical SEO',
      description: 'Analysis of 503 errors detected by AI agents crawling your site.',
      bullet: '1 URL affected',
    },
    {
      id: 'recover',
      title: 'Recover Content Visibility',
      date: 'Mon, May 11, 2026',
      tag: 'Technical SEO',
      description:
        'Recover visibility for pages where AI agents miss critical content behind client-side rendering and dynamic loads.',
      bullet: '+1.1x Estimated Content Gain',
    },
    {
      id: 'llm-summaries',
      title: 'Add LLM-Friendly Summaries',
      date: 'Mon, May 4, 2026',
      tag: 'Content Opportunity',
      description:
        'Add concise summaries agents can cite without parsing full pages — full-page or section-specific summaries.',
      bullet: '25 Suggestions',
    },
  ];

  function parseDate(str) {
    return new Date(str).getTime() || 0;
  }

  function getLatest(count) {
    return OPPORTUNITIES.slice()
      .sort(function (a, b) {
        return parseDate(b.date) - parseDate(a.date);
      })
      .slice(0, count || 3);
  }

  function detailHref(id) {
    return 'opportunities.html#detail/' + id;
  }

  global.SkyLlmOpportunitiesCatalog = {
    OPPORTUNITIES: OPPORTUNITIES,
    getLatest: getLatest,
    detailHref: detailHref,
  };
})(typeof window !== 'undefined' ? window : globalThis);
