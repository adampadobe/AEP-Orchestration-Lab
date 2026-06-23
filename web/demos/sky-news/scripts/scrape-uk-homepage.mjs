#!/usr/bin/env node
/**
 * Scrape Sky News UK homepage structure and content via Playwright.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_HTML = path.join(ROOT, '_scrape-temp.html');
const OUT_JSON = path.join(ROOT, 'scrape-data.json');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-GB',
  });
  const page = await context.newPage();
  await page.goto('https://news.sky.com/uk', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);

  const html = await page.content();
  fs.writeFileSync(OUT_HTML, html);

  const extracted = await page.evaluate(() => {
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

    const navLinks = [];
    document.querySelectorAll('header a, nav a, [role="navigation"] a').forEach((a) => {
      const text = clean(a.textContent);
      const href = a.getAttribute('href') || '';
      if (text && text.length < 40 && !navLinks.some((n) => n.text === text)) {
        navLinks.push({ text, href });
      }
    });

    const storyAnchors = [];
    document.querySelectorAll('a[href*="/story/"]').forEach((a) => {
      const headline = clean(a.textContent);
      const href = a.getAttribute('href') || '';
      if (!headline || headline.length < 15) return;
      const card = a.closest('article, li, [class*="card"], [class*="story"], [class*="tile"]');
      const img = (card || a).querySelector('img');
      const timeEl = (card || a.parentElement)?.querySelector('time, [datetime]');
      storyAnchors.push({
        headline,
        href,
        category: clean((card || a).querySelector('[class*="label"], [class*="tag"], [class*="kicker"]')?.textContent),
        timestamp: timeEl ? clean(timeEl.textContent) || timeEl.getAttribute('datetime') : '',
        imageAlt: img?.getAttribute('alt') || '',
        isLive: /live|breaking/i.test(clean((card || a).textContent).slice(0, 40)),
      });
    });

    const deduped = [];
    const seen = new Set();
    for (const s of storyAnchors) {
      const key = s.headline.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
    }

    const liveBlocks = [];
    document.querySelectorAll('[class*="live"], [class*="Live"], [class*="breaking"]').forEach((el) => {
      const text = clean(el.textContent);
      if (text.length > 20 && text.length < 300) liveBlocks.push(text.slice(0, 200));
    });

    const videoItems = [];
    document.querySelectorAll('a[href*="/video/"], [class*="video"] a, [class*="Video"] a').forEach((a) => {
      const title = clean(a.textContent);
      if (title.length > 10) {
        videoItems.push({ title: title.slice(0, 160), href: a.getAttribute('href') || '' });
      }
    });

    const sectionHeadings = [];
    document.querySelectorAll('h2, h3, [class*="section"] h2, [class*="heading"]').forEach((h) => {
      const t = clean(h.textContent);
      if (t.length > 2 && t.length < 80) sectionHeadings.push(t);
    });

    const footerLinks = [];
    document.querySelectorAll('footer a').forEach((a) => {
      const text = clean(a.textContent);
      if (text) footerLinks.push({ text, href: a.getAttribute('href') || '' });
    });

    return {
      title: document.title,
      url: location.href,
      navLinks: navLinks.slice(0, 25),
      stories: deduped.slice(0, 40),
      liveBlocks: [...new Set(liveBlocks)].slice(0, 10),
      videoItems: [...new Map(videoItems.map((v) => [v.title, v])).values()].slice(0, 12),
      sectionHeadings: [...new Set(sectionHeadings)].slice(0, 20),
      footerLinks: footerLinks.slice(0, 20),
    };
  });

  const scrapeId = `sky-news-uk-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  const payload = {
    scrape_id: scrapeId,
    scrapedAt: new Date().toISOString(),
    sourceUrl: 'https://news.sky.com/uk',
    ...extracted,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ scrape_id: scrapeId, stories: extracted.stories.length, htmlBytes: html.length }, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
