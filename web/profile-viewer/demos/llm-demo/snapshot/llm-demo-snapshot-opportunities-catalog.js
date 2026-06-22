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
    {
      id: 'reddit',
      title: 'Reddit Sentiment Analysis',
      date: 'Mon, Jan 1, 2024',
      tag: 'Social Media',
      description: 'Improve Reddit reputation and visibility across key subreddits that influence LLM answers.',
      bullet: 'Social Media',
    },
    {
      id: 'youtube',
      title: 'YouTube Sentiment Analysis',
      date: 'Mon, Jan 1, 2024',
      tag: 'Social Media',
      description: 'Surface narrative gaps and engagement opportunities on high-traffic creator content.',
      bullet: 'Social Media',
    },
    {
      id: 'wikipedia',
      title: 'Wikipedia Analysis',
      date: 'Mon, Jun 3, 2024',
      tag: 'Earned Content',
      description: 'AI-powered suggestions to optimize your Wikipedia presence for LLM citability.',
      bullet: 'Earned Content',
    },
    {
      id: 'cited',
      title: 'Cited Sentiment Analysis',
      date: 'Mon, Jan 1, 2024',
      tag: 'Earned Content',
      description: 'Track earned citations and tone across third-party articles that shape LLM summaries.',
      bullet: 'Earned Content',
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

  var catalogApi = {
    OPPORTUNITIES: OPPORTUNITIES,
    getLatest: getLatest,
    detailHref: detailHref,
  };
  global.LlmOpportunitiesCatalog = catalogApi;
  global.LlmDemoOpportunitiesCatalog = catalogApi;
})(typeof window !== 'undefined' ? window : globalThis);
