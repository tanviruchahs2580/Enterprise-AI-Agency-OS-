/**
 * HTTP fetching primitive for the scraper.
 *
 * Features:
 *  - Configurable request timeout (AbortController).
 *  - Retries with exponential backoff; honors `Retry-After` on 429/503.
 *  - Rotating User-Agent pool to reduce trivial fingerprinting.
 *  - Optional proxy via an injected undici Dispatcher (or proxyUrl, which we
 *    resolve to a ProxyAgent when `undici` is available).
 *
 * This module only does HTTP GET and returns the body as text. JS rendering is
 * handled separately by renderer.ts.
 */

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  rotateUserAgent?: boolean;
  userAgentPool?: string[];
  proxyUrl?: string;
  proxyDispatcher?: unknown;
}

export interface FetchResult {
  status: number;
  html: string;
  contentType: string;
  headers: Record<string, string>;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; AgencyScraper/0.1; +https://github.com/tanviruchahs2580/Scraping-Agent)";

const DEFAULT_UA_POOL: string[] = [
  DEFAULT_UA,
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
];

let uaCursor = 0;

function selectUserAgent(opts: FetchOptions): string {
  if (opts.userAgent) return opts.userAgent;
  const pool = opts.userAgentPool?.length ? opts.userAgentPool : DEFAULT_UA_POOL;
  if (!opts.rotateUserAgent) return pool[0] ?? DEFAULT_UA;
  const ua = pool[uaCursor % pool.length] ?? DEFAULT_UA;
  uaCursor++;
  return ua;
}

async function buildDispatcher(opts: FetchOptions): Promise<unknown | undefined> {
  if (opts.proxyDispatcher) return opts.proxyDispatcher;
  if (!opts.proxyUrl) return undefined;
  // Try to resolve a ProxyAgent from undici. Node bundles undici internally
  // but does not always expose it as a bare import; degrade gracefully.
  try {
    const undici = await import("undici" as string);
    const ProxyAgent = (undici as { ProxyAgent?: new (url: string) => unknown }).ProxyAgent;
    if (ProxyAgent) return new ProxyAgent(opts.proxyUrl);
  } catch {
    /* fall through */
  }
  throw new Error(
    "proxyUrl was set but no undici ProxyAgent is available. " +
      "Provide `proxyDispatcher` (a pre-built undici dispatcher) instead."
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetries = options.retries ?? 3;
  const dispatcher = await buildDispatcher(options).catch((e) => {
    throw e;
  });

  const baseHeaders: Record<string, string> = {
    "user-agent": selectUserAgent(options),
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
  };
  if (options.headers) Object.assign(baseHeaders, options.headers);

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: baseHeaders,
        redirect: "follow",
        signal: controller.signal,
        ...(dispatcher ? { dispatcher: dispatcher as never } : {}),
      });
      clearTimeout(timer);

      const contentType = String(res.headers.get("content-type") ?? "");
      const body = await res.text();

      // Retry on transient server errors / rate limits.
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 500, 8000);
        attempt++;
        await sleep(backoff);
        continue;
      }

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: res.status, html: body, contentType, headers };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxRetries) {
        attempt++;
        await sleep(Math.min(2 ** (attempt - 1) * 500, 8000));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}
