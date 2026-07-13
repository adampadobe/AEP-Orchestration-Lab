import { setTimeout as sleep } from 'node:timers/promises';
import { getBrandScrape } from './labApiClient.mjs';
import { isBrandScrapeTerminal, summarizeBrandScrape } from './brandScrapeSummary.mjs';

const PHASE_LABELS = {
  crawl: 'Crawling pages',
  brand: 'Brand analysis',
  audiences: 'Audiences (campaigns / personas)',
  segments: 'Audience segments',
  prep: 'Preparing demo assets',
  demo: 'Building demo website',
  competitor: 'Competitor analysis',
  persist: 'Saving scrape',
  complete: 'Complete',
};

/**
 * Human-readable progress line for Coworker while a scrape is running.
 * @param {Record<string, unknown> | null | undefined} record
 */
export function brandScrapeProgressMessage(record) {
  if (!record || typeof record !== 'object') {
    return 'Waiting for scrape status…';
  }
  const status = String(record.scrapeStatus || 'unknown');
  if (status === 'complete') {
    const pages = record.pagesScraped ?? record.crawlSummary?.pagesScraped;
    return pages != null
      ? `Scrape complete (${pages} page(s) crawled).`
      : 'Scrape complete.';
  }
  if (status === 'failed') {
    return `Scrape failed: ${String(record.scrapeError || 'unknown error').slice(0, 200)}`;
  }

  const phase = String(record.buildPhase || '');
  const phaseLabel = PHASE_LABELS[phase] || (phase ? `Phase: ${phase}` : 'Working');
  const pages = record.pagesScraped ?? record.crawlSummary?.pagesScraped;
  const heartbeat = record.crawlHeartbeatDetail || record.buildPhaseDetail;
  const parts = [`Status ${status}`, phaseLabel];
  if (pages != null) parts.push(`${pages} page(s) so far`);
  if (heartbeat) parts.push(String(heartbeat).slice(0, 120));
  const elapsedMs = Number(record.elapsedMs);
  if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
    parts.push(`elapsed ${Math.round(elapsedMs / 1000)}s`);
  }
  return `${parts.join(' · ')} — brand scrapes often take several minutes; keep polling.`;
}

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrapeId
 * @param {number} params.pollIntervalMs
 * @param {number} params.timeoutMs
 */
export async function pollBrandScrapeUntilTerminal({ sandbox, scrapeId, pollIntervalMs, timeoutMs }) {
  const started = Date.now();
  let lastRow = null;
  const progressMessages = [];

  while (Date.now() - started < timeoutMs) {
    const apiResult = await getBrandScrape({ sandbox, scrapeId });
    if (!apiResult.ok) {
      return { ok: false, apiResult, lastRow, progressMessages, elapsedMs: Date.now() - started };
    }

    lastRow = apiResult.data || {};
    const message = brandScrapeProgressMessage(lastRow);
    if (!progressMessages.length || progressMessages[progressMessages.length - 1] !== message) {
      progressMessages.push(message);
    }

    const status = String(lastRow.scrapeStatus || '');
    if (isBrandScrapeTerminal(status)) {
      return {
        ok: true,
        record: lastRow,
        summary: summarizeBrandScrape(lastRow),
        timedOut: false,
        elapsedMs: Date.now() - started,
        progressMessages,
        progress: message,
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    ok: true,
    record: lastRow,
    summary: lastRow ? summarizeBrandScrape(lastRow) : null,
    timedOut: true,
    elapsedMs: Date.now() - started,
    progressMessages,
    progress: brandScrapeProgressMessage(lastRow),
  };
}
