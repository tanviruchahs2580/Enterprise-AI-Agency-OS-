/**
 * Crawl orchestration.
 *
 * Performs a breadth-first traversal from the seeds, honoring:
 *  - robots.txt (per-origin, cached) when respectRobots is enabled
 *  - per-host politeness delay (max of configured delay and robots crawl-delay)
 *  - depth limit and global maxPages safety cap
 *  - URL deduplication (normalized, hash-stripped)
 *
 * Each successfully fetched page is extracted (CSS/meta/llm), PII-redacted,
 * and its same-host links enqueued for the next depth.
 */

import { load } from "cheerio";
import { acquireHtml } from "./renderer.ts";
import { collectLinks, extract, extractText } from "./extract.ts";
import { redactPII, redactValues } from "./pii.ts";
import { fetchRobots, type RobotsRuleSet } from "./robots.ts";
import type {
  ExtractedPage,
  ScrapeJobResult,
  ScraperConfig,
  ScrapeStats,
} from "./types.ts";
import type { FetchOptions } from "./fetcher.ts";

interface QueueItem {
  url: string;
  depth: number;
}

function normalize(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  return u.toString();
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

function buildFetchOpts(config: ScraperConfig): FetchOptions {
  return {
    userAgent: config.userAgent,
    rotateUserAgent: config.rotateUserAgent,
    userAgentPool: config.userAgentPool,
    proxyUrl: config.proxyUrl,
    proxyDispatcher: config.proxyDispatcher,
    timeoutMs: config.timeoutMs ?? 15000,
    retries: config.retries ?? 3,
  };
}

export async function runCrawl(
  config: ScraperConfig,
  jobId: string
): Promise<ScrapeJobResult> {
  const startedAt = new Date().toISOString();
  const maxPages = config.maxPages ?? 25;
  const depthLimit = config.depth ?? 0;
  const followLinks = config.followLinks ?? true;
  const respectRobots = config.respectRobots ?? true;
  const mode = config.render ?? "auto";
  const baseDelay = config.politenessDelayMs ?? 500;

  const fetchOpts = buildFetchOpts(config);
  const userAgent = config.userAgent ?? "AgencyScraper/0.1";

  const queue: QueueItem[] = (config.seeds ?? []).map((s) => ({ url: normalize(s), depth: 0 }));
  const visited = new Set<string>();
  const hostLastFetch = new Map<string, number>();
  const robotsCache = new Map<string, RobotsRuleSet | null>();

  const pages: ExtractedPage[] = [];
  const stats: ScrapeStats = {
    pagesFetched: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    robotsBlocked: 0,
    piiRedacted: 0,
    bytesFetched: 0,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
  };

  const getRobots = async (origin: string): Promise<RobotsRuleSet | null> => {
    if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;
    let rs: RobotsRuleSet | null = null;
    try {
      rs = await fetchRobots(origin, { ...fetchOpts, retries: 1, timeoutMs: 5000 });
    } catch {
      rs = null;
    }
    robotsCache.set(origin, rs);
    return rs;
  };

  const politenessWait = async (host: string, rs: RobotsRuleSet | null): Promise<void> => {
    const delay = rs?.crawlDelay(userAgent) ? rs.crawlDelay(userAgent)! * 1000 : baseDelay;
    const last = hostLastFetch.get(host) ?? 0;
    const wait = delay - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    hostLastFetch.set(host, Date.now());
  };

  while (queue.length > 0 && pages.length < maxPages) {
    const item = queue.shift()!;
    const norm = normalize(item.url);
    if (visited.has(norm)) continue;
    visited.add(norm);

    let origin = "";
    let path = "/";
    try {
      const u = new URL(norm);
      origin = u.origin;
      path = u.pathname || "/";
    } catch {
      stats.pagesFailed++;
      pages.push({ url: item.url, status: 0, fetchedAt: new Date().toISOString(), rendered: false, data: {}, error: "invalid url" });
      continue;
    }

    if (respectRobots) {
      const rs = await getRobots(origin);
      if (rs && !rs.canFetch(userAgent, path)) {
        stats.robotsBlocked++;
        pages.push({ url: norm, status: 0, fetchedAt: new Date().toISOString(), rendered: false, data: {}, robotsBlocked: true, error: "robots.txt disallowed" });
        continue;
      }
      await politenessWait(new URL(origin).host, rs);
    } else {
      await politenessWait(new URL(origin).host, null);
    }

    let page: ExtractedPage;
    try {
      const res = await acquireHtml(norm, mode, fetchOpts);
      stats.pagesFetched++;
      stats.bytesFetched += Buffer.byteLength(res.html);
      const ex = await extract({
        html: res.html,
        url: norm,
        mode: config.extract ?? "auto",
        rules: config.rules,
        llmExtract: config.llmExtract,
      });
      const redacted = redactValues(ex.data, config.redactPii ?? true);
      // Page-level PII scan across visible text (not just extracted fields).
      const pagePii = config.redactPii ?? true ? redactPII(extractText(res.html)).found : [];
      const piiFound = [...new Set([...redacted.found, ...pagePii])];
      stats.piiRedacted += piiFound.length;
      const links = followLinks && item.depth < depthLimit
        ? collectLinks(load(res.html), norm).filter((l) => sameHost(l, norm))
        : [];

      page = {
        url: norm,
        status: 200,
        fetchedAt: new Date().toISOString(),
        rendered: res.rendered,
        data: redacted.data,
        piiFound,
        jsonLd: ex.jsonLd,
        links,
      };
      stats.pagesSucceeded++;

      // Enqueue same-host links for next depth.
      if (followLinks && item.depth < depthLimit) {
        for (const l of links) {
          const ln = normalize(l);
          if (!visited.has(ln)) queue.push({ url: ln, depth: item.depth + 1 });
        }
      }
    } catch (e) {
      stats.pagesFailed++;
      page = {
        url: norm,
        status: 0,
        fetchedAt: new Date().toISOString(),
        rendered: false,
        data: {},
        error: e instanceof Error ? e.message : String(e),
      };
    }
    pages.push(page);
  }

  const finishedAt = new Date().toISOString();
  stats.finishedAt = finishedAt;
  stats.durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  return {
    jobId,
    tenantId: config.tenantId,
    seeds: config.seeds,
    pages,
    stats,
  };
}
