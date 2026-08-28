/**
 * @agency/scraper — orchestrator-ready web scraping engine.
 *
 * Reuses the existing control-plane job queue, audit bus, budget and RBAC
 * fabric: the control-plane enqueues a `scrape_task` job whose worker calls
 * `runScrapeJob`, then persists the result into the `scrape_jobs` table. The
 * engine itself stays agnostic of any specific orchestrator.
 */

import { runCrawl } from "./crawler.ts";
import type { ScrapeJobResult, ScraperConfig } from "./types.ts";

export * from "./types.ts";
export { fetchRobots, parseRobots } from "./robots.ts";
export type { RobotsRuleSet } from "./robots.ts";
export { fetchWithRetry } from "./fetcher.ts";
export type { FetchOptions, FetchResult } from "./fetcher.ts";
export { renderPage, acquireHtml } from "./renderer.ts";
export { extract, collectLinks } from "./extract.ts";
export { redactPII, redactValues } from "./pii.ts";
export { writeResultsToFile, toRecords } from "./store.ts";

/** Run a scrape job. A jobId is generated when not supplied. */
export async function runScrapeJob(
  config: ScraperConfig,
  jobId?: string
): Promise<ScrapeJobResult> {
  const id = jobId ?? `scr_${cryptoRandomId()}`;
  return runCrawl(config, id);
}

function cryptoRandomId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("hex");
}

/** Default, safe scraper configuration for untrusted/ad-hoc inputs. */
export function defaultConfig(partial: Partial<ScraperConfig> & { seeds: string[] }): ScraperConfig {
  return {
    render: "auto",
    extract: "auto",
    depth: 0,
    maxPages: 25,
    followLinks: true,
    respectRobots: true,
    politenessDelayMs: 500,
    timeoutMs: 15000,
    retries: 3,
    redactPii: true,
    ...partial,
  };
}
