/**
 * HTTP entry-point for the brand-scraper-crawler Cloud Run service.
 * One public endpoint: POST /crawl  body: { url, maxPages?, pageTimeout? }
 */

'use strict';

const express = require('express');
const { crawl } = require('./crawler');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => res.status(200).json({ service: 'brand-scraper-crawler', status: 'ok' }));

app.post('/crawl', async (req, res) => {
  const started = Date.now();
  try {
    const body = req.body || {};
    const url = (body.url || '').trim();
    if (!url) { res.status(400).json({ error: 'url is required' }); return; }
    const maxPages = Math.min(Math.max(Number(body.maxPages) || 5, 1), 25);
    const pageTimeout = Math.min(Math.max(Number(body.pageTimeout) || 25000, 5000), 60000);
    const result = await crawl(url, { maxPages, pageTimeout });
    result.elapsedMs = Date.now() - started;
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({
      error: String((e && e.message) || e),
      elapsedMs: Date.now() - started,
    });
  }
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`brand-scraper-crawler listening on :${port}`);
});
