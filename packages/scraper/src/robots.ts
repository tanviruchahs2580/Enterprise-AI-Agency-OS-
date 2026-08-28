/**
 * Minimal, dependency-free robots.txt parser.
 *
 * Supports the common directives needed for polite crawling:
 *   - User-agent groups (with `*` fallback)
 *   - Allow / Disallow path prefixes
 *   - Crawl-delay
 *   - Sitemap
 *
 * It is intentionally conservative: if robots.txt cannot be fetched or parsed,
 * `canFetch` returns true (fail-open) so legitimate crawling is not blocked by
 * transient errors, while explicit disallows are always honored.
 */

import { fetchWithRetry, type FetchOptions } from "./fetcher.ts";

export interface RobotsRuleSet {
  canFetch: (ua: string, path: string) => boolean;
  crawlDelay: (ua: string) => number | undefined;
  sitemaps: string[];
}

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

function normalizePath(path: string): string {
  // Strip query/hash; ensure leading slash.
  const q = path.indexOf("?");
  const h = path.indexOf("#");
  let p = path;
  const cut = q >= 0 ? Math.min(q, h >= 0 ? h : q) : h >= 0 ? h : path.length;
  p = path.slice(0, cut);
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

function matchLongestPrefix(rules: string[], path: string): number {
  // Returns the length of the longest matching rule prefix, or -1.
  let best = -1;
  for (const r of rules) {
    if (r === "" || r === "/") {
      best = Math.max(best, 0);
      continue;
    }
    if (path.startsWith(r)) best = Math.max(best, r.length);
  }
  return best;
}

function selectGroup(groups: Group[], ua: string): Group | undefined {
  const lower = ua.toLowerCase();
  // Most specific (exact agent) first, then `*`.
  let star: Group | undefined;
  let best: Group | undefined;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") {
        star = g;
      } else if (a.toLowerCase() === lower) {
        best = g;
      }
    }
  }
  return best ?? star;
}

export async function fetchRobots(
  origin: string,
  opts: FetchOptions = {}
): Promise<RobotsRuleSet> {
  const robotsUrl = `${origin.replace(/\/$/, "")}/robots.txt`;
  let text: string | null = null;
  try {
    const res = await fetchWithRetry(robotsUrl, { ...opts, retries: 1 });
    if (res.status >= 200 && res.status < 300) text = res.html;
  } catch {
    text = null;
  }
  return parseRobots(text ?? "", origin);
}

export function parseRobots(text: string, _origin = ""): RobotsRuleSet {
  const groups: Group[] = [];
  let current: Group = { agents: [], allow: [], disallow: [] };

  const push = () => {
    if (current.agents.length || current.allow.length || current.disallow.length || current.crawlDelay !== undefined) {
      groups.push(current);
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = (rawLine.split("#")[0] ?? "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (current.agents.length || current.allow.length || current.disallow.length || current.crawlDelay !== undefined) {
        push();
        current = { agents: [], allow: [], disallow: [] };
      }
      current.agents.push(value);
    } else if (key === "allow") {
      if (value) current.allow.push(normalizePath(value));
    } else if (key === "disallow") {
      if (value) current.disallow.push(normalizePath(value));
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n)) current.crawlDelay = n;
    }
  }
  push();

  const sitemaps: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const l = (line.split("#")[0] ?? "").trim();
    const i = l.toLowerCase().indexOf("sitemap:");
    if (i >= 0) {
      const v = l.slice(i + 8).trim();
      if (v) sitemaps.push(v);
    }
  }

  const canFetch = (ua: string, path: string): boolean => {
    const g = selectGroup(groups, ua);
    if (!g) return true;
    const p = normalizePath(path);
    const allowLen = matchLongestPrefix(g.allow, p);
    const disallowLen = matchLongestPrefix(g.disallow, p);
    if (disallowLen < 0) return true;
    if (allowLen >= 0 && allowLen >= disallowLen) return true;
    return disallowLen < 0;
  };

  const crawlDelay = (ua: string): number | undefined => {
    const g = selectGroup(groups, ua);
    return g?.crawlDelay;
  };

  return { canFetch, crawlDelay, sitemaps };
}
