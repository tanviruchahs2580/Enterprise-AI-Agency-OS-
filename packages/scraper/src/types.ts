/**
 * Public types for the @agency/scraper engine.
 *
 * The engine is intentionally dependency-light and orchestrator-agnostic: it
 * takes a declarative ScrapeJob, performs an optionally-crawling fetch/extract
 * pass, and returns structured results. The control-plane integration adapts
 * this into the existing job-queue + audit/observability fabric.
 */

export type RenderMode = "auto" | "static" | "js";

export type ExtractMode = "css" | "auto" | "llm" | "meta";

/** A single field extraction rule. */
export interface ExtractRule {
  /** Output field name. */
  name: string;
  /**
   * CSS selector. When `attribute` is omitted the element's text is used;
   * otherwise the given attribute (e.g. "href", "content", "src") is read.
   * Supports `selector@attribute` short form in the `selector` field too.
   */
  selector: string;
  attribute?: string;
  /** Return an array of all matches instead of the first. */
  many?: boolean;
}

/** Per-target options that may be overridden for an individual page. */
export interface ScrapeTarget {
  url: string;
  /** Render mode for this target. Default: derived from job config. */
  render?: RenderMode;
  /** Extra headers for this target only. */
  headers?: Record<string, string>;
}

export interface ScraperConfig {
  /** Seed URLs. The crawler starts from these. */
  seeds: string[];
  /** How to acquire HTML. */
  render?: RenderMode;
  /** Default extraction strategy. */
  extract?: ExtractMode;
  /** CSS/attribute extraction rules (used for `css`/`auto`). */
  rules?: ExtractRule[];
  /** LLM extraction callback (used for `llm`). Optional. */
  llmExtract?: LlmExtractor;
  /** Crawl same-host links up to this depth (0 = seeds only). */
  depth?: number;
  /** Maximum total pages to fetch (safety cap). Default 25. */
  maxPages?: number;
  /** Follow same-host links when `depth > 0`. Default true. */
  followLinks?: boolean;
  /** Honor robots.txt. Default true. */
  respectRobots?: boolean;
  /** Per-host politeness delay in ms (overridden by robots crawl-delay). */
  politenessDelayMs?: number;
  /** Request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Max retries per request. Default 3. */
  retries?: number;
  /** Base User-Agent; if `rotateUserAgent` is set a pool is used. */
  userAgent?: string;
  rotateUserAgent?: boolean;
  /**
   * Optional proxy URL. When set, requests route through it. Requires an
   * injected dispatcher (see `proxyDispatcher`) because Node's fetch does not
   * honor env proxies by default. Engine accepts a pre-built dispatcher.
   */
  proxyUrl?: string;
  /** A pre-built undici Dispatcher for proxying (advanced). */
  proxyDispatcher?: unknown;
  /** Redact detected PII from extracted text. Default true. */
  redactPii?: boolean;
  /** Custom User-Agent pool for rotation. */
  userAgentPool?: string[];
  /** Org/tenant id for multi-tenant attribution (echoed into results). */
  tenantId?: string;
}

export type LlmExtractor = (
  html: string,
  url: string
) => Promise<Record<string, unknown>>;

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  html: string;
  fetchedAt: string;
  /** True when a headless browser produced the HTML. */
  rendered: boolean;
  /** True when robots.txt blocked this URL. */
  robotsBlocked?: boolean;
  error?: string;
}

export interface ExtractedPage {
  url: string;
  status: number;
  fetchedAt: string;
  rendered: boolean;
  /** Field results keyed by rule name. */
  data: Record<string, unknown>;
  /** Detected PII categories (when redaction enabled). */
  piiFound?: string[];
  /** JSON-LD blocks discovered on the page. */
  jsonLd?: unknown[];
  /** Discovered same-host links (for crawling). */
  links?: string[];
  /** True when robots.txt blocked this URL. */
  robotsBlocked?: boolean;
  error?: string;
}

export interface ScrapeStats {
  pagesFetched: number;
  pagesSucceeded: number;
  pagesFailed: number;
  robotsBlocked: number;
  piiRedacted: number;
  bytesFetched: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface ScrapeJobResult {
  jobId: string;
  tenantId?: string;
  seeds: string[];
  pages: ExtractedPage[];
  stats: ScrapeStats;
}
